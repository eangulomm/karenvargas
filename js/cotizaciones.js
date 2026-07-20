window.CotizacionesModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const API = window.AtelierAPI;
  const STATUSES = {
    borrador: { label: "Borrador", tone: "neutral" },
    enviada: { label: "Enviada", tone: "info" },
    aceptada: { label: "Aceptada", tone: "success" },
    rechazada: { label: "Rechazada", tone: "danger" },
    vencida: { label: "Vencida", tone: "warning" },
    convertida: { label: "Convertida", tone: "success" }
  };
  const CATEGORIES = ["Materiales", "Insumos", "Mano de obra", "Servicios externos", "Otros"];
  const UNITS = ["unidad", "metro", "hora", "servicio", "paquete"];
  let search = "";
  let statusFilter = "";

  function init() {
    UI.qs("#newQuoteBtn")?.addEventListener("click", () => openEditor());
    UI.qs("#costCatalogBtn")?.addEventListener("click", () => openCatalog());
    UI.qs("#quoteSearch")?.addEventListener("input", U.debounce((event) => { search = event.target.value; render(); }));
    UI.qs("#quoteStatusFilter")?.addEventListener("change", (event) => { statusFilter = event.target.value; render(); });
    UI.qs("#quotesTable")?.addEventListener("click", handleTableAction);
  }

  function render() {
    const quotes = window.AtelierApp.state.cotizaciones || [];
    UI.qs("#quotesDraftCount").textContent = quotes.filter((quote) => quote.estado === "borrador").length;
    UI.qs("#quotesSentCount").textContent = quotes.filter((quote) => quote.estado === "enviada").length;
    UI.qs("#quotesAcceptedCount").textContent = quotes.filter((quote) => ["aceptada", "convertida"].includes(quote.estado)).length;
    UI.qs("#quotesTotalValue").textContent = U.formatCurrency(U.sum(quotes.filter((quote) => quote.estado !== "rechazada").map((quote) => quote.precioFinal)));

    const filtered = quotes
      .filter((quote) => !statusFilter || quote.estado === statusFilter)
      .filter((quote) => {
        const client = window.AtelierApp.state.clientById.get(quote.clienteId);
        return U.matchesSearch([quote.numero, quote.descripcion, client?.nombre, client?.telefono], search);
      })
      .sort((a, b) => String(b.fechaActualizacion || b.fechaCreacion).localeCompare(String(a.fechaActualizacion || a.fechaCreacion)));
    const container = UI.qs("#quotesTable");
    if (!filtered.length) {
      container.innerHTML = UI.emptyState("Sin cotizaciones", "Crea la primera cotización basada en costos.");
      return;
    }
    container.innerHTML = `<div class="table-row quote-row header"><div>Número / clienta</div><div>Costos</div><div>Precio final</div><div>Estado</div><div>Acciones</div></div>${filtered.map(renderRow).join("")}`;
  }

  function renderRow(quote) {
    const client = window.AtelierApp.state.clientById.get(quote.clienteId);
    const status = STATUSES[quote.estado] || STATUSES.borrador;
    const margin = quote.precioFinal > 0 ? Math.round((quote.valorGanancia / quote.precioFinal) * 100) : 0;
    return `<div class="table-row quote-row">
      <div data-label="Cotización"><strong>${U.escapeHtml(quote.numero || "Cotización")}</strong><span>${U.escapeHtml(client?.nombre || "Clienta")} · ${U.escapeHtml(quote.descripcion)}</span></div>
      <div data-label="Costos"><strong>${U.formatCurrency(quote.costoTotal)}</strong><span>${quote.costos?.length || 0} conceptos</span></div>
      <div data-label="Precio"><strong>${U.formatCurrency(quote.precioFinal)}</strong><span>Ganancia ${U.formatCurrency(quote.valorGanancia)} · margen ${margin}%</span></div>
      <div data-label="Estado">${UI.badge(status.label, status.tone)}</div>
      <div class="row-actions" data-label="Acciones">
        <button class="small-button" data-quote-action="pdf" data-id="${U.escapeHtml(quote.id)}" type="button">PDF</button>
        <button class="small-button" data-quote-action="edit" data-id="${U.escapeHtml(quote.id)}" type="button">Editar</button>
        ${quote.estado === "borrador" ? `<button class="small-button" data-quote-action="sent" data-id="${U.escapeHtml(quote.id)}" type="button">Marcar enviada</button>` : ""}
        ${["enviada", "borrador"].includes(quote.estado) ? `<button class="small-button" data-quote-action="accept" data-id="${U.escapeHtml(quote.id)}" type="button">Aceptar</button>` : ""}
        ${quote.estado === "aceptada" && !quote.pedidoId ? `<button class="small-button" data-quote-action="convert" data-id="${U.escapeHtml(quote.id)}" type="button">Crear pedido</button>` : ""}
        <button class="small-button" data-quote-action="delete" data-id="${U.escapeHtml(quote.id)}" type="button">Eliminar</button>
      </div>
    </div>`;
  }

  async function handleTableAction(event) {
    const button = event.target.closest("[data-quote-action]");
    if (!button) return;
    const quote = window.AtelierApp.state.cotizaciones.find((item) => item.id === button.dataset.id);
    if (!quote) return;
    const action = button.dataset.quoteAction;
    if (action === "edit") openEditor(quote);
    if (action === "pdf") openPrintableQuote(quote);
    if (action === "sent") await changeStatus(quote, "enviada", "Cotización marcada como enviada");
    if (action === "accept") await changeStatus(quote, "aceptada", "Cotización aceptada");
    if (action === "convert") openConvertModal(quote);
    if (action === "delete") confirmDelete(quote);
  }

  async function changeStatus(quote, estado, message) {
    await API.updateCotizacion(quote.id, { estado });
    await window.AtelierApp.afterMutation(message);
  }

  function openQuoteModal(order) {
    openEditor(null, {
      clienteId: order.clienteId,
      pedidoId: order.id,
      descripcion: order.descripcion || order.tipoVestido,
      precioFinal: order.valorTotal,
      porcentajeAbono: order.valorTotal ? Math.round((order.primerAbono || order.valorTotal * 0.5) / order.valorTotal * 100) : 50,
      fechaEntrega: order.fechaEntrega
    });
  }

  function openEditor(quote = null, defaults = {}) {
    const clients = window.AtelierApp.state.clientes.slice().sort((a, b) => U.normalize(a.nombre).localeCompare(U.normalize(b.nombre)));
    if (!clients.length) return UI.toast("Primero registra una clienta", "La cotización debe quedar asociada a una persona.", "warning");
    const data = { porcentajeGanancia: 60, metodoGanancia: "sobre_costo", porcentajeAbono: 50, vigenciaDias: 15, estado: "borrador", ...defaults, ...(quote || {}) };
    const initialCosts = data.costos?.length ? data.costos : [{ categoria: "Materiales", nombre: "", unidad: "metro", cantidad: 1, costoUnitario: 0 }];
    UI.openModal({
      title: quote ? `Editar ${quote.numero}` : "Nueva cotización con costos",
      submitText: quote ? "Guardar cambios" : "Guardar cotización",
      body: `<div class="quote-editor">
        <div class="form-grid">
          <div class="form-field"><label>Clienta</label><select class="field-input" name="clienteId" required><option value="">Selecciona</option>${clients.map((client) => `<option value="${U.escapeHtml(client.id)}" ${client.id === data.clienteId ? "selected" : ""}>${U.escapeHtml(client.nombre)}</option>`).join("")}</select></div>
          <div class="form-field"><label>Estado</label><select class="field-input" name="estado">${Object.entries(STATUSES).filter(([value]) => value !== "convertida").map(([value, meta]) => `<option value="${value}" ${value === data.estado ? "selected" : ""}>${meta.label}</option>`).join("")}</select></div>
          <div class="form-field full"><label>Vestido o servicio</label><textarea class="field-textarea" name="descripcion" required placeholder="Describe el diseño, evento y alcance de la propuesta...">${U.escapeHtml(data.descripcion || "")}</textarea></div>
        </div>
        <section class="cost-sheet">
          <div class="cost-sheet-header"><div><strong>Hoja interna de costos</strong><span>Esta información no aparece en el PDF de la clienta.</span></div><div class="row-actions"><select id="catalogPicker" class="field-input"><option value="">Agregar desde catálogo</option>${window.AtelierApp.state.catalogoCostos.filter((item) => item.activo !== "NO").map((item) => `<option value="${U.escapeHtml(item.id)}">${U.escapeHtml(item.nombre)} · ${U.formatCurrency(item.costoUnitario)}</option>`).join("")}</select><button id="addCostRow" class="small-button" type="button">+ Costo manual</button></div></div>
          <div class="cost-grid cost-grid-header"><span>Categoría</span><span>Concepto</span><span>Cant.</span><span>Unidad</span><span>Valor unitario</span><span>Subtotal</span><span></span></div>
          <div id="costRows">${initialCosts.map(costRowHtml).join("")}</div>
        </section>
        <div class="quote-calculation">
          <div class="form-field"><label>Cálculo de ganancia</label><select class="field-input" name="metodoGanancia"><option value="sobre_costo" ${data.metodoGanancia !== "margen" ? "selected" : ""}>Porcentaje sobre el costo</option><option value="margen" ${data.metodoGanancia === "margen" ? "selected" : ""}>Margen sobre la venta</option></select></div>
          <div class="form-field"><label>Porcentaje de ganancia</label><input class="field-input" name="porcentajeGanancia" type="number" min="0" step="1" value="${U.escapeHtml(data.porcentajeGanancia)}"></div>
          <div class="form-field"><label>Ajuste o redondeo</label><input class="field-input money-input" name="ajuste" inputmode="numeric" value="${U.escapeHtml(U.formatMoneyInput(data.ajuste || 0))}"></div>
          <div class="form-field"><label>Precio final decidido</label><input class="field-input money-input" name="precioFinal" inputmode="numeric" value="${U.escapeHtml(U.formatMoneyInput(data.precioFinal || 0))}"></div>
          <div class="form-field"><label>Abono requerido (%)</label><input class="field-input" name="porcentajeAbono" type="number" min="0" max="100" value="${U.escapeHtml(data.porcentajeAbono)}"></div>
          <div class="form-field"><label>Vigencia (días)</label><input class="field-input" name="vigenciaDias" type="number" min="1" value="${U.escapeHtml(data.vigenciaDias)}"></div>
          <div class="form-field"><label>Entrega estimada</label><input class="field-input" name="fechaEntrega" type="date" value="${U.escapeHtml(data.fechaEntrega || "")}"></div>
          <div class="form-field full"><label>Condiciones</label><textarea class="field-textarea" name="condiciones">${U.escapeHtml(data.condiciones || "El pedido inicia con el abono acordado. El saldo debe estar pagado antes de la entrega. Los cambios adicionales se cotizan por separado.")}</textarea></div>
          <div class="quote-totals full"><div><span>Costo total</span><strong id="calcCostTotal">$0</strong></div><div><span>Precio sugerido</span><strong id="calcSuggested">$0</strong></div><div><span>Ganancia</span><strong id="calcProfit">$0</strong></div><div><span>Abono</span><strong id="calcDeposit">$0</strong></div></div>
        </div>
      </div>`,
      onSubmit: async (form) => {
        const payload = readQuoteForm(form, data);
        if (!payload.clienteId) throw new Error("Selecciona una clienta.");
        if (!payload.descripcion?.trim()) throw new Error("Describe el vestido o servicio.");
        if (!payload.costos.length) throw new Error("Agrega al menos un costo con cantidad y valor.");
        if (payload.metodoGanancia === "margen" && payload.porcentajeGanancia >= 100) throw new Error("El margen debe ser menor al 100%.");
        if (quote) await API.updateCotizacion(quote.id, payload); else await API.createCotizacion(payload);
        await window.AtelierApp.afterMutation(quote ? "Cotización actualizada" : "Cotización creada");
      }
    });
    bindEditor(data);
  }

  function costRowHtml(item = {}) {
    return `<div class="cost-grid cost-row">
      <select class="field-input cost-category">${CATEGORIES.map((value) => `<option value="${value}" ${value === item.categoria ? "selected" : ""}>${value}</option>`).join("")}</select>
      <input class="field-input cost-name" value="${U.escapeHtml(item.nombre || "")}" placeholder="Tela, cierre, confección...">
      <input class="field-input cost-quantity" type="number" min="0" step="0.01" value="${U.escapeHtml(item.cantidad || 1)}">
      <select class="field-input cost-unit">${UNITS.map((value) => `<option value="${value}" ${value === item.unidad ? "selected" : ""}>${value}</option>`).join("")}</select>
      <input class="field-input money-input cost-unit-price" inputmode="numeric" value="${U.escapeHtml(U.formatMoneyInput(item.costoUnitario || 0))}">
      <strong class="cost-subtotal">${U.formatCurrency((item.cantidad || 0) * (item.costoUnitario || 0))}</strong>
      <button class="icon-button remove-cost" type="button" aria-label="Quitar costo">×</button>
    </div>`;
  }

  function bindEditor(initialData) {
    const root = UI.qs("#modalRoot");
    const rows = UI.qs("#costRows", root);
    UI.qs("#addCostRow", root)?.addEventListener("click", () => { rows.insertAdjacentHTML("beforeend", costRowHtml()); updateCalculation(); });
    UI.qs("#catalogPicker", root)?.addEventListener("change", (event) => {
      const item = window.AtelierApp.state.catalogoCostos.find((entry) => entry.id === event.target.value);
      if (item) rows.insertAdjacentHTML("beforeend", costRowHtml({ ...item, cantidad: 1 }));
      event.target.value = "";
      updateCalculation();
    });
    rows.addEventListener("click", (event) => { if (event.target.closest(".remove-cost")) { event.target.closest(".cost-row").remove(); updateCalculation(); } });
    root.addEventListener("input", (event) => {
      if (event.target.name === "precioFinal") event.target.dataset.manual = "true";
      if (event.target.closest(".quote-editor")) updateCalculation();
    });
    root.addEventListener("change", (event) => { if (event.target.closest(".quote-editor")) updateCalculation(); });
    function updateCalculation() {
      const form = UI.qs("form", root);
      if (!form) return;
      const draft = API.calculateQuote(readQuoteForm(form, initialData));
      UI.qsa(".cost-row", root).forEach((row) => {
        const quantity = U.toNumber(row.querySelector(".cost-quantity")?.value);
        const unitPrice = U.parseMoneyInput(row.querySelector(".cost-unit-price")?.value);
        const subtotal = row.querySelector(".cost-subtotal");
        if (subtotal) subtotal.textContent = U.formatCurrency(quantity * unitPrice);
      });
      UI.qs("#calcCostTotal", root).textContent = U.formatCurrency(draft.costoTotal);
      UI.qs("#calcSuggested", root).textContent = U.formatCurrency(draft.precioSugerido);
      UI.qs("#calcProfit", root).textContent = U.formatCurrency(draft.valorGanancia);
      UI.qs("#calcDeposit", root).textContent = U.formatCurrency(draft.abonoRequerido);
      const finalInput = UI.qs('[name="precioFinal"]', root);
      if (finalInput && finalInput.dataset.manual !== "true") finalInput.value = U.formatMoneyInput(Math.max(draft.precioSugerido + draft.ajuste, 0));
    }
    const initialFinalInput = UI.qs('[name="precioFinal"]', root);
    if (initialFinalInput && U.toNumber(initialData.precioFinal) > 0) initialFinalInput.dataset.manual = "true";
    updateCalculation();
  }

  function readQuoteForm(form, base = {}) {
    const fields = UI.getFormData(form);
    const costos = UI.qsa(".cost-row", form).map((row) => ({
      categoria: row.querySelector(".cost-category").value,
      nombre: row.querySelector(".cost-name").value.trim(),
      cantidad: U.toNumber(row.querySelector(".cost-quantity").value),
      unidad: row.querySelector(".cost-unit").value,
      costoUnitario: U.parseMoneyInput(row.querySelector(".cost-unit-price").value)
    })).filter((item) => item.nombre && item.cantidad > 0);
    return { ...base, ...fields, costos, porcentajeGanancia: U.toNumber(fields.porcentajeGanancia), ajuste: U.parseMoneyInput(fields.ajuste), precioFinal: U.parseMoneyInput(fields.precioFinal), porcentajeAbono: U.toNumber(fields.porcentajeAbono), vigenciaDias: U.toNumber(fields.vigenciaDias) };
  }

  function openCatalog(editItem = null) {
    const items = window.AtelierApp.state.catalogoCostos;
    UI.openModal({
      title: editItem ? "Editar costo frecuente" : "Catálogo de costos frecuentes",
      submitText: editItem ? "Actualizar costo" : "Guardar costo",
      body: `<p class="form-hint">Los precios nuevos se usarán como referencia y no modificarán cotizaciones anteriores.</p><div class="form-grid">${catalogField("Categoría", "categoria", "select", editItem?.categoria)}${catalogField("Nombre", "nombre", "text", editItem?.nombre)}${catalogField("Unidad", "unidad", "unit", editItem?.unidad)}${catalogField("Costo unitario", "costoUnitario", "money", editItem?.costoUnitario)}</div><div class="catalog-list">${items.length ? items.map((item) => `<div class="mini-row"><div><strong>${U.escapeHtml(item.nombre)}</strong><span>${U.escapeHtml(item.categoria)} · por ${U.escapeHtml(item.unidad)}</span></div><div class="row-actions"><strong>${U.formatCurrency(item.costoUnitario)}</strong><button class="small-button" data-catalog-action="edit" data-id="${U.escapeHtml(item.id)}" type="button">Editar</button><button class="small-button" data-catalog-action="delete" data-id="${U.escapeHtml(item.id)}" type="button">Eliminar</button></div></div>`).join("") : UI.emptyState("Catálogo vacío", "Guarda telas, insumos y mano de obra que usas con frecuencia.")}</div>`,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        payload.costoUnitario = U.parseMoneyInput(payload.costoUnitario);
        if (!payload.nombre?.trim()) throw new Error("Escribe el nombre del costo.");
        if (editItem) await API.updateCatalogoCosto(editItem.id, payload); else await API.createCatalogoCosto(payload);
        await window.AtelierApp.afterMutation(editItem ? "Costo actualizado" : "Costo agregado al catálogo");
      }
    });
    UI.qs(".catalog-list")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-catalog-action]");
      if (!button) return;
      const item = items.find((entry) => entry.id === button.dataset.id);
      if (!item) return;
      if (button.dataset.catalogAction === "edit") openCatalog(item);
      if (button.dataset.catalogAction === "delete") UI.openConfirm({ title: "Eliminar costo frecuente", message: `Se eliminará ${item.nombre} del catálogo. Las cotizaciones anteriores no cambian.`, confirmText: "Eliminar", onConfirm: async () => { await API.deleteCatalogoCosto(item.id); await window.AtelierApp.afterMutation("Costo eliminado del catálogo"); } });
    });
  }

  function catalogField(label, name, type = "text", value = "") {
    if (type === "select") return `<div class="form-field"><label>${label}</label><select class="field-input" name="${name}">${CATEGORIES.map((entry) => `<option ${entry === value ? "selected" : ""}>${entry}</option>`).join("")}</select></div>`;
    if (type === "unit") return `<div class="form-field"><label>${label}</label><select class="field-input" name="${name}">${UNITS.map((entry) => `<option ${entry === value ? "selected" : ""}>${entry}</option>`).join("")}</select></div>`;
    return `<div class="form-field"><label>${label}</label><input class="field-input ${type === "money" ? "money-input" : ""}" name="${name}" value="${U.escapeHtml(type === "money" ? U.formatMoneyInput(value || 0) : value || "")}" ${type === "money" ? 'inputmode="numeric"' : ""}></div>`;
  }

  function openConvertModal(quote) {
    UI.openModal({
      title: "Convertir cotización en pedido",
      submitText: "Crear pedido",
      body: `<div class="form-grid"><div class="form-field full"><label>Tipo de vestido</label><input class="field-input" name="tipoVestido" value="${U.escapeHtml(quote.descripcion)}" required></div><div class="form-field"><label>Fecha del evento</label><input class="field-input" name="fechaEvento" type="date" required></div><div class="form-field"><label>Fecha de entrega</label><input class="field-input" name="fechaEntrega" type="date"></div><div class="form-field"><label>Fecha límite de pago</label><input class="field-input" name="fechaLimitePago" type="date"></div><div class="form-field"><label>Abono recibido ahora</label><input class="field-input money-input" name="primerAbono" inputmode="numeric" value="0"></div><div class="quote-conversion-summary full"><span>Precio aprobado</span><strong>${U.formatCurrency(quote.precioFinal)}</strong><span>Abono acordado en cotización: ${U.formatCurrency(quote.abonoRequerido)}</span></div></div>`,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        payload.primerAbono = U.parseMoneyInput(payload.primerAbono);
        if (!payload.fechaEvento) throw new Error("La fecha del evento es obligatoria.");
        const orderId = U.createId("ped");
        await API.createPedido({ ...payload, id: orderId, clienteId: quote.clienteId, descripcion: quote.descripcion, valorTotal: quote.precioFinal, estado: "pendiente", notasInternas: `Creado desde ${quote.numero}` });
        await API.updateCotizacion(quote.id, { estado: "convertida", pedidoId: orderId });
        await window.AtelierApp.afterMutation("Cotización convertida en pedido");
      }
    });
  }

  function openPrintableQuote(quote) {
    const client = window.AtelierApp.state.clientById.get(quote.clienteId);
    if (!client) return UI.toast("Clienta no encontrada", "Revisa la cotización.", "error");
    const subject = `Cotización ${quote.numero} - Atelier Studio`;
    const message = `Hola ${client.nombres || client.nombre}, te compartimos la cotización ${quote.numero} por ${U.formatCurrency(quote.precioFinal)}. Abono requerido: ${U.formatCurrency(quote.abonoRequerido)}.`;
    const phone = String(client.telefono || "").replace(/\D/g, "");
    const printable = window.open("", "_blank");
    if (!printable) throw new Error("El navegador bloqueó la ventana. Habilita las ventanas emergentes.");
    printable.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${U.escapeHtml(subject)}</title><style>body{font-family:Arial,sans-serif;color:#282421;max-width:820px;margin:36px auto;padding:0 24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #9b5d64;padding-bottom:18px}h1{margin:0;color:#9b5d64}section{margin:26px 0}.amount{font-size:32px;font-weight:700}.box{background:#f7f1ed;padding:18px;border-radius:12px}.actions{display:flex;gap:10px;margin-top:30px}.actions a,.actions button{padding:10px 14px;border:0;border-radius:8px;background:#9b5d64;color:white;text-decoration:none}@media print{.actions{display:none}}</style></head><body><header><div><h1>Atelier Studio</h1><p>Vestidos personalizados</p></div><div><strong>${U.escapeHtml(quote.numero)}</strong><p>${U.formatDate(quote.fechaCreacion)}</p></div></header><section><h2>Cotización para ${U.escapeHtml(client.nombre)}</h2><p>${U.escapeHtml(client.correo || "")} · ${U.escapeHtml(client.telefono || "")}</p></section><section><h3>Propuesta</h3><p>${U.escapeHtml(quote.descripcion)}</p></section><section class="box"><p>Valor total</p><div class="amount">${U.formatCurrency(quote.precioFinal)}</div><p>Abono requerido: <strong>${U.formatCurrency(quote.abonoRequerido)}</strong></p>${quote.fechaEntrega ? `<p>Entrega estimada: <strong>${U.formatDate(quote.fechaEntrega)}</strong></p>` : ""}<p>Vigencia: ${U.escapeHtml(quote.vigenciaDias || 15)} días</p></section><section><h3>Condiciones</h3><p>${U.escapeHtml(quote.condiciones || "")}</p></section><div class="actions"><button onclick="window.print()">Guardar como PDF</button><a href="mailto:${encodeURIComponent(client.correo || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}">Enviar por correo</a>${phone ? `<a href="https://wa.me/${phone}?text=${encodeURIComponent(message)}" target="_blank">Enviar por WhatsApp</a>` : ""}</div></body></html>`);
    printable.document.close();
  }

  function confirmDelete(quote) {
    UI.openConfirm({ title: "Eliminar cotización", message: `Se eliminará ${quote.numero} y su hoja interna de costos.`, confirmText: "Eliminar", onConfirm: async () => { await API.deleteCotizacion(quote.id); await window.AtelierApp.afterMutation("Cotización eliminada"); } });
  }

  return { init, render, openQuoteModal, openEditor, openPrintableQuote };
})();
