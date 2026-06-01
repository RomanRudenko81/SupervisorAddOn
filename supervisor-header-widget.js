(function () {
  const TAG = 'supervisor-header-widget';

  class SupervisorHeaderWidget extends HTMLElement {
    static get observedAttributes() {
      return ['agentname', 'displayname', 'agentstate', 'state', 'status', 'teamname', 'loginid', 'email', 'darkmode'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._last = '';
      this._timer = null;
    }

    connectedCallback() {
      this.render();
      this._timer = window.setInterval(() => this.render(), 1000);
    }

    disconnectedCallback() {
      if (this._timer) window.clearInterval(this._timer);
      this._timer = null;
    }

    attributeChangedCallback() {
      this.render();
    }

    _value(...names) {
      for (const n of names) {
        const propValue = this[n];
        if (propValue !== undefined && propValue !== null && String(propValue).trim() !== '') {
          return String(propValue).trim();
        }
        const attrName = n.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const attrValue = this.getAttribute(attrName) || this.getAttribute(n.toLowerCase());
        if (attrValue !== undefined && attrValue !== null && String(attrValue).trim() !== '') {
          return String(attrValue).trim();
        }
      }
      return '';
    }

    _isDark() {
      const v = this._value('darkMode');
      return v === true || v === 'true' || v === '1' || v === 'dark';
    }

    _stateClass(stateText) {
      const s = String(stateText || '').toLowerCase();
      if (s.includes('available') || s.includes('idle') || s.includes('frei')) return 'ok';
      if (s.includes('meeting') || s.includes('wrap') || s.includes('connected') || s.includes('ring')) return 'busy';
      return 'neutral';
    }

    _escape(s) {
      return String(s || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
    }

    render() {
      const agentName = this._value('agentName', 'displayName') || 'Agent';
      const teamName = this._value('teamName') || 'Team unknown';
      const state = this._value('agentState', 'state', 'status') || 'Status unknown';
      const loginId = this._value('loginId') || '';
      const email = this._value('email') || '';
      const dark = this._isDark();
      const stateClass = this._stateClass(state);

      const key = JSON.stringify({ agentName, teamName, state, loginId, email, dark, stateClass });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 32px;
            min-width: 280px;
            max-width: 420px;
            margin: 0 10px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: ${dark ? '#f4f5f7' : '#1b1c1f'};
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            height: 28px;
            padding: 0 10px;
            border: 1px solid ${dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.14)'};
            border-radius: 14px;
            background: ${dark ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.72)'};
            box-shadow: 0 1px 2px rgba(0,0,0,.08);
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 8px;
            height: 8px;
            min-width: 8px;
            border-radius: 999px;
            background: #8a8f98;
          }
          .dot.ok { background: #1fa463; }
          .dot.busy { background: #d96c00; }
          .dot.neutral { background: #8a8f98; }
          .main {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 12px;
            font-weight: 600;
            line-height: 16px;
          }
          .meta {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 11px;
            opacity: .78;
            line-height: 14px;
          }
          .sep { opacity: .35; }
          .text {
            min-width: 0;
            overflow: hidden;
          }
        </style>
        <div class="card" title="${this._escape([agentName, teamName, state, loginId, email].filter(Boolean).join(' | '))}">
          <span class="dot ${stateClass}"></span>
          <span class="text">
            <span class="main">${this._escape(agentName)}</span>
            <span class="sep"> · </span>
            <span class="meta">${this._escape(teamName)}</span>
            <span class="sep"> · </span>
            <span class="meta">${this._escape(state)}</span>
          </span>
        </div>
      `;
    }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, SupervisorHeaderWidget);
  }
})();
