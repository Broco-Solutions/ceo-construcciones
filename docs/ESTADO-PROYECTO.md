# Estado del proyecto — CEO Construcciones

**Actualizado:** 22/10/2026. **Fase:** backend V1 implementado en rama `codex/ceo-v1-backend`, cierre backend de integración de issue#3 implementado y verificado localmente; [PR#1](https://github.com/Broco-Solutions/ceo-construcciones/pull/1) abierto para revisión. No mergeado ni desplegado. `apps/web` sin modificaciones.

## Frontend V1 (Claude Code) — 22/10/2026

Rama `claude/ceo-v1-frontend` basada en `codex/ceo-v1-backend`; PR de frontend abierto contra esa rama, sin merge ni despliegue. Detalle, guía por rol, pasos de Vercel y diferencias de contrato en [FRONTEND-V1.md](FRONTEND-V1.md). No se modificaron `apps/api`, Prisma ni migraciones; Railway no se consultó ni modificó; Vercel no se configuró.

- Implementado en `apps/web`: design system basado en la demo, shell responsive por rol, login/sesión/logout reales, proxy same-origin (Set-Cookie separados, Origin, no-store, Retry-After), cliente tipado desde OpenAPI y pantallas de obras, catálogo, proveedores/precios, APU, cómputos, presupuestos/versiones, pedidos, cotizaciones, OC, recepciones, stock/reservas/movimientos/mínimos, reportes y administración/importaciones.
- Verificación local (Node 22.23, pnpm 10.18.3, PostgreSQL 18.6 aislado, API dev local): instalación limpia frozen-lockfile, typecheck, build Next 15.5.27 (42 rutas), 11/11 pruebas unitarias aisladas (formato decimal, proxy con upstream simulado, permisos) y **24/24 E2E Playwright contra la API real** (auth 9, flujos desktop 11, móvil Pixel 7 4). Evidencias en `apps/web/docs/evidencia/`.
- Datos usados: sintéticos `*@demo.local` / "Demo"; sin credenciales reales de CEO.
- Pendiente: validar el proxy en el dominio público de Vercel cuando Railway esté disponible y se autorice el despliegue; resolver las diferencias de contrato listadas (en particular, ubicaciones de destino para devoluciones del Jefe).

## Cierre de integración frontend — issue #3 (22/10/2026)

PR#2 actualizado con el backend `2d6942c` (merge de `codex/ceo-v1-backend`, sin conflictos; `apps/api`, Prisma, migraciones y OpenAPI idénticos a esa rama). Tipos regenerados. Los 14 hallazgos quedaron atendidos en el frontend según [CIERRE-INTEGRACION-V1.md](CIERRE-INTEGRACION-V1.md); detalle y abiertos en [FRONTEND-V1.md](FRONTEND-V1.md). Sin merge, despliegue, Railway ni Vercel.

- Verificación local: typecheck, 27/27 unitarias (vitest), build, y **36/36 E2E Playwright** con `apps/web/scripts/e2e-ci.sh` sobre PostgreSQL 18.6 aislado y base nueva, API standalone producción (cookies Secure), web `next start` y seed sintético (`e2e-seed.mjs`). Incluye recorrido completo obra→APU→cómputo→presupuesto→pedido→cotización→OC→recepción→reserva→transferencia→consumo→devolución→reporte, devolución móvil del Jefe y versiones sin duplicación.
- CI frontend propia `.github/workflows/web.yml` ("Web V1"): instalación limpia, tipos OpenAPI sincronizados, typecheck, unitarias, build y E2E contra PostgreSQL 18 efímero. Resultado en los checks del PR#2.
- Pendientes de CEO: redondeo/IVA/moneda (V-01), permisos/estados finales, política de múltiples OC por pedido/cotización.

## Referencias de continuidad

