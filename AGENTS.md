# Reglas para agentes de desarrollo — CEO Construcciones

Leé primero README.md, docs/PRD-ETAPA-1.md y docs/ESTADO-PROYECTO.md. El **PRD v1.0 contiene la definición funcional base cerrada internamente**; las validaciones operativas listadas en él NO están resueltas por defecto. Contrato + Anexo I prevalecen ante contradicciones.

## Arquitectura cerrada
- Un solo monorepo pnpm + TypeScript + Next.js en apps/web (Vercel) y apps/api (Railway).
- Prisma y PostgreSQL exclusivamente en apps/api. No proponer otro ORM/infraestructura salvo requerimiento aprobado.
- No introducir Redis, colas, microservicios, plataformas SaaS, funciones de IA integradas ni buckets sin aprobación.
- Secretos solo en variables seguras, nunca en commits, logs ni fixtures.
- Las migraciones Prisma deben ser versionadas y revisadas; antes de migraciones destructivas o cambios en producción, backup y autorización explícita.

## Responsabilidades exclusivas
- **Codex**: dominio, API, autenticación/RBAC, Prisma, BD, reglas de stock/reservas, integridad, tests y Railway. Trabajar principalmente en apps/api y contratos versionados de API.
- **Claude Code**: UI/UX responsive, componentes, páginas y Vercel, principalmente apps/web. Debe consumir API documentada, no crear modelos paralelos ni inventar endpoints.
- Trabajar en **ramas/PR independientes por tarea**. No ejecutar ambos agentes editando el mismo archivo en paralelo. No mergear ni desplegar cambios funcionales sin revisión/consentimiento del usuario.
- Contratos OpenAPI documentados antes de integrar pantallas. Mantener documentación del contrato coherente con backend.
- No modificar ajustes Railway/Vercel sin necesidad justificada y verificable.

## Reglas de negocio críticas de V1
- Cuatro roles en tres niveles: Gerencia, Compras, Cómputo/Presupuestos y Jefe de Obra. El jefe de obra ve solo sus obras y no sus precios/costos; validar autorización en backend.
- APU: consumos manuales por unidad de trabajo; precios y MO editables por versión de presupuesto; no jornales, coeficientes de venta o rentabilidad.
- OC para obra **o generales sin obra**, siempre con proveedor y ubicación destino identificada.
- Únicamente número de factura + fecha/hora automática de carga y usuario en OC; no módulo de facturación ni pagos.
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
- No iniciar desarrollo funcional hasta que el usuario solicite la primera tarea.
