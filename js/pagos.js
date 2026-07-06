window.PagosModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const API = window.AtelierAPI;
  const config = window.ATELIER_CONFIG;

  function init() {
    UI.qs("#newPaymentBtn")?.addEventListener("click", () => openPaymentModal());

    UI.qs("#paymentsTable")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-payment-action]");
      if (!button) return;
      const payment = window.AtelierApp.state.pagos.find((item) => item.id === button.dataset.id);
      if (!payment) return;
      confirmDeletePayment(payment);
    });
  }

  function render() {
    renderSummary();
    renderTable();
  }

  function renderSummary() {
    const orders = window.AtelierApp.state.enrichedPedidos;
    const totalPaid = U.sum(window.AtelierApp.state.pagos.map((pago) => pago.monto));
    const totalPending = U.sum(orders.map((order) => order.saldoPendiente));
    const pendingCount = orders.filter((order) => order.saldoPendiente > 0).length;

    UI.qs("#paymentsTotalPaid").textContent = U.formatCurrency(totalPaid);
    UI.qs("#paymentsTotalPending").textContent = U.formatCurrency(totalPending);
    UI.qs("#paymentsPendingCount").textContent = pendingCount;
  }

  function renderTable() {
    const table = UI.qs("#paymentsTable");
    if (!table) return;

    const payments = window.AtelierApp.state.pagos
      .slice()
      .sort((a, b) => U.compareByDate(b, a, "fechaPago"));

    if (!payments.length) {
      table.innerHTML = UI.emptyState("Sin pagos registrados", "Registra el primer abono desde un pedido o desde este módulo.");
      return;
    }

    const visible = payments.slice(0, config.MAX_PAYMENT_ROWS || 180);
    const note = payments.length > visible.length
      ? `<div class="result-note">Mostrando ${visible.length} de ${payments.length} pagos. Los más recientes aparecen primero.</div>`
      : "";

    table.innerHTML = `
      <div class="table-row header">
        <div>Clienta</div>
        <div>Pedido</div>
        <div>Fecha</div>
        <div>Monto</div>
        <div>Método</div>
        <div>Acciones</div>
      </div>
      ${note}
      ${visible.map(renderPaymentRow).join("")}
    `;
  }

  function renderPaymentRow(payment) {
    const order = window.AtelierApp.state.orderById.get(payment.pedidoId);
    const isInitial = String(payment.esPrimerAbono).toUpperCase() === "SI";

    return `
      <div class="table-row">
        <div data-label="Clienta">
          <strong>${U.escapeHtml(order?.clientaNombre || "Clienta sin asignar")}</strong>
          <small>${U.escapeHtml(order?.clientaInstagram || "")}</small>
        </div>
        <div data-label="Pedido">
          <strong>${U.escapeHtml(order?.tipoVestido || "Pedido eliminado")}</strong>
          <small>${UI.badge(payment.concepto || "Abono", isInitial ? "info" : "neutral")}</small>
        </div>
        <div data-label="Fecha">
          <strong>${U.formatDate(payment.fechaPago)}</strong>
          <small>Registro: ${U.formatDate(payment.fechaRegistro)}</small>
        </div>
        <div data-label="Monto">
          <strong>${U.formatCurrency(payment.monto)}</strong>
          <small>${order ? `Saldo actual: ${U.formatCurrency(order.saldoPendiente)}` : ""}</small>
        </div>
        <div data-label="Método">
          <strong>${U.escapeHtml(payment.metodo || "Sin método")}</strong>
          <small>${U.escapeHtml(payment.notas || "")}</small>
        </div>
        <div data-label="Acciones" class="row-actions">
          <button class="small-button" data-payment-action="delete" data-id="${U.escapeHtml(payment.id)}" type="button">Eliminar</button>
        </div>
      </div>
    `;
  }

  function openPaymentModal(preselectedOrderId = "") {
    const pendingOrders = window.AtelierApp.state.enrichedPedidos
      .filter((order) => order.saldoPendiente > 0 && !["cancelado"].includes(order.estado))
      .sort((a, b) => U.compareByDate(a, b, "fechaLimitePago"));

    const selectedOrder = window.AtelierApp.state.enrichedPedidos.find((order) => order.id === preselectedOrderId);
    if (!pendingOrders.length && !selectedOrder) {
      UI.toast("No hay saldos pendientes", "Todos los pedidos registrados aparecen como pagados.", "success");
      return;
    }

    const ordersForSelect = selectedOrder && !pendingOrders.some((order) => order.id === selectedOrder.id)
      ? [selectedOrder, ...pendingOrders]
      : pendingOrders;

    const options = ordersForSelect.map((order) => `
      <option value="${U.escapeHtml(order.id)}" ${order.id === preselectedOrderId ? "selected" : ""}>
        ${U.escapeHtml(order.clientaNombre)} · ${U.escapeHtml(order.tipoVestido)} · saldo ${U.formatCurrency(order.saldoPendiente)}
      </option>
    `).join("");

    UI.openModal({
      title: "Registrar abono",
      submitText: "Guardar abono",
      body: `
        <div class="form-grid">
          <div class="form-field full">
            <label for="pedidoId">Pedido</label>
            <select class="field-input" id="pedidoId" name="pedidoId" required>${options}</select>
          </div>
          <div class="form-field">
            <label for="fechaPago">Fecha de pago</label>
            <input class="field-input" id="fechaPago" name="fechaPago" type="date" value="${U.todayISO()}" required>
          </div>
          <div class="form-field">
            <label for="monto">Monto</label>
            <input class="field-input money-input" id="monto" name="monto" type="text" inputmode="numeric" autocomplete="off" placeholder="0" required>
          </div>
          <div class="form-field">
            <label for="metodo">Método</label>
            <select class="field-input" id="metodo" name="metodo">
              ${U.PAYMENT_METHODS.map((method) => `<option value="${method}">${method}</option>`).join("")}
            </select>
          </div>
          <div class="form-field">
            <label for="concepto">Concepto</label>
            <input class="field-input" id="concepto" name="concepto" type="text" value="Abono">
          </div>
          <div class="form-field full">
            <label for="notas">Notas</label>
            <textarea class="field-textarea" id="notas" name="notas" placeholder="Referencia de transferencia, observaciones..."></textarea>
          </div>
        </div>
      `,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        payload.monto = U.parseMoneyInput(payload.monto);
        const order = window.AtelierApp.state.enrichedPedidos.find((item) => item.id === payload.pedidoId);
        if (!order) throw new Error("Selecciona un pedido válido.");
        if (payload.monto <= 0) throw new Error("El monto debe ser mayor a cero.");
        if (payload.monto > order.saldoPendiente) throw new Error("El abono no puede superar el saldo pendiente.");

        await API.registerPago(payload);
        await window.AtelierApp.afterMutation("Abono registrado");
      }
    });
  }

  function confirmDeletePayment(payment) {
    UI.openConfirm({
      title: "Eliminar pago",
      message: "El saldo del pedido se recalculará automáticamente. Esta acción no se puede deshacer.",
      confirmText: "Eliminar pago",
      onConfirm: async () => {
        await API.deletePago(payment.id);
        await window.AtelierApp.afterMutation("Pago eliminado");
      }
    });
  }

  return {
    init,
    render,
    openPaymentModal
  };
})();
