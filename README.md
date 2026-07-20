# Atelier Studio - Sistema web para vestidos personalizados

Sistema web profesional para una diseñadora de modas o atelier que necesita controlar clientas, pedidos de vestidos, fechas de evento, abonos, saldos pendientes y agenda mensual.

## Estructura del entregable

```text
atelier-vestidos/
├── index.html
├── css/
│   ├── variables.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   └── responsive.css
├── js/
│   ├── config.js
│   ├── api.js
│   ├── app.js
│   ├── clientes.js
│   ├── pedidos.js
│   ├── pagos.js
│   ├── agenda.js
│   ├── ui.js
│   └── utils.js
└── appscript/
    └── Code.gs
```

## Estructura exacta de Google Sheets

El archivo de Google Sheets debe tener estas hojas y columnas. El script también puede crearlas automáticamente con la función `setup`.

### Clientes

| Columna | Descripción |
| --- | --- |
| id | ID único de la clienta |
| nombres | Nombres de la clienta |
| apellidos | Apellidos de la clienta |
| nombre | Nombre completo |
| telefono | Teléfono o WhatsApp |
| instagram | Usuario de Instagram |
| correo | Correo electrónico |
| direccion | Dirección |
| notas | Notas internas |
| fechaRegistro | Fecha de creación |

### Pedidos

| Columna | Descripción |
| --- | --- |
| id | ID único del pedido |
| clienteId | ID de la clienta asociada |
| tipoVestido | Tipo de vestido |
| descripcion | Descripción del diseño |
| valorTotal | Valor total del vestido |
| primerAbono | Primer abono registrado |
| saldoPendiente | Saldo calculado |
| fechaEvento | Fecha del evento |
| fechaLimitePago | Fecha límite para pagar |
| fechaEntrega | Fecha de entrega |
| estado | pendiente, diseno, confeccion, prueba, listo, entregado, cancelado |
| estadoPago | pagado o pendiente |
| notasInternas | Notas del atelier |
| referencias | Links de fotos o referencias |
| mesEvento | Mes calculado en formato YYYY-MM |
| fechaCreacion | Fecha de creación |
| fechaActualizacion | Última actualización |

### Pagos

| Columna | Descripción |
| --- | --- |
| id | ID único del pago |
| pedidoId | ID del pedido |
| clienteId | ID de la clienta |
| fechaPago | Fecha del abono |
| monto | Valor pagado |
| metodo | Método de pago |
| concepto | Primer abono, abono, saldo final, etc. |
| notas | Observaciones |
| esPrimerAbono | SI o NO |
| fechaRegistro | Fecha de registro |

### Citas

| Columna | Descripción |
| --- | --- |
| id | ID único de la cita |
| clienteId | Clienta asociada |
| pedidoId | Pedido relacionado, si aplica |
| tipo | Primera cita, toma de medidas, prueba o entrega |
| fecha | Día de la cita |
| hora | Hora de inicio |
| duracion | Duración estimada en minutos |
| estado | programada, confirmada, realizada o cancelada |
| notas | Indicaciones para la cita |
| modificaciones | Ajustes solicitados o pendientes detectados en la cita |
| fechaRegistro | Fecha de creación |
| fechaActualizacion | Última actualización |

### Configuracion

| Columna | Descripción |
| --- | --- |
| clave | Nombre del ajuste |
| valor | Valor |
| descripcion | Descripción |

### Cotizaciones y catálogo de costos

El despliegue actualizado crea también las hojas `Cotizaciones` y `CatalogoCostos`. La primera conserva la hoja de costos, el método de ganancia, el precio final, el abono y el estado de cada propuesta. La segunda guarda telas, insumos, mano de obra y servicios frecuentes para reutilizarlos sin afectar cotizaciones anteriores.

El flujo recomendado es: `Primera cita > Cotizar > Hoja de costos > PDF > Aceptar > Crear pedido`.

## Cómo desplegar Apps Script

