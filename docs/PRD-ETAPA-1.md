# PRD — CEO Construcciones · Etapa 1
**Versión:** 1.0 · 21/10/2026
**Estado:** definición funcional base cerrada internamente; validaciones operativas con CEO identificadas y pendientes.
**Producto:** plataforma web CEO Construcciones, evolución funcional del circuito CEO Obras.
**Plazo de referencia:** 10 semanas desde los hitos contractuales de pago, entrega de archivos y accesos.
**No es una ampliación comercial:** prevalece el contrato y Anexo I; los detalles internos sirven para materializar su alcance.

## 1. Fuentes y jerarquía
1. **Contrato y Anexo I — Etapa 1:** https://docs.google.com/document/d/1KAc0AJrNjK-miwRIr6Bc8NmOCUB0As1E/edit
2. **Definiciones funcionales actualizadas de Renzo (21/10):** https://docs.google.com/document/d/1HiAvffV5hO2iDBPbzCpnfI6B7R491SbCbQqcetoQ6nk/edit
3. **Reunión de definición con Renzo:** https://docs.google.com/document/d/1IrPCRPrPBhrsnObzxYwML3zdygqB0kzQHla-8Kd3tEA/edit
4. **Propuesta comercial 15/10, Alternativa 2:** https://drive.google.com/drive/folders/1i9bKC6cmHm7ZvEY7yHbQ4hvU0xUD33kn
5. **Documentación operativa, Excel y CEO Obras:** https://drive.google.com/drive/folders/1WhUozFCgBwfvKZKVT6y5jnn5XOGG1cPl
6. **Decisiones complementarias del responsable de proyecto confirmadas el 21/10:** cuatro roles en tres niveles; compras generales sin obra; reserva simple de inventario; número de factura y fecha de carga en OC sin gestión contable.

**Regla de alcance:** no incorporar funciones fuera del contrato por su mera presencia en los archivos actuales. Si hay contradicciones, respetar contrato/Anexo I y señalar el punto para aprobación; una decisión interna no modifica por sí sola el acuerdo comercial.

## 2. Propósito
Centralizar el trabajo por obra desde **cómputo de cantidades → análisis unitarios → presupuesto → materiales previstos → pedido → stock disponible/reservado o compra → recepción → transferencia/consumo → comparación de cantidades**.

El presupuesto contiene costos previstos, NO indicadores de rentabilidad total ni un sistema contable. La obra es el eje del seguimiento; las compras generales para galpón/patio constituyen la excepción explícitamente aprobada a la asociación obligatoria con una obra.

## 3. Alcance funcional

### RF-01 · Obras
- Registrar obra, datos básicos, estado, responsables y usuarios asignados.
- Asociar cómputos, presupuestos, pedidos, consumos y demás operaciones aplicables.
- El contrato contempla operación de hasta 10 obras activas en esta etapa; **no insertar una restricción técnica arbitraria que impida cargar la obra número 11**. Tratar 10 como capacidad de alcance/piloto, no como licencia de software.
- El jefe de obra consulta exclusivamente sus obras autorizadas.

### RF-02 · Identidad, roles y trazabilidad
- Autenticación individual por usuario/contraseña, sesiones seguras y cierre de sesión.
- **Tres niveles, cuatro roles funcionales:** nivel 1 Gerencia; nivel 2 Compras y Cómputo/Presupuestos como roles distintos; nivel 3 Jefe de obra.
- Gerencia: visibilidad y capacidad de administración total en los módulos contratados. Referentes relevados: Marcelo, Franco, Alejo y Raquel; confirmar cuentas concretas al alta.
- Compras: materiales/proveedores, solicitudes, cotizaciones, OC, recepciones y operación de stock que se le autorice.
- Cómputo/Presupuestos: APU, catálogos, listas de precios, cómputos y presupuestos. Referente relevado: Elías.
- Jefe de obra: obras asignadas; consultar materiales, cargar pedidos, confirmar recepciones en sus ubicaciones y registrar consumos/devoluciones autorizados, **sin datos de precios/costos**.
- No existe rol operativo Contabilidad, Administración ni RR. HH. en la Etapa 1. No crear un rol para cargar facturas.
- Registrar actor, fecha/hora, operación, entidad y referencias relevantes en modificaciones de presupuesto, OC, recepciones y movimientos de inventario.
- La matriz detallada de botones/acciones para roles operativos queda como validación por tarea con CEO. Los controles del backend son obligatorios.

