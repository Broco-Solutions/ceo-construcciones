# API — CEO Construcciones

Backend REST V1 en Next.js App Router y TypeScript, con Prisma/PostgreSQL exclusivamente en esta aplicación. El frontend está en `apps/web` y consume el contrato versionado; la implementación es full stack dentro del monorepo.

Requisitos objetivo: Node.js 24 y pnpm 10.18.3. Desde la raíz del monorepo:

```bash
pnpm install --frozen-lockfile
pnpm --filter @ceo/api db:generate
```

Configurar DATABASE_URL de una base PostgreSQL local aislada y APP_ORIGIN antes de iniciar. Preparación completa, variables, bootstrap seguro, pruebas, backups y pasos autorizables de producción: [OPERACION-BACKEND.md](../../docs/OPERACION-BACKEND.md). No utilizar una base productiva para pruebas.

```bash
pnpm --filter @ceo/api db:deploy
pnpm --filter @ceo/api dev
```

Desarrollo escucha en 3001. API `/api/v1`; healthcheck `/api/health` comprueba PostgreSQL y responde 503 si no está disponible. Autenticación mediante sesiones opacas y cookies HttpOnly; autorización por rol y obra en backend. Cantidades y precios se intercambian como cadenas decimales.

```bash
pnpm --filter @ceo/api typecheck
pnpm --filter @ceo/api test
RUN_INTEGRATION=1 pnpm --filter @ceo/api test
pnpm --filter @ceo/api build
HOSTNAME=127.0.0.1 PORT=3001 pnpm --filter @ceo/api start
```

Las integraciones requieren DATABASE_URL de loopback y nombre de base con `test`; sin RUN_INTEGRATION se omiten. `db:admin` crea el primer administrador únicamente si no existen usuarios y requiere variables BOOTSTRAP_ADMIN_* temporales. No existen credenciales predeterminadas.

Railway mantiene raíz `/apps/api`, build `npm run build`, inicio `node .next/standalone/server.js` y healthcheck `/api/health`. El build prepara una entrada estable sobre el servidor anidado del monorepo y los recursos necesarios; el runtime no depende de pnpm. `db:deploy` es una operación separada que no se ejecuta automáticamente al iniciar el servidor. La migración o el despliegue productivos requieren autorización y respaldo verificado.

- [Modelo de datos y plantillas de importación](../../docs/MODELO-DATOS.md).
- [Estado real de pruebas y despliegues](../../docs/ESTADO-PROYECTO.md).
- [PRD funcional V1](../../docs/PRD-ETAPA-1.md).

## Convenciones del contrato


REST `/api/v1`, nombres de recursos en inglés y mensajes en español. JSON `{data: ...}`; listados `{data: [], pagination: {page,pageSize,total}}`, pageSize <=100. Decimales en strings base 10, nunca floats JSON económicos. Errores `{error:{code,message,details?}}` con 400/401/403/404/409/422/429/500. Fechas ISO UTC. Sesión opaca cookie HttpOnly SameSite Lax Secure en producción y hash persistido; mutaciones con Origin validado contra APP_ORIGIN para proxy same-origin. Auditoría en misma transacción que operación de negocio. Aislamiento Serializable con reintentos limitados; claves de idempotencia para recepciones y movimientos. Datos sensibles no incluidos en errores/logs.
