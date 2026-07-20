const ATELIER_HEADERS = {
  Clientes: ["id", "nombres", "apellidos", "nombre", "telefono", "instagram", "correo", "direccion", "notas", "fechaRegistro"],
  Pedidos: [
    "id", "clienteId", "tipoVestido", "descripcion", "valorTotal", "primerAbono",
    "saldoPendiente", "fechaEvento", "fechaLimitePago", "fechaEntrega", "estado",
    "estadoPago", "notasInternas", "referencias", "primerPagoId", "mesEvento", "fechaCreacion", "fechaActualizacion"
  ],
  Pagos: ["id", "pedidoId", "clienteId", "fechaPago", "monto", "metodo", "concepto", "notas", "esPrimerAbono", "fechaRegistro"],
  Citas: ["id", "clienteId", "pedidoId", "tipo", "fecha", "hora", "duracion", "estado", "notas", "modificaciones", "fechaRegistro", "fechaActualizacion"],
  Cotizaciones: [
    "id", "numero", "clienteId", "citaId", "pedidoId", "descripcion", "costosJson", "costoTotal",
    "metodoGanancia", "porcentajeGanancia", "valorGanancia", "precioSugerido", "ajuste", "precioFinal",
    "porcentajeAbono", "abonoRequerido", "vigenciaDias", "fechaEntrega", "condiciones", "estado",
    "fechaCreacion", "fechaActualizacion"
  ],
  CatalogoCostos: ["id", "categoria", "nombre", "unidad", "costoUnitario", "activo", "fechaActualizacion"],
  Configuracion: ["clave", "valor", "descripcion"]
};

const ATELIER_SCHEMA_VERSION = "2026-07-20.4";
const ATELIER_NUMERIC_FIELDS = ["valorTotal", "primerAbono", "saldoPendiente", "monto", "costoTotal", "porcentajeGanancia", "valorGanancia", "precioSugerido", "ajuste", "precioFinal", "porcentajeAbono", "abonoRequerido", "vigenciaDias", "costoUnitario"];
const ATELIER_DATE_FIELDS = ["fechaRegistro", "fechaEvento", "fechaLimitePago", "fechaEntrega", "fechaCreacion", "fechaActualizacion", "fechaPago", "fecha"];
let ATELIER_SETUP_READY = false;
let ATELIER_ROWS_CACHE = {};

function doGet(e) {
  let callback = "";
  try {
    const params = e && e.parameter ? Object.assign({}, e.parameter) : {};
    const action = params.action || "ping";
    callback = params.callback || "";
    let payload = {};

    if (params.payload) {
      payload = JSON.parse(params.payload);
    } else {
      payload = Object.assign({}, params);
      delete payload.action;
      delete payload.callback;
    }

    const result = handleAction_(action, payload);
    return jsonResponse_(result, callback);
  } catch (error) {
    return jsonResponse_({ ok: false, message: error.message }, callback);
  }
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = body.action || "getAllData";
    const payload = body.payload || {};
    const result = handleAction_(action, payload);
    return jsonResponse_(result);
  } catch (error) {
    return jsonResponse_({ ok: false, message: error.message });
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Atelier")
    .addItem("Preparar hojas", "setup")
    .addToUi();
}

function setup() {
  setup_();
  return "Hojas del sistema Atelier listas.";
}

function obtenerClientes() {
  setup_();
  return readRows_("Clientes");
}

function crearCliente(cliente) {
  return createCliente_(cliente).data;
}

function actualizarCliente(id, cliente) {
  return updateCliente_(id, cliente).data;
}

function eliminarCliente(id) {
  return deleteCliente_(id).data;
}

function obtenerPedidos() {
  setup_();
  return readRows_("Pedidos");
}

function crearPedido(pedido) {
  return createPedido_(pedido).data;
}

function actualizarPedido(id, pedido) {
  return updatePedido_(id, pedido).data;
}

function eliminarPedido(id) {
  return deletePedido_(id).data;
}

function obtenerPagos() {
  setup_();
  return readRows_("Pagos");
}

function registrarPago(pago) {
  return registerPago_(pago).data;
}

function obtenerDashboard() {
  return getDashboard_().dashboard;
}

function obtenerAgendaPorMes(mesEvento) {
  return getAgendaPorMes_({ mesEvento }).agenda;
}