### RF-03 · Catálogo de materiales, proveedores y precios
- Catálogo único de materiales con identificador interno único, descripción, unidad base, categoría/rubro y estado.
- Catálogo de proveedores y listas de precios por material, con fecha de vigencia/registro y unidad de cotización.
- Distinguir material y presentación de compra: por ejemplo, precio por bolsa versus consumo por kg.
- Valores de referencia de materiales y mano de obra editables. Los importes de cada presupuesto pueden sobrescribirse **solo dentro de esa versión**, sin modificar la lista maestra.
- Carga y exportación por archivo tabular estandarizado; no interpretar automáticamente cualquier PDF de proveedor dentro de la plataforma.
- Si el proveedor envía PDF/WhatsApp/Excel heterogéneo, el cliente puede convertirlo previamente a la plantilla estándar con su ChatGPT; **no hay IA integrada**.
- Reportar filas inválidas, duplicadas o sin unidades/precios durante la importación, sin inventar equivalencias.
- Carga inicial acordada de hasta 250 artículos; el catálogo no tendrá un tope de base de datos de 250.

### RF-04 · Ítems y análisis de precios unitarios (APU)
- Rubros → ítems de trabajo, cada ítem con descripción y unidad de ejecución (m², m³, ml, unidad, etc.).
- Definir para cada unidad ejecutada una lista de materiales y coeficientes de consumo ingresados/editados por el responsable de Cómputo. **El sistema no calcula cómo se obtienen técnicamente esos coeficientes**.
- Costo unitario de materiales = suma de (coeficiente × precio normalizado en la unidad de consumo).
- Mano de obra se incorpora como **importe unitario editable**, no como horas efectivas, asistencia ni cálculo de jornales.
- Total unitario del ítem = materiales + importe de mano de obra.
- Usar IDs internos inmutables; el código de ítem visible en Excel no garantiza unicidad.
- El Excel de referencia NO se trasladará hoja por hoja ni se replicarán macros, coeficientes de venta, rentabilidad o fórmulas extra.
- Ejemplo de validación: hoja 10-Ciel, ítem Aplicado a la cal completo, por 1 m²: 4,5 kg cemento, 6,6 kg cal, 0,07 m³ arena; valores fijos de consumo provistos por CEO.

### RF-05 · Cómputo y presupuestos por obra
- **Primero cómputo:** cargar cantidades de ejecución por obra/rubro/ítem.
- **Luego presupuesto:** aplicar APU, precios de referencia y valor de mano de obra por ítem, permitiendo excepciones de precio dentro de la versión.
- Calcular subtotales por ítem y rubro, costo total del presupuesto y desglose de materiales/mano de obra.
- Generar automáticamente lista consolidada de materiales = suma(consumo unitario de cada ítem × cantidad de trabajo), normalizada por unidad.
- Presupuestos **versionados**, guardando cantidades, consumos y precios utilizados en cada versión; una actualización posterior de lista de precios no modifica retrospectivamente versiones anteriores.
- Distinguir borrador de versión utilizada como referencia para seguimiento de materiales. La decisión final de quién aprueba y cómo se confirma se validará con CEO.
- IVA, conversiones y redondeos: pendientes de validación documental; no suponer reglas ocultas ni completar importes faltantes.

### RF-06 · Pedido de materiales
- Pedido con obra y rubro, solicitante, fecha requerida, materiales y cantidades.
- Mostrar cantidad prevista y ya solicitada para esa obra cuando exista presupuesto.
- Mostrar, al procesar cada renglón, disponibilidad por ubicación.
- Compras decide: reservar/transferir stock existente, cotizar y comprar faltantes o combinar ambas.
- No generar compra automática ni reducir stock físico al crear el pedido.
- Estados e historial de pedido sencillos; su nomenclatura y eventuales aprobaciones son criterios operativos a validar.

