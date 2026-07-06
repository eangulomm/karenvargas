window.AtelierUI = (() => {
  const U = window.AtelierUtils;

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function showLoader(message = "Cargando atelier...") {
    const loader = qs("#loader");
    if (!loader) return;
    loader.querySelector("p").textContent = message;
    loader.classList.remove("is-hidden");
  }

  function hideLoader() {
    qs("#loader")?.classList.add("is-hidden");
  }

  function toast(title, message = "", type = "info") {
    const host = qs("#toastHost");
    if (!host) return;
    const colors = {
      success: "var(--color-success)",
      error: "var(--color-danger)",
      warning: "var(--color-warning)",
      info: "var(--color-rose)"
    };
    const node = document.createElement("div");
    node.className = "toast";
    node.style.setProperty("--toast-color", colors[type] || colors.info);
    node.innerHTML = `<strong>${U.escapeHtml(title)}</strong>${message ? `<p>${U.escapeHtml(message)}</p>` : ""}`;
    host.appendChild(node);
    window.setTimeout(() => node.remove(), 4400);
  }

  function badge(label, tone = "neutral") {
    return `<span class="badge ${U.escapeHtml(tone)}">${U.escapeHtml(label)}</span>`;
  }

  function emptyState(title, text) {
    return `
      <div class="empty-state">
        <strong>${U.escapeHtml(title)}</strong>
        <p>${U.escapeHtml(text)}</p>
      </div>
    `;
  }

  function inlineLoader(message = "Cargando...") {
    return `
      <div class="inline-loader">
        <span class="loader-spinner"></span>
        <strong>${U.escapeHtml(message)}</strong>
      </div>
    `;
  }

  function bindMoneyInputs(root = document) {
    qsa(".money-input", root).forEach((input) => {
      if (input.value) input.value = U.formatMoneyInput(input.value);
      input.addEventListener("input", () => {
        const cursorFromEnd = input.value.length - (input.selectionStart ?? input.value.length);
        const formatted = U.formatMoneyInput(input.value);
        input.value = formatted;
        const newPos = Math.max(formatted.length - cursorFromEnd, 0);
        input.setSelectionRange(newPos, newPos);
      });
    });
  }

  function openModal({ title, body, submitText = "Guardar", secondaryText = "Cancelar", onSubmit, footerExtra = "" }) {
    const root = qs("#modalRoot");
    root.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <form id="modalForm">
          <div class="modal-header">
            <h3 id="modalTitle">${U.escapeHtml(title)}</h3>
            <button class="icon-button" data-close-modal type="button" aria-label="Cerrar">×</button>
          </div>
          <div class="modal-body">${body}</div>
          <div class="modal-footer">
            <button class="ghost-button" data-close-modal type="button">${U.escapeHtml(secondaryText)}</button>
            <div class="row-actions">
              ${footerExtra}
              <button class="primary-button" type="submit">${U.escapeHtml(submitText)}</button>
            </div>
          </div>
        </form>
      </div>
    `;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");

    qsa("[data-close-modal]", root).forEach((button) => {
      button.addEventListener("click", closeModal);
    });

    bindMoneyInputs(root);

    qs("#modalForm", root).addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitter = event.submitter;
      const originalButtonHtml = submitter?.innerHTML;
      submitter?.setAttribute("disabled", "disabled");
      submitter?.classList.add("is-busy");
      if (submitter) submitter.innerHTML = `<span class="button-spinner"></span> Guardando...`;
      try {
        await onSubmit(event.currentTarget);
        closeModal();
      } catch (error) {
        toast("No se pudo guardar", error.message || "Revisa los datos e inténtalo de nuevo.", "error");
      } finally {
        submitter?.removeAttribute("disabled");
        submitter?.classList.remove("is-busy");
        if (submitter && originalButtonHtml) submitter.innerHTML = originalButtonHtml;
      }
    });

    const firstField = qs("input, select, textarea", root);
    window.setTimeout(() => firstField?.focus(), 60);
  }

  function openConfirm({ title, message, confirmText = "Confirmar", tone = "danger", onConfirm }) {
    const root = qs("#modalRoot");
    const buttonClass = tone === "danger" ? "danger-button" : "primary-button";
    root.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <div class="modal-header">
          <h3 id="modalTitle">${U.escapeHtml(title)}</h3>
          <button class="icon-button" data-close-modal type="button" aria-label="Cerrar">×</button>
        </div>
        <div class="modal-body">
          <p>${U.escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="ghost-button" data-close-modal type="button">Cancelar</button>
          <button id="confirmActionBtn" class="${buttonClass}" type="button">${U.escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    root.classList.add("is-open");
    root.setAttribute("aria-hidden", "false");
    qsa("[data-close-modal]", root).forEach((button) => button.addEventListener("click", closeModal));
    qs("#confirmActionBtn", root).addEventListener("click", async (event) => {
      event.currentTarget.setAttribute("disabled", "disabled");
      event.currentTarget.classList.add("is-busy");
      try {
        await onConfirm();
        closeModal();
      } catch (error) {
        toast("Acción no completada", error.message || "Inténtalo de nuevo.", "error");
      } finally {
        event.currentTarget.removeAttribute("disabled");
        event.currentTarget.classList.remove("is-busy");
      }
    });
  }

  function closeModal() {
    const root = qs("#modalRoot");
    root.classList.remove("is-open");
    root.setAttribute("aria-hidden", "true");
    root.innerHTML = "";
  }

  function getFormData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function renderSelectOptions(select, options, selected = "", firstLabel = "") {
    if (!select) return;
    const first = firstLabel ? `<option value="">${U.escapeHtml(firstLabel)}</option>` : "";
    select.innerHTML = first + options.map((option) => {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label;
      return `<option value="${U.escapeHtml(value)}" ${value === selected ? "selected" : ""}>${U.escapeHtml(label)}</option>`;
    }).join("");
  }

  function setActiveView(view) {
    qsa(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
    qsa("[data-view-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.viewPanel === view));
    const title = qs(`.nav-item[data-view="${view}"] span:last-child`)?.textContent || "Dashboard";
    const viewTitle = qs("#viewTitle");
    if (viewTitle) viewTitle.textContent = title;
    qs(".sidebar")?.classList.remove("is-open");
  }

  return {
    qs,
    qsa,
    showLoader,
    hideLoader,
    toast,
    badge,
    emptyState,
    inlineLoader,
    openModal,
    openConfirm,
    closeModal,
    getFormData,
    renderSelectOptions,
    setActiveView,
    bindMoneyInputs
  };
})();
