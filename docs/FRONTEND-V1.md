# Frontend V1 — CEO Construcciones

Rama `claude/ceo-v1-frontend`, basada en `codex/ceo-v1-backend` (PR#1). Implementación en `apps/web` (Next.js 15 App Router, React 19, TypeScript). No modifica `apps/api`, Prisma ni migraciones. No hubo despliegues.

## Arquitectura

- **Design system propio** derivado de la demo `ceo-obras-demo.html` (tokens `#223B7B`, `#16285A`, `#2F5BEA`, `#F3F5F9`, `#141A2E`; Manrope + IBM Plex Mono vía `next/font`). Estilos en `app/globals.css`, componentes en `components/ui.tsx`, iconos `lucide-react`. Sin otra librería de UI.
- **Shell**: sidebar por rol en desktop; barra inferior + menú completo en celular (<820px). Tablas se convierten en tarjetas en móvil.
- **Proxy same-origin** `app/api/v1/[...path]/route.ts` → `lib/proxy.ts`: reenvía a `API_BASE_URL` (sólo servidor) las cabeceras `Origin`, `Sec-Fetch-Site`, `Cookie`, `Idempotency-Key`, `Content-Type`, `Accept`; nunca `Host`/`X-Forwarded-*`. Devuelve cada `Set-Cookie` con `append` independiente (`getSetCookie()`), `Content-Disposition`, `Retry-After`, y fuerza `Cache-Control: no-store, private`. Sin `NEXT_PUBLIC_*` ni secretos en la web.
- **Cliente API** `lib/api.ts` tipado desde `lib/openapi.d.ts` (generado de `docs/api/openapi.json` con `pnpm --dir apps/web api:types`). Errores `{error:{code,message,details}}` → `ApiError` (status, code, details, retryAfter). 401 global redirige a `/login?next=`.
- **Sesión** `lib/session.tsx`: `GET /auth/me` al cargar, login `POST /auth/login`, logout `POST /auth/logout`. Sin localStorage ni lectura de cookies desde JS.
- **Permisos UI** `lib/permissions.ts` replica la matriz conservadora de `INTEGRACION-CLAUDE-CODE.md`. Si el rol no tiene permiso, la pantalla no llama al endpoint. El backend sigue siendo la autoridad.
- **Decimales** como texto en todo el flujo (`lib/format.ts`): formato es-AR sin `Number()`, entrada con coma decimal hasta 8 decimales. Totales, saldos y disponibilidades vienen siempre del backend.
- **Idempotencia** `useMutation` (`lib/hooks.ts`): una clave UUID por intención confirmada; se conserva ante error de transporte (reintento seguro con el mismo cuerpo) y se renueva tras éxito o error de negocio. Se usa en OC, reservas, movimientos, recepciones y commit de importaciones. Previene doble clic.

## Pantallas

| Módulo | Rutas |
| --- | --- |
| Base | `/login`, `/` (inicio por rol; Jefe con accesos rápidos) |
| Obras | `/obras`, `/obras/[id]` (ubicación, asignados, accesos a presupuesto/pedidos/stock/reportes) |
| Catálogo | `/materiales`, `/materiales/[id]` (presentaciones, historial de precios), `/catalogo` (rubros/unidades), `/proveedores`, `/proveedores/[id]`, `/proveedores/precios` |
| Presupuesto | `/apu`, `/apu/nuevo`, `/apu/[id]` (costo calculado por backend), `/computos[/nuevo|/[id]]`, `/presupuestos[/nuevo|/[id]]`, `/presupuestos/versiones/[id]` (costos, materiales necesarios, comparación de versiones, referencia) |
| Compras | `/pedidos`, `/pedidos/nuevo` (asistente móvil), `/pedidos/[id]` (necesidades, historial, estado), `/cotizaciones`, `/cotizaciones/[requestId]` (ofertas, comparación, selección), `/ordenes`, `/ordenes/nueva` (desde cotización, desde pedido o general), `/ordenes/[id]` (borrador, emisión/anulación, PDF, historial, factura), `/recepciones`, `/recepciones/[orderId]` |
| Inventario | `/stock`, `/stock/alertas`, `/stock/reservas`, `/stock/movimientos`, `/stock/movimientos/nuevo` (transferencia, consumo, devolución, ajuste, inicial) |
| Informes | `/reportes` (previsto/pedido/comprado/recibido/consumido/disponible, desvíos, Excel) |
| Administración | `/admin/usuarios`, `/admin/ubicaciones`, `/admin/auditoria`, `/admin/importaciones` (plantillas, preview, errores por fila, commit, exportaciones) |

## Guía de uso por rol

- **Gerencia**: acceso completo. Da de alta unidades/rubros, obras, galpón/patio y usuarios con sus obras asignadas (Administración → Usuarios: asignar obras; ser "responsable" de una obra no otorga acceso). Elige la versión de referencia de cada obra, registra ajustes y apertura inicial de stock, importa catálogos y consulta auditoría.
- **Compras**: procesa pedidos (estado), carga cotizaciones y las compara (sin ranking si monedas/bases difieren), selecciona manualmente, genera y emite OC (de obra o generales a galpón/patio), descarga PDF, registra número de factura, recibe mercadería, reserva, transfiere y configura mínimos.
- **Cómputo y Presupuestos**: arma APU (materiales con consumo por unidad y mano de obra unitaria; admite sólo mano de obra), cómputos por obra y presupuestos con versiones inmutables y criterios explícitos de moneda/IVA/redondeo; consulta materiales necesarios.
- **Jefe de Obra** (pensado para celular): ve sólo sus obras. Inicio con accesos a Nuevo pedido, Recepciones, Stock y Consumo/devolución. Crea pedidos en 5 pasos con controles táctiles, confirma recepciones de OC destinadas a su obra, registra consumos y consulta stock y reportes de cantidades. No ve precios, costos, proveedores, cotizaciones ni PDF de OC.

## Desarrollo y pruebas locales (sin Railway)

```bash
pnpm install --frozen-lockfile
# PostgreSQL 18 aislado (ej. Homebrew postgresql@18 en un puerto libre, base con "test" en el nombre)
export DATABASE_URL=postgresql://ceo_test@127.0.0.1:55440/ceo_v1_frontend_test
pnpm --filter @ceo/api db:generate && pnpm --filter @ceo/api db:deploy
# primer usuario: ver OPERACION-BACKEND.md (bootstrap). Otros usuarios sintéticos desde Administración → Usuarios.
APP_ORIGIN=http://localhost:3000 pnpm dev:api          # :3001
cp apps/web/.env.example apps/web/.env.local            # API_BASE_URL=http://localhost:3001
pnpm dev:web                                            # :3000
```

Verificación:

```bash
pnpm --dir apps/web typecheck
pnpm --dir apps/web test                 # unitarias/componentes aislados (proxy con upstream simulado, formatos, permisos)
pnpm --dir apps/web build
E2E_SECRETS_DIR=<dir con *.pw> apps/web/scripts/e2e-local.sh   # E2E Playwright contra API y PostgreSQL reales
```

Los datos de prueba son sintéticos (`*@demo.local`, "Obra Demo …", "Corralón Demo …"). No usar credenciales reales de CEO. Las pruebas unitarias (`tests/`) son aisladas; las de `e2e/` corren contra la API real local y se informan por separado.

## Activación en Vercel (cuando Railway esté disponible y se autorice)

1. Revisar y mergear PR#1 (backend) y luego este PR, en ese orden, con autorización explícita.
2. Railway (API): aplicar migraciones con backup previo verificado; configurar `APP_ORIGIN` = origen HTTPS exacto de la web en Vercel (sin comodines ni path). Confirmar `/api/health` 200.
3. Vercel (proyecto `ceo-construcciones-web`): Root Directory `apps/web`; variable **server-side** `API_BASE_URL` = URL pública HTTPS de la API Railway (sin `/api/v1`), sólo en Production. No configurar `DATABASE_URL` ni ningún secreto. Para Preview, dejar `API_BASE_URL` sin definir (el proxy responde 503 controlado) o apuntarla a una API de staging con base no productiva; nunca a producción.
4. Desplegar y validar con el dominio público real: login (dos `Set-Cookie` separados en la respuesta), `/auth/me` tras recarga, 401 al vencer, 429 con `Retry-After`, mutación con Origin correcto, descarga de PDF/Excel, logout, y `Cache-Control: no-store` en `/api/v1/*`.
5. Crear usuarios reales desde Administración y asignar obras; recién entonces piloto.

## Diferencias y pendientes de contrato (para Codex)

Ningún punto fue ocultado con datos ficticios; la UI aplica el comportamiento conservador indicado.

1. **Devolución por Jefe sin destino visible** — `GET /locations` no devuelve galpón/patio a JEFE_OBRA, aunque `POST /movements` RETURN lo admite. La UI le indica pedirla a Compras/Gerencia. Propuesta: exponer ubicaciones WAREHOUSE/YARD activas (id, código, nombre, tipo) al Jefe.
2. **Nombres de ubicación/usuario** — `/movements` sólo trae ids de ubicación (Jefe ve "Ubicación sin acceso"); `/users` es sólo Gerencia, por lo que otros roles ven "Usuario" en historiales/factura/recepciones. Propuesta: incluir `source/destination {code,name}` y `actorName` en los DTO.
3. **Errores 422** — `details` llega como `{formErrors, fieldErrors}` (Zod flatten), no como el array descrito. La UI soporta ambos; documentar en OpenAPI.
4. **Filtros faltantes** — `GET /requests` y `/purchase-orders` sin `status`; `GET /works` sin `q`; `GET /suppliers` ignora `search`; `GET /materials` sin `active`; `GET /audit` sólo `entity/entityId` (sin actor/acción/fechas; `entity` no enumerado). Los filtros afectados se aplican sobre la página cargada y así se indica en pantalla.
5. **`pendingQuantity`** sólo en `ChiefOrder`; falta en `PurchaseOrderLine` para roles económicos (la UI no lo calcula: muestra pedido/recibido).
6. **Importes de línea/total de OC** no vienen en `OrderDetail`; la UI no los calcula y remite al PDF. Propuesta: `lineAmount` del backend.
7. **Referencia de presupuesto para Jefe** — no hay endpoint no económico para saber la versión de referencia de una obra; el Jefe ve lo previsto en `/requests/{id}/needs` tras crear el pedido, y el reporte sólo admite `versionId` por URL. Propuesta: `referenceVersionId` en `WorkDetail`.
8. **`/budget-versions/{id}/materials`** sólo devuelve ids; la UI resuelve nombres con catálogos.
9. **`POST /prices` sin presentación** exige `baseQuantity=1` (no documentado). **`MaterialPatch.unitId`** figura en el schema pero siempre responde 409. **`Material`** devuelve `unit`/`category` anidados no declarados (`additionalProperties:false`).
10. **`ApuInput.laborCost`** es obligatorio (la UI envía "0" si se deja vacío); si debe ser opcional, aceptar `null`.
11. **Mínimo heredado vs. propio** — `Stock.minimum` no indica su origen. Propuesta: `minimumSource`.
12. **Recepciones** no figuran en `/purchase-orders/{id}/history` (se muestran aparte). **Comparación** de cotizaciones sin orden declarado. **`alreadyRequested`** incluye el propio pedido (aclarado en UI). No hay bloqueo de OC duplicada por pedido/cotización.
13. **Preview de importaciones** devuelve `rowCount` y errores (fila 1 = primera fila de datos), no filas normalizadas; la vista previa usa el CSV local. Auditoría de `UPDATE Work` registra `before: null`.
14. **`PATCH /computations`** regenera ids de línea; las sobrescrituras de versiones antiguas referencian líneas inexistentes (no rompe snapshots). `POST /budgets/{id}/versions` no declara `Idempotency-Key`.
