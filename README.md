# CEO Construcciones - infraestructura inicial

**Estado:** scaffold tecnico SIN logica de negocio. Renzo define el PRD y desarrolla funcionalidades posteriormente.

## Stack cerrado
- Monorepo GitHub: `Broco-Solutions/ceo-construcciones` (creado, privado, rama `main`).
- Node.js 24, pnpm 10, TypeScript, Next.js App Router en ambas apps.
- Frontend: `apps/web`, despliegue en Vercel.
- Backend REST: `apps/api`, despliegue en Railway. Healthcheck GET `/api/health`.
- Base de datos: PostgreSQL en Railway, ORM Prisma (schema vacio, sin migraciones).
- Archivos: Railway Bucket S3-compatible solo cuando exista requerimiento; no se provisiona ahora.
- Dos proyectos de despliegue, una sola rama `main`, sin microservicios ni Redis ni colas ni Kubernetes.

## Entornos
- Produccion Railway: proyecto `ceo-construcciones`; `api` tiene root `/apps/api`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `PORT=3000`, `NODE_ENV=production` y healthcheck `/api/health`.
- Produccion Vercel: equipo Broco Solutions, proyecto `ceo-construcciones`, root `apps/web`, Next.js.
- Vercel: configurar `NEXT_PUBLIC_API_URL` con el HTTPS real de la API cuando Railway tenga dominio, NO exponer `DATABASE_URL` en Vercel.
- Railway: URL publica API necesaria para comunicar el frontend; CORS permitido exclusivamente desde dominio frontend si se accede cross-origin desde browser.
- Se recomienda que el frontend llame a la API a traves de un proxy server-side/rewrite en Vercel para simplificar CORS y cookies. Definir una unica via antes de implementar auth.
- No ejecutar migraciones de produccion automaticamente hasta definir revisiones/backup.

## Estado de infraestructura (16/10/2026)
- Repo GitHub: https://github.com/Broco-Solutions/ceo-construcciones (privado, rama `main`).
- Railway: https://railway.com/project/d2fb9213-5508-4b3d-91a8-b6bd86451ceb - servicio `api` desde `main` (`/apps/api`) y PostgreSQL.
- API publica: https://api-production-7324.up.railway.app/api/health
- Vercel: https://vercel.com/broco-solutions/ceo-construcciones-web - proyecto `ceo-construcciones-web`, conectado a `main`, root `apps/web`.
- `NEXT_PUBLIC_API_URL` configurada en Vercel para development/preview/production.
- Next.js actualizado por parche de seguridad; verificar deployment Railway en `SUCCESS` y healthcheck en vivo.
- No se implemento funcionalidad de negocio.

## Antes de desarrollar funcionalidades
1. Confirmar HTTP 200 real de `/api/health` y deployment API `SUCCESS`.
2. Definir CORS o proxy same-origin antes de usar cookies de sesion desde la web.
3. Definir autenticacion y autorizacion por roles en el PRD aprobado.
4. Aplicar migraciones Prisma versionadas con respaldo; nunca `db push` a produccion.
5. Bucket Railway solo cuando se requieran adjuntos.

## Trabajo local
```bash
corepack enable
pnpm install
pnpm dev:web
pnpm dev:api
```

## Reglas para Codex / Renzo
- Respetar la estructura existente y NO introducir frameworks alternativos sin justificacion.
- Gestionar datos mediante Prisma y migraciones versionadas; nunca `db push` sobre produccion.
- Autenticacion y permisos se validan en servidor, no solo ocultando controles de UI.
- Secretos unicamente en variables Railway/Vercel; nunca en Git.
- Implementar tests de flujos criticos cuando se definan.
- Mantener interfase en espanol y priorizar rapidez, simplicidad y uso movil en obra.
- No agregar modulos por inferencia: tomar el PRD aprobado como fuente del alcance.
