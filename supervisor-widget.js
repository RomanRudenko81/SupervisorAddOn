class SupervisorAccessWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.API_URL = "https://wxcc-backend.onrender.com";
    this.ENTRY_POINT_ID = "284cd09a-eef4-40a2-82c6-53d08705e3e3";
    this.POLL_INTERVAL_MS = 5000;

    this.sessionToken = null;
    this.currentRole = "viewer";
    this.isUpdating = false;
    this.isBootstrapping = false;
    this.pollHandle = null;
    this.resolvedIdentity = null;
    this.identitySource = "none";
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
    this.init();
  }

  disconnectedCallback() {
    if (this.pollHandle) clearInterval(this.pollHandle);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin: 0;
          font-family: Arial, sans-serif;
          background: #0b0f1a;
          color: #ffffff;
        }

        .card {
          max-width: 700px;
          margin: 24px auto;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 25px;
          backdrop-filter: blur(10px);
        }

        h2 {
          margin: 0 0 10px 0;
          font-size: 24px;
          font-weight: 700;
          text-transform: uppercase;
        }

        p {
          color: #c9d1d9;
          margin: 0 0 20px 0;
        }

        .info-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 16px;
          font-size: 13px;
          color: #c9d1d9;
        }

        .role-badge {
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.1);
          font-weight: bold;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
        }

        .switch input {
          opacity: 0;
        }

        .slider {
          position: absolute;
          inset: 0;
          background: #3a3f4b;
          border-radius: 26px;
          cursor: pointer;
        }

        .slider:before {
          content: "";
          position: absolute;
          height: 18px;
          width: 18px;
          left: 4px;
          bottom: 4px;
          background: white;
          border-radius: 50%;
          transition: .3s;
        }

        input:checked + .slider {
          background: #22c55e;
        }

        input:checked + .slider:before {
          transform: translateX(22px);
        }

        .row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 15px;
        }

        input {
          flex: 1;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(0,0,0,0.35);
          color: white;
        }

        button {
          padding: 10px 14px;
          border: none;
          border-radius: 10px;
          background: #0078d4;
          color: white;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.5;
        }

        #status {
          margin-top: 12px;
          font-size: 13px;
          color: #c9d1d9;
        }
      </style>

      <div class="card">
        <h2>Supervisor Access Control</h2>
        <p>Conscia Support Demo</p>

        <div class="info-row">
          <span id="userInfo">Loading...</span>
          <span id="roleBadge">...</span>
        </div>

        <div class="row">
          <label class="switch">
            <input type="checkbox" id="emergencyToggle">
            <span class="slider"></span>
          </label>
          <span>Emergency Case: <span id="stateLabel">OFF</span></span>
        </div>

        <div class="row">
          <input id="prompt" placeholder="Enter emergency prompt...">
          <button id="saveBtn">Save</button>
        </div>

        <div id="status"></div>
      </div>
    `;
  }

  bindEvents() {
    this.$toggle().addEventListener("change", () => {
      this.updateLabel();
      this.saveState();
    });

    this.$saveBtn().addEventListener("click", () => {
      this.saveState();
    });
  }

  async init() {
    await this.bootstrapSession();
    await this.loadEntryPoint();
    this.startPolling();
  }

  setStatus(msg, type = "info") {
    const el = this.shadowRoot.getElementById("status");
    const colors = {
      info: "#c9d1d9",
      success: "#22c55e",
      error: "#ef4444"
    };
    el.style.color = colors[type];
    el.textContent = msg;
  }

  $userInfo() { return this.shadowRoot.getElementById("userInfo"); }
  $roleBadge() { return this.shadowRoot.getElementById("roleBadge"); }
  $toggle() { return this.shadowRoot.getElementById("emergencyToggle"); }
  $prompt() { return this.shadowRoot.getElementById("prompt"); }
  $saveBtn() { return this.shadowRoot.getElementById("saveBtn"); }
  $stateLabel() { return this.shadowRoot.getElementById("stateLabel"); }

  async resolveDesktopIdentity() {
    return {
      email: this.email || "",
      userId: this.userId || "",
      teamId: this.teamId || "",
      displayName: this.displayName || "Unknown User"
    };
  }

  async bootstrapSession() {
    const identity = await this.resolveDesktopIdentity();

    const res = await fetch(`${this.API_URL}/api/session/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity)
    });

    const data = await res.json();

    this.sessionToken = data.sessionToken;
    this.currentRole = data.role;

    this.$userInfo().textContent = data.user.displayName;
    this.$roleBadge().textContent = this.currentRole.toUpperCase();

    const writable = ["supervisor", "admin"].includes(this.currentRole);
    this.$toggle().disabled = !writable;
    this.$prompt().disabled = !writable;
    this.$saveBtn().disabled = !writable;
  }

  async authorizedFetch(path, options = {}) {
    return fetch(`${this.API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${this.sessionToken}`
      }
    });
  }

  async loadEntryPoint() {
    const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`);
    const data = await res.json();

    this.$toggle().checked = data.emergencyCase;
    this.$prompt().value = data.emergencyPrompt;
    this.updateLabel();
  }

  updateLabel() {
    this.$stateLabel().innerText = this.$toggle().checked ? "ON" : "OFF";
  }

  async saveState() {
    this.setStatus("Saving...", "info");
    this.$saveBtn().disabled = true;

    try {
      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          EmergencyCase: this.$toggle().checked,
          EmergencyPrompt: this.$prompt().value
        })
      });

      if (!res.ok) throw new Error();

      this.setStatus("Saved successfully", "success");
    } catch {
      this.setStatus("Update failed", "error");
    } finally {
      this.$saveBtn().disabled = false;
    }
  }

  startPolling() {
    this.pollHandle = setInterval(() => {
      if (!this.isUpdating) this.loadEntryPoint();
    }, this.POLL_INTERVAL_MS);
  }
}

customElements.define("supervisor-access-widget-v2", SupervisorAccessWidget);