### RF-07 · Reserva simple de inventario
- Una reserva vincula **material, cantidad, ubicación de origen, obra/pedido destinatario y actor/fecha**.
- Saldo físico (existencia) permanece sin cambios por reservar. Disponible para otros = físico − reservado pendiente en esa ubicación.
- No permitir reservar más que el disponible al mismo tiempo; aplicar operación transaccional para evitar dobles reservas.
- Permitir liberación/cancelación de reserva con trazabilidad.
- Al confirmar el movimiento/transferencia se satisface la reserva, disminuye físico en origen y aumenta físico en destino. No descontar nuevamente al registrar consumo: el consumo disminuye físico en la obra donde ocurrió.
- Sin picking, lotes, vencimientos, stock serializado ni planificación avanzada de reservas.

### RF-08 · Cotizaciones
- Registrar cotizaciones de varios proveedores por pedido/material, precios, unidades, moneda si corresponde, plazos y observaciones.
- Tabla comparativa y selección manual, registrando quién eligió y cuándo.
- No hay envío de mensajes automáticos ni integración externa.
- Si existen cotizaciones en distintas monedas, requerir valor de referencia explícito o no presentar ranking monetario hasta validar criterio con CEO.

### RF-09 · Órdenes de compra (OC)
- OC con numeración única, proveedor, renglones, cantidades, precios de compra y PDF exportable.
- La OC puede vincularse a obra/pedido **o ser una compra general destinada a galpón/patio sin obra**. La ubicación de destino debe estar identificada.
- Estados operativos mínimos propuestos: borrador, emitida, recepción parcial, recibida y anulada; términos y transiciones sujetos a validación operativa, preservando historial.
- **Dato de factura limitado:** después del pago realizado fuera del sistema, Compras o Gerencia puede registrar el número de factura en la OC. Guardar automáticamente la fecha/hora de esa carga y el usuario que la realizó. No editar manualmente una fecha de pago ni gestionar facturas como entidad contable.
- No adjuntar factura, procesar pagos, calcular saldos, registrar bancos, programar vencimientos ni incorporar rol contable.
- La referencia a factura no modifica el stock y es independiente del registro de recepción.
- Permitir edición/corrección autorizada de la referencia dejando registro de modificaciones.

### RF-10 · Recepciones y remitos
- Registrar recepciones completas/parciales por líneas de OC, cantidades y fecha.
- Identificar ubicación real receptora: galpón, patio u obra; receptor puede ser jefe de obra autorizado o personal de Compras/Gerencia.
- Guardar número/referencia de remito (sin requerir adjunto para el alcance inicial).
- Al confirmar, ingresar cantidades al stock físico de esa ubicación y actualizar pendiente de recepción de OC **en una única transacción**.
- Evitar la recepción doble de un mismo evento; no exceder lo pedido sin ajuste autorizado. Historial auditable.

### RF-11 · Stock y movimientos
- Ubicaciones: galpón, patio y una ubicación por obra.
- Inventario inicial a partir del recuento provisto por CEO; Broco no realiza recuento físico.
- Consultar físico, reservado y disponible por material/ubicación.
- Movimientos: ingreso por recepción o inventario inicial, transferencia entre ubicaciones con confirmación, consumo en obra, devolución a ubicación y ajuste con motivo.
- Trazabilidad de usuario, fecha, cantidad, origen/destino y referencia operativa.
- **Stock mínimo contractual:** mínimo configurable por material (y ubicación cuando corresponda) y alerta visual sencilla cuando disponible cae por debajo; sin pedidos de reposición automáticos, notificaciones externas o predicción.
- Las cantidades de stock son físicas; no implementar valorización contable, costos FIFO, contabilidad ni control de herramientas serializadas.
- Validar con CEO el permiso de ajuste y excepciones por stock insuficiente; propuesta conservadora: evitar stock físico negativo sin aprobación especial documentada.

### RF-12 · Informes y seguimiento
- Comparar en **cantidades materiales** por obra, rubro y material: **previsto, pedido, comprado y consumido**.
- Mostrar también recibido/disponible cuando ayude a interpretar lo anterior; no confundir comprado con recibido ni con consumido.
- Mostrar faltantes y desvíos respecto a la versión de presupuesto seleccionada.
- Indicadores de dinero solo dentro de costos presupuestados y compras expresamente documentados; **no mostrar rentabilidad, caja, costo laboral real ni progreso global de obra como si se pudiera calcular**.
- Exportación a Excel de información operativa y reportes de la Etapa 1.

