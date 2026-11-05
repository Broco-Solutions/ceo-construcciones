# Estado del proyecto — CEO Construcciones

**04/11/2026 · Login visual renovado:** panel de marca y tarjeta de escritorio, franja móvil con formulario completo en 360×740, mostrar/ocultar y aviso accesible de Bloq Mayús; TextField.suffix retrocompatible. Autenticación y selectores preservados. Web 52/typecheck/build y revisión de 12 capturas nuevas más 6 anteriores; E2E 73/73 aprobado; integración/checks/SHA se registran en el PR de `codex/login-restyling`. [Comparación visual](../apps/web/docs/evidencia/login/README.md). Sin cambios en API, datos o infraestructura.

**04/11/2026 · Vinculación material BASE verificada:** hallazgo PR14 reproducido sobre carga real y base manual (146/0 vínculos). Complemento con 67 composiciones verificadas, 3 directos legítimos y 76 limitaciones específicas; prueba real de precio→actividad→presupuesto y R1/PDF inmutable aprobada. API 187+3 runtime, web 49 y E2E 72 aprobados; complemento manual aplicado y reejecutado sin conflictos, smoke visual y compatibilidad aprobados. Integración/checks/SHA en [PR15](https://github.com/Broco-Solutions/ceo-construcciones/pull/15) y [matriz vigente](ESTADO-CARGA-INICIAL-Y-COSTOS.md). Sin cambios productivos ni infraestructura.

**04/11/2026 · Carga inicial y costos de referencia, candidato verificado:** 146 actividades catalogadas (MO vinculada donde se verificó; suministro agregado inicial, completado por PR15), 316 identidades materiales activas (PRECIOS+recetas), 372 precios históricos y 78 recursos/37 tarifas MO. `/costos`, actualización explícita de borradores e históricos preservados; API186+3 runtime, web49 y E2E72 locales aprobados, compatibilidad V1/PR9/nueva y smoke manual reales. Integración y checks en [PR #14](https://github.com/Broco-Solutions/ceo-construcciones/pull/14); datos y producción se distinguen en [estado/matriz CI-01…CI-48](ESTADO-CARGA-INICIAL-Y-COSTOS.md) y [resultado por registro](CARGA-INICIAL-RESULTADOS.md). Infraestructura sin cambios.

**03/11/2026 · Pulido visual previo a pruebas manuales:** páginas 404/error en español, títulos de pestaña, toasts de escritorio al pie, enlaces y pestañas móviles legibles, acción centrada en obras vacías, isotipo compacto e íconos cuadrados de la app. `apps/web` exclusivamente; 47 unitarias, typecheck, build y 71 E2E locales aprobados contra API/PostgreSQL aislados. [Capturas a 1440 y 360 px, más favicon en navegador](../apps/web/docs/evidencia/pulido/). Integración y checks remotos en el PR de `codex/pulido-ui-pre-pruebas`.

**03/11/2026 · UX de navegación:** sidebar y menú móvil con logo, grupos con iconos y barra persistente para la sección activa, tarjeta de usuario y encabezados sin perfil duplicado; sin cambios de permisos, API ni login. Typecheck, 47 unitarias y 70 E2E locales aprobados; capturas de `/pedidos` a [1440 px](../apps/web/docs/evidencia/sidebar/pedidos-1440.png) y [360 px](../apps/web/docs/evidencia/sidebar/pedidos-360.png) con otro grupo abierto. Integración y checks remotos en el PR de `codex/sidebar-ux`.

## Corrección técnica posterior al PR8 — validación local aprobada

Base remota revalidada `121264563b73f141e118a2a9f8093c727cc907b8`; rama `codex/cierre-tecnico-manual-20261103`. H01–H05 reproducidos y corregidos; API, web, E2E, compatibilidad y smoke manual aprobados. Integración y checks remotos registrados en [PR #9](https://github.com/Broco-Solutions/ceo-construcciones/pull/9); consultar allí el SHA definitivo y el smoke del código integrado. API actual: 174 + 3 runtime aprobadas. DG: 57 casos originales clasificados 2 A/32 B/23 C; diferencia comercial explicada −15,69. Ver el checkpoint vigente en [estado del cierre](ESTADO-CIERRE-ETAPA-1.md), [conciliación](DG-1153-RECONCILIACION.md) y [guía manual](PRUEBAS-MANUALES-ETAPA-1.md). No se declara habilitación productiva; infraestructura intacta.

## Registro histórico del cierre inicial — PR8, 03/11/2026

El plan rector es [CEO_PLAN_MAESTRO_CODEX.md](../CEO_PLAN_MAESTRO_CODEX.md). Codex tiene autorización full stack, incluidos frontend, contratos y migraciones de aplicación. Las asignaciones exclusivas a Claude y restricciones funcionales de los registros de octubre que siguen son antecedentes históricos, superados por las decisiones del plan para esta misión.

Estado verificable y resultados por hito: [ESTADO-CIERRE-ETAPA-1.md](ESTADO-CIERRE-ETAPA-1.md). Matriz requisito → código → prueba → evidencia: [REQUISITOS-ETAPA-1-CIERRE.md](REQUISITOS-ETAPA-1-CIERRE.md). Continúa en la rama `codex/cierre-etapa1-20261102-234511-12781`; main base `a9a075dc159c8c59d075aa5894534e3dbaae961e`. F1–F8 implementadas y verificadas: API163 + runtime3, web47, E2E53; BASE/DG reales y compatibilidad binaria/navegador V1→ampliada aprobadas. F9 en [PR #8](https://github.com/Broco-Solutions/ceo-construcciones/pull/8); consultar checks, estado de merge y SHA final en ese registro. Habilitación productiva pendiente de migración de aplicación autorizada; infraestructura sin modificaciones.

## Registro histórico de V1 (octubre)

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

## Notificaciones, unidades predeterminadas y textos de ayuda (23/10/2026)

Rama `claude/ux-notificaciones-unidades` desde `main`, con PR propio sin merge. Notificaciones globales con cuatro variantes accesibles, mensajes revisados en todos los módulos, 15 unidades de medida habituales cargadas por migración idempotente (`20261023000100_default_units`, agrega `Unit.symbol` opcional) y textos de ayuda sin jerga técnica. Detalle y paso de Railway en [UX-NOTIFICACIONES-UNIDADES-V1.md](UX-NOTIFICACIONES-UNIDADES-V1.md). La migración **no** se aplicó en Railway.

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

## Demo online habilitada — 05/11/2026

Autorización posterior y acotada del usuario ejecutada sobre el entorno existente: respaldo puntual verificado, siete migraciones pendientes con Prisma 6.19.0 y catálogo BASE/DG real con vinculación PR15. Confirmados online 146 actividades, 67 con materiales vinculados, 74 MO calculadas; repetición sin altas/conflictos y sin operaciones generadas por importar. Preservados usuarios/datos anteriores y los tres archivos locales no publicados. Cinco accesos DEMO privados y muestra operativa separada. Login/logout, permisos servidor, BASE→R1/PDF, revisión explícita/R2, compras/recepción/consumo/stock e indicadores comprobados en **https://ceo-construcciones.brocosolutions.com**, sin depender de WSL.

Validación del candidato: `CEO_Verificar_Local.sh api` **195 pruebas + 3 runtime**, web **52**, E2E **73**, todos salida 0, PostgreSQL/API reales; las tres de runtime omitidas en la primera etapa se ejecutaron por separado. Guardas de destino/respaldo y acción de cuentas con idempotencia, preservación y rollback probadas en PostgreSQL aislado. Smoke público controlado repetido sin crear duplicados; capturas 1440/360 y dos PDF de una página renderizados/inspeccionados, sin composición/MO/recargo internos. Evidencia privada y acceso: [DEMO-ONLINE.md](DEMO-ONLINE.md). No se modificó infraestructura/configuración cloud ni se hicieron comunicaciones reales. Los 76 casos parciales históricos conservan sus limitaciones. La aceptación del piloto sigue pendiente del usuario. PR y SHA/checks definitivos se registran en el cierre de integración de esta habilitación.
