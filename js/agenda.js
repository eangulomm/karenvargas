window.AgendaModule = (() => {
  const U = window.AtelierUtils;
  const UI = window.AtelierUI;
  const API = window.AtelierAPI;
  const STATUSES = [
    { value: "programada", label: "Programada" },
    { value: "confirmada", label: "Confirmada" },
    { value: "realizada", label: "Realizada" },
    { value: "cancelada", label: "Cancelada" }
  ];
  const TYPES = ["Cotización", "Primera cita", "Toma de medidas", "Primera prueba", "Segunda prueba", "Prueba final", "Entrega", "Otra"];

  function init() {
    UI.qs("#newAppointmentBtn")?.addEventListener("click", () => openAppointmentModal());
    UI.qs("#todayAgendaBtn")?.addEventListener("click", () => {
      const filters = window.AtelierApp.state.filters;
      filters.agendaTodayOnly = !filters.agendaTodayOnly;
      if (filters.agendaTodayOnly) filters.agendaWeekOnly = false;
      render();
    });
    ["#agendaMonthFilter", "#agendaStatusFilter"].forEach((selector) => {
      UI.qs(selector)?.addEventListener("change", (event) => {
        window.AtelierApp.state.filters[event.target.id] = event.target.value;
        render();
      });
    });
    UI.qs("#thisWeekBtn")?.addEventListener("click", () => {
      const filters = window.AtelierApp.state.filters;
      filters.agendaWeekOnly = !filters.agendaWeekOnly;
      if (filters.agendaWeekOnly) filters.agendaTodayOnly = false;
      render();
    });
    UI.qs("#agendaMonths")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-cita-action]");
      if (!button) return;
      const cita = window.AtelierApp.state.citas.find((item) => item.id === button.dataset.id);
      if (!cita) return;
      if (button.dataset.citaAction === "edit") openAppointmentModal(cita);
      if (button.dataset.citaAction === "delete") confirmDelete(cita);
    });
  }

  function render() {
    const filters = window.AtelierApp.state.filters;
    const citas = getFilteredAppointments();
    const months = [...new Set(window.AtelierApp.state.citas.map((cita) => U.getMonthKey(cita.fecha)).filter(Boolean))].sort();
    UI.renderSelectOptions(UI.qs("#agendaMonthFilter"), months.map((value) => ({ value, label: U.getMonthNameFromKey(value) })), filters.agendaMonthFilter || "", "Todos los meses");
    UI.renderSelectOptions(UI.qs("#agendaStatusFilter"), STATUSES, filters.agendaStatusFilter || "", "Todos los estados");
    const weekButton = UI.qs("#thisWeekBtn");
    if (weekButton) weekButton.textContent = filters.agendaWeekOnly ? "Ver todas" : "Esta semana";
    const todayButton = UI.qs("#todayAgendaBtn");
    if (todayButton) todayButton.textContent = filters.agendaTodayOnly ? "Ver todas" : "Hoy";
    const container = UI.qs("#agendaMonths");
    if (!container) return;
    if (!citas.length) {
      container.innerHTML = UI.emptyState("No hay citas en esta vista", "Crea una cita o cambia los filtros.");
      return;
    }
    const groups = U.groupBy(citas, (cita) => cita.fecha);
    container.innerHTML = Object.keys(groups).sort().map((date) => renderDay(date, groups[date])).join("");
  }

  function getFilteredAppointments() {
    const filters = window.AtelierApp.state.filters;
    return window.AtelierApp.state.citas
      .filter((cita) => !filters.agendaMonthFilter || U.getMonthKey(cita.fecha) === filters.agendaMonthFilter)
      .filter((cita) => !filters.agendaStatusFilter || cita.estado === filters.agendaStatusFilter)
      .filter((cita) => !filters.agendaTodayOnly || cita.fecha === U.todayISO())
      .filter((cita) => !filters.agendaWeekOnly || U.isThisWeek(cita.fecha))
      .sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
  }

  function renderDay(date, citas) {
    return `<section class="agenda-month">
      <div class="agenda-month-header"><div><h4>${U.formatDate(date)}</h4><p>${citas.length} cita${citas.length === 1 ? "" : "s"}</p></div></div>
      <div class="agenda-events">${citas.map(renderCard).join("")}</div>
    </section>`;
  }

  function renderCard(cita) {
    const client = window.AtelierApp.state.clientById.get(cita.clienteId);
    const order = window.AtelierApp.state.orderById.get(cita.pedidoId);
    const phone = client?.telefono || "Sin teléfono";
    const tone = cita.estado === "realizada" ? "success" : cita.estado === "cancelada" ? "danger" : cita.estado === "confirmada" ? "info" : "warning";
    return `<article class="agenda-card">
      <div class="date-pill"><div><strong>${U.escapeHtml(cita.hora || "--:--")}</strong><span>${U.escapeHtml(cita.duracion || "60")} min</span></div></div>
      <div class="agenda-info">
        <h5>${U.escapeHtml(client?.nombre || "Clienta")}</h5>
        <p><strong>Teléfono:</strong> ${U.escapeHtml(phone)}</p>
        <p><strong>Cita:</strong> ${U.escapeHtml(cita.tipo)}${order ? ` · ${U.escapeHtml(order.tipoVestido)}` : ""}</p>
        ${cita.notas ? `<p class="appointment-note"><strong>Nota:</strong> ${U.escapeHtml(cita.notas)}</p>` : ""}
        ${cita.modificaciones ? `<p class="appointment-changes"><strong>Modificaciones:</strong> ${U.escapeHtml(cita.modificaciones)}</p>` : ""}
        <div class="card-actions">${UI.badge(STATUSES.find((item) => item.value === cita.estado)?.label || cita.estado, tone)}</div>
      </div>
      <div class="row-actions"><button class="small-button" data-cita-action="edit" data-id="${U.escapeHtml(cita.id)}" type="button">Editar</button><button class="small-button" data-cita-action="delete" data-id="${U.escapeHtml(cita.id)}" type="button">Eliminar</button></div>
    </article>`;
  }

  function openAppointmentModal(cita = null, defaults = {}) {
    const clients = window.AtelierApp.state.clientes.slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
    const clientId = cita?.clienteId || defaults.clienteId || "";
    const startsWithNewClient = !cita && !clients.length;
    const orders = window.AtelierApp.state.enrichedPedidos.filter((order) => !clientId || order.clienteId === clientId);
    const options = (items, value) => items.map((item) => `<option value="${U.escapeHtml(item.value)}" ${item.value === value ? "selected" : ""}>${U.escapeHtml(item.label)}</option>`).join("");
    UI.openModal({
      title: cita ? "Editar cita" : "Nueva cita",
      submitText: cita ? "Guardar cambios" : "Programar cita",
      body: `<div class="form-grid">
        <div class="form-field full"><label>Clienta</label><select class="field-input" name="clienteId" id="appointmentClient" required><option value="">Selecciona una clienta registrada</option>${clients.map((client) => `<option value="${U.escapeHtml(client.id)}" ${client.id === clientId ? "selected" : ""}>${U.escapeHtml(client.nombre)}</option>`).join("")}${!cita ? `<option value="__new__" ${startsWithNewClient ? "selected" : ""}>+ Registrar clienta nueva</option>` : ""}</select><span class="form-hint">Si es su primera cotización, puedes registrarla sin crear un pedido.</span></div>
        ${!cita ? `<div id="quickClientFields" class="form-grid full ${startsWithNewClient ? "" : "is-hidden"}">
          <div class="form-field"><label>Nombre</label><input class="field-input" name="quickNombres" type="text" autocomplete="given-name"></div>
          <div class="form-field"><label>Apellidos</label><input class="field-input" name="quickApellidos" type="text" autocomplete="family-name"></div>
          <div class="form-field"><label>Teléfono / WhatsApp</label><input class="field-input" name="quickTelefono" type="tel" autocomplete="tel"></div>
          <div class="form-field"><label>Correo (opcional)</label><input class="field-input" name="quickCorreo" type="email" autocomplete="email"></div>
        </div>` : ""}
        <div class="form-field"><label>Pedido relacionado</label><select class="field-input" name="pedidoId" id="appointmentOrder"><option value="">Sin pedido</option>${orders.map((order) => `<option value="${U.escapeHtml(order.id)}" ${order.id === (cita?.pedidoId || defaults.pedidoId) ? "selected" : ""}>${U.escapeHtml(order.tipoVestido)}</option>`).join("")}</select></div>
        <div class="form-field"><label>Tipo</label><select class="field-input" name="tipo">${options(TYPES.map((value) => ({ value, label: value })), cita?.tipo || defaults.tipo || "Cotización")}</select></div>
        <div class="form-field"><label>Estado</label><select class="field-input" name="estado">${options(STATUSES, cita?.estado || "programada")}</select></div>
        <div class="form-field"><label>Fecha</label><input class="field-input" name="fecha" type="date" value="${U.escapeHtml(cita?.fecha || defaults.fecha || "")}" required></div>
        <div class="form-field"><label>Hora</label><input class="field-input" name="hora" type="time" value="${U.escapeHtml(cita?.hora || defaults.hora || "09:00")}" required></div>
        <div class="form-field"><label>Duración (minutos)</label><input class="field-input" name="duracion" type="number" min="15" step="15" value="${U.escapeHtml(cita?.duracion || "60")}"></div>
        <div class="form-field full"><label>Nota para la cita</label><textarea class="field-textarea" name="notas" placeholder="Qué debe recordarse antes o durante la cita...">${U.escapeHtml(cita?.notas || "")}</textarea></div>
        <div class="form-field full"><label>Modificaciones o pendientes</label><textarea class="field-textarea" name="modificaciones" placeholder="Ajustes solicitados, cambios por realizar, materiales pendientes...">${U.escapeHtml(cita?.modificaciones || "")}</textarea></div>
      </div>`,
      onSubmit: async (form) => {
        const payload = UI.getFormData(form);
        const conflict = window.AtelierApp.state.citas.find((item) => item.id !== cita?.id && item.fecha === payload.fecha && item.hora === payload.hora && item.estado !== "cancelada");
        if (conflict) throw new Error("Ya existe una cita programada a esa fecha y hora.");
        if (cita) {
          await API.updateCita(cita.id, payload);
        } else if (payload.clienteId === "__new__") {
          const nombres = payload.quickNombres?.trim();
          const apellidos = payload.quickApellidos?.trim();
          const telefono = payload.quickTelefono?.trim();
          if (!nombres) throw new Error("Escribe el nombre de la nueva clienta.");
          if (!apellidos) throw new Error("Escribe los apellidos de la nueva clienta.");
          if (!telefono) throw new Error("Escribe el teléfono de la nueva clienta.");

          const newClientId = U.createId("cli");
          await API.createCliente({
            id: newClientId,
            nombres,
            apellidos,
            nombre: `${nombres} ${apellidos}`,
            telefono,
            correo: payload.quickCorreo?.trim() || "",
            notas: "Registrada desde la agenda para una primera cita."
          });
          try {
            await API.createCita({ ...payload, clienteId: newClientId, pedidoId: "" });
          } catch (error) {
            try { await API.deleteCliente(newClientId); } catch (cleanupError) { console.warn("No se pudo revertir la clienta creada.", cleanupError); }
            throw error;
          }
        } else {
          await API.createCita(payload);
        }
        await window.AtelierApp.afterMutation(cita ? "Cita actualizada" : "Cita programada");
      }
    });
    const clientSelect = UI.qs("#appointmentClient");
    const updateClientMode = () => {
      const isNew = clientSelect?.value === "__new__";
      const quickFields = UI.qs("#quickClientFields");
      quickFields?.classList.toggle("is-hidden", !isNew);
      quickFields?.querySelectorAll("input").forEach((input) => {
        input.required = isNew && input.name !== "quickCorreo";
      });
      const select = UI.qs("#appointmentOrder");
      const related = isNew ? [] : window.AtelierApp.state.enrichedPedidos.filter((order) => order.clienteId === clientSelect?.value);
      select.innerHTML = `<option value="">Sin pedido</option>${related.map((order) => `<option value="${U.escapeHtml(order.id)}">${U.escapeHtml(order.tipoVestido)}</option>`).join("")}`;
      select.disabled = isNew;
    };
    clientSelect?.addEventListener("change", updateClientMode);
    if (!cita) updateClientMode();
  }

  function confirmDelete(cita) {
    UI.openConfirm({ title: "Eliminar cita", message: "La cita se eliminará de la agenda.", confirmText: "Eliminar cita", onConfirm: async () => { await API.deleteCita(cita.id); await window.AtelierApp.afterMutation("Cita eliminada"); } });
  }

  return { init, render, getFilteredAgenda: getFilteredAppointments, openAppointmentModal };
})();
