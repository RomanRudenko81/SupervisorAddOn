class SupervisorAccessWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.API_URL = "https://wxcc-backend.onrender.com";
    this.ENTRY_POINT_ID = "284cd09a-eef4-40a2-82c6-53d08705e3e3";

    this.POLL_INTERVAL_MS = 5000;
    this.WALLBOARD_POLL_INTERVAL_MS = 5000;

    this.sessionToken = null;
    this.currentRole = "viewer";
    this.isUpdating = false;
    this.isBootstrapping = false;
    this.pollHandle = null;
    this.wallboardPollHandle = null;
    this.hasUnsavedChanges = false;
    this.themeMode = localStorage.getItem("supervisorWidgetTheme") || "dark";
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

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          display: block;
          width: 100%;
          min-height: 100%;
          box-sizing: border-box;
          font-family: Arial, Helvetica, sans-serif !important;

          --card: rgba(255,255,255,0.90);
          --cardBorder: rgba(0,0,0,0.10);
          --panelBorder: rgba(0,0,0,0.30);
          --input: rgba(255,255,255,0.95);
          --inputBorder: rgba(0,0,0,0.18);
          --text: #111827;
          --muted: rgba(17,24,39,0.72);
          --kpi: rgba(0,0,0,0.08);
          --switch: #9ca3af;
          --button: #0a84ff;
          --tableBorder: rgba(0,0,0,0.10);

          color: var(--text);
        }

        :host(.theme-dark) {
          --card: rgba(15, 23, 42, 0.82);
          --cardBorder: rgba(255,255,255,0.08);
          --panelBorder: rgba(255,255,255,0.28);
          --input: rgba(255,255,255,0.10);
          --inputBorder: rgba(255,255,255,0.14);
          --text: #ffffff;
          --muted: rgba(255,255,255,0.75);
          --kpi: rgba(255,255,255,0.14);
          --switch: #4b5563;
          --button: #0a84ff;
          --tableBorder: rgba(255,255,255,0.08);
        }

        :host *,
        :host *::before,
        :host *::after {
          box-sizing: border-box !important;
          font-family: Arial, Helvetica, sans-serif !important;
          text-transform: none !important;
          font-variant: normal !important;
          font-variant-caps: normal !important;
          font-feature-settings: normal !important;
          letter-spacing: normal !important;
        }

        .wrapper {
          width: 100%;
          height: 100vh;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 22px;
          color: var(--text);
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.35) rgba(255,255,255,0.08);
        }

        .wrapper::-webkit-scrollbar {
          width: 8px;
        }

        .wrapper::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
        }

        .wrapper::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.35);
          border-radius: 999px;
        }

        .wrapper::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.50);
        }

        :host(.theme-light) .wrapper {
          scrollbar-color: rgba(0,0,0,0.35) rgba(0,0,0,0.08);
        }

        :host(.theme-light) .wrapper::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.06);
        }

        :host(.theme-light) .wrapper::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.35);
        }

        :host(.theme-light) .wrapper::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.50);
        }

        .card {
          width: 100%;
          border-radius: 18px;
          background: var(--card);
          border: 1px solid var(--cardBorder);
          padding: 28px;
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          color: var(--text);
        }

        .header {
          display: flex;
          justify-content: space-between;
          gap: 30px;
          margin-bottom: 30px;
        }

        .title {
          font-size: 28px;
          font-weight: 700;
          margin: 0;
          color: var(--text);
          line-height: 1.2;
        }

        .subtitle {
          margin-top: 8px;
          font-size: 13px;
          color: var(--muted);
        }

        .badge-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          justify-content: flex-end;
        }

        .badge,
        .theme-btn {
          background: var(--kpi);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          color: var(--text);
          border: 1px solid var(--cardBorder);
        }

        .theme-btn {
          cursor: pointer;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
          font-size: 14px;
          color: var(--text);
        }

        .switch {
          position: relative;
          width: 52px;
          height: 28px;
          display: inline-block;
          flex: 0 0 auto;
        }

        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          inset: 0;
          cursor: pointer;
          background: var(--switch);
          border-radius: 999px;
          transition: .25s;
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 4px;
          top: 4px;
          background: white;
          border-radius: 50%;
          transition: .25s;
        }

        input:checked + .slider {
          background: #22c55e;
        }

        input:checked + .slider:before {
          transform: translateX(24px);
        }

        .section-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0,1fr));
          gap: 42px;
        }

        .section-title,
        .dashboard-title,
        .agents-title,
        .calls-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 18px 0;
          color: var(--text);
          line-height: 1.25;
        }

        .field {
          margin-bottom: 18px;
        }

        .field label {
          display: block;
          font-size: 13px;
          margin-bottom: 8px;
          color: var(--muted);
        }

        input[type="text"],
        select {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid var(--inputBorder);
          background: var(--input);
          color: var(--text) !important;
          outline: none;
          font-size: 14px;
        }

        input[type="text"]::placeholder {
          color: var(--muted);
        }

        button {
          background: var(--button);
          color: white !important;
          border: none;
          border-radius: 10px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 14px;
        }

        button[disabled],
        input[disabled],
        select[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .status {
          margin-top: 14px;
          font-size: 13px;
          color: var(--muted);
          min-height: 18px;
        }

        .dashboard {
          margin-top: 34px;
        }

        .kpis {
          display: grid;
          grid-template-columns: repeat(7, minmax(0,1fr));
          gap: 12px;
        }

        .kpi {
          background: var(--kpi);
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 14px;
          min-height: 74px;
          transition: background .25s ease, border-color .25s ease, box-shadow .25s ease;
        }

        .kpi-green {
          background: linear-gradient(135deg, rgba(34,197,94,0.22), rgba(34,197,94,0.10));
          border-color: rgba(34,197,94,0.72);
          box-shadow: 0 0 0 1px rgba(34,197,94,0.10), 0 0 18px rgba(34,197,94,0.16);
        }

        .kpi-orange {
          background: linear-gradient(135deg, rgba(245,158,11,0.24), rgba(245,158,11,0.10));
          border-color: rgba(245,158,11,0.78);
          box-shadow: 0 0 0 1px rgba(245,158,11,0.10), 0 0 18px rgba(245,158,11,0.16);
        }

        .kpi-red,
        .kpi-critical {
          background: linear-gradient(135deg, rgba(239,68,68,0.24), rgba(239,68,68,0.10));
          border-color: rgba(239,68,68,0.82);
          box-shadow: 0 0 0 1px rgba(239,68,68,0.12), 0 0 18px rgba(239,68,68,0.18);
        }

        .kpi-critical {
          animation: supervisorCriticalPulse 1.4s ease-in-out infinite;
        }

        @keyframes supervisorCriticalPulse {
          0%, 100% {
            border-color: rgba(239,68,68,0.70);
            box-shadow: 0 0 0 1px rgba(239,68,68,0.10), 0 0 14px rgba(239,68,68,0.16);
          }
          50% {
            border-color: rgba(239,68,68,1);
            box-shadow: 0 0 0 1px rgba(239,68,68,0.26), 0 0 26px rgba(239,68,68,0.42);
          }
        }

        .kpi-label {
          font-size: 13px;
          color: var(--muted);
        }

        .kpi-value {
          font-size: 24px;
          font-weight: 700;
          margin-top: 8px;
          color: var(--text);
        }

        .agents-section {
          margin-top: 28px;
        }

        .table {
          width: 100%;
        }

        .table-row {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr 1fr;
          gap: 16px;
          padding: 12px 0;
          border-bottom: 1px solid var(--tableBorder);
          align-items: center;
          color: var(--text);
          font-size: 14px;
          transition: background .25s ease, border-color .25s ease, box-shadow .25s ease;
        }

        .table-row.agent-available,
        .table-row.agent-unavailable {
          border: 1px solid transparent;
          border-radius: 14px;
          padding: 14px;
          margin: 10px 0;
        }

        .table-row.agent-available {
          background: linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.08));
          border-color: rgba(34,197,94,0.78);
          box-shadow: 0 0 0 1px rgba(34,197,94,0.08), 0 0 18px rgba(34,197,94,0.14);
        }

        .table-row.agent-unavailable {
          background: linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.08));
          border-color: rgba(239,68,68,0.82);
          box-shadow: 0 0 0 1px rgba(239,68,68,0.08), 0 0 18px rgba(239,68,68,0.14);
        }

        .table-header,
        .call-header {
          color: var(--muted);
          font-weight: 700;
        }

        .calls-wrapper {
          margin-top: 34px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 720px), 1fr));
          gap: 18px;
        }

        .calls-card {
          border: 2px solid var(--panelBorder);
          border-radius: 16px;
          padding: 20px;
          overflow-x: auto;
          min-width: 0;
          background: rgba(255,255,255,0.02);
        }

        :host(.theme-light) .calls-card {
          background: rgba(0,0,0,0.02);
        }

        .calls-table {
          min-width: 760px;
        }

        .call-row {
          display: grid;
          grid-template-columns:
            minmax(90px,0.8fr)
            minmax(140px,1fr)
            minmax(160px,1.1fr)
            minmax(180px,1.2fr)
            minmax(90px,0.7fr)
            minmax(90px,0.7fr);
          gap: 14px;
          padding: 12px 0;
          border-bottom: 1px solid var(--tableBorder);
          align-items: center;
          color: var(--text);
          white-space: nowrap;
          font-size: 14px;
        }

        .call-row.active {
          grid-template-columns:
            minmax(90px,0.8fr)
            minmax(140px,1fr)
            minmax(160px,1.1fr)
            minmax(140px,1fr)
            minmax(90px,0.7fr)
            minmax(90px,0.7fr);
        }

        #wallboardStatus {
          margin-top: 12px;
          font-size: 13px;
          color: var(--muted);
        }

        @media (max-width: 1400px) {
          .kpis {
            grid-template-columns: repeat(4, minmax(0,1fr));
          }
        }

        @media (max-width: 980px) {
          .section-grid {
            grid-template-columns: 1fr;
          }

          .kpis {
            grid-template-columns: repeat(2, minmax(0,1fr));
          }

          .table-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 640px) {
          .wrapper {
            padding: 8px;
          }

          .card {
            padding: 18px;
          }

          .header {
            flex-direction: column;
          }

          .badge-row {
            justify-content: flex-start;
          }

          .kpis {
            grid-template-columns: 1fr;
          }

          .calls-wrapper {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="wrapper">
        <div class="card">
          <div class="header">
            <div>
              <h2 class="title">Supervisor access control</h2>
              <div class="subtitle" id="userInfo">Loading...</div>
            </div>

            <div>
              <h2 class="title">Conscia Demo Support</h2>
              <div class="badge-row">
                <button class="theme-btn" id="themeToggleBtn" type="button">Theme: Dark</button>
                <div class="badge" id="roleBadge">...</div>
              </div>
            </div>
          </div>

          <div class="toggle-row">
            <label class="switch">
              <input type="checkbox" id="emergencyToggle">
              <span class="slider"></span>
            </label>
            <div>Emergency Mode: <span id="stateLabel">OFF</span></div>
          </div>

          <div class="section-grid">
            <div>
              <div class="section-title">Prompts</div>
              <div class="field">
                <label>Emergency Prompt</label>
                <input id="emergencyPrompt" type="text">
              </div>
              <div class="field">
                <label>Holiday Prompt</label>
                <input id="holidayPrompt" type="text">
              </div>
            </div>

            <div>
              <div class="section-title">Language Settings</div>
              <div class="field">
                <label>Global Language</label>
                <select id="globalLanguage"></select>
              </div>
              <div class="field">
                <label>Global Voice Name</label>
                <select id="globalVoiceName"></select>
              </div>
            </div>

            <div>
              <div class="section-title">Queue Settings</div>
              <div class="field">
                <label>Prio Queue</label>
                <select id="priorityQueue"></select>
              </div>
              <div class="field">
                <label>MoH Sales Queue</label>
                <input id="mohSalesQueue" type="text">
              </div>
            </div>
          </div>

          <div style="margin-top:18px;">
            <button id="saveBtn">Save</button>
          </div>

          <div class="status" id="status">Loading...</div>

          <div class="dashboard">
            <div class="dashboard-title">Dashboard</div>

            <div class="kpis">
              <div class="kpi"><div class="kpi-label">Calls in Queue</div><div class="kpi-value" id="kpiCallsInQueue">0</div></div>
              <div class="kpi"><div class="kpi-label">Active Calls</div><div class="kpi-value" id="kpiActiveCalls">0</div></div>
              <div class="kpi"><div class="kpi-label">Longest Waiting</div><div class="kpi-value" id="kpiLongestWaiting">0s</div></div>
              <div class="kpi"><div class="kpi-label">Avg Wait</div><div class="kpi-value" id="kpiAvgWait">0s</div></div>
              <div class="kpi"><div class="kpi-label">Avg Handle</div><div class="kpi-value" id="kpiAvgHandle">0s</div></div>
              <div class="kpi"><div class="kpi-label">Logged-in Agents</div><div class="kpi-value" id="kpiLoggedIn">0</div></div>
              <div class="kpi"><div class="kpi-label">Available Agents</div><div class="kpi-value" id="kpiAvailable">0</div></div>
            </div>
          </div>

          <div class="agents-section">
            <div class="agents-title">Agents</div>
            <div class="table" id="agentList">
              <div class="table-row table-header">
                <div>Name</div><div>Status</div><div>Team</div><div>Active Since</div>
              </div>
            </div>
            <div id="wallboardStatus">Loading dashboard...</div>
          </div>

          <div class="calls-wrapper">
            <div class="calls-card">
              <div class="calls-title">Waiting Calls</div>
              <div class="calls-table" id="waitingCallList">
                <div class="call-row call-header">
                  <div>Status</div><div>Queue</div><div>Caller</div><div>Entry Point</div><div>Waiting</div><div>Task</div>
                </div>
              </div>
            </div>

            <div class="calls-card">
              <div class="calls-title">Active Calls</div>
              <div class="calls-table" id="activeCallList">
                <div class="call-row active call-header">
                  <div>Status</div><div>Queue</div><div>Caller</div><div>Agent</div><div>Handle</div><div>Task</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  applyTheme() {
    this.classList.toggle("theme-light", this.themeMode === "light");
    this.classList.toggle("theme-dark", this.themeMode === "dark");

    const btn = this.shadowRoot.getElementById("themeToggleBtn");
    if (btn) {
      btn.textContent = this.themeMode === "dark" ? "Theme: Dark" : "Theme: Light";
    }
  }

  toggleTheme() {
    this.themeMode = this.themeMode === "dark" ? "light" : "dark";
    localStorage.setItem("supervisorWidgetTheme", this.themeMode);
    this.applyTheme();
  }

  populateStaticOptions() {
    this.setSelectOptions(this.$priorityQueue(), Array.from({ length: 10 }, (_, i) => String(i + 1)));
    this.setSelectOptions(this.$globalLanguage(), ["de-DE", "en-US"]);
    this.updateVoiceOptions();
  }

  setSelectOptions(el, values) {
    el.innerHTML = "";
    values.forEach(value => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      el.appendChild(option);
    });
  }

  bindEvents() {
    this.$themeToggleBtn().addEventListener("click", () => this.toggleTheme());

    this.$toggle().addEventListener("change", () => {
      this.hasUnsavedChanges = true;
      this.updateLabel();
      this.setStatus("Unsaved changes");
    });

    [
      this.$priorityQueue(),
      this.$emergencyPrompt(),
      this.$holidayPrompt(),
      this.$globalVoiceName(),
      this.$mohSalesQueue()
    ].forEach(el => el.addEventListener("input", () => this.markDirty()));

    this.$globalLanguage().addEventListener("change", () => {
      this.updateVoiceOptions();
      this.markDirty();
    });

    this.$saveBtn().addEventListener("click", async () => await this.saveState());
  }

  markDirty() {
    this.hasUnsavedChanges = true;
    this.setStatus("Unsaved changes");
  }

  async init() {
    try {
      await this.bootstrapSession();
      await this.loadEntryPoint(true);
      await this.loadWallboard();
      this.startPolling();
      this.startWallboardPolling();
      this.setStatus("Ready");
    } catch (err) {
      this.setStatus(`Load failed: ${err.message}`);
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

  setStatus(msg) {
    this.$status().textContent = msg || "";
  }

  setWallboardStatus(msg) {
    const el = this.shadowRoot.getElementById("wallboardStatus");
    if (el) el.textContent = msg || "";
  }

  getVoiceOptions(lang) {
    return lang === "en-US" ? ["en-US-Daniel", "en-US-Maria"] : ["de-DE-Jonas", "de-DE-Emma"];
  }

  updateVoiceOptions(selected = "") {
    const lang = this.$globalLanguage().value || "de-DE";
    const options = this.getVoiceOptions(lang);
    const select = this.$globalVoiceName();
    const current = selected || select.value;
    this.setSelectOptions(select, options);
    select.value = options.includes(current) ? current : options[0];
  }

  getOverrideValue(overrides, name, fallback = "") {
    return overrides.find(o => o.name === name)?.value ?? fallback;
  }

  async resolveDesktopIdentity() {
    return {
      email: this.email || "",
      userId: this.userId || "",
      teamId: this.teamId || "",
      displayName: this.displayName || "Unknown User"
    };
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
      this.$roleBadge().textContent = this.currentRole === "supervisor" ? "Supervisor" : "Viewer";

      this.applyRoleState();
    } finally {
      this.isBootstrapping = false;
    }
  }

  applyRoleState() {
    const writable = ["supervisor", "admin"].includes(this.currentRole);
    [
      this.$toggle(),
      this.$priorityQueue(),
      this.$emergencyPrompt(),
      this.$holidayPrompt(),
      this.$globalLanguage(),
      this.$globalVoiceName(),
      this.$mohSalesQueue(),
      this.$saveBtn()
    ].forEach(el => el.disabled = !writable);
  }

  async authorizedFetch(path, options = {}, retryOn401 = true) {
    if (!this.sessionToken) await this.bootstrapSession();

    const makeRequest = () => fetch(`${this.API_URL}${path}`, {
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
    if (!force && (this.isUpdating || this.hasUnsavedChanges)) return;

    const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`);
    const data = await this.readJsonResponse(res);

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const overrides = Array.isArray(data.flowOverrideSettings) ? data.flowOverrideSettings : [];

    this.$priorityQueue().value = this.getOverrideValue(overrides, "Priority_Queue", "2");
    this.$toggle().checked = this.getOverrideValue(overrides, "EmergencyCase", "false") === "true";
    this.$emergencyPrompt().value = this.getOverrideValue(overrides, "EmergencyPrompt", "");
    this.$holidayPrompt().value = this.getOverrideValue(overrides, "HolidayPrompt", "");

    const lang = this.getOverrideValue(overrides, "Global_Language", "de-DE");
    const voice = this.getOverrideValue(overrides, "Global_VoiceName", "");

    this.$globalLanguage().value = ["de-DE", "en-US"].includes(lang) ? lang : "de-DE";
    this.updateVoiceOptions(voice);
    this.$mohSalesQueue().value = this.getOverrideValue(overrides, "Moh_Sales_Queue", "");

    this.updateLabel();
    this.hasUnsavedChanges = false;
  }

  updateLabel() {
    this.$stateLabel().textContent = this.$toggle().checked ? "ON" : "OFF";
  }

  toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  setKpiClass(elementId, state) {
    const el = this.shadowRoot.getElementById(elementId);
    const card = el?.closest(".kpi");
    if (!card) return;

    card.classList.remove("kpi-green", "kpi-orange", "kpi-red", "kpi-critical");
    if (state) card.classList.add(state);
  }

  applyWallboardThresholds({ callsInQueue, loggedInAgents, availableAgents }) {
    const queue = this.toNumber(callsInQueue);
    const loggedIn = this.toNumber(loggedInAgents);
    const available = this.toNumber(availableAgents);

    this.setKpiClass(
      "kpiCallsInQueue",
      queue > 1 ? "kpi-critical" : queue === 1 ? "kpi-orange" : ""
    );

    this.setKpiClass(
      "kpiLoggedIn",
      loggedIn > 1 ? "kpi-green" : loggedIn === 1 ? "kpi-orange" : "kpi-red"
    );

    this.setKpiClass(
      "kpiAvailable",
      available > 1 ? "kpi-green" : available === 1 ? "kpi-orange" : "kpi-red"
    );
  }

  getAgentRowClass(state) {
    return String(state || "").trim().toLowerCase() === "available"
      ? "table-row agent-available"
      : "table-row agent-unavailable";
  }

  formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (value < 60) return `${value}s`;
    const min = Math.floor(value / 60);
    const sec = value % 60;
    if (min < 60) return `${min}m ${sec}s`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
  }

  shortId(id) {
    return id ? String(id).slice(0, 8) : "-";
  }

  getAgentDuration(agent) {
    const base = Number(agent.lastActivityTime || agent.startTime || 0);
    return base > 0 ? Math.max(0, Math.floor((Date.now() - base) / 1000)) : 0;
  }

  renderWaitingCalls(calls) {
    const list = this.shadowRoot.getElementById("waitingCallList");
    list.innerHTML = `
      <div class="call-row call-header">
        <div>Status</div><div>Queue</div><div>Caller</div><div>Entry Point</div><div>Waiting</div><div>Task</div>
      </div>
    `;

    if (!calls.length) {
      const row = document.createElement("div");
      row.className = "call-row";
      row.innerHTML = `<div>No waiting calls</div><div></div><div></div><div></div><div></div><div></div>`;
      list.appendChild(row);
      return;
    }

    calls.forEach(call => {
      const row = document.createElement("div");
      row.className = "call-row";
      row.innerHTML = `
        <div>${call.status || "-"}</div>
        <div>${call.queue || call.firstQueue || "-"}</div>
        <div>${call.caller || "-"}</div>
        <div>${call.entryPoint || "-"}</div>
        <div>${this.formatDuration(call.waitingSeconds)}</div>
        <div>${this.shortId(call.id)}</div>
      `;
      list.appendChild(row);
    });
  }

  renderActiveCalls(calls) {
    const list = this.shadowRoot.getElementById("activeCallList");
    list.innerHTML = `
      <div class="call-row active call-header">
        <div>Status</div><div>Queue</div><div>Caller</div><div>Agent</div><div>Handle</div><div>Task</div>
      </div>
    `;

    if (!calls.length) {
      const row = document.createElement("div");
      row.className = "call-row active";
      row.innerHTML = `<div>No active calls</div><div></div><div></div><div></div><div></div><div></div>`;
      list.appendChild(row);
      return;
    }

    calls.forEach(call => {
      const row = document.createElement("div");
      row.className = "call-row active";
      row.innerHTML = `
        <div>${call.status || "-"}</div>
        <div>${call.queue || call.firstQueue || "-"}</div>
        <div>${call.caller || "-"}</div>
        <div>${call.agent || "-"}</div>
        <div>${this.formatDuration(Math.round(Number(call.connectedDuration || 0) / 1000))}</div>
        <div>${this.shortId(call.id)}</div>
      `;
      list.appendChild(row);
    });
  }

  async loadWallboard() {
    try {
      const res = await this.authorizedFetch(`/api/wallboard`);
      const data = await this.readJsonResponse(res);

      if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);

      const callsInQueue = data.queue?.callsInQueue ?? 0;
      const loggedInAgents = data.agents?.loggedIn ?? 0;
      const availableAgents = data.agents?.available ?? 0;

      this.shadowRoot.getElementById("kpiCallsInQueue").textContent = callsInQueue;
      this.shadowRoot.getElementById("kpiActiveCalls").textContent = data.queue?.activeCalls ?? 0;
      this.shadowRoot.getElementById("kpiLongestWaiting").textContent = this.formatDuration(data.queue?.longestWaitingSeconds);
      this.shadowRoot.getElementById("kpiAvgWait").textContent = this.formatDuration(data.queue?.avgWaitSeconds);
      this.shadowRoot.getElementById("kpiAvgHandle").textContent = this.formatDuration(data.queue?.avgHandleSeconds);
      this.shadowRoot.getElementById("kpiLoggedIn").textContent = loggedInAgents;
      this.shadowRoot.getElementById("kpiAvailable").textContent = availableAgents;

      this.applyWallboardThresholds({ callsInQueue, loggedInAgents, availableAgents });

      const agentList = this.shadowRoot.getElementById("agentList");
      agentList.innerHTML = `
        <div class="table-row table-header">
          <div>Name</div><div>Status</div><div>Team</div><div>Active Since</div>
        </div>
      `;

      const agents = Array.isArray(data.agentList) ? data.agentList : [];

      if (!agents.length) {
        const row = document.createElement("div");
        row.className = "table-row";
        row.innerHTML = `<div>No active agents</div><div></div><div></div><div></div>`;
        agentList.appendChild(row);
      } else {
        agents.forEach(agent => {
          const row = document.createElement("div");
          row.className = this.getAgentRowClass(agent.state);
          row.innerHTML = `
            <div>${agent.name || agent.login || "-"}</div>
            <div>${agent.state || "-"}</div>
            <div>${agent.team || "-"}</div>
            <div>${this.formatDuration(this.getAgentDuration(agent))}</div>
          `;
          agentList.appendChild(row);
        });
      }

      this.renderWaitingCalls(Array.isArray(data.waitingTaskList) ? data.waitingTaskList : []);

      const activeCalls = Array.isArray(data.taskList)
        ? data.taskList.filter(t => String(t.status || "").toLowerCase() === "connected")
        : [];

      this.renderActiveCalls(activeCalls);

      this.setWallboardStatus(`Updated ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      this.setWallboardStatus(`Dashboard failed: ${err.message}`);
    }
  }

  async saveState() {
    if (!["supervisor", "admin"].includes(this.currentRole)) {
      this.setStatus("No write permission");
      return;
    }

    const flowOverrideSettings = [
      { name: "Priority_Queue", type: "INTEGER", value: String(Number(this.$priorityQueue().value)) },
      { name: "EmergencyCase", type: "BOOLEAN", value: this.$toggle().checked ? "true" : "false" },
      { name: "HolidayPrompt", type: "STRING", value: this.$holidayPrompt().value },
      { name: "Global_VoiceName", type: "STRING", value: this.$globalVoiceName().value },
      { name: "EmergencyPrompt", type: "STRING", value: this.$emergencyPrompt().value },
      { name: "Global_Language", type: "STRING", value: this.$globalLanguage().value },
      { name: "Moh_Sales_Queue", type: "STRING", value: this.$mohSalesQueue().value }
    ];

    try {
      this.isUpdating = true;
      this.$saveBtn().disabled = true;
      this.setStatus("Saving...");

      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flowOverrideSettings })
      });

      const data = await this.readJsonResponse(res);

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      this.hasUnsavedChanges = false;
      await this.loadEntryPoint(true);
      this.setStatus("Saved successfully ✔");
    } catch (err) {
      this.setStatus(`Update failed ❌ ${err.message || ""}`.trim());
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
        this.setStatus("Refresh failed");
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
