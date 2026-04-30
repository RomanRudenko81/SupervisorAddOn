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
    this.hasUnsavedChanges = false;
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
    this.init();
  }

  disconnectedCallback() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          width: 100%;
          min-height: 100%;
          box-sizing: border-box;
          padding: clamp(8px, 2vw, 24px);
          font-family: inherit, Arial, sans-serif;
          color: #ffffff;
        }

        * {
          box-sizing: border-box;
          font-family: inherit, Arial, sans-serif;
        }

        .card {
          width: clamp(360px, 52vw, 900px);
          max-width: calc(100vw - 32px);
          margin: 0 auto;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: clamp(16px, 2vw, 25px);
          backdrop-filter: blur(10px);
        }

        h2 {
          margin: 0 0 10px 0;
          font-size: clamp(18px, 1.6vw, 24px);
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
          gap: 12px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #c9d1d9;
          flex-wrap: wrap;
        }

        .role-badge {
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(255,255,255,0.1);
          color: #fff;
          font-weight: bold;
        }

        .switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
          flex: 0 0 auto;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: #3a3f4b;
          transition: .3s;
          border-radius: 26px;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }

        input:checked + .slider {
          background-color: #22c55e;
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

        .input-group {
          display: flex;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }

        input[type="text"] {
          flex: 1;
          min-width: 0;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(0,0,0,0.35);
          color: white;
          outline: none;
        }

        .small-btn {
          padding: 10px 14px;
          border: none;
          border-radius: 10px;
          background: #0078d4;
          color: white;
          font-size: 13px;
          cursor: pointer;
          width: auto;
          flex: 0 0 auto;
        }

        .small-btn:hover {
          background: #0a5ea8;
        }

        .small-btn[disabled],
        input[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        #status {
          margin-top: 12px;
          font-size: 13px;
          color: #c9d1d9;
          min-height: 18px;
        }

        @media (max-width: 640px) {
          :host {
            padding: 8px;
          }

          .card {
            width: 100%;
            max-width: 100%;
          }

          .input-group {
            flex-direction: column;
          }

          .small-btn {
            width: 100%;
          }
        }
      </style>

      <div class="card">
        <h2>Supervisor Access Control</h2>
        <p>Conscia Support Demo</p>

        <div class="info-row">
          <span id="userInfo">Loading user context...</span>
          <span id="roleBadge" class="role-badge">...</span>
        </div>

        <div class="row">
          <label class="switch">
            <input type="checkbox" id="emergencyToggle">
            <span class="slider"></span>
          </label>

          <span>
            Emergency Mode: <span id="stateLabel">OFF</span>
          </span>
        </div>

        <div class="row">
          <div class="input-group">
            <input id="prompt" type="text" placeholder="Enter emergency prompt...">
            <button class="small-btn" id="saveBtn">Save</button>
          </div>
        </div>

        <div id="status"></div>
      </div>
    `;
  }

  bindEvents() {
    this.$toggle().addEventListener("change", () => {
      this.hasUnsavedChanges = true;
      this.updateLabel();
      this.setStatus("Unsaved changes", "info");
    });

    this.$prompt().addEventListener("input", () => {
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$saveBtn().addEventListener("click", async () => {
      await this.saveState();
    });
  }

  async init() {
    try {
      await this.bootstrapSession();
      await this.loadEntryPoint(true);
      this.startPolling();
      this.setStatus("Ready", "info");
    } catch (err) {
      this.setStatus(`Load failed: ${err.message}`, "error");
    }
  }

  $userInfo() { return this.shadowRoot.getElementById("userInfo"); }
  $roleBadge() { return this.shadowRoot.getElementById("roleBadge"); }
  $toggle() { return this.shadowRoot.getElementById("emergencyToggle"); }
  $prompt() { return this.shadowRoot.getElementById("prompt"); }
  $saveBtn() { return this.shadowRoot.getElementById("saveBtn"); }
  $stateLabel() { return this.shadowRoot.getElementById("stateLabel"); }
  $status() { return this.shadowRoot.getElementById("status"); }

  setStatus(message, type = "info") {
    const colors = {
      info: "#c9d1d9",
      success: "#22c55e",
      error: "#ef4444"
    };

    const el = this.$status();
    el.style.color = colors[type] || colors.info;
    el.textContent = message || "";
  }

  async resolveDesktopIdentity() {
    const identity = {
      email: this.email || "",
      userId: this.userId || "",
      teamId: this.teamId || "",
      displayName: this.displayName || "Unknown User"
    };

    this.identitySource = "layout-properties";
    this.resolvedIdentity = identity;

    return identity;
  }

  async readJsonResponse(res) {
    const text = await res.text();

    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  }

  async bootstrapSession() {
    if (this.isBootstrapping) return;
    this.isBootstrapping = true;

    try {
      const identity = await this.resolveDesktopIdentity();

      const res = await fetch(`${this.API_URL}/api/session/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(identity)
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      if (!data.sessionToken) {
        throw new Error("Bootstrap response did not include a session token");
      }

      this.sessionToken = data.sessionToken;
      this.currentRole = data.role || "viewer";

      this.$userInfo().textContent = data.user?.displayName || "Unknown User";
      this.$userInfo().title = data.user?.email || data.user?.userId || "";

      const roleMap = {
        admin: "Admin",
        supervisor: "Supervisor",
        viewer: "Viewer"
      };

      this.$roleBadge().textContent = roleMap[this.currentRole] || "Viewer";

      this.applyRoleState();
    } finally {
      this.isBootstrapping = false;
    }
  }

  applyRoleState() {
    const writable = ["supervisor", "admin"].includes(this.currentRole);

    this.$toggle().disabled = !writable;
    this.$prompt().disabled = !writable;
    this.$saveBtn().disabled = !writable;
  }

  async authorizedFetch(path, options = {}, retryOn401 = true) {
    if (!this.sessionToken) {
      await this.bootstrapSession();
    }

    const makeRequest = async () =>
      fetch(`${this.API_URL}${path}`, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${this.sessionToken}`
        }
      });

    let res = await makeRequest();

    if (res.status === 401 && retryOn401) {
      await this.bootstrapSession();
      res = await makeRequest();
    }

    return res;
  }

  async loadEntryPoint(force = false) {
    if (!force && (this.isUpdating || this.hasUnsavedChanges || this.shadowRoot.activeElement === this.$prompt())) {
      return;
    }

    const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`);
    const data = await this.readJsonResponse(res);

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const emergencyCase = typeof data.emergencyCase === "boolean" ? data.emergencyCase : false;
    const emergencyPrompt = typeof data.emergencyPrompt === "string" ? data.emergencyPrompt : "";

    this.$toggle().checked = emergencyCase;
    this.$prompt().value = emergencyPrompt;
    this.updateLabel();

    this.hasUnsavedChanges = false;
  }

  updateLabel() {
    this.$stateLabel().innerText = this.$toggle().checked ? "ON" : "OFF";
  }

  async saveState() {
    if (!["supervisor", "admin"].includes(this.currentRole)) {
      this.setStatus("No write permission", "error");
      return;
    }

    const EmergencyCase = this.$toggle().checked;
    const EmergencyPrompt = this.$prompt().value;

    try {
      this.isUpdating = true;
      this.$saveBtn().disabled = true;
      this.setStatus("Saving...", "info");

      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ EmergencyCase, EmergencyPrompt })
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      this.hasUnsavedChanges = false;
      await this.loadEntryPoint(true);
      this.setStatus("Saved successfully ✔", "success");
    } catch (err) {
      this.setStatus(`Update failed ❌ ${err.message || ""}`.trim(), "error");
    } finally {
      this.isUpdating = false;
      this.applyRoleState();
    }
  }

  startPolling() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }

    this.pollHandle = setInterval(async () => {
      try {
        await this.loadEntryPoint(false);
      } catch {
        this.setStatus("Refresh failed", "error");
      }
    }, this.POLL_INTERVAL_MS);
  }
}

customElements.define("supervisor-access-widget-v2", SupervisorAccessWidget);
