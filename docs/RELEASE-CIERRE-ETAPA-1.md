# Compatibilidad y habilitación del cierre

Base de la misión: `a9a075dc159c8c59d075aa5894534e3dbaae961e`. El usuario autorizó PR/merge después de pruebas y compatibilidad. Las migraciones y cargas productivas no están autorizadas.

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

La comprobación local final terminó con salida0 y `No difference detected`; aprobó HTTP y alta web real antes y después de migrar. Evidencia privada: `logs/release-compatibility-binary-browser.log`, base conservada `ceo_release_test_9b1620c3631c47aa9b1838f50d771a02`.

El PR y el resultado final registran commits, checks y SHA leído de `origin/main`. Antes de merge se revisa nuevamente el estado remoto y las protecciones; no se omiten checks, no se autoaprueban revisiones exigidas y no se usa force-push. Después se comprueba CI de main y se observa únicamente la metadata permitida del autodespliegue.

Registro de integración: [PR #8](https://github.com/Broco-Solutions/ceo-construcciones/pull/8). Su estado y checks distinguen el candidato de código integrado; el comentario de cierre registra SHA remoto y observación del autodespliegue, sin afirmar habilitación de las funciones nuevas.
