(function () {
  const TAG = 'supervisor-header-widget-v7';

  class SupervisorHeaderWidgetV7 extends HTMLElement {
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
      this._timer = window.setInterval(() => this.render(), 500);
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

    _collectTextDeep(root, out, depth = 0) {
      if (!root || depth > 8) return;
      const nodes = [];
      try {
        if (root.querySelectorAll) root.querySelectorAll('*').forEach(el => nodes.push(el));
      } catch (e) {}

      for (const el of nodes) {
        try {
          // Eigenes Widget komplett ignorieren, sonst liest es seinen alten Status selbst wieder aus.
          if (el === this || (el.tagName && String(el.tagName).toLowerCase() === TAG)) continue;

          const txt = [
            el.getAttribute && el.getAttribute('title'),
            el.getAttribute && el.getAttribute('aria-label'),
            el.getAttribute && el.getAttribute('data-testid'),
            el.textContent
          ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

          if (txt) out.push(txt);
          if (el.shadowRoot && el !== this) this._collectTextDeep(el.shadowRoot, out, depth + 1);
        } catch (e) {}
      }
    }

    _readCiscoStateFromDom() {
      const texts = [];
      try {
        this._collectTextDeep(document, texts, 0);

        // Wichtig: Nicht-Available States zuerst prüfen. Sonst gewinnt das Cisco-Status-Control,
        // wenn irgendwo noch "Available" im DOM steht.
        const known = [
          { label: 'Interner Termin', re: /interner\s+ter/i },
          { label: 'Not Responding', re: /not\s+responding/i },
          { label: 'Wrap-up', re: /wrap[-\s]?up/i },
          { label: 'Ringing', re: /ringing|alerting/i },
          { label: 'Connected', re: /connected/i },
          { label: 'Meeting', re: /meeting/i },
          { label: 'Unavailable', re: /unavailable/i },
          { label: 'Busy', re: /busy/i },
          { label: 'Available', re: /available/i },
          { label: 'Available', re: /\bidle\b/i }
        ];

        // 1) Erst sehr wahrscheinliche Header-/Button-Texte prüfen.
        const priorityTexts = texts.filter(t =>
          /availability|state|interner|available|wrap|ringing|connected|meeting|busy|unavailable|responding/i.test(t)
        );
        for (const item of known) {
          if (priorityTexts.some(t => item.re.test(t))) return item.label;
        }

        // 2) Fallback: gesamter DOM-Text.
        const all = texts.join(' | ');
        for (const item of known) {
          if (item.re.test(all)) return item.label;
        }
      } catch (e) {}
      return '';
    }

    _normalizeState(raw) {
      let s = String(raw || '').trim();
      if (this._isPlaceholder(s)) s = '';
      if (!s) s = this._readCiscoStateFromDom();
      if (!s) return '';

      const l = s.toLowerCase();
      if (l.includes('interner ter')) return 'Interner Termin';
      if (l.includes('available') || l === 'idle' || l.includes('frei')) return 'Available';
      if (l.includes('wrap')) return 'Wrap-up';
      if (l.includes('ring')) return 'Ringing';
      if (l.includes('connect')) return 'Connected';
      if (l.includes('meeting')) return 'Meeting';
      if (l.includes('not responding')) return 'Not Responding';
      if (l.includes('unavailable')) return 'Unavailable';
      if (l.includes('busy')) return 'Busy';
      return s;
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
      const rawState =
        this._value('agentStatus','availabilityState','presenceState','currentState','status','state','agentState') ||
        this._readCiscoStateFromDom();

      const state = this._normalizeState(rawState);
      const ok = this._isAvailable(state);
      const showState = state || 'Status pending';

      // softer, but still clear colors
      const bg = ok ? '#18864B' : '#9F2F2B';
      const border = ok ? '#0E5F35' : '#6E201D';
      const glow = ok ? 'rgba(24,134,75,.30)' : 'rgba(159,47,43,.28)';

      const key = JSON.stringify({ agentName, teamName, showState, ok });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 42px;
            min-width: 430px;
            max-width: 560px;
            margin: 0 14px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #fff;
            vertical-align: middle;
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            height: 32px;
            padding: 0 14px;
            border-radius: 17px;
            border: 2px solid ${border};
            background: ${bg};
            box-shadow: 0 2px 9px ${glow};
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 11px;
            height: 11px;
            min-width: 11px;
            border-radius: 999px;
            background: #fff;
            opacity: .95;
          }
          .agent {
            font-size: 12px;
            font-weight: 850;
            letter-spacing: .1px;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .team {
            font-size: 13px;
            font-weight: 760;
            opacity: .95;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .state {
            margin-left: auto;
            font-size: 14px;
            font-weight: 850;
            letter-spacing: .15px;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sep {
            font-size: 15px;
            font-weight: 850;
            opacity: .8;
          }
        </style>
        <div class="card" title="${this._escape([agentName, teamName, showState].join(' | '))}">
          <span class="dot"></span>
          <span class="agent">${this._escape(agentName)}</span>
          <span class="sep">·</span>
          <span class="team">${this._escape(teamName)}</span>
          <span class="state">${this._escape(showState)}</span>
        </div>
      `;
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV6);
})();
