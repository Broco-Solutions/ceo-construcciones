# CEO Construcciones - infraestructura inicial

**Estado:** scaffold tecnico SIN logica de negocio. Renzo define el PRD y desarrolla funcionalidades posteriormente.

## Stack cerrado
- Monorepo GitHub: `Broco-Solutions/ceo-construcciones` (pendiente de crear).
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

## Acciones pendientes para finalizar bootstrap
1. Crear repo PRIVADO `Broco-Solutions/ceo-construcciones` y subir este contenido; NO crear carpetas anidadas adicionales al cargarlo.
2. Conectar repo main a Railway service `api`, root `/apps/api`; confirmar acceso GitHub App.
3. Conectar el mismo repo main a Vercel proyecto `ceo-construcciones`, root `apps/web`.
4. Esperar deploy de ambos; verificar HTTPS, `/api/health`, Vercel `READY` y logs. Configurar URL publica en Vercel.
5. Antes de desarrollo de negocio, agregar autenticacion real y autorizacion por roles como primer requisito funcional; definir politica de backups y entornos.

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
