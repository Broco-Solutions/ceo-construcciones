# Aceptación ejecutada del cierre de Etapa 1

Verificación local del 03/11/2026 sobre PostgreSQL 18 aislado. Los comandos cargan `local.env` privado sin imprimirlo. Los verificadores crean bases nuevas, conservan las existentes y esperan los procesos hasta su código de salida. El CI del candidato y la integración se registran en [estado](ESTADO-CIERRE-ETAPA-1.md).

## Suites completas

| Verificación | Resultado comprobado | Evidencia privada |
|---|---|---|
| `bash CEO_Verificar_Local.sh api` | 163 aprobadas, build/typecheck y 3 runtime aprobadas; salida 0 | `logs/final-api-pdf.log`, corrida `20261103_141545_2-api` |
| `bash CEO_Verificar_Local.sh web` | 47 unitarias, typecheck y build aprobados; salida 0 | `logs/final-web-verified.log`, corrida `20261103_140910_3-web` |
| E2E anterior al último caso BASE | 52/52 contra API standalone, web de producción y PostgreSQL reales; salida 0 | corrida `20261103_135330_3-e2e` |
| E2E candidato con BASE real | **53/53 aprobados**, builds API/web y salida 0 | `logs/final-e2e-verified.log` |
| Migración V1 poblada → ampliada | Código fuente, datos preservados y diff sin diferencias aprobados | `logs/release-compatibility-activities.log` |
| Binarios HTTP y navegador V1 → ampliada | **Aprobado**, esquema previo/ampliado, alta web y diff sin diferencias; salida 0 | `logs/release-compatibility-binary-browser.log` |
| DG REV C real → PostgreSQL → R1/R2/PDF/necesidades | Aprobado con diferencias y composición física parcial expresamente señaladas | `logs/dg-postgresql-release.log`; `dg-postgresql-release/verification.json` |

En la primera fase API aparecen tres runtime omitidas por su guard de entorno; después se ejecutan y pasan por separado en el mismo verificador. No son tres integraciones faltantes. Las pruebas de dominio/API no se sustituyen por mocks. La suite web unitaria y algunos casos existentes de error/transporte simulado comprueban únicamente esos límites; los recorridos positivos del cierre recorren API y base reales.

## Escenarios del plan y evidencia

| Escenarios | Ejecución y comprobaciones |
|---|---|
| T01–T02 | `closure-access.integration.test.ts` y `closure.spec.ts`: cliente con dos obras, ficha/filtros, inactivación, CUIT normalizado, alta nueva con cliente activo e histórico nullable |
| T03–T06 | `access-contract`, `contracts`, `catalog-integration-gaps`, `closure-access` y regresión `auth/flows/journey`: scopes por ID/lista/exportación, DTO sin economía, proveedores e historia |
| T07–T09 | `commercial.integration`, `closure.spec`, `zz-base.spec`: enlaces V1, copia sin vínculo vivo, cantidades/foco, BASE real; capturas escritorio/móvil |
| T10–T12 | `commercial.test` y `commercial.integration`: diferencias deliberadas, ajuste manual, futuros/inactivos, directos/VARIOS, incluidos/excluidos; 3 millones × 1,5 = 4,5 millones sin alterar materiales |
| T13–T14 | Parser acotado con rechazo de código/textos inválidos; conflicto optimista entre dos guardados, secuencia/aborto de cálculos en editor y conservación de foco en E2E |
| T15–T18 | Cinco guardados sin versiones nuevas, preview sin escritura, emisión/reintento R1, R2, otra propuesta sin cambiar referencia: `commercial.integration`; recorrido real en `closure.spec` |
| T19–T21 | PDFs preview/emitido, nombres/condiciones congelados, byte idéntico después de cambiar maestro; DG de siete páginas renderizado y límites comprobados; PDF comercial E2E inspeccionado |
| T22–T24 | `reference-prices.test` y `.integration`: historia, futuro, cero frente a faltante, tres proveedores, equivalencias, moneda/IVA, empate, menor exacto y corte mensual argentino |
| T25–T28 | XLSX real multihoja, columnas reordenadas, números locales, preview sin escritura, huella vencida, atomicidad/reintento concurrente, duplicados y archivos/fórmulas/enlaces rechazados; contratos AJV de respuestas reales |
| T29–T34 | `net-needs.integration`: P100/pedido40/OC40/recepción20/consumo5 mantiene60, general no asignado, reserva/traslado, cancelación/devolución/referencia, dos confirmaciones y reintento; histórico ambiguo advertido |
| T35–T38 | Regresión compras/inventario/journey más `closure-access`: Compras emite sin aprobación, estados/auditoría, parciales, concurrencia, delegación por destino y revocación antes de replay |
| T39–T40 | Factura y pago/reversión con actor/fecha sin cambiar stock; `closure.spec` Administración real; stock100 → traslado30 → consumo5, devoluciones y mínimos en regresión |
| T41–T44 | `management-reports.integration`, `reports.integration` y `closure.spec`: dos obras, R1/R2 sin duplicar, OC multilínea/general, monedas/IVA, legado sin valorización, filtros antes de paginar, corte argentino y Excel de total completo |
| T45/T47 | `transition.integration` dry-run/ejecución/repetición, OC sólo saldo pendiente; `check-release-compatibility` V1 poblada conserva versiones de costo, stock y OC parcial; no se ejecutó transición productiva |
| T46 | Fuente real DG/XLS/PDF, factores por fórmula y costos por partida; ver [conciliación](DG-1153-RECONCILIACION.md). Diferencia comercial −18,58 y 57 agregados sin composición física verificable, sin compensación ficticia |
| T48–T50 | `closure.spec`, `zz-base.spec`, `visual.spec`, regresión móvil: flujo completo de cliente a indicadores, nombres largos, teclado/foco, 1440/1280/768/390/360, navegación/formularios/notificaciones; inspección visual de PNG y PDF |
| T51–T52 | Sesiones, origen/CSRF, validación, allowlists, exportaciones y artefacto runtime; compatibilidad binaria/navegador aprobada antes de merge |
| T53–T54 | Versiones V1 se mantienen como costos y no venta; directos no fabrican materiales; OC nuevas con política explícita y antiguas sin reinterpretación, incluidas fracciones recurrentes |

## Límites de aceptación

La aceptación técnica no equivale a aprobación del piloto por CEO. DG permite conciliar el importe comercial y los materiales verificables; no permite certificar toda su composición física. El export empresarial definitivo para la transición sigue siendo un dato de puesta en marcha. Los avisos correspondientes están implementados y probados. Infraestructura y datos productivos no se modificaron.
