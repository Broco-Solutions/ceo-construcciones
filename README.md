# CEO Construcciones - infraestructura inicial

**Estado:** infraestructura base operativa, SIN lógica de negocio. Definición funcional base aprobada internamente en [PRD Etapa 1 v1.0](docs/PRD-ETAPA-1.md); validaciones operativas con CEO pendientes. Desarrollo con Codex/Claude Code aún no iniciado.

## Stack cerrado
- Monorepo GitHub: `Broco-Solutions/ceo-construcciones` (creado, privado, rama `main`).
- Node.js 24, pnpm 10, TypeScript, Next.js App Router en ambas apps.
- Frontend: `apps/web`, despliegue en Vercel.
- Backend REST: `apps/api`, despliegue en Railway. Healthcheck GET `/api/health`.
- Base de datos: PostgreSQL en Railway, ORM Prisma (schema vacio, sin migraciones).
- Archivos: Railway Bucket S3-compatible solo cuando exista requerimiento; no se provisiona ahora.
- Dos proyectos de despliegue, una sola rama `main`, sin microservicios ni Redis ni colas ni Kubernetes.

## Entornos
- Produccion Railway: proyecto `ceo-construcciones`; `api` tiene root `/apps/api`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PORT=3000`, `HOSTNAME=0.0.0.0`, `NODE_ENV=production`, inicio `node .next/standalone/server.js` y healthcheck `/api/health`. En Railway, el contenedor no debe depender de `pnpm`.
- Produccion Vercel: equipo Broco Solutions, proyecto `ceo-construcciones-web`, root `apps/web`, Next.js.
- Vercel: `NEXT_PUBLIC_API_URL=https://api-production-7324.up.railway.app` configurada. NO exponer `DATABASE_URL` en Vercel.
- Railway: URL publica API necesaria para comunicar el frontend; CORS permitido exclusivamente desde dominio frontend si se accede cross-origin desde browser.
- Se recomienda que el frontend llame a la API a traves de un proxy server-side/rewrite en Vercel para simplificar CORS y cookies. Definir una unica via antes de implementar auth.
- No ejecutar migraciones de produccion automaticamente hasta definir revisiones/backup.

## Estado de infraestructura (16/10/2026)
- Repo GitHub: https://github.com/Broco-Solutions/ceo-construcciones (privado, rama `main`).
- Railway: https://railway.com/project/d2fb9213-5508-4b3d-91a8-b6bd86451ceb - servicio `api` desde `main` (`/apps/api`) y PostgreSQL.
- API publica: https://api-production-7324.up.railway.app/api/health
- Vercel: https://vercel.com/broco-solutions/ceo-construcciones-web - proyecto `ceo-construcciones-web`, conectado a `main`, root `apps/web`.
- `NEXT_PUBLIC_API_URL` configurada en Vercel para development/preview/production.
- Next.js actualizado por parche de seguridad. Railway API deployment `SUCCESS` y `/api/health` paso el healthcheck de Railway el 16/10/2026.
- No se implemento funcionalidad de negocio.

## Antes de desarrollar funcionalidades
1. Definir CORS o proxy same-origin antes de usar cookies de sesion desde la web.
2. Definir autenticacion y autorizacion por roles en el PRD aprobado.
3. Aplicar migraciones Prisma versionadas con respaldo; nunca `db push` a produccion.
4. Bucket Railway solo cuando se requieran adjuntos.

## Trabajo local
```bash
corepack enable
pnpm install
pnpm dev:web
pnpm dev:api
```

## Documentación funcional y continuidad
- [PRD Etapa 1 v1.0](docs/PRD-ETAPA-1.md): alcance funcional consolidado y criterios de aceptación.
- [Análisis Excel](docs/ANALISIS-EXCEL-PRESUPUESTOS.md): hallazgos y reglas pendientes.
- [Instrucciones globales del proyecto ChatGPT](docs/INSTRUCCIONES-PROYECTO-CHATGPT.md): rol del orquestador, fuentes y agentes.
- [Estado del proyecto](docs/ESTADO-PROYECTO.md): situación real y próximo paso.
- [AGENTS.md](AGENTS.md): reglas vinculantes para agentes de código.

## Reglas para Codex / Claude Code
- Respetar la estructura existente y NO introducir frameworks alternativos sin justificacion.
- Gestionar datos mediante Prisma y migraciones versionadas; nunca `db push` sobre produccion.
- Autenticacion y permisos se validan en servidor, no solo ocultando controles de UI.
- Secretos unicamente en variables Railway/Vercel; nunca en Git.
- Implementar tests de flujos criticos cuando se definan.
- Mantener interfase en espanol y priorizar rapidez, simplicidad y uso movil en obra.
- No agregar módulos por inferencia: tomar el PRD v1.0, sujeto al contrato/Anexo I y validaciones explícitas, como fuente del alcance.
