class SupervisorAccessWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.API_URL = "https://wxcc-backend.onrender.com";
    this.ENTRY_POINT_ID = "284cd09a-eef4-40a2-82c6-53d08705e3e3";
    this.POLL_INTERVAL_MS = 5000;
    this.WALLBOARD_POLL_INTERVAL_MS = 10000;

    this.sessionToken = null;
    this.currentRole = "viewer";
    this.isUpdating = false;
    this.isBootstrapping = false;
    this.pollHandle = null;
    this.wallboardPollHandle = null;
    this.resolvedIdentity = null;
    this.identitySource = "none";
    this.hasUnsavedChanges = false;
    this.themeMode = localStorage.getItem("supervisorWidgetTheme") || "light";
  }

  connectedCallback() {
    this.render();
    this.applyTheme();
    this.populateStaticOptions();
    this.bindEvents();
    this.init();
  }

  disconnectedCallback() {
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.wallboardPollHandle) clearInterval(this.wallboardPollHandle);
  }

  applyTheme() {
    this.classList.toggle("theme-dark", this.themeMode === "dark");
    this.classList.toggle("theme-light", this.themeMode !== "dark");

    const themeBtn = this.shadowRoot.getElementById("themeToggleBtn");
    if (themeBtn) {
      themeBtn.textContent = this.themeMode === "dark" ? "Theme: Dark" : "Theme: Light";
    }
  }

  toggleTheme() {
    this.themeMode = this.themeMode === "dark" ? "light" : "dark";
    localStorage.setItem("supervisorWidgetTheme", this.themeMode);
    this.applyTheme();
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

          --widget-bg: rgba(255,255,255,0.18);
          --widget-border: rgba(0,0,0,0.055);
          --widget-text: #1f2937;
          --widget-muted: #4b5563;
          --widget-input-bg: rgba(255,255,255,0.72);
          --widget-input-border: rgba(0,0,0,0.16);
          --widget-badge-bg: rgba(0,0,0,0.08);
          --widget-switch-bg: #6b7280;
          --widget-blur: blur(8px);
          color: var(--widget-text);
        }

        :host(.theme-dark) {
          --widget-bg: rgba(8,12,20,0.24);
          --widget-border: rgba(255,255,255,0.065);
          --widget-text: #ffffff;
          --widget-muted: rgba(255,255,255,0.86);
          --widget-input-bg: rgba(255,255,255,0.12);
          --widget-input-border: rgba(255,255,255,0.18);
          --widget-badge-bg: rgba(255,255,255,0.14);
          --widget-switch-bg: #3a3f4b;
          --widget-blur: blur(10px);
        }

        * {
          box-sizing: border-box;
          font-family: inherit, Arial, sans-serif;
        }

        .card {
          width: clamp(360px, 72vw, 1200px);
          max-width: calc(100vw - 32px);
          margin: 0 auto;
          background: var(--widget-bg);
          border: 1px solid var(--widget-border);
          border-radius: 14px;
          padding: clamp(16px, 2vw, 25px);
          backdrop-filter: var(--widget-blur);
          -webkit-backdrop-filter: var(--widget-blur);
          color: var(--widget-text);
        }

        .card,
        .card * {
          color: var(--widget-text);
        }

        .field label,
        .subtext,
        #status,
        #wallboardStatus,
        .kpi-label {
          color: var(--widget-muted);
        }

        input[type="text"],
        select {
          color: var(--widget-text) !important;
        }

        .header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 24px;
        }

        .header-left,
        .header-right {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .header-right {
          align-items: flex-end;
          text-align: right;
        }

        .header-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        h2 {
          margin: 0;
          font-size: clamp(20px, 1.8vw, 28px);
          font-weight: 700;
          text-transform: uppercase;
        }

        .subtext {
          font-size: 13px;
        }

        .role-badge,
        .theme-btn {
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--widget-badge-bg);
          font-size: 13px;
        }

        .role-badge {
          font-weight: bold;
        }

        .theme-btn {
          border: 1px solid var(--widget-border);
          cursor: pointer;
          font-size: 12px;
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
          background-color: var(--widget-switch-bg);
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

        .categories {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: clamp(20px, 3vw, 48px);
          margin-top: 24px;
        }

        .category {
          min-width: 0;
        }

        .category h3,
        .wallboard h3 {
          margin: 0 0 16px 0;
          font-size: 21px;
          font-weight: 700;
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 15px;
        }

        .field label {
          font-size: 13px;
        }

        input[type="text"],
        select {
          width: 100%;
          min-width: 0;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--widget-input-border);
          background: var(--widget-input-bg);
          outline: none;
        }

        input[type="text"]::placeholder {
          color: var(--widget-muted);
        }

        .small-btn {
          padding: 10px 14px;
          border: none;
          border-radius: 10px;
          background: #0078d4;
          color: white !important;
          font-size: 13px;
          cursor: pointer;
          width: auto;
          flex: 0 0 auto;
        }

        .small-btn:hover {
          background: #0a5ea8;
        }

        .small-btn[disabled],
        input[disabled],
        select[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .wallboard {
          margin-top: 32px;
        }

        .kpis {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 12px;
        }

        .kpi {
          padding: 12px;
          border-radius: 12px;
          background: var(--widget-badge-bg);
        }

        .kpi-label {
          font-size: 12px;
        }

        .kpi-value {
          margin-top: 6px;
          font-size: 24px;
          font-weight: 700;
        }

        .agent-list {
          margin-top: 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .agent-row {
          display: grid;
          grid-template-columns: 1.4fr 1fr 1fr 1fr;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid var(--widget-border);
          font-size: 13px;
        }

        .agent-row.header-row {
          color: var(--widget-muted);
          font-weight: 700;
        }

        #status,
        #wallboardStatus {
          margin-top: 12px;
          font-size: 13px;
          min-height: 18px;
        }

        @media (max-width: 1100px) {
          .kpis {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }

        @media (max-width: 900px) {
          .categories {
            grid-template-columns: 1fr;
          }

          .agent-row {
            grid-template-columns: 1fr;
          }

          .kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          :host {
            padding: 8px;
          }

          .card {
            width: 100%;
            max-width: 100%;
          }

          .header {
            flex-direction: column;
          }

          .header-right {
            align-items: flex-start;
            text-align: left;
          }

          .header-actions {
            justify-content: flex-start;
          }

          .kpis {
            grid-template-columns: 1fr;
          }

          .small-btn {
            width: 100%;
          }
        }
      </style>

      <div class="card">
        <div class="header">
          <div class="header-left">
            <h2>Supervisor Access Control</h2>
            <span id="userInfo" class="subtext">Loading user context...</span>
          </div>

          <div class="header-right">
            <h2>Conscia Demo Support</h2>
            <div class="header-actions">
              <button class="theme-btn" id="themeToggleBtn" type="button">Theme: Light</button>
              <span id="roleBadge" class="role-badge">...</span>
            </div>
          </div>
        </div>

        <div class="row">
          <label class="switch">
            <input type="checkbox" id="emergencyToggle">
            <span class="slider"></span>
          </label>
          <span>Emergency Mode: <span id="stateLabel">OFF</span></span>
        </div>

        <div class="categories">
          <div class="category">
            <h3>Prompts</h3>

            <div class="field">
              <label for="emergencyPrompt">Emergency Prompt</label>
              <input id="emergencyPrompt" type="text" placeholder="Enter emergency prompt...">
            </div>

            <div class="field">
              <label for="holidayPrompt">Holiday Prompt</label>
              <input id="holidayPrompt" type="text" placeholder="Enter holiday prompt...">
            </div>
          </div>

          <div class="category">
            <h3>Language Settings</h3>

            <div class="field">
              <label for="globalLanguage">Global Language</label>
              <select id="globalLanguage"></select>
            </div>

            <div class="field">
              <label for="globalVoiceName">Global Voice Name</label>
              <select id="globalVoiceName"></select>
            </div>
          </div>

          <div class="category">
            <h3>Queue Settings</h3>

            <div class="field">
              <label for="priorityQueue">Prio Queue</label>
              <select id="priorityQueue"></select>
            </div>

            <div class="field">
              <label for="mohSalesQueue">MoH Sales Queue</label>
              <input id="mohSalesQueue" type="text" placeholder="Enter MoH Sales Queue text...">
            </div>
          </div>
        </div>

        <div class="row">
          <button class="small-btn" id="saveBtn">Save</button>
        </div>

        <div id="status"></div>

        <div class="wallboard">
          <h3>Wallboard</h3>

          <div class="kpis">
            <div class="kpi">
              <div class="kpi-label">Calls in Queue</div>
              <div class="kpi-value" id="kpiCallsInQueue">0</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Active Calls</div>
              <div class="kpi-value" id="kpiActiveCalls">0</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Longest Waiting</div>
              <div class="kpi-value" id="kpiLongestWaiting">0s</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Avg Wait</div>
              <div class="kpi-value" id="kpiAvgWait">0s</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Avg Handle</div>
              <div class="kpi-value" id="kpiAvgHandle">0s</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Logged-in Agents</div>
              <div class="kpi-value" id="kpiLoggedIn">0</div>
            </div>

            <div class="kpi">
              <div class="kpi-label">Available Agents</div>
              <div class="kpi-value" id="kpiAvailable">0</div>
            </div>
          </div>

          <div class="agent-list" id="agentList">
            <div class="agent-row header-row">
              <div>Name</div>
              <div>Status</div>
              <div>Team</div>
              <div>Active Since</div>
            </div>
          </div>

          <div id="wallboardStatus">Loading wallboard...</div>
        </div>
      </div>
    `;
  }

  populateStaticOptions() {
    this.setSelectOptions(
      this.$priorityQueue(),
      Array.from({ length: 10 }, (_, i) => String(i + 1))
    );

    this.setSelectOptions(this.$globalLanguage(), ["de-DE", "en-US"]);
    this.updateVoiceOptions();
  }

  setSelectOptions(selectElement, values) {
    selectElement.innerHTML = "";

    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      selectElement.appendChild(option);
    });
  }

  bindEvents() {
    this.$themeToggleBtn().addEventListener("click", () => this.toggleTheme());

    this.$toggle().addEventListener("change", () => {
      this.hasUnsavedChanges = true;
      this.updateLabel();
      this.setStatus("Unsaved changes", "info");
    });

    this.$priorityQueue().addEventListener("change", () => {
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$emergencyPrompt().addEventListener("input", () => {
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$holidayPrompt().addEventListener("input", () => {
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$globalLanguage().addEventListener("change", () => {
      this.updateVoiceOptions();
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$globalVoiceName().addEventListener("change", () => {
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$mohSalesQueue().addEventListener("input", () => {
      this.hasUnsavedChanges = true;
      this.setStatus("Unsaved changes", "info");
    });

    this.$saveBtn().addEventListener("click", async () => await this.saveState());
  }

  async init() {
    try {
      await this.bootstrapSession();
      await this.loadEntryPoint(true);
      await this.loadWallboard();
      this.startPolling();
      this.startWallboardPolling();
      this.setStatus("Ready", "info");
    } catch (err) {
      this.setStatus(`Load failed: ${err.message}`, "error");
    }
  }

  $userInfo() { return this.shadowRoot.getElementById("userInfo"); }
  $roleBadge() { return this.shadowRoot.getElementById("roleBadge"); }
  $themeToggleBtn() { return this.shadowRoot.getElementById("themeToggleBtn"); }
  $toggle() { return this.shadowRoot.getElementById("emergencyToggle"); }
  $priorityQueue() { return this.shadowRoot.getElementById("priorityQueue"); }
  $emergencyPrompt() { return this.shadowRoot.getElementById("emergencyPrompt"); }
  $holidayPrompt() { return this.shadowRoot.getElementById("holidayPrompt"); }
  $globalLanguage() { return this.shadowRoot.getElementById("globalLanguage"); }
  $globalVoiceName() { return this.shadowRoot.getElementById("globalVoiceName"); }
  $mohSalesQueue() { return this.shadowRoot.getElementById("mohSalesQueue"); }
  $saveBtn() { return this.shadowRoot.getElementById("saveBtn"); }
  $stateLabel() { return this.shadowRoot.getElementById("stateLabel"); }
  $status() { return this.shadowRoot.getElementById("status"); }

  setStatus(message, type = "info") {
    const colors = {
      info: "var(--widget-muted)",
      success: "#22c55e",
      error: "#ef4444"
    };

    const el = this.$status();
    el.style.color = colors[type] || colors.info;
    el.textContent = message || "";
  }

  setWallboardStatus(message) {
    const el = this.shadowRoot.getElementById("wallboardStatus");
    if (el) el.textContent = message || "";
  }

  getVoiceOptions(language) {
    if (language === "en-US") return ["en-US-Daniel", "en-US-Maria"];
    return ["de-DE-Jonas", "de-DE-Emma"];
  }

  updateVoiceOptions(selectedVoice = "") {
    const language = this.$globalLanguage().value || "de-DE";
    const options = this.getVoiceOptions(language);
    const voiceSelect = this.$globalVoiceName();
    const currentValue = selectedVoice || voiceSelect.value;

    this.setSelectOptions(voiceSelect, options);

    if (currentValue && options.includes(currentValue)) {
      voiceSelect.value = currentValue;
    } else {
      voiceSelect.value = options[0];
    }
  }

  getOverrideValue(overrides, name, fallback = "") {
    const item = overrides.find(o => o.name === name);
    return item?.value ?? fallback;
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity)
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.sessionToken) throw new Error("Bootstrap response did not include a session token");

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
    this.$priorityQueue().disabled = !writable;
    this.$emergencyPrompt().disabled = !writable;
    this.$holidayPrompt().disabled = !writable;
    this.$globalLanguage().disabled = !writable;
    this.$globalVoiceName().disabled = !writable;
    this.$mohSalesQueue().disabled = !writable;
    this.$saveBtn().disabled = !writable;
  }

  async authorizedFetch(path, options = {}, retryOn401 = true) {
    if (!this.sessionToken) await this.bootstrapSession();

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
    if (!force && (
      this.isUpdating ||
      this.hasUnsavedChanges ||
      this.shadowRoot.activeElement === this.$emergencyPrompt() ||
      this.shadowRoot.activeElement === this.$holidayPrompt() ||
      this.shadowRoot.activeElement === this.$mohSalesQueue()
    )) {
      return;
    }

    const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`);
    const data = await this.readJsonResponse(res);

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const overrides = Array.isArray(data.flowOverrideSettings) ? data.flowOverrideSettings : [];

    const priorityQueue = this.getOverrideValue(overrides, "Priority_Queue", "2");
    const emergencyCase = this.getOverrideValue(overrides, "EmergencyCase", "false") === "true";
    const emergencyPrompt = this.getOverrideValue(overrides, "EmergencyPrompt", "");
    const holidayPrompt = this.getOverrideValue(overrides, "HolidayPrompt", "");
    const globalLanguage = this.getOverrideValue(overrides, "Global_Language", "de-DE");
    const globalVoiceName = this.getOverrideValue(overrides, "Global_VoiceName", "");
    const mohSalesQueue = this.getOverrideValue(overrides, "Moh_Sales_Queue", "");

    this.$priorityQueue().value = priorityQueue;
    this.$toggle().checked = emergencyCase;
    this.$emergencyPrompt().value = emergencyPrompt;
    this.$holidayPrompt().value = holidayPrompt;
    this.$globalLanguage().value = ["de-DE", "en-US"].includes(globalLanguage) ? globalLanguage : "de-DE";
    this.updateVoiceOptions(globalVoiceName);
    this.$mohSalesQueue().value = mohSalesQueue;

    this.updateLabel();
    this.hasUnsavedChanges = false;
  }

  updateLabel() {
    this.$stateLabel().innerText = this.$toggle().checked ? "ON" : "OFF";
  }

  formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (value < 60) return `${value}s`;

    const minutes = Math.floor(value / 60);
    const remainingSeconds = value % 60;

    if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    return `${hours}h ${remainingMinutes}m`;
  }

  getAgentDuration(agent) {
    if (typeof agent.activeSinceSeconds === "number") {
      return agent.activeSinceSeconds;
    }

    const base = Number(agent.lastActivityTime || agent.startTime || 0);

    if (base > 0) {
      return Math.max(0, Math.floor((Date.now() - base) / 1000));
    }

    return 0;
  }

  async loadWallboard() {
    try {
      const res = await this.authorizedFetch(`/api/wallboard`);
      const data = await this.readJsonResponse(res);

      if (!res.ok || data.ok === false) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      this.shadowRoot.getElementById("kpiCallsInQueue").textContent = data.queue?.callsInQueue ?? 0;
      this.shadowRoot.getElementById("kpiActiveCalls").textContent = data.queue?.activeCalls ?? 0;
      this.shadowRoot.getElementById("kpiLongestWaiting").textContent = this.formatDuration(data.queue?.longestWaitingSeconds);
      this.shadowRoot.getElementById("kpiAvgWait").textContent = this.formatDuration(data.queue?.avgWaitSeconds);
      this.shadowRoot.getElementById("kpiAvgHandle").textContent = this.formatDuration(data.queue?.avgHandleSeconds);
      this.shadowRoot.getElementById("kpiLoggedIn").textContent = data.agents?.loggedIn ?? 0;
      this.shadowRoot.getElementById("kpiAvailable").textContent = data.agents?.available ?? 0;

      const agentList = this.shadowRoot.getElementById("agentList");
      agentList.innerHTML = `
        <div class="agent-row header-row">
          <div>Name</div>
          <div>Status</div>
          <div>Team</div>
          <div>Active Since</div>
        </div>
      `;

      const agents = Array.isArray(data.agentList) ? data.agentList : [];

      if (agents.length === 0) {
        const empty = document.createElement("div");
        empty.className = "agent-row";
        empty.innerHTML = `<div>No active agents</div><div></div><div></div><div></div>`;
        agentList.appendChild(empty);
      } else {
        agents.forEach(agent => {
          const row = document.createElement("div");
          row.className = "agent-row";
          row.innerHTML = `
            <div>${agent.name || agent.login || "-"}</div>
            <div>${agent.state || "-"}</div>
            <div>${agent.team || "-"}</div>
            <div>${this.formatDuration(this.getAgentDuration(agent))}</div>
          `;
          agentList.appendChild(row);
        });
      }

      this.setWallboardStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      this.setWallboardStatus(`Wallboard failed: ${err.message}`);
    }
  }

  async saveState() {
    if (!["supervisor", "admin"].includes(this.currentRole)) {
      this.setStatus("No write permission", "error");
      return;
    }

    const flowOverrideSettings = [
      {
        name: "Priority_Queue",
        type: "INTEGER",
        value: String(Number(this.$priorityQueue().value))
      },
      {
        name: "EmergencyCase",
        type: "BOOLEAN",
        value: this.$toggle().checked ? "true" : "false"
      },
      {
        name: "HolidayPrompt",
        type: "STRING",
        value: this.$holidayPrompt().value
      },
      {
        name: "Global_VoiceName",
        type: "STRING",
        value: this.$globalVoiceName().value
      },
      {
        name: "EmergencyPrompt",
        type: "STRING",
        value: this.$emergencyPrompt().value
      },
      {
        name: "Global_Language",
        type: "STRING",
        value: this.$globalLanguage().value
      },
      {
        name: "Moh_Sales_Queue",
        type: "STRING",
        value: this.$mohSalesQueue().value
      }
    ];

    try {
      this.isUpdating = true;
      this.$saveBtn().disabled = true;
      this.setStatus("Saving...", "info");

      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowOverrideSettings })
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

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
    if (this.pollHandle) clearInterval(this.pollHandle);

    this.pollHandle = setInterval(async () => {
      try {
        await this.loadEntryPoint(false);
      } catch {
        this.setStatus("Refresh failed", "error");
      }
    }, this.POLL_INTERVAL_MS);
  }

  startWallboardPolling() {
    if (this.wallboardPollHandle) clearInterval(this.wallboardPollHandle);

    this.wallboardPollHandle = setInterval(async () => {
      await this.loadWallboard();
    }, this.WALLBOARD_POLL_INTERVAL_MS);
  }
}

customElements.define("supervisor-access-widget-v2", SupervisorAccessWidget);