function handleAction_(action, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    switch (action) {
      case "ping":
        return { ok: true, message: "Atelier API activa", data: { timestamp: new Date().toISOString() } };
      case "setup":
        setup_();
        return { ok: true, message: "Hojas preparadas", data: getAllData_() };
      case "getAllData":
        return { ok: true, data: getAllData_() };
      case "getClientes":
        setup_();
        return { ok: true, data: { clientes: readRows_("Clientes") } };
      case "createCliente":
        return createCliente_(payload.cliente || payload);
      case "updateCliente":
        return updateCliente_(payload.id, payload.cliente || payload);
      case "deleteCliente":
        return deleteCliente_(payload.id);
      case "getPedidos":
        setup_();
        return { ok: true, data: { pedidos: readRows_("Pedidos") } };
      case "createPedido":
        return createPedido_(payload.pedido || payload);
      case "updatePedido":
        return updatePedido_(payload.id, payload.pedido || payload);
      case "deletePedido":
        return deletePedido_(payload.id);
      case "getPagos":
        setup_();
        return { ok: true, data: { pagos: readRows_("Pagos") } };
      case "registerPago":
        return registerPago_(payload.pago || payload);
      case "deletePago":
        return deletePago_(payload.id);
      case "createCita":
        return createCita_(payload.cita || payload);
      case "updateCita":
        return updateCita_(payload.id, payload.cita || payload);
      case "deleteCita":
        return deleteCita_(payload.id);
      case "createCotizacion":
        return createCotizacion_(payload.cotizacion || payload);
      case "updateCotizacion":
        return updateCotizacion_(payload.id, payload.cotizacion || payload);
      case "deleteCotizacion":
        return deleteCotizacion_(payload.id);
      case "createCatalogoCosto":
        return createCatalogoCosto_(payload.item || payload);
      case "updateCatalogoCosto":
        return updateCatalogoCosto_(payload.id, payload.item || payload);
      case "deleteCatalogoCosto":
        return deleteCatalogoCosto_(payload.id);
      case "getDashboard":
        return getDashboard_();
      case "getAgendaPorMes":
        return getAgendaPorMes_(payload);
      default:
        throw new Error("Acción no reconocida: " + action);
    }
  } finally {
    lock.releaseLock();
  }
}

function createCliente_(cliente) {
  setup_();
  const clean = cleanRecord_(cliente || {});
  clean.nombres = clean.nombres || clean.nombre;
  clean.apellidos = clean.apellidos || "";
  clean.nombre = [clean.nombres, clean.apellidos].filter(Boolean).join(" ").trim();
  if (!clean.nombres) throw new Error("El nombre de la clienta es obligatorio.");
  if (!clean.telefono) throw new Error("El teléfono de la clienta es obligatorio.");
  const id = clean.id || makeId_("cli");

  const existingById = findById_("Clientes", id);
  if (existingById) {
    return { ok: true, message: "Clienta ya registrada", data: { record: existingById } };
  }

  const duplicates = readRows_("Clientes").filter(function(item) {
    return normalize_(item.nombre) === normalize_(clean.nombre) && normalize_(item.telefono) === normalize_(clean.telefono);
  });
  if (duplicates.length) throw new Error("Ya existe una clienta con ese nombre y teléfono.");

  appendRecord_("Clientes", {
    id,
    nombres: clean.nombres,
    apellidos: clean.apellidos,
    nombre: clean.nombre,
    telefono: clean.telefono,
    instagram: clean.instagram,
    correo: clean.correo,
    direccion: clean.direccion,
    notas: clean.notas,
    fechaRegistro: today_()
  });

  return { ok: true, message: "Clienta creada", data: { record: findById_("Clientes", id) } };
}

function updateCliente_(id, cliente) {
  setup_();
  if (!id) throw new Error("Falta el ID de la clienta.");
  const clean = cleanRecord_(cliente || {});
  clean.nombres = clean.nombres || clean.nombre;
  clean.apellidos = clean.apellidos || "";
  clean.nombre = [clean.nombres, clean.apellidos].filter(Boolean).join(" ").trim();
  if (!clean.nombres) throw new Error("El nombre de la clienta es obligatorio.");
  if (!clean.telefono) throw new Error("El teléfono de la clienta es obligatorio.");

  updateRecord_("Clientes", id, {
    nombres: clean.nombres,
    apellidos: clean.apellidos,
    nombre: clean.nombre,
    telefono: clean.telefono,
    instagram: clean.instagram,
    correo: clean.correo,
    direccion: clean.direccion,
    notas: clean.notas
  });

  return { ok: true, message: "Clienta actualizada", data: { record: findById_("Clientes", id) } };
}

