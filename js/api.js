window.AtelierAPI = (() => {
  const config = window.ATELIER_CONFIG;
  const U = window.AtelierUtils;

  let state = {
    clientes: [],
    pedidos: [],
    pagos: [],
    citas: [],
    cotizaciones: [],
    catalogoCostos: []
  };

  function hasRemoteUrl() {
    return Boolean(config.APPS_SCRIPT_URL && config.APPS_SCRIPT_URL.trim());
  }

  function getSession() {
    return U.readStorage(config.SESSION_STORAGE_KEY, null);
  }

  function hasSession() {
    const session = getSession();
    return Boolean(session?.sessionToken && Number(session.expiresAt) > Date.now());
  }

  function clearSession() {
    localStorage.removeItem(config.SESSION_STORAGE_KEY);
  }

  async function login(username, password) {
    const challenge = await requestJsonp("authChallenge", { username });
    const passwordHash = await hashText(`${challenge.data.salt}${password}`);
    const response = await hashText(`${passwordHash}${challenge.data.nonce}`);
    const result = await requestJsonp("loginChallenge", { username, nonce: challenge.data.nonce, response });
    U.writeStorage(config.SESSION_STORAGE_KEY, result.data);
    return result.data;
  }

  async function hashText(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function logout() {
    try {
      if (getSession()?.sessionToken) await request("logout");
    } finally {
      clearSession();
    }
  }

  function normalizeRecord(record) {
    return Object.entries(record || {}).reduce((acc, [key, value]) => {
      acc[key] = value == null ? "" : value;
      return acc;
    }, {});
  }

  function normalizeTime(value) {
    const text = String(value || "").trim();
    const direct = text.match(/^(\d{1,2}):(\d{2})/);
    if (direct) return `${String(direct[1]).padStart(2, "0")}:${direct[2]}`;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return text;
    return new Intl.DateTimeFormat(config.LOCALE || "es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: config.TIME_ZONE || "America/Bogota"
    }).format(parsed);
  }

  function normalizeMonth(value) {
    const match = String(value || "").trim().match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  function normalizeData(data) {
    return {
      clientes: (data?.clientes || []).map(normalizeRecord),
      pedidos: (data?.pedidos || []).map((pedido) => ({
        ...normalizeRecord(pedido),
        valorTotal: U.toNumber(pedido.valorTotal),
        primerAbono: U.toNumber(pedido.primerAbono),
        saldoPendiente: U.toNumber(pedido.saldoPendiente),
        mesEvento: normalizeMonth(pedido.mesEvento) || U.getMonthKey(pedido.fechaEvento)
      })),
      pagos: (data?.pagos || []).map((pago) => ({
        ...normalizeRecord(pago),
        monto: U.toNumber(pago.monto)
      })),
      citas: (data?.citas || []).map((cita) => ({ ...normalizeRecord(cita), hora: normalizeTime(cita.hora) })),
      cotizaciones: (data?.cotizaciones || []).map((cotizacion) => ({
        ...normalizeRecord(cotizacion),
        costos: (() => { try { return JSON.parse(cotizacion.costosJson || "[]"); } catch (error) { return []; } })(),
        costoTotal: U.toNumber(cotizacion.costoTotal),
        porcentajeGanancia: U.toNumber(cotizacion.porcentajeGanancia),
        valorGanancia: U.toNumber(cotizacion.valorGanancia),
        precioSugerido: U.toNumber(cotizacion.precioSugerido),
        ajuste: U.toNumber(cotizacion.ajuste),
        precioFinal: U.toNumber(cotizacion.precioFinal),
        porcentajeAbono: U.toNumber(cotizacion.porcentajeAbono),
        abonoRequerido: U.toNumber(cotizacion.abonoRequerido),
        vigenciaDias: U.toNumber(cotizacion.vigenciaDias)
      })),
      catalogoCostos: (data?.catalogoCostos || []).map((item) => ({ ...normalizeRecord(item), costoUnitario: U.toNumber(item.costoUnitario) }))
    };
  }

  function applyData(data) {
    state = normalizeData(data);
    U.writeStorage(config.CACHE_KEY, state);
    return U.clone(state);
  }

  function getLocalData() {
    const existing = U.readStorage(config.DEMO_STORAGE_KEY, null);
    if (existing) return applyData(existing);
    const seeded = seedDemoData();
    U.writeStorage(config.DEMO_STORAGE_KEY, seeded);
    return applyData(seeded);
  }

  function persistLocal() {
    U.writeStorage(config.DEMO_STORAGE_KEY, state);
    U.writeStorage(config.CACHE_KEY, state);
    return U.clone(state);
  }

  function getCachedData() {
    const cached = U.readStorage(config.CACHE_KEY, null);
    if (!cached) return null;

    try {
      return normalizeData(cached);
    } catch (error) {
      console.warn("La caché local no se pudo leer y será ignorada.", error);
      return null;
    }
  }

  async function request(action, payload = {}) {
    try {
      return await requestPost(action, payload);
    } catch (error) {
      if (!config.JSONP_FALLBACK) throw error;
      return requestJsonp(action, payload, error);
    }
  }

  async function requestPost(action, payload = {}, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(config.APPS_SCRIPT_URL.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action,
          payload: options.skipSession ? payload : { ...payload, sessionToken: getSession()?.sessionToken || "" }
        }),
        signal: controller.signal
      });

      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new Error("La respuesta de Apps Script no es JSON válido.");
      }

      if (!response.ok || json.ok === false) {
        const requestError = new Error(json.message || "Apps Script rechazó la operación.");
        requestError.code = json.code || "";
        if (requestError.code === "AUTH_REQUIRED") {
          clearSession();
          window.dispatchEvent(new CustomEvent("atelier:auth-required"));
        }
        throw requestError;
      }

      return json;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  function requestJsonp(action, payload = {}, originalError = new Error("No se pudo conectar con Apps Script.")) {
    return new Promise((resolve, reject) => {
      if (typeof document === "undefined" || !document.createElement) {
        reject(originalError);
        return;
      }

      const callbackName = `atelierJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const url = new URL(config.APPS_SCRIPT_URL.trim());
      url.searchParams.set("action", action);
      url.searchParams.set("payload", JSON.stringify(payload));
      url.searchParams.set("callback", callbackName);

      if (url.toString().length > (config.JSONP_MAX_URL_LENGTH || 1800)) {
        reject(new Error(`${originalError.message} La confirmación automática no pudo usarse porque el pedido es muy largo.`));
        return;
      }

      const script = document.createElement("script");
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(originalError);
      }, config.REQUEST_TIMEOUT_MS);

      function cleanup() {
        window.clearTimeout(timeout);
        delete window[callbackName];
        script.remove();
      }

      window[callbackName] = (json) => {
        cleanup();
        if (!json || json.ok === false) {
          reject(new Error(json?.message || originalError.message || "Apps Script rechazó la operación."));
          return;
        }
        resolve(json);
      };

      script.onerror = () => {
        cleanup();
        reject(originalError);
      };

      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function loadAll(forceRemote = false) {
    if (hasRemoteUrl()) {
      try {
        const result = await request("getAllData", { force: forceRemote });
        return applyData(result.data || result);
      } catch (error) {
        if (error.code === "AUTH_REQUIRED") throw error;
        const cached = getCachedData();
        if (cached) {
          applyData(cached);
          throw new Error(`${error.message} Se muestran los últimos datos guardados en caché.`);
        }
        throw error;
      }
    }

    if (config.USE_DEMO_DATA_WHEN_EMPTY) return getLocalData();
    return applyData({ clientes: [], pedidos: [], pagos: [], citas: [] });
  }

  async function mutate(action, payload, localMutation) {
    if (hasRemoteUrl()) {
      const before = U.clone(state);
      try {
        localMutation();
        U.writeStorage(config.CACHE_KEY, state);
        const result = await request(action, payload);
        if (result.data?.clientes || result.clientes) return applyData(result.data || result);
        return U.clone(state);
      } catch (error) {
        state = before;
        U.writeStorage(config.CACHE_KEY, state);
        throw error;
      }
    }

    localMutation();
    return persistLocal();
  }

  function recalculateOrder(pedidoId) {
    const pedido = state.pedidos.find((item) => item.id === pedidoId);
    if (!pedido) return;
    const pagos = state.pagos.filter((item) => item.pedidoId === pedidoId);
    const pagado = U.sum(pagos.map((pago) => pago.monto));
    pedido.valorTotal = U.toNumber(pedido.valorTotal);
    pedido.primerAbono = U.getInitialPayment(state.pagos, pedidoId);
    pedido.saldoPendiente = Math.max(pedido.valorTotal - pagado, 0);
    pedido.estadoPago = pedido.saldoPendiente <= 0 ? "pagado" : "pendiente";
    pedido.mesEvento = U.getMonthKey(pedido.fechaEvento);
    pedido.fechaActualizacion = U.todayISO();
  }

  function syncInitialPayment(pedido, amount) {
    const monto = U.toNumber(amount);
    const index = state.pagos.findIndex((pago) => pago.pedidoId === pedido.id && String(pago.esPrimerAbono).toUpperCase() === "SI");

    if (monto <= 0 && index >= 0) {
      state.pagos.splice(index, 1);
      return;
    }

    if (monto <= 0) return;

    const payment = {
      id: index >= 0 ? state.pagos[index].id : (pedido.primerPagoId || U.createId("pago")),
      pedidoId: pedido.id,
      clienteId: pedido.clienteId,
      fechaPago: pedido.fechaCreacion || U.todayISO(),
      monto,
      metodo: "Transferencia",
      concepto: "Primer abono",
      notas: "Abono inicial registrado desde el pedido",
      esPrimerAbono: "SI",
      fechaRegistro: pedido.fechaCreacion || U.todayISO()
    };

    if (index >= 0) state.pagos[index] = { ...state.pagos[index], ...payment };
    else state.pagos.push(payment);
  }

  function createCliente(cliente) {
    const record = {
      id: cliente.id || U.createId("cli"),
      nombres: cliente.nombres?.trim() || cliente.nombre?.trim(),
      apellidos: cliente.apellidos?.trim() || "",
      nombre: cliente.nombre?.trim() || `${cliente.nombres || ""} ${cliente.apellidos || ""}`.trim(),
      telefono: cliente.telefono?.trim(),
      instagram: cliente.instagram?.trim(),
      correo: cliente.correo?.trim(),
      direccion: cliente.direccion?.trim(),
      notas: cliente.notas?.trim(),
      fechaRegistro: U.todayISO()
    };

    return mutate("createCliente", { cliente: record }, () => {
      state.clientes.push(record);
    });
  }

  function updateCliente(id, cliente) {
    return mutate("updateCliente", { id, cliente }, () => {
      const index = state.clientes.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("No se encontró la clienta.");
      state.clientes[index] = { ...state.clientes[index], ...cliente, id };
    });
  }

  function deleteCliente(id) {
    return mutate("deleteCliente", { id }, () => {
      const orderIds = state.pedidos.filter((pedido) => pedido.clienteId === id).map((pedido) => pedido.id);
      state.clientes = state.clientes.filter((cliente) => cliente.id !== id);
      state.pedidos = state.pedidos.filter((pedido) => pedido.clienteId !== id);
      state.pagos = state.pagos.filter((pago) => !orderIds.includes(pago.pedidoId));
      state.citas = state.citas.filter((cita) => cita.clienteId !== id);
      state.cotizaciones = state.cotizaciones.filter((cotizacion) => cotizacion.clienteId !== id);
    });
  }

  function createPedido(pedido) {
    const id = pedido.id || U.createId("ped");
    const record = {
      id,
      clienteId: pedido.clienteId,
      tipoVestido: pedido.tipoVestido?.trim(),
      descripcion: pedido.descripcion?.trim(),
      valorTotal: U.toNumber(pedido.valorTotal),
      primerAbono: U.toNumber(pedido.primerAbono),
      primerPagoId: pedido.primerPagoId || U.createId("pago"),
      saldoPendiente: 0,
      fechaEvento: pedido.fechaEvento,
      fechaLimitePago: pedido.fechaLimitePago,
      fechaEntrega: pedido.fechaEntrega,
      estado: pedido.estado || "pendiente",
      estadoPago: "pendiente",
      notasInternas: pedido.notasInternas?.trim(),
      referencias: pedido.referencias?.trim(),
      mesEvento: U.getMonthKey(pedido.fechaEvento),
      fechaCreacion: U.todayISO(),
      fechaActualizacion: U.todayISO()
    };

    return mutate("createPedido", { pedido: record }, () => {
      state.pedidos.push(record);
      syncInitialPayment(record, record.primerAbono);
      recalculateOrder(id);
    });
  }

  function updatePedido(id, pedido) {
    const hasInitialPayment = state.pagos.some((pago) => pago.pedidoId === id && String(pago.esPrimerAbono).toUpperCase() === "SI");
    const payload = {
      ...pedido,
      primerPagoId: U.toNumber(pedido.primerAbono) > 0 && !hasInitialPayment ? U.createId("pago") : pedido.primerPagoId
    };

    return mutate("updatePedido", { id, pedido: payload }, () => {
      const index = state.pedidos.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("No se encontró el pedido.");
      const updated = {
        ...state.pedidos[index],
        ...payload,
        id,
        valorTotal: U.toNumber(payload.valorTotal),
        primerAbono: U.toNumber(payload.primerAbono),
        mesEvento: U.getMonthKey(payload.fechaEvento),
        fechaActualizacion: U.todayISO()
      };
      state.pedidos[index] = updated;
      state.pagos = state.pagos.map((pago) => (
        pago.pedidoId === id ? { ...pago, clienteId: updated.clienteId } : pago
      ));
      syncInitialPayment(updated, updated.primerAbono);
      recalculateOrder(id);
    });
  }

  function deletePedido(id) {
    return mutate("deletePedido", { id }, () => {
      state.pedidos = state.pedidos.filter((pedido) => pedido.id !== id);
      state.pagos = state.pagos.filter((pago) => pago.pedidoId !== id);
      state.citas = state.citas.filter((cita) => cita.pedidoId !== id);
      state.cotizaciones = state.cotizaciones.map((cotizacion) => cotizacion.pedidoId === id ? { ...cotizacion, pedidoId: "", estado: "aceptada" } : cotizacion);
    });
  }

  function registerPago(pago) {
    const pedido = state.pedidos.find((item) => item.id === pago.pedidoId);
    if (!pedido) throw new Error("Selecciona un pedido válido.");
    const record = {
      id: pago.id || U.createId("pago"),
      pedidoId: pago.pedidoId,
      clienteId: pedido.clienteId,
      fechaPago: pago.fechaPago || U.todayISO(),
      monto: U.toNumber(pago.monto),
      metodo: pago.metodo || "Transferencia",
      concepto: pago.concepto || "Abono",
      notas: pago.notas || "",
      esPrimerAbono: "NO",
      fechaRegistro: U.todayISO()
    };

    return mutate("registerPago", { pago: record }, () => {
      state.pagos.push(record);
      recalculateOrder(pago.pedidoId);
    });
  }

  function deletePago(id) {
    return mutate("deletePago", { id }, () => {
      const pago = state.pagos.find((item) => item.id === id);
      state.pagos = state.pagos.filter((item) => item.id !== id);
      if (pago) recalculateOrder(pago.pedidoId);
    });
  }

  function createCita(cita) {
    const record = {
      id: cita.id || U.createId("cita"),
      clienteId: cita.clienteId,
      pedidoId: cita.pedidoId || "",
      tipo: cita.tipo || "Prueba",
      fecha: cita.fecha,
      hora: cita.hora,
      duracion: cita.duracion || "60",
      estado: cita.estado || "programada",
      notas: cita.notas?.trim() || "",
      modificaciones: cita.modificaciones?.trim() || "",
      fechaRegistro: U.todayISO(),
      fechaActualizacion: U.todayISO()
    };
    return mutate("createCita", { cita: record }, () => state.citas.push(record));
  }

  function updateCita(id, cita) {
    return mutate("updateCita", { id, cita }, () => {
      const index = state.citas.findIndex((item) => item.id === id);
      if (index < 0) throw new Error("No se encontró la cita.");
      state.citas[index] = { ...state.citas[index], ...cita, id, fechaActualizacion: U.todayISO() };
    });
  }

  function deleteCita(id) {
    return mutate("deleteCita", { id }, () => {
      state.citas = state.citas.filter((item) => item.id !== id);
    });
  }

  function calculateQuote(cotizacion) {
    const costos = (cotizacion.costos || []).map((item) => {
      const cantidad = Math.max(U.toNumber(item.cantidad), 0);
      const costoUnitario = Math.max(U.toNumber(item.costoUnitario), 0);
      return { ...item, cantidad, costoUnitario, subtotal: cantidad * costoUnitario };
    }).filter((item) => item.nombre?.trim() && item.cantidad > 0);
    const costoTotal = U.sum(costos.map((item) => item.subtotal));
    const porcentajeGanancia = Math.max(U.toNumber(cotizacion.porcentajeGanancia), 0);
    const metodoGanancia = cotizacion.metodoGanancia === "margen" ? "margen" : "sobre_costo";
    const precioSugerido = metodoGanancia === "margen" && porcentajeGanancia < 100
      ? Math.round(costoTotal / (1 - porcentajeGanancia / 100))
      : Math.round(costoTotal * (1 + porcentajeGanancia / 100));
    const ajuste = U.toNumber(cotizacion.ajuste);
    const precioFinal = U.toNumber(cotizacion.precioFinal) > 0 ? U.toNumber(cotizacion.precioFinal) : Math.max(precioSugerido + ajuste, 0);
    const porcentajeAbono = Math.min(Math.max(U.toNumber(cotizacion.porcentajeAbono) || 50, 0), 100);
    return { ...cotizacion, costos, costosJson: JSON.stringify(costos), costoTotal, metodoGanancia, porcentajeGanancia, precioSugerido, ajuste, precioFinal, valorGanancia: Math.max(precioFinal - costoTotal, 0), porcentajeAbono, abonoRequerido: Math.round(precioFinal * porcentajeAbono / 100) };
  }

  function createCotizacion(cotizacion) {
    const record = { ...calculateQuote(cotizacion), id: cotizacion.id || U.createId("cot"), numero: cotizacion.numero || "", estado: cotizacion.estado || "borrador", fechaCreacion: U.todayISO(), fechaActualizacion: U.todayISO() };
    return mutate("createCotizacion", { cotizacion: record }, () => state.cotizaciones.push(record));
  }

  function updateCotizacion(id, cotizacion) {
    const index = state.cotizaciones.findIndex((item) => item.id === id);
    if (index < 0) return Promise.reject(new Error("No se encontró la cotización."));
    const updated = calculateQuote({ ...state.cotizaciones[index], ...cotizacion });
    return mutate("updateCotizacion", { id, cotizacion: updated }, () => {
      if (index < 0) throw new Error("No se encontró la cotización.");
      state.cotizaciones[index] = { ...state.cotizaciones[index], ...updated, id, fechaActualizacion: U.todayISO() };
    });
  }

  function deleteCotizacion(id) {
    return mutate("deleteCotizacion", { id }, () => { state.cotizaciones = state.cotizaciones.filter((item) => item.id !== id); });
  }

  function createCatalogoCosto(item) {
    const record = { ...item, id: item.id || U.createId("ins"), costoUnitario: U.toNumber(item.costoUnitario), activo: "SI", fechaActualizacion: U.todayISO() };
    return mutate("createCatalogoCosto", { item: record }, () => state.catalogoCostos.push(record));
  }

  function updateCatalogoCosto(id, item) {
    return mutate("updateCatalogoCosto", { id, item }, () => {
      const index = state.catalogoCostos.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("No se encontró el costo.");
      state.catalogoCostos[index] = { ...state.catalogoCostos[index], ...item, id, costoUnitario: U.toNumber(item.costoUnitario), fechaActualizacion: U.todayISO() };
    });
  }

  function deleteCatalogoCosto(id) {
    return mutate("deleteCatalogoCosto", { id }, () => { state.catalogoCostos = state.catalogoCostos.filter((item) => item.id !== id); });
  }

  function seedDemoData() {
    const clientes = [
      {
        id: "cli_paula",
        nombre: "Paula Gómez",
        telefono: "300 456 1122",
        instagram: "@paulagomez",
        correo: "paula@example.com",
        direccion: "El Poblado, Medellín",
        notas: "Quiere tonos marfil y bordado delicado.",
        fechaRegistro: "2026-06-02"
      },
      {
        id: "cli_daniela",
        nombre: "Daniela Ríos",
        telefono: "315 888 3400",
        instagram: "@danirios",
        correo: "daniela@example.com",
        direccion: "Envigado",
        notas: "Novia civil y recepción nocturna.",
        fechaRegistro: "2026-05-18"
      },
      {
        id: "cli_camila",
        nombre: "Camila Ortega",
        telefono: "301 222 4477",
        instagram: "@camiortega",
        correo: "camila@example.com",
        direccion: "Laureles",
        notas: "Prefiere comunicación por WhatsApp.",
        fechaRegistro: "2026-06-21"
      },
      {
        id: "cli_valentina",
        nombre: "Valentina Mora",
        telefono: "320 555 7811",
        instagram: "@valemora",
        correo: "vale@example.com",
        direccion: "Sabaneta",
        notas: "Evento de grados. Silueta limpia y mangas suaves.",
        fechaRegistro: "2026-07-01"
      }
    ];

    const pedidos = [
      {
        id: "ped_paula_15",
        clienteId: "cli_paula",
        tipoVestido: "Vestido quinceañera",
        descripcion: "Corset bordado, falda amplia desmontable y capa ligera.",
        valorTotal: 2800000,
        primerAbono: 1000000,
        saldoPendiente: 1800000,
        fechaEvento: "2026-11-14",
        fechaLimitePago: "2026-10-30",
        fechaEntrega: "2026-11-05",
        estado: "confeccion",
        estadoPago: "pendiente",
        notasInternas: "Confirmar segunda prueba en septiembre.",
        referencias: "https://pin.it/referencia-paula",
        mesEvento: "2026-11",
        fechaCreacion: "2026-06-02",
        fechaActualizacion: "2026-07-03"
      },
      {
        id: "ped_daniela_boda",
        clienteId: "cli_daniela",
        tipoVestido: "Vestido de novia",
        descripcion: "Línea A, encaje francés y cola desmontable.",
        valorTotal: 6500000,
        primerAbono: 3000000,
        saldoPendiente: 3500000,
        fechaEvento: "2026-12-05",
        fechaLimitePago: "2026-11-20",
        fechaEntrega: "2026-11-27",
        estado: "diseno",
        estadoPago: "pendiente",
        notasInternas: "Enviar propuesta de velo.",
        referencias: "https://pin.it/referencia-daniela",
        mesEvento: "2026-12",
        fechaCreacion: "2026-05-18",
        fechaActualizacion: "2026-07-02"
      },
      {
        id: "ped_camila_gala",
        clienteId: "cli_camila",
        tipoVestido: "Vestido de gala",
        descripcion: "Satín negro, escote asimétrico y abertura lateral.",
        valorTotal: 1800000,
        primerAbono: 900000,
        saldoPendiente: 0,
        fechaEvento: "2026-07-20",
        fechaLimitePago: "2026-07-10",
        fechaEntrega: "2026-07-16",
        estado: "listo",
        estadoPago: "pagado",
        notasInternas: "Lista para entrega con forro ajustado.",
        referencias: "",
        mesEvento: "2026-07",
        fechaCreacion: "2026-06-21",
        fechaActualizacion: "2026-07-05"
      },
      {
        id: "ped_valentina_grados",
        clienteId: "cli_valentina",
        tipoVestido: "Vestido de grados",
        descripcion: "Vestido midi en verde salvia con drapeado frontal.",
        valorTotal: 2200000,
        primerAbono: 500000,
        saldoPendiente: 1700000,
        fechaEvento: "2026-08-16",
        fechaLimitePago: "2026-08-01",
        fechaEntrega: "2026-08-10",
        estado: "pendiente",
        estadoPago: "pendiente",
        notasInternas: "Tomar medidas definitivas esta semana.",
        referencias: "",
        mesEvento: "2026-08",
        fechaCreacion: "2026-07-01",
        fechaActualizacion: "2026-07-01"
      }
    ];

    const pagos = [
      {
        id: "pago_paula_1",
        pedidoId: "ped_paula_15",
        clienteId: "cli_paula",
        fechaPago: "2026-06-02",
        monto: 1000000,
        metodo: "Transferencia",
        concepto: "Primer abono",
        notas: "",
        esPrimerAbono: "SI",
        fechaRegistro: "2026-06-02"
      },
      {
        id: "pago_daniela_1",
        pedidoId: "ped_daniela_boda",
        clienteId: "cli_daniela",
        fechaPago: "2026-05-18",
        monto: 3000000,
        metodo: "Transferencia",
        concepto: "Primer abono",
        notas: "Separación de fecha y diseño.",
        esPrimerAbono: "SI",
        fechaRegistro: "2026-05-18"
      },
      {
        id: "pago_camila_1",
        pedidoId: "ped_camila_gala",
        clienteId: "cli_camila",
        fechaPago: "2026-06-21",
        monto: 900000,
        metodo: "Nequi",
        concepto: "Primer abono",
        notas: "",
        esPrimerAbono: "SI",
        fechaRegistro: "2026-06-21"
      },
      {
        id: "pago_camila_2",
        pedidoId: "ped_camila_gala",
        clienteId: "cli_camila",
        fechaPago: "2026-07-05",
        monto: 900000,
        metodo: "Transferencia",
        concepto: "Saldo final",
        notas: "",
        esPrimerAbono: "NO",
        fechaRegistro: "2026-07-05"
      },
      {
        id: "pago_valentina_1",
        pedidoId: "ped_valentina_grados",
        clienteId: "cli_valentina",
        fechaPago: "2026-07-01",
        monto: 500000,
        metodo: "Daviplata",
        concepto: "Primer abono",
        notas: "",
        esPrimerAbono: "SI",
        fechaRegistro: "2026-07-01"
      }
    ];

    return { clientes, pedidos, pagos, citas: [], cotizaciones: [], catalogoCostos: [] };
  }

  return {
    loadAll,
    createCliente,
    updateCliente,
    deleteCliente,
    createPedido,
    updatePedido,
    deletePedido,
    registerPago,
    deletePago,
    createCita,
    updateCita,
    deleteCita,
    createCotizacion,
    updateCotizacion,
    deleteCotizacion,
    createCatalogoCosto,
    updateCatalogoCosto,
    deleteCatalogoCosto,
    calculateQuote,
    hasRemoteUrl,
    login,
    logout,
    hasSession,
    getSession,
    clearSession,
    getCachedData,
    getState: () => U.clone(state)
  };
})();
