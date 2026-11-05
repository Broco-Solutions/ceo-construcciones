# Demo online — habilitación del 05/11/2026

Destino autorizado: **https://ceo-construcciones.brocosolutions.com**. La demo funciona sin WSL encendido. No equivale a aceptación del piloto ni certifica datos históricos completos.

El usuario autorizó expresamente las migraciones de aplicación, carga inicial verificada y accesos/datos mínimos DEMO en el entorno online existente. Esta autorización acotada sustituye la prohibición productiva de las misiones anteriores; no cambia lo que aquéllas ejecutaron. No se crearon proyectos, bases, servicios ni dominios; no se cambiaron variables cloud, DNS, escalado, backups recurrentes ni configuración de despliegue.

## Destino y punto de recuperación

- Railway: proyecto `d2fb9213-5508-4b3d-91a8-b6bd86451ceb`, entorno `f924e0f0-4b5e-4bc8-9054-9debff6bfa0e`, API `ecbce7df-7f7c-4c1b-88d0-87dffec35a3e`, Postgres `1df48cf0-edaa-41f9-a063-39e681af962b`.
- Vercel: `prj_rK0JufMuVjH5ByvnqwdVlTuUtpAa`, equipo `team_cSvENFmHaefUGjsD0g6X4pyC`.
- Partida revalidada: main `9275e832fbb29935d973468cef374b1fe035460a`. Web READY sobre ese SHA; API SUCCESS `25e8bacb1bd1f8433ccecd51d7f97724088a10e5`, cuyo árbol API coincide con la partida. PR16 fue omitido correctamente en API por ser frontend. `APP_ORIGIN` coincide con el dominio público.
- Respaldo **antes de cualquier escritura**: `~/.local/state/ceo-construcciones-codex/online/before-demo-20261105T010928Z.dump`, privado, 94.250 bytes, SHA256 `33284cab654b7007fc71c0094b83ad7c41a34a28da3659b14cc0a93fe8019307`. PostgreSQL/pg_dump 18.6; 218 entradas. `pg_restore --list` y decodificación completa a `/dev/null` correctos, firma PGDMP y SHA remoto/local idénticos. Listado y recibo privados adyacentes. No se realizó una restauración productiva ni se configuró un sistema de backups.
- Inventario previo: 2 usuarios, 6 sesiones, 1 obra, 1 material y 1 proveedor; cero actividades, precios, presupuestos, pedidos, OC, recepciones, saldos y movimientos. Se conservaron los registros anteriores y sus claves. No se resetearon contraseñas.

## Migraciones realmente aplicadas

Prisma **6.19.0**, por SSH normal autenticado, IDs explícitos y comprobación previa de checksums locales/remotos y del historial aplicado. Sólo `prisma migrate deploy`, seguido de `migrate status` correcto: once migraciones aplicadas y esquema actualizado.

Las siete pendientes aplicadas a las 01:12 UTC fueron `20261102000100_clients_and_commercial_baseline`, `20261102000200_budget_editor`, `20261103000100_reception_and_invoice`, `20261103000200_explicit_zero_prices`, `20261103000300_trace_coverage_and_order_amounts`, `20261103000400_activity_direct_cost`, `20261104000100_reference_cost_catalog`.

No se modificaron migraciones, checksums, scripts de arranque ni requests. Las seis capacidades de aplicación se comprobaron disponibles después de migrar.

## Catálogo real online

Se recompusieron ambos manifiestos desde originales privados, sin macros. BASE SHA256 `5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e`; DG `0e2e7b84dec93f910a5bd826c25bc61d05856a8952aaaea38f0c3ae2bb6facc0`. Paquete con hashes de manifiestos, originales, actor Gerencia existente y recibo de respaldo. Dry-run antes de aplicar. El ejecutor `apps/api/scripts/online-release.ts` llama a `applyCatalogInventory`, incluida la vinculación PR15, sin SQL alternativo ni endpoint público.

| Entidad de origen CEO | Resultado online |
|---|---:|
| Rubros | 17 |
| Materiales PRECIOS / identidades de receta | 222 / 94 |
| Presentaciones originales / complementarias PR15 | 222 / 12 |
| Precios históricos originales / referencias de composición PR15 | 372 / 12 |
| Recursos MO / tarifas BASE + DG | 78 / 27 + 10 |
| Actividades / definiciones de costos | 146 / 146 |
| Materiales vinculados / directas legítimas / parciales | 67 / 3 / 76 |
| MO calculada | 74 |
| Plantilla operativa BASE | 1 |