1. Crea un Google Sheet nuevo para el atelier.
2. Abre `Extensiones > Apps Script`.
3. Reemplaza el contenido de `Code.gs` con el archivo `appscript/Code.gs` de este entregable.
4. Guarda el proyecto.
5. Ejecuta la función `setup` una vez y autoriza permisos.
6. Verifica que se hayan creado las hojas `Clientes`, `Pedidos`, `Pagos`, `Citas`, `Cotizaciones`, `CatalogoCostos` y `Configuracion`.
7. Ve a `Implementar > Nueva implementación`.
8. Tipo: `Aplicación web`.
9. Ejecutar como: `Yo`.
10. Quién tiene acceso: `Cualquier usuario con el enlace`.
11. Implementa y copia la URL que termina en `/exec`.

### Configurar el login privado

El endpoint puede ser público porque todas las operaciones, excepto `ping`, exigen una sesión válida del login propio del sistema. La contraseña se guarda como un hash con salt en las propiedades privadas de Apps Script; no queda en GitHub ni en el navegador.

1. Crea el Sheet y el proyecto Apps Script desde `atelierkarenvargas@gmail.com`.
2. Implementa el web app para ejecutar como `Yo` y permite acceso a `Cualquier usuario`.
3. Ingresa con el usuario privado entregado al propietario del sistema. La contraseña predeterminada no se documenta ni se guarda como texto en el repositorio.
4. Si deseas cambiarla, recarga el Sheet y usa `Atelier > Configurar contraseña`.
5. Usa `Cerrar todas las sesiones` si cambias la contraseña, pierdes un dispositivo o necesitas revocar accesos.

El login bloquea durante 15 minutos después de cinco intentos incorrectos y cada sesión válida dura 30 días. No compartas la contraseña ni la guardes dentro del código.

Si ya tenías el sistema desplegado y cambiaste `Code.gs`, debes crear una nueva implementación o editar la implementación actual con una nueva versión. Si no haces esto, Google Sheets puede seguir usando el código anterior aunque el archivo se vea actualizado en el editor.

## Cómo conectar el frontend

Abre `js/config.js` y pega la URL del despliegue:

```js
window.ATELIER_CONFIG = {
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec",
  USE_DEMO_DATA_WHEN_EMPTY: true,
  LOCALE: "es-CO",
  CURRENCY: "COP",
  REQUEST_TIMEOUT_MS: 18000,
  CACHE_KEY: "atelierStudio.cache.v1",
  DEMO_STORAGE_KEY: "atelierStudio.demo.v1"
};
```

Si `APPS_SCRIPT_URL` está vacío, la app funciona en modo demostración con datos guardados en el navegador. Eso permite probar la interfaz y vender la solución antes de conectar la hoja real.

## Cómo probar que todo funciona

1. Abre `index.html` en el navegador.
2. Confirma que el dashboard muestre métricas y alertas.
3. Crea una clienta nueva en `Clientas`.
4. Crea un pedido para esa clienta en `Pedidos`.
5. Registra un primer abono y luego otro abono desde `Pagos`.
6. Verifica que el saldo pendiente se recalcula automáticamente.
7. Cambia el estado del pedido a `listo` o `entregado`.
8. Ve a `Agenda` y filtra por mes, estado y saldo pendiente.
9. Recarga la página y confirma que los datos siguen disponibles.
10. Si ya conectaste Apps Script, abre Google Sheets y confirma que se escribieron las filas.

## Notas de mantenimiento

- No cambies los nombres de las hojas ni los encabezados.
- El frontend usa JavaScript puro y está separado por módulos de negocio.
- El backend recalcula saldos desde la hoja `Pagos`; no depende de valores escritos manualmente.
- Las operaciones de creación usan IDs generados desde el navegador para evitar duplicados si Apps Script guarda pero la respuesta tarda o falla.
- Después de guardar, el backend devuelve una respuesta ligera; la app actualiza la vista local y puede sincronizar Google Sheets en segundo plano.
- La app muestra datos en caché al iniciar, si existen, y luego actualiza desde Google Sheets.
- Las listas grandes se renderizan por bloques máximos configurables en `js/config.js` para que la interfaz no se vuelva lenta con muchos registros.
- El primer abono se guarda como pago con `esPrimerAbono = SI`.
- Si cambias el primer abono desde el formulario del pedido, el pago inicial se sincroniza.
- Eliminar una clienta elimina sus pedidos y pagos asociados.
- Eliminar un pedido elimina sus pagos asociados.
