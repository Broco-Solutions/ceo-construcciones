# Evidencia de verificación del backend V1

Rama `codex/ceo-v1-backend`. Esto verifica la entrega técnica para revisión; no certifica aceptación operativa de CEO, migración real ni producción. Resultados finales y PR: [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md).

## Cobertura funcional

| Requisito de misión / PRD | Implementación | Evidencia ejecutable |
| --- | --- | --- |
| Autenticación válida/inválida, cookies, logout, usuario inactivo y protección sin bloqueo por cuenta | core/auth, login-protection, identity, bootstrap-admin | security.test, security.integration, login-protection.test/integration, runtime; bootstrap inicial ejecutado sobre base vacía |
| Roles, aislamiento de obra, ausencia de precios del Jefe | core/auth, proyecciones explícitas OC/BOM/reportes, restricción catálogos económicos | security.integration, integration, budgets.integration, stock-alerts.integration, access-contract.integration |
| Obras/responsables/asignaciones y ubicación automática | catalog, identity | integration, contracts.integration |
| Material/unidad/presentación/proveedor/precios separados e historial | catalog, Prisma | integration, budgets.integration, contracts.integration |
| APU manual, sólo mano de obra y MO unitario; ejemplo 100m²=450kg/660kg/7m³ | budgets | budgets.test |
| Cómputos y versiones con overrides, cálculo explícito, BOM y snapshot histórico | budgets, triggers SQL | budgets.integration (cambios de maestro y APU, overrides, cambio directo DB rechazado, 16 decimales), imports.integration |
| Concurrencia de numeración de versiones y OC | transacciones Serializable/reintentos + secuencia OC | budgets.integration (6 versiones), integration (8 OC) |
| Pedido por obra/rubro/fecha sin mover físico | procurement | integration, reports.integration |
| Cotizaciones/proveedores/comparación, selección manual, moneda/IVA explícitos | procurement | integration, budgets.integration y contrato |
| OC generales/sin obra, edición borrador, estados, PDF | procurement | integration (destinos, concurrencia, catálogo inactivo, PDF legible) |
| Factura limitada a número/actor/hora automática con corrección trazada | procurement | integration (dos cargas auditadas, stock inalterado, Jefe rechazado) |
| Recepciones parciales/pendiente, remito, ingreso atómico/idempotente | procurement, inventory/idempotent | integration (3 concurrentes misma clave, reintento otro actor, sobre-recepción rechazada, finalización) |
| Reservas simultáneas sin sobrereserva, cancelación libera pendiente | inventory | inventory.integration |
| Transferencia satisface reserva y mueve físico sin doble descuento | inventory | inventory.integration, reports.integration flujo completo |
| Consumo/reintentos/concurrencia y prevención de negativo | inventory, CHECK SQL | inventory.integration (misma y distintas claves, revocación de asignación antes de replay), imports.integration |
| Apertura, devolución, ajuste con motivo y trazabilidad | inventory e imports | inventory.integration, imports.integration (apertura repetida/carrera entre archivos) |
| Mínimos globales/locales y alertas aun sin saldo registrado | stock/alerts | stock-alerts.integration (consulta sin escritura, override0, exactitud y permisos) |
| Previsto/pedido/comprado/recibido/consumido/disponible y rubro/material/obra | reports | reports.integration (estados excluidos, filtros, sin referencia, atribución stock y permisos) |
| PDF y Excel reales descargables | procurement PDF, exports/reports XLSX | integration y reports.integration abren los archivos con pdf-lib/ExcelJS |
| Importar materiales/precios/proveedores/obras/OC abiertas/stock inicial | imports, plantillas CSV/JSON | imports.test e imports.integration (dry-run, validación/hash, duplicados, atomicidad, concurrencia) |
| Auditoría sensible en misma transacción | core/audit y módulos | security.integration, integration, budgets.integration, reports.integration |
| OpenAPI consumible: requests/responses/permisos/errores/filtros/ejemplos | scripts/generate-openapi, docs/api/openapi.json | openapi.test, contracts.integration (respuestas reales), SwaggerParser y AJV |
| Arranque/build/healthcheck/Prisma sin pnpm en runtime | prepare-standalone, health, package scripts | instalación limpia, typecheck, build y runtime.test con proceso Node real |
| Migración coherente y exportación/restauración local | Prisma SQL y guía de operación | migrate deploy en DB nueva, migrate diff vacío, pg_dump/pg_restore local con conteos e invariantes iguales |

## Flujo completo comprobado

La prueba de `reports.integration.test.ts` usa los handlers reales: APU → cómputo100m² → presupuesto/referencia con450kg → pedido450 → apertura100 en galpón → reserva100 → cotización/OC350 → recepción350 → traslado100 con reserva y350 adicionales → consumo120 → informe/Excel. Comprueba previsto450, pedido450, comprado350, recibido350, consumido120, disponible330 en obra, galpón0 y reserva satisfecha. Otros tests prueban cal660kg/arena7m³ y consolidación entre rubros.

## Infraestructura y seguridad

