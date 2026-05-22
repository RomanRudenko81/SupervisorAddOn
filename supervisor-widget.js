const FRONTEND_BUILD_ID = "wxcc-widget-v57-isolated-analytics-fetch-2026-05-22";
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
    this.wallboardEventSource = null;
    this.wallboardReconnectHandle = null;
    this.wallboardReconnectAttempt = 0;
    this.wallboardPollFallbackHandle = null;
    this.activeCallTimerHandle = null;
    this.liveUiTimerHandle = null;
    this.lastWallboardData = null;
    this.activeCallRenderCache = new Map();
    this.callHistoryRenderCache = [];
    this.callHistoryCacheTs = 0;
    this.lastNonEmptyCallHistory = [];
    this.lastNonEmptyCallHistoryTs = 0;
    this.lastNonEmptyWallboardTs = 0;
    this.historyEndMismatchSinceTs = 0;
    this.historyEndMismatchLastRefreshTs = 0;
    this.historyEndWatchdogHandle = null;
    this.diagLogEntries = [];
    this.diagLogMax = 1200;
    this.diagRemoteQueue = [];
    this.diagRemoteFlushHandle = null;
    this.diagHeartbeatHandle = null;
    this.diagStorageKey = "wxccSupervisorWidgetDiagLogV47";
    this.diagQueueStorageKey = "wxccSupervisorWidgetDiagQueueV47";
    this.activeCallPersistenceKey = "wxccSupervisorWidgetActiveCallsV47";
    this.activeCallEvictionDelayMs = 30000;
    this.activeCallPersistenceTtlMs = 600000;
    this.activeCallTerminalPersistenceKey = "wxccSupervisorWidgetActiveCallTerminalsV47";
    this.activeCallTerminalCache = new Map();
    this.activeCallTerminalTtlMs = 180000;
    this.agentStateEventCache = new Map();
    this.agentStatePersistenceKey = "wxccSupervisorWidgetAgentStatesV47";
    this.agentStateEventTtlMs = 120000;
    this.agentSnapshotStaleRejectMs = 90000;
    this.agentDirectory = new Map();
    this.taskOwnershipMap = new Map();
    this.taskOwnershipPersistenceKey = "wxccSupervisorWidgetTaskOwnershipV47";
    this.queueDirectory = new Map();
    this.taskOwnershipTtlMs = 600000;
    this.techDiagnosticsInstalled = false;
    this.windowErrorHandler = null;
    this.windowRejectionHandler = null;
    this.consoleErrorOriginal = null;
    this.diagLogVisible = false;
    this.hasUnsavedChanges = false;
    this.themeMode = localStorage.getItem("supervisorWidgetTheme") || "dark";
    this.allowedQueueNames = [];
    this.selectedQueueFilters = this.readSelectedQueueFilters();
    this.kpiDurationStorageKey = "wxccSupervisorWidgetKpiDurationV55";
    this.kpiDurationRange = this.readKpiDurationRange();
    this.analyticsMetricsPollHandle = null;
    this.analyticsMetricsCache = null;
    this.analyticsMetricsIntervalMs = 60000;
    this.analyticsMetricsLoading = false;
    this.analyticsMetricsTimeoutMs = 8000;
    this.currentIdentity = null;
    this.currentUserById = new Map();
    this.configCollapsedSessionKey = "wxccSupervisorWidgetConfigCollapsedV52";
    this.callHistoryCollapsedSessionKey = "wxccSupervisorWidgetCallHistoryCollapsedV52";
    this.agentIdAliasMap = new Map();
    this.agentIdAliasTtlMs = 10 * 60 * 1000;

    // v40 hard lifecycle isolation: every mount gets a unique runtime.
    // Async callbacks, timers and SSE events from older WXCC Desktop lifecycles must not update the UI.
    this.runtimeId = null;
    this.isDisposed = false;
    this.cleanupCallbacks = [];
    this.visibilityChangeHandler = null;
    this.pageHideHandler = null;
    this.beforeUnloadHandler = null;
    this.entryPointRetryTimer = null;
  }

  connectedCallback() {
    this.runtimeId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.isDisposed = false;
    this.cleanupCallbacks = [];

    this.restorePersistentDiagnostics();
    this.restorePersistentActiveCallTerminals();
    this.restorePersistentTaskOwnership();
    this.restorePersistentAgentStates();
    this.restorePersistentActiveCalls();
    this.installTechnicalDiagnostics();
    this.startPersistentDiagHeartbeat();
    this.addDiagLog("cold-start-after-disconnect", { runtimeId: this.runtimeId });
    this.addDiagLog("widget-resume", { persistedEntries: (this.diagLogEntries || []).length, runtimeId: this.runtimeId });
    const runtimeId = this.runtimeId;
    this.safeSetTimeout(() => this.addDiagLog("widget-connected", {
      frontendBuildId: FRONTEND_BUILD_ID,
      userAgent: navigator.userAgent,
      href: location.href,
      runtimeId
    }), 0, runtimeId);
    this.render();
    this.applyTheme();
    this.applySessionCollapseState();
    this.populateStaticOptions();
    this.bindEvents();
    this.updateKpiDurationFilterControl();
    this.init(runtimeId);
    this.startRobustActiveCallTimer(runtimeId);
    this.startLiveUiTimer(runtimeId);
    this.startHistoryEndWatchdog(runtimeId);
  }

  disconnectedCallback() {
    this.addDiagLog("widget-disconnected", { reason: "disconnectedCallback", runtimeId: this.runtimeId });
    this.hardLifecycleCleanup("disconnectedCallback");
  }

  isCurrentRuntime(runtimeId) {
    return !this.isDisposed && runtimeId && runtimeId === this.runtimeId;
  }

  guardRuntime(runtimeId, eventName = "stale-runtime-ignored") {
    const ok = this.isCurrentRuntime(runtimeId);
    if (!ok) {
      try { this.addDiagLog(eventName, { runtimeId, currentRuntimeId: this.runtimeId, disposed: this.isDisposed }); } catch {}
    }
    return ok;
  }

  safeSetTimeout(fn, delay, runtimeId = this.runtimeId) {
    const handle = setTimeout(() => {
      if (!this.guardRuntime(runtimeId)) return;
      try { fn(); } catch (err) { this.addDiagLog("timer-exception", { error: this.serializeError(err), runtimeId }); }
    }, delay);
    this.cleanupCallbacks.push(() => clearTimeout(handle));
    return handle;
  }

  safeSetInterval(fn, delay, runtimeId = this.runtimeId) {
    const handle = setInterval(() => {
      if (!this.guardRuntime(runtimeId)) return;
      try { fn(); } catch (err) { this.addDiagLog("interval-exception", { error: this.serializeError(err), runtimeId }); }
    }, delay);
    this.cleanupCallbacks.push(() => clearInterval(handle));
    return handle;
  }

  addManagedListener(target, type, handler, options) {
    try {
      target.addEventListener(type, handler, options);
      this.cleanupCallbacks.push(() => {
        try { target.removeEventListener(type, handler, options); } catch {}
      });
    } catch {}
  }

  hardLifecycleCleanup(reason = "unknown") {
    const runtimeId = this.runtimeId;
    this.addDiagLog("lifecycle-cleanup-start", { reason, runtimeId });
    this.isDisposed = true;

    const clearIntervalSafe = handle => { if (handle) { try { clearInterval(handle); } catch {} } };
    const clearTimeoutSafe = handle => { if (handle) { try { clearTimeout(handle); } catch {} } };

    clearIntervalSafe(this.pollHandle); this.pollHandle = null;
    clearIntervalSafe(this.wallboardPollHandle); this.wallboardPollHandle = null;
    clearIntervalSafe(this.wallboardPollFallbackHandle); this.wallboardPollFallbackHandle = null;
    clearIntervalSafe(this.activeCallTimerHandle); this.activeCallTimerHandle = null;
    clearIntervalSafe(this.liveUiTimerHandle); this.liveUiTimerHandle = null;
    clearIntervalSafe(this.historyEndWatchdogHandle); this.historyEndWatchdogHandle = null;
    clearIntervalSafe(this.diagHeartbeatHandle); this.diagHeartbeatHandle = null;
    clearIntervalSafe(this.analyticsMetricsPollHandle); this.analyticsMetricsPollHandle = null;

    clearTimeoutSafe(this.wallboardReconnectHandle); this.wallboardReconnectHandle = null;
    clearTimeoutSafe(this.entryPointRetryTimer); this.entryPointRetryTimer = null;
    clearTimeoutSafe(this.diagRemoteFlushHandle); this.diagRemoteFlushHandle = null;

    if (this.wallboardEventSource) {
      try { this.wallboardEventSource.close(); } catch {}
      this.wallboardEventSource = null;
    }

    const callbacks = Array.isArray(this.cleanupCallbacks) ? this.cleanupCallbacks.splice(0) : [];
    callbacks.forEach(cb => { try { cb(); } catch {} });

    this.flushDiagRemoteQueue(true);
    this.persistDiagLog();
    this.uninstallTechnicalDiagnostics();
    this.addDiagLog("lifecycle-cleanup-complete", { reason, runtimeId });
  }

  readSelectedQueueFilters() {
    try {
      const raw = localStorage.getItem("supervisorWidgetSelectedQueues");
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  saveSelectedQueueFilters() {
    try {
      localStorage.setItem(
        "supervisorWidgetSelectedQueues",
        JSON.stringify(Array.isArray(this.selectedQueueFilters) ? this.selectedQueueFilters : [])
      );
    } catch {
      // Ignore storage issues inside embedded desktop.
    }
  }


  readKpiDurationRange() {
    try {
      const value = sessionStorage.getItem(this.kpiDurationStorageKey || "wxccSupervisorWidgetKpiDurationV55");
      return ["today", "60m", "30m"].includes(value) ? value : "60m";
    } catch {
      return "60m";
    }
  }

  saveKpiDurationRange() {
    try {
      sessionStorage.setItem(this.kpiDurationStorageKey || "wxccSupervisorWidgetKpiDurationV55", this.kpiDurationRange || "60m");
    } catch {
      // Ignore storage issues inside embedded desktop.
    }
  }

  updateKpiDurationFilterControl() {
    const select = this.shadowRoot?.getElementById("kpiDurationFilter");
    if (select) select.value = this.kpiDurationRange || "60m";
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


        .config-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 10px 0 18px 0;
          padding: 12px 16px;
          border-radius: 12px;
          background: var(--kpi);
          border: 1px solid var(--cardBorder);
          cursor: pointer;
          user-select: none;
        }

        .config-toggle-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
        }

        .config-toggle-icon {
          transition: transform 0.25s ease;
          color: var(--text);
        }

        .config-toggle.collapsed .config-toggle-icon {
          transform: rotate(-90deg);
        }

        .config-content {
          overflow: hidden;
          transition: max-height 0.35s ease, opacity 0.25s ease;
          max-height: 1200px;
          opacity: 1;
        }

        .config-content.collapsed {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
        }

        .kpi.calls-in-queue-card {
          position: relative;
          overflow: visible;
        }

        .kpi-topline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .kpi-filter-controls {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
          min-width: 0;
          flex: 0 0 auto;
        }

        .kpi-duration-select {
          width: auto;
          min-width: 78px;
          max-width: 92px;
          min-height: 24px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid var(--cardBorder);
          background: rgba(255,255,255,0.10);
          color: var(--text) !important;
          font-size: 11px;
          line-height: 1;
          cursor: pointer;
        }

        :host(.theme-light) .kpi-duration-select {
          background: rgba(0,0,0,0.06);
        }

        :host(.theme-dark) .kpi-duration-select option {
          background: #1f2937;
          color: #ffffff;
        }

        .queue-filter-inline {
          position: relative;
          display: none;
          flex: 0 0 auto;
        }

        .queue-filter-inline.visible {
          display: block;
        }

        .queue-filter-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 24px;
          max-width: 150px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid var(--cardBorder);
          background: rgba(255,255,255,0.10);
          color: var(--text) !important;
          font-size: 11px;
          line-height: 1;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        :host(.theme-light) .queue-filter-button {
          background: rgba(0,0,0,0.06);
        }

        .queue-filter-menu {
          position: absolute;
          top: 30px;
          right: 0;
          z-index: 50;
          display: none;
          min-width: 210px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--cardBorder);
          background: var(--card);
          box-shadow: 0 12px 30px rgba(0,0,0,0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .queue-filter-inline.open .queue-filter-menu {
          display: block;
        }

        .queue-filter-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 4px;
          color: var(--text);
          font-size: 12px;
          cursor: pointer;
        }

        .queue-filter-option input {
          width: auto;
          margin: 0;
        }

        .queue-filter-hint {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid var(--tableBorder);
          color: var(--muted);
          font-size: 11px;
          line-height: 1.3;
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

        select {
          color-scheme: dark;
        }

        select option {
          background: #1f2937;
          color: #ffffff;
        }

        select option:checked,
        select option:hover {
          background: #2563eb;
          color: #ffffff;
        }

        :host(.theme-light) select {
          color-scheme: light;
        }

        :host(.theme-light) select option {
          background: #ffffff;
          color: #111827;
        }

        :host(.theme-light) select option:checked,
        :host(.theme-light) select option:hover {
          background: #0a84ff;
          color: #ffffff;
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
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .calls-card.call-history-card {
          grid-column: 1 / -1;
        }

        @media (max-width: 1200px) {
          .calls-wrapper {
            grid-template-columns: 1fr;
          }

          .calls-card.call-history-card {
            grid-column: auto;
          }
        }

        .calls-card {
          border: 2px solid var(--panelBorder);
          border-radius: 16px;
          padding: 20px;
          overflow-x: auto;
          min-width: 0;
          background: rgba(255,255,255,0.02);
        }

        .calls-card.collapsible {
          padding: 0;
          overflow: hidden;
        }

        .calls-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 20px;
          cursor: pointer;
          user-select: none;
          border-bottom: 1px solid var(--tableBorder);
        }

        .calls-toggle-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
        }

        .calls-toggle-subtitle {
          margin-top: 4px;
          font-size: 12px;
          color: var(--muted);
          font-weight: 500;
        }

        .calls-toggle-icon {
          transition: transform 0.25s ease;
          color: var(--text);
          font-size: 16px;
        }

        .calls-toggle.collapsed .calls-toggle-icon {
          transform: rotate(-90deg);
        }

        .calls-content {
          overflow-x: auto;
          overflow-y: hidden;
          transition: max-height 0.35s ease, opacity 0.25s ease;
          max-height: 900px;
          opacity: 1;
          padding: 0 20px 20px 20px;
        }

        .calls-content.collapsed {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
          padding-bottom: 0;
        }

        :host(.theme-light) .calls-card {
          background: rgba(0,0,0,0.02);
        }

        .calls-table {
          min-width: 760px;
        }

        #callHistoryList {
          min-width: 1400px;
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

        .call-row.history {
          grid-template-columns:
            minmax(90px,0.8fr)
            minmax(140px,1fr)
            minmax(150px,1fr)
            minmax(140px,1fr)
            minmax(180px,1.1fr)
            minmax(140px,0.9fr)
            minmax(110px,0.8fr)
            minmax(100px,0.7fr)
            minmax(90px,0.7fr)
            minmax(160px,1fr);
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
  
        .config-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 10px 0 18px 0;
          padding: 12px 16px;
          border-radius: 12px;
          background: var(--kpi);
          border: 1px solid var(--cardBorder);
          cursor: pointer;
          user-select: none;
        }

        .config-toggle-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
        }

        .config-toggle-icon {
          transition: transform 0.25s ease;
          color: var(--text);
        }

        .config-toggle.collapsed .config-toggle-icon {
          transform: rotate(-90deg);
        }

        .config-content {
          overflow: hidden;
          transition: max-height 0.35s ease, opacity 0.25s ease;
          max-height: 1200px;
          opacity: 1;
        }

        .config-content.collapsed {
          max-height: 0;
          opacity: 0;
          pointer-events: none;
        }

        .kpi.calls-in-queue-card {
          position: relative;
          overflow: visible;
        }

        .kpi-topline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .queue-filter-inline {
          position: relative;
          display: none;
          flex: 0 0 auto;
        }

        .queue-filter-inline.visible {
          display: block;
        }

        .queue-filter-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 24px;
          max-width: 150px;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid var(--cardBorder);
          background: rgba(255,255,255,0.10);
          color: var(--text) !important;
          font-size: 11px;
          line-height: 1;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        :host(.theme-light) .queue-filter-button {
          background: rgba(0,0,0,0.06);
        }

        .queue-filter-menu {
          position: absolute;
          top: 30px;
          right: 0;
          z-index: 50;
          display: none;
          min-width: 210px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--cardBorder);
          background: var(--card);
          box-shadow: 0 12px 30px rgba(0,0,0,0.35);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
        }

        .queue-filter-inline.open .queue-filter-menu {
          display: block;
        }

        .queue-filter-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 4px;
          color: var(--text);
          font-size: 12px;
          cursor: pointer;
        }

        .queue-filter-option input {
          width: auto;
          margin: 0;
        }

        .queue-filter-hint {
          margin-top: 6px;
          padding-top: 8px;
          border-top: 1px solid var(--tableBorder);
          color: var(--muted);
          font-size: 11px;
          line-height: 1.3;
        }

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
      
      .diag-card { border: 1px solid var(--border-color, #c7c7c7); border-radius: 12px; padding: 12px; margin: 14px 0; background: rgba(127,127,127,0.06); }
      .diag-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .diag-subtitle { font-size: 11px; opacity: .75; margin-left: 8px; }
      .diag-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .diag-actions button { border: 1px solid var(--border-color, #bbb); border-radius: 8px; background: transparent; padding: 4px 8px; font-size: 11px; cursor: pointer; }
      .diag-log { max-height: 260px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 11px; line-height: 1.35; margin: 10px 0 0; padding: 10px; border-radius: 8px; background: rgba(0,0,0,.08); }

    </style>

      <div class="wrapper">
        <div class="card">
          <div class="header">
            <div>
              <h2 class="title">Supervisor Access Control</h2>
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

          <div class="config-toggle" id="configToggle">
            <div class="config-toggle-title">Call flow settings</div>
            <div class="config-toggle-icon">▼</div>
          </div>

          <div class="config-content" id="configContent">
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

          </div>

          <div class="dashboard">
            <div class="dashboard-title">Dashboard</div>

            <div class="kpis">
              <div class="kpi calls-in-queue-card" id="kpiCardCallsInQueue">
                <div class="kpi-topline">
                  <div class="kpi-label">Calls in Queue</div>
                  <div class="kpi-filter-controls">
                    <div class="queue-filter-inline" id="queueFilterWrapper">
                      <button class="queue-filter-button" id="queueFilterButton" type="button">Queues ▾</button>
                      <div class="queue-filter-menu" id="queueFilterMenu"></div>
                    </div>
                    <select class="kpi-duration-select" id="kpiDurationFilter" title="KPI Zeitraum">
                      <option value="today">Heute</option>
                      <option value="60m">60 min</option>
                      <option value="30m">30 min</option>
                    </select>
                  </div>
                </div>
                <div class="kpi-value" id="kpiCallsInQueue">0</div>
              </div>
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

            <div class="calls-card collapsible call-history-card">
              <div class="calls-toggle" id="callHistoryToggle">
                <div>
                  <div class="calls-toggle-title">
        <div class="diag-card">
          <div class="diag-header">
            <div>
              <strong>Diagnostics</strong>
              <span class="diag-subtitle">Frontend + Wallboard Log · Entries: <span id="diagLogCount">0</span></span>
            </div>
            <div class="diag-actions">
              <button type="button" id="diagToggle">Show Diagnostics</button>
              <button type="button" id="diagCopy">Copy Log</button>
              <button type="button" id="diagClear">Clear</button>
            </div>
          </div>
          <pre id="diagLogPanel" class="diag-log" style="display:none;"><code id="diagLogText"></code></pre>
        </div>

Call History</div>
                  <div class="calls-toggle-subtitle">Current selected queues · Last 24h</div>
                </div>
                <div class="calls-toggle-icon">▼</div>
              </div>
              <div class="calls-content" id="callHistoryContent">
                <div class="calls-table" id="callHistoryList">
                  <div class="call-row history call-header">
                    <div>Status</div><div>Queue</div><div>Caller</div><div>Agent</div><div>Wrapup Reason</div><div>Handle / Type</div><div>Termination Reason</div><div>Started</div><div>Duration</div><div>Task</div>
                  </div>
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

  readSessionCollapsed(key, defaultCollapsed = true) {
    try {
      const value = sessionStorage.getItem(key);
      if (value === null) return defaultCollapsed;
      return value !== "open";
    } catch {
      return defaultCollapsed;
    }
  }

  writeSessionCollapsed(key, collapsed) {
    try {
      sessionStorage.setItem(key, collapsed ? "collapsed" : "open");
    } catch {
      // Ignore storage issues inside embedded desktop.
    }
  }

  applySessionCollapseState() {
    const kpiDurationFilter = this.shadowRoot.getElementById("kpiDurationFilter");
    if (kpiDurationFilter) {
      kpiDurationFilter.value = this.kpiDurationRange || "60m";
      kpiDurationFilter.addEventListener("change", () => {
        this.kpiDurationRange = kpiDurationFilter.value || "60m";
        this.saveKpiDurationRange();
        this.analyticsMetricsCache = null;
        this.addDiagLog("analytics-duration-filter-changed", { range: this.kpiDurationRange });
        this.loadAnalyticsMetrics("duration-change").catch(err => {
          this.addDiagLog("analytics-probe-duration-change-failed", { message: err?.message || String(err) });
        });
      });
    }

    const configToggle = this.shadowRoot.getElementById("configToggle");
    const configContent = this.shadowRoot.getElementById("configContent");
    const callHistoryToggle = this.shadowRoot.getElementById("callHistoryToggle");
    const callHistoryContent = this.shadowRoot.getElementById("callHistoryContent");

    const configCollapsed = this.readSessionCollapsed(this.configCollapsedSessionKey, true);
    const callHistoryCollapsed = this.readSessionCollapsed(this.callHistoryCollapsedSessionKey, true);

    if (configToggle && configContent) {
      configToggle.classList.toggle("collapsed", configCollapsed);
      configContent.classList.toggle("collapsed", configCollapsed);
    }

    if (callHistoryToggle && callHistoryContent) {
      callHistoryToggle.classList.toggle("collapsed", callHistoryCollapsed);
      callHistoryContent.classList.toggle("collapsed", callHistoryCollapsed);
    }
  }

  bindEvents() {
    this.bindDiagLogEvents();
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

    const queueFilterButton = this.$queueFilterButton();
    const queueFilterWrapper = this.shadowRoot.getElementById("queueFilterWrapper");

    if (queueFilterButton && queueFilterWrapper) {
      queueFilterButton.addEventListener("click", event => {
        event.stopPropagation();
        queueFilterWrapper.classList.toggle("open");
      });

      this.shadowRoot.addEventListener("click", event => {
        if (!queueFilterWrapper.contains(event.target)) {
          queueFilterWrapper.classList.remove("open");
        }
      });
    }

    const configToggle = this.shadowRoot.getElementById("configToggle");
    const configContent = this.shadowRoot.getElementById("configContent");

    if (configToggle && configContent) {
      configToggle.addEventListener("click", () => {
        const collapsed = configContent.classList.toggle("collapsed");
        configToggle.classList.toggle("collapsed", collapsed);
        this.writeSessionCollapsed(this.configCollapsedSessionKey, collapsed);
      });
    }

    const callHistoryToggle = this.shadowRoot.getElementById("callHistoryToggle");
    const callHistoryContent = this.shadowRoot.getElementById("callHistoryContent");

    if (callHistoryToggle && callHistoryContent) {
      callHistoryToggle.addEventListener("click", () => {
        const collapsed = callHistoryContent.classList.toggle("collapsed");
        callHistoryToggle.classList.toggle("collapsed", collapsed);
        this.writeSessionCollapsed(this.callHistoryCollapsedSessionKey, collapsed);
      });
    }
  }

  markDirty() {
    this.hasUnsavedChanges = true;
    this.setStatus("Unsaved changes");
  }

  async init(runtimeId = this.runtimeId) {
    try {
      if (!this.guardRuntime(runtimeId)) return;
      await this.bootstrapSession();
      if (!this.guardRuntime(runtimeId)) return;

      // v38 lifecycle resilience:
      // The WXCC desktop can temporarily switch/park this iframe when the active user
      // accepts a call and Cisco Call Control takes focus. On return, the backend
      // entrypoint read may briefly fail with HTTP 500 although wallboard/SSE is fine.
      // Do not block wallboard startup on entrypoint configuration loading.
      try {
        await this.loadEntryPoint(true);
        this.setStatus("Ready");
      } catch (entryErr) {
        this.addDiagLog("entrypoint-load-nonfatal", {
          phase: "init",
          error: this.serializeError(entryErr)
        });
        this.setStatus(`Config temporarily unavailable: ${entryErr.message || entryErr}. Wallboard running.`);
        this.scheduleEntryPointRetry("init-entrypoint-failed");
      }

      this.startWallboardStream(runtimeId);
      this.startAnalyticsMetricsPolling(runtimeId);
    } catch (err) {
      this.addDiagLog("init-failed", { error: this.serializeError(err) });
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
  $queueFilterButton() { return this.shadowRoot.getElementById("queueFilterButton"); }
  $queueFilterMenu() { return this.shadowRoot.getElementById("queueFilterMenu"); }

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
    } catch (err) {
      this.addDiagLog("response-json-parse-failed", {
        status: res?.status,
        url: res?.url || "",
        message: err?.message || String(err),
        bodyPreview: String(text).slice(0, 1200)
      });
      return { error: text };
    }
  }

  async bootstrapSession() {
    if (this.isBootstrapping) return;
    this.isBootstrapping = true;

    try {
      const identity = await this.resolveDesktopIdentity();
      this.addDiagLog("bootstrap-start", { identity });
      const bootstrapStart = performance.now();

      const res = await fetch(`${this.API_URL}/api/session/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity)
      });

      const data = await this.readJsonResponse(res);
      this.addDiagLog("bootstrap-response", { status: res.status, durationMs: Math.round(performance.now() - bootstrapStart), role: data?.role || "", hasToken: Boolean(data?.sessionToken), error: data?.error || "" });

      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.sessionToken) throw new Error("Bootstrap response did not include a session token");

      this.sessionToken = data.sessionToken;
      this.currentRole = data.role || "viewer";
      this.currentIdentity = data.user || identity || null;
      this.rememberCurrentIdentity(this.currentIdentity);

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

    const method = options.method || "GET";
    const makeRequest = async attempt => {
      const start = performance.now();
      this.addDiagLog("fetch-request", { path, method, attempt, hasSessionToken: Boolean(this.sessionToken) });
      try {
        const res = await fetch(`${this.API_URL}${path}`, {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${this.sessionToken}`
          }
        });
        this.addDiagLog("fetch-response", {
          path,
          method,
          attempt,
          status: res.status,
          ok: res.ok,
          durationMs: Math.round(performance.now() - start),
          url: res.url || ""
        });
        return res;
      } catch (err) {
        this.addDiagLog("fetch-exception", {
          path,
          method,
          attempt,
          durationMs: Math.round(performance.now() - start),
          error: this.serializeError(err)
        });
        throw err;
      }
    };

    let res = await makeRequest(1);

    if (res.status === 401 && retryOn401) {
      this.addDiagLog("fetch-401-rebootstrap", { path, method });
      await this.bootstrapSession();
      res = await makeRequest(2);
    }

    return res;
  }

  async analyticsFetch(path, options = {}) {
    const method = options.method || "GET";

    if (!this.sessionToken) {
      this.addDiagLog("analytics-fetch-skipped", { path, method, reason: "no-session-token" });
      return { ok: false, status: 0, analyticsSkipped: true, json: async () => ({ ok: false, error: "No session token" }) };
    }

    const controller = new AbortController();
    const timeoutMs = Number(this.analyticsMetricsTimeoutMs || 8000);
    const start = performance.now();
    const timeout = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, timeoutMs);

    this.addDiagLog("analytics-fetch-request", { path, method, timeoutMs, hasSessionToken: Boolean(this.sessionToken) });

    try {
      const res = await fetch(`${this.API_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${this.sessionToken}`
        }
      });

      this.addDiagLog("analytics-fetch-response", {
        path,
        method,
        status: res.status,
        ok: res.ok,
        durationMs: Math.round(performance.now() - start),
        isolated: true,
        rebootstrap: false
      });

      if (res.status === 401) {
        this.addDiagLog("analytics-fetch-401-ignored", { path, method, reason: "analytics-is-optional-no-rebootstrap" });
      }

      return res;
    } catch (err) {
      this.addDiagLog("analytics-fetch-exception", {
        path,
        method,
        durationMs: Math.round(performance.now() - start),
        timeoutMs,
        isolated: true,
        rebootstrap: false,
        error: this.serializeError(err)
      });
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async loadEntryPoint(force = false) {
    if (!force && (this.isUpdating || this.hasUnsavedChanges)) return;

    const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`);
    const data = await this.readJsonResponse(res);

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    if (data?.stale === true || data?.configStale === true) {
      this.addDiagLog("entrypoint-stale-cache-used", {
        staleReason: data?.staleReason || data?.configStaleReason || "",
        lastError: data?.lastError ? String(data.lastError).slice(0, 800) : ""
      });
    }

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

  scheduleEntryPointRetry(reason = "entrypoint-retry", runtimeId = this.runtimeId) {
    if (!this.guardRuntime(runtimeId)) return;
    if (this.entryPointRetryTimer) {
      this.addDiagLog("entrypoint-retry-already-scheduled", { reason, runtimeId });
      return;
    }

    const retryDelayMs = 5000;
    this.addDiagLog("entrypoint-retry-scheduled", { reason, retryDelayMs, runtimeId });

    this.entryPointRetryTimer = this.safeSetTimeout(async () => {
      this.entryPointRetryTimer = null;
      if (!this.guardRuntime(runtimeId)) return;
      try {
        this.addDiagLog("entrypoint-retry-start", { reason, runtimeId });
        await this.loadEntryPoint(true);
        if (!this.guardRuntime(runtimeId)) return;
        this.addDiagLog("entrypoint-retry-success", { reason, runtimeId });
        if (!this.hasUnsavedChanges) this.setStatus("Ready");
      } catch (err) {
        this.addDiagLog("entrypoint-retry-failed", {
          reason,
          error: this.serializeError(err),
          runtimeId
        });
        this.scheduleEntryPointRetry("retry-failed", runtimeId);
      }
    }, retryDelayMs, runtimeId);
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

  formatDateTime(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return "-";

    try {
      return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch {
      return "-";
    }
  }

  getAgentDuration(agent) {
    const base = Number(agent.lastActivityTime || agent.startTime || 0);
    return base > 0 ? Math.max(0, Math.floor((Date.now() - base) / 1000)) : 0;
  }


  normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  extractAllowedQueuesFromWallboardData(data = {}) {
    const directQueues =
      data.allowedQueues ||
      data.user?.allowedQueues ||
      data.user?.queues ||
      data.queues ||
      [];

    return Array.from(
      new Set(
        (Array.isArray(directQueues) ? directQueues : [])
          .map(q => String(q || "").trim())
          .filter(Boolean)
      )
    );
  }

  getCallQueueName(call) {
    return (
      call?.queue ||
      call?.queueName ||
      call?.firstQueue ||
      call?.firstQueueName ||
      call?.lastQueue ||
      call?.destinationQueue ||
      call?.queueDisplayName ||
      ""
    );
  }

  normalizeEmpty(value) {
    const text = String(value || "").trim();
    return text || "-";
  }

  getWrapupReason(call) {
    const value =
      call?.wrapupReason ||
      call?.wrapUpReason ||
      call?.wrapUpCodeName ||
      call?.wrapupCodeName ||
      call?.wrapUpCode ||
      call?.wrapupCode ||
      call?.wrapUpReasonName ||
      call?.wrapupReasonName ||
      call?.wrapUpData?.name ||
      call?.wrapupData?.name ||
      call?.wrapUp?.name ||
      call?.wrapup?.name ||
      "";

    return String(value || "").trim() || "-";
  }

  getHandleType(call) {
    const value =
      call?.handleType ||
      call?.contactHandleType ||
      call?.abandonedType ||
      "";

    return String(value || "").trim() || "-";
  }

  getTerminationReason(call) {
    const value =
      call?.terminationReason ||
      call?.taskLegTerminationReason ||
      call?.taskLegStatus ||
      "";

    return String(value || "").trim() || "-";
  }

  updateQueueFilterOptions() {
    const wrapper = this.shadowRoot.getElementById("queueFilterWrapper");
    const button = this.$queueFilterButton();
    const menu = this.$queueFilterMenu();

    if (!wrapper || !button || !menu) return;

    menu.innerHTML = "";

    const allowedQueues = Array.isArray(this.allowedQueueNames)
      ? this.allowedQueueNames.filter(Boolean)
      : [];

    if (allowedQueues.length <= 1) {
      wrapper.classList.remove("visible", "open");
      this.selectedQueueFilters = allowedQueues.length === 1 ? [allowedQueues[0]] : [];
      this.saveSelectedQueueFilters();
      button.textContent = allowedQueues.length === 1 ? `${allowedQueues[0]} ▾` : "Queues ▾";
      return;
    }

    wrapper.classList.add("visible");

    const selected = Array.isArray(this.selectedQueueFilters)
      ? this.selectedQueueFilters.filter(q => allowedQueues.includes(q))
      : [];

    this.selectedQueueFilters = selected.length ? selected : [allowedQueues[0]];
    this.saveSelectedQueueFilters();

    allowedQueues.forEach(queueName => {
      const label = document.createElement("label");
      label.className = "queue-filter-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = queueName;
      checkbox.checked = this.selectedQueueFilters.includes(queueName);

      checkbox.addEventListener("change", async () => {
        const checkedValues = Array.from(
          menu.querySelectorAll('input[type="checkbox"]:checked')
        ).map(input => input.value);

        if (!checkedValues.length) {
          checkbox.checked = true;
          return;
        }

        this.selectedQueueFilters = checkedValues;
        this.saveSelectedQueueFilters();
        this.updateQueueFilterButtonLabel();

        if (this.lastWallboardData) {
          this.processWallboardData(this.lastWallboardData);
        } else {
          await this.loadWallboard();
        }
      });

      const text = document.createElement("span");
      text.textContent = queueName;

      label.appendChild(checkbox);
      label.appendChild(text);
      menu.appendChild(label);
    });

    const hint = document.createElement("div");
    hint.className = "queue-filter-hint";
    hint.textContent = "Mehrere Queues können gleichzeitig ausgewählt werden.";
    menu.appendChild(hint);

    this.updateQueueFilterButtonLabel();
  }

  updateQueueFilterButtonLabel() {
    const button = this.$queueFilterButton();
    if (!button) return;

    const selected = Array.isArray(this.selectedQueueFilters)
      ? this.selectedQueueFilters
      : [];

    if (!selected.length) {
      button.textContent = "Queues ▾";
    } else if (selected.length === 1) {
      button.textContent = `${selected[0]} ▾`;
    } else {
      button.textContent = `${selected.length} Queues ▾`;
    }
  }

  getVisibleQueueNames() {
    const allowedQueues = Array.isArray(this.allowedQueueNames) ? this.allowedQueueNames : [];

    if (!allowedQueues.length) return [];

    const selected = Array.isArray(this.selectedQueueFilters)
      ? this.selectedQueueFilters.filter(q => allowedQueues.includes(q))
      : [];

    return selected.length ? selected : [allowedQueues[0]];
  }

  isQueueVisibleForCurrentUser(queueName) {
    const allowedQueues = Array.isArray(this.allowedQueueNames) ? this.allowedQueueNames : [];

    if (!allowedQueues.length) return false;

    const visibleQueues = this.getVisibleQueueNames();
    const normalizedQueue = this.normalizeText(queueName);

    return visibleQueues.some(q => this.normalizeText(q) === normalizedQueue);
  }

  filterCallsByAllowedQueues(calls) {
    const list = Array.isArray(calls) ? calls : [];

    return list.filter(call => {
      const queueName = this.getCallQueueName(call);
      if (!queueName && call?.reconstructed === true) return true;
      return this.isQueueVisibleForCurrentUser(queueName);
    });
  }

  calculateQueueKpisFromVisibleCalls(waitingCalls, activeCalls, originalQueue = {}) {
    const visibleWaiting = Array.isArray(waitingCalls) ? waitingCalls : [];
    const visibleActive = Array.isArray(activeCalls) ? activeCalls : [];

    const waitingDurations = visibleWaiting
      .map(call => Number(call.waitingSeconds || 0))
      .filter(value => Number.isFinite(value) && value >= 0);

    const activeDurations = visibleActive
      .map(call => Math.round(Number(call.connectedDuration || 0) / 1000))
      .filter(value => Number.isFinite(value) && value >= 0);

    const avg = values => {
      if (!values.length) return 0;
      return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    };

    return {
      callsInQueue: visibleWaiting.length,
      activeCalls: visibleActive.length,
      longestWaitingSeconds: waitingDurations.length ? Math.max(...waitingDurations) : 0,
      avgWaitSeconds: waitingDurations.length ? avg(waitingDurations) : 0,
      avgHandleSeconds: activeDurations.length ? avg(activeDurations) : Number(originalQueue.avgHandleSeconds || 0)
    };
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

    calls.map(call => this.enrichActiveCallDeterministically(call)).forEach(call => {
      const row = document.createElement("div");
      row.className = "call-row";
      row.innerHTML = `
        <div>${call.status || "-"}</div>
        <div>${this.getCallQueueName(call) || "-"}</div>
        <div>${call.caller || "-"}</div>
        <div>${call.entryPoint || "-"}</div>
        <div>${this.formatDuration(call.waitingSeconds)}</div>
        <div>${this.shortId(call.id)}</div>
      `;
      list.appendChild(row);
    });
  }


  updateDeterministicDirectories(snapshot = {}) {
    const now = Date.now();
    const agents = Array.isArray(snapshot.agentList) ? snapshot.agentList : [];
    const calls = [];
    if (Array.isArray(snapshot.taskList)) calls.push(...snapshot.taskList);
    if (Array.isArray(snapshot.waitingTaskList)) calls.push(...snapshot.waitingTaskList);
    if (Array.isArray(snapshot.callHistoryList)) calls.push(...snapshot.callHistoryList);

    agents.forEach(agent => {
      const agentId = this.resolveAgentId(agent);
      if (!agentId) return;
      const previous = this.agentDirectory.get(agentId) || {};
      this.agentDirectory.set(agentId, {
        ...previous,
        agentId,
        name: agent.name || agent.agentName || agent.displayName || agent.login || previous.name || "",
        login: agent.login || previous.login || "",
        team: agent.team || agent.teamName || previous.team || "",
        teamId: agent.teamId || previous.teamId || "",
        lastSeenMs: now
      });
    });

    // v50: bind the signed-in desktop identity id to the canonical wallboard row if
    // both represent the same display name but use different ids.
    try {
      const currentIdentityId = String(this.currentIdentity?.userId || this.currentIdentity?.agentId || this.currentIdentity?.id || "");
      const currentIdentityName = this.cleanDisplayValue(this.currentIdentity?.displayName || this.currentIdentity?.name || "");
      if (currentIdentityId && currentIdentityName) {
        const match = agents.map(a => ({ agent: a, id: this.resolveAgentId(a), name: this.cleanDisplayValue(a.name || a.agentName || a.displayName || a.login) }))
          .find(x => x.id && x.name && x.name.toLowerCase() === currentIdentityName.toLowerCase());
        if (match && match.id !== currentIdentityId) this.rememberAgentIdAlias(currentIdentityId, match.id, "directory-current-identity-name-match");
      }
    } catch {}

    calls.forEach(call => {
      const taskId = String(call.id || call.taskId || "");
      const agentId = String(call.agentId || call.lastAgentId || call.lastAgent?.id || "");
      const queueId = String(call.queueId || call.firstQueueId || call.lastQueueId || call.lastQueue?.id || "");
      const queueName = this.getCallQueueName(call) || call.lastQueue?.name || "";

      if (queueId && queueName && queueName !== "-") {
        this.queueDirectory.set(queueId, { id: queueId, name: queueName, lastSeenMs: now });
      }
      if (!taskId) return;

      const previous = this.taskOwnershipMap.get(taskId) || {};
      this.taskOwnershipMap.set(taskId, {
        ...previous,
        taskId,
        agentId: agentId || previous.agentId || "",
        queueId: queueId || previous.queueId || "",
        queueName: queueName || previous.queueName || "",
        caller: call.caller || call.origin || previous.caller || "",
        destination: call.destination || previous.destination || "",
        updatedAtMs: now
      });
    });

    this.pruneTaskOwnershipMap(now);
    this.persistTaskOwnership();
  }

  pruneTaskOwnershipMap(now = Date.now()) {
    for (const [taskId, row] of this.taskOwnershipMap.entries()) {
      if (Number(row.updatedAtMs || 0) && now - Number(row.updatedAtMs || 0) > this.taskOwnershipTtlMs) {
        this.taskOwnershipMap.delete(taskId);
      }
    }
  }

  rememberCurrentIdentity(user = {}) {
    const agentId = String(user?.userId || user?.agentId || user?.id || "");
    if (!agentId) return;
    const name = this.cleanDisplayValue(user?.displayName) || this.cleanDisplayValue(user?.name) || this.cleanDisplayValue(user?.email) || agentId;
    const previous = this.agentDirectory.get(agentId) || {};
    this.agentDirectory.set(agentId, {
      ...previous,
      agentId,
      id: agentId,
      name: previous.name || name,
      login: previous.login || this.cleanDisplayValue(user?.email) || "",
      team: previous.team || "",
      teamId: previous.teamId || String(user?.teamId || ""),
      lastSeenMs: Date.now(),
      source: previous.source || "bootstrap-identity"
    });
    this.currentUserById.set(agentId, { agentId, name, user });
  }

  getAgentNameById(agentId) {
    const id = String(agentId || "");
    const row = this.agentDirectory.get(id);
    const current = this.currentUserById.get(id);
    return this.cleanDisplayValue(row?.name) || this.cleanDisplayValue(row?.login) || this.cleanDisplayValue(current?.name) || "";
  }


  getVisibleAgentDisplayNameById(agentId) {
    const id = String(agentId || "");
    if (!id) return "";
    const list = Array.isArray(this.lastWallboardData?.agentList) ? this.lastWallboardData.agentList : [];
    const row = list.find(agent => this.resolveAgentId(agent) === id);
    return this.cleanDisplayValue(row?.name || row?.agentName || row?.displayName || row?.login) || this.getAgentNameById(id) || "";
  }

  getSingleConnectedRosterAgentForActiveCall(call = {}) {
    const list = Array.isArray(this.lastWallboardData?.agentList) ? this.lastWallboardData.agentList : [];
    if (!list.length) return null;

    const connectedRows = list.filter(agent => String(agent.state || agent.currentState || "").toLowerCase() === "connected");
    if (connectedRows.length !== 1) return null;

    const activeCalls = Array.isArray(this.lastWallboardData?.taskList)
      ? this.lastWallboardData.taskList.filter(task => String(task.status || "").toLowerCase() === "connected")
      : [];
    if (activeCalls.length > 1) return null;

    const row = connectedRows[0];
    const agentId = this.resolveAgentId(row);
    const agentName = this.cleanDisplayValue(row.name || row.agentName || row.displayName || row.login) || this.getAgentNameById(agentId);
    if (!agentId || !agentName) return null;

    return { agentId, agentName, source: "single-connected-roster-agent" };
  }

  rememberAgentIdAlias(eventAgentId, canonicalAgentId, reason = "") {
    const source = String(eventAgentId || "");
    const target = String(canonicalAgentId || "");
    if (!source || !target || source === target) return;
    this.agentIdAliasMap.set(source, { source, target, reason, updatedAtMs: Date.now() });
    this.addDiagLog("agent-id-alias-bound", { source, target, reason });
  }

  pruneAgentIdAliases(now = Date.now()) {
    for (const [source, row] of this.agentIdAliasMap.entries()) {
      const updatedAtMs = Number(row?.updatedAtMs || 0);
      if (updatedAtMs && now - updatedAtMs > this.agentIdAliasTtlMs) this.agentIdAliasMap.delete(source);
    }
  }

  getCanonicalAgentIdForEvent(eventAgentId, byId = new Map(), override = {}) {
    const source = String(eventAgentId || "");
    if (!source) return "";
    if (byId.has(source)) return source;

    const now = Date.now();
    this.pruneAgentIdAliases(now);
    const existing = this.agentIdAliasMap.get(source);
    if (existing?.target && byId.has(existing.target)) return existing.target;

    // v50: WXCC events can use a different user/contact-center id than the wallboard roster.
    // If this is the signed-in desktop user, bind the event id to the visible roster row by name.
    const currentIdentityId = String(this.currentIdentity?.userId || this.currentIdentity?.agentId || this.currentIdentity?.id || "");
    const currentIdentityName = this.cleanDisplayValue(this.currentIdentity?.displayName || this.currentIdentity?.name || "");
    if (source === currentIdentityId && currentIdentityName) {
      const target = Array.from(byId.values()).find(row => this.cleanDisplayValue(row.name || row.displayName || row.login).toLowerCase() === currentIdentityName.toLowerCase());
      if (target) {
        const targetId = this.resolveAgentId(target);
        this.rememberAgentIdAlias(source, targetId, "current-identity-name-match");
        return targetId;
      }
    }

    // If a task ownership record contains a human agent name, use it to bind event-id -> roster-id.
    const taskId = String(override?.taskId || "");
    if (taskId) {
      const binding = this.taskOwnershipMap.get(taskId) || {};
      const bindingName = this.cleanDisplayValue(binding.agentName || binding.name || "");
      if (bindingName) {
        const target = Array.from(byId.values()).find(row => this.cleanDisplayValue(row.name || row.displayName || row.login).toLowerCase() === bindingName.toLowerCase());
        if (target) {
          const targetId = this.resolveAgentId(target);
          this.rememberAgentIdAlias(source, targetId, "task-ownership-name-match");
          return targetId;
        }
      }
    }

    // Conservative fallback for the common supervisor test case:
    // an event-only terminal state arrives for the one visible agent that is not currently in a call.
    // This allows status changes for Agent3/Agent4 while Supervisor1 is on an active call, without
    // rendering UUID phantom rows. If more than one candidate exists, do not guess.
    const eventState = String(override?.currentState || "").toLowerCase();
    const terminalOrIdle = ["available", "idle", "wrapup-done"].includes(eventState);
    if (terminalOrIdle && byId.size <= 3) {
      const currentNameLower = currentIdentityName.toLowerCase();
      const candidates = Array.from(byId.values()).filter(row => {
        const name = this.cleanDisplayValue(row.name || row.displayName || row.login);
        if (!name) return false;
        if (currentNameLower && name.toLowerCase() === currentNameLower && source !== currentIdentityId) return false;
        const state = String(row.state || row.currentState || "").toLowerCase();
        return !["connected", "ringing", "wrapup"].includes(state);
      });
      if (candidates.length === 1) {
        const targetId = this.resolveAgentId(candidates[0]);
        this.rememberAgentIdAlias(source, targetId, "single-visible-nonbusy-roster-candidate");
        return targetId;
      }
    }

    return "";
  }

  getAuthoritativeOverrideForAgent(agentId) {
    const canonicalId = String(agentId || "");
    if (!canonicalId) return null;
    const direct = this.agentStateEventCache.get(canonicalId);
    if (direct) return { override: direct, eventAgentId: canonicalId, canonicalAgentId: canonicalId, stateSource: "authoritative-event-direct" };
    const now = Date.now();
    this.pruneAgentIdAliases(now);
    for (const [eventAgentId, alias] of this.agentIdAliasMap.entries()) {
      if (alias?.target !== canonicalId) continue;
      const override = this.agentStateEventCache.get(eventAgentId);
      if (override) return { override, eventAgentId, canonicalAgentId: canonicalId, stateSource: "authoritative-event-alias" };
    }
    return null;
  }

  resolveAgentId(agent = {}) {
    return String(agent.agentId || agent.id || agent.userId || agent.ciUserId || agent.ownerId || "");
  }

  cleanDisplayValue(value) {
    const text = String(value || "").trim();
    if (!text || text === "-" || text.toLowerCase() === "unknown" || text.toLowerCase() === "null") return "";
    return text;
  }

  persistTaskOwnership() {
    try {
      const now = Date.now();
      const rows = [];
      for (const [taskId, row] of this.taskOwnershipMap.entries()) {
        const updatedAtMs = Number(row?.updatedAtMs || 0);
        if (updatedAtMs && now - updatedAtMs > this.taskOwnershipTtlMs) {
          this.taskOwnershipMap.delete(taskId);
          continue;
        }
        rows.push(row);
      }
      localStorage.setItem(this.taskOwnershipPersistenceKey, JSON.stringify(rows.slice(-200)));
    } catch {}
  }

  restorePersistentTaskOwnership() {
    try {
      const raw = localStorage.getItem(this.taskOwnershipPersistenceKey);
      const parsed = JSON.parse(raw || "[]");
      const now = Date.now();
      this.taskOwnershipMap = new Map();
      if (Array.isArray(parsed)) {
        parsed.forEach(row => {
          const taskId = String(row?.taskId || "");
          const updatedAtMs = Number(row?.updatedAtMs || 0);
          if (!taskId || (updatedAtMs && now - updatedAtMs > this.taskOwnershipTtlMs)) return;
          this.taskOwnershipMap.set(taskId, row);
        });
      }
      this.addDiagLog("task-ownership-cache-restored", { rows: this.taskOwnershipMap.size });
    } catch (err) {
      this.taskOwnershipMap = new Map();
      this.addDiagLog("task-ownership-cache-restore-failed", { message: err.message });
    }
  }

  rebindActiveCallOwnership(taskId, agentId, details = {}) {
    const id = String(taskId || "");
    const boundAgentId = String(agentId || "");
    if (!id || !boundAgentId) return false;

    const now = Date.now();
    const previousBinding = this.taskOwnershipMap.get(id) || {};
    const currentName = this.currentUserById?.get(boundAgentId)?.name || "";
    const agentName = this.cleanDisplayValue(details.agentName) || this.getVisibleAgentDisplayNameById(boundAgentId) || this.getAgentNameById(boundAgentId) || this.cleanDisplayValue(currentName) || previousBinding.agentName || "";
    const queueId = String(details.queueId || previousBinding.queueId || "");
    const queueName = this.cleanDisplayValue(details.queueName) || previousBinding.queueName || (queueId ? this.queueDirectory.get(queueId)?.name : "") || "";

    this.taskOwnershipMap.set(id, {
      ...previousBinding,
      taskId: id,
      agentId: boundAgentId,
      agentName: agentName || previousBinding.agentName || "",
      queueId: queueId || previousBinding.queueId || "",
      queueName: queueName || previousBinding.queueName || "",
      caller: details.caller || previousBinding.caller || "",
      destination: details.destination || previousBinding.destination || "",
      updatedAtMs: now
    });

    let patched = 0;
    for (const [key, call] of Array.from(this.activeCallRenderCache.entries())) {
      const sameTask = String(call.taskId || call.id || "") === id || key === id;
      if (!sameTask) continue;
      const enriched = this.enrichActiveCallDeterministically({
        ...call,
        id: call.id || id,
        taskId: id,
        agentId: boundAgentId,
        agent: this.cleanDisplayValue(call.agent) || agentName || "",
        queueId: queueId || call.queueId || "",
        queue: this.cleanDisplayValue(call.queue) || queueName || "",
        localLastSeenMs: now
      });
      this.activeCallRenderCache.set(key, enriched);
      patched += 1;
    }

    this.persistTaskOwnership();
    if (patched) this.persistActiveCalls();
    this.addDiagLog("active-call-ownership-rebound", { taskId: id, agentId: boundAgentId, agentName, queueId, queueName, patched });
    return patched > 0;
  }

  repairRestoredActiveCallOwnership() {
    let repaired = 0;
    for (const [id, call] of Array.from(this.activeCallRenderCache.entries())) {
      const taskId = String(call.taskId || call.id || id || "");
      if (!taskId) continue;
      const binding = this.taskOwnershipMap.get(taskId) || {};
      const agentId = String(call.agentId || binding.agentId || "");
      const agent = this.cleanDisplayValue(call.agent) || this.cleanDisplayValue(binding.agentName) || this.getAgentNameById(agentId);
      if (!agentId && !agent) continue;
      if (this.cleanDisplayValue(call.agent) && String(call.agentId || "")) continue;
      const patched = this.enrichActiveCallDeterministically({
        ...call,
        agentId: agentId || call.agentId || "",
        agent: agent || "",
        queueId: call.queueId || binding.queueId || "",
        queue: this.cleanDisplayValue(call.queue) || binding.queueName || ""
      });
      this.activeCallRenderCache.set(id, patched);
      repaired += 1;
    }
    if (repaired) {
      this.persistActiveCalls();
      this.addDiagLog("active-call-ownership-restored", { repaired });
    }
    return repaired;
  }

  rememberRelationalStateFromWxccEvent(details = {}) {
    try {
      const normalized = this.normalizeWxccEventBody(this.extractWxccEventBody(details));
      const data = normalized.data || {};
      const type = String(normalized.type || "");
      const now = Date.now();
      const taskId = String(data.taskId || data.interactionId || data.contactId || data.contactSessionId || data.id || "");
      const agentId = String(data.agentId || data.ownerId || data.userId || "");
      const queueId = String(data.queueId || data.firstQueueId || data.lastQueueId || "");
      const queueName = String(data.queueName || data.firstQueueName || data.lastQueueName || "");

      if (queueId && queueName) this.queueDirectory.set(queueId, { id: queueId, name: queueName, lastSeenMs: now });
      if (!taskId) return;

      const previous = this.taskOwnershipMap.get(taskId) || {};
      const nextBinding = {
        ...previous,
        taskId,
        agentId: agentId || previous.agentId || "",
        agentName: data.agentName || data.agentDisplayName || previous.agentName || this.getAgentNameById(agentId || previous.agentId) || "",
        queueId: queueId || previous.queueId || "",
        queueName: queueName || previous.queueName || "",
        caller: data.origin || data.from || data.ani || data.caller || previous.caller || "",
        destination: data.destination || data.to || data.dnis || previous.destination || "",
        eventType: type || previous.eventType || "",
        eventState: data.currentState || data.state || previous.eventState || "",
        updatedAtMs: now
      };
      this.taskOwnershipMap.set(taskId, nextBinding);
      this.persistTaskOwnership();

      if (agentId) {
        this.rebindActiveCallOwnership(taskId, agentId, {
          agentName: nextBinding.agentName,
          queueId: nextBinding.queueId,
          queueName: nextBinding.queueName,
          caller: nextBinding.caller,
          destination: nextBinding.destination
        });
      }

      this.addDiagLog("deterministic-task-binding-updated", {
        taskId,
        agentId: agentId || previous.agentId || "",
        queueId: queueId || previous.queueId || "",
        type
      });
    } catch (err) {
      this.addDiagLog("deterministic-task-binding-failed", { message: err.message });
    }
  }

  enrichActiveCallDeterministically(call = {}) {
    const id = String(call.id || call.taskId || "");
    const binding = this.taskOwnershipMap.get(id) || {};
    const agentId = String(call.agentId || binding.agentId || call.lastAgent?.id || "");
    const queueId = String(call.queueId || binding.queueId || call.firstQueueId || call.lastQueue?.id || "");
    const queueNameFromId = queueId ? this.queueDirectory.get(queueId)?.name : "";
    const rosterFallback = this.getSingleConnectedRosterAgentForActiveCall(call);
    const resolvedAgentId = agentId || rosterFallback?.agentId || "";
    const agentName =
      this.cleanDisplayValue(call.agent) ||
      this.cleanDisplayValue(call.agentName) ||
      this.cleanDisplayValue(call.lastAgent?.name) ||
      this.cleanDisplayValue(binding.agentName) ||
      this.getVisibleAgentDisplayNameById(resolvedAgentId) ||
      rosterFallback?.agentName ||
      "";
    const queueName =
      this.cleanDisplayValue(this.getCallQueueName(call)) ||
      this.cleanDisplayValue(binding.queueName) ||
      this.cleanDisplayValue(queueNameFromId) ||
      this.cleanDisplayValue(call.queue) ||
      this.cleanDisplayValue(call.queueName) ||
      "";

    return {
      ...call,
      id: id || call.id,
      taskId: id || call.taskId,
      agentId: resolvedAgentId,
      queueId,
      queue: queueName,
      caller: call.caller || call.origin || binding.caller || "",
      destination: call.destination || binding.destination || "",
      agent: agentName,
      agentFallbackSource: (!agentId && rosterFallback?.agentName) ? rosterFallback.source : "",
      deterministicEnriched: true
    };
  }


  isRealtimeBusyAgentState(state) {
    const value = String(state || "").toLowerCase();
    return ["ringing", "connected", "wrapup"].includes(value);
  }

  isSnapshotTerminalAgentState(state) {
    const value = String(state || "").toLowerCase();
    if (!value) return false;
    return !["ringing", "connected", "wrapup"].includes(value);
  }

  getSnapshotAgentById(snapshot = {}, agentId = "") {
    const id = String(agentId || "");
    if (!id) return null;
    const list = Array.isArray(snapshot.agentList) ? snapshot.agentList : [];
    return list.find(agent => String(agent.agentId || agent.id || agent.userId || "") === id) || null;
  }

  reconcileAgentStateAuthorityBeforeProjection(snapshot = {}) {
    const now = Date.now();
    const activeTasks = Array.isArray(snapshot.taskList) ? snapshot.taskList : [];
    const activeTaskIds = new Set(activeTasks.map(task => String(task.id || task.taskId || "")).filter(Boolean));
    let removed = 0;
    let terminalPromoted = 0;

    for (const [agentId, override] of Array.from(this.agentStateEventCache.entries())) {
      const ageMs = now - Number(override.receivedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > this.agentStateEventTtlMs) {
        this.agentStateEventCache.delete(agentId);
        removed += 1;
        continue;
      }

      const state = String(override.currentState || override.displayState || "").toLowerCase();
      const taskId = String(override.taskId || "");
      const snapshotAgent = this.getSnapshotAgentById(snapshot, agentId);
      const snapshotState = String(snapshotAgent?.state || snapshotAgent?.currentState || "");

      // v45: after reconnect, a stale Ringing/Connected/Wrapup event must not pin the row forever.
      // If the current wallboard has no active task for that taskId and the snapshot already shows a
      // non-busy state, drop the old event authority and let the snapshot/custom idle code win.
      if (
        this.isRealtimeBusyAgentState(state) &&
        taskId &&
        !activeTaskIds.has(taskId) &&
        this.isSnapshotTerminalAgentState(snapshotState) &&
        ageMs > 12000
      ) {
        this.agentStateEventCache.delete(agentId);
        removed += 1;
        this.addDiagLog("agent-state-authority-stale-busy-cleared", { agentId, taskId, state, snapshotState, ageMs });
        continue;
      }

      // Idle without taskId is a terminal agent-state event. It should clear old task ownership and
      // prevent a previous Wrapup projection from surviving a widget recreation.
      if (state === "idle" && !taskId) {
        terminalPromoted += 1;
      }
    }

    if (removed || terminalPromoted) {
      this.persistAgentStates();
      this.addDiagLog("agent-state-authority-reconciled", { removed, terminalPromoted });
    }
  }

  getDeterministicDisplayStateForAgent(agentId, baseAgent = {}, override = null) {
    if (!override) return baseAgent.state || baseAgent.currentState || "";
    const eventState = String(override.currentState || "").toLowerCase();
    const snapshotState = String(baseAgent.state || baseAgent.currentState || "");

    // v47: terminal realtime events are always authoritative. A stale Search snapshot must
    // never render Wrapup/Meeting/Connected after an available/wrapup-done event was received.
    if (eventState === "available" || eventState === "wrapup-done") return "Available";

    // For custom idle codes, Search may know the readable idle label. Preserve only terminal
    // labels; never preserve a busy snapshot over an idle event.
    if (eventState === "idle") {
      if (this.isSnapshotTerminalAgentState(snapshotState) && snapshotState.toLowerCase() !== "available") {
        return snapshotState;
      }
      return override.displayState || "Idle";
    }

    return override.displayState || snapshotState || "";
  }

  buildAuthoritativeAgents(snapshot = {}) {
    const now = Date.now();
    const snapshotAgents = Array.isArray(snapshot.agentList) ? snapshot.agentList : [];
    const byId = new Map();
    let skippedNoId = 0;
    let skippedBootstrapOnly = 0;
    let dedupedByName = 0;

    // v48 canonical identity rule:
    // The WXCC desktop/bootstrap identity is useful as context and name enrichment,
    // but it must never create a standalone agent row. Renderable rows are only
    // created from WXCC wallboard agents or from a fresh event-authoritative state.
    snapshotAgents.forEach(agent => {
      const agentId = this.resolveAgentId(agent);
      if (!agentId) {
        skippedNoId += 1;
        return;
      }
      const directory = this.agentDirectory.get(agentId) || {};
      byId.set(agentId, {
        ...directory,
        ...agent,
        agentId,
        id: agentId,
        renderSource: "snapshot-agent",
        name: this.cleanDisplayValue(agent.name || agent.agentName || agent.displayName) || directory.name || directory.login || agentId,
        team: this.cleanDisplayValue(agent.team || agent.teamName) || directory.team || "",
        teamId: agent.teamId || directory.teamId || ""
      });
    });

    // v50 final state authority:
    // Keep the authoritative roster-only rule from v49, but allow event states whose WXCC
    // event agentId can be mapped to a visible canonical roster row. This fixes the case
    // where the Desktop status changes immediately, while the wallboard snapshot still
    // shows the previous idle code during an active call.
    let skippedEventOnly = 0;
    let aliasedEventAuthority = 0;
    const canonicalEvents = new Map();
    for (const [eventAgentId, override] of this.agentStateEventCache.entries()) {
      const ageMs = now - Number(override.receivedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > this.agentStateEventTtlMs) continue;
      const canonicalId = this.getCanonicalAgentIdForEvent(eventAgentId, byId, override);
      if (!canonicalId || !byId.has(canonicalId)) {
        skippedEventOnly += 1;
        continue;
      }
      if (canonicalId !== eventAgentId) aliasedEventAuthority += 1;
      const existing = canonicalEvents.get(canonicalId);
      if (!existing || Number(override.createdTime || 0) >= Number(existing.override?.createdTime || 0)) {
        canonicalEvents.set(canonicalId, { override, eventAgentId, canonicalId });
      }
    }

    let applied = 0;
    for (const [agentId, agent] of byId.entries()) {
      const mapped = canonicalEvents.get(agentId);
      if (!mapped) continue;
      const { override, eventAgentId, canonicalId } = mapped;
      const ageMs = now - Number(override.receivedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > this.agentStateEventTtlMs) {
        this.agentStateEventCache.delete(eventAgentId);
        continue;
      }
      const sourceState = String(agent.state || agent.currentState || "");
      const finalState = this.getDeterministicDisplayStateForAgent(agentId, agent, override);
      agent.state = finalState;
      agent.currentState = override.currentState;
      agent.taskId = override.taskId || agent.taskId || "";
      agent.queueId = override.queueId || agent.queueId || "";
      agent.name = this.cleanDisplayValue(agent.name) || this.getAgentNameById(agentId) || agent.login || agentId;
      agent.eventAuthority = {
        applied: true,
        ageMs,
        eventState: override.currentState,
        displayState: override.displayState,
        finalState,
        sourceState,
        stateSource: eventAgentId === canonicalId ? "authoritative-event-direct" : "authoritative-event-alias",
        eventAgentId,
        canonicalAgentId: canonicalId,
        taskId: override.taskId || ""
      };
      applied += 1;
    }

    // Final v48 de-dupe: prefer real snapshot rows over event-only rows and never
    // render Unknown/bootstrap-like duplicates with the same display name.
    const preferredByName = new Map();
    const priority = row => row.renderSource === "snapshot-agent" ? 3 : (row.eventAuthority?.applied ? 2 : 1);
    for (const row of byId.values()) {
      const agentId = this.resolveAgentId(row);
      if (!agentId) { skippedNoId += 1; continue; }
      const name = this.cleanDisplayValue(row.name || row.agentName || row.displayName || row.login);
      if (!name) { skippedNoId += 1; continue; }
      const state = String(row.state || row.currentState || "").toLowerCase();
      if (row.renderSource !== "snapshot-agent" && !row.eventAuthority?.applied && (!state || state === "unknown")) {
        skippedBootstrapOnly += 1;
        continue;
      }
      const looksLikeUuidName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name);
      if (looksLikeUuidName && row.renderSource !== "snapshot-agent") {
        skippedBootstrapOnly += 1;
        continue;
      }
      const key = name.toLowerCase();
      const existing = preferredByName.get(key);
      if (!existing || priority(row) > priority(existing)) {
        if (existing) dedupedByName += 1;
        preferredByName.set(key, row);
      } else {
        dedupedByName += 1;
      }
    }

    const rows = Array.from(preferredByName.values()).sort((a, b) => String(a.name || a.login || "").localeCompare(String(b.name || b.login || "")));
    const agentsSummary = {
      loggedIn: rows.length,
      available: rows.filter(agent => String(agent.state || "").toLowerCase() === "available").length,
      connected: rows.filter(agent => String(agent.state || "").toLowerCase() === "connected").length
    };
    this.addDiagLog("deterministic-agent-projection-built", {
      rows: rows.length,
      eventAuthorityApplied: applied,
      skippedNoId,
      skippedBootstrapOnly,
      skippedEventOnly,
      aliasedEventAuthority,
      dedupedByName,
      sourceSnapshotRows: snapshotAgents.length,
      authoritativeRosterOnly: true,
      canonicalIdentity: true,
      finalStateAuthority: true
    });
    return { rows, agentsSummary };
  }



  isTerminalCallState(state) {
    const value = String(state || "").toLowerCase();
    return ["available", "idle", "wrapup-done", "ended", "terminated", "disconnected", "completed"].includes(value);
  }

  rememberTerminalActiveCall(taskId, agentId = "", state = "terminal", reason = "event-terminal") {
    const id = String(taskId || "");
    const now = Date.now();
    if (!id) return;
    this.activeCallTerminalCache.set(id, {
      id,
      taskId: id,
      agentId: String(agentId || ""),
      state: String(state || "terminal").toLowerCase(),
      reason,
      terminalAtMs: now,
      expiresAtMs: now + this.activeCallTerminalTtlMs
    });
    this.persistActiveCallTerminals();
  }

  restorePersistentActiveCallTerminals() {
    try {
      const raw = localStorage.getItem(this.activeCallTerminalPersistenceKey);
      const parsed = JSON.parse(raw || "[]");
      const now = Date.now();
      this.activeCallTerminalCache = new Map();
      if (Array.isArray(parsed)) {
        parsed.forEach(row => {
          const id = String(row?.id || row?.taskId || "");
          const expiresAtMs = Number(row?.expiresAtMs || 0);
          if (!id || (expiresAtMs && now > expiresAtMs)) return;
          this.activeCallTerminalCache.set(id, row);
        });
      }
      this.addDiagLog("active-call-terminal-cache-restored", { rows: this.activeCallTerminalCache.size });
    } catch (err) {
      this.activeCallTerminalCache = new Map();
      this.addDiagLog("active-call-terminal-cache-restore-failed", { message: err.message });
    }
  }

  persistActiveCallTerminals() {
    try {
      const now = Date.now();
      const rows = [];
      for (const [id, row] of this.activeCallTerminalCache.entries()) {
        const expiresAtMs = Number(row?.expiresAtMs || 0);
        if (expiresAtMs && now > expiresAtMs) {
          this.activeCallTerminalCache.delete(id);
          continue;
        }
        rows.push(row);
      }
      localStorage.setItem(this.activeCallTerminalPersistenceKey, JSON.stringify(rows.slice(-100)));
    } catch {}
  }

  isTerminalActiveCallId(id) {
    const key = String(id || "");
    if (!key) return false;
    const row = this.activeCallTerminalCache.get(key);
    if (!row) return false;
    const now = Date.now();
    const expiresAtMs = Number(row.expiresAtMs || 0);
    if (expiresAtMs && now > expiresAtMs) {
      this.activeCallTerminalCache.delete(key);
      this.persistActiveCallTerminals();
      return false;
    }
    return true;
  }

  hardEvictActiveCall(taskIdOrId, reason = "hard-evict", details = {}) {
    const id = String(taskIdOrId || "");
    if (!id) return 0;
    let removed = 0;
    if (this.activeCallRenderCache?.delete(id)) removed += 1;

    // Also remove any synthetic or duplicate rows bound to the same task/agent.
    const agentId = String(details.agentId || "");
    for (const [key, call] of Array.from(this.activeCallRenderCache.entries())) {
      const sameTask = String(call.taskId || call.id || "") === id;
      const sameAgent = agentId && String(call.agentId || "") === agentId && this.isTerminalCallState(call.eventState || details.state);
      if (sameTask || sameAgent) {
        this.activeCallRenderCache.delete(key);
        removed += 1;
      }
    }

    this.taskOwnershipMap?.delete(id);
    this.persistTaskOwnership();
    this.persistActiveCalls();
    this.addDiagLog("active-call-hard-evicted", { id, reason, removed, ...details });
    return removed;
  }

  pruneActiveCallCaches(reason = "prune") {
    const now = Date.now();
    let removed = 0;
    for (const [id, call] of Array.from(this.activeCallRenderCache.entries())) {
      const evictionAt = Number(call.pendingEvictionAtMs || call.expiresAtMs || 0);
      const terminalState = this.isTerminalCallState(call.eventState || call.terminalState || "");
      const lastSeen = Number(call.localLastSeenMs || call.lastSeenMs || 0);
      const stale = lastSeen && now - lastSeen > this.activeCallPersistenceTtlMs;
      const terminalKnown = this.isTerminalActiveCallId(id);
      if (stale || terminalKnown || (evictionAt && now >= evictionAt) || (terminalState && lastSeen && now - lastSeen > 1500)) {
        this.activeCallRenderCache.delete(id);
        removed += 1;
      }
    }
    if (removed) {
      this.persistActiveCalls();
      this.addDiagLog("active-call-cache-pruned", { reason, removed, remaining: this.activeCallRenderCache.size });
    }
    this.persistActiveCallTerminals();
    return removed;
  }

  restorePersistentActiveCalls() {
    this.restorePersistentActiveCallTerminals();
    try {
      const raw = localStorage.getItem(this.activeCallPersistenceKey);
      const parsed = JSON.parse(raw || "[]");
      const now = Date.now();
      this.activeCallRenderCache = new Map();
      if (Array.isArray(parsed)) {
        parsed.forEach(call => {
          const id = String(call?.id || call?.taskId || "");
          if (!id) return;
          const lastSeen = Number(call.localLastSeenMs || call.lastSeenMs || 0);
          if (lastSeen && now - lastSeen > this.activeCallPersistenceTtlMs) return;
          if (this.isTerminalActiveCallId(id)) return;
          const evictionAt = Number(call.pendingEvictionAtMs || call.expiresAtMs || 0);
          const terminalState = this.isTerminalCallState(call.eventState || call.terminalState || "");
          if ((evictionAt && now >= evictionAt) || (terminalState && lastSeen && now - lastSeen > 1500)) return;
          this.activeCallRenderCache.set(id, { ...call, restoredAtMs: now });
        });
      }
      this.pruneActiveCallCaches("restore");
      this.repairRestoredActiveCallOwnership();
      this.addDiagLog("active-call-cache-restored", { rows: this.activeCallRenderCache.size });
    } catch (err) {
      this.activeCallRenderCache = new Map();
      this.addDiagLog("active-call-cache-restore-failed", { message: err.message });
    }
  }

  persistActiveCalls() {
    try {
      const rows = Array.from(this.activeCallRenderCache.values()).slice(-50);
      localStorage.setItem(this.activeCallPersistenceKey, JSON.stringify(rows));
    } catch {}
  }

  extractWxccEventBody(details = {}) {
    return details.eventBody || details.body || details.data || details.payload || {};
  }

  normalizeWxccEventBody(body = {}) {
    return {
      type: String(body.type || body.eventType || body?.data?.type || ""),
      data: body.data || body.event?.data || body.payload || body || {}
    };
  }


  getAgentEventDisplayState(state, data = {}) {
    const normalized = String(state || "").toLowerCase();
    if (normalized === "available" || normalized === "wrapup-done") return "Available";
    if (normalized === "ringing") return "Ringing";
    if (normalized === "connected") return "Connected";
    if (normalized === "wrapup") return "Wrapup";
    if (normalized === "idle") {
      // v45: idle events without a taskId are authoritative terminal agent-state events.
      // They must clear stale Wrapup/Connected projections after WXCC Desktop recreates the widget.
      // If WXCC provides a custom idle name, use it; otherwise render a safe neutral state until
      // the next Search snapshot enriches it.
      return String(
        data.idleCodeName ||
        data.idleCode ||
        data.reasonName ||
        data.reason ||
        data.auxCodeName ||
        "Idle"
      );
    }
    return "";
  }

  restorePersistentAgentStates() {
    try {
      const raw = localStorage.getItem(this.agentStatePersistenceKey);
      const parsed = JSON.parse(raw || "[]");
      const now = Date.now();
      this.agentStateEventCache = new Map();
      if (Array.isArray(parsed)) {
        parsed.forEach(row => {
          const agentId = String(row?.agentId || "");
          const receivedAtMs = Number(row?.receivedAtMs || 0);
          if (!agentId || !receivedAtMs || now - receivedAtMs > this.agentStateEventTtlMs) return;
          this.agentStateEventCache.set(agentId, row);
        });
      }
      this.addDiagLog("agent-state-cache-restored", { rows: this.agentStateEventCache.size });
    } catch (err) {
      this.agentStateEventCache = new Map();
      this.addDiagLog("agent-state-cache-restore-failed", { message: err.message });
    }
  }

  persistAgentStates() {
    try {
      localStorage.setItem(this.agentStatePersistenceKey, JSON.stringify(Array.from(this.agentStateEventCache.values()).slice(-100)));
    } catch {}
  }

  rememberAgentStateFromWxccEvent(details = {}) {
    try {
      const normalized = this.normalizeWxccEventBody(this.extractWxccEventBody(details));
      const data = normalized.data || {};
      const type = String(normalized.type || "");
      if (type !== "agent:state_change") return;

      const agentId = String(data.agentId || data.ownerId || data.userId || data.ciUserId || "");
      const currentState = String(data.currentState || data.state || data.status || "").toLowerCase();
      if (!agentId || !currentState) return;

      const displayState = this.getAgentEventDisplayState(currentState, data);
      if (!displayState) {
        this.addDiagLog("agent-state-event-observed-not-authoritative", { agentId, currentState, taskId: data.taskId || "" });
        return;
      }

      const now = Date.now();
      const createdTime = Number(data.createdTime || 0);
      const previous = this.agentStateEventCache.get(agentId);
      const previousCreatedTime = Number(previous?.createdTime || 0);

      // WXCC can deliver retries/out-of-order events. Never let an older event roll back a newer state.
      if (previousCreatedTime && createdTime && createdTime < previousCreatedTime) {
        this.addDiagLog("agent-state-event-older-ignored", { agentId, currentState, createdTime, previousCreatedTime });
        return;
      }

      const row = {
        agentId,
        currentState,
        displayState,
        taskId: String(data.taskId || ""),
        queueId: String(data.queueId || ""),
        teamId: String(data.teamId || ""),
        createdTime: createdTime || now,
        receivedAtMs: now,
        source: "wxcc-event-authority"
      };

      this.agentStateEventCache.set(agentId, row);
      this.persistAgentStates();
      this.addDiagLog("agent-state-event-authority-updated", { agentId, currentState, displayState, taskId: row.taskId });

      if (row.taskId && agentId) {
        this.rebindActiveCallOwnership(row.taskId, agentId, {
          queueId: row.queueId,
          queueName: data.queueName || data.firstQueueName || data.lastQueueName || "",
          agentName: data.agentName || data.agentDisplayName || "",
          caller: data.origin || data.from || data.ani || data.caller || "",
          destination: data.destination || data.to || data.dnis || ""
        });
      }

      if (this.lastWallboardData) {
        this.processWallboardData(this.lastWallboardData);
      }
    } catch (err) {
      this.addDiagLog("agent-state-event-authority-failed", { message: err.message });
    }
  }

  applyAgentStateAuthority(snapshot) {
    const now = Date.now();
    const agents = Array.isArray(snapshot.agentList) ? snapshot.agentList : [];
    let applied = 0;
    let ignoredOlderSnapshot = 0;

    for (const agent of agents) {
      const agentId = this.resolveAgentId(agent);
      if (!agentId) continue;
      const override = this.agentStateEventCache.get(agentId);
      if (!override) continue;

      const ageMs = now - Number(override.receivedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > this.agentStateEventTtlMs) {
        this.agentStateEventCache.delete(agentId);
        continue;
      }

      // v43: Events are authoritative for realtime states. Search snapshots are allowed
      // to enrich name/team metadata, but never to roll back a fresh event state.
      const sourceState = String(agent.state || "");
      if (sourceState !== override.displayState) ignoredOlderSnapshot += 1;
      agent.state = this.getDeterministicDisplayStateForAgent(agentId, agent, override);
      agent.currentState = override.currentState;
      agent.eventAuthority = {
        applied: true,
        sourceState,
        eventState: override.currentState,
        ageMs,
        taskId: override.taskId || ""
      };
      applied += 1;
    }

    if (snapshot.agents && Array.isArray(snapshot.agentList)) {
      snapshot.agents.loggedIn = snapshot.agentList.length;
      snapshot.agents.available = snapshot.agentList.filter(agent => String(agent.state || "").toLowerCase() === "available").length;
    }

    if (applied || ignoredOlderSnapshot) {
      snapshot.agentStateAuthorityApplied = applied;
      snapshot.agentStateAuthorityIgnoredOlderSnapshot = ignoredOlderSnapshot;
      this.addDiagLog("agent-state-authority-applied", { applied, ignoredOlderSnapshot });
    }

    this.persistAgentStates();
    return snapshot;
  }

  rememberActiveCallFromWxccEvent(details = {}) {
    try {
      const normalized = this.normalizeWxccEventBody(this.extractWxccEventBody(details));
      const data = normalized.data || {};
      const state = String(data.currentState || data.state || data.status || "").toLowerCase();
      const type = String(normalized.type || "");
      const taskId = String(data.taskId || data.interactionId || data.contactId || data.contactSessionId || data.id || "");
      const agentId = String(data.agentId || data.ownerId || data.userId || "");
      if (!taskId && !agentId) return;

      const now = Date.now();
      const id = taskId || `agent-${agentId}`;
      const isActiveEvent =
        type === "task:connect" ||
        (type === "agent:state_change" && ["ringing", "connected"].includes(state));

      if (isActiveEvent) {
        if (this.isTerminalActiveCallId(id)) {
          this.addDiagLog("active-call-stale-active-event-ignored", { id, type, state, agentId });
          return;
        }
        const previous = this.activeCallRenderCache.get(id) || {};
        const startMs = Number(previous.localStartMs || data.connectedTime || data.createdTime || now);
        const binding = this.taskOwnershipMap.get(taskId) || {};
        const row = this.enrichActiveCallDeterministically({
          ...previous,
          id,
          taskId: taskId || id,
          status: "connected",
          reconstructed: true,
          reconstructedSource: type === "task:connect" ? "frontend-task-connect-event-cache" : "frontend-agent-state-event-cache",
          caller: data.origin || data.from || data.ani || data.caller || previous.caller || binding.caller || "",
          destination: data.destination || data.to || data.dnis || previous.destination || binding.destination || "",
          queueId: data.queueId || previous.queueId || binding.queueId || "",
          queue: data.queueName || data.lastQueueName || previous.queue || binding.queueName || "",
          firstQueue: data.firstQueueName || previous.firstQueue || "",
          entryPoint: data.entryPointName || previous.entryPoint || "",
          agent: this.cleanDisplayValue(data.agentName) || this.cleanDisplayValue(data.agentDisplayName) || this.cleanDisplayValue(previous.agent) || this.cleanDisplayValue(binding.agentName) || this.getAgentNameById(agentId || binding.agentId) || "",
          agentId: agentId || previous.agentId || binding.agentId || "",
          createdTime: previous.createdTime || data.createdTime || now,
          connectedStartTime: previous.connectedStartTime || data.connectedTime || data.createdTime || now,
          handleBaseTimestamp: now,
          handleSeconds: Math.max(0, Math.floor((now - startMs) / 1000)),
          localStartMs: startMs,
          localLastSeenMs: now,
          pendingEvictionAtMs: 0
        });
        this.activeCallRenderCache.set(id, row);
        if (row.agentId) this.rebindActiveCallOwnership(id, row.agentId, { agentName: row.agent, queueId: row.queueId, queueName: row.queue, caller: row.caller, destination: row.destination });
        this.persistActiveCalls();
        this.addDiagLog("frontend-active-call-event-connected", { id, agentId: row.agentId || agentId, cacheSize: this.activeCallRenderCache.size, type, state });
        if (this.lastWallboardData) this.processWallboardData(this.lastWallboardData);
        return;
      }

      if (type === "agent:state_change" && ["available", "idle", "wrapup", "wrapup-done", "ended", "terminated", "disconnected"].includes(state)) {
        if (taskId && this.isTerminalCallState(state)) {
          this.rememberTerminalActiveCall(taskId, agentId, state, "agent-state-terminal");
          this.hardEvictActiveCall(taskId, "agent-state-terminal", { agentId, state });
          this.addDiagLog("frontend-active-call-event-terminal", { id, agentId, state, cacheSize: this.activeCallRenderCache.size, hardEvicted: true });
          if (this.lastWallboardData) this.processWallboardData(this.lastWallboardData);
          return;
        }

        const mark = call => {
          call.pendingEvictionAtMs = now + this.activeCallEvictionDelayMs;
          call.expiresAtMs = call.pendingEvictionAtMs;
          call.localLastSeenMs = now;
          call.eventState = state;
        };
        if (this.activeCallRenderCache.has(id)) {
          mark(this.activeCallRenderCache.get(id));
        } else if (agentId) {
          for (const call of this.activeCallRenderCache.values()) {
            if (String(call.agentId || "") === agentId) mark(call);
          }
        }
        this.pruneActiveCallCaches("terminal-event");
        this.persistActiveCalls();
        this.addDiagLog("frontend-active-call-event-terminal", { id, agentId, state, cacheSize: this.activeCallRenderCache.size });
      }
    } catch (err) {
      this.addDiagLog("frontend-active-call-event-failed", { message: err.message });
    }
  }

  mergeActiveCallsForTimer(calls) {
    this.pruneActiveCallCaches("merge-start");
    const now = Date.now();
    const incoming = Array.isArray(calls) ? calls : [];
    const next = new Map();

    incoming.forEach(call => {
      const id = String(call?.id || call?.taskId || "");
      if (!id) return;
      if (this.isTerminalActiveCallId(id)) {
        this.addDiagLog("active-call-terminal-snapshot-ignored", { id });
        return;
      }

      const previous = this.activeCallRenderCache.get(id);
      const incomingSeconds = Number(call.handleSeconds || call.liveHandleSeconds || call.liveDurationSeconds || 0);

      let localStartMs = previous?.localStartMs;
      if (!localStartMs) {
        localStartMs = now - Math.max(0, incomingSeconds) * 1000;
      }

      next.set(id, this.enrichActiveCallDeterministically({
        ...previous,
        ...call,
        id,
        agentId: call.agentId || previous?.agentId || "",
        agent: this.cleanDisplayValue(call.agent) || this.cleanDisplayValue(previous?.agent) || "",
        queue: this.cleanDisplayValue(this.getCallQueueName(call)) || this.cleanDisplayValue(previous?.queue) || "",
        localStartMs,
        localLastSeenMs: now,
        pendingEvictionAtMs: 0
      }));
    });

    // v41: delayed eviction + widget recreation persistence.
    // If taskDetails temporarily returns activeCalls:0 while agent events still show a connected call,
    // preserve the previous active row for a short grace period instead of blanking the wallboard.
    for (const [id, previous] of this.activeCallRenderCache.entries()) {
      if (next.has(id)) continue;
      if (this.isTerminalActiveCallId(id) || this.isTerminalCallState(previous.eventState || previous.terminalState || "")) {
        this.hardEvictActiveCall(id, "merge-terminal-previous", { state: previous.eventState || previous.terminalState || "" });
        continue;
      }
      const evictionAt = Number(previous.pendingEvictionAtMs || 0);
      const lastSeen = Number(previous.localLastSeenMs || 0);
      const keepBecauseDelayedEviction = evictionAt && now < evictionAt;
      const keepBecauseTransientEmpty = !incoming.length && lastSeen && now - lastSeen < this.activeCallEvictionDelayMs;
      const keepBecauseReconstructed = previous.reconstructed === true && lastSeen && now - lastSeen < this.activeCallEvictionDelayMs;

      if (keepBecauseDelayedEviction || keepBecauseTransientEmpty || keepBecauseReconstructed) {
        next.set(id, this.enrichActiveCallDeterministically({
          ...previous,
          status: "connected",
          reconstructed: previous.reconstructed === true || incoming.length === 0,
          reconstructedSource: previous.reconstructedSource || "frontend-delayed-eviction",
          localLastSeenMs: lastSeen || now
        }));
      }
    }

    this.activeCallRenderCache = next;
    this.persistActiveCalls();
    return Array.from(next.values()).sort((a, b) => Number(a.localStartMs || 0) - Number(b.localStartMs || 0));
  }

  rememberCallHistory(calls) {
    const rows = Array.isArray(calls) ? calls : [];

    if (rows.length > 0) {
      const existing = new Map(this.callHistoryRenderCache.map(row => [String(row.id || row.taskId || ""), row]));

      rows.forEach(row => {
        const id = String(row.id || row.taskId || "");
        if (!id) return;
        existing.set(id, row);
      });

      this.callHistoryRenderCache = Array.from(existing.values())
        .sort((a, b) => Number(b.createdTime || 0) - Number(a.createdTime || 0))
        .slice(0, 100);
      this.callHistoryCacheTs = Date.now();
      return this.callHistoryRenderCache;
    }

    if (this.callHistoryRenderCache.length && Date.now() - this.callHistoryCacheTs < 300000) {
      return this.callHistoryRenderCache;
    }

    return [];
  }

  getLiveDisplaySeconds(call) {
    const status = String(call?.status || "").toLowerCase();

    if (status === "connected" && Number(call?.localStartMs || 0) > 0) {
      return Math.max(0, Math.floor((Date.now() - Number(call.localStartMs)) / 1000));
    }

    const baseSeconds = Number(call?.handleSeconds || call?.liveHandleSeconds || call?.liveDurationSeconds || 0);
    const baseTimestamp = Number(call?.handleBaseTimestamp || 0);

    if (status === "connected" && baseTimestamp > 0) {
      return Math.max(0, baseSeconds + Math.floor((Date.now() - baseTimestamp) / 1000));
    }

    const start = Number(call?.connectedStartTime || call?.lastActivityTime || call?.createdTime || 0);
    if (status === "connected" && start > 0) {
      return Math.max(0, Math.floor((Date.now() - start) / 1000));
    }

    return baseSeconds;
  }

  updateActiveDurationCells() {
    const cells = this.shadowRoot.querySelectorAll(".live-duration");
    cells.forEach(cell => {
      const callId = String(cell.getAttribute("data-call-id") || "");
      const call = Array.from(this.activeCallRenderCache.values()).find(item => this.shortId(item.id) === callId);
      if (!call) return;
      cell.textContent = this.formatDuration(this.getLiveDisplaySeconds(call));
    });
  }

  updateAgentDurationCells() {
    const cells = this.shadowRoot.querySelectorAll(".agent-live-duration");
    cells.forEach(cell => {
      const startMs = Number(cell.getAttribute("data-agent-start-ms") || 0);
      if (!startMs) return;
      const seconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      cell.textContent = this.formatDuration(seconds);
    });
  }

  updateLiveDurationCells() {
    this.updateActiveDurationCells();
    this.updateAgentDurationCells();
  }

  startLiveUiTimer(runtimeId = this.runtimeId) {
    if (this.liveUiTimerHandle) {
      clearInterval(this.liveUiTimerHandle);
    }

    this.liveUiTimerHandle = this.safeSetInterval(() => {
      if (!this.guardRuntime(runtimeId)) return;
      this.updateLiveDurationCells();
    }, 1000, runtimeId);
  }




  restorePersistentDiagnostics() {
    try {
      const raw = localStorage.getItem(this.diagStorageKey);
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed) && parsed.length) {
        this.diagLogEntries = parsed.slice(-(this.diagLogMax || 1200));
      }
    } catch {}
    try {
      const rawQueue = localStorage.getItem(this.diagQueueStorageKey);
      const parsedQueue = JSON.parse(rawQueue || "[]");
      if (Array.isArray(parsedQueue) && parsedQueue.length) {
        this.diagRemoteQueue = parsedQueue.slice(-400);
        setTimeout(() => this.flushDiagRemoteQueue(false), 800);
      }
    } catch {}
  }

  persistDiagLog() {
    try {
      localStorage.setItem(this.diagStorageKey, JSON.stringify((this.diagLogEntries || []).slice(-(this.diagLogMax || 1200))));
    } catch {}
    try {
      localStorage.setItem(this.diagQueueStorageKey, JSON.stringify((this.diagRemoteQueue || []).slice(-400)));
    } catch {}
    try { window.__WXCC_WIDGET_DIAG_LOG__ = this.diagLogEntries || []; } catch {}
  }

  queueRemoteDiagLog(entry) {
    try {
      if (!this.diagRemoteQueue) this.diagRemoteQueue = [];
      this.diagRemoteQueue.push(entry);
      while (this.diagRemoteQueue.length > 400) this.diagRemoteQueue.shift();
      try { localStorage.setItem(this.diagQueueStorageKey, JSON.stringify(this.diagRemoteQueue)); } catch {}
      if (!this.diagRemoteFlushHandle) {
        this.diagRemoteFlushHandle = setTimeout(() => {
          this.diagRemoteFlushHandle = null;
          this.flushDiagRemoteQueue(false);
        }, 1200);
      }
    } catch {}
  }

  flushDiagRemoteQueue(useBeacon = false) {
    try {
      const entries = (this.diagRemoteQueue || []).slice(0, 80);
      if (!entries.length) return;
      const payload = JSON.stringify({
        frontendBuildId: FRONTEND_BUILD_ID,
        href: location.href,
        userAgent: navigator.userAgent,
        sessionTokenPresent: Boolean(this.sessionToken),
        entries
      });
      const url = `${this.API_URL}/api/debug/client-log`;
      if (useBeacon && navigator.sendBeacon) {
        const ok = navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
        if (ok) {
          this.diagRemoteQueue.splice(0, entries.length);
          this.persistDiagLog();
        }
        return;
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.sessionToken ? { Authorization: `Bearer ${this.sessionToken}` } : {}) },
        body: payload,
        keepalive: true
      }).then(res => {
        if (res.ok) {
          this.diagRemoteQueue.splice(0, entries.length);
          this.persistDiagLog();
        }
      }).catch(() => {});
    } catch {}
  }

  startPersistentDiagHeartbeat() {
    if (this.diagHeartbeatHandle) clearInterval(this.diagHeartbeatHandle);
    const runtimeId = this.runtimeId;
    this.diagHeartbeatHandle = this.safeSetInterval(() => {
      this.addDiagLog("frontend-heartbeat", {
        visible: document.visibilityState,
        eventSourceReadyState: this.wallboardEventSource ? this.wallboardEventSource.readyState : null,
        hasLastWallboard: Boolean(this.lastWallboardData),
        href: location.href,
        runtimeId
      });
    }, 15000, runtimeId);
    try {
      this.visibilityChangeHandler = () => {
        this.addDiagLog("visibility-change", { visibilityState: document.visibilityState, runtimeId });
        if (document.visibilityState === "hidden") this.flushDiagRemoteQueue(true);
        if (document.visibilityState === "visible") {
          this.addDiagLog("visibility-resume", { eventSourceReadyState: this.wallboardEventSource ? this.wallboardEventSource.readyState : null, runtimeId });
          this.flushDiagRemoteQueue(false);
          if (!this.wallboardEventSource && this.sessionToken && this.isCurrentRuntime(runtimeId)) {
            this.startWallboardStream(runtimeId);
      this.startAnalyticsMetricsPolling(runtimeId);
          }
        }
      };
      this.pageHideHandler = () => {
        this.addDiagLog("pagehide", { persisted: true, runtimeId });
        this.flushDiagRemoteQueue(true);
        this.persistDiagLog();
      };
      this.beforeUnloadHandler = () => {
        this.addDiagLog("beforeunload", { persisted: true, runtimeId });
        this.flushDiagRemoteQueue(true);
        this.persistDiagLog();
      };
      this.addManagedListener(document, "visibilitychange", this.visibilityChangeHandler, true);
      this.addManagedListener(window, "pagehide", this.pageHideHandler, true);
      this.addManagedListener(window, "beforeunload", this.beforeUnloadHandler, true);
    } catch {}
  }

  serializeError(err) {
    if (!err) return { message: "" };
    if (typeof err === "string") return { message: err };
    const result = {
      name: err.name || "Error",
      message: err.message || String(err),
      stack: String(err.stack || "").slice(0, 2500)
    };
    if (err.filename) result.filename = err.filename;
    if (err.lineno) result.lineno = err.lineno;
    if (err.colno) result.colno = err.colno;
    return result;
  }

  safeDiagDetails(details = {}) {
    try {
      return JSON.parse(JSON.stringify(details, (key, value) => {
        if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
        if (value instanceof Error) return this.serializeError(value);
        if (typeof value === "string" && value.length > 3000) return value.slice(0, 3000) + "…";
        return value;
      }));
    } catch (err) {
      return { serializationFailed: true, message: err?.message || String(err) };
    }
  }

  installTechnicalDiagnostics() {
    if (this.techDiagnosticsInstalled) return;
    this.techDiagnosticsInstalled = true;

    this.windowErrorHandler = event => {
      this.addDiagLog("window-error", {
        message: event?.message || "",
        source: event?.filename || "",
        line: event?.lineno || 0,
        column: event?.colno || 0,
        error: this.serializeError(event?.error)
      });
    };

    this.windowRejectionHandler = event => {
      const serialized = this.serializeError(event?.reason);
      const msg = `${serialized.name || ""} ${serialized.message || ""}`;
      if (/AbortError/i.test(msg) && /play\(\).*pause\(\)/i.test(msg)) {
        this.addDiagLog("audio-play-abort-ignored", { reason: serialized });
        try { event.preventDefault(); } catch {}
        return;
      }
      this.addDiagLog("unhandled-rejection", {
        reason: serialized,
        promise: String(event?.promise || "")
      });
    };

    window.addEventListener("error", this.windowErrorHandler, true);
    window.addEventListener("unhandledrejection", this.windowRejectionHandler, true);

    try {
      if (!window.__WXCC_WIDGET_CONSOLE_ERROR_PATCHED__) {
        window.__WXCC_WIDGET_CONSOLE_ERROR_PATCHED__ = true;
        this.consoleErrorOriginal = console.error.bind(console);
        const original = this.consoleErrorOriginal;
        console.error = (...args) => {
          try {
            const widgets = document.querySelectorAll("supervisor-access-widget");
            widgets.forEach(widget => {
              if (widget?.addDiagLog) {
                widget.addDiagLog("console-error", {
                  args: args.map(arg => arg instanceof Error ? widget.serializeError(arg) : String(arg).slice(0, 1000))
                });
              }
            });
          } catch {}
          original(...args);
        };
      }
    } catch (err) {
      this.addDiagLog("console-patch-failed", this.serializeError(err));
    }
  }

  uninstallTechnicalDiagnostics() {
    try {
      if (this.windowErrorHandler) window.removeEventListener("error", this.windowErrorHandler, true);
      if (this.windowRejectionHandler) window.removeEventListener("unhandledrejection", this.windowRejectionHandler, true);
    } catch {}
    this.windowErrorHandler = null;
    this.windowRejectionHandler = null;
  }


  addDiagLog(type, details = {}) {
    try {
      if (!this.diagLogEntries) this.diagLogEntries = [];
      const entry = { ts: Date.now(), iso: new Date().toISOString(), time: new Date().toLocaleTimeString(), type, ...this.safeDiagDetails(details) };
      this.diagLogEntries.push(entry);
      while (this.diagLogEntries.length > (this.diagLogMax || 1200)) this.diagLogEntries.shift();
      this.persistDiagLog();
      this.queueRemoteDiagLog(entry);
      try { this.renderDiagLog(); } catch (renderErr) {
        const fallbackEntry = { ts: Date.now(), iso: new Date().toISOString(), time: new Date().toLocaleTimeString(), type: "diag-render-failed", error: this.serializeError(renderErr) };
        this.diagLogEntries.push(fallbackEntry);
        this.persistDiagLog();
      }
      return entry;
    } catch (err) {
      try {
        const fallback = { ts: Date.now(), iso: new Date().toISOString(), time: new Date().toLocaleTimeString(), type: "diag-log-hard-failed", error: String(err?.message || err || "") };
        const raw = localStorage.getItem(this.diagStorageKey);
        const arr = JSON.parse(raw || "[]");
        if (Array.isArray(arr)) arr.push(fallback);
        localStorage.setItem(this.diagStorageKey, JSON.stringify((Array.isArray(arr) ? arr : [fallback]).slice(-1200)));
        return fallback;
      } catch {}
    }
  }

  getWallboardSummary(data = this.lastWallboardData) {
    const agents = Array.isArray(data?.agents) ? data.agents : Array.isArray(data?.agentList) ? data.agentList : [];
    const activeCalls = Array.isArray(data?.taskList) ? data.taskList : [];
    const waitingCalls = Array.isArray(data?.waitingTaskList) ? data.waitingTaskList : [];
    const history = Array.isArray(data?.callHistoryList) ? data.callHistoryList : [];
    return {
      backendBuildId: data?.backendBuildId || data?.buildId || "",
      requestId: data?.requestId || "",
      stale: data?.stale === true,
      staleReason: data?.staleReason || "",
      lastError: data?.lastError ? String(data.lastError).slice(0, 300) : "",
      agents: agents.length,
      connectedAgents: agents.filter(agent => String(agent.state || "").toLowerCase() === "connected").length,
      activeCalls: activeCalls.length,
      waitingCalls: waitingCalls.length,
      history: history.length,
      connectedHistory: history.filter(call => String(call.status || "").toLowerCase() === "connected").length,
      firstAgentState: agents[0]?.state || "",
      firstActiveStatus: activeCalls[0]?.status || "",
      firstHistoryStatus: history[0]?.status || "",
      reconstructedActiveCalls: activeCalls.filter(call => call?.reconstructed === true).length
    };
  }

  formatDiagEntry(entry) {
    const details = { ...entry };
    delete details.ts; delete details.time; delete details.type;
    let suffix = "";
    try { suffix = Object.keys(details).length ? " " + JSON.stringify(details) : ""; } catch {}
    return `[${entry.time}] ${entry.type}${suffix}`;
  }

  getDiagText() {
    return (this.diagLogEntries || []).map(entry => this.formatDiagEntry(entry)).join("\n");
  }

  renderDiagLog() {
    const textNode = this.shadowRoot?.getElementById("diagLogText");
    const countNode = this.shadowRoot?.getElementById("diagLogCount");
    const panel = this.shadowRoot?.getElementById("diagLogPanel");
    if (countNode) countNode.textContent = String((this.diagLogEntries || []).length);
    if (textNode) textNode.textContent = this.getDiagText();
    if (panel) panel.scrollTop = panel.scrollHeight;
  }

  bindDiagLogEvents() {
    const toggle = this.shadowRoot.getElementById("diagToggle");
    const copy = this.shadowRoot.getElementById("diagCopy");
    const clear = this.shadowRoot.getElementById("diagClear");
    const panel = this.shadowRoot.getElementById("diagLogPanel");
    if (toggle && panel && !toggle.dataset.bound) {
      toggle.dataset.bound = "1";
      toggle.addEventListener("click", () => {
        this.diagLogVisible = !this.diagLogVisible;
        panel.style.display = this.diagLogVisible ? "block" : "none";
        toggle.textContent = this.diagLogVisible ? "Hide Diagnostics" : "Show Diagnostics";
        this.renderDiagLog();
      });
    }
    if (copy && !copy.dataset.bound) {
      copy.dataset.bound = "1";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(this.getDiagText());
          this.setWallboardStatus("Diagnostic log copied");
        } catch {
          this.setWallboardStatus("Copy failed. Select log manually.");
        }
      });
    }
    if (clear && !clear.dataset.bound) {
      clear.dataset.bound = "1";
      clear.addEventListener("click", () => {
        this.diagLogEntries = [];
        this.addDiagLog("frontend-log-cleared", {});
      });
    }
  }

  startHistoryEndWatchdog(runtimeId = this.runtimeId) {
    if (this.historyEndWatchdogHandle) {
      clearInterval(this.historyEndWatchdogHandle);
    }

    this.historyEndWatchdogHandle = this.safeSetInterval(() => {
      if (!this.guardRuntime(runtimeId)) return;
      this.checkHistoryEndMismatch(runtimeId).catch(err => this.addDiagLog("history-watchdog-exception", { error: this.serializeError(err), runtimeId }));
    }, 1500, runtimeId);
  }

  async checkHistoryEndMismatch(runtimeId = this.runtimeId) {
    if (!this.guardRuntime(runtimeId) || !this.sessionToken || !this.lastWallboardData) return;

    const now = Date.now();

    const activeCalls = Array.isArray(this.lastWallboardData.taskList)
      ? this.lastWallboardData.taskList.filter(call => String(call.status || "").toLowerCase() === "connected")
      : [];

    const agents = Array.isArray(this.lastWallboardData.agents)
      ? this.lastWallboardData.agents
      : Array.isArray(this.lastWallboardData.agentList)
        ? this.lastWallboardData.agentList
        : [];

    const connectedAgents = agents.filter(agent => String(agent.state || "").toLowerCase() === "connected");

    const history = Array.isArray(this.lastWallboardData.callHistoryList)
      ? this.lastWallboardData.callHistoryList
      : [];

    const hasConnectedHistory = history.some(call => String(call.status || "").toLowerCase() === "connected");

    const mismatch = hasConnectedHistory && activeCalls.length === 0 && connectedAgents.length === 0;

    if (mismatch) {
      if (!this.historyEndMismatchSinceTs) {
        this.historyEndMismatchSinceTs = now;
      }
    } else {
      this.historyEndMismatchSinceTs = 0;
      return;
    }

    const mismatchAge = now - this.historyEndMismatchSinceTs;
    const refreshAge = now - this.historyEndMismatchLastRefreshTs;

    if (mismatchAge > 2500 && refreshAge > 5000) {
      this.historyEndMismatchLastRefreshTs = now;

      if (typeof this.recordClientSseDebug === "function") {
        this.recordClientSseDebug("history-end-mismatch-refresh", {
          mismatchAge,
          activeCalls: activeCalls.length,
          connectedAgents: connectedAgents.length,
          connectedHistory: true
        });
      }

      this.addDiagLog("history-end-mismatch-refresh", { mismatchAge, activeCalls: activeCalls.length, connectedAgents: connectedAgents.length, hasConnectedHistory });
      await this.loadWallboard("history-end-mismatch", runtimeId);
    }
  }

  startRobustActiveCallTimer(runtimeId = this.runtimeId) {
    if (this.activeCallTimerHandle) {
      clearInterval(this.activeCallTimerHandle);
    }

    this.activeCallTimerHandle = this.safeSetInterval(() => {
      if (!this.guardRuntime(runtimeId)) return;
      try {
      this.updateActiveDurationCells();

      if (!this.lastWallboardData) return;

      const rawActiveCalls = Array.isArray(this.lastWallboardData.taskList)
        ? this.lastWallboardData.taskList.filter(t => String(t.status || "").toLowerCase() === "connected")
        : [];
      const visibleActiveCalls = this.mergeActiveCallsForTimer(this.filterCallsByAllowedQueues(rawActiveCalls));
      this.renderActiveCalls(visibleActiveCalls);

      const rawCallHistory = Array.isArray(this.lastWallboardData.callHistoryList)
        ? this.lastWallboardData.callHistoryList
        : [];
      const visibleCallHistory = this.rememberCallHistory(this.filterCallsByAllowedQueues(rawCallHistory));
      this.renderCallHistory(visibleCallHistory);
      } catch (err) {
        this.addDiagLog("active-timer-exception", { error: this.serializeError(err) });
      }
    }, 1000);
  }

  renderCallHistory(calls) {
    const list = this.shadowRoot.getElementById("callHistoryList");
    if (!list) return;

    const maxRows = 75;
    const rows = (Array.isArray(calls) ? calls : []).slice(0, maxRows);

    list.innerHTML = `
      <div class="call-row history call-header">
        <div>Status</div><div>Queue</div><div>Caller</div><div>Agent</div><div>Wrapup Reason</div><div>Handle / Type</div><div>Termination Reason</div><div>Started</div><div>Duration</div><div>Task</div>
      </div>
    `;

    if (!rows.length) {
      const row = document.createElement("div");
      row.className = "call-row history";
      row.innerHTML = `<div>No calls in the last 24h</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>`;
      list.appendChild(row);
      return;
    }

    rows.forEach(call => {
      const row = document.createElement("div");
      row.className = "call-row history";
      const liveSeconds = this.getLiveDisplaySeconds(call);
      const durationMs = Number(call.totalDuration || call.connectedDuration || call.queueDuration || 0);
      row.innerHTML = `
        <div>${call.status || "-"}</div>
        <div>${this.getCallQueueName(call) || "-"}</div>
        <div>${call.caller || "-"}</div>
        <div>${call.agent || "-"}</div>
        <div>${this.getWrapupReason(call)}</div>
        <div>${this.getHandleType(call)}</div>
        <div>${this.getTerminationReason(call)}</div>
        <div>${this.formatDateTime(call.createdTime)}</div>
        <div>${this.formatDuration(liveSeconds || Math.round(durationMs / 1000))}</div>
        <div>${this.shortId(call.id)}</div>
      `;
      list.appendChild(row);
    });
  }

  renderActiveCalls(calls) {
    calls = (Array.isArray(calls) ? calls : []).map(call => {
      const enriched = this.enrichActiveCallDeterministically(call);
      if (!this.cleanDisplayValue(enriched.agent) && enriched.agentId) {
        enriched.agent = this.getVisibleAgentDisplayNameById(enriched.agentId) || this.getAgentNameById(enriched.agentId) || "";
      }
      return enriched;
    });
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
      const handleSeconds = this.getLiveDisplaySeconds(call);
      const fallbackSeconds = Math.round(Number(call.connectedDuration || 0) / 1000);
      row.innerHTML = `
        <div>${call.status || "-"}</div>
        <div>${this.getCallQueueName(call) || "-"}</div>
        <div>${call.caller || "-"}</div>
        <div>${call.agent || "-"}</div>
        <div><span class="live-duration" data-call-id="${this.shortId(call.id)}">${this.formatDuration(handleSeconds || fallbackSeconds)}</span></div>
        <div>${this.shortId(call.id)}</div>
      `;
      list.appendChild(row);
    });
  }


  stabilizeWallboardSnapshot(data) {
    const snapshot = data && typeof data === "object" ? { ...data } : {};
    const now = Date.now();

    const incomingHistory = Array.isArray(snapshot.callHistoryList) ? snapshot.callHistoryList : [];
    const incomingTasks = Array.isArray(snapshot.taskList) ? snapshot.taskList : [];
    const incomingAgents = Array.isArray(snapshot.agentList) ? snapshot.agentList : [];

    if (incomingHistory.length > 0) {
      this.lastNonEmptyCallHistory = incomingHistory;
      this.lastNonEmptyCallHistoryTs = now;
    } else if (
      this.lastNonEmptyCallHistory.length > 0 &&
      now - this.lastNonEmptyCallHistoryTs < 120000 &&
      incomingTasks.length === 0 &&
      incomingAgents.length > 0
    ) {
      // WXCC sometimes sends a transient empty history snapshot directly after
      // Connected -> Wrapup -> Post Call Survey -> ended. Keep the last known
      // rows for a short time so the widget does not visually reset or crash.
      snapshot.callHistoryList = this.lastNonEmptyCallHistory;
      snapshot.historyPreservedByFrontend = true;
      snapshot.historyPreservedReason = "transient-empty-history-after-call-end";
      this.addDiagLog("history-preserved", {
        preservedRows: this.lastNonEmptyCallHistory.length,
        ageMs: now - this.lastNonEmptyCallHistoryTs
      });
    }

    snapshot.taskList = incomingTasks;
    snapshot.waitingTaskList = Array.isArray(snapshot.waitingTaskList) ? snapshot.waitingTaskList : [];
    snapshot.agentList = incomingAgents;
    snapshot.agents = snapshot.agents || {};
    this.updateDeterministicDirectories(snapshot);
    this.reconcileAgentStateAuthorityBeforeProjection(snapshot);
    this.applyAgentStateAuthority(snapshot);
    const projection = this.buildAuthoritativeAgents(snapshot);
    snapshot.agentList = projection.rows;
    snapshot.agents = { ...snapshot.agents, ...projection.agentsSummary };
    snapshot.taskList = snapshot.taskList.map(call => this.enrichActiveCallDeterministically(call));
    snapshot.waitingTaskList = snapshot.waitingTaskList.map(call => this.enrichActiveCallDeterministically(call));
    snapshot.callHistoryList = (Array.isArray(snapshot.callHistoryList) ? snapshot.callHistoryList : []).map(call => this.enrichActiveCallDeterministically(call));
    snapshot.deterministicStateAuthority = true;
    this.lastNonEmptyWallboardTs = now;
    return snapshot;
  }

  projectAgentsForRender(agents = []) {
    const now = Date.now();
    const projected = (Array.isArray(agents) ? agents : []).map(agent => {
      const agentId = this.resolveAgentId(agent);
      if (!agentId) return { ...agent };
      const mapped = this.getAuthoritativeOverrideForAgent(agentId);
      if (!mapped?.override) return { ...agent };
      const override = mapped.override;
      const ageMs = now - Number(override.receivedAtMs || 0);
      if (!Number.isFinite(ageMs) || ageMs > this.agentStateEventTtlMs) return { ...agent };
      const finalState = this.getDeterministicDisplayStateForAgent(agentId, agent, override);
      return {
        ...agent,
        agentId,
        id: agentId,
        name: this.cleanDisplayValue(agent.name) || this.getAgentNameById(agentId) || agent.login || agentId,
        state: finalState,
        currentState: override.currentState,
        taskId: override.taskId || agent.taskId || "",
        eventAuthority: {
          applied: true,
          finalRender: true,
          eventState: override.currentState,
          finalState,
          ageMs,
          stateSource: mapped.stateSource,
          eventAgentId: mapped.eventAgentId,
          canonicalAgentId: mapped.canonicalAgentId
        }
      };
    });
    return projected;
  }

  getRenderedAgentSummary(agents = []) {
    const rows = Array.isArray(agents) ? agents : [];
    return {
      loggedIn: rows.length,
      available: rows.filter(agent => String(agent.state || "").toLowerCase() === "available").length,
      connected: rows.filter(agent => String(agent.state || "").toLowerCase() === "connected").length
    };
  }

  safeSetText(id, value) {
    const el = this.shadowRoot?.getElementById(id);
    if (el) el.textContent = value == null ? "" : String(value);
  }

  processWallboardData(data) {
    try {
      data = this.stabilizeWallboardSnapshot(data);
      this.lastWallboardData = data;
      this.addDiagLog("process-wallboard", { summary: this.getWallboardSummary(data) });

    const detectedQueues = this.extractAllowedQueuesFromWallboardData(data);
    this.allowedQueueNames = detectedQueues;

    this.updateQueueFilterOptions();

    const rawWaitingCalls = Array.isArray(data.waitingTaskList) ? data.waitingTaskList : [];

    const rawActiveCalls = Array.isArray(data.taskList)
      ? data.taskList.filter(t => String(t.status || "").toLowerCase() === "connected")
      : [];

    const rawCallHistory = Array.isArray(data.callHistoryList) ? data.callHistoryList : [];

    const visibleWaitingCalls = this.filterCallsByAllowedQueues(rawWaitingCalls);
    const visibleActiveCalls = this.mergeActiveCallsForTimer(this.filterCallsByAllowedQueues(rawActiveCalls));
    const visibleCallHistory = this.rememberCallHistory(this.filterCallsByAllowedQueues(rawCallHistory));
    const visibleQueueKpis = this.calculateQueueKpisFromVisibleCalls(
      visibleWaitingCalls,
      visibleActiveCalls,
      data.queue || {}
    );

    const analyticsQueueKpis = this.getAnalyticsKpiOverride(visibleQueueKpis);
    const callsInQueue = visibleQueueKpis.callsInQueue;
    const loggedInAgents = data.agents?.loggedIn ?? 0;
    const availableAgents = data.agents?.available ?? 0;

    this.safeSetText("kpiCallsInQueue", callsInQueue);
    this.safeSetText("kpiActiveCalls", visibleQueueKpis.activeCalls);
    if (analyticsQueueKpis.__analyticsUnavailable) {
      this.safeSetText("kpiLongestWaiting", "—");
      this.safeSetText("kpiAvgWait", "—");
      this.safeSetText("kpiAvgHandle", "—");
    } else {
      this.safeSetText("kpiLongestWaiting", this.formatDuration(analyticsQueueKpis.longestWaitingSeconds));
      this.safeSetText("kpiAvgWait", this.formatDuration(analyticsQueueKpis.avgWaitSeconds));
      this.safeSetText("kpiAvgHandle", this.formatDuration(analyticsQueueKpis.avgHandleSeconds));
    }
    this.safeSetText("kpiLoggedIn", loggedInAgents);
    this.safeSetText("kpiAvailable", availableAgents);

    if (typeof this.updateKpiState === "function") {
      this.updateKpiState("kpiCardCallsInQueue", callsInQueue, "queue");
      this.updateKpiState("kpiCardLoggedIn", loggedInAgents, "agents");
      this.updateKpiState("kpiCardAvailable", availableAgents, "agents");
    } else if (typeof this.applyWallboardThresholds === "function") {
      this.applyWallboardThresholds({ callsInQueue, loggedInAgents, availableAgents });
    }

    const agentList = this.shadowRoot.getElementById("agentList");
    agentList.innerHTML = `
      <div class="table-row table-header">
        <div>Name</div><div>Status</div><div>Team</div><div>Active Since</div>
      </div>
    `;

    const agents = this.projectAgentsForRender(Array.isArray(data.agentList) ? data.agentList : []);
    const renderedAgentSummary = this.getRenderedAgentSummary(agents);
    this.safeSetText("kpiLoggedIn", renderedAgentSummary.loggedIn);
    this.safeSetText("kpiAvailable", renderedAgentSummary.available);
    this.addDiagLog("agent-render-final-projection", {
      rows: agents.length,
      first: agents[0] ? {
        agentId: agents[0].agentId || agents[0].id || "",
        name: agents[0].name || agents[0].login || "",
        state: agents[0].state || "",
        eventAuthority: agents[0].eventAuthority || null,
        stateSource: agents[0].eventAuthority?.stateSource || "snapshot"
      } : null
    });

    if (!agents.length) {
      const row = document.createElement("div");
      row.className = "table-row";
      row.innerHTML = `<div>No active agents</div><div></div><div></div><div></div>`;
      agentList.appendChild(row);
    } else {
      agents.forEach(agent => {
        const row = document.createElement("div");
        row.className =
          String(agent.state || "").toLowerCase() === "available"
            ? "table-row agent-available"
            : "table-row agent-unavailable";
        row.innerHTML = `
          <div>${agent.name || agent.login || "-"}</div>
          <div>${agent.state || "-"}</div>
          <div>${agent.team || "-"}</div>
          <div><span class="agent-live-duration" data-agent-id="${this.resolveAgentId(agent)}" data-agent-start-ms="${Number(agent.lastActivityTime || agent.startTime || 0)}">${this.formatDuration(this.getAgentDuration(agent))}</span></div>
        `;
        agentList.appendChild(row);
      });
    }

    this.renderWaitingCalls(visibleWaitingCalls);
    this.renderCallHistory(visibleCallHistory);
    this.renderActiveCalls(visibleActiveCalls);

    const visibleQueues = this.getVisibleQueueNames();
    const queueFilterInfo = visibleQueues.length
      ? ` • Queues: ${visibleQueues.join(", ")}`
      : " • No queue assignment detected";

    this.setWallboardStatus(`Live • Updated ${new Date().toLocaleTimeString()}${queueFilterInfo}`);
    } catch (err) {
      this.addDiagLog("process-wallboard-failed", {
        message: err?.message || String(err),
        stack: String(err?.stack || "").slice(0, 800),
        summary: this.getWallboardSummary(data)
      });
      this.setWallboardStatus(`Dashboard render recovered after frontend error: ${err?.message || err}`);
    }
  }


  getAnalyticsKpiOverride(fallbackKpis = {}) {
    const fallback = fallbackKpis || {};
    const metrics = this.analyticsMetricsCache;
    const ageMs = metrics?.fetchedAtMs ? Date.now() - Number(metrics.fetchedAtMs) : Number.POSITIVE_INFINITY;

    if (!metrics || !Number.isFinite(ageMs)) {
      return fallback;
    }

    if (metrics.ok === false) {
      this.addDiagLog("analytics-kpi-unavailable", {
        source: metrics.source || "wxcc-analyzer-queue-all-fields-report",
        error: metrics.error || "Analyzer report unavailable",
        status: metrics.status || "",
        range: this.kpiDurationRange || "60m",
        attempts: metrics.attempts || metrics.data?.attempts || []
      });
      return { ...fallback, __analyticsUnavailable: true };
    }

    if (ageMs > 120000) {
      this.addDiagLog("analytics-kpi-stale", { ageMs, source: metrics.source || "" });
      return { ...fallback, __analyticsUnavailable: true };
    }

    const values = metrics.metrics || {};
    const merged = {
      ...fallback,
      longestWaitingSeconds: Number.isFinite(Number(values.longestWaitingSeconds)) ? Number(values.longestWaitingSeconds) : Number(fallback.longestWaitingSeconds || 0),
      avgWaitSeconds: Number.isFinite(Number(values.avgWaitSeconds)) ? Number(values.avgWaitSeconds) : Number(fallback.avgWaitSeconds || 0),
      avgHandleSeconds: Number.isFinite(Number(values.avgHandleSeconds)) ? Number(values.avgHandleSeconds) : Number(fallback.avgHandleSeconds || 0)
    };

    this.addDiagLog("analytics-kpi-applied", {
      source: metrics.source || "",
      range: metrics.range || "",
      queueCount: Array.isArray(metrics.queues) ? metrics.queues.length : 0,
      sample: metrics.sample || {},
      durationFilter: metrics.durationFilter || {},
      reportFields: metrics.reportFields || {},
      metrics: merged
    });

    return merged;
  }

  startAnalyticsMetricsPolling(runtimeId = this.runtimeId) {
    if (this.analyticsMetricsPollHandle) return;

    this.safeSetTimeout(() => {
      if (!this.sessionToken || !this.guardRuntime(runtimeId)) return;
      this.loadAnalyticsMetrics("startup-delayed", runtimeId).catch(err => {
        this.addDiagLog("analytics-probe-startup-failed", { message: err?.message || String(err), isolated: true });
      });
    }, 10000, runtimeId);

    this.analyticsMetricsPollHandle = this.safeSetInterval(() => {
      if (!this.sessionToken || !this.guardRuntime(runtimeId)) return;
      this.loadAnalyticsMetrics("interval", runtimeId).catch(err => {
        this.addDiagLog("analytics-probe-interval-failed", { message: err?.message || String(err), isolated: true });
      });
    }, this.analyticsMetricsIntervalMs, runtimeId);
  }

  async loadAnalyticsMetrics(reason = "manual", runtimeId = this.runtimeId) {
    if (!this.guardRuntime(runtimeId) || !this.sessionToken) return;

    if (this.analyticsMetricsLoading) {
      this.addDiagLog("analytics-probe-skipped", { reason, skippedReason: "already-loading" });
      return;
    }

    this.analyticsMetricsLoading = true;

    const visibleQueues = this.getVisibleQueueNames();
    const params = new URLSearchParams({ range: this.kpiDurationRange || "60m" });
    if (visibleQueues.length) params.set("queues", visibleQueues.join(","));

    const path = `/api/analytics/queue-metrics?${params.toString()}`;
    let res;
    let data;
    try {
      res = await this.analyticsFetch(path);
      data = await this.readJsonResponse(res);
    } catch (err) {
      this.analyticsMetricsCache = {
        ok: false,
        fetchedAtMs: Date.now(),
        error: err?.message || String(err),
        source: "wxcc-analyzer-queue-all-fields-report",
        isolated: true
      };
      this.addDiagLog("analytics-probe-error", {
        reason,
        error: this.analyticsMetricsCache.error,
        isolated: true,
        noRebootstrap: true,
        wallboardUnaffected: true
      });
      if (this.lastWallboardData) this.processWallboardData(this.lastWallboardData);
      return;
    } finally {
      this.analyticsMetricsLoading = false;
    }

    if (!this.guardRuntime(runtimeId)) return;

    if (!res.ok || data.ok === false) {
      this.analyticsMetricsCache = {
        ok: false,
        fetchedAtMs: Date.now(),
        error: data?.error || `HTTP ${res.status}`,
        status: res.status,
        source: data?.source || "wxcc-analyzer-queue-all-fields-report",
        attempts: data?.attempts || [],
        isolated: true,
        data
      };
      this.addDiagLog("analytics-probe-failed", {
        reason,
        status: res.status,
        error: this.analyticsMetricsCache.error,
        isolated: true,
        noRebootstrap: true,
        data
      });
      if (this.lastWallboardData) this.processWallboardData(this.lastWallboardData);
      return;
    }

    this.analyticsMetricsCache = { ...data, fetchedAtMs: Date.now(), isolated: true };
    this.addDiagLog("analytics-probe-success", {
      reason,
      range: data.range || "",
      queues: data.queues || [],
      source: data.source || "",
      durationFilter: data.durationFilter || {},
      reportFields: data.reportFields || {},
      metrics: data.metrics || {},
      sample: data.sample || {},
      isolated: true
    });

    if (this.lastWallboardData) {
      this.processWallboardData(this.lastWallboardData);
    }
  }

  async loadWallboard(reason = "manual", runtimeId = this.runtimeId) {
    if (!this.guardRuntime(runtimeId)) return;
    this.addDiagLog("fetch-start", { reason, runtimeId });

    try {
      const res = await this.authorizedFetch(`/api/wallboard`);
      const data = await this.readJsonResponse(res);
      if (!this.guardRuntime(runtimeId)) return;

      if (!res.ok || data.ok === false) {
        this.addDiagLog("fetch-http-error", { reason, status: res.status, error: data?.error || "" });
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      this.addDiagLog("fetch-success", {
        reason,
        status: res.status,
        summary: this.getWallboardSummary(data)
      });

      if (!this.guardRuntime(runtimeId)) return;
      this.processWallboardData(data);

      if (data.stale === true) {
        this.setWallboardStatus(`Dashboard recovered with cached data ${new Date().toLocaleTimeString()}`);
      }
    } catch (err) {
      this.addDiagLog("fetch-error", { reason, message: err.message });
      this.setWallboardStatus(`Dashboard failed: ${err.message}`);
    }
  }

  startWallboardPollFallback(reason = "sse-disconnected", runtimeId = this.runtimeId) {
    if (this.wallboardPollFallbackHandle) return;

    this.addDiagLog("poll-fallback-start", { reason, runtimeId });
    this.wallboardPollFallbackHandle = this.safeSetInterval(() => {
      if (!this.sessionToken || !this.guardRuntime(runtimeId)) return;
      this.loadWallboard("poll-fallback", runtimeId).catch(err => {
        this.addDiagLog("poll-fallback-error", { message: err.message, runtimeId });
      });
    }, this.WALLBOARD_POLL_INTERVAL_MS || 5000, runtimeId);
  }

  stopWallboardPollFallback(reason = "sse-connected") {
    if (!this.wallboardPollFallbackHandle) return;
    clearInterval(this.wallboardPollFallbackHandle);
    this.wallboardPollFallbackHandle = null;
    this.addDiagLog("poll-fallback-stop", { reason });
  }

  scheduleWallboardReconnect(reason = "sse-error", runtimeId = this.runtimeId) {
    if (this.wallboardReconnectHandle || !this.sessionToken || !this.guardRuntime(runtimeId)) return;

    this.wallboardReconnectAttempt = (this.wallboardReconnectAttempt || 0) + 1;
    const delay = Math.min(30000, 2000 * this.wallboardReconnectAttempt);

    this.addDiagLog("sse-reconnect-scheduled", {
      reason,
      attempt: this.wallboardReconnectAttempt,
      delay,
      runtimeId
    });

    this.wallboardReconnectHandle = this.safeSetTimeout(() => {
      this.wallboardReconnectHandle = null;
      this.startWallboardStream(runtimeId);
      this.startAnalyticsMetricsPolling(runtimeId);
    }, delay, runtimeId);
  }

  startWallboardStream(runtimeId = this.runtimeId) {
    if (!this.guardRuntime(runtimeId)) return;
    if (this.wallboardEventSource) {
      try { this.wallboardEventSource.close(); } catch {}
      this.wallboardEventSource = null;
    }

    if (this.wallboardReconnectHandle) {
      clearTimeout(this.wallboardReconnectHandle);
      this.wallboardReconnectHandle = null;
    }

    if (!this.sessionToken) {
      this.addDiagLog("sse-start-failed", { reason: "missing-session-token" });
      this.setWallboardStatus("Live dashboard failed: missing session token");
      this.startWallboardPollFallback("missing-session-token", runtimeId);
      return;
    }

    const url = `${this.API_URL}/api/wallboard/stream?token=${encodeURIComponent(this.sessionToken)}`;
    this.addDiagLog("sse-open", { url: `${this.API_URL}/api/wallboard/stream?token=***` });

    let source;
    try {
      source = new EventSource(url);
    } catch (err) {
      this.addDiagLog("sse-constructor-exception", { error: this.serializeError(err) });
      this.startWallboardPollFallback("sse-constructor-exception", runtimeId);
      this.scheduleWallboardReconnect("sse-constructor-exception", runtimeId);
      return;
    }
    this.wallboardEventSource = source;

    source.addEventListener("open", () => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      this.wallboardReconnectAttempt = 0;
      this.addDiagLog("sse-opened", { readyState: source.readyState });
    });

    source.addEventListener("ready", event => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      let details = {};
      try { details = JSON.parse(event.data || "{}"); } catch {}
      this.wallboardReconnectAttempt = 0;
      this.stopWallboardPollFallback("sse-ready");
      this.addDiagLog("sse-ready", details);
      this.setWallboardStatus("Live dashboard connected");
    });

    source.addEventListener("wallboard", event => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      try {
        const data = JSON.parse(event.data);
        this.addDiagLog("sse-wallboard", { summary: this.getWallboardSummary(data) });
        if (!this.guardRuntime(runtimeId)) return;
      this.processWallboardData(data);
      } catch (err) {
        this.addDiagLog("sse-wallboard-parse-error", { message: err.message });
        this.setWallboardStatus(`Live dashboard parse failed: ${err.message}`);
      }
    });

    source.addEventListener("wallboard-error", event => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      let payload = {};
      try { payload = JSON.parse(event.data || "{}"); } catch {}
      this.addDiagLog("sse-wallboard-error", {
        reason: payload.reason || "",
        error: String(payload.error || "").slice(0, 500)
      });
      this.setWallboardStatus("Live event warning. Keeping dashboard alive and refreshing...");
      this.loadWallboard("sse-wallboard-error", runtimeId).catch(err => {
        this.addDiagLog("sse-wallboard-error-refresh-failed", { message: err.message });
      });
    });

    source.addEventListener("wxcc-event", event => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      let details = {};
      try { details = JSON.parse(event.data || "{}"); } catch {}
      this.addDiagLog("sse-wxcc-event", details);
      this.rememberRelationalStateFromWxccEvent(details);
      this.rememberAgentStateFromWxccEvent(details);
      this.rememberActiveCallFromWxccEvent(details);
      this.setWallboardStatus("WXCC event received. Refreshing...");
    });

    source.addEventListener("event-refresh", event => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      let details = {};
      try { details = JSON.parse(event.data || "{}"); } catch {}
      this.addDiagLog("sse-event-refresh", details);
      this.setWallboardStatus(`Event refresh completed ${new Date().toLocaleTimeString()}`);
    });

    source.addEventListener("error", () => {
      if (!this.guardRuntime(runtimeId) || this.wallboardEventSource !== source) return;
      const readyState = source.readyState;
      this.addDiagLog("sse-native-error", { readyState, attempt: this.wallboardReconnectAttempt || 0 });

      if (readyState === EventSource.CLOSED) {
        if (this.wallboardEventSource === source) {
          this.wallboardEventSource = null;
        }
        this.setWallboardStatus("Live dashboard disconnected. Reconnecting with polling fallback...");
        this.startWallboardPollFallback("sse-native-closed", runtimeId);
        this.scheduleWallboardReconnect("sse-native-closed", runtimeId);
        return;
      }

      // CONNECTING is often temporary. Keep EventSource alive and use HTTP polling as safety net.
      this.setWallboardStatus("Live dashboard reconnecting. Polling fallback active...");
      this.startWallboardPollFallback("sse-native-connecting", runtimeId);
    });
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
      this.addDiagLog("bootstrap-response", { status: res.status, durationMs: Math.round(performance.now() - bootstrapStart), role: data?.role || "", hasToken: Boolean(data?.sessionToken), error: data?.error || "" });

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
    // Disabled: entry point auto-polling is intentionally off.
    // The entry point is loaded once during init and again after Save.
  }

  startWallboardPolling() {
    // Disabled: wallboard updates are delivered through Server-Sent Events.
  }
}

if (!customElements.get("supervisor-access-widget-v2")) {
  customElements.define("supervisor-access-widget-v2", SupervisorAccessWidget);
}
