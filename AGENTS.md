# Instrucciones para agentes de desarrollo

Lee README.md antes de cambiar codigo. Mantene monorepo pnpm con apps/web (Vercel) y apps/api (Railway). Ambos Next.js/TS; Prisma/Postgres solo en api. No crear sistemas de autenticacion improvisados ni escribir secretos. No introducir colas, monitores, Redis, microservicios, SaaS externos ni almacenamiento de documentos sin requerimiento validado. Todo modulo y cambio de dominio requiere PRD aprobado por el responsable funcional del proyecto. El borrador en docs/PRD-ETAPA-1.md NO esta aprobado para implementar. Probar build y healthcheck. Para despliegues usar Git integrado y migrations versionadas con respaldo. No modificar configuracion Railway o Vercel sin razon documentada.

## Reparto de trabajo
- Codex: backend, reglas del negocio, Prisma/PostgreSQL, API y Railway. Trabajar principalmente en apps/api.
- Claude Code: frontend, UX, responsive y Vercel. Trabajar principalmente en apps/web.
- Acordar y versionar contratos OpenAPI antes de integrar pantallas con endpoints; no inventar endpoints ni modelos en otro directorio.
- Fuente de alcance: contrato y Anexo I. docs/ANALISIS-EXCEL-PRESUPUESTOS.md registra hallazgos y pendientes; no asumir resueltas las reglas sin validar.