Se verificó en persistencia que todas las referencias elegidas de las 67 composiciones existen y corresponden al material. Segunda aplicación BASE y DG: **cero altas, cero conflictos, 67 ya vinculadas**. La carga preservó exactamente los conteos de clientes, obras, proveedores, presupuestos, pedidos, OC, recepciones, saldos y movimientos: no creó operaciones. Las 1.447 correspondencias online no se fuerzan a las cifras locales, que incluían instalaciones intermedias.

Permanecen los 76 casos parciales con causas por registro en [resultados de carga](CARGA-INICIAL-RESULTADOS.md) y manifiesto privado. Las referencias históricas no son precios actuales. No se inventaron fechas, IVA, rendimientos, equivalencias ni composiciones; DG no se convirtió en padrón operativo.

## Accesos y datos DEMO

Credenciales online **distintas de las locales**: `~/.local/state/ceo-construcciones-codex/online/credenciales-online.json` (600). Consultar exclusivamente ese archivo privado para los correos y claves vigentes de los cinco perfiles. Las identidades creadas en PR17 conservan su ID, rol, asignaciones e historial al cambiar el acceso. El auxiliar reconoce el ID y la auditoría de creación; nunca recrea una identidad ausente ni vuelve a instalar el correo anterior. Cuentas anteriores y credenciales locales intactas. No hay contraseñas predeterminadas ni reset al arrancar.

Muestra separada, con prefijo DEMO: cliente ficticio con dos obras, Galpón/Patio, tres corralones ficticios, un material/presentación/actividad y plantilla sintéticos. No hay comunicaciones reales. El Jefe está asignado sólo a la primera obra. Los aumentos numéricos se registraron exclusivamente en el material DEMO, **nunca en las series BASE**.

En la primera obra: presupuesto sintético R1/R2, pedido 40 → OC 40 → recepción 20 → consumo 5, stock físico/disponible 15 e importe de factura informativo. En la segunda: presupuesto desde BASE conectada, actividad `REVOQUE HIDROFUGO CAPA AISLADORA` (`COSTO!B35`), cantidad 10, VARIOS directo 500, recargo 50%, R1 y PDF comercial. Identificadores privados para repetir el recorrido: `online/demo-state.json`. No se borra automáticamente lo que el usuario modifique.

## Recorrido recomendado

1. Entrar por el dominio con Gerencia; ver Clientes → DEMO y sus dos obras.
2. Catálogo → Costos de referencia: Materiales y Mano de obra; distinguir referencias históricas y pendientes.
3. Actividades de obra → buscar **REVOQUE HIDROFUGO CAPA AISLADORA**: materiales calculados, tres referencias y consumo comprobado; sin modificar sus precios para experimentar.
4. Presupuestos → **DEMO · Presupuesto desde BASE CEO conectada**: cantidades, VARIOS, recargo y PDF R1.
5. Para probar aumentos sin contaminar CEO: material **DEMO · Material sintético (no cotización CEO)**, misma presentación Bolsa 25 kg y fuente DEMO. Actividad **DEMO · Actividad vinculada para cambiar precios**. Registrar otra referencia explícita compatible; consultar costo y revisar diferencias en **DEMO · Costos, borrador y revisiones** antes de aceptar. R1 permanece en 91.500 y R2 en 97.500; las pruebas no requieren reconstruir BASE a mano.
6. Pedidos/Órdenes/Recepciones/Stock: continuar sólo registros DEMO. Administración ve la factura informativa; Jefe sólo su obra y sin costos. Indicadores filtran cliente/proveedor DEMO.

## Evidencia y reproducción controlada

- Verificadores locales separados, API/PostgreSQL reales; resultados finales y PR en [estado](ESTADO-PROYECTO.md). Nunca se apuntaron las suites destructivas a online.
- `node apps/web/scripts/demo-online-smoke.mjs VERIFY_EXISTING_ONLINE_DEMO`: smoke acotado por dominio y credenciales privadas; usa API pública, claves idempotentes y estado persistido, sin borrar ni resetear. Guarda sólo evidencia privada; revisarlo antes de repetir sobre datos que se hayan editado.
- Comprobado online: login/cookie Secure+HttpOnly/logout de cinco roles, permisos servidor y asignaciones; catálogos/MO/precios/actividades sin tablas ausentes; BASE conectada y PDF descargado; borrador explícito, R1/R2; pedido/OC/recepción/consumo/stock/factura e indicadores.
- Caso sintético online: costo 6.100 → 6.500, venta 91.500 → 97.500; cantidad 10, consumo 4 y recargo 50 sin cambios. El borrador no cambió hasta aceptar. SHA del PDF R1 idéntico después de R2.
- Capturas desktop 1440 y móvil 360, PDF descargados y renderizados, resultados JSON y logs: `~/.local/state/ceo-construcciones-codex/online/`. No se publican originales, tarifas, credenciales ni listados económicos de CEO en Git.
- Auxiliares locales conservan sus rechazos a destinos online. El ejecutor online no corre al iniciar servicios; exige IDs/origen/host/esquema concretos, actor autorizado, paquete de fuentes, respaldo verificado y confirmación `APPLY_CEO_EXISTING_ONLINE_DEMO`. No es un importador universal.

