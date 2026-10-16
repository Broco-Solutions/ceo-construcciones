# API - CEO Construcciones

Backend Next.js (App Router) desplegado como servicio `api` en Railway.

- Build: `npm run build` (incluye `prisma generate` y `next build`).
- Comando de inicio en Railway: `node .next/standalone/server.js`.
- Healthcheck: `GET /api/health` en el puerto indicado por `PORT` (produccion: 3000).
- PostgreSQL: usar exclusivamente `DATABASE_URL` en Railway, referenciando el servicio `Postgres`.
- El contenedor de ejecucion no debe depender de `pnpm` ni de herramientas de desarrollo.
- Sin funcionalidades de negocio ni modelos Prisma hasta definir los requerimientos con Renzo.
