(function () {
  const TAG = 'supervisor-header-widget-v5';

  class SupervisorHeaderWidgetV5 extends HTMLElement {
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

    _readCiscoStateFromDom() {
      const candidates = [];
      const selectors = [
        'agentx-state-selector',
        '[title*="Availability"]',
        '[aria-label*="Availability"]',
        'button',
        'md-button',
        '[role="button"]'
      ];
      try {
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => {
            const txt = [
              el.getAttribute('title'),
              el.getAttribute('aria-label'),
              el.textContent
            ].filter(Boolean).join(' ').trim();
            if (txt) candidates.push(txt);
          });
        }
        const all = candidates.join(' | ');
        const known = [
          'Available',
          'Ringing',
          'Connected',
          'Wrap-up',
          'Wrap up',
          'Idle',
          'Meeting',
          'Interner Termin',
          'Not Responding',
          'Unavailable',
          'Busy'
        ];
        for (const k of known) {
          if (new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(all)) return k;
        }
      } catch (e) {}
      return '';
    }

    _normalizeState(raw) {
      let s = String(raw || '').trim();
      if (this._isPlaceholder(s)) s = '';
      if (!s) s = this._readCiscoStateFromDom();
      if (!s) return 'UNKNOWN';

      const l = s.toLowerCase();
      if (l.includes('available') || l === 'idle' || l.includes('frei')) return 'AVAILABLE';
      if (l.includes('wrap')) return 'WRAP-UP';
      if (l.includes('ring')) return 'RINGING';
      if (l.includes('connect')) return 'CONNECTED';
      if (l.includes('meeting')) return 'MEETING';
      if (l.includes('busy') || l.includes('unavailable') || l.includes('not responding')) return s.toUpperCase();
      return s.toUpperCase();
    }

    _isAvailable(state) {
      return String(state || '').trim().toUpperCase() === 'AVAILABLE';
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

      const bg = ok ? '#00C853' : '#E00000';
      const border = ok ? '#006B2E' : '#8B0000';
      const glow = ok ? 'rgba(0,200,83,.65)' : 'rgba(224,0,0,.65)';

      const key = JSON.stringify({ agentName, teamName, state, ok });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 52px;
            min-width: 560px;
            max-width: 760px;
            margin: 0 18px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #fff;
            vertical-align: middle;
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 14px;
            width: 100%;
            height: 46px;
            padding: 0 20px;
            border-radius: 23px;
            border: 3px solid ${border};
            background: ${bg};
            box-shadow: 0 0 0 2px rgba(255,255,255,.25), 0 4px 16px ${glow};
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 16px;
            height: 16px;
            min-width: 16px;
            border-radius: 999px;
            background: #fff;
            box-shadow: 0 0 0 3px rgba(255,255,255,.45);
          }
          .agent {
            font-size: 18px;
            font-weight: 900;
            letter-spacing: .2px;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .team {
            font-size: 16px;
            font-weight: 800;
            opacity: .95;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .state {
            margin-left: auto;
            font-size: 18px;
            font-weight: 950;
            letter-spacing: .5px;
            text-transform: uppercase;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .sep {
            font-size: 20px;
            font-weight: 900;
            opacity: .85;
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

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV5);
})();