function deleteCliente_(id) {
  setup_();
  if (!id) throw new Error("Falta el ID de la clienta.");
  if (!findById_("Clientes", id)) {
    return { ok: true, message: "Clienta ya eliminada", data: { id } };
  }

  const pedidos = readRows_("Pedidos").filter(function(pedido) {
    return pedido.clienteId === id;
  });
  const pedidoIds = pedidos.map(function(pedido) {
    return pedido.id;
  });

  pedidoIds.forEach(function(pedidoId) {
    deleteWhere_("Pagos", function(pago) {
      return pago.pedidoId === pedidoId;
    });
  });
  deleteWhere_("Pedidos", function(pedido) {
    return pedido.clienteId === id;
  });
  deleteWhere_("Citas", function(cita) {
    return cita.clienteId === id;
  });
  deleteWhere_("Cotizaciones", function(cotizacion) {
    return cotizacion.clienteId === id;
  });
  deleteRecord_("Clientes", id);

  return { ok: true, message: "Clienta eliminada", data: { id } };
}

function createPedido_(pedido) {
  setup_();
  const clean = cleanRecord_(pedido || {});
  const id = clean.id || makeId_("ped");
  const existingById = findById_("Pedidos", id);
  if (existingById) {
    return { ok: true, message: "Pedido ya registrado", data: { record: existingById } };
  }

  validatePedido_(clean);

  const valorTotal = toNumber_(clean.valorTotal);
  const primerAbono = toNumber_(clean.primerAbono);
  const now = today_();

  const record = {
    id,
    clienteId: clean.clienteId,
    tipoVestido: clean.tipoVestido,
    descripcion: clean.descripcion,
    valorTotal,
    primerAbono,
    saldoPendiente: valorTotal,
    fechaEvento: clean.fechaEvento,
    fechaLimitePago: clean.fechaLimitePago,
    fechaEntrega: clean.fechaEntrega,
    estado: clean.estado || "pendiente",
    estadoPago: "pendiente",
    notasInternas: clean.notasInternas,
    referencias: clean.referencias,
    primerPagoId: clean.primerPagoId,
    mesEvento: monthKey_(clean.fechaEvento),
    fechaCreacion: now,
    fechaActualizacion: now
  };

  appendRecord_("Pedidos", record);
  syncPrimerAbono_(record, primerAbono);
  recalculatePedido_(id);

  return { ok: true, message: "Pedido creado", data: { record: findById_("Pedidos", id) } };
}

function updatePedido_(id, pedido) {
  setup_();
  if (!id) throw new Error("Falta el ID del pedido.");
  const clean = cleanRecord_(pedido || {});
  validatePedido_(clean);

  const existing = findById_("Pedidos", id);
  if (!existing) throw new Error("No se encontró el pedido.");

  const updated = updateRecord_("Pedidos", id, {
    clienteId: clean.clienteId,
    tipoVestido: clean.tipoVestido,
    descripcion: clean.descripcion,
    valorTotal: toNumber_(clean.valorTotal),
    primerAbono: toNumber_(clean.primerAbono),
    fechaEvento: clean.fechaEvento,
    fechaLimitePago: clean.fechaLimitePago,
    fechaEntrega: clean.fechaEntrega,
    estado: clean.estado || "pendiente",
    notasInternas: clean.notasInternas,
    referencias: clean.referencias,
    mesEvento: monthKey_(clean.fechaEvento),
    fechaActualizacion: today_()
  });

  updatePagosCliente_(id, clean.clienteId);
  syncPrimerAbono_(Object.assign({}, updated, { primerPagoId: clean.primerPagoId }), toNumber_(clean.primerAbono));
  recalculatePedido_(id);

  return { ok: true, message: "Pedido actualizado", data: { record: findById_("Pedidos", id) } };
}

function deletePedido_(id) {
  setup_();
  if (!id) throw new Error("Falta el ID del pedido.");
  if (!findById_("Pedidos", id)) {
    return { ok: true, message: "Pedido ya eliminado", data: { id } };
  }

  deleteWhere_("Pagos", function(pago) {
    return pago.pedidoId === id;
  });
  deleteWhere_("Citas", function(cita) {
    return cita.pedidoId === id;
  });
  readRows_("Cotizaciones").forEach(function(cotizacion) {
    if (cotizacion.pedidoId === id) updateRecord_("Cotizaciones", cotizacion.id, { pedidoId: "", estado: "aceptada" });
  });
  deleteRecord_("Pedidos", id);

  return { ok: true, message: "Pedido eliminado", data: { id } };
}

