window.AtelierUtils = (() => {
  const config = window.ATELIER_CONFIG;

  const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const ORDER_STATUSES = [
    { value: "pendiente", label: "Pendiente", tone: "neutral" },
    { value: "diseno", label: "En diseño", tone: "info" },
    { value: "confeccion", label: "En confección", tone: "warning" },
    { value: "prueba", label: "Prueba", tone: "rose" },
    { value: "listo", label: "Listo", tone: "success" },
    { value: "entregado", label: "Entregado", tone: "paid" },
    { value: "cancelado", label: "Cancelado", tone: "danger" }
  ];

  const PAYMENT_METHODS = [
    "Efectivo", "Transferencia", "Nequi", "Daviplata", "Tarjeta", "Otro"
  ];

  const moneyFormatter = new Intl.NumberFormat(config.LOCALE, {
    style: "currency",
    currency: config.CURRENCY,
    maximumFractionDigits: 0
  });

  const dateFormatter = new Intl.DateTimeFormat(config.LOCALE, {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const dayFormatter = new Intl.DateTimeFormat(config.LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const cleaned = String(value ?? "").replace(/[^\d.-]/g, "");
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatMoneyInput(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function parseMoneyInput(value) {
    const digits = String(value ?? "").replace(/\D/g, "");
    return digits ? Number(digits) : 0;
  }

  function createId(prefix) {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${random}`;
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, empty = "Sin fecha") {
    const date = parseDate(value);
    return date ? dateFormatter.format(date) : empty;
  }

  function formatDay(value) {
    const date = parseDate(value);
    return date ? dayFormatter.format(date).replace(".", "") : "Sin fecha";
  }

  function formatCurrency(value) {
    return moneyFormatter.format(toNumber(value));
  }

  function getMonthKey(value) {
    const date = parseDate(value);
    if (!date) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function getMonthNameFromKey(key) {
    if (!key) return "Sin mes";
    const [year, month] = key.split("-");
    const monthIndex = Number(month) - 1;
    return `${MONTHS[monthIndex] || "Sin mes"} ${year || ""}`.trim();
  }

  function getStatusMeta(status) {
    return ORDER_STATUSES.find((item) => item.value === status) || ORDER_STATUSES[0];
  }

  function getClientName(clientes, clienteId) {
    const client = clientes.find((item) => item.id === clienteId);
    return client ? client.nombre : "Clienta sin asignar";
  }

  function getClient(clientes, clienteId) {
    return clientes.find((item) => item.id === clienteId) || null;
  }

  function sum(values) {
    return values.reduce((total, value) => total + toNumber(value), 0);
  }

  function getPaymentsForOrder(pagos, pedidoId) {
    return pagos.filter((pago) => pago.pedidoId === pedidoId);
  }

  function getInitialPayment(pagos, pedidoId) {
    const payment = pagos.find((pago) => pago.pedidoId === pedidoId && String(pago.esPrimerAbono).toUpperCase() === "SI");
    return payment ? toNumber(payment.monto) : 0;
  }

  function enrichOrder(order, clientes, pagos) {
    const orderPayments = getPaymentsForOrder(pagos, order.id);
    const pagado = sum(orderPayments.map((payment) => payment.monto));
    const valorTotal = toNumber(order.valorTotal);
    const saldo = Math.max(valorTotal - pagado, 0);
    const mesEvento = order.mesEvento || getMonthKey(order.fechaEvento);
    const cliente = getClient(clientes, order.clienteId);

    return {
      ...order,
      valorTotal,
      primerAbono: getInitialPayment(pagos, order.id) || toNumber(order.primerAbono),
      pagoTotal: pagado,
      saldoPendiente: saldo,
      mesEvento,
      estadoPago: saldo <= 0 ? "pagado" : "pendiente",
      clientaNombre: cliente ? cliente.nombre : "Clienta sin asignar",
      clientaTelefono: cliente ? cliente.telefono : "",
      clientaInstagram: cliente ? cliente.instagram : ""
    };
  }

  function daysUntil(value) {
    const date = parseDate(value);
    if (!date) return null;
    const today = parseDate(todayISO());
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  }

  function isWithinNextDays(value, days) {
    const diff = daysUntil(value);
    return diff !== null && diff >= 0 && diff <= days;
  }

  function isPast(value) {
    const diff = daysUntil(value);
    return diff !== null && diff < 0;
  }

  function isThisWeek(value) {
    const diff = daysUntil(value);
    return diff !== null && diff >= 0 && diff <= 7;
  }

  function compareByDate(a, b, field) {
    const da = parseDate(a[field]);
    const db = parseDate(b[field]);
    return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
  }

  function groupBy(items, getKey) {
    return items.reduce((groups, item) => {
      const key = getKey(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
      return groups;
    }, {});
  }

  function matchesSearch(values, query) {
    if (!query) return true;
    const haystack = normalize(values.filter(Boolean).join(" "));
    return haystack.includes(normalize(query));
  }

  function debounce(fn, wait = 180) {
    let timeout;
    return (...args) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), wait);
    };
  }

  function readStorage(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  return {
    MONTHS,
    ORDER_STATUSES,
    PAYMENT_METHODS,
    escapeHtml,
    normalize,
    toNumber,
    formatMoneyInput,
    parseMoneyInput,
    createId,
    todayISO,
    parseDate,
    formatDate,
    formatDay,
    formatCurrency,
    getMonthKey,
    getMonthNameFromKey,
    getStatusMeta,
    getClientName,
    sum,
    getPaymentsForOrder,
    getInitialPayment,
    enrichOrder,
    daysUntil,
    isWithinNextDays,
    isPast,
    isThisWeek,
    compareByDate,
    groupBy,
    matchesSearch,
    debounce,
    readStorage,
    writeStorage,
    clone
  };
})();
