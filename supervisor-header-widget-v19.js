(function () {
  const TAG = 'supervisor-header-widget-v19';
  const GLOBAL = '__wxcc_header_status_v19__';

  function now() { return Date.now(); }
  function isObj(v) { return v && typeof v === 'object'; }
  function normalizeText(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  function isPlaceholder(v) {
    const s = normalizeText(v);
    if (!s) return true;
    return s.startsWith('$STORE.') || s.startsWith('STORE_') ||
      s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null' ||
      s === '[object Object]' || s === '-';
  }

  function titleCaseFallback(s) {
    return normalizeText(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function extractKnownState(text) {
    const t = normalizeText(text);
    if (!t) return '';

    // Order matters: specific custom states before generic states.
    const checks = [
      ['Available', /\bavailable\b|\bverf(?:ü|ue)gbar\b|\bfrei\b/i],
      ['Interner Termin', /\binterner\s+termin\b|\binterner\s+ter\b|\binternal\s+(appointment|meeting)\b|\bintern(?:al)?\b/i],
      ['Meeting', /\bmeeting\b|\bbesprechung\b|\btermin\b/i],
      ['Pause', /\bpause\b|\bbreak\b/i],
      ['Lunch', /\blunch\b|\bmittag(?:spause)?\b|\bmittagessen\b/i],
      ['Training', /\btraining\b|\bschulung\b|\bcoaching\b/i],
      ['RONA', /\brona\b|\bnot\s+responding\b|\bnicht\s+angenommen\b/i],
      ['Wrap-up', /\bwrap[-\s]?up\b|\bwrapup\b|\bnachbearbeitung\b/i],
      ['Ringing', /\b(ringing|alerting|klingeln|läutet|laeutet)\b/i],
      ['Connected', /\bconnected\b|\bverbunden\b|\bim\s+gespr(?:ä|ae)ch\b/i],
      ['Idle', /\bidle\b|\bleerlauf\b/i],
      ['Unavailable', /\bunavailable\b|\bnicht\s+verf(?:ü|ue)gbar\b/i],
      ['Busy', /\bbusy\b|\bbesetzt\b/i],
      ['Offline', /\boffline\b|\blogged\s*out\b|\babgemeldet\b/i]
    ];
    for (const [label, re] of checks) if (re.test(t)) return label;
    return '';
  }

  function cleanHeaderTextToState(text) {
    let t = normalizeText(text);
    if (!t) return '';
    // Remove timers and common header noise.
    t = t.replace(/\b\d{1,2}:\d{2}(?:\s*\/\s*\d{1,2}:\d{2})?\b/g, ' ');
    t = t.replace(/Availability State|Status|Supervisor|Service|Queue|Channel|Managed Teams/ig, ' ');
    t = normalizeText(t);
    return extractKnownState(t) || '';
  }

  function deriveEventState(detail, data) {
    const reason = normalizeText((detail && detail.stateChangeReason) || (data && data.stateChangeReason));
    const agentState = normalizeText(detail && detail.agentState);
    const subStatus = normalizeText((detail && detail.subStatus) || (data && data.subStatus));
    const status = normalizeText((detail && detail.status) || (data && data.status));

    // Custom reason/status wins when it contains a real label.
    const reasonKnown = extractKnownState(reason);
    if (reasonKnown && !/^Idle$/i.test(reasonKnown)) return reasonKnown;

    const subKnown = extractKnownState(subStatus);
    if (subKnown && !/^Idle$/i.test(subKnown)) return subKnown;

    const agentKnown = extractKnownState(agentState);
    if (agentKnown && !/^Idle$/i.test(agentKnown)) return agentKnown;

    const statusKnown = extractKnownState(status);
    if (statusKnown && !/^LoggedIn$/i.test(statusKnown)) return statusKnown;

    // Generic Idle/LoggedIn are not the visible reason, but can be fallback.
    if (agentKnown) return agentKnown;
    if (subKnown) return subKnown;
    return statusKnown || agentState || subStatus || status || '';
  }

  function ensureGlobal() {
    if (window[GLOBAL]) return window[GLOBAL];
    const state = window[GLOBAL] = {
      latestByAgent: {}, latest: null, installed: false,
      originalLog: console.log, originalInfo: console.info, originalDebug: console.debug
    };

    function inspect(value, depth, found) {
      if (depth > 6 || value == null) return;
      if (typeof value === 'string') {
        if (value.indexOf('agentChannelStateDetail') >= 0 || value.indexOf('AgentChannelStateChange') >= 0) {
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

  class SupervisorHeaderWidgetV19 extends HTMLElement {
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
      this._timer = window.setInterval(() => this.render(), 200);
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
        if (el.tagName && String(el.tagName).toLowerCase() === TAG) return false;
        const r = el.getBoundingClientRect && el.getBoundingClientRect();
        if (!r || r.width < 30 || r.height < 10) return false;
        if (r.top < 0 || r.top > 115) return false;
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
        if (r.width < 85 || r.width > 480 || r.height > 70) continue;
        if (r.left < window.innerWidth * 0.34) continue;

        const txt = normalizeText([
          el.innerText,
          el.textContent,
          el.getAttribute && el.getAttribute('aria-label'),
          el.getAttribute && el.getAttribute('title')
        ].filter(Boolean).join(' '));

        const hasTimer = /\b\d{1,2}:\d{2}\b/.test(txt);
        const known = cleanHeaderTextToState(txt);
        if (!known) continue;

        let score = 0;
        score += r.left;                       // right-side header controls preferred
        if (hasTimer) score += 10000;          // Cisco state dropdown has the timer
        if (/Availability State/i.test(txt)) score += 2000;
        if (/available|interner|meeting|pause|break|lunch|training|rona|wrap|busy|unavailable|idle|connected|ringing/i.test(txt)) score += 1000;
        if (/supervisor|service/i.test(txt) && !hasTimer) score -= 3000; // avoid this widget text

        candidates.push({ state: known, txt, score, left: r.left, top: r.top, width: r.width });
      }

      candidates.sort((a, b) => b.score - a.score);
      return candidates[0] || null;
    }

    _readEventState() {
      const g = ensureGlobal();
      const agentId = this._value('agentId');
      const ev = (agentId && g.latestByAgent[agentId]) || g.latest;
      if (!ev || !ev.display) return null;
      if (now() - ev.ts > 12000) return null;
      return ev;
    }

    _readPropState() {
      const s = this._value('agentStatus','availabilityState','presenceState','currentState','status','state','agentState');
      return extractKnownState(s) || (isPlaceholder(s) ? '' : titleCaseFallback(s));
    }

    _resolveState() {
      const dom = this._readCiscoHeaderState();
      const ev = this._readEventState();
      const prop = this._readPropState();

      // The visible Cisco dropdown is always the source of truth.
      if (dom && dom.state) return { state: dom.state, source: 'header-dom', raw: dom.txt };
      if (ev && ev.display) return { state: extractKnownState(ev.display) || titleCaseFallback(ev.display), source: 'agent-event', raw: JSON.stringify(ev.detail || {}) };
      if (prop) return { state: prop, source: 'layout-prop', raw: prop };
      return { state: 'Status pending', source: 'none', raw: '' };
    }

    render() {
      const agentName = this._value('agentName', 'displayName') || 'Supervisor 1';
      const teamName = this._value('teamName') || 'Service';
      const resolved = this._resolveState();
      const state = resolved.state || 'Status pending';
      const ok = /^available$/i.test(state);
      const bg = ok ? '#198754' : '#B15A52';
      const border = ok ? '#0E6A3E' : '#8F403A';
      const glow = ok ? 'rgba(25,135,84,.22)' : 'rgba(177,90,82,.20)';

      const key = JSON.stringify({ agentName, teamName, state, source: resolved.source, raw: resolved.raw, ok });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host{
            display:inline-flex;
            align-items:center;
            height:44px;
            width:clamp(980px, 72vw, 1500px);
            min-width:980px;
            max-width:1500px;
            margin:0 18px 0 0;
            box-sizing:border-box;
            font-family:'Cisco Sans', CiscoSans, 'Segoe UI', Arial, Helvetica, sans-serif;
            -webkit-font-smoothing:antialiased;
            -moz-osx-font-smoothing:grayscale;
            text-rendering:optimizeLegibility;
            color:#fff;
            vertical-align:middle;
          }
          .card{
            display:flex;
            align-items:center;
            justify-content:center;
            width:100%;
            height:36px;
            padding:0 28px;
            border-radius:18px;
            border:1.5px solid ${border};
            background:${bg};
            box-shadow:0 2px 8px ${glow};
            animation: headerPulse 1.35s ease-in-out infinite;
            will-change: filter, box-shadow;
            white-space:nowrap;
            overflow:hidden;
            text-align:center;
          }
          .content{
            display:flex;
            align-items:center;
            justify-content:center;
            gap:18px;
            width:100%;
            min-width:0;
            overflow:hidden;
            text-align:center;
            -webkit-font-smoothing:antialiased;
            -moz-osx-font-smoothing:grayscale;
            text-rendering:optimizeLegibility;
          }
          .dot{
            width:10px;
            height:10px;
            min-width:10px;
            border-radius:999px;
            background:#fff;
            opacity:.96;
          }
          .item{
            display:inline-flex;
            align-items:center;
            justify-content:center;
            gap:5px;
            min-width:0;
            overflow:hidden;
            line-height:20px;
            letter-spacing:.01em;
            font-size:15px;
            font-weight:500;
            color:#fff;
          }
          .label{
            flex:0 0 auto;
            opacity:.88;
            font-weight:500;
          }
          .value{
            flex:0 1 auto;
            min-width:0;
            overflow:hidden;
            text-overflow:ellipsis;
            font-weight:500;
          }
          .login{max-width:32%;}
          .team{max-width:28%;}
          .status{max-width:34%;}
          @keyframes headerPulse {
            0%, 100% {
              filter: brightness(1);
              box-shadow:0 2px 8px ${glow};
            }
            50% {
              filter: brightness(1.18) saturate(1.15);
              box-shadow:0 3px 16px ${glow}, 0 0 0 2px rgba(255,255,255,.16);
            }
          }
        </style>
        <div class="card" title="${this._escape([agentName, teamName, state, resolved.source, resolved.raw].join(' | '))}">
          <div class="content">
            <span class="dot"></span>
            <span class="item login"><span class="label">Login:</span><span class="value">${this._escape(agentName)}</span></span>
            <span class="item team"><span class="label">Team:</span><span class="value">${this._escape(teamName)}</span></span>
            <span class="item status"><span class="label">Status:</span><span class="value">${this._escape(state)}</span></span>
          </div>
        </div>`;
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV19);
})();