### RF-13 · Migración y convivencia con CEO Obras
- Reemplazar el circuito de pedidos y OC de CEO Obras, tomando su UX/reglas como referencia funcional.
- Migrar **proveedores, obras activas y órdenes de compra abiertas**, según exportaciones y accesos efectivamente entregados por CEO.
- Histórico restante de CEO Obras disponible como **archivo exportado**, no migrado íntegramente a la base nueva.
- Permitir convivencia operativa temporal en las primeras semanas; definir corte de migración y evitar doble operación al final.
- No desarrollar sincronización automática ni integrar técnicamente CEO Obras/Hollistor.

### RF-14 · Experiencia de uso
- UI sencilla en español, responsive, usable en computadora y celular.
- Tomar la demo CEO Obras disponible en Drive como **referencia visual**; el contrato/PRD prevalecen sobre las funciones simuladas en la demo.
- Jefes de obra: acceso rápido a pedidos, existencias en su obra, confirmación de recepciones, consumos y devoluciones.
- Operación conectada; sin app nativa, códigos de barras, RFID ni modo offline.

## 4. Modelo lógico mínimo (orientativo, NO esquema Prisma terminado)
- Usuarios, roles/permisos y asignaciones usuario–obra.
- Obras.
- Proveedores y materiales; unidades, presentaciones y listas/historial de precios.
- Rubros, ítems de obra, APU y coeficientes de materiales.
- Presupuesto, versión y renglones con snapshot de cantidades/precios/consumos.
- Pedido y líneas; cotizaciones y líneas; OC y líneas; referencias de factura.
- Ubicaciones, existencias, reservas, movimientos, transferencias, recepciones/remitos.
- Registro de auditoría.
Se permite simplificar tablas sin perder integridad, trazabilidad y separación física/disponible.

## 5. Casos de aceptación de punta a punta
**CA-01** El usuario inicia sesión; Gerencia ve todas las obras; Jefe de Obra no puede ver precios ni datos de obras no asignadas, ni siquiera invocando la API directamente.

**CA-02** Un ítem APU de 1 m² con consumo definido se calcula desde precios editables. Para 100 m² de Aplicado a la cal completo, la necesidad prevista es 450 kg de cemento, 660 kg de cal y 7 m³ de arena. No se deducen coeficientes desde planos ni se inventan cantidades.

**CA-03** Actualizar precio general no altera una versión anterior; un cambio puntual al precio de un presupuesto no altera el catálogo.

**CA-04** Una obra solicita 100 unidades; si el galpón tiene 120 físicas y 30 reservadas para otra obra, el sistema ofrece 90 disponibles y no acepta reservar 100 sin liberación o reposición. Reservar 60 deja el físico en 120, aumenta reservado, y disponible pasa a 30. Transferir las 60 consume reserva y mueve físico al destino.

**CA-05** Compras cotiza faltantes entre varios proveedores y emite una OC numerada/PDF vinculada al pedido/obra. También puede emitir una OC **sin obra** cuyo destino es galpón/patio.

**CA-06** Recibir parcialmente una OC con remito incrementa stock del destino solo por la cantidad recibida y conserva la cantidad pendiente. Una repetición accidental no duplica ingresos.

**CA-07** Luego de una operación de pago fuera del sistema, un usuario autorizado registra número de factura en la OC. Se guarda fecha de **carga**, no fecha de pago, y la trazabilidad del actor. No existe comprobante contable ni flujo de pagos.

**CA-08** Un Jefe de Obra marca consumo de materiales de su ubicación; el stock disminuye allí y el tablero muestra previsto/pedido/comprado/consumido sin inventar avance financiero.

**CA-09** Un mínimo configurado genera aviso visual al cruzar el umbral; no genera compras ni notificaciones automáticas.

**CA-10** Una obra piloto recorre presupuesto → pedido → reserva o compra → OC → recepción → traslado → consumo → reporte exportable.

**CA-11** Importar proveedores, obras activas y OC abiertas del formato acordado; entregar archivo histórico. Capacitar usuarios clave y documentar operación básica.

**CA-12** Verificar backup restaurable, auditoría de cambios y exportabilidad antes de producción.

