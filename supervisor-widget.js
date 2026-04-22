class SupervisorAccessWidget extends HTMLElement {
  connectedCallback() {
    console.log("SupervisorAccessWidget connected");

    this.innerHTML = `
      <div style="
        margin: 24px;
        padding: 24px;
        border-radius: 14px;
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.15);
        color: white;
        font-family: Arial, sans-serif;
      ">
        <h2 style="margin-top:0;">Supervisor Widget Test</h2>
        <p>Das Web Component Widget wurde erfolgreich geladen.</p>
        <p><strong>agent:</strong> ${this.getAttribute("agent") || "(leer)"}</p>
        <p><strong>team:</strong> ${this.getAttribute("team") || "(leer)"}</p>
      </div>
    `;
  }
}

customElements.define("supervisor-access-widget", SupervisorAccessWidget);
