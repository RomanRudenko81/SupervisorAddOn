class SupervisorAccessWidget extends HTMLElement {
  connectedCallback() {
    console.log("SupervisorAccessWidget connected");

    const agentProp = this.agent || "(leer)";
    const teamProp = this.team || "(leer)";
    const agentAttr = this.getAttribute("agent") || "(leer)";
    const teamAttr = this.getAttribute("team") || "(leer)";

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
        <p><strong>agent (property):</strong> ${agentProp}</p>
        <p><strong>team (property):</strong> ${teamProp}</p>
        <p><strong>agent (attribute):</strong> ${agentAttr}</p>
        <p><strong>team (attribute):</strong> ${teamAttr}</p>
      </div>
    `;
  }
}

customElements.define("supervisor-access-widget", SupervisorAccessWidget);
