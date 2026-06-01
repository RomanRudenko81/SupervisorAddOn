(function () {
  const TAG = 'supervisor-header-widget-v12';
  const GLOBAL = '__wxcc_header_status_v12__';

  function now() { return Date.now(); }
  function isObj(v) { return v && typeof v === 'object'; }

  function normalizeText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
  }

  function isPlaceholder(v) {
    const s = normalizeText(v);
    if (!s) return true;
    return s.startsWith('$STORE.') || s.startsWith('STORE_') ||
      s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null' || s === '[object Object]' || s === '-';
  }

  function extractKnownState(text) {
    const t = normalizeText(text);
    if (!t) return '';
    const checks = [
      ['Interner Termin', /\binterner\s+termin\b|\binterner\s+ter/i],
      ['Pause', /\bpause\b/i],
      ['RONA', /\brona\b|\bnot\s+responding\b/i],
      ['Wrap-up', /\bwrap[-\s]?up\b|\bnachbearbeitung\b/i],
      ['Ringing', /\b(ringing|alerting|klingeln)\b/i],
      ['Connected', /\bconnected\b|\bverbunden\b/i],
      ['Meeting', /\bmeeting\b|\bbesprechung\b/i],
      ['Unavailable', /\bunavailable\b|\bnicht\s+verf/i],
      ['Busy', /\bbusy\b|\bbesetzt\b/i],
      ['Available', /\bavailable\b|\bverf\u00fcgbar\b/i]
    ];
    for (const [label, re] of checks) if (re.test(t)) return label;
    return '';
  }

  function deriveEventState(detail, data) {
    const agentState = normalizeText(detail && detail.agentState);
    const subStatus = normalizeText((detail && detail.subStatus) || (data && data.subStatus));
    const status = normalizeText((detail && detail.status) || (data && data.status));

    // Custom idle reasons are normally the visible status. Generic Idle/LoggedIn are not helpful.
    if (subStatus && !/^idle$/i.test(subStatus) && !/^loggedin$/i.test(subStatus)) return subStatus;
    if (agentState && !/^idle$/i.test(agentState)) return agentState;
    if (subStatus && !/^idle$/i.test(subStatus)) return subStatus;
    if (status && !/^loggedin$/i.test(status)) return status;
    return agentState || subStatus || status || '';
  }

  function ensureGlobal() {
    if (window[GLOBAL]) return window[GLOBAL];
    const state = window[GLOBAL] = {
      latestByAgent: {},
      latest: null,
      installed: false,
      originalLog: console.log,
      originalInfo: console.info,
      originalDebug: console.debug
    };

    function inspect(value, depth, found) {
      if (depth > 6 || value == null) return;
      if (typeof value === 'string') {
        // Try to parse JSON fragments only when the important key is present.
        if (value.indexOf('agentChannelStateDetail') >= 0) {
          const first = value.indexOf('{');
          const last = value.lastIndexOf('}');
          if (first >= 0 && last > first) {
            try { inspect(JSON.parse(value.slice(first, last + 1)), depth + 1, found); } catch (e) {}
          }
        }
        return;
      }
      if (!isObj(value)) return;

      const detail = value.agentChannelStateDetail || (value.data && value.data.agentChannelStateDetail);
      if (detail) {
        const data = value.data || value;
        const agentId = normalizeText(value.agentId || data.agentId || detail.agentId);
        const display = deriveEventState(detail, data);
        if (display) found.push({ agentId, display, detail, data, ts: now() });
      }

      if (Array.isArray(value)) {
        for (const item of value) inspect(item, depth + 1, found);
      } else {
        for (const k of Object.keys(value).slice(0, 80)) inspect(value[k], depth + 1, found);
      }
    }

    function handleArgs(args) {
      try {
        const found = [];
        for (const a of args) inspect(a, 0, found);
        for (const f of found) {
          state.latest = f;
          if (f.agentId) state.latestByAgent[f.agentId] = f;
        }
      } catch (e) {}
    }

    console.log = function () { handleArgs(arguments); return state.originalLog.apply(console, arguments); };
    console.info = function () { handleArgs(arguments); return state.originalInfo.apply(console, arguments); };
    console.debug = function () { handleArgs(arguments); return state.originalDebug.apply(console, arguments); };
    state.installed = true;
    return state;
  }

  class SupervisorHeaderWidgetV12 extends HTMLElement {
    static get observedAttributes() {
      return [
        'agentname','displayname','agentid','agentstate','agentstatus','availabilitystate',
        'presencestate','currentstate','state','status','teamname','loginid','email','darkmode'
      ];
    }

    constructor() {
      super();
      ensureGlobal();
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

    _value(...names) {
      for (const n of names) {
        const propValue = this[n];
        if (!isPlaceholder(propValue)) return normalizeText(propValue);
        const attr1 = n.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const attr2 = n.toLowerCase();
        const attrValue = this.getAttribute(attr1) || this.getAttribute(attr2);
        if (!isPlaceholder(attrValue)) return normalizeText(attrValue);
      }
      return '';
    }

    _escape(s) {
      return String(s || '').replace(/[&<>'"]/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
      }[c]));
    }

    _isVisible(el) {
      try {
        if (!el || el === this) return false;
        const r = el.getBoundingClientRect && el.getBoundingClientRect();
        if (!r || r.width < 30 || r.height < 10) return false;
        if (r.top < 0 || r.top > 110) return false;
        const st = window.getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) > 0;
      } catch (e) { return false; }
    }

    _walkOpenRoots(root, out, depth) {
      if (!root || depth > 8) return;
      let els = [];
      try { els = Array.from(root.querySelectorAll ? root.querySelectorAll('*') : []); } catch (e) { return; }
      for (const el of els) {
        out.push(el);
        if (el.shadowRoot) this._walkOpenRoots(el.shadowRoot, out, depth + 1);
      }
    }

    _readCiscoHeaderState() {
      const els = [];
      this._walkOpenRoots(document, els, 0);
      const candidates = [];
      for (const el of els) {
        if (!this._isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 90 || r.width > 420 || r.height > 65) continue;
        if (r.left < window.innerWidth * 0.35) continue;
        const txt = normalizeText([
          el.innerText, el.textContent, el.getAttribute && el.getAttribute('aria-label'), el.getAttribute && el.getAttribute('title')
        ].filter(Boolean).join(' '));
        if (!/\b\d{1,2}:\d{2}\b/.test(txt)) continue;
        const state = extractKnownState(txt);
        if (!state) continue;
        let score = r.left;
        if (/available|interner|pause|rona|wrap|not responding|unavailable|busy/i.test(txt)) score += 5000;
        if (/meeting/i.test(txt)) score -= 1000; // avoid meeting timer if another state candidate exists
        candidates.push({ state, txt, score, left: r.left, top: r.top });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0] || null;
    }

    _readEventState() {
      const g = ensureGlobal();
      const agentId = this._value('agentId');
      const ev = (agentId && g.latestByAgent[agentId]) || g.latest;
      if (!ev || !ev.display) return null;
      if (now() - ev.ts > 20000) return null;
      return ev;
    }

    _readPropState() {
      const s = this._value('agentStatus','availabilityState','presenceState','currentState','status','state','agentState');
      return extractKnownState(s) || s || '';
    }

    _resolveState() {
      const dom = this._readCiscoHeaderState();
      const ev = this._readEventState();
      const prop = this._readPropState();

      // Visible Cisco dropdown is the strongest source when available.
      if (dom && dom.state) return { state: dom.state, source: 'header-dom', raw: dom.txt };

      if (ev && ev.display) return { state: extractKnownState(ev.display) || ev.display, source: 'agent-event', raw: JSON.stringify(ev.detail || {}) };
      if (prop) return { state: extractKnownState(prop) || prop, source: 'layout-prop', raw: prop };
      return { state: 'Status pending', source: 'none', raw: '' };
    }

    render() {
      const agentName = this._value('agentName', 'displayName') || 'Supervisor 1';
      const teamName = this._value('teamName') || 'Service';
      const resolved = this._resolveState();
      const state = resolved.state || 'Status pending';
      const ok = /^available$/i.test(state);
      const bg = ok ? '#18864B' : '#A0443F';
      const border = ok ? '#0E5F35' : '#7B2E2A';
      const glow = ok ? 'rgba(24,134,75,.24)' : 'rgba(160,68,63,.22)';

      const key = JSON.stringify({ agentName, teamName, state, source: resolved.source, raw: resolved.raw, ok });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host{display:inline-flex;align-items:center;height:40px;min-width:360px;max-width:500px;margin:0 12px 0 0;box-sizing:border-box;font-family:CiscoSans,Arial,Helvetica,sans-serif;color:#fff;vertical-align:middle;}
          .card{display:inline-flex;align-items:center;gap:9px;width:100%;height:30px;padding:0 13px;border-radius:16px;border:1.5px solid ${border};background:${bg};box-shadow:0 2px 7px ${glow};white-space:nowrap;overflow:hidden;}
          .dot{width:10px;height:10px;min-width:10px;border-radius:999px;background:#fff;opacity:.95;}
          .agent{font-size:12px;font-weight:800;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
          .team{font-size:12px;font-weight:700;opacity:.95;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
          .state{margin-left:auto;font-size:12px;font-weight:800;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis;}
          .sep{font-size:14px;font-weight:800;opacity:.8;}
        </style>
        <div class="card" title="${this._escape([agentName, teamName, state, resolved.source, resolved.raw].join(' | '))}">
          <span class="dot"></span><span class="agent">${this._escape(agentName)}</span><span class="sep">·</span><span class="team">${this._escape(teamName)}</span><span class="state">${this._escape(state)}</span>
        </div>`;
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV12);
})();