Next15.5.27 y Prisma6.19.0 se mantienen. El lockfile fija dependencias; overrides transitivos acotados corrigen avisos reales detectados por `pnpm audit --prod`: postcss8.5.23 (Next), uuid11.1.1 (ExcelJS usa API v4), effect3.20.0 y deepmerge-ts8.0.0 (@prisma/config). Se verifican generación Prisma, migración, tests, exportaciones y build tras los cambios. Son dependencias transitivas, no reemplazo de stack/framework.

Referencias de los avisos: [PostCSS](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [DeepmergeTS](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [Effect](https://github.com/advisories/GHSA-38f7-945m-qr2g). El resultado de audit describe sólo los avisos conocidos al ejecutar, no una garantía sobre vulnerabilidades futuras.

La regresión `pool.integration.test.ts` ejecuta tres transacciones simultáneas en un proceso con sólo tres conexiones; las autorizaciones reutilizan su cliente transaccional y no agotan el pool. CI usa Node24 y PostgreSQL18 efímero con ese mismo límite, sin secretos productivos. La verificación local usa Node24.19.0 y PostgreSQL16.15 aislado. No hay ESLint configurado: se ejecuta typecheck y las comprobaciones del build de Next; no se declara un lint independiente inexistente.

## Dependencias externas delimitadas

Los formatos fuente reales, datos contados, responsables de extracción, corte y archivo histórico deben entregarlos CEO. Las plantillas/adaptadores están implementados; no se simuló su migración real. IVA/conversiones/redondeo y permisos/estados finales esperan validación operativa V-01–05. Los cálculos exigen datos explícitos y no certifican un presupuesto real todavía.

Backups/restauración productiva, calendario semanal/retención>=30d, piloto, capacitación y aceptación contractual son actividades posteriores. Se inspeccionó Railway sin cambios; no se pudo verificar calendario/lista de backups con el conector. La restauración comprobada es local con datos sintéticos. APP_ORIGIN falta en servicio actual y debe configurarse al autorizar producción.

No hubo migraciones, cambios de secretos, merge ni despliegue productivos. `apps/web` permanece sin modificaciones.

## Cierre de auditoría del PR #1 — 22/10/2026

Se revisaron RBAC/obras, DTO sin economía para Jefe, idempotencia y concurrencia de inventario/recepciones, versionado inmutable, numeración/estados de OC, contrato y sesión por proxy. Tres subagentes auditaron APU/presupuestos, stock/compras y seguridad/contrato; las correcciones se integraron en la misma rama.

Defectos corregidos:

- El schema APU rechazaba `components: []`. Ahora permite sólo mano de obra: costo material cero, BOM vacía y total coherente, incluso mezclado con APU materiales. Las versiones anteriores conservan snapshot y materiales originales al editar el maestro. No se crean materiales ni filas BudgetMaterial inexistentes.
- La cuota de login por cuenta permitía que un tercero bloqueara a la víctima. Se reemplazó por un cliente opaco, hash en PostgreSQL y cuota compartida entre emails, más admisión limitada antes de consultas/crypto. No se confía en encabezados IP. Pruebas cubren víctima independiente, spoofing, concurrencia, vencimiento, cuentas inexistentes/inactivas, cookies desconocidas, límite de tasa y liberación de capacidad. La purga acotada de contadores vencidos evita crecimiento permanente; índice y migración no destructiva versionados. El alcance y las limitaciones por cookie/proceso están en la guía de integración.
- Un Jefe desvinculado de una obra podía recuperar un consumo/devolución previo por clave idempotente. Se revalida la autorización antes de recuperar el resultado. Dos regresiones verifican rechazo tras revocación, no duplicación de stock y replay válido al restituir asignación, aun con material/ubicación inactivos.

La matriz de acceso de OpenAPI se contrasta con las rutas reales para los tres roles restringidos. Se preservan Origin y cookies host-only/Secure al usar URL pública distinta de la API. Runtime real verifica dos Set-Cookie separados en éxito y la cookie de cliente también en401. El contrato se regeneró sin cambiar rutas ni agregar servicios. La paginación de alertas se prueba en las obras del usuario de fixture para evitar depender de ubicaciones globales creadas por otras suites simultáneas.

No se detectaron otros defectos confirmados en los ámbitos revisados. La viabilidad del proxy está cubierta en el backend; su prueba completa en el despliegue de Vercel corresponde a la integración del frontend todavía no implementada. Railway no se consultó ni se modificó durante este cierre.

Validación de este cierre: `pnpm install --frozen-lockfile`, generación Prisma y typecheck correctos; ambas migraciones aplicadas en `ceo_v1_audit_final_test` vacía y `prisma migrate diff --exit-code` sin diferencias; build correcto; `RUN_INTEGRATION=1 RUN_RUNTIME=1 pnpm --dir apps/api test`: **95/95**,17 archivos, sin omisiones, PostgreSQL local16.15 y pool3. La CI del mismo PR ejecuta PostgreSQL18 efímero; su corrida final está enlazada en la descripción del PR. No se atribuyen a Railway estos resultados.
