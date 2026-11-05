# Compatibilidad y habilitación del cierre

Base de la misión: `a9a075dc159c8c59d075aa5894534e3dbaae961e`. El usuario autorizó PR/merge después de pruebas y compatibilidad. Las migraciones y cargas productivas no están autorizadas.

## Corrección técnica posterior al PR8

Base remota revalidada: `121264563b73f141e118a2a9f8093c727cc907b8`. Esta pasada conserva las diez migraciones existentes y no agrega DDL ni cambios de infraestructura. Los nuevos campos del editor están en contenido JSON; las respuestas/snapshots anteriores siguen aceptados por el contrato. No hay migraciones desde requests ni al arrancar el servidor productivo.

Integración de esta pasada: [PR #9](https://github.com/Broco-Solutions/ceo-construcciones/pull/9); el estado, SHA definitivo y observación del autodespliegue se registran allí.

El candidato corregido aprobó `check-release-compatibility.ts --runtime --browser`, salida 0, sobre `ceo_release_test_cbad63f3407243d4a141e407e746b762`: V1 poblada, HTTP y navegador, ampliación aditiva, preservación de snapshots/OC parcial/stock/obra y `No difference detected`. Evidencia privada `logs/technical-release-final.log`. Esta comprobación usa exclusivamente PostgreSQL local; no implica que el esquema productivo esté ampliado.

El auxiliar manual aplica migraciones sólo a `ceo_manual_test`, tras verificar Docker local, etiqueta y conexión loopback del preparador. No usa la base del runner automatizado. El resultado de su ejecución y el SHA integrado se registran en estado/aceptación y `manual/release.json` privado.

## Riesgo del autodespliegue

La metadata de GitHub confirma un despliegue exitoso de esa base creado por `railway-app[bot]` en el entorno `ceo-construcciones / production`. Se asume que un merge puede iniciar el autodespliegue existente. No se cambian sus ajustes ni se inicia un despliegue manual.

El nuevo proceso no ejecuta migraciones al arrancar. `schemaCapabilities` consulta en lectura las tablas/columnas disponibles. Mientras sólo existe V1:

- Obras y actividades usan proyecciones Prisma compatibles, incluidas relaciones implícitas; continúan catálogo, presupuestos anteriores, compras y stock.
- Funciones que requieren tablas nuevas responden 503 con un estado explícito de disponibilidad. La pantalla no interpreta ausencia de esquema como lista vacía ni cifra cero.
- El alta de obra conserva el contrato V1 e informa que clientes no están habilitados. Una vez disponible el esquema nuevo exige cliente activo.
- El perfil Administración no puede crearse contra un enum V1. Ninguna request ejecuta DDL ni intenta reparar el entorno.

La caché de capacidades dura diez segundos; la transición no requiere un nuevo servicio ni variables cloud. Los consumidores antiguos y los identificadores internos APU permanecen compatibles.

## Evidencia exigida al candidato

Se ejecutan por separado los verificadores API, web y E2E; se espera su salida final. La comprobación adicional de release usa una V1 poblada, el **binario nuevo**, HTTP autenticado y el navegador nuevo, luego amplía el esquema y repite. `migrate diff` no debe encontrar diferencias. CI conserva suites contra PostgreSQL real y agrega esta comprobación.

La disponibilidad condicional demuestra que el código puede integrarse antes de aplicar las migraciones; no constituye habilitación de las nuevas funciones en producción. El entorno productivo deberá ejecutar un procedimiento autorizado de migración de aplicación y completar sus datos. Esa operación queda pendiente y no se ejecutó en esta misión.

La comprobación local final terminó con salida 0 y `No difference detected`; aprobó HTTP y alta web real antes y después de migrar. Evidencia privada: `logs/release-compatibility-binary-browser.log`, base conservada `ceo_release_test_9b1620c3631c47aa9b1838f50d771a02`.

El PR y el resultado final registran commits, checks y SHA leído de `origin/main`. Antes de merge se revisa nuevamente el estado remoto y las protecciones; no se omiten checks, no se autoaprueban revisiones exigidas y no se usa force-push. Después se comprueba CI de main y se observa únicamente la metadata permitida del autodespliegue.

Registro de integración: [PR #8](https://github.com/Broco-Solutions/ceo-construcciones/pull/8). Su estado y checks distinguen el candidato de código integrado; el comentario de cierre registra SHA remoto y observación del autodespliegue, sin afirmar habilitación de las funciones nuevas.

## Candidato de carga inicial y costos — 04/11/2026

Base real PR13 `3df832de3633829d5f20b0f4e1cb566def83e081`. La migración nueva es aditiva y opcional para el binario compatible. El verificador ahora incluye un estado intermedio PR9 poblado: congela presupuesto/PDF antes de crear tablas de referencias y compara bytes/snapshot después. Se conserva la prueba de V1 poblada, API standalone y navegador, seguida por `migrate diff`. Los resultados de esta ejecución, candidato y checks están en [estado de costos](ESTADO-CARGA-INICIAL-Y-COSTOS.md), sin reutilizar resultados de PR8/9/13.

No se cambian configuraciones de autodespliegue. Un merge puede desplegar el código por la integración existente; no aplica este catálogo ni habilita las tablas nuevas en producción. No se ejecutaron comandos de infraestructura ni conexiones productivas.

## Vinculación material BASE — PR15

Corrección incremental sobre main `7dbc7b1`, sin esquema nuevo ni DDL. Campos JSON opcionales y contratos actualizados; V1 conserva proyecciones/capacidades condicionales. Compatibilidad del candidato ejecutada en `base-link-release-final.log`: V1 poblada→PR9 poblado→ampliada, HTTP y navegador, snapshots/PDF y operaciones conservados, diff vacío. Código integrado y checks se verifican en [PR15](https://github.com/Broco-Solutions/ceo-construcciones/pull/15). El complemento de datos se aplicó sólo a la base manual local; no es una migración/carga productiva ni modifica el autodespliegue existente.

## Habilitación online autorizada — 05/11/2026

La misión posterior autorizó y ejecutó respaldo puntual, las siete migraciones pendientes, BASE/DG con vinculación PR15 y accesos/datos DEMO en el entorno online existente. El registro, límites históricos, accesos privados y smoke real del dominio están en [DEMO-ONLINE.md](DEMO-ONLINE.md). Esto no cambia el carácter exclusivamente local de las ejecuciones anteriores ni los controles de sus auxiliares.