function registerPago_(pago) {
  setup_();
  const clean = cleanRecord_(pago || {});
  if (!clean.pedidoId) throw new Error("Selecciona un pedido.");
  const id = clean.id || makeId_("pago");
  const existingById = findById_("Pagos", id);
  if (existingById) {
    return { ok: true, message: "Pago ya registrado", data: { record: existingById } };
  }

  const pedido = findById_("Pedidos", clean.pedidoId);
  if (!pedido) throw new Error("No se encontró el pedido.");

  const monto = toNumber_(clean.monto);
  if (monto <= 0) throw new Error("El monto debe ser mayor a cero.");

  const saldo = calculateSaldo_(pedido.id, toNumber_(pedido.valorTotal));
  if (monto > saldo) throw new Error("El abono no puede superar el saldo pendiente.");

  appendRecord_("Pagos", {
    id,
    pedidoId: pedido.id,
    clienteId: pedido.clienteId,
    fechaPago: clean.fechaPago || today_(),
    monto,
    metodo: clean.metodo || "Transferencia",
    concepto: clean.concepto || "Abono",
    notas: clean.notas,
    esPrimerAbono: "NO",
    fechaRegistro: today_()
  });

  recalculatePedido_(pedido.id);

  return { ok: true, message: "Pago registrado", data: { record: findById_("Pagos", id) } };
}

function deletePago_(id) {
  setup_();
  if (!id) throw new Error("Falta el ID del pago.");
  const pago = findById_("Pagos", id);
  if (!pago) {
    return { ok: true, message: "Pago ya eliminado", data: { id } };
  }
  deleteRecord_("Pagos", id);
  if (pago) recalculatePedido_(pago.pedidoId);

  return { ok: true, message: "Pago eliminado", data: { id } };
}

function getDashboard_() {
  setup_();
  const data = getAllData_();
  const pedidos = data.pedidos;
  const pagos = data.pagos;
  const active = pedidos.filter(function(pedido) {
    return pedido.estado !== "entregado" && pedido.estado !== "cancelado";
  });

  const dashboard = {
    totalPedidosActivos: active.length,
    ingresosTotales: sum_(pagos.map(function(pago) { return pago.monto; })),
    saldoPendiente: sum_(pedidos.map(function(pedido) { return pedido.saldoPendiente; })),
    proximosEventos: pedidos.filter(function(pedido) {
      return daysUntil_(pedido.fechaEvento) >= 0 && daysUntil_(pedido.fechaEvento) <= 30;
    }).length,
    vestidosEnProceso: active.filter(function(pedido) {
      return ["diseno", "confeccion", "prueba"].indexOf(pedido.estado) >= 0;
    }).length,
    vestidosEntregados: pedidos.filter(function(pedido) {
      return pedido.estado === "entregado";
    }).length
  };

  return { ok: true, data, dashboard };
}

function getAgendaPorMes_(payload) {
  setup_();
  const mesEvento = payload && payload.mesEvento ? payload.mesEvento : "";
  const data = getAllData_();
  const agenda = data.pedidos
    .filter(function(pedido) {
      return !mesEvento || pedido.mesEvento === mesEvento;
    })
    .map(function(pedido) {
      const cliente = data.clientes.filter(function(item) {
        return item.id === pedido.clienteId;
      })[0] || {};
      return Object.assign({}, pedido, {
        clientaNombre: cliente.nombre || "",
        clientaTelefono: cliente.telefono || "",
        clientaInstagram: cliente.instagram || ""
      });
    });

  return { ok: true, data, agenda };
}

function getAllData_() {
  setup_();
  return {
    clientes: readRows_("Clientes"),
    pedidos: readRows_("Pedidos"),
    pagos: readRows_("Pagos"),
    citas: readRows_("Citas"),
    cotizaciones: readRows_("Cotizaciones"),
    catalogoCostos: readRows_("CatalogoCostos")
  };
}

