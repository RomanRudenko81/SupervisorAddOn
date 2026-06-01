(function () {
  const TAG = 'supervisor-header-widget';

  const KNOWN_STATES = [
    'Available',
    'Idle',
    'Ringing',
    'Connected',
    'Wrap-up',
    'Wrap up',
    'Wrapup',
    'Meeting',
    'Break',
    'Busy',
    'Lunch',
    'Training',
    'Not Ready',
    'Offline',
    'RONA',
    'Interner Termin'
  ];

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
      this._lastDetectedState = '';
    }

    connectedCallback() {
      this.render();
      this._timer = window.setInterval(() => this.render(), 500);
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

    _toCleanString(v) {
      if (v == null) return '';
      if (typeof v === 'object') {
        return String(v.name || v.value || v.label || v.state || v.status || v.agentState || '').trim();
      }
      return String(v).trim();
    }

    _value(...names) {
      for (const n of names) {
        const propValue = this[n];
        const propText = this._toCleanString(propValue);
        if (!this._isPlaceholder(propText)) return propText;

        const attrName = n.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const attrValue = this.getAttribute(attrName) || this.getAttribute(n.toLowerCase());
        const attrText = this._toCleanString(attrValue);
        if (!this._isPlaceholder(attrText)) return attrText;
      }
      return '';
    }

    _isDark() {
      const v = this._value('darkMode');
      return v === true || v === 'true' || v === '1' || String(v).toLowerCase() === 'dark';
    }

    _normalizeState(raw) {
      const s = String(raw || '').trim();
      if (!s) return '';
      const l = s.toLowerCase();
      if (l.includes('available') || l.includes('idle') || l.includes('frei')) return 'Available';
      if (l.includes('wrap')) return 'Wrap-up';
      if (l.includes('ring')) return 'Ringing';
      if (l.includes('connect')) return 'Connected';
      if (l.includes('meeting')) return 'Meeting';
      if (l.includes('interner termin')) return 'Interner Termin';
      if (l.includes('break') || l.includes('pause')) return 'Break';
      if (l.includes('lunch')) return 'Lunch';
      if (l.includes('training')) return 'Training';
      if (l.includes('not ready')) return 'Not Ready';
      if (l.includes('busy')) return 'Busy';
      if (l.includes('rona')) return 'RONA';
      if (l.includes('offline')) return 'Offline';
      return s;
    }

    _isAvailable(stateText) {
      const s = String(stateText || '').toLowerCase();
      return s === 'available' || s.includes('available') || s.includes('idle') || s.includes('frei');
    }

    _escape(s) {
      return String(s || '').replace(/[&<>'"]/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[c]));
    }

    _findStateInText(text) {
      const t = String(text || '').replace(/\s+/g, ' ').trim();
      if (!t) return '';

      // Typical native selector text: "Available 00:10" or "Meeting 02:32"
      for (const st of KNOWN_STATES) {
        const re = new RegExp('(^|\\b)' + st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\b|\\s|$)', 'i');
        if (re.test(t)) return this._normalizeState(st);
      }

      return '';
    }

    _readNativeStateSelector() {
      try {
        const seen = new Set();
        const stack = [document.body];

        while (stack.length) {
          const node = stack.shift();
          if (!node || seen.has(node) || node === this || node === this.shadowRoot) continue;
          seen.add(node);

          if (node.nodeType === Node.ELEMENT_NODE) {
            const tag = String(node.tagName || '').toLowerCase();

            // Do not read our own rendered text, otherwise it would keep its previous state forever.
            if (tag === TAG || node.closest?.(TAG)) continue;

            const aria = node.getAttribute?.('aria-label') || '';
            const title = node.getAttribute?.('title') || '';
            const combinedAttr = `${aria} ${title}`;
            const attrState = this._findStateInText(combinedAttr);
            if (attrState) return attrState;

            // Prefer native state selector/button-ish elements before broad text scanning.
            const role = node.getAttribute?.('role') || '';
            const cls = node.getAttribute?.('class') || '';
            const id = node.getAttribute?.('id') || '';
            const looksLikeStateSelector =
              tag.includes('state') ||
              role === 'button' ||
              /state|status|available|agentx-state/i.test(`${tag} ${cls} ${id} ${combinedAttr}`);

            if (looksLikeStateSelector) {
              const state = this._findStateInText(node.innerText || node.textContent || '');
              if (state) return state;
            }

            if (node.shadowRoot && node.shadowRoot.mode === 'open') stack.push(node.shadowRoot);
            stack.push(...Array.from(node.children || []));
          } else if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            stack.push(...Array.from(node.children || []));
          }
        }

        // Broad fallback: visible body text, excluding our last own text as much as possible.
        const bodyText = String(document.body?.innerText || '');
        const state = this._findStateInText(bodyText);
        if (state) return state;
      } catch (e) {
        // Never break WXCC header rendering because of fallback detection.
      }
      return '';
    }

    _resolveState() {
      // Store values first.
      const rawStoreState = this._value('status', 'state', 'agentState');
      const storeState = this._normalizeState(rawStoreState);

      // If WXCC only passes placeholder strings, read the visible native state selector.
      if (!storeState) {
        const detected = this._readNativeStateSelector();
        if (detected) this._lastDetectedState = detected;
        return detected || this._lastDetectedState || 'Unknown';
      }

      if (!this._isPlaceholder(storeState)) {
        this._lastDetectedState = storeState;
        return storeState;
      }

      const detected = this._readNativeStateSelector();
      if (detected) this._lastDetectedState = detected;
      return detected || this._lastDetectedState || 'Unknown';
    }

    render() {
      const agentName = this._value('agentName', 'displayName') || 'Agent';
      const teamName = this._value('teamName') || 'Team unknown';
      const state = this._resolveState();
      const isAvailable = this._isAvailable(state);
      const dark = this._isDark();

      const bg = isAvailable ? '#00C853' : '#E00000';
      const border = isAvailable ? '#008C3A' : '#A60000';
      const shadow = isAvailable ? 'rgba(0,200,83,.55)' : 'rgba(224,0,0,.55)';
      const dot = isAvailable ? '#D8FFE5' : '#FFE0E0';

      const key = JSON.stringify({ agentName, teamName, state, dark, isAvailable });
      if (key === this._last) return;
      this._last = key;

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: 52px;
            min-width: 520px;
            max-width: 760px;
            margin: 0 18px 0 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #ffffff;
          }
          .card {
            display: inline-flex;
            align-items: center;
            gap: 14px;
            width: 100%;
            height: 46px;
            padding: 0 20px;
            border: 2px solid ${border};
            border-radius: 24px;
            background: ${bg};
            box-shadow: 0 0 0 1px rgba(255,255,255,.22), 0 4px 14px ${shadow};
            white-space: nowrap;
            overflow: hidden;
          }
          .dot {
            width: 15px;
            height: 15px;
            min-width: 15px;
            border-radius: 999px;
            background: ${dot};
            box-shadow: 0 0 0 3px rgba(255,255,255,.45);
          }
          .agent {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 16px;
            font-weight: 900;
            line-height: 20px;
            letter-spacing: .3px;
            text-transform: uppercase;
          }
          .team {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 15px;
            font-weight: 800;
            line-height: 20px;
            text-transform: uppercase;
            opacity: .95;
          }
          .state {
            margin-left: auto;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 17px;
            font-weight: 900;
            line-height: 20px;
            text-transform: uppercase;
          }
          .sep {
            opacity: .9;
            font-weight: 900;
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
