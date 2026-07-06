window.AgendaModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const config = window.ATELIER_CONFIG;

  function init() {
    ["#agendaMonthFilter", "#agendaStatusFilter", "#agendaPaymentFilter"].forEach((selector) => {
      UI.qs(selector)?.addEventListener("change", (event) => {
        window.AtelierApp.state.filters[event.target.id] = event.target.value;
        if (event.target.id === "agendaMonthFilter") window.AtelierApp.state.filters.agendaWeekOnly = false;
        render();
      });
    });

    UI.qs("#thisWeekBtn")?.addEventListener("click", () => {
      const filters = window.AtelierApp.state.filters;
      filters.agendaWeekOnly = !filters.agendaWeekOnly;
      render();
    });

    UI.qs("#agendaMonths")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-agenda-action]");
      if (!button) return;
      const order = window.AtelierApp.state.enrichedPedidos.find((item) => item.id === button.dataset.id);
      if (!order) return;
      if (button.dataset.agendaAction === "edit") window.PedidosModule.openOrderModal(order);
      if (button.dataset.agendaAction === "pay") window.PagosModule.openPaymentModal(order.id);
    });
  }

  function render() {
    renderFilters();
    const container = UI.qs("#agendaMonths");
    if (!container) return;

    const orders = getFilteredAgenda();
    const weekButton = UI.qs("#thisWeekBtn");
    if (weekButton) weekButton.textContent = window.AtelierApp.state.filters.agendaWeekOnly ? "Ver agenda completa" : "Eventos de esta semana";

    if (!orders.length) {
      container.innerHTML = UI.emptyState("Sin eventos en esta vista", "Cambia el mes, el estado o el filtro de pagos.");
      return;
    }

    const visible = orders.slice(0, config.MAX_AGENDA_EVENTS || 220);
    const note = orders.length > visible.length
      ? `<div class="result-note">Mostrando ${visible.length} de ${orders.length} eventos. Filtra por mes, estado o saldo para una vista más precisa.</div>`
      : "";
    const grouped = U.groupBy(visible, (order) => order.mesEvento || "sin-mes");
    const monthKeys = Object.keys(grouped).sort();
    container.innerHTML = note + monthKeys.map((key) => renderMonthGroup(key, grouped[key])).join("");
  }

  function renderFilters() {
    const keys = Array.from(new Set(window.AtelierApp.state.enrichedPedidos.map((pedido) => pedido.mesEvento).filter(Boolean))).sort();
    const monthOptions = keys.map((key) => ({ value: key, label: U.getMonthNameFromKey(key) }));
    UI.renderSelectOptions(UI.qs("#agendaMonthFilter"), monthOptions, window.AtelierApp.state.filters.agendaMonthFilter || "", "Todos los meses");
    UI.renderSelectOptions(UI.qs("#agendaStatusFilter"), U.ORDER_STATUSES, window.AtelierApp.state.filters.agendaStatusFilter || "", "Todos los estados");
  }

  function getFilteredAgenda() {
    const filters = window.AtelierApp.state.filters;
    const global = filters.globalSearch || "";

    return window.AtelierApp.state.enrichedPedidos
      .filter((order) => order.estado !== "cancelado")
      .filter((order) => !filters.agendaWeekOnly || U.isThisWeek(order.fechaEvento))
      .filter((order) => !filters.agendaMonthFilter || order.mesEvento === filters.agendaMonthFilter)
      .filter((order) => !filters.agendaStatusFilter || order.estado === filters.agendaStatusFilter)
      .filter((order) => !filters.agendaPaymentFilter || (
        filters.agendaPaymentFilter === "paid" ? order.estadoPago === "pagado" : order.estadoPago !== "pagado"
      ))
      .filter((order) => U.matchesSearch([
        order.clientaNombre,
        order.clientaInstagram,
        order.tipoVestido,
        order.descripcion
      ], global))
      .sort((a, b) => U.compareByDate(a, b, "fechaEvento"));
  }

  function renderMonthGroup(key, orders) {
    return `
      <section class="agenda-month">
        <div class="agenda-month-header">
          <div>
            <h4>${U.escapeHtml(U.getMonthNameFromKey(key))}</h4>
            <p>${orders.length} evento${orders.length === 1 ? "" : "s"} programado${orders.length === 1 ? "" : "s"}</p>
          </div>
          <strong>${U.formatCurrency(U.sum(orders.map((order) => order.saldoPendiente)))}</strong>
        </div>
        <div class="agenda-events">
          ${orders.map(renderAgendaCard).join("")}
        </div>
      </section>
    `;
  }

  function renderAgendaCard(order) {
    const date = U.parseDate(order.fechaEvento);
    const day = date ? String(date.getDate()).padStart(2, "0") : "--";
    const month = date ? U.MONTHS[date.getMonth()].slice(0, 3) : "Sin";
    const status = U.getStatusMeta(order.estado);
    const paymentTone = order.estadoPago === "pagado" ? "paid" : U.isPast(order.fechaLimitePago) ? "danger" : "warning";

    return `
      <article class="agenda-card">
        <div class="date-pill">
          <div>
            <strong>${day}</strong>
            <span>${U.escapeHtml(month)}</span>
          </div>
        </div>
        <div class="agenda-info">
          <h5>${U.escapeHtml(order.clientaNombre)} · ${U.escapeHtml(order.tipoVestido || "Vestido")}</h5>
          <p>Entrega: ${U.formatDate(order.fechaEntrega)} · Límite pago: ${U.formatDate(order.fechaLimitePago)}</p>
          <div class="card-actions">
            ${UI.badge(status.label, status.tone)}
            ${UI.badge(order.estadoPago === "pagado" ? "Pagado" : `Saldo ${U.formatCurrency(order.saldoPendiente)}`, paymentTone)}
          </div>
        </div>
        <div class="row-actions">
          <button class="small-button" data-agenda-action="pay" data-id="${U.escapeHtml(order.id)}" type="button">Abono</button>
          <button class="small-button" data-agenda-action="edit" data-id="${U.escapeHtml(order.id)}" type="button">Editar</button>
        </div>
      </article>
    `;
  }

  return {
    init,
    render,
    getFilteredAgenda
  };
})();