function calculateCotizacion_(cotizacion) {
  const clean = cleanRecord_(cotizacion || {});
  let costos = [];
  try {
    costos = Array.isArray(cotizacion.costos) ? cotizacion.costos : JSON.parse(clean.costosJson || "[]");
  } catch (error) {
    throw new Error("La lista de costos no es válida.");
  }
  costos = costos.map(function(item) {
    const cantidad = Math.max(toNumber_(item.cantidad), 0);
    const costoUnitario = Math.max(toNumber_(item.costoUnitario), 0);
    return {
      categoria: String(item.categoria || "Otros").trim(),
      nombre: String(item.nombre || "").trim(),
      unidad: String(item.unidad || "unidad").trim(),
      cantidad,
      costoUnitario,
      subtotal: cantidad * costoUnitario
    };
  }).filter(function(item) { return item.nombre && item.cantidad > 0; });
  if (!costos.length) throw new Error("Agrega al menos un costo a la cotización.");

  const costoTotal = sum_(costos.map(function(item) { return item.subtotal; }));
  const porcentaje = Math.max(toNumber_(clean.porcentajeGanancia), 0);
  const metodo = clean.metodoGanancia === "margen" ? "margen" : "sobre_costo";
  if (metodo === "margen" && porcentaje >= 100) throw new Error("El margen debe ser menor al 100%.");
  const precioBase = metodo === "margen"
    ? costoTotal / (1 - porcentaje / 100)
    : costoTotal * (1 + porcentaje / 100);
  const ajuste = toNumber_(clean.ajuste);
  const precioSugerido = Math.round(precioBase);
  const precioFinal = toNumber_(clean.precioFinal) > 0 ? toNumber_(clean.precioFinal) : Math.max(precioSugerido + ajuste, 0);
  const porcentajeAbono = Math.min(Math.max(toNumber_(clean.porcentajeAbono) || 50, 0), 100);
  return Object.assign({}, clean, {
    costosJson: JSON.stringify(costos),
    costoTotal,
    metodoGanancia: metodo,
    porcentajeGanancia: porcentaje,
    valorGanancia: Math.max(precioFinal - costoTotal, 0),
    precioSugerido,
    ajuste,
    precioFinal,
    porcentajeAbono,
    abonoRequerido: Math.round(precioFinal * porcentajeAbono / 100)
  });
}

function validateCotizacion_(clean) {
  if (!clean.clienteId || !findById_("Clientes", clean.clienteId)) throw new Error("Selecciona una clienta válida.");
  if (!clean.descripcion) throw new Error("Describe el vestido o servicio a cotizar.");
  if (toNumber_(clean.precioFinal) <= 0) throw new Error("El precio final debe ser mayor a cero.");
}

function createCotizacion_(cotizacion) {
  setup_();
  const clean = calculateCotizacion_(cotizacion || {});
  validateCotizacion_(clean);
  const id = clean.id || makeId_("cot");
  const existingById = findById_("Cotizaciones", id);
  if (existingById) return { ok: true, message: "Cotización ya registrada", data: { record: existingById } };
  const numero = clean.numero || ("COT-" + today_().replace(/-/g, "") + "-" + id.slice(-4).toUpperCase());
  appendRecord_("Cotizaciones", Object.assign({}, clean, {
    id,
    numero,
    pedidoId: clean.pedidoId || "",
    citaId: clean.citaId || "",
    estado: clean.estado || "borrador",
    vigenciaDias: toNumber_(clean.vigenciaDias) || 15,
    fechaCreacion: today_(),
    fechaActualizacion: today_()
  }));
  return { ok: true, message: "Cotización creada", data: { record: findById_("Cotizaciones", id) } };
}

function updateCotizacion_(id, cotizacion) {
  setup_();
  const current = findById_("Cotizaciones", id);
  if (!id || !current) throw new Error("No se encontró la cotización.");
  const clean = calculateCotizacion_(Object.assign({}, current, cotizacion || {}));
  validateCotizacion_(clean);
  updateRecord_("Cotizaciones", id, Object.assign({}, clean, { fechaActualizacion: today_() }));
  return { ok: true, message: "Cotización actualizada", data: { record: findById_("Cotizaciones", id) } };
}

function deleteCotizacion_(id) {
  setup_();
  if (!id || !findById_("Cotizaciones", id)) return { ok: true, message: "Cotización ya eliminada", data: { id } };
  deleteRecord_("Cotizaciones", id);
  return { ok: true, message: "Cotización eliminada", data: { id } };
}

