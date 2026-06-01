(function () {
  const TAG = 'supervisor-header-widget';
  const STATES = ['Available','Ringing','Connected','Wrap-up','Wrap up','Wrapup','Meeting','Break','Busy','Lunch','Training','Not Ready','Offline','RONA','Idle','Interner Termin'];

  class SupervisorHeaderWidget extends HTMLElement {
    static get observedAttributes() {
      return ['agentname','displayname','agentstate','agentstatus','availabilitystate','presencestate','currentstate','state','status','teamname','loginid','email','darkmode'];
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
      return !s || s.startsWith('$STORE.') || s.startsWith('STORE_') || s === 'undefined' || s === 'null' || s === '[object Object]';
    }
    _get(...names) {
      for (const n of names) {
        const pv = this[n];
        if (!this._isPlaceholder(pv)) return String(pv).trim();
        const dashed = n.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const av = this.getAttribute(dashed) || this.getAttribute(n.toLowerCase());
        if (!this._isPlaceholder(av)) return String(av).trim();
      }
      return '';
    }
    _txt(v) {
      if (!v) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object') return v.name || v.value || v.state || v.status || v.agentState || v.agentStatus || v.type || '';
      return String(v);
    }
    _fromPossibleStore() {
      const roots = [window.STORE, window.store, window.AgentXStore, window.__STORE__, window.__agentStore, window.desktopStore, window.appStore].filter(Boolean);
      const keys = ['status','state','agentState','agentStatus','availabilityState','presenceState','currentState'];
      for (const root of roots) {
        const a = root.agent || root.getState?.()?.agent || root.state?.agent;
        if (!a) continue;
        for (const k of keys) {
          const val = this._txt(a[k]);
          if (!this._isPlaceholder(val)) return val;
        }
      }
      return '';
    }
    _walkText(node, out, depth) {
      if (!node || depth > 12 || out.length > 25000) return;
      if (node === this || node === this.shadowRoot) return;
      if (node.nodeType === Node.TEXT_NODE) { out.push(node.nodeValue || ''); return; }
      if (node.nodeType !== Node.ELEMENT_NODE && node !== document.body) return;
      const el = node;
      if (el.shadowRoot) this._walkText(el.shadowRoot, out, depth + 1);
      for (const c of el.childNodes || []) this._walkText(c, out, depth + 1);
    }
    _fromDom() {
      const parts = [];
      this._walkText(document.body, parts, 0);
      const text = parts.join(' ').replace(/\s+/g, ' ');
      // Prefer the visible Cisco state selector text, e.g. "Available 00:03".
      for (const st of STATES) {
        const re = new RegExp('\\b' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b(?:\\s+\\d{1,2}:\\d{2})?', 'i');
        const m = text.match(re);
        if (m) return st;
      }
      return '';
    }
    _normalize(raw) {
      const s = String(raw || '').trim();
      if (!s) return 'Unknown';
      const l = s.toLowerCase();
      if (l.includes('available') || l.includes('idle') || l.includes('frei')) return 'Available';
      if (l.includes('wrap')) return 'Wrap-up';
      if (l.includes('ring')) return 'Ringing';
      if (l.includes('connect')) return 'Connected';
      if (l.includes('meeting')) return 'Meeting';
      if (l.includes('break')) return 'Break';
      if (l.includes('not ready')) return 'Not Ready';
      return s.replace(/^STORE_/, '');
    }
    _state() {
      const direct = this._get('availabilityState','agentStatus','status','currentState','presenceState','state','agentState');
      if (direct) return this._normalize(direct);
      const store = this._fromPossibleStore();
      if (store) return this._normalize(store);
      const dom = this._fromDom();
      if (dom) return this._normalize(dom);
      return 'Unknown';
    }
    _isAvailable(s) { return String(s || '').toLowerCase() === 'available'; }
    _escape(s) { return String(s || '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

    render() {
      const agentName = this._get('agentName','displayName') || 'Agent';
      const teamName = this._get('teamName') || 'Team';
      const state = this._state();
      const ok = this._isAvailable(state);
      const bg = ok ? '#00C853' : '#E00000';
      const border = ok ? '#006B2E' : '#8B0000';
      const key = JSON.stringify({ agentName, teamName, state, ok });
      if (key === this._last) return;
      this._last = key;
      this.shadowRoot.innerHTML = `
        <style>
          :host{display:inline-flex;align-items:center;height:52px;min-width:560px;max-width:760px;margin:0 18px 0 0;box-sizing:border-box;font-family:CiscoSans,Arial,Helvetica,sans-serif;color:#fff;vertical-align:middle;}
          .card{display:flex;align-items:center;gap:14px;width:100%;height:46px;padding:0 20px;border:3px solid ${border};border-radius:24px;background:${bg};box-shadow:0 5px 14px rgba(0,0,0,.28);white-space:nowrap;overflow:hidden;}
          .dot{width:16px;height:16px;min-width:16px;border-radius:50%;background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.35),0 0 14px rgba(255,255,255,.85);}
          .agent{font-size:18px;font-weight:900;line-height:22px;letter-spacing:.3px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
          .team{font-size:16px;font-weight:800;line-height:20px;opacity:.95;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
          .state{margin-left:auto;font-size:18px;font-weight:900;line-height:22px;text-transform:uppercase;}
          .sep{font-size:20px;font-weight:900;opacity:.9;}
        </style>
        <div class="card" title="${this._escape(agentName + ' | ' + teamName + ' | ' + state)}">
          <span class="dot"></span><span class="agent">${this._escape(agentName)}</span><span class="sep">·</span><span class="team">${this._escape(teamName)}</span><span class="state">${this._escape(state)}</span>
        </div>`;
    }
  }
  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidget);
})();
