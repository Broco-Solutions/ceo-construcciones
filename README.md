# CEO Construcciones

Monorepo del sistema de obras, presupuestos, compras e inventario de CEO Construcciones. El backend V1 se implementa en `apps/api`; su revisión, pruebas y estado de despliegue se registran en [ESTADO-PROYECTO.md](docs/ESTADO-PROYECTO.md). Las validaciones operativas con CEO siguen abiertas según el [PRD Etapa 1 v1.0](docs/PRD-ETAPA-1.md); el contrato y Anexo I prevalecen.

## Arquitectura

- Node.js 24, pnpm 10.18.3, TypeScript y Next.js App Router.
- `apps/api`: API REST `/api/v1`, Prisma/PostgreSQL y Railway.
- `apps/web`: frontend Next.js en Vercel. Durante el cierre de Etapa 1 puede ser implementado por Codex junto al contrato API.
- Sesiones seguras, autorización por rol/obra y auditoría en backend.
- Stock físico, reservas y disponibilidad separados; operaciones transaccionales.
- Sin microservicios, Redis, colas, IA integrada ni servicios externos nuevos.

## Trabajo local

Con Node 24 y una base PostgreSQL local aislada:

```bash
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
pnpm --filter @ceo/api db:generate
```

Configurar DATABASE_URL y APP_ORIGIN en un entorno seguro; ver [guía de operación](docs/OPERACION-BACKEND.md) para crear la base aislada y el primer administrador.

```bash
pnpm --filter @ceo/api db:deploy
pnpm dev:api
```

La API de desarrollo escucha en 3001. `GET /api/health` verifica PostgreSQL; HTTP 200 indica conectado y HTTP 503 indisponible. El frontend se ejecuta por separado con `pnpm dev:web`.

## Verificación

```bash
pnpm --filter @ceo/api typecheck
pnpm --filter @ceo/api test
RUN_INTEGRATION=1 pnpm --filter @ceo/api test
pnpm --filter @ceo/api build
```

Las integraciones sólo aceptan una base de loopback cuyo nombre contenga `test`. Sin RUN_INTEGRATION se omiten; no interpretar una ejecución sin esa variable como prueba contra PostgreSQL.

## Despliegue y seguridad

Proyecto Railway: [ceo-construcciones](https://railway.com/project/d2fb9213-5508-4b3d-91a8-b6bd86451ceb). Vercel: [ceo-construcciones-web](https://vercel.com/broco-solutions/ceo-construcciones-web). La API inicial existente no acredita que la V1 de esta misión ya esté desplegada.

Railway mantiene la raíz `/apps/api`, inicio `node .next/standalone/server.js` y healthcheck `/api/health`. Build y preparación standalone se documentan en la guía de operación. DATABASE_URL pertenece exclusivamente al backend. La integración web usa proxy same-origin para las cookies de sesión; no exponer secretos en Vercel ni depender de cookies de terceros.

No aplicar migraciones, mergear ni desplegar producción sin revisión y autorización explícita. Antes de una migración productiva: backup restaurable, comprobación de retención y plan de recuperación. El contrato exige backups al menos semanales con 30 días de retención; sólo se consideran operativos con evidencia verificable.

## Documentación

- [PRD Etapa 1 v1.0](docs/PRD-ETAPA-1.md): alcance y validaciones pendientes.
- [Operación del backend](docs/OPERACION-BACKEND.md): instalación, variables, pruebas, bootstrap, backups y pasos productivos pendientes de autorización.
- [Modelo de datos e importaciones](docs/MODELO-DATOS.md): entidades, integridad, snapshots y plantillas controladas.
- [API](apps/api/README.md): comandos y convenciones.
- [Análisis del Excel](docs/ANALISIS-EXCEL-PRESUPUESTOS.md): APU y ambigüedades de origen.
- [Estado del proyecto](docs/ESTADO-PROYECTO.md): hechos verificados y pendientes reales.
- [Instrucciones globales](docs/INSTRUCCIONES-PROYECTO-CHATGPT.md) y [AGENTS.md](AGENTS.md): continuidad y responsabilidades.

El cierre funcional de Etapa 1 está regido por `CEO_PLAN_MAESTRO_CODEX.md`: incluye clientes/obras, Actividades de obra, costos y presentación comercial, compras, importaciones e indicadores. No modifica infraestructura ni ejecuta cambios sobre producción.