function createCatalogoCosto_(item) {
  setup_();
  const clean = cleanRecord_(item || {});
  if (!clean.nombre) throw new Error("El nombre del costo es obligatorio.");
  const id = clean.id || makeId_("ins");
  const existingById = findById_("CatalogoCostos", id);
  if (existingById) return { ok: true, message: "Costo ya registrado", data: { record: existingById } };
  appendRecord_("CatalogoCostos", {
    id,
    categoria: clean.categoria || "Materiales",
    nombre: clean.nombre,
    unidad: clean.unidad || "unidad",
    costoUnitario: Math.max(toNumber_(clean.costoUnitario), 0),
    activo: "SI",
    fechaActualizacion: today_()
  });
  return { ok: true, message: "Costo guardado en catálogo", data: { record: findById_("CatalogoCostos", id) } };
}

function updateCatalogoCosto_(id, item) {
  setup_();
  if (!id || !findById_("CatalogoCostos", id)) throw new Error("No se encontró el costo del catálogo.");
  const clean = cleanRecord_(item || {});
  if (!clean.nombre) throw new Error("El nombre del costo es obligatorio.");
  updateRecord_("CatalogoCostos", id, Object.assign({}, clean, { costoUnitario: Math.max(toNumber_(clean.costoUnitario), 0), fechaActualizacion: today_() }));
  return { ok: true, message: "Costo actualizado", data: { record: findById_("CatalogoCostos", id) } };
}

function deleteCatalogoCosto_(id) {
  setup_();
  if (!id || !findById_("CatalogoCostos", id)) return { ok: true, message: "Costo ya eliminado", data: { id } };
  deleteRecord_("CatalogoCostos", id);
  return { ok: true, message: "Costo eliminado", data: { id } };
}

function createCita_(cita) {
  setup_();
  const clean = cleanRecord_(cita || {});
  if (!clean.clienteId || !findById_("Clientes", clean.clienteId)) throw new Error("Selecciona una clienta válida.");
  if (!clean.fecha || !clean.hora) throw new Error("La fecha y la hora son obligatorias.");
  const id = clean.id || makeId_("cita");
  appendRecord_("Citas", {
    id,
    clienteId: clean.clienteId,
    pedidoId: clean.pedidoId,
    tipo: clean.tipo || "Prueba",
    fecha: clean.fecha,
    hora: clean.hora,
    duracion: clean.duracion || "60",
    estado: clean.estado || "programada",
    notas: clean.notas,
    modificaciones: clean.modificaciones,
    fechaRegistro: today_(),
    fechaActualizacion: today_()
  });
  return { ok: true, message: "Cita creada", data: { record: findById_("Citas", id) } };
}

function updateCita_(id, cita) {
  setup_();
  if (!id || !findById_("Citas", id)) throw new Error("No se encontró la cita.");
  const clean = cleanRecord_(cita || {});
  if (!clean.clienteId || !findById_("Clientes", clean.clienteId)) throw new Error("Selecciona una clienta válida.");
  if (!clean.fecha || !clean.hora) throw new Error("La fecha y la hora son obligatorias.");
  updateRecord_("Citas", id, Object.assign({}, clean, { fechaActualizacion: today_() }));
  return { ok: true, message: "Cita actualizada", data: { record: findById_("Citas", id) } };
}

function deleteCita_(id) {
  setup_();
  if (!id || !findById_("Citas", id)) return { ok: true, message: "Cita ya eliminada", data: { id } };
  deleteRecord_("Citas", id);
  return { ok: true, message: "Cita eliminada", data: { id } };
}

function setup_() {
  if (ATELIER_SETUP_READY) return;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty("ATELIER_SCHEMA_VERSION") === ATELIER_SCHEMA_VERSION) {
    ATELIER_SETUP_READY = true;
    return;
  }

  Object.keys(ATELIER_HEADERS).forEach(function(name) {
    const sheet = getOrCreateSheet_(name);
    const headers = ATELIER_HEADERS[name];
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      clearRowsCache_(name);
    } else {
      const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
      const needsHeader = !current[0] || current[0] !== headers[0];
      if (needsHeader) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        clearRowsCache_(name);
      }
      addMissingHeaders_(sheet, headers);
    }
    sheet.setFrozenRows(1);
  });

  const config = readRows_("Configuracion");
  if (!config.length) {
    appendRecord_("Configuracion", {
      clave: "moneda",
      valor: "COP",
      descripcion: "Moneda usada por el sistema"
    });
    appendRecord_("Configuracion", {
      clave: "zonaHoraria",
      valor: Session.getScriptTimeZone(),
      descripcion: "Zona horaria del archivo"
    });
  }

  ATELIER_SETUP_READY = true;
  props.setProperty("ATELIER_SCHEMA_VERSION", ATELIER_SCHEMA_VERSION);
}

