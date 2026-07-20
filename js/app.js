window.AtelierApp = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const API = window.AtelierAPI;

  const state = {
    clientes: [],
    pedidos: [],
    pagos: [],
    citas: [],
    cotizaciones: [],
    catalogoCostos: [],
    enrichedPedidos: [],
    clientById: new Map(),
    orderById: new Map(),
    paymentsByOrder: new Map(),
    ordersByClient: new Map(),
    currentView: "dashboard",
    isSyncing: false,
    filters: {
      globalSearch: "",
      clientSearch: "",
      orderSearch: "",
      orderMonthFilter: "",
      orderStatusFilter: "",
      orderPaymentFilter: "",
      agendaMonthFilter: "",
      agendaStatusFilter: "",
      agendaTodayOnly: false,
      agendaWeekOnly: false
    }
  };

  async function init() {
    bindAuthEvents();
    if (API.hasRemoteUrl() && !API.hasSession()) {
      showLogin();
      return;
    }
    await startApplication();
  }

  function bindAuthEvents() {
    UI.qs("#loginForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = UI.qs("#loginBtn");
      const errorBox = UI.qs("#loginError");
      const username = UI.qs("#loginUsername")?.value.trim();
      const password = UI.qs("#loginPassword")?.value || "";
      if (errorBox) errorBox.textContent = "";
      if (button) { button.disabled = true; button.textContent = "Ingresando..."; }
      try {
        await API.login(username, password);
        if (UI.qs("#loginPassword")) UI.qs("#loginPassword").value = "";
        hideLogin();
        await startApplication();
      } catch (error) {
        if (errorBox) errorBox.textContent = error.message || "No fue posible iniciar sesión.";
      } finally {
        if (button) { button.disabled = false; button.textContent = "Iniciar sesión"; }
      }
    });

    UI.qs("#logoutBtn")?.addEventListener("click", async () => {
      UI.showLoader("Cerrando sesión...");
      try { await API.logout(); } catch (error) { console.warn("La sesión se cerró localmente.", error); }
      finally {
        setData({ clientes: [], pedidos: [], pagos: [], citas: [], cotizaciones: [], catalogoCostos: [] });
        UI.hideLoader();
        showLogin();
      }
    });

    window.addEventListener("atelier:auth-required", showLogin);
  }

  function showLogin() {
    document.body.classList.add("auth-locked");
    UI.hideLoader();
    window.setTimeout(() => UI.qs("#loginPassword")?.focus(), 0);
  }

  function hideLogin() {
    document.body.classList.remove("auth-locked");
    const errorBox = UI.qs("#loginError");
    if (errorBox) errorBox.textContent = "";
  }

  async function startApplication() {
    if (!state.globalEventsReady) {
      bindGlobalEvents();
      state.globalEventsReady = true;
    }
    const cached = API.hasRemoteUrl() ? null : API.getCachedData();

    try {
      if (cached) {
        setData(cached);
        initModules();
        renderAll();
        silentRefresh();
        return;
      }

      UI.showLoader("Preparando el atelier...");
      const data = await API.loadAll();
      setData(data);
      initModules();
      renderAll();
      hideLogin();
      if (!API.hasRemoteUrl()) {
        UI.toast("Modo demostración activo", "Configura la URL de Apps Script para guardar en Google Sheets.", "warning");
      }
    } catch (error) {
      if (error.code === "AUTH_REQUIRED") {
        API.clearSession();
        showLogin();
        return;
      }
      const fallback = API.getCachedData() || API.getState();
      setData(fallback);
      initModules();
      renderAll();
      if (!fallback.clientes?.length && !fallback.pedidos?.length && !fallback.pagos?.length) {
        UI.toast("Conexión no disponible", error.message || "Revisa la URL de Apps Script.", "error");
      } else {
        console.warn("No se pudo completar la carga remota. Se usó caché local.", error);
      }
    } finally {
      UI.hideLoader();
    }
  }

  function initModules() {
    if (state.modulesReady) return;
    window.ClientesModule.init();
    window.PedidosModule.init();
    window.PagosModule.init();
    window.AgendaModule.init();
    window.CotizacionesModule.init();
    state.modulesReady = true;
  }

  function bindGlobalEvents() {
    UI.qsa(".nav-item").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.view));
    });

    UI.qsa("[data-view-link]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.viewLink));
    });

    UI.qs("#mobileMenuBtn")?.addEventListener("click", () => {
      UI.qs(".sidebar")?.classList.toggle("is-open");
    });

    UI.qs("#syncBtn")?.addEventListener("click", async () => {
      await refresh(true, { blocking: true, successToast: true });
    });

    UI.qs("#globalSearch")?.addEventListener("input", U.debounce((event) => {
      state.filters.globalSearch = event.target.value;
      renderAll();
      renderGlobalSearchResults(event.target.value);
    }));

    UI.qs("#globalSearch")?.addEventListener("focus", (event) => {
      if (event.target.value.trim()) renderGlobalSearchResults(event.target.value);
    });

    UI.qs("#globalSearchResults")?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-search-result]");
      if (!item) return;
      const { view, clientId, orderId } = item.dataset;
      goToSearchResult(view, clientId, orderId);
    });

    document.addEventListener("click", (event) => {
      const wrap = UI.qs(".search-wrap");
      if (wrap && !wrap.contains(event.target)) closeGlobalSearchResults();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        UI.closeModal();
        closeGlobalSearchResults();
      }
    });
  }

  function closeGlobalSearchResults() {
    UI.qs("#globalSearchResults")?.classList.remove("is-open");
  }

  function renderGlobalSearchResults(rawQuery) {
    const panel = UI.qs("#globalSearchResults");
    if (!panel) return;
    const query = (rawQuery || "").trim();

    if (!query) {
      panel.classList.remove("is-open");
      panel.innerHTML = "";
      return;
    }

    const clientMatches = state.clientes
      .filter((client) => U.matchesSearch([
        client.nombre,
        client.telefono,
        client.instagram,
        client.correo
      ], query))
      .slice(0, 5);

    const orderMatches = state.enrichedPedidos
      .filter((order) => U.matchesSearch([
        order.clientaNombre,
        order.clientaInstagram,
        order.tipoVestido,
        order.descripcion
      ], query))
      .slice(0, 5);

    if (!clientMatches.length && !orderMatches.length) {
      panel.innerHTML = `<div class="global-search-empty">Sin resultados para "${U.escapeHtml(query)}"</div>`;
      panel.classList.add("is-open");
      return;
    }

    const clientsHtml = clientMatches.length ? `
      <div class="global-search-group">
        <p class="global-search-group-title">Clientas</p>
        ${clientMatches.map((client) => `
          <button type="button" class="global-search-item" data-search-result data-view="clientes" data-client-id="${U.escapeHtml(client.id)}">
            <strong>${U.escapeHtml(client.nombre)}</strong>
            <span>${U.escapeHtml(client.telefono || client.instagram || "")}</span>
          </button>
        `).join("")}
      </div>
    ` : "";

    const ordersHtml = orderMatches.length ? `
      <div class="global-search-group">
        <p class="global-search-group-title">Pedidos</p>
        ${orderMatches.map((order) => `
          <button type="button" class="global-search-item" data-search-result data-view="pedidos" data-order-id="${U.escapeHtml(order.id)}">
            <strong>${U.escapeHtml(order.clientaNombre)} · ${U.escapeHtml(order.tipoVestido)}</strong>
            <span>${U.formatDate(order.fechaEvento)} · ${U.getStatusMeta(order.estado).label}</span>
          </button>
        `).join("")}
      </div>
    ` : "";

    panel.innerHTML = clientsHtml + ordersHtml;
    panel.classList.add("is-open");
  }

  function goToSearchResult(view, clientId, orderId) {
    closeGlobalSearchResults();
    navigate(view);

    if (view === "clientes" && clientId) {
      const client = state.clientById.get(clientId);
      if (client) {
        const input = UI.qs("#clientSearch");
        if (input) input.value = client.nombre;
        state.filters.clientSearch = client.nombre;
        window.ClientesModule?.render();
      }
    }

    if (view === "pedidos" && orderId) {
      const order = state.orderById.get(orderId);
      if (order) {
        const input = UI.qs("#orderSearch");
        if (input) input.value = order.clientaNombre;
        state.filters.orderSearch = order.clientaNombre;
        window.PedidosModule?.render();
      }
    }
  }

  function setData(data) {
    state.clientes = data.clientes || [];
    state.pedidos = data.pedidos || [];
    state.pagos = data.pagos || [];
    state.citas = data.citas || [];
    state.cotizaciones = data.cotizaciones || [];
    state.catalogoCostos = data.catalogoCostos || [];
    state.clientById = new Map(state.clientes.map((client) => [client.id, client]));
    state.paymentsByOrder = state.pagos.reduce((map, payment) => {
      if (!map.has(payment.pedidoId)) map.set(payment.pedidoId, []);
      map.get(payment.pedidoId).push(payment);
      return map;
    }, new Map());
    state.enrichedPedidos = state.pedidos.map(enrichOrderFast);
    state.orderById = new Map(state.enrichedPedidos.map((order) => [order.id, order]));
    state.ordersByClient = state.enrichedPedidos.reduce((map, order) => {
      if (!map.has(order.clienteId)) map.set(order.clienteId, []);
      map.get(order.clienteId).push(order);
      return map;
    }, new Map());
  }

  function enrichOrderFast(order) {
    const payments = state.paymentsByOrder.get(order.id) || [];
    const pagado = U.sum(payments.map((payment) => payment.monto));
    const valorTotal = U.toNumber(order.valorTotal);
    const primer = payments.find((payment) => String(payment.esPrimerAbono).toUpperCase() === "SI");
    const cliente = state.clientById.get(order.clienteId);
    const saldo = Math.max(valorTotal - pagado, 0);

    return {
      ...order,
      valorTotal,
      primerAbono: primer ? U.toNumber(primer.monto) : U.toNumber(order.primerAbono),
      pagoTotal: pagado,
      saldoPendiente: saldo,
      mesEvento: order.mesEvento || U.getMonthKey(order.fechaEvento),
      estadoPago: saldo <= 0 ? "pagado" : "pendiente",
      clientaNombre: cliente ? cliente.nombre : "Clienta sin asignar",
      clientaTelefono: cliente ? cliente.telefono : "",
      clientaInstagram: cliente ? cliente.instagram : ""
    };
  }

  async function silentRefresh() {
    if (!API.hasRemoteUrl()) return;

    try {
      const data = await API.loadAll(true);
      setData(data);
      renderAll();
    } catch (error) {
      console.warn("Sincronización silenciosa no completada.", error);
    }
  }

  async function refresh(forceRemote = false, options = {}) {
    const blocking = options.blocking !== false;
    if (blocking) {
      UI.showLoader("Sincronizando datos...");
      setSyncing(true, "Sincronizando...");
    }
    try {
      const data = await API.loadAll(forceRemote);
      setData(data);
      renderAll();
      if (options.successToast) {
        UI.toast("Datos sincronizados", API.hasRemoteUrl() ? "Se consultó Google Sheets." : "Se actualizó la vista local.", "success");
      }
    } catch (error) {
      setData(API.getState());
      renderAll();
      if (options.showErrorToast || blocking) {
        UI.toast("No se pudo sincronizar", error.message || "Se muestran los datos disponibles.", "error");
      } else {
        console.warn("Sincronización no visible falló.", error);
      }
    } finally {
      if (blocking) UI.hideLoader();
      if (blocking) setSyncing(false);
    }
  }

  async function afterMutation(message) {
    setData(API.getState());
    renderAll();
    UI.toast(message, "Los cambios quedaron guardados y recalculados.", "success");
  }

  function navigate(view) {
    state.currentView = view;
    UI.setActiveView(view);
    renderAll();
  }

  function renderAll() {
    if (state.currentView === "dashboard") renderDashboard();
    if (state.currentView === "clientes") window.ClientesModule?.render();
    if (state.currentView === "pedidos") window.PedidosModule?.render();
    if (state.currentView === "pagos") window.PagosModule?.render();
    if (state.currentView === "agenda") window.AgendaModule?.render();
    if (state.currentView === "cotizaciones") window.CotizacionesModule?.render();
    updateSidebarMonth();
  }

  function setSyncing(isSyncing, message = "Sincronizar") {
    state.isSyncing = isSyncing;
    const button = UI.qs("#syncBtn");
    if (!button) return;
    button.disabled = isSyncing;
    button.innerHTML = isSyncing
      ? `<span class="button-spinner"></span>${U.escapeHtml(message)}`
      : "Sincronizar";
  }

  function renderDashboard() {
    const orders = state.enrichedPedidos;
    const activeOrders = orders.filter((order) => !["entregado", "cancelado"].includes(order.estado));
    const totalPaid = U.sum(state.pagos.map((pago) => pago.monto));
    const totalPending = U.sum(orders.map((order) => order.saldoPendiente));
    const upcoming = orders.filter((order) => U.isWithinNextDays(order.fechaEvento, 30) && order.estado !== "cancelado");

    UI.qs("#metricActiveOrders").textContent = activeOrders.length;
    UI.qs("#metricRevenue").textContent = U.formatCurrency(totalPaid);
    UI.qs("#metricPending").textContent = U.formatCurrency(totalPending);
    UI.qs("#metricUpcoming").textContent = upcoming.length;

    renderDashboardEvents(upcoming);
    renderDashboardPayments(orders);
    renderStatusChart(orders);
    renderAlerts(orders);
  }

  function renderDashboardEvents(upcoming) {
    const container = UI.qs("#dashboardEvents");
    if (!container) return;
    const events = upcoming.slice().sort((a, b) => U.compareByDate(a, b, "fechaEvento")).slice(0, 6);
    if (!events.length) {
      container.innerHTML = UI.emptyState("Sin eventos próximos", "No hay eventos en los siguientes 30 días.");
      return;
    }

    container.innerHTML = events.map((order) => `
      <div class="mini-row">
        <div>
          <strong>${U.escapeHtml(order.clientaNombre)} · ${U.escapeHtml(order.tipoVestido)}</strong>
          <span>${U.formatDay(order.fechaEvento)} · entrega ${U.formatDate(order.fechaEntrega)}</span>
        </div>
        ${UI.badge(U.getStatusMeta(order.estado).label, U.getStatusMeta(order.estado).tone)}
      </div>
    `).join("");
  }

  function renderDashboardPayments(orders) {
    const container = UI.qs("#dashboardPayments");
    if (!container) return;
    const pending = orders
      .filter((order) => order.saldoPendiente > 0 && order.estado !== "cancelado")
      .sort((a, b) => U.compareByDate(a, b, "fechaLimitePago"))
      .slice(0, 6);

    if (!pending.length) {
      container.innerHTML = UI.emptyState("Cobranza al día", "No hay saldos pendientes en este momento.");
      return;
    }

    container.innerHTML = pending.map((order) => `
      <div class="payment-row">
        <strong>${U.escapeHtml(order.clientaNombre)} · ${U.formatCurrency(order.saldoPendiente)}</strong>
        <span>${U.escapeHtml(order.tipoVestido)} · vence ${U.formatDate(order.fechaLimitePago)}</span>
      </div>
    `).join("");
  }

  function renderStatusChart(orders) {
    const container = UI.qs("#statusChart");
    if (!container) return;
    const active = orders.filter((order) => order.estado !== "cancelado");
    if (!active.length) {
      container.innerHTML = UI.emptyState("Sin producción", "Los estados aparecerán cuando existan pedidos.");
      return;
    }

    const max = Math.max(...U.ORDER_STATUSES.map((status) => active.filter((order) => order.estado === status.value).length), 1);
    container.innerHTML = U.ORDER_STATUSES
      .filter((status) => status.value !== "cancelado")
      .map((status) => {
        const count = active.filter((order) => order.estado === status.value).length;
        const width = `${Math.max((count / max) * 100, count ? 8 : 0)}%`;
        return `
          <div class="status-line">
            <span>${U.escapeHtml(status.label)}</span>
            <div class="status-bar"><i style="--bar-width:${width}"></i></div>
            <strong>${count}</strong>
          </div>
        `;
      }).join("");
  }

  function renderAlerts(orders) {
    const container = UI.qs("#alertsList");
    if (!container) return;
    const alerts = [];

    orders.forEach((order) => {
      if (order.saldoPendiente > 0 && U.isPast(order.fechaLimitePago)) {
        alerts.push({
          title: `${order.clientaNombre} tiene pago vencido`,
          text: `${U.formatCurrency(order.saldoPendiente)} pendiente desde ${U.formatDate(order.fechaLimitePago)}`
        });
      }
      if (U.isWithinNextDays(order.fechaEntrega, 7) && !["entregado", "cancelado"].includes(order.estado)) {
        alerts.push({
          title: `Entrega cercana para ${order.clientaNombre}`,
          text: `${order.tipoVestido} debe entregarse el ${U.formatDate(order.fechaEntrega)}`
        });
      }
      if (U.isWithinNextDays(order.fechaEvento, 7) && order.estadoPago !== "pagado") {
        alerts.push({
          title: `Evento cercano con saldo pendiente`,
          text: `${order.clientaNombre} tiene evento el ${U.formatDate(order.fechaEvento)}`
        });
      }
    });

    if (!alerts.length) {
      container.innerHTML = UI.emptyState("Todo bajo control", "No hay alertas críticas para hoy.");
      return;
    }

    container.innerHTML = alerts.slice(0, 7).map((alert) => `
      <div class="alert-item">
        <strong>${U.escapeHtml(alert.title)}</strong>
        <span>${U.escapeHtml(alert.text)}</span>
      </div>
    `).join("");
  }

  function updateSidebarMonth() {
    const currentKey = U.getMonthKey(U.todayISO());
    const currentOrders = state.enrichedPedidos.filter((order) => order.mesEvento === currentKey && order.estado !== "cancelado");
    const month = UI.qs("#sidebarMonth");
    const count = UI.qs("#sidebarMonthCount");
    if (month) month.textContent = U.getMonthNameFromKey(currentKey);
    if (count) count.textContent = `${currentOrders.length} evento${currentOrders.length === 1 ? "" : "s"} activo${currentOrders.length === 1 ? "" : "s"}`;
  }

  document.addEventListener("DOMContentLoaded", init);

  return {
    state,
    navigate,
    refresh,
    silentRefresh,
    afterMutation,
    renderAll,
    setData
  };
})();