El código integrado/checks/despliegues definitivos se registran en el cierre del PR de habilitación. Los datos históricos incompletos se informan aparte; que esta demo funcione no los convierte en completos ni implica aceptación del piloto.

| Requisito de habilitación | Código/procedimiento | Prueba y evidencia privada |
|---|---|---|
| Recuperación antes de escribir | pg_dump 18.6, pg_restore, hashes | `backup-receipt.json`, archivo `.dump` y listado |
| Esquema exacto pendiente | Prisma 6.19.0 migrate deploy/status | `migrate-apply.out`, `online-counts.json` |
| Fuente/vinculación/idempotencia | `online-release.ts`, `applyCatalogInventory` | `inspect-final.out`, `catalog-first.out`, `catalog-repeat.out`; 67 referencias físicas válidas |
| Accesos aislados y preservación | `online-demo-accounts.ts` | integración PostgreSQL: crear/repetir/preservar/rollback; `accounts.out` |
| Permisos y recorrido público | `demo-online-smoke.mjs` | `online-smoke-result.json`, capturas y PDFs privados |
| Regresión completa aislada | verificadores api/web/e2e | `local-api-final.log` (195+3), `local-web-check.log` (52), `local-e2e-check.log` (73), salida 0 |

## Simplificación posterior de accesos DEMO

El usuario autorizó renombrar/restablecer exclusivamente las cinco identidades DEMO de PR17 y, tras comprobar la restricción anterior, reducir el mínimo general de contraseña a **8 caracteres** (máximo 128). Hash scrypt, límites de intentos, cookies, controles de origen, roles y autorización permanecen. Administración sigue restringida independientemente del nombre de su correo. Contrato API, formulario y ayuda de bootstrap reflejan el mismo mínimo; ninguna clave se publica en el código o documentación.

La operación de datos se realiza por `PATCH /users/{id}` autenticado, con Gerencia al final, preflight de colisiones, auditoría y revocación sólo de sesiones de cada identidad modificada. El registro privado bajo `online/access-change/` conserva correspondencias, comparaciones de asignaciones/datos y resultados de los cinco logins públicos; no se ejecutan migraciones, cargas ni semillas. Verificar allí el resultado efectivamente aplicado.

## Administración permanente de Broco — 05/11/2026

`admin@brocosolutions.com`, nombre **Broco Solutions — Administración**, es una cuenta ordinaria permanente, GERENCIA activa y separada de las cinco DEMO. Se reutilizó su ID e historial; la clave ya coincidía y sólo se actualizó el nombre mediante administración normal auditada. Credenciales en `~/.local/state/ceo-construcciones-codex/online/credenciales-broco-admin.json`, separado de los accesos DEMO/locales. Login/logout público, Usuarios, todas las obras y módulos comprobados.

Esta identidad debe preservarse en despliegues, importaciones y limpiezas de ejemplos. No seleccionarla por rol, dominio de correo ni por ser autora de operaciones/altas DEMO: las selecciones DEMO deben limitarse a los IDs explícitos y la procedencia `CREATE_DEMO_ACCOUNT` de la entidad, nunca a su `actorId`. Cualquier cambio posterior es una operación administrativa explícita. Sin recreación/reset al arrancar, rol nuevo, excepción de login o limpieza de comprobación. Criterio y evidencia privados en `online/broco-admin/`.

## UX transversal publicada — PR19

Main `23a2d7e` se comprobó en web/API y dominio público el 05/11/2026. Los cinco accesos existentes conservan identidad/permisos; Administración restringida y la cuenta permanente Broco continúan separadas. La muestra nueva **DEMO UX** utiliza sus propios materiales y ubicaciones: mínimos 6/0, aperturas 10+10 y transferencia 2/3 (saldos 8/7), presupuesto/R1 V2 y OC sólo borrador. No se alteraron los ejemplos DEMO anteriores ni las series BASE. IDs/resultados y respaldo puntual verificado en `~/.local/state/ceo-construcciones-codex/ux-transversal/online/`. No repetir las escrituras ni borrar los datos que el usuario utilice; cualquier revisión posterior debe leer primero su estado.

Los PDF históricos anteriores se compararon byte a byte; los nuevos PDF usan V2. [Matriz y verificación](UX-TRANSVERSAL-ETAPA-1.md), [recorrido manual](PRUEBAS-MANUALES-ETAPA-1.md) y corrección del auxiliar de compatibilidad en PR20. No se cambiaron infraestructura, DNS, usuarios/contraseñas o migraciones.