function getBook_() {
  const configuredId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (configuredId) return SpreadsheetApp.openById(configuredId);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error("No hay hoja activa. Vincula el script a Google Sheets o configura SPREADSHEET_ID.");
  return active;
}

function getOrCreateSheet_(name) {
  const book = getBook_();
  return book.getSheetByName(name) || book.insertSheet(name);
}

function addMissingHeaders_(sheet, headers) {
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  headers.forEach(function(header) {
    if (current.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      clearRowsCache_(sheet.getName());
    }
  });
}

function readRows_(name) {
  if (ATELIER_ROWS_CACHE[name]) return cloneRows_(ATELIER_ROWS_CACHE[name]);

  const sheet = getOrCreateSheet_(name);
  const headers = ATELIER_HEADERS[name];
  const actualHeaders = getActualHeaders_(sheet);
  if (sheet.getLastRow() <= 1) {
    ATELIER_ROWS_CACHE[name] = [];
    return [];
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, actualHeaders.length).getValues();
  const rows = values
    .filter(function(row) {
      return row.some(function(cell) { return cell !== ""; });
    })
    .map(function(row) {
      return headers.reduce(function(record, header, index) {
        const actualIndex = actualHeaders.indexOf(header);
        let value = actualIndex >= 0 ? row[actualIndex] : "";
        if (ATELIER_DATE_FIELDS.indexOf(header) >= 0) value = formatDate_(value);
        if (ATELIER_NUMERIC_FIELDS.indexOf(header) >= 0) value = toNumber_(value);
        record[header] = value == null ? "" : value;
        return record;
      }, {});
    });
  ATELIER_ROWS_CACHE[name] = rows;
  return cloneRows_(rows);
}

function appendRecord_(name, record) {
  const sheet = getOrCreateSheet_(name);
  const headers = getActualHeaders_(sheet);
  const row = headers.map(function(header) {
    return normalizeValueForSheet_(header, record[header]);
  });
  sheet.appendRow(row);
  clearRowsCache_(name);
  return record;
}

function findById_(name, id) {
  return readRows_(name).filter(function(record) {
    return record.id === id;
  })[0] || null;
}

function findRowIndexById_(name, id) {
  const rows = readRows_(name);
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].id === id) return i + 2;
  }
  return -1;
}

function updateRecord_(name, id, patch) {
  const rowIndex = findRowIndexById_(name, id);
  if (rowIndex < 0) throw new Error("No se encontró el registro: " + id);

  const current = findById_(name, id);
  const updated = Object.assign({}, current, patch, { id });
  const headers = getActualHeaders_(getOrCreateSheet_(name));
  const row = headers.map(function(header) {
    return normalizeValueForSheet_(header, updated[header]);
  });
  getOrCreateSheet_(name).getRange(rowIndex, 1, 1, row.length).setValues([row]);
  clearRowsCache_(name);
  return updated;
}

function deleteRecord_(name, id) {
  const rowIndex = findRowIndexById_(name, id);
  if (rowIndex < 0) throw new Error("No se encontró el registro: " + id);
  getOrCreateSheet_(name).deleteRow(rowIndex);
  clearRowsCache_(name);
}

function deleteWhere_(name, predicate) {
  const rows = readRows_(name);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (predicate(rows[i])) getOrCreateSheet_(name).deleteRow(i + 2);
  }
  clearRowsCache_(name);
}

function clearRowsCache_(name) {
  if (name) {
    delete ATELIER_ROWS_CACHE[name];
    return;
  }
  ATELIER_ROWS_CACHE = {};
}

function cloneRows_(rows) {
  return rows.map(function(row) {
    return Object.assign({}, row);
  });
}

function getActualHeaders_(sheet) {
  const desired = ATELIER_HEADERS[sheet.getName()] || [];
  const width = Math.max(sheet.getLastColumn(), desired.length);
  const headers = sheet.getRange(1, 1, 1, width).getValues()[0]
    .map(function(header) {
      return String(header || "").trim();
    });

  return headers.some(function(header) { return header; }) ? headers : desired;
}

