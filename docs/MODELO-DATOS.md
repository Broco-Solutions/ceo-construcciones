# Modelo de datos V1

El esquema versionado está en `apps/api/prisma/schema.prisma`; la migración inicial es `20261022000100_backend_v1`. No se aplicó sobre producción.

## Agregados

| Dominio | Modelos |
| --- | --- |
| Identidad | User, Session, AuthAttempt, WorkAssignment |
| Obras y ubicaciones | Work, Location |
| Catálogo | Unit, Category, Supplier, Material, Presentation, MaterialPrice |
| Cómputo/APU | ApuItem, ApuMaterial, Computation, ComputationLine |
| Presupuestos | Budget, BudgetVersion, BudgetMaterial |
| Pedidos y compras | MaterialRequest, RequestLine, Quotation, QuotationLine, PurchaseOrder, PurchaseOrderLine |
| Recepciones | Receipt, ReceiptLine |
| Inventario | StockBalance, Reservation, StockMovement |
| Trazabilidad | AuditLog, IdempotencyRecord |

Los IDs son internos e inmutables; el código visible de APU admite duplicados. La numeración de OC usa una secuencia PostgreSQL y una restricción única: puede tener huecos, nunca implica una secuencia contable sin saltos. Catálogos y obras tienen código externo único para importaciones repetibles. No hay topes artificiales de obras/materiales.

## Cantidades y economía

Cantidades, coeficientes y precios usan `Decimal(24,8)`; el consolidado de materiales presupuestados usa `Decimal(36,16)` para preservar los productos de dos valores de ocho decimales. Los importes y cantidades se transfieren como texto decimal en la API. Presentaciones tienen una cantidad base positiva explícita; no se deducen conversiones de sus nombres. Las cantidades operativas se expresan siempre en la unidad base del material. `unitPrice` es el precio por `baseQuantity` explícita en líneas comerciales. Los precios no se convierten de moneda ni de base de IVA automáticamente.

MaterialPrice mantiene registros históricos por fecha; material, presentación, proveedor y precio son entidades separadas. `TaxBasis` admite UNSPECIFIED, INCLUDED y EXCLUDED. No se inventa IVA ni tasa. La mano de obra del APU es un importe unitario opcional con moneda y base impositiva, no un jornal.

Cada BudgetVersion guarda un snapshot JSON de cantidades, precios, coeficientes y parámetros de cálculo; BudgetMaterial guarda su consolidado por rubro/material/unidad para informes. Los triggers impiden modificar o eliminar los snapshots económicos; una revisión crea una nueva versión. El estado operativo de una versión puede cambiar. Las referencias a catálogos nunca sustituyen los valores históricos del snapshot.

## Integridad

Las relaciones usan claves foráneas y eliminación restrictiva para históricos. Sesiones/asignaciones pueden borrarse al borrar su usuario; los actores de operaciones históricas están protegidos por FK. Se desactiva el usuario en operación normal.

La migración agrega CHECKs PostgreSQL que Prisma no expresa: físico y reservado no negativos, reservado no superior al físico, mínimos no negativos, cantidades positivas, recibido no superior a lo pedido, reserva cumplida no superior al total, estados coherentes con reserva satisfecha, ubicaciones origen/destino válidas por tipo de movimiento y tripleta de referencia de factura completa. Una ubicación WORK exige obra y las ubicaciones generales no la admiten; `workId` único garantiza una ubicación por obra.

Los CHECKs de fila no reemplazan las transacciones del servicio: reservar, transferir y recibir deben bloquear/actualizar los saldos y líneas implicados de manera atómica. La coherencia entre material de una presentación y de una línea, entre obra/pedido/destino y entre remito/OC se valida en el servicio. Recepciones y movimientos tienen claves únicas de idempotencia; el registro de idempotencia conserva hash de solicitud y respuesta para detectar reintentos con distinto contenido.

StockBalance guarda físico y reservado; disponible se deriva como físico menos reservado. Reservar no cambia físico. Transferir una reserva disminuye físico/reservado en origen, aumenta físico en destino y actualiza fulfilledQuantity. Consumir descuenta únicamente en la ubicación de la obra. No hay FIFO, valoración contable, pagos ni facturas contables.

AuditLog conserva actor, acción, entidad, fecha y snapshots antes/después cuando corresponde. La referencia de factura vive exclusivamente en OC como número, fecha de carga y usuario; no existe una fecha de pago.

