# Migraciones de aplicación y transición de datos

Las cuatro migraciones V1 anteriores se conservan. Este incremento incorpora seis migraciones versionadas, aplicadas únicamente en PostgreSQL local/CI aislado:

| Migración | Cambio |
|---|---|
| `20261102000100_clients_and_commercial_baseline` | Clientes, relación opcional de obra histórica, dirección, perfil Administración |
| `20261102000200_budget_editor` | Borradores, plantillas y emisiones inmutables |
| `20261103000100_reception_and_invoice` | Delegación por destino y factura/pago informativos |
| `20261103000200_explicit_zero_prices` | Precio cero explícito válido; cantidad de presentación positiva |
| `20261103000300_trace_coverage_and_order_amounts` | Trazabilidad recepción/reserva y política de importes de OC nuevas |
| `20261103000400_activity_direct_cost` | Costo directo opcional de una actividad, sin material ni salario ficticio |

No hay borrados ni reescritura de snapshots o importes históricos. Una obra histórica mantiene cliente nulo hasta una vinculación deliberada. Con esquema ampliado, una obra nueva exige cliente activo. Los costos directos históricos ausentes conservan su interpretación anterior. La política de OC nuevas es HALF_UP a dos decimales por renglón; una OC anterior sin política no se reclasifica silenciosamente.

## Verificación de esquema

`CEO_Verificar_Local.sh api` crea una base nueva, aplica las diez migraciones y ejecuta integración/build/runtime. `check-release-compatibility.ts` crea una base distinta, aplica las cuatro migraciones V1, carga una obra sin cliente, catálogo, presupuesto de costos, OC parcialmente recibida y stock, ejecuta código nuevo, aplica las seis migraciones y verifica la conservación de los datos. Finaliza con `prisma migrate diff --exit-code`.

Las opciones `--runtime --browser` amplían la prueba al artefacto compilado, HTTP, sesión, proxy web y navegador reales antes y después de ampliar el esquema. No reemplazan los escenarios completos sobre el esquema nuevo.

## Adaptador de CEO Obras

`apps/api/scripts/transition-ceo-obras.ts` recibe un manifiesto JSON con códigos externos explícitos. Por defecto genera **dry-run**, conciliando creados, vinculados y rechazados sin escribir. La opción `--execute` sólo admite PostgreSQL loopback cuyo nombre sea de pruebas. Las fases son clientes, proveedores, obras activas, materiales necesarios y OC abiertas; cada fase reutiliza preview/commit real y deja huella/idempotencia.

Los clientes se vinculan por `clientCode`; las coincidencias ambiguas no se resuelven por similitud de nombres. Para OC, el pendiente se deriva de ordenado menos recibido; las cerradas se omiten y no se simula stock histórico ni se importan recepciones anteriores. Una segunda ejecución reconoce las filas importadas y no duplica. Un código preexistente conflictivo se informa.

`transition.integration.test.ts` prueba dry-run sin escritura, ejecución aislada y repetición, incluyendo proveedor, cliente/obra y OC con saldo pendiente. **No se dispone del export definitivo de las OC abiertas de CEO para ejecutar una transición empresarial completa**; el adaptador y su contrato están probados con manifiesto de aceptación, sin afirmar un corte real de datos.

La ejecución productiva no forma parte de esta entrega. Tampoco se cambia configuración de despliegue, servicios o variables. Los originales, logs con contexto de datos y salidas de conciliación permanecen fuera de Git; la documentación pública del repositorio registra hashes, método y resultados.
