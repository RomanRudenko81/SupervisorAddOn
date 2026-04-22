class SupervisorAccessWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this.API_URL = "https://wxcc-backend.onrender.com";
    this.ENTRY_POINT_ID = "284cd09a-eef4-40a2-82c6-53d08705e3e3";

    this.sessionToken = null;
    this.currentRole = "viewer";
    this.resolvedIdentity = null;
    this.identitySource = "none";
    this.storeSnapshot = null;
  }

  connectedCallback() {
    this.render();
    this.init();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: Arial;
          color: white;
          padding: 20px;
        }
        .box {
          background: rgba(255,255,255,0.08);
          padding: 20px;
          border-radius: 12px;
        }
        pre {
          background: black;
          color: #00ff88;
          padding: 10px;
          border-radius: 10px;
          overflow: auto;
        }
      </style>

      <div class="box">
        <h2>Supervisor Access Control</h2>
        <p id="user">Loading...</p>
        <pre id="output"></pre>
      </div>
    `;
  }

  setOutput(data) {
    this.shadowRoot.getElementById("output").textContent =
      JSON.stringify(data, null, 2);
  }

  async init() {
    const identity = this.resolveDesktopIdentity();

    this.shadowRoot.getElementById("user").innerText =
      identity.displayName || "Unknown User";

    try {
      const res = await fetch(`${this.API_URL}/api/session/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity)
      });

      const data = await res.json();

      this.setOutput({
        identitySource: this.identitySource,
        localIdentity: identity,
        storeSnapshot: this.storeSnapshot,
        backendResponse: data
      });

    } catch (e) {
      this.setOutput({
        error: e.message,
        identity: identity,
        storeSnapshot: this.storeSnapshot
      });
    }
  }

  resolveDesktopIdentity() {
    const store = window.$STORE || {};

    this.storeSnapshot = {
      keys: Object.keys(store),
      agent: store.agent,
      app: store.app,
      userProfile: store.userProfile
    };

    const identity = {
      email:
        store?.agent?.agentProfile?.email ||
        store?.app?.userProfile?.email ||
        "",
      userId:
        store?.agent?.agentProfile?.id ||
        store?.app?.userProfile?.id ||
        "",
      teamId:
        store?.agent?.teamId || "",
      displayName:
        store?.agent?.agentName ||
        store?.app?.userProfile?.displayName ||
        "Unknown User"
    };

    this.identitySource = "wxcc-store";
    return identity;
  }
}

customElements.define("supervisor-access-widget", SupervisorAccessWidget);
