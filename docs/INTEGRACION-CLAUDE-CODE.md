# Integración frontend — backend V1

Backend en rama de misión; no mergeado ni desplegado por esta tarea. El frontend sigue siendo responsabilidad de Claude Code. Esta guía no modifica `apps/web`.

## Contrato y entorno

Contrato consumible: [OpenAPI 3.1](api/openapi.json). `pnpm --dir apps/api api:generate` regenera desde los schemas de validación y definiciones DTO; `tests/openapi.test.ts` valida formato, rutas, permisos, ejemplos y sincronización. Los ejemplos usan identificadores ilustrativos; crear los recursos y reemplazar IDs antes de invocar endpoints.

Recursos bajo `/api/v1`, mensajes en español. Listados `{data:[],pagination:{page,pageSize,total}}`, tamaño <=100. Detalles `{data:...}`. Errores `{error:{code,message,details?}}`. Decimales como strings: NO convertir a Number para cálculos ni reconstruir presupuesto en el cliente. Fechas ISO UTC; convertir solo para presentación local. PDF/CSV/XLSX devuelven binario con Content-Disposition. Sin campos económicos en los DTO operativos para Jefe de Obra.

## Sesión same-origin

Implementar un rewrite/proxy server-side en Vercel. Ejemplo orientativo a incorporar por Claude en su PR:

```ts
// apps/web/next.config.ts (ejemplo documental; no aplicado)
const apiBase = process.env.API_BASE_URL;
const config = {
  async rewrites() {
    if (!apiBase) throw new Error('API_BASE_URL requerida');
    return [{ source: '/api/v1/:path*', destination: `${apiBase}/api/v1/:path*` }];
  },
};
export default config;
```

`API_BASE_URL` es variable server-side del frontend. Railway debe tener `APP_ORIGIN` igual al origen HTTPS exacto de la web. Se verificó que actualmente falta esa variable: configurarla sólo en el despliegue autorizado. No usar comodines ni apuntar previews con escrituras a producción. Local: frontend3000, API3001, APP_ORIGIN=http://localhost:3000. `pnpm dev:api` usa3001; DATABASE_URL sólo API. No exponer credenciales PostgreSQL en Vercel.

La web llama `fetch('/api/v1/...',{credentials:'same-origin',...})`. Login POST `{email,password}` emite `ceo_session` sin Domain, HttpOnly, SameSite=Lax y Secure en producción; expiración12h. Logout revoca sesión en DB y borra cookie. GET `/auth/me` entrega usuario seguro y rol;401 requiere login. No almacenar tokens en localStorage ni leer cookie desde JS. El proxy debe preservar Origin, Sec-Fetch-Site, Cookie, Set-Cookie y Content-Disposition; no cachear respuestas autenticadas. Mutaciones requieren Origin exacto; faltante/incorrecto403. No confiar en Host/X-Forwarded-Host enviados por cliente. No se habilita CORS cross-origin ni cookies de terceros.

## Matriz inicial conservadora (V-02 pendiente)

| Acción | Gerencia | Compras | Cómputo | Jefe de obra |
|---|---|---|---|---|
| Administrar usuarios/asignaciones/obras/ubicaciones | Sí | No | No | No |
| Leer obras, ubicaciones, catálogo material, stock | Todas | Todas | Todas | Sólo obras/ubicaciones asignadas; catálogo sin precios |
| Editar materiales/presentaciones | Sí | Sí | Sí | No |
| Editar proveedores | Sí | Sí | No | No |
| Editar rubros/unidades/APU/cómputos/presupuestos | Sí | No | Sí | No |
| Leer información económica | Sí | Sí | Sí | Nunca |
| Seleccionar versión referencia | Sí | No | No | No |
| Crear pedidos | Sí | Sí | No | Sólo obra asignada |
| Procesar pedidos/cotizar/seleccionar/emitir OC/factura referencia | Sí | Sí | No | No |
| Leer OC | Sí | Sí | Sí | DTO reducido, obra asignada y destino físico en ella |
| Confirmar recepción | Sí | Sí | No | Sólo OC/ubicación autorizadas |
| Reservar/cancelar/transferir/configurar mínimos | Sí | Sí | No | No |
| Consumo/devolución | Sí | Sí | No | Sólo origen en su obra |
| Inicial/ajustes/importaciones/auditoría global | Sí | No | No | No |
| Informes cantidades/Excel | Sí | Sí | Sí | Sólo su obra |

