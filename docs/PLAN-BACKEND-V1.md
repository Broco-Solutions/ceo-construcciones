# Plan de ejecución Backend V1

Inicio: 22/10/2026. Rama: `codex/ceo-v1-backend`. Misión autorizada por adjunto del usuario; no incluye merge, despliegue ni migraciones productivas. `apps/web` queda fuera.

## Fuentes y estado

Se leyeron íntegramente README, AGENTS, PRD v1.0, análisis Excel, estado e instrucciones del proyecto. Se consultaron ambas carpetas globales de Drive y el contrato con Anexo I mediante el conector el 22/10/2026. El contrato excluye facturación; la referencia textual de factura se implementa según decisión explícita de misión y PRD, sin entidad contable. La entrega técnica de esta misión no equivale a aceptación contractual/piloto en producción.

## Secuencia y responsables

1. Arquitectura y contratos: convenciones abajo, esquema relacional integral y matriz conservadora; documentar decisiones pendientes.
2. Agente data: único escritor de Prisma/migración y modelo de datos. Dominio relacional completo; checks y FK además de validación API.
3. Agente security: core transaccional, sesiones, RBAC, administración y bootstrap seguro; pruebas de seguridad.
4. Agente budgeting: APU, cómputos y versiones con snapshots; pruebas numéricas e inmutabilidad.
5. Principal: catálogos/obras, compras/pedidos, inventario concurrente, recepciones, integración HTTP y pruebas PostgreSQL.
6. Una vez liberados agentes: importaciones, reportes/exports, OpenAPI exhaustivo y revisión independiente. Cada archivo tiene un único escritor.
7. Instalación limpia, generación Prisma, migración en PostgreSQL local aislado, typecheck, pruebas unitarias/integración/concurrencia, build y healthcheck real.
8. Documentación de operación, integración Claude, backups y despliegue pendiente de autorización. Commits coherentes y PR hacia main, sin merge.

## Convenciones API

REST `/api/v1`, nombres de recursos en inglés y mensajes en español. JSON `{data: ...}`; listados `{data: [], pagination: {page,pageSize,total}}`, pageSize <=100. Decimales en strings base 10, nunca floats JSON económicos. Errores `{error:{code,message,details?}}` con 400/401/403/404/409/422/429/500. Fechas ISO UTC. Sesión opaca cookie HttpOnly SameSite Lax Secure en producción y hash persistido; mutaciones con Origin validado contra APP_ORIGIN para proxy same-origin. Auditoría en misma transacción que operación de negocio. Aislamiento Serializable con reintentos limitados; claves de idempotencia para recepciones y movimientos. Datos sensibles no incluidos en errores/logs.

## Decisiones conservadoras sujetas a CEO

- GERENCIA administra usuarios/obras, ajustes e inventario inicial; COMPRAS gestiona compras y stock; COMPUTO gestiona APU/presupuestos y catálogos; JEFE_OBRA opera únicamente obras asignadas, sin datos económicos.
- Toda regla económica requiere moneda/base impositiva explícitas. No calcular IVA ni equivalencias desconocidas. Precisión decimal técnica documentada; validación operativa V-01 sigue abierta.
- Estados operativos y permisos finos son una propuesta inicial documentada. Presupuestos versionados nunca se reescriben retrospectivamente.
- Bloquear stock negativo/sobrereserva; no habilitar excepciones sin definición autorizada.
- Plantillas propias de migración con dry-run; no se declara ejecutada migración de datos CEO.
- Backups y restauración productiva requieren evidencia externa antes de declararlos operativos.

## Criterios de cierre (evidencia requerida)

Todos los módulos RF01–13 con rutas, validaciones, permisos, esquemas OpenAPI y tests pertinentes. Casos de aceptación CA01–10 en PostgreSQL aislado y pruebas de las 14 invariantes de misión. PDF OC y XLSX reportes legibles. Importaciones inválidas/duplicadas rechazadas y dry-run sin escritura. Instalación/build/typecheck verdes. PR revisable. CA11–12 que requieren archivos, capacitación/piloto/backup productivo se delimitan como pasos humanos futuros, sin fingir ejecución.

## Registro de hitos

- 22/10: lectura y rama creadas; repositorio inicial sin negocio; desarrollo en curso.

- 22/10: módulos integrados, revisión independiente corregida, contrato85rutas/114operaciones, suite72/72, build y runtime Node24 correctos; instalación limpia, dump/restauración local y audit sin avisos conocidos. Pendiente PR y verificación CI remota.
