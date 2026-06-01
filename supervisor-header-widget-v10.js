(function () {
  const TAG = 'supervisor-header-widget-v10';

  class SupervisorHeaderWidgetV10 extends HTMLElement {
    static get observedAttributes() {
      return [
        'agentname','displayname','agentstate','agentstatus','availabilitystate',
        'presencestate','currentstate','state','status','teamname','loginid','email','darkmode'
      ];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._last = '';
      this._timer = null;
    }

    connectedCallback() {
      this.render();
      this._timer = window.setInterval(() => this.render(), 250);
    }

    disconnectedCallback() {
      if (this._timer) window.clearInterval(this._timer);
      this._timer = null;
    }

    attributeChangedCallback() { this.render(); }

    _isPlaceholder(v) {
      const s = String(v ?? '').trim();
      if (!s) return true;
      return s.startsWith('$STORE.') ||
        s.startsWith('STORE_') ||
        s.toLowerCase() === 'undefined' ||
        s.toLowerCase() === 'null' ||
        s === '[object Object]';
    }

    _value(...names) {
      for (const n of names) {
        const propValue = this[n];
        if (!this._isPlaceholder(propValue)) return String(propValue).trim();

        const attr1 = n.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const attr2 = n.toLowerCase();
        const attrValue = this.getAttribute(attr1) || this.getAttribute(attr2);
        if (!this._isPlaceholder(attrValue)) return String(attrValue).trim();
      }
      return '';
    }

    _visible(el) {
      try {
        if (!el || el === this) return false;
        if (el.closest && el.closest(TAG)) return false;
        const r = el.getBoundingClientRect && el.getBoundingClientRect();
        if (!r || r.width < 20 || r.height < 10) return false;
        const st = window.getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0;
      } catch (e) { return false; }
    }

    _extractKnownState(text) {
      let t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return '';

      // Remove timers so the state text can be matched cleanly.
      t = t.replace(/\b\d{1,2}:\d{2}(?:\s*\/\s*\d{1,2}:\d{2})?\b/g, ' ').replace(/\s+/g, ' ').trim();

      const checks = [
        ['Interner Termin', /\binterner\s+termin\b/i],
        ['Interner Termin', /\binterner\s+ter\.?\b/i],
        ['Not Responding', /\bnot\s+responding\b/i],
        ['RONA', /\brona\b/i],
        ['Wrap-up', /\bwrap[-\s]?up\b/i],
        ['Ringing', /\b(ringing|alerting)\b/i],
        ['Connected', /\bconnected\b/i],
        ['Meeting', /\bmeeting\b/i],
        ['Unavailable', /\bunavailable\b/i],
        ['Busy', /\bbusy\b/i],
        ['Pause', /\b(pause|break)\b/i],
        ['Lunch', /\b(lunch|mittag)\b/i],
        ['Training', /\btraining\b/i],
        ['Available', /\bavailable\b/i]
      ];
      for (const [label, re] of checks) if (re.test(t)) return label;
      return '';
    }

    _allOpenRoots() {
      const roots = [document];
      const seen = new Set();
      const walk = (root) => {
        if (!root || seen.has(root)) return;
        seen.add(root);
        let all = [];
        try { all = Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []); } catch (e) { all = []; }
        for (const el of all) {
          if (el === this) continue;
          if (el.shadowRoot && !seen.has(el.shadowRoot)) {
            roots.push(el.shadowRoot);
            walk(el.shadowRoot);
          }
        }
      };
      walk(document);
      return roots;
    }

    _readCiscoSelectedStateDeep() {
      try {
        const candidates = [];
        const roots = this._allOpenRoots();

        for (const root of roots) {
          let els = [];
          try { els = Array.from(root.querySelectorAll('*')); } catch (e) { continue; }
          for (const el of els) {
            if (!this._visible(el)) continue;
            const r = el.getBoundingClientRect();
            // State selector is in the top header. Keep this broad enough for browser zoom differences.
            if (r.top > 125 || r.left < 250 || r.width < 110 || r.width > 380 || r.height < 18 || r.height > 70) continue;

            const parts = [
              el.innerText,
              el.textContent,
              el.getAttribute && el.getAttribute('aria-label'),
              el.getAttribute && el.getAttribute('title'),
              el.getAttribute && el.getAttribute('value')
            ].filter(Boolean).map(x => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);

            const txt = Array.from(new Set(parts)).join(' | ');
            if (!/\b\d{1,2}:\d{2}\b/.test(txt)) continue;

            const state = this._extractKnownState(txt);
            if (!state) continue;

            // Prefer the visible Cisco state selector: usually top-right and contains a timer.
            candidates.push({ state, txt, left: r.left, top: r.top, width: r.width, height: r.height });
          }
        }

        if (candidates.length) {
          // Prefer known non-Available states if present. This prevents stale Available text elsewhere from winning.
          const nonAvailable = candidates.filter(c => c.state !== 'Available');
          const list = nonAvailable.length ? nonAvailable : candidates;
          list.sort((a,b) => b.left - a.left || a.top - b.top);
          return list[0].state;
        }
      } catch (e) {}
      return '';
    }

    _normalizeState(raw) {
      const s = String(raw || '').trim();
      if (!s || this._isPlaceholder(s)) return '';
      return this._extractKnownState(s) || s;
    }

    _isAvailable(state) {
      return String(state || '').trim().toLowerCase() === 'available';
    }

    _escape(s) {
      return String(s || '').replace(/[&<>'"]/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
      }[c]));
    }

    render() {
      const agentName = this._value('agentName', 'displayName') || 'Agent';
      const teamName = this._value('teamName') || 'Team';

      // v10: Cisco header is not in normal DOM in your tenant (agentx-state-selector query returns 0).
      // Therefore we scan normal DOM + all OPEN shadow roots recursively and read the visible timed Cisco state control.
      const ciscoState = this._readCiscoSelectedStateDeep();
      const propState = this._normalizeState(
        this._value('agentStatus','availabilityState','presenceState','currentState','status','state','agentState')
      );
      const state = ciscoState || propState || 'Status pending';

      const ok = this._isAvailable(state);
      const bg = ok ? '#18864B' : '#A0463F';
      const border = ok ? '#0E5F35' : '#7B332D';
      const glow = ok ? 'rgba(24,134,75,.24)' : 'rgba(160,70,63,.20)';

      const key = JSON.stringify({ agentName, teamName, state, ok });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 40px;
            min-width: 350px;
            max-width: 480px;
            margin: 0 12px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #fff;
            vertical-align: middle;
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            width: 100%;
            height: 30px;
            padding: 0 12px;
            border-radius: 16px;
            border: 1.5px solid ${border};
            background: ${bg};
            box-shadow: 0 2px 7px ${glow};
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 9px;
            height: 9px;
            min-width: 9px;
            border-radius: 999px;
            background: #fff;
            opacity: .95;
          }
          .agent, .team {
            font-size: 12px;
            line-height: 14px;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .agent { font-weight: 800; }
          .team { font-weight: 700; opacity: .95; }
          .state {
            margin-left: auto;
            font-size: 12px;
            line-height: 14px;
            font-weight: 800;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sep {
            font-size: 13px;
            font-weight: 800;
            opacity: .8;
          }
        </style>
        <div class="card" title="${this._escape([agentName, teamName, state].join(' | '))}">
          <span class="dot"></span>
          <span class="agent">${this._escape(agentName)}</span>
          <span class="sep">·</span>
          <span class="team">${this._escape(teamName)}</span>
          <span class="state">${this._escape(state)}</span>
        </div>
      `;
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV10);
})();
