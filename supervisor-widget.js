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
    this.themeMode =
      localStorage.getItem("supervisorWidgetTheme") || "dark";
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
    this.applyTheme();
    this.init();
  }

  disconnectedCallback() {
    clearInterval(this.pollHandle);
    clearInterval(this.wallboardPollHandle);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;

          display: block;
          width: 100%;
          height: 100%;

          font-family: Arial, Helvetica, sans-serif !important;

          --bg: #020817;
          --card: rgba(15, 23, 42, 0.82);
          --cardBorder: rgba(255,255,255,0.08);
          --panelBorder: rgba(255,255,255,0.22);
          --input: rgba(255,255,255,0.10);
          --text: #ffffff;
          --muted: rgba(255,255,255,0.75);
          --kpi: rgba(255,255,255,0.14);

          color: var(--text);
        }

        :host *,
        :host *::before,
        :host *::after {
          box-sizing: border-box !important;
          text-transform: none !important;
          font-family: Arial, Helvetica, sans-serif !important;
          font-variant-caps: normal !important;
          font-feature-settings: normal !important;
          letter-spacing: normal !important;
        }

        .wrapper {
          width: 100%;
          padding: 22px;
          color: var(--text);
        }

        .card {
          width: 100%;
          border-radius: 18px;
          background: var(--card);
          border: 1px solid var(--cardBorder);
          padding: 28px;
          backdrop-filter: blur(10px);
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
          color: white;
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

        .badge {
          background: rgba(255,255,255,0.12);
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          color: white;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 28px;
        }

        .switch {
          position: relative;
          width: 52px;
          height: 28px;
          display: inline-block;
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
          background: #4b5563;
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

        .section-title {
          font-size: 22px;
          font-weight: 700;
          margin: 0 0 18px 0;
          color: white;
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
          border: 1px solid rgba(255,255,255,0.12);
          background: var(--input);
          color: white;
          outline: none;
          font-size: 14px;
        }

        button {
          background: #0a84ff;
          color: white;
          border: none;
          border-radius: 10px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 14px;
        }

        .status {
          margin-top: 14px;
          font-size: 13px;
          color: var(--muted);
        }

        .dashboard {
          margin-top: 34px;
        }

        .dashboard-title {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 18px;
          color: white;
        }

        .kpis {
          display: grid;
          grid-template-columns: repeat(7, minmax(0,1fr));
          gap: 12px;
        }

        .kpi {
          background: var(--kpi);
          border-radius: 14px;
          padding: 14px;
        }

        .kpi-label {
          font-size: 13px;
          color: rgba(255,255,255,0.84);
        }

        .kpi-value {
          font-size: 22px;
          font-weight: 700;
          margin-top: 8px;
          color: white;
        }

        .agents-section {
          margin-top: 28px;
        }

        .agents-title {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 16px;
          color: white;
        }

        .table {
          width: 100%;
        }

        .table-row {
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr 1fr;
          gap: 16px;
          padding: 12px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          align-items: center;
          color: white;
        }

        .table-header {
          color: rgba(255,255,255,0.82);
          font-weight: 700;
        }

        .calls-wrapper {
          margin-top: 34px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(720px, 1fr));
          gap: 18px;
        }

        .calls-card {
          border: 2px solid var(--panelBorder);
          border-radius: 16px;
          padding: 20px;
          overflow-x: auto;
          min-width: 0;
        }

        .calls-title {
          font-size: 22px;
          font-weight: 700;
          margin-bottom: 18px;
          color: white;
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
          border-bottom: 1px solid rgba(255,255,255,0.08);
          align-items: center;
          color: white;
          white-space: nowrap;
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

        .call-header {
          font-weight: 700;
          color: rgba(255,255,255,0.82);
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
        }

        @media (max-width: 640px) {
          .kpis {
            grid-template-columns: 1fr;
          }

          .header {
            flex-direction: column;
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
                <div class="badge" id="themeBadge">Theme: Dark</div>
                <div class="badge" id="roleBadge">Supervisor</div>
              </div>
            </div>
          </div>

          <div class="toggle-row">
            <label class="switch">
              <input type="checkbox" id="emergencyToggle">
              <span class="slider"></span>
            </label>

            <div>
              Emergency Mode:
              <span id="stateLabel">OFF</span>
            </div>
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

          <div class="status" id="status">Ready</div>

          <div class="dashboard">
            <div class="dashboard-title">Dashboard</div>

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
          </div>

          <div class="agents-section">
            <div class="agents-title">Agents</div>

            <div class="table" id="agentList">
              <div class="table-row table-header">
                <div>Name</div>
                <div>Status</div>
                <div>Team</div>
                <div>Active Since</div>
              </div>
            </div>
          </div>

          <div class="calls-wrapper">

            <div class="calls-card">
              <div class="calls-title">Waiting Calls</div>

              <div class="calls-table" id="waitingCallList">
                <div class="call-row call-header">
                  <div>Status</div>
                  <div>Queue</div>
                  <div>Caller</div>
                  <div>Entry Point</div>
                  <div>Waiting</div>
                  <div>Task</div>
                </div>
              </div>
            </div>

            <div class="calls-card">
              <div class="calls-title">Active Calls</div>

              <div class="calls-table" id="activeCallList">
                <div class="call-row active call-header">
                  <div>Status</div>
                  <div>Queue</div>
                  <div>Caller</div>
                  <div>Agent</div>
                  <div>Handle</div>
                  <div>Task</div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </div>
    `;
  }
}
customElements.define(
  "supervisor-access-widget-v2",
  SupervisorAccessWidget
);
