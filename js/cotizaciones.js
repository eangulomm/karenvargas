window.CotizacionesModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;

  function openQuoteModal(order) {
    const client = window.AtelierApp.state.clientById.get(order.clienteId);
    if (!client) return UI.toast("Clienta no encontrada", "Revisa el pedido antes de cotizar.", "error");
    UI.openModal({
      title: "Preparar cotización",
      submitText: "Abrir PDF",
      body: `<div class="form-grid">
        <div class="form-field"><label>Clienta</label><input class="field-input" value="${U.escapeHtml(client.nombre)}" disabled></div>
        <div class="form-field"><label>Correo</label><input class="field-input" value="${U.escapeHtml(client.correo || "Sin correo")}" disabled></div>
        <div class="form-field full"><label>Descripción</label><textarea class="field-textarea" name="descripcion" required>${U.escapeHtml(order.descripcion || order.tipoVestido || "Vestido personalizado")}</textarea></div>
        <div class="form-field"><label>Valor total</label><input class="field-input money-input" name="valorTotal" value="${U.escapeHtml(U.formatMoneyInput(order.valorTotal))}" required></div>
        <div class="form-field"><label>Abono requerido</label><input class="field-input money-input" name="abono" value="${U.escapeHtml(U.formatMoneyInput(order.primerAbono || order.valorTotal * 0.5))}"></div>
        <div class="form-field"><label>Vigencia</label><input class="field-input" name="vigencia" type="number" min="1" value="15"></div>
        <div class="form-field"><label>Fecha estimada de entrega</label><input class="field-input" name="fechaEntrega" type="date" value="${U.escapeHtml(order.fechaEntrega || "")}"></div>
        <div class="form-field full"><label>Condiciones</label><textarea class="field-textarea" name="condiciones">El pedido inicia con el abono acordado. Los ajustes adicionales no incluidos en esta propuesta se cotizan por separado. El saldo debe estar pagado antes de la entrega.</textarea></div>
      </div>`,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        payload.valorTotal = U.parseMoneyInput(payload.valorTotal);
        payload.abono = U.parseMoneyInput(payload.abono);
        if (payload.valorTotal <= 0) throw new Error("El valor debe ser mayor a cero.");
        openPrintableQuote({ order, client, ...payload });
      }
    });
  }

  function openPrintableQuote(data) {
    const quoteNumber = `COT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${String(data.order.id).slice(-4).toUpperCase()}`;
    const subject = `Cotización ${quoteNumber} - Atelier Studio`;
    const message = `Hola ${data.client.nombres || data.client.nombre}, te compartimos la cotización ${quoteNumber} por ${U.formatCurrency(data.valorTotal)}. Abono requerido: ${U.formatCurrency(data.abono)}.`;
    const phone = String(data.client.telefono || "").replace(/\D/g, "");
    const emailHref = `mailto:${encodeURIComponent(data.client.correo || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    const whatsappHref = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : "#";
    const win = window.open("", "_blank");
    if (!win) throw new Error("El navegador bloqueó la ventana del PDF. Habilita las ventanas emergentes.");
    win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${U.escapeHtml(subject)}</title><style>
      body{font-family:Arial,sans-serif;color:#2f2926;margin:0;padding:42px;background:#fff} .page{max-width:800px;margin:auto} header{display:flex;justify-content:space-between;border-bottom:3px solid #5a2431;padding-bottom:20px} h1{color:#5a2431;margin:0} .meta{text-align:right;color:#746b64} section{margin:28px 0} table{width:100%;border-collapse:collapse} td,th{padding:13px;border-bottom:1px solid #e8ded4;text-align:left} .total{font-size:22px;font-weight:bold;color:#5a2431}.actions{display:flex;gap:10px;margin-top:30px}.actions a,.actions button{padding:11px 15px;border:0;border-radius:7px;background:#5a2431;color:white;text-decoration:none;font-weight:bold;cursor:pointer}.muted{color:#746b64;font-size:13px}@media print{.actions{display:none}body{padding:0}}
    </style></head><body><main class="page"><header><div><h1>Atelier Studio</h1><p>Diseño y confección personalizada</p></div><div class="meta"><strong>${quoteNumber}</strong><br>${U.formatDate(U.todayISO())}</div></header>
      <section><h2>Cotización para ${U.escapeHtml(data.client.nombre)}</h2><p>${U.escapeHtml(data.client.correo || "")} · ${U.escapeHtml(data.client.telefono || "")}</p></section>
      <table><thead><tr><th>Descripción</th><th>Valor</th></tr></thead><tbody><tr><td>${U.escapeHtml(data.descripcion)}</td><td>${U.formatCurrency(data.valorTotal)}</td></tr><tr><td>Abono requerido</td><td>${U.formatCurrency(data.abono)}</td></tr><tr><td class="total">Total</td><td class="total">${U.formatCurrency(data.valorTotal)}</td></tr></tbody></table>
      <section><h3>Condiciones</h3><p>${U.escapeHtml(data.condiciones)}</p><p class="muted">Vigencia: ${U.escapeHtml(data.vigencia)} días${data.fechaEntrega ? ` · Entrega estimada: ${U.formatDate(data.fechaEntrega)}` : ""}.</p></section>
      <div class="actions"><button onclick="window.print()">Guardar como PDF</button><a href="${emailHref}">Enviar por correo</a><a href="${whatsappHref}" target="_blank">Enviar por WhatsApp</a></div>
    </main></body></html>`);
    win.document.close();
  }

  return { openQuoteModal };
})();