- [PRD Etapa 1 v1.0](PRD-ETAPA-1.md), sujeto a contrato/Anexo I y validaciones CEO pendientes.
- [Plan y decisiones de misión](PLAN-BACKEND-V1.md).
- [Modelo de datos e importaciones](MODELO-DATOS.md).
- [OpenAPI 3.1](api/openapi.json) y [guía para Claude Code](INTEGRACION-CLAUDE-CODE.md).
- [Operación, inicialización y pasos productivos](OPERACION-BACKEND.md).
- [Matriz de cobertura y evidencias](VERIFICACION-BACKEND-V1.md).
- [Cierre backend de issue#3 y los14 hallazgos del frontend](CIERRE-INTEGRACION-V1.md).
- Repo: https://github.com/Broco-Solutions/ceo-construcciones
- Railway: https://railway.com/project/d2fb9213-5508-4b3d-91a8-b6bd86451ceb
- Vercel: https://vercel.com/broco-solutions/ceo-construcciones-web

## Integración con PR #2 — cierre backend de issue #3

Leídas la [issue#3](https://github.com/Broco-Solutions/ceo-construcciones/issues/3) y docs/FRONTEND-V1.md de `claude/ceo-v1-frontend` en9f3a898. Se trabajó en un worktree separado de la misma rama backend, conservando intacta la rama de Claude y apps/web. Tres subagentes implementaron/auditaron presupuestos, compras e inventario/seguridad; la integración principal cubrió catálogo/filtros, OpenAPI y documentación.

Resueltos: destinos mínimos activos galpón/patio para devolver como Jefe, versiones de presupuesto idempotentes, filtros servidor antes de paginar/contar, OC con pendientes/importes exactos y advertencia si falta redondeo, nombres seguros/ubicaciones/actores, referencia no económica por obra, BOM descriptiva, origen de mínimos, recepciones en historia OC, comparación determinista, unidad material inmutable en contrato, precio sin presentación con base1, auditoría obra antes/después e identidad de líneas al editar cómputos. La mano de obra sigue obligatoria y explícita; no se inventó cero ni regla de IVA/redondeo/unicidad de OC.

Se corrigió además una fuga descriptiva: una transferencia desde obra ajena hacia la propia ya no muestra su nombre/código al Jefe; la ubicación se proyecta null sin ocultar el evento. Respuestas idempotentes previas conservan snapshot; OpenAPI permite resultado legado sólo en POST, y GET exige la proyección enriquecida. Regresiones AJV comprueban ambos contratos sin duplicar efectos.

Verificación local de este hito, Node24.19.0/pnpm10.18.3/PostgreSQL16.15:

- Instalación frozen-lockfile, generación Prisma, typecheck y build correctos.
- Migraciones existentes aplicadas en base nueva `ceo_v1_issue3_final_test`; migrate diff sin diferencias. No hubo cambios de schema ni nuevas migraciones.
- `RUN_INTEGRATION=1 RUN_RUNTIME=1 pnpm --dir apps/api test`: **122/122**,23 archivos, sin omisiones, pool3. Incluye3 pruebas HTTP del standalone y regresiones de roles, concurrencia, replays actuales/legados, filtros, DTO y snapshots.
- OpenAPI regenerado y validado:85 rutas/114 operaciones. No se modificaron tipos ni pruebas de apps/web; la CI API no acredita CI/E2E del frontend.
- La corrida CI final de esta revisión se enlaza en la descripción/checks del PR#1. Los resultados históricos de abajo no sustituyen esos checks.

No quedan hallazgos bloqueantes conocidos en el alcance backend de la issue. Claude debe actualizar PR#2/tipos, enviar claves en VersionForm, habilitar devolución móvil, consumir filtros/DTO nuevos, advertir OC relacionadas y completar CI/E2E frontend. La disposición de cada P0/P1/P2 y los pasos exactos están en [CIERRE-INTEGRACION-V1.md](CIERRE-INTEGRACION-V1.md). No se da por cerrada la issue hasta integración conjunta. Validaciones CEO y bloqueos productivos siguen pendientes.

Sin acceso a Railway/BD productiva, despliegue ni merge. apps/web y configuración Railway/Vercel intactos. El trabajo se actualiza sólo en PR#1.

## Implementación de la misión

El usuario autorizó la misión integral del backend; se leyeron los seis documentos obligatorios y se consultaron ambas carpetas Drive, contrato/Anexo I y documento funcional actualizado. Se trabajó con subagentes de datos/importaciones, seguridad/contratos y presupuestos/reportes, con propietario único de Prisma e integración principal.

Implementados: usuarios/sesiones/RBAC/asignaciones/auditoría; obras/ubicaciones; unidades/rubros/materiales/proveedores/presentaciones/precios históricos; APU/cómputos/presupuestos y versiones con snapshots; pedidos; cotizaciones/comparación/selección; OC numeradas, generales, PDF y referencia limitada de factura; recepciones parciales; stock/reservas/transferencias/consumos/devoluciones/ajustes/apertura única/mínimos; reportes de cantidades/XLSX; importaciones CSV/JSON con preview/hash/idempotencia y rechazo de duplicados.

Prisma contiene 32 modelos, migración inicial `20261022000100_backend_v1` e índice adicional `20261022000200_auth_attempt_expiration_index`, con FK, CHECKs de saldos/cantidades y triggers de inmutabilidad de snapshots. Aplicadas exclusivamente a PostgreSQL aislado de pruebas. No se ejecutó migración de datos reales CEO.

OpenAPI contiene 85 rutas y 114 operaciones (incluye plantillas/preview/commit por tipo y healthcheck). Se valida formato con SwaggerParser y ejemplos con los schemas reales. AJV2020 valida también unas 80 combinaciones de respuestas reales de ruta/estado/rol contra OpenAPI, incluidas proyecciones exclusivas de Jefe y errores401/403/422.

## Cierre de auditoría solicitado del PR #1

Se trabajó en la misma rama y PR con tres subagentes de auditoría. Corregidos: APU exclusivamente de mano de obra (`components: []`, costo material cero y BOM vacía); bloqueo dirigido del login por cuenta (cuota por cliente opaco y admisión acotada por proceso, sin IP ni servicios nuevos); replay idempotente de consumo/devolución tras revocar la asignación de un Jefe (ahora403, sin duplicar stock).

El login preserva cookies en éxito/error y Retry-After. La limpieza de contadores vencidos usa índice, lotes de1000 cada30s/proceso, gracia15min y SKIP LOCKED; incluye contadores legado y comparación UTC independiente del timezone PostgreSQL. Sus límites por cookie/proceso están documentados. Sin secretos/configuración productiva nuevos.

Se repasaron roles/obras y ausencia de economía para Jefes, reservas/transferencias/recepciones/consumos, snapshots/versiones, numeración/estados OC, OpenAPI y sesiones para proxy Vercel. No quedan hallazgos técnicos bloqueantes conocidos para revisar este PR. La prueba del proxy real desplegado será parte de la integración del frontend; las validaciones operativas CEO y requisitos de producción siguen pendientes abajo.

OpenAPI regenerado (85 rutas/114 operaciones), guía Claude actualizada y migración nueva no destructiva revisable. Railway permanece fuera de alcance por caída informada: no se consultó, desplegó, migró ni modificó durante este cierre. No hubo cambios en apps/web ni merge.

## Verificaciones de la auditoría anterior (antes de issue #3)

- Node24.19.0, pnpm10.18.3, PostgreSQL16.15 local aislado (producción observada usa18; CI efímero18 aprobado).
- Instalación limpia desde copia de fuentes sin node_modules/.next: `pnpm install --frozen-lockfile`, generación Prisma y typecheck correctos.
- Ambas migraciones aplicadas en una base vacía adicional `ceo_v1_audit_final_test`; comparación esquema/BD sin drift. Instalación frozen-lockfile, generación, typecheck y build repetidos en este cierre.
- Suite final del cierre:95/95 pruebas aprobadas en 17 archivos con RUN_INTEGRATION=1 y RUN_RUNTIME=1 (sin omisiones). Incluye 92 pruebas unitarias/integración/contratos y 3 HTTP de runtime. Ejecución separada sin flags de integración/runtime:29 aprobadas y66 omitidas por diseño.
- Build Next15.5.27/Prisma6.19.0 correcto, incluido wrapper que conserva `node .next/standalone/server.js` para Railway.
- Runtime standalone:3/3 pruebas HTTP aprobadas (health con SELECT1, sesión401, login cookie HttpOnly/Secure, logout/revocación y cookies de cliente en401). Sin pnpm en el proceso de ejecución.
- Regresión con pool limitado a 3 conexiones: autorización reutiliza el cliente transaccional; recepciones concurrentes y suite completa aprobadas sin ampliar sus timeouts.
- Bootstrap ejecutado en otra base vacía aislada: creó una Gerencia con hash scrypt/auditoría y rechazó un segundo intento; contraseña de prueba no guardada ni mostrada.
- Flujo integral real verificado desde APU hasta informe/Excel, más concurrencia de OC/versiones/reservas/recepciones/consumos, permisos y snapshots.
- PDF/Excel abiertos por parsers en pruebas; importaciones inválidas/duplicadas rechazadas y dry-run sin escritura.
- Dump/restauración local de datos sintéticos comprobados:49 usuarios,57 versiones,32 saldos y305 auditorías coinciden; cero saldos con físico<reservado o reservado<0. No equivale a restauración de un backup de Railway.
- `pnpm audit --prod`: sin vulnerabilidades conocidas tras overrides transitivos acotados; sin cambios mayores de framework.
- No hay ESLint configurado; no se declara lint independiente. Typecheck y comprobaciones del build ejecutados.

## Git, revisión y despliegue

Rama: `codex/ceo-v1-backend`. Commits iniciales: `112d103` (dominio/seguridad), `9aae80e` (módulos de negocio/integración). [PR#1](https://github.com/Broco-Solutions/ceo-construcciones/pull/1) abierto hacia main, sin merge. CI remota aprobada sobre la revisión final `a00759f` con Node24/PostgreSQL18 y pool de 3 conexiones: [corrida completa](https://github.com/Broco-Solutions/ceo-construcciones/actions/runs/39648500923). Incluye instalación, migración, typecheck, tests, build y runtime HTTP. Esa corrida es histórica, anterior al cierre de auditoría. Los checks de la revisión actual se consultan en el mismo PR#1 y su descripción enlaza la corrida correspondiente. Revisión humana pendiente.

Railway fue consultado sólo en lectura: servicio API desde main, root `/apps/api`, último despliegue existente exitoso `418c693f-7328-44ed-99d3-1fbb512c7222` del16/10; healthcheck `/api/health`, sin cambios staged. PostgreSQL18 con volumen existente. La V1 de esta rama **no está desplegada**. La configuración de Vercel y apps/web no se modificaron; la integración GitHub/Vercel generó un preview automático del PR, sin despliegue productivo solicitado.

Variables observadas por nombre en API: DATABASE_URL, HOSTNAME, NODE_ENV, PORT. Falta APP_ORIGIN, necesario para mutaciones de sesión en producción; se configurará al autorizar despliegue. No se leyeron valores secretos. La CLI Railway local está incompleta; se usó el conector para lectura.

Disponibilidad actual de Railway: el usuario informó una caída el22/10. No se ejecutaron diagnósticos ni cambios productivos; el metadato SUCCESS histórico no acredita disponibilidad actual. Las pruebas/build de esta misión corrieron en local y GitHub Actions con PostgreSQL aislado y no dependen de Railway. Revalidar su disponibilidad antes del despliegue autorizado.

Backups contractuales **sin verificar**: el conector no expone calendario/listado/retención. No se afirmó que estén operativos. Verificar copias al menos semanales, retención>=30 días y restauración aislada antes de producción/piloto.

## Pendientes de CEO y pasos autorizables

1. IVA, unidades/presentaciones, política de redondeo y Excel real para cotejo. El motor exige datos explícitos; no calcula IVA ni conversiones desconocidas.
2. Matriz final de permisos, responsables, selección de referencia/aprobaciones y nomenclatura de estados. La matriz conservadora inicial está documentada; no implica validación CEO.
3. Exportaciones reales de proveedores/obras activas/OC abiertas, extracción, cantidades pendientes, fecha de corte, archivo histórico y convivencia temporal. Adaptadores/plantillas listos; migración real no ejecutada.
4. Recuento inicial, mínimos, usuarios y obra piloto; capacitación y aceptación operativa.
5. Revisar PR/SQL; confirmar backup restaurable/calendario/retención y monitoreo básico; autorizar expresamente migración, configuración APP_ORIGIN y despliegue. Comandos exactos en la guía de operación. No habilitar producción sólo porque el build esté verde.

La entrega técnica revisable no equivale a la finalización contractual de Etapa1, que requiere puesta en uso, datos, capacitación y aceptación. No quedan endpoints simulados ni módulos vacíos en la implementación; las dependencias externas anteriores permanecen explícitas.
