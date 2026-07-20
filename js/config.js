window.ATELIER_CONFIG = {
  // Pega aquí la URL /exec de tu despliegue de Google Apps Script.
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzbSkHlXl409K4bAvbJzVZtwchNouQ5Cuw_xHvth_EQH-_3tj9VapUo2bp4mq_WMB4J8w/exec",

  // Si la URL está vacía, la app usa datos locales para probar todo el CRUD.
  USE_DEMO_DATA_WHEN_EMPTY: true,
  JSONP_FALLBACK: false,
  JSONP_MAX_URL_LENGTH: 1800,

  LOCALE: "es-CO",
  CURRENCY: "COP",
  TIME_ZONE: "America/Bogota",
  REQUEST_TIMEOUT_MS: 18000,
  CACHE_KEY: "atelierStudio.cache.v3",
  SESSION_STORAGE_KEY: "atelierStudio.session.v1",
  DEMO_STORAGE_KEY: "atelierStudio.demo.v1",

  MAX_CLIENT_CARDS: 120,
  MAX_ORDER_ROWS: 160,
  MAX_PAYMENT_ROWS: 180,
  MAX_AGENDA_EVENTS: 220
};
