# Reglas para agentes de desarrollo — CEO Construcciones

Leé primero README.md, docs/PRD-ETAPA-1.md y docs/ESTADO-PROYECTO.md. El **PRD v1.0 contiene la definición funcional base cerrada internamente**; las validaciones operativas listadas en él NO están resueltas por defecto. Contrato + Anexo I prevalecen ante contradicciones.

## Arquitectura cerrada
- Un solo monorepo pnpm + TypeScript + Next.js en apps/web (Vercel) y apps/api (Railway).
- Prisma y PostgreSQL exclusivamente en apps/api. No proponer otro ORM/infraestructura salvo requerimiento aprobado.
- No introducir Redis, colas, microservicios, plataformas SaaS, funciones de IA integradas ni buckets sin aprobación.
- Secretos solo en variables seguras, nunca en commits, logs ni fixtures.
- Las migraciones Prisma deben ser versionadas y revisadas; antes de migraciones destructivas o cambios en producción, backup y autorización explícita.

## Responsabilidades durante el cierre de Etapa 1
- La misión de habilitación demo online autorizada el 05/11/2026 permite, sólo en el proyecto/entorno existentes identificados en `docs/DEMO-ONLINE.md`, respaldo puntual, migraciones versionadas pendientes, carga CEO verificada y datos/accesos DEMO. Sustituye las prohibiciones productivas anteriores únicamente para esas acciones; conserva controles locales, seguridad, integridad y límites de infraestructura.
- El encargo incremental de carga inicial y costos de referencia recibido el 04/11/2026 autoriza a Codex full stack, migraciones aditivas y carga verificada exclusivamente local. Incluye MO por referencias y actividades vinculadas, sin nómina. El texto completo adjunto por el usuario prevalece en este incremento; no se reinicia el plan maestro ni se habilitan operaciones productivas.
- Para la misión de cierre definida en `CEO_PLAN_MAESTRO_CODEX.md`, **Codex** trabaja full stack: dominio, API, autenticación/RBAC, Prisma, contratos, `apps/web`, pruebas y documentación. La autorización no permite cambiar infraestructura, secretos, backups, Railway/Vercel ni datos productivos.
- Fuera de esa misión, el frontend debe seguir consumiendo contratos versionados y no crear modelos paralelos ni endpoints inventados.
- Trabajar en **ramas/PR independientes por tarea**. No ejecutar ambos agentes editando el mismo archivo en paralelo. No mergear ni desplegar cambios funcionales sin revisión/consentimiento del usuario.
- Contratos OpenAPI documentados antes de integrar pantallas. Mantener documentación del contrato coherente con backend.
- No modificar ajustes Railway/Vercel sin necesidad justificada y verificable.

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
