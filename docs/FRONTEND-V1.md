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
DATABASE_URL=<base aislada test> apps/web/scripts/e2e-ci.sh   # E2E reproducible: build, seed y Playwright contra API y PostgreSQL reales
```

Los datos de prueba son sintéticos (`*@demo.local`, "Obra Demo …", "Corralón Demo …"). No usar credenciales reales de CEO. Las pruebas unitarias (`tests/`) son aisladas; las de `e2e/` corren contra la API real local y se informan por separado.

## Activación en Vercel (cuando Railway esté disponible y se autorice)

1. Revisar y mergear PR#1 (backend) y luego este PR, en ese orden, con autorización explícita.
2. Railway (API): aplicar migraciones con backup previo verificado; configurar `APP_ORIGIN` = origen HTTPS exacto de la web en Vercel (sin comodines ni path). Confirmar `/api/health` 200.
3. Vercel (proyecto `ceo-construcciones-web`): Root Directory `apps/web`; variable **server-side** `API_BASE_URL` = URL pública HTTPS de la API Railway (sin `/api/v1`), sólo en Production. No configurar `DATABASE_URL` ni ningún secreto. Para Preview, dejar `API_BASE_URL` sin definir (el proxy responde 503 controlado) o apuntarla a una API de staging con base no productiva; nunca a producción.
4. Desplegar y validar con el dominio público real: login (dos `Set-Cookie` separados en la respuesta), `/auth/me` tras recarga, 401 al vencer, 429 con `Retry-After`, mutación con Origin correcto, descarga de PDF/Excel, logout, y `Cache-Control: no-store` en `/api/v1/*`.
5. Crear usuarios reales desde Administración y asignar obras; recién entonces piloto.

## Estado de los 14 hallazgos (issue #3)

Resoluciones backend en [CIERRE-INTEGRACION-V1.md](CIERRE-INTEGRACION-V1.md) (commit `2d6942c`); adaptación frontend en este PR.

| Nº | Hallazgo | Estado frontend |
| --- | --- | --- |
| 1 | Devolución del Jefe sin destino | **Resuelto.** RETURN elige galpón/patio activos de `/locations`; flujo móvil obra → material → destino → cantidad → confirmación → tarjeta "Movimiento registrado". No consulta stock de galpón/patio para el Jefe. E2E móvil. |
| 2 | Nombres de ubicaciones/actores | **Resuelto.** `source/destination`, `actorName`, `createdByName`, `invoiceLoadedByName` (sólo roles económicos) y `location` de recepciones. Sin `/users` fuera de Gerencia salvo `requestedById`/`selectedById` (ver abiertos). Ubicaciones ajenas: "Ubicación no visible". |
| 3 | Errores 422 | **Resuelto.** `fieldErrors()`/`ErrorBox` aceptan issues Zod y flatten; errores sin campo visible se muestran. |
| 4 | Filtros de servidor | **Resuelto.** Pedidos/cotizaciones/OC `status` (+OC `requestId/quotationId/destinationId/supplierId/workId`), obras `q/status`, proveedores `search/active`, materiales `search/categoryId/active`, auditoría `entity/entityId/actorId/action/from/to`. Sin filtros locales sobre la página; totales del servidor. |
| 5 | `pendingQuantity` OC | **Resuelto.** Para todos los roles; "Recibir todo lo pendiente" usa el valor del servidor. |
| 6 | Importes OC | **Resuelto.** `lineAmount`/`totalAmount` del servidor; con `ROUNDING_POLICY_REQUIRED` o null: "Importe no calculado: falta definir política de redondeo (validación CEO pendiente)". Sin cálculo ni IVA en JS. **Política de redondeo/IVA: depende de CEO (V-01).** |
| 7 | Referencia para Jefe | **Resuelto.** `WorkDetail.referenceVersionId` en obra, pedido nuevo (previstos antes de crear), reportes y presupuestos. |
| 8 | Materiales de versión | **Resuelto.** Usa `material/unit/category` incluidos. |
| 9 | Precios/unidad/Material | **Resuelto.** Edición nunca envía `unitId`; sin presentación `baseQuantity` "1"; 409 de equivalencia visible; relaciones `unit/category` del DTO. |
| 10 | Mano de obra vacía | **Resuelto.** Obligatoria y explícita: vacío bloquea ("Ingresá el importe de mano de obra (puede ser 0)."), 0 aceptado. |
| 11 | Origen del mínimo | **Resuelto.** `minimumSource`: propio de la ubicación / heredado del material / sin mínimo. |
| 12 | Recepciones en historia, comparación, OC duplicada | **Resuelto.** Eventos RECEIVE en historial OC; orden cronológico sin ranking; advertencia con enlaces y confirmación explícita si ya hay OC no anuladas para el pedido/cotización (no bloquea). **Prohibición funcional de varias OC: depende de CEO.** |
| 13 | Preview importación y auditoría de obra | **Resuelto.** UI explica que la vista previa es el CSV local y el servidor valida (fila 1 = primera de datos); estado/resultado del commit; auditoría con antes/después. |
| 14 | IDs de líneas e idempotencia de versión | **Resuelto.** PATCH de cómputo envía `lines[].id`; `POST /budgets/{id}/versions` con `Idempotency-Key` estable por intención (misma clave ante error de red, nueva si cambia el cuerpo o tras éxito). Pruebas unitarias y E2E. |

Replays idempotentes con DTO legado (OC/recepción/movimiento): la UI sólo usa id/número de la respuesta y refresca con GET, sin repetir el POST.

### Abiertos

- **Dependen de CEO:** política de redondeo/IVA/moneda (V-01), matriz final de permisos/estados (V-02/V-03), prohibición o no de múltiples OC por pedido/cotización.
- **Backend (menores, sin bloqueo):** `RequestDetail` no trae nombre de obra ni de solicitante, y `Quotation` no trae nombre de quien seleccionó: Inicio carga obras para nombrarlas y esos nombres sólo se resuelven para Gerencia (otros roles ven "Usuario"). Propuesta: `work {id,code,name}`, `requestedByName`, `selectedByName`.

## CI del frontend

Workflow `.github/workflows/web.yml` ("Web V1"), independiente de "API V1". Se ejecuta en PR y en push a `main`/`claude/ceo-v1-frontend` cuando cambian `apps/web`, `apps/api`, `docs/api`, `scripts`, manifiestos pnpm o el propio workflow:

1. `pnpm install --frozen-lockfile`.
2. Regenera `lib/openapi.d.ts` y falla si difiere (`git diff --exit-code`).
3. Typecheck, pruebas unitarias (vitest) y build de API y web.
4. E2E con `apps/web/scripts/e2e-ci.sh`: PostgreSQL 18 efímero del job, migraciones versionadas, bootstrap con contraseña aleatoria, API standalone en modo producción (cookies Secure) y web `next start` con el proxy, seed sintético `scripts/e2e-seed.mjs` y Playwright (desktop + Pixel 7). El script rechaza bases que no sean loopback o no contengan `test` en el nombre; el seed sólo acepta una web en loopback. Sin secretos del repositorio ni acceso a Railway.

Local: `DATABASE_URL=postgresql://...@127.0.0.1:<puerto>/<base_test> apps/web/scripts/e2e-ci.sh` (con los puertos 3000/3001 libres).
