(function () {
  const TAG = 'supervisor-header-widget-v9';

  class SupervisorHeaderWidgetV9 extends HTMLElement {
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
      this._timer = window.setInterval(() => this.render(), 350);
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
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return '';
      const checks = [
        ['Interner Termin', /\binterner\s+ter/i],
        ['Not Responding', /\bnot\s+responding\b/i],
        ['Wrap-up', /\bwrap[-\s]?up\b/i],
        ['Ringing', /\b(ringing|alerting)\b/i],
        ['Connected', /\bconnected\b/i],
        ['Meeting', /\bmeeting\b/i],
        ['Unavailable', /\bunavailable\b/i],
        ['Busy', /\bbusy\b/i],
        ['Available', /\bavailable\b/i],
        ['Available', /\bidle\b/i]
      ];
      for (const [label, re] of checks) if (re.test(t)) return label;
      return '';
    }

    _readCiscoSelectedState() {
      try {
        // 1) Best signal: the visible Cisco state dropdown in the top header.
        // It contains the selected state plus a timer, e.g. "Available 00:06" or "Interner Ter... 00:15 / 00:46".
        const els = Array.from(document.querySelectorAll('body *'));
        const timed = [];
        for (const el of els) {
          if (!this._visible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.top > 120 || r.width < 90 || r.width > 360 || r.height > 60) continue;
          const txt = String(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
            .replace(/\s+/g, ' ').trim();
          if (/\b\d{1,2}:\d{2}\b/.test(txt)) {
            const state = this._extractKnownState(txt);
            if (state) timed.push({ state, top: r.top, left: r.left, txt });
          }
        }
        if (timed.length) {
          // Cisco state selector is normally the right-most timed control in the top header.
          timed.sort((a,b) => b.left - a.left || a.top - b.top);
          return timed[0].state;
        }

        // 2) Fallback: read only the Cisco state-selector component, not the whole page.
        const selectors = Array.from(document.querySelectorAll('agentx-state-selector, [data-testid*="state" i], [aria-label*="Availability" i]'));
        for (const rootEl of selectors) {
          const roots = [rootEl];
          if (rootEl.shadowRoot) roots.push(rootEl.shadowRoot);
          for (const root of roots) {
            const text = String(root.innerText || root.textContent || '').replace(/\s+/g, ' ').trim();
            const state = this._extractKnownState(text);
            if (state) return state;
          }
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

      // IMPORTANT: The header widget must mirror the real Cisco selected state.
      // Therefore the visible Cisco state selector wins over stale STORE fallback values.
      const domState = this._readCiscoSelectedState();
      const propState = this._normalizeState(
        this._value('agentStatus','availabilityState','presenceState','currentState','status','state','agentState')
      );
      const state = domState || propState || 'Status pending';

      const ok = this._isAvailable(state);
      const bg = ok ? '#18864B' : '#A0443F';
      const border = ok ? '#0E5F35' : '#7B2E2A';
      const glow = ok ? 'rgba(24,134,75,.24)' : 'rgba(160,68,63,.22)';

      const key = JSON.stringify({ agentName, teamName, state, ok });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 40px;
            min-width: 360px;
            max-width: 500px;
            margin: 0 12px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #fff;
            vertical-align: middle;
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 9px;
            width: 100%;
            height: 30px;
            padding: 0 13px;
            border-radius: 16px;
            border: 1.5px solid ${border};
            background: ${bg};
            box-shadow: 0 2px 7px ${glow};
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 10px;
            height: 10px;
            min-width: 10px;
            border-radius: 999px;
            background: #fff;
            opacity: .95;
          }
          .agent {
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .team {
            font-size: 12px;
            font-weight: 700;
            opacity: .95;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .state {
            margin-left: auto;
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sep {
            font-size: 14px;
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

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV9);
})();
