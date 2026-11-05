# Operación del backend V1

Este documento prepara la operación; no autoriza migraciones ni despliegues productivos. La rama de misión y su PR requieren revisión antes de merge/deploy. El estado de pruebas y despliegues realmente ejecutados se registra en [ESTADO-PROYECTO.md](ESTADO-PROYECTO.md).

## Instalación desde cero

Requisitos objetivo: Node.js 24, pnpm 10.18.3 (fijado en `package.json`), PostgreSQL y herramientas `psql`, `pg_dump`, `pg_restore`. Prisma y la aplicación viven exclusivamente en `apps/api`. No se necesita Redis ni otro servicio.

Desde la raíz del repositorio, con Node 24 seleccionado:

```bash
node --version
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm --version
pnpm install --frozen-lockfile
pnpm --filter @ceo/api db:generate
```

El primer comando debe mostrar v24.x; no confundir el entorno objetivo con la versión realmente utilizada para una verificación puntual. `prisma generate` no aplica migraciones.

## Base de desarrollo y pruebas aisladas

Las integraciones exigen `RUN_INTEGRATION=1`, conexión a loopback y nombre de base que contenga `test`. Nunca usar la URL de Railway para estos comandos. Una opción reproducible con Docker, desde una sesión Bash, genera una contraseña efímera sin escribirla en un archivo ni mostrarla:

