window.ClientesModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const API = window.AtelierAPI;
  const config = window.ATELIER_CONFIG;

  function init() {
    UI.qs("#newClientBtn")?.addEventListener("click", () => openClientModal());

    UI.qs("#clientSearch")?.addEventListener("input", U.debounce((event) => {
      window.AtelierApp.state.filters.clientSearch = event.target.value;
      render();
    }));

    UI.qs("#clientsGrid")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-client-action]");
      if (!button) return;
      const client = window.AtelierApp.state.clientes.find((item) => item.id === button.dataset.id);
      if (!client) return;

      const action = button.dataset.clientAction;
      if (action === "edit") openClientModal(client);
      if (action === "delete") confirmDeleteClient(client);
      if (action === "order") window.PedidosModule.openOrderModal(null, client.id);
      if (action === "quote") {
        window.AtelierApp.navigate("cotizaciones");
        window.CotizacionesModule.openEditor(null, { clienteId: client.id });
      }
      if (action === "history") {
        window.AtelierApp.navigate("pedidos");
        const input = UI.qs("#orderSearch");
        if (input) input.value = client.nombre;
        window.AtelierApp.state.filters.orderSearch = client.nombre;
        window.PedidosModule.render();
      }
    });
  }

  function render() {
    const appState = window.AtelierApp.state;
    const query = appState.filters.clientSearch || "";
    const global = appState.filters.globalSearch || "";
    const clients = appState.clientes
      .filter((client) => U.matchesSearch([
        client.nombre,
        client.apellidos,
        client.telefono,
        client.instagram,
        client.correo,
        client.direccion,
        client.notas
      ], query))
      .filter((client) => U.matchesSearch([
        client.nombre,
        client.telefono,
        client.instagram,
        client.correo
      ], global))
      .sort((a, b) => U.normalize(a.nombre).localeCompare(U.normalize(b.nombre)));

    const grid = UI.qs("#clientsGrid");
    if (!grid) return;

    if (!clients.length) {
      grid.innerHTML = UI.emptyState("Sin clientas para mostrar", "Crea una clienta o ajusta la búsqueda.");
      return;
    }

    const visible = clients.slice(0, config.MAX_CLIENT_CARDS || 120);
    const note = clients.length > visible.length
      ? `<div class="result-note">Mostrando ${visible.length} de ${clients.length} clientas. Usa la búsqueda para afinar resultados.</div>`
      : "";

    grid.innerHTML = note + visible.map(renderClientCard).join("");
  }

  function renderClientCard(client) {
    const orders = window.AtelierApp.state.ordersByClient.get(client.id) || [];
    const activeOrders = orders.filter((pedido) => !["entregado", "cancelado"].includes(pedido.estado));
    const pending = U.sum(orders.map((pedido) => pedido.saldoPendiente));
    const lastOrder = orders.slice().sort((a, b) => U.compareByDate(a, b, "fechaEvento")).at(0);

    return `
      <article class="client-card">
        <div class="client-card-header">
          <div>
            <h4>${U.escapeHtml(client.nombre)}</h4>
            <p>${U.escapeHtml(client.instagram || "Sin Instagram")}</p>
          </div>
          ${UI.badge(`${orders.length} pedido${orders.length === 1 ? "" : "s"}`, activeOrders.length ? "info" : "neutral")}
        </div>
        <div class="card-meta">
          <span><strong>Teléfono:</strong> ${U.escapeHtml(client.telefono || "Sin teléfono")}</span>
          <span><strong>Correo:</strong> ${U.escapeHtml(client.correo || "Sin correo")}</span>
          <span><strong>Saldo:</strong> ${U.formatCurrency(pending)}</span>
          <span><strong>Próximo evento:</strong> ${lastOrder ? U.formatDate(lastOrder.fechaEvento) : "Sin pedidos"}</span>
        </div>
        ${client.notas ? `<p>${U.escapeHtml(client.notas)}</p>` : ""}
        <div class="card-actions">
          <button class="small-button" data-client-action="history" data-id="${U.escapeHtml(client.id)}" type="button">Historial</button>
          <button class="small-button" data-client-action="order" data-id="${U.escapeHtml(client.id)}" type="button">Pedido</button>
          <button class="small-button" data-client-action="quote" data-id="${U.escapeHtml(client.id)}" type="button">Cotizar</button>
          <button class="small-button" data-client-action="edit" data-id="${U.escapeHtml(client.id)}" type="button">Editar</button>
          <button class="small-button" data-client-action="delete" data-id="${U.escapeHtml(client.id)}" type="button">Eliminar</button>
        </div>
      </article>
    `;
  }

  function openClientModal(client = null) {
    const isEdit = Boolean(client);
    UI.openModal({
      title: isEdit ? "Editar clienta" : "Nueva clienta",
      submitText: isEdit ? "Guardar cambios" : "Crear clienta",
      body: `
        <div class="form-grid">
          ${field("Nombre", "nombres", client?.nombres || client?.nombre, "text", true)}
          ${field("Apellidos", "apellidos", client?.apellidos, "text", true)}
          ${field("Teléfono / WhatsApp", "telefono", client?.telefono, "tel", true)}
          ${field("Instagram", "instagram", client?.instagram, "text")}
          ${field("Correo", "correo", client?.correo, "email")}
          ${field("Dirección", "direccion", client?.direccion, "text", false, "full")}
          <div class="form-field full">
            <label for="notas">Notas de la clienta</label>
            <textarea class="field-textarea" id="notas" name="notas" placeholder="Preferencias, tallas, detalles de comunicación...">${U.escapeHtml(client?.notas || "")}</textarea>
          </div>
        </div>
      `,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        if (!payload.nombres?.trim()) throw new Error("El nombre es obligatorio.");
        if (!payload.apellidos?.trim()) throw new Error("Los apellidos son obligatorios.");
        if (!payload.telefono?.trim()) throw new Error("El teléfono es obligatorio.");
        payload.nombre = `${payload.nombres.trim()} ${payload.apellidos.trim()}`.trim();

        if (isEdit) await API.updateCliente(client.id, payload);
        else await API.createCliente(payload);

        await window.AtelierApp.afterMutation(isEdit ? "Clienta actualizada" : "Clienta creada");
      }
    });
  }

  function confirmDeleteClient(client) {
    const count = window.AtelierApp.state.pedidos.filter((pedido) => pedido.clienteId === client.id).length;
    const quoteCount = window.AtelierApp.state.cotizaciones.filter((quote) => quote.clienteId === client.id).length;
    UI.openConfirm({
      title: "Eliminar clienta",
      message: count || quoteCount
        ? `También se eliminarán ${count} pedido(s), ${quoteCount} cotización(es), sus costos, pagos y citas asociados. Esta acción no se puede deshacer.`
        : "Esta acción no se puede deshacer.",
      confirmText: "Eliminar clienta",
      onConfirm: async () => {
        await API.deleteCliente(client.id);
        await window.AtelierApp.afterMutation("Clienta eliminada");
      }
    });
  }

  function field(label, name, value = "", type = "text", required = false, extraClass = "") {
    return `
      <div class="form-field ${extraClass}">
        <label for="${U.escapeHtml(name)}">${U.escapeHtml(label)}</label>
        <input class="field-input" id="${U.escapeHtml(name)}" name="${U.escapeHtml(name)}" type="${type}" value="${U.escapeHtml(value || "")}" ${required ? "required" : ""}>
      </div>
    `;
  }

  return {
    init,
    render,
    openClientModal
  };
})();