function validatePedido_(pedido) {
  if (!pedido.clienteId) throw new Error("Selecciona una clienta.");
  if (!findById_("Clientes", pedido.clienteId)) throw new Error("La clienta seleccionada no existe.");
  if (!pedido.tipoVestido) throw new Error("El tipo de vestido es obligatorio.");
  if (toNumber_(pedido.valorTotal) <= 0) throw new Error("El valor total debe ser mayor a cero.");
  if (toNumber_(pedido.primerAbono) > toNumber_(pedido.valorTotal)) throw new Error("El primer abono no puede superar el valor total.");
  if (!pedido.fechaEvento) throw new Error("La fecha del evento es obligatoria.");
}

function syncPrimerAbono_(pedido, monto) {
  const pagos = readRows_("Pagos");
  const existing = pagos.filter(function(pago) {
    return pago.pedidoId === pedido.id && String(pago.esPrimerAbono).toUpperCase() === "SI";
  })[0];

  if (monto <= 0 && existing) {
    deleteRecord_("Pagos", existing.id);
    return;
  }

  if (monto <= 0) return;

  const payload = {
    pedidoId: pedido.id,
    clienteId: pedido.clienteId,
    fechaPago: pedido.fechaCreacion || today_(),
    monto,
    metodo: "Transferencia",
    concepto: "Primer abono",
    notas: "Abono inicial registrado desde el pedido",
    esPrimerAbono: "SI",
    fechaRegistro: pedido.fechaCreacion || today_()
  };

  if (existing) updateRecord_("Pagos", existing.id, payload);
  else appendRecord_("Pagos", Object.assign({ id: pedido.primerPagoId || makeId_("pago") }, payload));
}

function updatePagosCliente_(pedidoId, clienteId) {
  readRows_("Pagos").forEach(function(pago) {
    if (pago.pedidoId === pedidoId && pago.clienteId !== clienteId) {
      updateRecord_("Pagos", pago.id, { clienteId });
    }
  });
}

function recalculatePedido_(pedidoId) {
  const pedido = findById_("Pedidos", pedidoId);
  if (!pedido) return;

  const pagos = readRows_("Pagos").filter(function(pago) {
    return pago.pedidoId === pedidoId;
  });
  const pagado = sum_(pagos.map(function(pago) { return pago.monto; }));
  const primer = pagos.filter(function(pago) {
    return String(pago.esPrimerAbono).toUpperCase() === "SI";
  })[0];
  const saldo = Math.max(toNumber_(pedido.valorTotal) - pagado, 0);

  updateRecord_("Pedidos", pedidoId, {
    primerAbono: primer ? toNumber_(primer.monto) : 0,
    saldoPendiente: saldo,
    estadoPago: saldo <= 0 ? "pagado" : "pendiente",
    mesEvento: monthKey_(pedido.fechaEvento),
    fechaActualizacion: today_()
  });
}

function calculateSaldo_(pedidoId, valorTotal) {
  const pagos = readRows_("Pagos").filter(function(pago) {
    return pago.pedidoId === pedidoId;
  });
  return Math.max(valorTotal - sum_(pagos.map(function(pago) { return pago.monto; })), 0);
}

function cleanRecord_(record) {
  return Object.keys(record || {}).reduce(function(clean, key) {
    const value = record[key];
    clean[key] = typeof value === "string" ? value.trim() : value;
    return clean;
  }, {});
}

function normalizeValueForSheet_(header, value) {
  if (ATELIER_NUMERIC_FIELDS.indexOf(header) >= 0) return toNumber_(value);
  if (ATELIER_DATE_FIELDS.indexOf(header) >= 0) return value ? formatDate_(value) : "";
  return value == null ? "" : value;
}

function toNumber_(value) {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  const cleaned = String(value == null ? "" : value).replace(/[^\d.-]/g, "");
  const parsed = Number(cleaned);
  return isFinite(parsed) ? parsed : 0;
}

function sum_(values) {
  return values.reduce(function(total, value) {
    return total + toNumber_(value);
  }, 0);
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function formatDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value).slice(0, 10);
}

function monthKey_(value) {
  const date = new Date(formatDate_(value) + "T00:00:00");
  if (isNaN(date.getTime())) return "";
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function daysUntil_(value) {
  const date = new Date(formatDate_(value) + "T00:00:00");
  if (isNaN(date.getTime())) return 99999;
  const today = new Date(today_() + "T00:00:00");
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function normalize_(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function makeId_(prefix) {
  return prefix + "_" + Utilities.getUuid().replace(/-/g, "").slice(0, 18);
}

function jsonResponse_(payload, callback) {
  const output = Object.assign({ ok: true }, payload);
  const json = JSON.stringify(output);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
