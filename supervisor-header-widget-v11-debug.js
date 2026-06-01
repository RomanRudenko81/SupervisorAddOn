(function () {
  const TAG = 'supervisor-header-widget-v11-debug';

  class SupervisorHeaderWidgetV11Debug extends HTMLElement {
    static get observedAttributes() {
      return [
        'agentid','agentname','displayname','agentstate','agentstatus','availabilitystate',
        'presencestate','currentstate','state','status','teamid','teamname','loginid','email','darkmode'
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

    _rawValue(name) {
      const values = [];
      try {
        if (this[name] !== undefined) values.push({ source: 'prop', value: this[name] });
        const attr1 = name.replace(/[A-Z]/g, m => '-' + m.toLowerCase()).toLowerCase();
        const attr2 = name.toLowerCase();
        if (this.hasAttribute(attr1)) values.push({ source: 'attr-kebab', value: this.getAttribute(attr1) });
        if (this.hasAttribute(attr2) && attr2 !== attr1) values.push({ source: 'attr-lower', value: this.getAttribute(attr2) });
      } catch (e) {}
      return values;
    }

    _bestValue(name) {
      const raw = this._rawValue(name);
      for (const item of raw) {
        const s = String(item.value ?? '').trim();
        if (s && !this._isPlaceholder(s)) return s;
      }
      return '';
    }

    _isPlaceholder(v) {
      const s = String(v ?? '').trim();
      if (!s) return true;
      return s.startsWith('$STORE.') ||
        s.startsWith('STORE_') ||
        s.toLowerCase() === 'undefined' ||
        s.toLowerCase() === 'null' ||
        s === '[object Object]';
    }

    _escape(s) {
      return String(s ?? '').replace(/[&<>'"]/g, c => ({
        '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
      }[c]));
    }

    _stateLabel(value) {
      const s = String(value || '').replace(/\s+/g, ' ').trim();
      if (!s || this._isPlaceholder(s)) return '';
      const l = s.toLowerCase();
      if (l.includes('interner termin') || l.includes('interner ter')) return 'Interner Termin';
      if (l.includes('available')) return 'Available';
      if (l.includes('idle')) return 'Idle';
      if (l.includes('rona') || l.includes('not responding')) return 'RONA / Not Responding';
      if (l.includes('wrap')) return 'Wrap-up';
      if (l.includes('ringing') || l.includes('alerting')) return 'Ringing';
      if (l.includes('connected')) return 'Connected';
      if (l.includes('meeting')) return 'Meeting';
      if (l.includes('busy')) return 'Busy';
      if (l.includes('unavailable')) return 'Unavailable';
      return s;
    }

    _isAvailable(label) {
      return String(label || '').trim().toLowerCase() === 'available';
    }

    _row(name) {
      const value = this._bestValue(name);
      const label = this._stateLabel(value);
      const placeholder = !value;
      const cls = placeholder ? 'empty' : (this._isAvailable(label) ? 'available' : 'other');
      const shown = placeholder ? '—' : value;
      const resolved = label && label !== value ? `<span class="resolved">→ ${this._escape(label)}</span>` : '';
      return `<div class="row ${cls}"><span class="name">${this._escape(name)}</span><span class="value">${this._escape(shown)} ${resolved}</span></div>`;
    }

    _readVisibleCiscoTextHint() {
      // Debug only. This is not used for final decision, only to show whether the visible dropdown can be detected.
      try {
        const candidates = [];
        const nodes = Array.from(document.querySelectorAll('body *'));
        for (const el of nodes) {
          if (el === this || (el.closest && el.closest(TAG))) continue;
          const r = el.getBoundingClientRect && el.getBoundingClientRect();
          if (!r || r.top > 100 || r.width < 80 || r.width > 420 || r.height < 14 || r.height > 70) continue;
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity || 1) <= 0) continue;
          const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || '')
            .replace(/\s+/g, ' ').trim();
          if (!text) continue;
          if (/available|interner|rona|not responding|wrap|idle|ringing|connected|meeting|busy|unavailable/i.test(text)) {
            candidates.push(text.slice(0, 120));
          }
        }
        return Array.from(new Set(candidates)).slice(0, 3).join(' || ');
      } catch (e) { return ''; }
    }

    render() {
      const agentName = this._bestValue('agentName') || this._bestValue('displayName') || 'Agent';
      const teamName = this._bestValue('teamName') || 'Team';
      const fields = ['agentState','status','state','currentState','availabilityState','presenceState','agentStatus'];
      const values = Object.fromEntries(fields.map(f => [f, this._bestValue(f)]));
      const hint = this._readVisibleCiscoTextHint();
      const key = JSON.stringify({ agentName, teamName, values, hint });
      if (key === this._last) return;
      this._last = key;

      const anyAvailable = fields.some(f => this._isAvailable(this._stateLabel(values[f])));
      const bg = anyAvailable ? '#E7F7EE' : '#FDECEC';
      const border = anyAvailable ? '#18864B' : '#A0443F';
      const titleBg = anyAvailable ? '#18864B' : '#A0443F';

      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-flex;
            align-items: center;
            height: auto;
            min-width: 520px;
            max-width: 760px;
            margin: 4px 12px 4px 0;
            box-sizing: border-box;
            font-family: CiscoSans, Arial, Helvetica, sans-serif;
            color: #111827;
            vertical-align: middle;
          }
          .card {
            width: 100%;
            border: 2px solid ${border};
            border-radius: 12px;
            background: ${bg};
            box-shadow: 0 2px 8px rgba(0,0,0,.16);
            overflow: hidden;
          }
          .head {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            background: ${titleBg};
            color: #fff;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .dot { width: 9px; height: 9px; border-radius: 99px; background: #fff; }
          .body { padding: 6px 8px 7px; }
          .row {
            display: grid;
            grid-template-columns: 130px 1fr;
            gap: 8px;
            align-items: center;
            min-height: 19px;
            padding: 1px 4px;
            border-radius: 6px;
            font-size: 11px;
            line-height: 15px;
          }
          .row.available { background: rgba(24,134,75,.16); }
          .row.other { background: rgba(160,68,63,.13); }
          .row.empty { opacity: .65; }
          .name { font-weight: 800; color: #374151; }
          .value { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .resolved { margin-left: 6px; font-weight: 800; font-family: CiscoSans, Arial, Helvetica, sans-serif; }
          .hint {
            margin-top: 5px;
            padding-top: 5px;
            border-top: 1px solid rgba(0,0,0,.12);
            font-size: 10px;
            color: #374151;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
        <div class="card">
          <div class="head"><span class="dot"></span><span>${this._escape(agentName)}</span><span>·</span><span>${this._escape(teamName)}</span><span>· STATE DEBUG v11</span></div>
          <div class="body">
            ${fields.map(f => this._row(f)).join('')}
            <div class="hint"><b>visible header hint:</b> ${this._escape(hint || '—')}</div>
          </div>
        </div>
      `;
    }
  }

  if (!customElements.get(TAG)) customElements.define(TAG, SupervisorHeaderWidgetV11Debug);
})();
