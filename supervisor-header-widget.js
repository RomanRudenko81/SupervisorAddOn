(function () {
  const TAG = 'supervisor-header-widget';

  class SupervisorHeaderWidget extends HTMLElement {
    static get observedAttributes() {
      return [
        'agentname', 'displayname', 'agentstate', 'state', 'status',
        'teamname', 'loginid', 'email', 'darkmode'
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
      this._timer = window.setInterval(() => this.render(), 750);
    }

    disconnectedCallback() {
      if (this._timer) window.clearInterval(this._timer);
      this._timer = null;
    }

    attributeChangedCallback() {
      this.render();
    }

    _isPlaceholder(v) {
      const s = String(v ?? '').trim();
      if (!s) return true;
      return (
        s.startsWith('$STORE.') ||
        s.startsWith('STORE_') ||
        s === 'undefined' ||
        s === 'null' ||
        s === '[object Object]'
      );
    }

    _value(...names) {
      for (const n of names) {
        const propValue = this[n];
        if (!this._isPlaceholder(propValue)) return String(propValue).trim();

        const attrName = n.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const attrValue = this.getAttribute(attrName) || this.getAttribute(n.toLowerCase());
        if (!this._isPlaceholder(attrValue)) return String(attrValue).trim();
      }
      return '';
    }

    _isDark() {
      const v = this._value('darkMode');
      return v === true || v === 'true' || v === '1' || String(v).toLowerCase() === 'dark';
    }

    _normalizeState(raw) {
      const s = String(raw || '').trim();
      if (!s) return 'Unknown';
      const l = s.toLowerCase();
      if (l.includes('available') || l.includes('idle') || l.includes('frei')) return 'Available';
      return s;
    }

    _isAvailable(stateText) {
      const s = String(stateText || '').toLowerCase();
      return s.includes('available') || s.includes('idle') || s.includes('frei');
    }

    _escape(s) {
      return String(s || '').replace(/[&<>'"]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[c]));
    }

    render() {
      const agentName = this._value('agentName', 'displayName') || 'Agent';
      const teamName = this._value('teamName') || 'Team unknown';

      // Wichtig: status/state zuerst, weil agentState in deinem Layout aktuell nicht sauber resolved.
      const rawState = this._value('status', 'state', 'agentState') || 'Unknown';
      const state = this._normalizeState(rawState);
      const isAvailable = this._isAvailable(state);
      const dark = this._isDark();

      const bg = isAvailable ? '#00B050' : '#D60000';
      const border = isAvailable ? '#007A34' : '#990000';
      const shadow = isAvailable ? 'rgba(0,176,80,.42)' : 'rgba(214,0,0,.42)';
      const dot = isAvailable ? '#B9FFD2' : '#FFD1D1';

      const key = JSON.stringify({ agentName, teamName, state, dark, isAvailable });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 40px;
            min-width: 430px;
            max-width: 620px;
            margin: 0 14px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #ffffff;
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            width: 100%;
            height: 36px;
            padding: 0 16px;
            border: 2px solid ${border};
            border-radius: 18px;
            background: ${bg};
            box-shadow: 0 0 0 1px rgba(255,255,255,.18), 0 3px 10px ${shadow};
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 12px;
            height: 12px;
            min-width: 12px;
            border-radius: 999px;
            background: ${dot};
            box-shadow: 0 0 0 2px rgba(255,255,255,.45);
          }
          .agent {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 14px;
            font-weight: 800;
            line-height: 18px;
            letter-spacing: .2px;
            text-transform: uppercase;
          }
          .team, .state {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 13px;
            font-weight: 700;
            line-height: 18px;
          }
          .state {
            margin-left: auto;
            text-transform: uppercase;
          }
          .sep {
            opacity: .75;
            font-weight: 800;
          }
        </style>
        <div class="card" title="${this._escape([agentName, teamName, state].filter(Boolean).join(' | '))}">
          <span class="dot"></span>
          <span class="agent">${this._escape(agentName)}</span>
          <span class="sep">·</span>
          <span class="team">${this._escape(teamName)}</span>
          <span class="state">${this._escape(state)}</span>
        </div>
      `;
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidget);
})();