```bash
export POSTGRES_PASSWORD="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
docker run --detach --name ceo-postgres-test --publish 127.0.0.1:55439:5432 --env POSTGRES_PASSWORD --env POSTGRES_USER=ceo_test --env POSTGRES_DB=ceo_v1_test postgres:18
export DATABASE_URL="$(node -e 'process.stdout.write(`postgresql://ceo_test:${process.env.POSTGRES_PASSWORD}@127.0.0.1:55439/ceo_v1_test`)')"
unset POSTGRES_PASSWORD
```

Usar un puerto y nombre de contenedor libres. Si ya hay PostgreSQL local aislado, configurar `DATABASE_URL` de esa base mediante el entorno seguro; no arrancar un segundo servidor sobre el mismo puerto. Esperar que `docker exec ceo-postgres-test pg_isready --username ceo_test --dbname ceo_v1_test` confirme disponibilidad antes de migrar.

```bash
pnpm --filter @ceo/api db:deploy
export APP_ORIGIN=http://localhost:3001
pnpm --filter @ceo/api typecheck
pnpm --filter @ceo/api test
RUN_INTEGRATION=1 pnpm --filter @ceo/api test
pnpm --filter @ceo/api build
pnpm --filter @ceo/api test:runtime
```

La segunda ejecución de tests activa **todos** los archivos de integración; sin esa variable se omiten las suites contra PostgreSQL. Las pruebas crean datos de prueba con identificadores únicos y no necesitan borrar producción. La verificación inicial de la misión utilizó PostgreSQL local 16.15; la imagen productiva observada es PostgreSQL 18. La receta Docker usa 18 para poder repetir aceptación en la misma versión mayor antes de producción, la CI de la misión ya repitió y aprobó instalación, migración, flujos, build y runtime sobre PostgreSQL18 efímero; ver evidencia enlazada en ESTADO. La suite prueba los servicios; test:runtime verifica además el smoke HTTP contra el artefacto generado. Para ejecutar todo junto después del build: RUN_INTEGRATION=1 RUN_RUNTIME=1 pnpm --filter @ceo/api test. La base local puede conservarse para inspeccionar las trazas.

`db:deploy` aplica las migraciones ya versionadas. Para desarrollar una migración nueva se usa `pnpm --filter @ceo/api db:migrate --name nombre_del_cambio` sobre una base local de desarrollo, se revisa el SQL y se versiona. No usar `db push` en producción ni ejecutar `migrate dev` contra Railway.

## Variables de entorno

| Variable | Uso |
| --- | --- |
| DATABASE_URL | Conexión PostgreSQL privada del backend; obligatoria para operaciones y healthcheck. |
| APP_ORIGIN | Origen público exacto del frontend, esquema y puerto cuando corresponda, sin path; obligatorio en producción para mutaciones. |
| NODE_ENV | `production` en Railway y en el artefacto publicado; habilita cookies Secure. |
| PORT | Puerto de escucha del servidor standalone; Railway lo configura. |
| HOSTNAME | `0.0.0.0` en el contenedor para recibir tráfico. |
| COOKIE_SECURE | `true` únicamente cuando se necesita forzar Secure fuera de producción. |
| BOOTSTRAP_ADMIN_EMAIL | Correo del primer usuario, sólo durante bootstrap. |
| BOOTSTRAP_ADMIN_NAME | Nombre del primer usuario, sólo durante bootstrap. |
| BOOTSTRAP_ADMIN_PASSWORD | Contraseña inicial de 8–128 caracteres, sólo durante bootstrap. |
| RUN_INTEGRATION | `1` exclusivamente para activar las pruebas contra PostgreSQL aislado. |

Las tres variables BOOTSTRAP se retiran al terminar. No hay credenciales iniciales predeterminadas ni claves de sesión estáticas; las sesiones usan tokens aleatorios y la base conserva únicamente su hash. No exponer DATABASE_URL ni variables BOOTSTRAP en Vercel, respuestas HTTP, logs o archivos versionados. El archivo `apps/api/.env.example` contiene sólo ejemplos locales; la fuente de verdad productiva es el entorno seguro de Railway.

## Primer administrador

Con las migraciones aplicadas a una base **sin usuarios**, inyectar DATABASE_URL y BOOTSTRAP_ADMIN_* desde un gestor seguro del entorno del operador. Se puede ingresar la contraseña sin eco en una sesión Bash, sin poner su valor en el historial:

```bash
read -r -p 'Correo inicial: ' BOOTSTRAP_ADMIN_EMAIL
read -r -p 'Nombre inicial: ' BOOTSTRAP_ADMIN_NAME
read -r -s -p 'Contraseña inicial (8–128 caracteres): ' BOOTSTRAP_ADMIN_PASSWORD
export BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
pnpm --filter @ceo/api db:admin
unset BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_NAME BOOTSTRAP_ADMIN_PASSWORD
```

El script aborta si existe algún usuario, almacena hash scrypt y deja auditoría BOOTSTRAP_ADMIN. Para altas posteriores se utiliza la administración autenticada de usuarios. No reutilizar bootstrap para recuperar contraseñas ni eliminar usuarios para forzarlo.

## Inicio y comprobación del artefacto

El build genera la aplicación anidada en `.next/standalone/apps/api/server.js`. El paso final del build prepara `.next/standalone/server.js` como entrada estable y copia los recursos necesarios. Desde la raíz:

```bash
pnpm --filter @ceo/api build
HOSTNAME=127.0.0.1 PORT=3001 pnpm --filter @ceo/api start
```

En Railway, con raíz de servicio `/apps/api`, el comando de inicio estable sigue siendo:

```bash
node .next/standalone/server.js
```

El contenedor de ejecución no necesita pnpm. El build sí necesita las dependencias y el workspace del monorepo. Con DATABASE_URL configurada, comprobar desde otra terminal:

```bash
curl --fail --silent --show-error http://127.0.0.1:3001/api/health
```

Debe devolver HTTP 200 y `{ "status": "ok", "service": "ceo-api", "database": "connected" }`. Si falla la consulta PostgreSQL devuelve 503 sin revelar detalles de conexión. Los logs de errores de API no imprimen cuerpos ni credenciales. Revisar fallos HTTP, reinicios y estado del healthcheck en Railway; la existencia de logs no equivale a monitoreo contractual ya validado.

## Recorrido operativo de V1

1. Gerencia crea usuarios, obras y asignaciones; al crear una obra se crea su ubicación. Configurar galpón/patio y unidades/rubros, materiales, presentaciones explícitas y proveedores.
2. Registrar precios con moneda, unidad de cotización y criterio de IVA. Cómputo define consumos unitarios manuales del APU e importe unitario de mano de obra; carga cómputos y genera versiones de presupuesto con snapshots. Actualizar el catálogo no modifica versiones previas.
3. Seleccionar la versión de referencia para seguimiento. No presentar el resultado como validado por CEO hasta cotejar IVA, conversiones y redondeo con sus datos reales.
4. Jefe de Obra crea pedidos de materiales de su obra. Compras revisa necesidades y disponibilidad, reserva stock o registra cotizaciones de proveedores y selección manual. Reservar no mueve el físico.
5. Crear OC con proveedor, destino y líneas; puede ser general para galpón/patio. Revisar y emitir el borrador. Descargar PDF. El número es único y puede tener saltos.
6. Registrar recepciones parciales o totales por líneas, remito y ubicación real. Usar Idempotency-Key estable para reintentos. La recepción actualiza existencias y pendiente de OC en la misma transacción; no cargar nuevamente el mismo evento con otra clave.
7. Confirmar transferencias, satisfaciendo reservas cuando corresponde. Registrar consumo únicamente desde la ubicación de la obra, devoluciones hacia galpón/patio y ajustes con motivo según permisos. Los mínimos generan avisos consultables, sin compras automáticas.
8. Tras un pago realizado fuera del sistema, registrar únicamente el número de factura de la OC. La API guarda fecha de carga y actor; no es fecha de pago.
9. Consultar informes previsto/pedido/comprado/consumido en cantidades, recibido y disponible según corresponda. Exportar a Excel. No interpretar esos datos como avance financiero o rentabilidad.

La matriz de permisos y los endpoints completos se documentan en el contrato OpenAPI y la guía de integración. Un Jefe de Obra sólo accede a sus obras y no recibe importes. No compartir usuarios. Las operaciones críticas quedan auditadas.

## Importaciones y conservación del histórico

Las plantillas, columnas, validación, hash de confirmación, idempotencia y orden de carga están documentados en [MODELO-DATOS.md](MODELO-DATOS.md). Obtener `template`, ejecutar `preview`, corregir cada error y confirmar con el hash del mismo contenido. No hay interpretación automática de documentos de proveedores.

Sólo se migran proveedores, obras activas y OC abiertas con sus cantidades pendientes. Inventario inicial proviene del recuento de CEO. Conservar el histórico restante como archivo exportado con fecha, responsable y SHA-256; acordar corte operativo para evitar doble carga en CEO Obras y el sistema nuevo. Los formatos reales y la extracción siguen pendientes hasta recibir los archivos.

## Respaldo y restauración

Obligación contractual: respaldo **al menos semanal**, retención **mínima de 30 días**, y restauración comprobada antes del piloto/producción. Registrar propietario, calendario, retención efectiva, ubicación y evidencia de una restauración; no declarar esta obligación cumplida por el mero hecho de tener PostgreSQL provisionado. La disponibilidad mensual contractual objetivo es 99,5 %, sujeta a las exclusiones del contrato.

Antes de producción, confirmar en Railway el plan y las opciones realmente disponibles de backups automáticos, habilitar el calendario autorizado y comprobar que la política retiene una copia de más de 30 días. Si las opciones contratadas no alcanzan, acordar un procedimiento de pg_dump cifrado y almacenamiento con retención, sin agregar infraestructura no aprobada. Evidencia read-only comunicada durante la misión: API existente en main, último despliegue exitoso observado del 16/10, raíz `/apps/api`, inicio standalone y healthcheck existentes. Los nombres de variables observados fueron DATABASE_URL, HOSTNAME, NODE_ENV y PORT; APP_ORIGIN falta y debe configurarse en el cambio autorizado. PostgreSQL usa imagen 18 y volumen de 50.000 MB montado en `/var/lib/postgresql/data`. El conector disponible no expuso calendario/listado de copias y no se verificó restauración ni retención. No se solicitaron ni leyeron valores secretos. La CLI Railway instalada no resultó ejecutable; la preparación productiva se completa en la interfaz existente.

En Railway revisar las políticas semanal y mensual disponibles: no asumir que cuatro semanas equivalen a 30 días. Comprobar explícitamente el rango de retención y la continuidad de copias que asegura al menos 30 días. Hasta obtener esa evidencia y una restauración real, backups contractuales permanecen **sin verificar**.

Exportación lógica independiente de PostgreSQL, ejecutada por el operador autorizado con DATABASE_URL inyectada de forma segura y `CEO_BACKUP_FILE` apuntando a un archivo **fuera del repositorio**. El siguiente comando pasa las credenciales por entorno al proceso hijo, sin incluirlas en argumentos ni mostrarlas:

```bash
node <<'JS'
const { execFileSync } = require('node:child_process');
const path = require('node:path');
let u;
try { u = new URL(process.env.DATABASE_URL); }
catch { console.error('DATABASE_URL inválida; revise el entorno seguro'); process.exit(1); }
const file = process.env.CEO_BACKUP_FILE;
if (!file || !path.isAbsolute(file) || path.resolve(file).startsWith(process.cwd() + path.sep)) {
  console.error('Configure CEO_BACKUP_FILE absoluta y fuera del checkout'); process.exit(1);
}
process.umask(0o077);
execFileSync('pg_dump', ['--format=custom', '--file', file], {
  stdio: 'inherit',
  env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    ...(u.searchParams.has('sslmode') ? { PGSSLMODE: u.searchParams.get('sslmode') } : {}) }
});
JS
sha256sum "$CEO_BACKUP_FILE"
pg_restore --list "$CEO_BACKUP_FILE"
```

Restringir permisos del directorio/archivo al operador (`umask 077` antes del dump), cifrar y conservar fuera del checkout. El dump contiene información sensible. Usar pg_dump y pg_restore de PostgreSQL 18 o compatibles con el servidor 18 observado; las herramientas 16 locales no sirven para respaldar un servidor 18. La restauración debe usar una instancia aislada de versión compatible, como el contenedor 18 de la receta. La lista del dump y su hash prueban que existe un archivo, **no** que se puede restaurar.

Restaurar sobre una base nueva y vacía de un PostgreSQL local aislado. Ejemplo con el contenedor de pruebas anterior y el dump fuera del repositorio; no se usa la URL productiva como destino:

```bash
docker exec ceo-postgres-test createdb --username ceo_test ceo_restore_test
docker cp "$CEO_BACKUP_FILE" ceo-postgres-test:/tmp/ceo-restore.dump
docker exec ceo-postgres-test pg_restore --exit-on-error --no-owner --no-acl --username ceo_test --dbname ceo_restore_test /tmp/ceo-restore.dump
docker exec ceo-postgres-test psql --username ceo_test --dbname ceo_restore_test --command 'SELECT count(*) FROM "User"; SELECT count(*) FROM "StockBalance";'
```

Si `ceo_restore_test` ya existe, elegir otro nombre nuevo; no borrar una base existente para continuar. Validar migraciones, cantidades, stock/reservas, auditoría y healthcheck apuntando a la restaurada, sin modificar los datos originales. Registrar fecha, versión de pg_dump/servidor, identificador de copia, hash, resultado de restauración y responsable; luego retirar de forma controlada la copia temporal. La restauración de un respaldo real sobre producción exige una autorización específica y un plan de recuperación.

## Preparación de Railway: ejecución productiva pendiente de autorización

No ejecutar esta secuencia mientras la misión sólo autorice preparar el despliegue. Las tareas de PR, build y pruebas no modifican producción.

1. Revisar y aprobar PR y SQL de migraciones. Confirmar qué servicio/ambiente se usa, la raíz `/apps/api`, comandos, runtime Node 24 y existencia de PostgreSQL. Conservar evidencia del despliegue anterior y un plan de recuperación compatible con la migración.
2. Obtener autorización explícita para el cambio productivo. Confirmar ventana, pausa de escrituras/corte de migración y responsable. Hacer backup previo y restaurarlo en aislado; verificar política semanal y retención de 30 días. No continuar si falta evidencia de respaldo restaurable.
3. Configurar mediante variables seguras del servicio API `DATABASE_URL` referenciando PostgreSQL, `APP_ORIGIN` con el origen real que usará el frontend, `NODE_ENV=production`, `HOSTNAME=0.0.0.0` y el puerto de Railway. No copiar valores al repositorio ni modificar Vercel desde esta tarea.
4. Desde una sesión de operador con el checkout aprobado, dependencias instaladas y conexión productiva inyectada de forma segura, ejecutar **una vez**, tras el backup y aprobación:

   ```bash
   pnpm --filter @ceo/api exec prisma migrate status
   pnpm --filter @ceo/api db:deploy
   pnpm --filter @ceo/api exec prisma migrate status
   ```

   No agregar migraciones destructivas ni automatizarlas al arranque. Revisar manualmente cualquier fallo; no usar `migrate reset`, `db push` ni `migrate resolve` como solución automática.
5. Si la base no tiene usuarios, ejecutar el bootstrap seguro anterior y retirar BOOTSTRAP_ADMIN_*. Si ya hay usuarios, no ejecutar bootstrap.
6. Tras aprobar merge/deploy por separado, desplegar la revisión aprobada usando el mecanismo GitHub de Railway existente. Build del servicio: `npm run build` desde `/apps/api`, que genera Prisma, Next y entrada standalone. Inicio: `node .next/standalone/server.js`. Healthcheck: `/api/health`. Si la configuración real difiere, justificar y aprobar su ajuste; no cambiar ajustes por suposición.
7. Verificar HTTP 200 del healthcheck y conectividad BD, login/logout, autorización por obra y ausencia de precios para Jefe, una operación piloto controlada y exportación. Revisar logs sin secretos y registrar commit/despliegue/resultado en ESTADO-PROYECTO. Un healthcheck exitoso no sustituye aceptación de todos los flujos.
8. Ante fallo, detener nuevas escrituras y evaluar la causa. Volver al artefacto previo sólo si es compatible con el esquema ya migrado. Restaurar la base no es un rollback automático: requiere autorización, preservar el estado fallido y controlar pérdida de datos.

Hasta completar esa secuencia con autorización, la V1 permanece preparada para revisión y pruebas; la existencia de la API inicial en Railway no acredita que esta versión esté desplegada.
