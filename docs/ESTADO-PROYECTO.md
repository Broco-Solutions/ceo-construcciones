# Estado del proyecto — CEO Construcciones

**Actualizado:** 22/10/2026. **Fase:** backend V1 implementado en rama `codex/ceo-v1-backend`, verificación técnica y PR en preparación. No mergeado ni desplegado. `apps/web` sin modificaciones.

## Referencias de continuidad

- [PRD Etapa 1 v1.0](PRD-ETAPA-1.md), sujeto a contrato/Anexo I y validaciones CEO pendientes.
- [Plan y decisiones de misión](PLAN-BACKEND-V1.md).
- [Modelo de datos e importaciones](MODELO-DATOS.md).
- [OpenAPI 3.1](api/openapi.json) y [guía para Claude Code](INTEGRACION-CLAUDE-CODE.md).
- [Operación, inicialización y pasos productivos](OPERACION-BACKEND.md).
- [Matriz de cobertura y evidencias](VERIFICACION-BACKEND-V1.md).
- Repo: https://github.com/Broco-Solutions/ceo-construcciones
- Railway: https://railway.com/project/d2fb9213-5508-4b3d-91a8-b6bd86451ceb
- Vercel: https://vercel.com/broco-solutions/ceo-construcciones-web

## Implementación de la misión

El usuario autorizó la misión integral del backend; se leyeron los seis documentos obligatorios y se consultaron ambas carpetas Drive, contrato/Anexo I y documento funcional actualizado. Se trabajó con subagentes de datos/importaciones, seguridad/contratos y presupuestos/reportes, con propietario único de Prisma e integración principal.

Implementados: usuarios/sesiones/RBAC/asignaciones/auditoría; obras/ubicaciones; unidades/rubros/materiales/proveedores/presentaciones/precios históricos; APU/cómputos/presupuestos y versiones con snapshots; pedidos; cotizaciones/comparación/selección; OC numeradas, generales, PDF y referencia limitada de factura; recepciones parciales; stock/reservas/transferencias/consumos/devoluciones/ajustes/apertura única/mínimos; reportes de cantidades/XLSX; importaciones CSV/JSON con preview/hash/idempotencia y rechazo de duplicados.

Prisma contiene32 modelos y migración inicial `20261022000100_backend_v1`, con FK, CHECKs de saldos/cantidades y triggers de inmutabilidad de snapshots. Aplicada exclusivamente a PostgreSQL local aislado. No se ejecutó migración de datos reales CEO.

OpenAPI contiene85 rutas y114 operaciones (incluye plantillas/preview/commit por tipo y healthcheck). Se valida formato con SwaggerParser y ejemplos con los schemas reales. AJV2020 valida también unas80 combinaciones de respuestas reales de ruta/estado/rol contra OpenAPI, incluidas proyecciones exclusivas de Jefe y errores401/403/422.

## Verificaciones ejecutadas

- Node24.19.0, pnpm10.18.3, PostgreSQL16.15 local aislado (producción observada usa18; CI efímero usa18).
- Instalación limpia desde copia de fuentes sin node_modules/.next: `pnpm install --frozen-lockfile`, generación Prisma y typecheck correctos.
- Migración aplicada en una segunda base vacía de pruebas; comparación esquema/BD sin drift.
- Suite final completa:72/72 pruebas aprobadas en13 archivos con RUN_INTEGRATION=1 y RUN_RUNTIME=1 (sin omisiones). Incluye70 pruebas unitarias/integración/contratos y2 HTTP de runtime.
- Build Next15.5.27/Prisma6.19.0 correcto, incluido wrapper que conserva `node .next/standalone/server.js` para Railway.
- Runtime standalone:2/2 pruebas HTTP aprobadas (health con SELECT1, sesión401, login cookie HttpOnly/Secure, logout/revocación). Sin pnpm en el proceso de ejecución.
- Flujo integral real verificado desde APU hasta informe/Excel, más concurrencia de OC/versiones/reservas/recepciones/consumos, permisos y snapshots.
- PDF/Excel abiertos por parsers en pruebas; importaciones inválidas/duplicadas rechazadas y dry-run sin escritura.
- Dump/restauración local de datos sintéticos comprobados:49 usuarios,57 versiones,32 saldos y305 auditorías coinciden; cero saldos con físico<reservado o reservado<0. No equivale a restauración de un backup de Railway.
- `pnpm audit --prod`: sin vulnerabilidades conocidas tras overrides transitivos acotados; sin cambios mayores de framework.
- No hay ESLint configurado; no se declara lint independiente. Typecheck y comprobaciones del build ejecutados.

## Git, revisión y despliegue

Rama: `codex/ceo-v1-backend`. Commits iniciales: `112d103` (dominio/seguridad), `9aae80e` (módulos de negocio/integración). PR final pendiente de creación y registro en este archivo. CI y revisión remota pendientes.

Railway fue consultado sólo en lectura: servicio API desde main, root `/apps/api`, último despliegue existente exitoso `418c693f-7328-44ed-99d3-1fbb512c7222` del16/10; healthcheck `/api/health`, sin cambios staged. PostgreSQL18 con volumen existente. La V1 de esta rama **no está desplegada**. Vercel y apps/web no se modificaron.

Variables observadas por nombre en API: DATABASE_URL, HOSTNAME, NODE_ENV, PORT. Falta APP_ORIGIN, necesario para mutaciones de sesión en producción; se configurará al autorizar despliegue. No se leyeron valores secretos. La CLI Railway local está incompleta; se usó el conector para lectura.

Backups contractuales **sin verificar**: el conector no expone calendario/listado/retención. No se afirmó que estén operativos. Verificar copias al menos semanales, retención>=30 días y restauración aislada antes de producción/piloto.

## Pendientes de CEO y pasos autorizables

1. IVA, unidades/presentaciones, política de redondeo y Excel real para cotejo. El motor exige datos explícitos; no calcula IVA ni conversiones desconocidas.
2. Matriz final de permisos, responsables, selección de referencia/aprobaciones y nomenclatura de estados. La matriz conservadora inicial está documentada; no implica validación CEO.
3. Exportaciones reales de proveedores/obras activas/OC abiertas, extracción, cantidades pendientes, fecha de corte, archivo histórico y convivencia temporal. Adaptadores/plantillas listos; migración real no ejecutada.
4. Recuento inicial, mínimos, usuarios y obra piloto; capacitación y aceptación operativa.
5. Revisar PR/SQL; confirmar backup restaurable/calendario/retención y monitoreo básico; autorizar expresamente migración, configuración APP_ORIGIN y despliegue. Comandos exactos en la guía de operación. No habilitar producción sólo porque el build esté verde.

La entrega técnica revisable no equivale a la finalización contractual de Etapa1, que requiere puesta en uso, datos, capacitación y aceptación. No quedan endpoints simulados ni módulos vacíos en la implementación; las dependencias externas anteriores permanecen explícitas.