El backend comprueba roles y recursos en cada ruta. Ocultar controles en UI ayuda a operar pero no concede permisos. APU/cómputos/versiones completas, proveedores, precios, cotizaciones, PDF OC y exports económicos rechazan JEFE_OBRA. Para previstos usar `/budget-versions/{id}/materials`, que omite snapshot económico. Historial de pedido es accesible por obra; historial OC sólo roles económicos. OpenAPI detalla x-roles por operación y restricciones según tipo de movimiento.

## Flujo recomendado

1. Gerencia crea unidades/rubros, obras (crean ubicación asociada), galpón/patio y asignaciones. Sin límites artificiales de obras/materiales.
2. Catálogo separa material, unidad base inmutable y presentación con equivalencia explícita. Precios son historial append-only; no aceptar una equivalencia desconocida ni precio cero como referencia válida. Una presentación se crea nueva para cambiar equivalencia histórica.
3. Cómputo crea APU con consumo manual y MO unitaria; carga cantidades; crea presupuesto y versiones con moneda, base impositiva, precisión, modo y frontera de redondeo explícitos. Sobrescrituras sólo en versión nueva. Cambiar precios/APU no reescribe snapshots.
4. Gerencia selecciona referencia de seguimiento. El nombre REFERENCE no implica aprobación económica validada con CEO. Estados y responsables definitivos siguen V-02/V-03.
5. Jefe crea pedido con rubro, fecha requerida y cantidades; `/requests/{id}/needs` compara previsto/solicitado/disponible. El pedido no mueve físico.
6. Compras reserva existencias o registra cotizaciones; comparación no ordena monedas/bases incompatibles. Selección manual auditada. OC borrador permite correcciones; emitida fija líneas. Una compra general requiere galpón/patio y no lleva obra. Precio por presentación usa baseQuantity explícita; cantidades siempre en unidad base.
7. Recepción parcial con remito, cantidades y Idempotency-Key ingresa stock una sola vez y actualiza pendiente en misma transacción. El número de factura es referencia textual independiente, con actor/hora automática de carga; no indica fecha de pago.
8. Transferencia POST es confirmación efectiva: origen baja, destino sube, reserva se satisface sólo por lo trasladado. Consumo baja el físico en obra. Devolución sale de obra a galpón/patio. INITIAL sólo apertura única; recuentos posteriores son ajustes con motivo de Gerencia. Disponible=físico-reservado. No stock negativo.
9. `/stock` muestra saldos registrados; `/stock/alerts` incluye pares sin movimientos cuando el mínimo configurado supera disponible0. Override de ubicación0 desactiva allí el mínimo heredado del material. No reposición automática.
10. Informes separan previsto/pedido/comprado/recibido/consumido/disponible. Sin referencia: previsto/desvíos null; filtrar rubro no atribuye stock compartido, devuelve null con explicación. Operaciones sin rubro histórico sólo total de obra. Exportar informe completo vía `/reports/materials/export`.

## Reintentos y errores

Conservar una clave UUID por intención confirmada para OC, reservas, movimientos, recepción e importación commit. Reutilizar mismo cuerpo/clave tras timeout; cambiar cuerpo requiere nueva intención. Recepciones deduplican por OC+evento entre receptores autorizados; los demás por actor+alcance. Confirmaciones distintas de un mismo remito necesitan conservar la misma clave del evento: el texto libre de remito no se usa como identificador único porque puede compartirse entre entregas.

409 indica stock insuficiente, transición inválida, clave con otro cuerpo o concurrencia agotada. Mostrar mensaje y refrescar datos; en error de transporte, reintentar con la MISMA clave.422 muestra errores por campo/fila;401 sesión ausente/vencida;403 permisos u Origin;429 esperar ventana de intentos. No presentar500 como éxito.

Los contratos de cálculo requieren datos explícitos; V-01 sigue pendiente y el motor no certifica la correspondencia con un presupuesto real de CEO hasta cotejar archivo/unidades/IVA/redondeos. PDF de OC no calcula IVA; importes con fracción que requiere política de redondeo se expresan como fórmula, sin total final inventado. No agregar simulaciones de facturación, beneficio ni avance financiero.