## Migración y verificación

La migración se genera desde el esquema y añade las restricciones/triggers revisables en SQL. `prisma validate` y `prisma generate` validan estructura y cliente sin conectar a una base. `prisma migrate deploy` requiere una base aislada para la verificación de integración; nunca debe apuntarse a producción durante pruebas. El despliegue productivo requiere autorización explícita posterior y respaldo verificado.

Reglas pendientes de CEO: IVA, equivalencias comerciales reales, precisión/redondeo operativos, matriz final de permisos/aprobaciones, formatos de migración y datos iniciales. La estructura no da estas decisiones por validadas.

## Importaciones controladas

Rutas autorizadas para Gerencia:

- `GET /api/v1/imports/{kind}/template`: encabezados CSV descargables.
- `POST /api/v1/imports/{kind}/preview`: validación sin escritura y `confirmationHash`.
- `POST /api/v1/imports/{kind}/commit`: mismo contenido y hash, con `Idempotency-Key` obligatorio.

El cuerpo acepta `{ "rows": [...] }` o `{ "csv": "..." }`; commit añade `confirmationHash`. El CSV usa coma, encabezados de plantilla, comillas dobles escapadas y admite CRLF y texto multilineal. Los decimales son texto con punto decimal y hasta ocho decimales; los números JSON se rechazan para evitar pérdida de precisión. Cada archivo contiene entre una y mil filas y respeta el límite del cuerpo HTTP. Un commit es una única transacción: cualquier error deja cero filas nuevas. Debe importarse cada tipo por separado y en orden de dependencias.

| kind | Columnas obligatorias | Columnas opcionales |
| --- | --- | --- |
| suppliers | externalCode, name | taxId, email, phone, address |
| works | externalCode, name | — |
| materials | externalCode, name, unitCode | categoryCode, minimum |
| prices | externalCode, materialCode, price, currency, taxBasis, effectiveAt | supplierCode, presentationId, baseQuantity |
| purchase-orders | externalCode, supplierCode, destinationCode, materialCode, quantity, unitPrice, currency, taxBasis | workCode, notes |
| initial-stock | externalCode, materialCode, locationCode, quantity, reason | — |

`externalCode` identifica el registro en la fuente y es estable entre reintentos; en órdenes identifica la cabecera y puede repetirse entre materiales distintos. El resto de los códigos referencia catálogos existentes. Unidades y rubros deben crearse primero mediante API. Las obras importadas crean su ubicación con código `OBRA-{externalCode}`. Un archivo de precios puede indicar una presentación ya registrada y su equivalencia exacta; sin presentación, baseQuantity es 1. No se normalizan equivalencias desconocidas. Las filas de precios cero se rechazan.

La importación inicial admite únicamente altas: los duplicados existentes, dentro del archivo o previamente importados se informan como errores. Una clave externa ya usada no se interpreta como autorización para corregir datos. El servidor registra identificadores externos globales por tipo, independientemente del actor; repetir el mismo commit con la misma clave devuelve su resultado original. Reutilizar esa clave con otro contenido genera conflicto. Cambiar el archivo exige nueva previsualización y nueva clave de idempotencia.

Para órdenes abiertas de CEO Obras, el adaptador debe exportar exclusivamente las cantidades **pendientes de recibir en el sistema nuevo**, con precio normalizado explícito por unidad base. Las líneas de una OC deben compartir proveedor, moneda, IVA, destino y obra. Se importan emitidas, con numeración interna nueva y referencia al código original en observaciones; no incrementan existencias ni simulan recepciones históricas. Los saldos físicos reales entran por `initial-stock` a partir del recuento entregado por CEO. Cada fila de ese inventario requiere un identificador estable del recuento y motivo. Sólo se admite una apertura por material y ubicación: se rechazan pares repetidos dentro del archivo y pares con movimientos previos o saldo físico/reservado existente, incluso si cambia el identificador externo. La validación se repite dentro de la transacción serializable; las correcciones posteriores requieren un ajuste con motivo. Los proveedores con distinta clave externa e identificación fiscal repetida también se informan por fila antes de confirmar.

El histórico completo de CEO Obras se conserva fuera de la base nueva como exportación abierta, con archivo original, fecha de extracción, responsable, formato y control de integridad SHA-256. No se ejecutó una migración real: los formatos de origen, fecha de corte, cantidades pendientes y stock contado siguen sujetos a entrega y validación de CEO. No hay sincronización automática.
