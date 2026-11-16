# Reglas para agentes de desarrollo — CEO Construcciones

Leé primero README.md, docs/PRD-ETAPA-1.md y docs/ESTADO-PROYECTO.md. El **PRD v1.0 contiene la definición funcional base cerrada internamente**; las validaciones operativas listadas en él NO están resueltas por defecto. Contrato + Anexo I prevalecen ante contradicciones.

## Arquitectura cerrada
- Un solo monorepo pnpm + TypeScript + Next.js en apps/web (Vercel) y apps/api (Railway).
- Prisma y PostgreSQL exclusivamente en apps/api. No proponer otro ORM/infraestructura salvo requerimiento aprobado.
- No introducir Redis, colas, microservicios, plataformas SaaS, funciones de IA integradas ni buckets sin aprobación.
- Secretos solo en variables seguras, nunca en commits, logs ni fixtures.
- Las migraciones Prisma deben ser versionadas y revisadas; antes de migraciones destructivas o cambios en producción, backup y autorización explícita.

## Responsabilidades y fuentes vigentes
- **Hoja de ruta activa para entregar V1 y cerrar Etapa 1:** `docs/CHECKLIST-V1-ETAPA-1.md` (79 objetivos: 47 V1 y 32 E1). Leerla antes de cada tarea; priorizar V1, verificar antes de programar y no iniciar funcionalidades no requeridas. No crear planes/checklists paralelos. `CEO_PLAN_UX_UI_TRANSVERSAL_CODEX.md` y `docs/UX-TRANSVERSAL-ETAPA-1.md` conservan el registro histórico del incremento UX ya integrado, no son un nuevo encargo.
- Codex trabaja full stack en `apps/api`, `apps/web`, Prisma, contratos, pruebas y documentación; no hay exclusividad de frontend asignada a otro agente.
- Requisitos base en `docs/PRD-ETAPA-1.md`, decisiones detalladas en `docs/DECISIONES-CIERRE.md`, aceptación/matriz en `docs/ACEPTACION-CIERRE-ETAPA-1.md` y `docs/REQUISITOS-ETAPA-1-CIERRE.md`. Los registros de cierres anteriores son evidencia histórica, no misiones para reiniciar.
- La habilitación online del 05/11/2026 y sus destinos/autorizaciones están en `docs/DEMO-ONLINE.md`. La misión UX autoriza publicación del código y smoke pequeño con registros nuevos DEMO UX; no autoriza modificar usuarios, credenciales, cargas CEO, operaciones ajenas o infraestructura. Cualquier ampliación productiva exige autorización y recuperación verificable.
- Trabajar en ramas/PR independientes. Preservar cambios locales; no editar el mismo archivo simultáneamente. Integrar sólo el candidato revisado y autorizado, con checks verdes, sin force-push ni bypass.
- OpenAPI y tipos deben quedar sincronizados antes de integrar pantallas. No crear modelos paralelos ni endpoints inventados.
- No modificar ajustes Railway/Vercel. Verificar compatibilidad y observar el autodespliegue existente sin configurarlo.

## Reglas de negocio críticas de V1
- Cinco perfiles: Gerencia, Compras, Cómputo/Presupuestos, Jefe de Obra y Administración restringida. El jefe de obra y Administración no reciben precios/costos salvo los DTO expresamente autorizados; validar autorización en backend.
- La experiencia visible usa **Actividades de obra**, **Costo por unidad** y **Composición del costo**. Los IDs internos APU pueden mantenerse por compatibilidad. Se autorizan costos directos, VARIOS, recargo comercial, borradores, revisiones y PDF comercial, sin convertir el producto en contabilidad o ERP.
- OC para obra **o generales sin obra**, siempre con proveedor y ubicación destino identificada.
- Factura en OC: número, importe/moneda y estado Pagado/Pendiente informativos, con actor y fecha/hora automáticos. Administración restringida sólo cambia ese estado; sin módulo contable ni ejecución de pagos.
- Reservas simples: reducen disponible, no físico; transferencia ejecutada mueve stock y satisface reserva. Operaciones concurrentes seguras.
- Stock mínimo visual configurable requerido por contrato, sin reposición automática.
- Reporte previsto / pedido / comprado / consumido en **cantidades materiales**, no beneficio ni avance financiero ficticio.
- Migración inicial: proveedores, obras activas y OC abiertas de CEO Obras; resto de histórico exportado. Sin integración automática.
- Interfaces en español y móvil. Demo como referencia visual, no como extensión de alcance.

## Calidad y continuidad
- Tests funcionales y de integración de los flujos críticos, build correcto y healthcheck API.
- Monitoreo básico y backups semanales con retención de al menos 30 días son obligaciones contractuales; no confundir con plataformas externas innecesarias.
- Consultar las dos carpetas globales de Drive y fuentes principales incluidas en docs/INSTRUCCIONES-PROYECTO-CHATGPT.md para aclarar requisitos; verificar actualización cuando corresponda.
- Mantener docs/ESTADO-PROYECTO.md actualizado después de cada hito, con PR, pruebas y estado real de deployment.
- La misión de cierre fue autorizada por el usuario. Mantener `docs/ESTADO-CIERRE-ETAPA-1.md` y la matriz de trazabilidad al avanzar; no declarar una función terminada si sólo existe UI o fixture.
- **Seguimiento obligatorio por tarea/PR:** identificar el ID concreto (ej. `3.10`) en `docs/CHECKLIST-V1-ETAPA-1.md`, verificar comportamiento y evidencia; actualizar únicamente los puntos trabajados con estado, responsable, fecha y prueba/PR. Marcar `[x]` solo cuando esté validado para su hito; si hay fallas, dejar `[ ]` y registrar bloqueo/ajuste. Documentar los hitos técnicos en `docs/ESTADO-PROYECTO.md`. No afirmar que CI verde equivale a aceptación del cliente.
