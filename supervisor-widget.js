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
    this.storeSnapshot = null;

    this.lastBootstrapResponse = null;
    this.lastEntryPointResponse = null;
    this.lastUpdateResponse = null;
    this.lastError = null;
    this.lastStatus = null;
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
        }

        input[type="text"] {
          flex: 1;
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
        }

        .small-btn:hover {
          background: #0a5ea8;
        }

        .small-btn[disabled],
        input[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        pre {
          margin-top: 20px;
          background: #0a0f1a;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          color: #00ff88;
          overflow-x: auto;
          white-space: pre-wrap;
          word-break: break-word;
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
            Emergency Case: <span id="stateLabel">OFF</span>
          </span>
        </div>

        <div class="row">
          <div class="input-group">
            <input id="prompt" type="text" placeholder="Enter emergency prompt...">
            <button class="small-btn" id="saveBtn">Save</button>
          </div>
        </div>

        <pre id="output">Loading...</pre>
      </div>
    `;
  }

  bindEvents() {
    this.$toggle().addEventListener("change", async () => {
      this.updateLabel();
      await this.saveState("Updating toggle...");
    });

    this.$saveBtn().addEventListener("click", async () => {
      await this.saveState("Saving prompt...");
    });
  }

  async init() {
    try {
      await this.bootstrapSession();
      await this.loadEntryPoint(true);
      this.startPolling();
    } catch (err) {
      this.lastError = {
        stage: "init",
        message: err.message
      };
      this.renderDebugInfo();
    }
  }

  $userInfo() { return this.shadowRoot.getElementById("userInfo"); }
  $roleBadge() { return this.shadowRoot.getElementById("roleBadge"); }
  $toggle() { return this.shadowRoot.getElementById("emergencyToggle"); }
  $prompt() { return this.shadowRoot.getElementById("prompt"); }
  $saveBtn() { return this.shadowRoot.getElementById("saveBtn"); }
  $stateLabel() { return this.shadowRoot.getElementById("stateLabel"); }
  $output() { return this.shadowRoot.getElementById("output"); }

  setOutput(payload) {
    this.$output().textContent = JSON.stringify(payload, null, 2);
  }

  renderDebugInfo(extra = {}) {
    this.setOutput({
      identitySource: this.identitySource,
      localIdentity: this.resolvedIdentity || {
        email: "",
        userId: "",
        teamId: "",
        displayName: ""
      },
      storeSnapshot: this.storeSnapshot || null,
      currentRole: this.currentRole,
      hasSessionToken: Boolean(this.sessionToken),
      lastStatus: this.lastStatus,
      lastError: this.lastError,
      bootstrapResponse: this.lastBootstrapResponse,
      entryPointResponse: this.lastEntryPointResponse,
      updateResponse: this.lastUpdateResponse,
      ...extra
    });
  }

  async resolveDesktopIdentity() {
    try {
      const store = window?.$STORE || {};

      const snapshot = {
        topLevelKeys: Object.keys(store || {}),
        agent: store?.agent || null,
        app: store?.app || null,
        userProfile: store?.userProfile || null,
        agentProfile: store?.agentProfile || null
      };

      const identity = {
        email:
          store?.agent?.agentProfile?.email ||
          store?.agentProfile?.email ||
          store?.app?.userProfile?.email ||
          store?.userProfile?.email ||
          store?.agent?.email ||
          "",
        userId:
          store?.agent?.agentProfile?.id ||
          store?.agentProfile?.id ||
          store?.app?.userProfile?.id ||
          store?.userProfile?.id ||
          store?.agent?.id ||
          "",
        teamId:
          store?.agent?.agentProfile?.teamId ||
          store?.agentProfile?.teamId ||
          store?.agent?.teamId ||
          "",
        displayName:
          store?.agent?.agentProfile?.displayName ||
          store?.agentProfile?.displayName ||
          store?.app?.userProfile?.displayName ||
          store?.userProfile?.displayName ||
          store?.agent?.agentName ||
          store?.agent?.name ||
          ""
      };

      this.resolvedIdentity = identity;
      this.identitySource = "wxcc-store";
      this.storeSnapshot = snapshot;

      return identity;
    } catch (error) {
      this.identitySource = "wxcc-store-failed";
      this.resolvedIdentity = {
        email: "",
        userId: "",
        teamId: "",
        displayName: ""
      };
      this.storeSnapshot = {
        storeError: error.message
      };
      return this.resolvedIdentity;
    }
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
      this.lastStatus = {
        stage: "bootstrap",
        message: "Bootstrapping session"
      };
      this.renderDebugInfo();

      const res = await fetch(`${this.API_URL}/api/session/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(identity)
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) {
        this.lastError = {
          stage: "bootstrap",
          httpStatus: res.status,
          data
        };
        this.renderDebugInfo();
        throw new Error(data.error || "Session bootstrap failed");
      }

      if (!data.sessionToken) {
        this.lastError = {
          stage: "bootstrap",
          message: "Bootstrap response did not include a session token"
        };
        this.renderDebugInfo();
        throw new Error("Bootstrap response did not include a session token");
      }

      this.sessionToken = data.sessionToken;
      this.currentRole = data.role || "viewer";
      this.lastBootstrapResponse = data;
      this.lastError = null;
      this.lastStatus = {
        stage: "bootstrap",
        message: "Session bootstrapped"
      };

      this.$userInfo().textContent =
        `${data.user?.displayName || "Unknown User"}${data.user?.email ? " (" + data.user.email + ")" : ""}`;
      this.$roleBadge().textContent = this.currentRole.toUpperCase();

      this.applyRoleState();
      this.renderDebugInfo();
    } finally {
      this.isBootstrapping = false;
    }
  }

  applyRoleState() {
    const writable = this.currentRole === "supervisor" || this.currentRole === "admin";

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

  async loadEntryPoint(updateOutput = true) {
    try {
      this.lastStatus = {
        stage: "loadEntryPoint",
        message: "Loading entry point"
      };
      if (updateOutput) {
        this.renderDebugInfo();
      }

      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`);
      const data = await this.readJsonResponse(res);

      if (!res.ok) {
        this.lastError = {
          stage: "loadEntryPoint",
          httpStatus: res.status,
          data
        };
        this.renderDebugInfo();
        throw new Error(data.error || "Load failed");
      }

      const emergencyCase =
        typeof data.emergencyCase === "boolean" ? data.emergencyCase : false;
      const emergencyPrompt =
        typeof data.emergencyPrompt === "string" ? data.emergencyPrompt : "";

      this.$toggle().checked = emergencyCase;
      this.updateLabel();
      this.$prompt().value = emergencyPrompt;

      this.lastEntryPointResponse = data;
      this.lastError = null;
      this.lastStatus = {
        stage: "loadEntryPoint",
        message: "Entry point loaded"
      };

      if (updateOutput) {
        this.renderDebugInfo();
      }
    } catch (err) {
      this.lastError = {
        stage: "loadEntryPoint",
        message: err.message
      };
      this.renderDebugInfo();
    }
  }

  updateLabel() {
    const state = this.$toggle().checked;
    this.$stateLabel().innerText = state ? "ON" : "OFF";
  }

  async saveState(statusText) {
    const EmergencyCase = this.$toggle().checked;
    const EmergencyPrompt = this.$prompt().value;

    try {
      this.isUpdating = true;
      this.lastStatus = {
        stage: "saveState",
        message: statusText,
        payload: {
          EmergencyCase,
          EmergencyPrompt
        }
      };
      this.renderDebugInfo();

      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ EmergencyCase, EmergencyPrompt })
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) {
        this.lastError = {
          stage: "saveState",
          httpStatus: res.status,
          data,
          payload: {
            EmergencyCase,
            EmergencyPrompt
          }
        };
        this.renderDebugInfo();
        throw new Error(data.error || "Update failed");
      }

      this.lastUpdateResponse = data;
      this.lastError = null;
      this.lastStatus = {
        stage: "saveState",
        message: "Update successful",
        payload: {
          EmergencyCase,
          EmergencyPrompt
        }
      };
      this.renderDebugInfo();

      await this.loadEntryPoint(false);
      this.renderDebugInfo();
    } catch (err) {
      this.lastError = {
        stage: "saveState",
        message: err.message,
        payload: {
          EmergencyCase,
          EmergencyPrompt
        }
      };
      this.renderDebugInfo();
    } finally {
      this.isUpdating = false;
    }
  }

  startPolling() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }

    this.pollHandle = setInterval(async () => {
      if (this.isUpdating || this.isBootstrapping) return;
      await this.loadEntryPoint(false);
    }, this.POLL_INTERVAL_MS);
  }
}

customElements.define("supervisor-access-widget", SupervisorAccessWidget);
