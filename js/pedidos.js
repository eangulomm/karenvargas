window.PedidosModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const API = window.AtelierAPI;
  const config = window.ATELIER_CONFIG;

  function init() {
    UI.qs("#newOrderBtn")?.addEventListener("click", () => openOrderModal());
    UI.qs("#quickOrderBtn")?.addEventListener("click", () => openOrderModal());

    UI.qs("#orderSearch")?.addEventListener("input", U.debounce((event) => {
      window.AtelierApp.state.filters.orderSearch = event.target.value;
      render();
    }));

    ["#orderMonthFilter", "#orderStatusFilter", "#orderPaymentFilter"].forEach((selector) => {
      UI.qs(selector)?.addEventListener("change", (event) => {
        window.AtelierApp.state.filters[event.target.id] = event.target.value;
        render();
      });
    });

    UI.qs("#ordersTable")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-order-action]");
      if (!button) return;
      const order = window.AtelierApp.state.enrichedPedidos.find((item) => item.id === button.dataset.id);
      if (!order) return;

      const action = button.dataset.orderAction;
      if (action === "edit") openOrderModal(order);
      if (action === "delete") confirmDeleteOrder(order);
      if (action === "pay") window.PagosModule.openPaymentModal(order.id);
    });
  }

  function render() {
    renderFilters();
    const table = UI.qs("#ordersTable");
    if (!table) return;

    const orders = getFilteredOrders();
    if (!orders.length) {
      table.innerHTML = UI.emptyState("Sin pedidos para mostrar", "Crea un pedido o ajusta los filtros.");
      return;
    }

    const visible = orders.slice(0, config.MAX_ORDER_ROWS || 160);
    const note = orders.length > visible.length
      ? `<div class="result-note">Mostrando ${visible.length} de ${orders.length} pedidos. Usa mes, estado o búsqueda para trabajar más rápido.</div>`
      : "";

    table.innerHTML = `
      <div class="table-row header">
        <div>Clienta</div>
        <div>Vestido</div>
        <div>Evento</div>
        <div>Total</div>
        <div>Saldo</div>
        <div>Acciones</div>
      </div>
      ${note}
      ${visible.map(renderOrderRow).join("")}
    `;
  }

  function renderFilters() {
    const monthOptions = getMonthOptions();
    UI.renderSelectOptions(UI.qs("#orderMonthFilter"), monthOptions, window.AtelierApp.state.filters.orderMonthFilter || "", "Todos los meses");
    UI.renderSelectOptions(UI.qs("#orderStatusFilter"), U.ORDER_STATUSES, window.AtelierApp.state.filters.orderStatusFilter || "", "Todos los estados");
  }

  function getMonthOptions() {
    const keys = Array.from(new Set(window.AtelierApp.state.enrichedPedidos.map((pedido) => pedido.mesEvento).filter(Boolean))).sort();
    return keys.map((key) => ({ value: key, label: U.getMonthNameFromKey(key) }));
  }

  function getFilteredOrders() {
    const filters = window.AtelierApp.state.filters;
    const query = filters.orderSearch || "";
    const global = filters.globalSearch || "";

    return window.AtelierApp.state.enrichedPedidos
      .filter((order) => U.matchesSearch([
        order.clientaNombre,
        order.clientaTelefono,
        order.clientaInstagram,
        order.tipoVestido,
        order.descripcion,
        order.referencias
      ], query))
      .filter((order) => U.matchesSearch([
        order.clientaNombre,
        order.clientaInstagram,
        order.tipoVestido,
        order.descripcion
      ], global))
      .filter((order) => !filters.orderMonthFilter || order.mesEvento === filters.orderMonthFilter)
      .filter((order) => !filters.orderStatusFilter || order.estado === filters.orderStatusFilter)
      .filter((order) => !filters.orderPaymentFilter || (
        filters.orderPaymentFilter === "paid" ? order.estadoPago === "pagado" : order.estadoPago !== "pagado"
      ))
      .sort((a, b) => U.compareByDate(a, b, "fechaEvento"));
  }

  function renderOrderRow(order) {
    const status = U.getStatusMeta(order.estado);
    const paymentBadge = order.estadoPago === "pagado"
      ? UI.badge("Pagado", "paid")
      : UI.badge("Saldo pendiente", U.isPast(order.fechaLimitePago) ? "danger" : "warning");

    return `
      <div class="table-row">
        <div data-label="Clienta">
          <strong>${U.escapeHtml(order.clientaNombre)}</strong>
          <small>${U.escapeHtml(order.clientaInstagram || order.clientaTelefono || "")}</small>
        </div>
        <div data-label="Vestido">
          <strong>${U.escapeHtml(order.tipoVestido || "Vestido personalizado")}</strong>
          <small>${UI.badge(status.label, status.tone)}</small>
        </div>
        <div data-label="Evento">
          <strong>${U.formatDate(order.fechaEvento)}</strong>
          <small>Entrega: ${U.formatDate(order.fechaEntrega)}</small>
        </div>
        <div data-label="Total">
          <strong>${U.formatCurrency(order.valorTotal)}</strong>
          <small>Pagado: ${U.formatCurrency(order.pagoTotal)}</small>
        </div>
        <div data-label="Saldo">
          <strong>${U.formatCurrency(order.saldoPendiente)}</strong>
          <small>${paymentBadge}</small>
        </div>
        <div data-label="Acciones" class="row-actions">
          <button class="small-button" data-order-action="pay" data-id="${U.escapeHtml(order.id)}" type="button">Abono</button>
          <button class="small-button" data-order-action="edit" data-id="${U.escapeHtml(order.id)}" type="button">Editar</button>
          <button class="small-button" data-order-action="delete" data-id="${U.escapeHtml(order.id)}" type="button">Eliminar</button>
        </div>
      </div>
    `;
  }

  function openOrderModal(order = null, preferredClientId = "") {
    const clients = window.AtelierApp.state.clientes;
    if (!clients.length) {
      UI.toast("Primero crea una clienta", "Cada pedido debe quedar asociado a una clienta.", "warning");
      window.ClientesModule.openClientModal();
      return;
    }

    const isEdit = Boolean(order);
    const selectedClientId = order?.clienteId || preferredClientId || "";
    const selectedClient = clients.find((client) => client.id === selectedClientId) || null;
    const sortedClients = clients
      .slice()
      .sort((a, b) => U.normalize(a.nombre).localeCompare(U.normalize(b.nombre)));

    const statusOptions = U.ORDER_STATUSES
      .map((status) => `<option value="${status.value}" ${(order?.estado || "pendiente") === status.value ? "selected" : ""}>${status.label}</option>`)
      .join("");

    UI.openModal({
      title: isEdit ? "Editar pedido" : "Nuevo pedido",
      submitText: isEdit ? "Guardar pedido" : "Crear pedido",
      body: `
        <div class="form-grid">
          <div class="form-field combo-field">
            <label for="clienteSearchInput">Clienta</label>
            <input class="field-input" id="clienteSearchInput" type="text" autocomplete="off" placeholder="Escribe el nombre de la clienta..." value="${U.escapeHtml(selectedClient?.nombre || "")}" required>
            <input type="hidden" id="clienteId" name="clienteId" value="${U.escapeHtml(selectedClient?.id || "")}">
            <div class="combo-results" id="clienteResults" role="listbox" aria-label="Clientas"></div>
          </div>
          ${field("Tipo de vestido", "tipoVestido", order?.tipoVestido, "text", true)}
          ${field("Valor total", "valorTotal", order?.valorTotal, "money", true)}
          ${field("Primer abono", "primerAbono", order?.primerAbono, "money")}
          ${field("Fecha del evento", "fechaEvento", order?.fechaEvento, "date", true)}
          ${field("Fecha límite de pago", "fechaLimitePago", order?.fechaLimitePago, "date")}
          ${field("Fecha de entrega", "fechaEntrega", order?.fechaEntrega, "date")}
          <div class="form-field">
            <label for="estado">Estado</label>
            <select class="field-input" id="estado" name="estado">${statusOptions}</select>
          </div>
          <div class="form-field full">
            <label for="descripcion">Descripción del vestido</label>
            <textarea class="field-textarea" id="descripcion" name="descripcion" placeholder="Silueta, tela, color, acabados, detalles especiales...">${U.escapeHtml(order?.descripcion || "")}</textarea>
          </div>
          <div class="form-field full">
            <label for="notasInternas">Notas internas</label>
            <textarea class="field-textarea" id="notasInternas" name="notasInternas" placeholder="Pruebas, ajustes, compromisos, proveedores...">${U.escapeHtml(order?.notasInternas || "")}</textarea>
          </div>
        </div>
      `,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        payload.valorTotal = U.parseMoneyInput(payload.valorTotal);
        payload.primerAbono = U.parseMoneyInput(payload.primerAbono);

        if (!payload.clienteId) throw new Error("Selecciona una clienta.");
        if (!payload.tipoVestido?.trim()) throw new Error("El tipo de vestido es obligatorio.");
        if (payload.valorTotal <= 0) throw new Error("El valor total debe ser mayor a cero.");
        if (!payload.fechaEvento) throw new Error("La fecha del evento es obligatoria.");
        if (payload.primerAbono > payload.valorTotal) throw new Error("El primer abono no puede superar el valor total.");

        if (isEdit) await API.updatePedido(order.id, payload);
        else await API.createPedido(payload);

        await window.AtelierApp.afterMutation(isEdit ? "Pedido actualizado" : "Pedido creado");
      }
    });

    bindClientCombo(sortedClients);
  }

  function bindClientCombo(clients) {
    const root = UI.qs("#modalRoot");
    const input = UI.qs("#clienteSearchInput", root);
    const hidden = UI.qs("#clienteId", root);
    const results = UI.qs("#clienteResults", root);
    if (!input || !hidden || !results) return;

    function renderResults(query) {
      const term = query.trim();
      const matches = term
        ? clients.filter((client) => U.matchesSearch([client.nombre, client.instagram, client.telefono], term))
        : clients;

      results.innerHTML = matches.length
        ? matches.map((client) => `
            <button type="button" class="combo-item" data-client-id="${U.escapeHtml(client.id)}">
              <strong>${U.escapeHtml(client.nombre)}</strong>
              <span>${U.escapeHtml(client.instagram || client.telefono || "")}</span>
            </button>
          `).join("")
        : `<div class="global-search-empty">Sin coincidencias, revisa el nombre</div>`;

      results.classList.add("is-open");
    }

    function selectClient(client) {
      hidden.value = client.id;
      input.value = client.nombre;
      results.classList.remove("is-open");
    }

    input.addEventListener("focus", () => renderResults(input.value));
    input.addEventListener("input", () => {
      hidden.value = "";
      renderResults(input.value);
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => results.classList.remove("is-open"), 150);
    });
    results.addEventListener("mousedown", (event) => {
      const button = event.target.closest("[data-client-id]");
      if (!button) return;
      const client = clients.find((item) => item.id === button.dataset.clientId);
      if (client) selectClient(client);
    });
  }

  function confirmDeleteOrder(order) {
    UI.openConfirm({
      title: "Eliminar pedido",
      message: "Se eliminará el vestido y su historial de pagos. Esta acción no se puede deshacer.",
      confirmText: "Eliminar pedido",
      onConfirm: async () => {
        await API.deletePedido(order.id);
        await window.AtelierApp.afterMutation("Pedido eliminado");
      }
    });
  }

  function field(label, name, value = "", type = "text", required = false, extraClass = "") {
    const isMoney = type === "money";
    const inputType = isMoney ? "text" : type;
    const displayValue = isMoney ? U.formatMoneyInput(value) : (value ?? "");
    const extraAttrs = isMoney
      ? 'inputmode="numeric" autocomplete="off"'
      : (type === "number" ? 'min="0" step="1000"' : "");
    return `
      <div class="form-field ${extraClass}">
        <label for="${U.escapeHtml(name)}">${U.escapeHtml(label)}</label>
        <input class="field-input ${isMoney ? "money-input" : ""}" id="${U.escapeHtml(name)}" name="${U.escapeHtml(name)}" type="${inputType}" value="${U.escapeHtml(displayValue)}" ${required ? "required" : ""} ${extraAttrs}>
      </div>
    `;
  }

  return {
    init,
    render,
    openOrderModal,
    getFilteredOrders
  };
})();
