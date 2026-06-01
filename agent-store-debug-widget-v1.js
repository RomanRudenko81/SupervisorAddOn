class AgentStoreDebugWidgetV1 extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._props = {};
  }

  static get observedAttributes() {
    return [
      "agentid",
      "agentname",
      "agentstate",
      "state",
      "status",
      "teamid",
      "teamname",
      "loginid",
      "email",
      "darkmode"
    ];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this._props[name] = newValue;
      this.render();
    }
  }

  set agentId(value) { this._props.agentid = value; this.render(); }
  get agentId() { return this._props.agentid; }

  set agentName(value) { this._props.agentname = value; this.render(); }
  get agentName() { return this._props.agentname; }

  set agentState(value) { this._props.agentstate = value; this.render(); }
  get agentState() { return this._props.agentstate; }

  set state(value) { this._props.state = value; this.render(); }
  get state() { return this._props.state; }

  set status(value) { this._props.status = value; this.render(); }
  get status() { return this._props.status; }

  set teamId(value) { this._props.teamid = value; this.render(); }
  get teamId() { return this._props.teamid; }

  set teamName(value) { this._props.teamname = value; this.render(); }
  get teamName() { return this._props.teamname; }

  set loginId(value) { this._props.loginid = value; this.render(); }
  get loginId() { return this._props.loginid; }

  set email(value) { this._props.email = value; this.render(); }
  get email() { return this._props.email; }

  set darkMode(value) { this._props.darkmode = value; this.render(); }
  get darkMode() { return this._props.darkmode; }

  getValue(key) {
    const value = this._props[key];
    if (value === undefined || value === null || value === "") return "-";
    if (typeof value === "object") {
      try { return JSON.stringify(value); } catch { return String(value); }
    }
    return String(value);
  }

  render() {
    if (!this.shadowRoot) return;

    const dark = String(this.getValue("darkmode")).toLowerCase() === "true";
    const rows = [
      ["agentName", this.getValue("agentname")],
      ["agentId", this.getValue("agentid")],
      ["agentState", this.getValue("agentstate")],
      ["state", this.getValue("state")],
      ["status", this.getValue("status")],
      ["teamName", this.getValue("teamname")],
      ["teamId", this.getValue("teamid")],
      ["loginId", this.getValue("loginid")],
      ["email", this.getValue("email")]
    ];

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          display: inline-flex;
          align-items: center;
          max-width: 760px;
          font-family: Arial, Helvetica, sans-serif;
          box-sizing: border-box;
        }

        .box {
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: 760px;
          padding: 5px 8px;
          border-radius: 10px;
          border: 1px solid ${dark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)"};
          background: ${dark ? "rgba(15,23,42,0.82)" : "rgba(255,255,255,0.92)"};
          color: ${dark ? "#ffffff" : "#111827"};
          font-size: 11px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          box-sizing: border-box;
        }

        .title {
          font-weight: 700;
          color: ${dark ? "#93c5fd" : "#1d4ed8"};
          margin-right: 2px;
        }

        .item {
          display: inline-flex;
          gap: 3px;
          align-items: center;
          min-width: 0;
        }

        .key {
          opacity: 0.65;
        }

        .value {
          font-weight: 700;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .empty {
          opacity: 0.45;
          font-weight: 400;
        }
      </style>

      <div class="box" title="${rows.map(([k, v]) => `${k}: ${v}`).join("\n").replace(/"/g, "&quot;")}">
        <span class="title">STORE DEBUG</span>
        ${rows.map(([key, value]) => `
          <span class="item">
            <span class="key">${key}:</span>
            <span class="value ${value === "-" ? "empty" : ""}">${this.escapeHtml(value)}</span>
          </span>
        `).join("")}
      </div>
    `;
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

if (!customElements.get("agent-store-debug-widget-v1")) {
  customElements.define("agent-store-debug-widget-v1", AgentStoreDebugWidgetV1);
}