## 6. Fuera de alcance
- Integraciones automáticas con CEO Obras, Hollistor u otros sistemas.
- Facturación y carga de documentos de factura, procesamiento de pagos, tesorería y conciliaciones. **Excepción puntual aprobada: únicamente número de factura y timestamp de carga en OC.**
- Certificaciones de avance, CAC automático, presupuestación con coeficientes de venta, rentabilidad, mano de obra por jornales u horas realmente trabajadas.
- RR. HH., asistencia, vehículos, subcontratistas, herramientas serializadas.
- IA integrada, automatizaciones de WhatsApp/email, app nativa, offline, códigos de barras/RFID, valoración contable del inventario.
- Migración histórica completa y recuento físico de existencias por Broco.
- Reposición automática por mínimos, inventario avanzado, logística compleja.

## 7. Requisitos técnicos y operación contractual
- Un solo repo https://github.com/Broco-Solutions/ceo-construcciones
- **API:** apps/api, Next.js Route Handlers/TypeScript + Prisma/PostgreSQL, Railway.
- **Web:** apps/web, Next.js/TypeScript, Vercel.
- Contrato de API versionado (OpenAPI) para integrar web con API. Sin microservicios, colas, Redis ni servicios adicionales hasta que exista requerimiento probado.
- Almacenamiento S3-compatible solo si se aprueba carga de adjuntos; la V1 acordada solo requiere referencias de remito/factura y PDF de OC.
- Autorización real en backend, autenticación con cookies/sesiones seguras, logs de operaciones y secretos únicamente en variables de entorno.
- Operaciones de stock/reservas/recepciones transaccionales; usar Decimal para cantidades y costos.
- Backups automáticos **al menos semanales con 30 días de retención**, monitoreo básico y objetivo contractual de 99,5 % de disponibilidad mensual según exclusiones del contrato.
- Datos exportables en formato abierto/utilizable; documentación y código transferibles según contrato.
- Migraciones Prisma versionadas, jamás aplicar cambios destructivos automáticamente en producción sin revisión y backup.
- Codex: apps/api, schema y migraciones, API, infraestructura, tests. Claude Code: apps/web y UX. PRs independientes coordinados a través de OpenAPI y revisión del orquestador.
- Ninguna funcionalidad de negocio se implementa por inferencia a partir de PDFs o demo; trabajar por tickets/módulos aprobados.

## 8. Piloto y entrega comprometidos
- 1 obra real; hasta 3 presupuestos de ejemplo.
- Galpón, patio y 1 obra como ubicaciones del piloto.
- Catálogo inicial de hasta 250 artículos, con datos provistos y contados por CEO.
- Usuarios y permisos, pruebas de flujo completo, reporte y exportación, respaldo, guía breve, capacitación a usuarios clave, acompañamiento inicial.
- Aceptación con referentes de Cómputo, Compras y Jefe de Obra, además de Gerencia.

## 9. Validaciones operativas pendientes (NO redefinen el alcance)
**V-01 — Alta prioridad, antes del motor de cálculo:** obtener Excel editable real de un presupuesto y su resultado; confirmar IVA con/sin, unidades y conversiones de presentación, moneda y precisión/redondeo. Sin esa validación no dar por exacta la importación ni el cálculo de costos.
**V-02 — Antes de cerrar permisos finales:** responsable real por obra; acciones de aprobación de presupuesto/OC, quién ajusta stock, y permisos de Compras vs Cómputo.
**V-03 — Antes de habilitar Compras:** estados finales de pedido/OC, criterio de selección/aprobación, tratamiento de excepciones; monedas comparables y remitos (referencia textual como base).
**V-04 — Antes de migración:** formato/exportación de CEO Obras para proveedores, obras activas y OC abiertas, responsable de la extracción, fecha de corte y fuente del archivo histórico.
**V-05 — Antes de piloto:** definición de mínimos por artículo, responsables de registración de movimientos, planilla de stock inicial, obra y usuarios de prueba.

Estos temas no impiden iniciar arquitectura de dominio, autenticación ni CRUD básico, pero **no habilitan a implementar a ciegas los cálculos o flujos sin validar**.

## 10. Estado de aprobación y cambio de alcance
- **Aprobación interna de definición funcional base:** confirmada en la conversación del 21/10 por el responsable de proyecto, consolidada en este documento v1.0.
- **Validación de reglas operativas con CEO:** pendiente según sección 9.
- Cualquier cambio que altere entregables contractuales requiere aprobación escrita del cliente y gestión de alcance conforme al contrato.
- No confundir aprobación interna de PRD con aceptación de entregables o firma de contrato.
