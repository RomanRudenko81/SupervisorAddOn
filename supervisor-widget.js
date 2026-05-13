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
    this.themeObserver = null;
  }

  connectedCallback() {
    this.render();
    this.populateStaticOptions();
    this.bindEvents();
    this.init();

    this.applyDetectedTheme();
    setTimeout(() => this.applyDetectedTheme(), 250);
    setTimeout(() => this.applyDetectedTheme(), 1000);
    setTimeout(() => this.applyDetectedTheme(), 2500);

    this.startThemeObserver();
  }

  disconnectedCallback() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }
  }

  parseRgb(color) {
    const match = String(color || "").match(
      /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
    );

    if (!match) return null;

    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] === undefined ? 1 : Number(match[4])
    };
  }

  getLuminance(rgb) {
    return (0.299 * rgb.r) + (0.587 * rgb.g) + (0.114 * rgb.b);
  }

  getComposedParent(element) {
    if (!element) return null;

    if (element.parentElement) {
      return element.parentElement;
    }

    const root = element.getRootNode?.();

    if (root && root.host) {
      return root.host;
    }

    return null;
  }

  getCandidateBackgrounds() {
    const candidates = [];

    let element = this;

    while (element) {
      const style = getComputedStyle(element);
      const bg = this.parseRgb(style.backgroundColor);

      if (bg && bg.a > 0.05) {
        candidates.push(bg);
      }

      element = this.getComposedParent(element);
    }

    const rect = this.getBoundingClientRect();

    if (rect.width > 0 && rect.height > 0) {
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);

      const elements = document.elementsFromPoint(x, y);

      elements.forEach(item => {
        const style = getComputedStyle(item);
        const bg = this.parseRgb(style.backgroundColor);

        if (bg && bg.a > 0.05) {
          candidates.push(bg);
        }
      });
    }

    const bodyBg = this.parseRgb(getComputedStyle(document.body).backgroundColor);
    const htmlBg = this.parseRgb(getComputedStyle(document.documentElement).backgroundColor);

    if (bodyBg && bodyBg.a > 0.05) candidates.push(bodyBg);
    if (htmlBg && htmlBg.a > 0.05) candidates.push(htmlBg);

    return candidates;
  }

  detectDarkTheme() {
    const candidates = this.getCandidateBackgrounds();

    if (candidates.length > 0) {
      const darkest = candidates.reduce((best, current) => {
        return this.getLuminance(current) < this.getLuminance(best)
          ? current
          : best;
      });

      return this.getLuminance(darkest) < 145;
    }

    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches || false;
  }

  applyDetectedTheme() {
    const isDark = this.detectDarkTheme();

    this.classList.toggle("theme-dark", isDark);
    this.classList.toggle("theme-light", !isDark);
  }

  startThemeObserver() {
    this.themeObserver = new MutationObserver(() => {
      this.applyDetectedTheme();
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"]
    });

    if (document.body) {
      this.themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"]
      });
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

        :host(.theme-light) {
          --widget-bg: rgba(255,255,255,0.18);
          --widget-border: rgba(0,0,0,0.055);
          --widget-text: #1f2937;
          --widget-muted: #4b5563;
          --widget-input-bg: rgba(255,255,255,0.72);
          --widget-input-border: rgba(0,0,0,0.16);
          --widget-badge-bg: rgba(0,0,0,0.08);
          --widget-switch-bg: #6b7280;
          --widget-blur: blur(8px);
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
          width: clamp(360px, 72vw, 1100px);
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

        h2 {
          margin: 0;
          font-size: clamp(20px, 1.8vw, 28px);
          font-weight: 700;
          text-transform: uppercase;
          color: var(--widget-text);
        }

        .subtext {
          color: var(--widget-muted);
          font-size: 13px;
        }

        .role-badge {
          padding: 4px 10px;
          border-radius: 999px;
          background: var(--widget-badge-bg);
          color: var(--widget-text);
          font-weight: bold;
          font-size: 13px;
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
          color: var(--widget-text);
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

        .category h3 {
          margin: 0 0 16px 0;
          font-size: 21px;
          font-weight: 700;
          color: var(--widget-text);
        }

        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-top: 15px;
        }

        .field label {
          font-size: 13px;
          color: var(--widget-muted);
        }

        input[type="text"],
        select {
          width: 100%;
          min-width: 0;
          padding: 12px;
          border-radius: 10px;
          border: 1px solid var(--widget-input-border);
          background: var(--widget-input-bg);
          color: var(--widget-text);
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
        input[disabled],
        select[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        #status {
          margin-top: 12px;
          font-size: 13px;
          color: var(--widget-muted);
          min-height: 18px;
        }

        @media (max-width: 900px) {
          .categories {
            grid-template-columns: 1fr;
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
            <span id="roleBadge" class="role-badge">...</span>
          </div>
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

  getVoiceOptions(language) {
    if (language === "en-US") {
      return ["en-US-Daniel", "en-US-Maria"];
    }

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
    this.$priorityQueue().disabled = !writable;
    this.$emergencyPrompt().disabled = !writable;
    this.$holidayPrompt().disabled = !writable;
    this.$globalLanguage().disabled = !writable;
    this.$globalVoiceName().disabled = !writable;
    this.$mohSalesQueue().disabled = !writable;
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

    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

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

  async saveState() {
    if (!["supervisor", "admin"].includes(this.currentRole)) {
      this.setStatus("No write permission", "error");
      return;
    }

    const payload = {
      Priority_Queue: Number(this.$priorityQueue().value),
      EmergencyCase: this.$toggle().checked,
      HolidayPrompt: this.$holidayPrompt().value,
      Global_VoiceName: this.$globalVoiceName().value,
      EmergencyPrompt: this.$emergencyPrompt().value,
      Global_Language: this.$globalLanguage().value,
      Moh_Sales_Queue: this.$mohSalesQueue().value
    };

    try {
      this.isUpdating = true;
      this.$saveBtn().disabled = true;
      this.setStatus("Saving...", "info");

      const res = await this.authorizedFetch(`/api/entrypoint/${this.ENTRY_POINT_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
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
