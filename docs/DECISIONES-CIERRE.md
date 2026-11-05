# Decisiones del cierre de Etapa 1

## Confirmadas por el usuario

- Codex implementa API y web durante esta misión.
- La interfaz muestra Actividades de obra, Costo por unidad y Composición del costo.
- Clientes pueden tener varias obras; obras históricas sin cliente continúan legibles.
- Se autorizan costos directos/VARIOS, recargo comercial, revisiones, PDF comercial, importación Excel, necesidades netas, Administración restringida e indicadores.
- No se toca infraestructura ni se ejecutan migraciones/importaciones en producción.

## Decisiones técnicas aplicadas

- La relación `Work.clientId` es nullable para preservar el histórico. Con esquema ampliado, toda obra nueva requiere cliente activo, incluso con catálogo vacío. Frente a esquema V1 se conserva el alta original y se informa que clientes aún no están habilitados; no se inventa una identidad transitoria.
- La migración comercial es aditiva y añade el perfil `ADMINISTRACION`; los permisos de negocio se otorgan por allowlist de servidor, nunca sólo desde el menú.
- El sondeo read-only del esquema habilita funciones por capacidad real; las consultas implícitas y relaciones de Work se proyectan a campos V1 mientras faltan columnas. No se ejecuta DDL desde requests ni se agregan variables cloud.
- OC nuevas guardan una política independiente de importes: HALF_UP a dos decimales por renglón; total suma importes mostrados. Las históricas sin política conservan exactitud/aviso original.
- Recibir en galpón una OC destinada a obra reserva esas unidades para la obra y vincula recibo/reserva. Trasladar satisface esa reserva. Una compra general no se asigna automáticamente. Históricos sin vínculo suficiente se advierten como orientativos.
- Precios cero explícitos son válidos; faltante conserva null/ausencia. Referencias futuras o de proveedores inactivos no se proponen como vigentes. Comparación separa moneda/IVA y verifica equivalencias almacenadas.
- BASE real se incorpora sólo por acción explícita y atómica, con códigos propios estables; no se carga desde una migración ni al iniciar servidor. La fuente tiene referencias IVA contradictorias: la plantilla conserva `UNSPECIFIED` y observaciones, sin inventar una tasa. Cantidad cero excluye la partida de costos/demanda; las positivas incompletas bloquean emisión.
- Adaptadores de transición y lectura XLS son herramientas de datos locales aisladas. No incorporan sincronización externa ni ejecutan contenido activo. Los pendientes de OC se calculan ordenado menos recibido antes de importar, sin generar stock previo.
- La demanda física se redondea a ocho decimales HALF_UP por material/rubro y se consolida desde esas mismas filas, como inventario. Una cantidad positiva inferior a la precisión admitida no se transforma en cero silenciosamente. Los importes comerciales se calculan con Decimal y se redondean a dos decimales por partida.
- `ApuItem.directCost` guarda costos directos reutilizables, sin alterar recetas ni columnas de mano de obra existentes. La proyección V1 omite esa columna hasta que esté disponible.
- La fuente incompleta conserva `materialDemandIncomplete`; el usuario puede registrar su revisión en Materiales previstos. Necesidades indica orientación y no exactitud mientras persista ese estado. Esto no impide emitir un precio comercial conocido ni impone un circuito de aprobación.
- El PDF imprime el precio unitario comercial con su precisión de cálculo para que explique el importe extendido de dos decimales. Emisiones congelan datos públicos, condiciones y versión de formato; una descarga posterior no consulta nombres o precios maestros actuales.
- Indicadores suman una emisión vigente por presupuesto. No convierten versiones V1 de costos en ventas ni mezclan monedas/IVA. OC antiguas con fracciones recurrentes y sin política declarada se cuentan como sin valorización verificable, sin inventar cero.


## Correcciones técnicas de aceptación, 03/11/2026

- La navegación controlada resuelve una intención pendiente una sola vez. La recarga/cierre usa `beforeunload`; no hay autoguardado ni almacenamiento sensible en navegador.
- Moneda/IVA se muestran desde el inicio. Cambiar costos requiere confirmación y revisión explícita; una copia sólo en memoria permite deshacer esa revisión antes de confirmarla. No se infieren tasas ni conversiones.
- El costo unitario se calcula en servidor independientemente de cantidad. `null` conserva pendiente y `0` es un cero explícito sin demanda.
- Una composición física puede coexistir con un costo de suministro agregado documentado: `materialsIncludedInDirect` impide sumar nuevamente sus precios. No se publican precios cero ficticios cuando falta referencia. Sustituir el agregado por composición valorizada deja evidencia en el borrador y su auditoría.
- La exactitud material depende de faltantes concretos y evidencia por partida. Un reconocimiento global no borra incompletitud; los 23 casos C del conjunto original de DG permanecen identificados.
- Los contratos nuevos son aditivos y los campos de snapshots anteriores siguen aceptados. Esta pasada no introduce migraciones adicionales ni modifica infraestructura.
- El entorno manual usa su propia base persistente y puertos; no comparte datos con las bases únicas de los runners automatizados.

## Reglas funcionales consolidadas

Se conservan las decisiones detalladas del cierre anterior; son requisitos, no otro plan activo. El estado y límites actuales de habilitación están en DEMO-ONLINE.md y ESTADO-PROYECTO.md.


### Regla 1 Clientes, proveedores y obras

**Clientes:** nombre/razón social requerido; CUIT opcional; contacto, teléfono/email, dirección y observaciones. Alta, búsqueda, edición e inactivación. Detectar CUIT duplicado cuando se haya informado; no exigir un CUIT inventado a un particular. Sin eliminación física de clientes relacionados.

Un cliente puede existir antes de tener obras y luego tener varias. Cada **obra nueva** debe vincularse a un cliente principal. Para las obras históricas, agregar relación nullable de transición y mostrar «Cliente sin vincular» hasta completar un mapeo real. No asignar un cliente genérico ficticio ni borrar obras para satisfacer una restricción.

**Obras:** conservar estado, responsables, asignaciones y ubicación propia. Agregar cliente, dirección/datos de obra necesarios para la salida comercial. La ficha de cliente lista sus obras y presupuestos; la ficha de obra conserva pedidos, compras y stock. Inactivar un cliente no cancela obras ni operaciones existentes.

**Proveedores:** reutilizar ABM, historial, CUIT, datos de contacto e inactivación. No duplicar el módulo. Un proveedor inactivo conserva documentos históricos, pero no se propone por defecto para compras nuevas.

### Regla 2 Permisos y Administración restringida

| Acción | Gerencia | Cómputo/Presupuestos | Compras | Jefe de obra | Administración restringida |
|---|---|---|---|---|---|
| Ver obras | Todas | Todas | Todas | Asignadas | Solo identificación necesaria en OC permitidas |
| ABM clientes | Sí | Sí | Consulta operativa necesaria | Sin listado global | No |
| ABM proveedores | Sí | Lectura | Sí | No global | Datos mínimos de la OC |
| Editar actividades, costos y presupuestos | Sí | Sí | Lectura económica existente | No | No |
| Recargo, emitir y descargar presupuesto | Sí | Sí | Sin ampliar escritura por esta misión | No | No |
| Crear pedidos | Sí | Conservar política existente de lectura | Sí | Asignadas | No |
| Cotizar y emitir OC | Sí | Lectura | Sí | No | No |
| Recibir | Sí | Solo delegación específica si se asigna | Sí | Obra propia; otras ubicaciones solo si se delegan | Solo delegación específica si se asigna |
| Transferir | Sí | No | Sí | Conservar operaciones autorizadas, no abrir transferencias globales | No |
| Consumo/devolución | Sí | No | Sí | Obra propia | No |
| Ajustes de inventario/usuarios | Sí | No | Conservar mínimos, no ampliar ajustes | No | No |
| Número/importe de factura | Sí | No | Sí | No | Lectura |
| Marcar pago informativo | Sí | No | Sí | No | Sí |
| Indicadores monetarios globales | Sí | No ampliar privilegios actuales sin necesidad | Lectura operativa de sus módulos | No | No |

La lectura de todas las obras **no** equivale a permiso de modificar cualquier módulo. No agregar aprobación comercial o una jerarquía nueva.

Agregar el perfil restringido con autorización por lista explícita en API, no solo en menús. Revisar consultas que hoy distinguen «Jefe» de «todos los demás»: el rol nuevo no debe caer en una rama permisiva. Cubrir exportaciones, filtros, detalles, historiales, búsqueda, referencias y nombres relacionados.

La delegación de recepción por ubicación es una capacidad adicional acotada, no un nuevo rol «Depósito» ni acceso global. Gerencia asigna usuarios activos; la delegación solo permite ver/confirmar lo necesario en ese destino, sin precios internos, presupuestos, otros saldos o administración general.

### Regla 3 Actividades, plantillas, cantidades y costos

- Reutilizar composiciones: materiales y consumo por unidad, mano de obra por unidad y, cuando aplique, otros costos directos. No representar seguros o tercerizados como material ficticio o salario si no lo son.
- La mano de obra se mantiene manualmente con las referencias aportadas por CEO/UOCRA; no crear nómina ni sincronización externa.
- Permitir crear presupuesto desde plantilla BASE, desde otro presupuesto/revisión o en blanco. Copiar estructura y composiciones, no relaciones vivas que modifiquen otra obra.
- Mantener orden de rubros/actividades, unidad y descripciones. Los 16 rubros del ejemplo no son un límite del sistema.
- Dejar editar cantidades con operaciones aritméticas simples opcionales. Usar parser acotado, sin `eval`, referencias a celdas, variables externas o código ejecutable. Guardar cantidad resultante y, si se conserva la expresión, tratarla como ayuda trazable.
- Un renglón incompleto puede permanecer en borrador; no emitir importes engañosos. Distinguir precio faltante, cero informado, partida excluida y concepto incluido sin importe independiente. Los incluidos/excluidos no deben duplicar costos ni materiales de otra partida.
- `cantidad × costo por unidad = subtotal`. Sumar rubros con el motor decimal existente. Los costos y consumos incluidos en una revisión deben congelarse.
- Los cambios al catálogo no alteran revisiones emitidas. Para un borrador existente, «Actualizar precios» muestra diferencias y requiere aceptación; no reemplazar ajustes particulares silenciosamente.
- La actualización de la composición maestra y el ajuste para una obra son acciones separadas y auditables.

### Regla 4 VARIOS y rentabilidad comercial

VARIOS es un rubro normal de conceptos, unidad, cantidad, costo por unidad y subtotal. Puede incluir gl con cantidad 1, pero no fijarlo como única opción. El 4% de BASE es una referencia reutilizable; no imponerlo ni construir un motor general de reglas porcentuales.

Si se incorpora la ayuda «Tomar referencia de VARIOS de la plantilla», debe calcular sobre una base sin incluirse a sí misma, informar el reparto y dejar importes explícitos editables. No generar una fórmula circular ni actualizar el porcentaje universalmente en todas las obras.

**Flujo principal:** terminar costos, incluido VARIOS, elegir porcentaje de rentabilidad y obtener precio de venta.

```text
Costo de la obra = suma de subtotales de costo, incluido VARIOS
Factor comercial general = 1 + rentabilidadPorcentaje / 100
Precio de venta = suma de importes comerciales de las partidas
```

No llamar a ese porcentaje «margen sobre ventas» ni calcular rentabilidad contable realizada.

**Excepciones acotadas:** la documentación autoriza conservar diferencias de materiales/mano de obra o partidas. Mostrar una sección secundaria «Ajustes particulares», no una matriz técnica obligatoria. Un ajuste específico reemplaza el general sobre su base: no se aplica dos veces. Modelo mínimo de precedencia: general → excepción por componente cuando exista → excepción de partida si se opta por reemplazarla completa. Los modos incompatibles se validan; nunca se acumulan inadvertidamente.

Una partida de costo directo usa el general salvo excepción explícita. Las cantidades de materiales no cambian al modificar recargo, impuestos de presentación o condiciones comerciales.

**Default técnico para presupuestos nuevos:** moneda/base impositiva heredadas de la plantilla/referencias; importes finales con 2 decimales y redondeo HALF_UP, manteniendo precisión interna decimal. Conservar las políticas históricas del snapshot; no recalcular versiones antiguas con nuevos defaults. Este default resuelve la configuración habitual de nuevas emisiones, no pretende describir la política histórica de CEO. La suma de importes comerciales mostrados debe coincidir con el total. Documentar diferencias explicables de redondeo del caso DG, no manipularlo para conseguir una cifra.

**IVA y moneda:** guardar moneda y tratamiento de IVA explícitos. No inventar una tasa fiscal ni convertir automáticamente ARS/USD o costos con/sin IVA. Conservar «+ IVA» cuando el presupuesto no incluya una alícuota expresamente informada. Si se muestra IVA calculado, exigir tasa explícita y coherente; no asumir que todos los ítems o casos usan 21%. Un precio no comparable se advierte y no se mezcla silenciosamente con otros.

### Regla 5 Borrador, revisiones y presupuesto de referencia

Separar tres conceptos:

1. **Borrador editable**: guardar cambios no crea una revisión cada vez.
2. **Revisión emitida**: captura inmutable de contenido, cantidades, costos, precio comercial, datos del cliente/obra, condiciones, reglas de cálculo y versión de plantilla PDF.
3. **Referencia de abastecimiento de la obra**: una revisión elegida para materiales previstos, no una aprobación comercial ni la suma de presupuestos alternativos.

Primera emisión crea R1. Editar después de emitir abre/continúa un borrador basado en esa revisión y conserva la anterior. Emitir el cambio crea R2. Previsualizar o volver a descargar R1/R2 sin cambios no crea otra.

Usar idempotencia existente y huella de contenido normalizado. Excluir de esa huella timestamps de descarga o metadatos volátiles; incluir cambios de contenido comercial y condiciones. Concurrencia y doble clic no pueden crear dos revisiones por una intención.

Mantener la selección explícita de referencia para abastecimiento, accesible a quienes editan presupuestos, sin pedir autorización de Gerencia adicional. Como default de UX: primera emisión de la obra puede establecer la referencia si no existe; una nueva revisión del mismo presupuesto de referencia la actualiza con aviso; emitir un presupuesto distinto no reemplaza automáticamente el seleccionado. Cambiar referencia no modifica pedidos, OC, recepciones o consumos ya registrados.

En indicadores comerciales se utiliza **una revisión vigente por presupuesto**, excluyendo borradores e históricos. Esto no convierte todas las propuestas en ventas confirmadas; etiquetar los montos como «Presupuestado».

**Compatibilidad de versiones V1:** los snapshots anteriores son versiones de costos, no evidencia de una emisión comercial. Mantener su consulta, comparación y materiales de referencia; ofrecer copiar a un borrador nuevo. No fabricar una fecha de emisión, recargo o precio de venta histórico ni tratar `totalCost` como venta. Señalar «Versión de costos anterior» cuando corresponda. En indicadores, la falta de importe comercial es un dato no disponible, no un cero; las referencias de abastecimiento V1 siguen siendo válidas para cantidades.

### Regla 6 PDF comercial

Implementar PDF de presupuesto, no confundirlo con el PDF de OC existente.

Contenido: identidad de CEO, cliente/comitente, obra/dirección, fecha de emisión, número/revisión, rubros y partidas ordenadas, unidad, cantidad, precio comercial unitario/importe, subtotales, total, moneda/IVA, condiciones, exclusiones, observaciones y plazo informado. Campos editables en la aplicación; no se pide un editor arbitrario de archivos PDF.

Excluir costos internos, composición de materiales, coeficientes, recargo interno y anotaciones privadas tanto del texto como de metadatos innecesarios. La vista previa comercial debe ser la misma representación que se descarga.

Generar desde la revisión congelada, no desde el catálogo actual. Repetir la descarga reproduce contenido e importes aunque hayan cambiado el cliente, los precios o la obra. Usar activos autorizados existentes y no inventar un logo oficial. Sin bucket nuevo: reutilizar dependencias/capacidades locales y una estrategia determinista basada en snapshot.

Probar varias páginas, nombres extensos, caracteres españoles, m²/m³, importes grandes, saltos de rubro, encabezados repetidos y numeración. Una última hoja solo con pie o un total cortado es un defecto.

### Regla 7 Precios, comparación de corralones e importación

**Historial:** actualizar un precio crea una nueva referencia; no modifica el anterior ni recalcula emisiones pasadas. Mantener proveedor, material, presentación/unidad, moneda, IVA y fecha.

**Comparador:** permitir elegir hasta tres proveedores y mostrar la referencia vigente por material/presentación. No confundirlo con comparar cotizaciones de una compra. Mostrar precio normalizado a unidad base, precio de presentación, moneda, IVA, fecha y fuente; destacar mínimo únicamente dentro de un conjunto comparable.

Una lista con IVA incluido no compite como «más barata» contra otra sin IVA; una presentación sin equivalencia no compite con kg, m³ o bolsas. Usar equivalencias explícitas almacenadas. No deducir que dos productos o unidades son iguales por parecido textual. Si hay empates, mostrarlos; si falta un precio, decirlo, no usar cero. No seleccionar un precio futuro como vigente ni recomendar proveedores inactivos.

**Recordatorio mensual:** aviso visual calculado al consultar la aplicación para revisar referencias; no cron, correo ni notificación externa. Distinguir «revisado» de «precio actualizado» sin generar valores ficticios. Conservar fecha real de última revisión/actualización y probar el cambio de mes en zona Argentina.

**Importación de listas:** reutilizar validación/confirmación/idempotencia del importador actual. Incorporar lectura `.xlsx` y mantener CSV. El `.xls` histórico de los presupuestos se procesa por un adaptador controlado de fuentes si hace falta; no afirmar que el lector XLSX también interpreta cualquier XLS. Mostrar extensiones realmente admitidas y un error claro ante formatos no soportados.

Recorrido obligatorio:

1. Elegir proveedor, archivo y hoja de datos cuando corresponda.
2. Mapear columnas a material/código, unidad/presentación, precio, moneda, IVA y vigencia. Proveedor puede fijarse una vez para toda la lista.
3. Resolver materiales contra el catálogo; primero identificadores exactos/códigos y equivalencias explícitas. No crear cientos de materiales automáticamente por coincidencias dudosas.
4. Previsualizar **datos normalizados y diferencias**: valor anterior, nuevo, unidad, vigencia, errores y duplicados. Conservar texto original cuando sea útil para corregir.
5. Confirmar explícitamente el lote validado; aplicar atómicamente dentro del límite admitido y registrar usuario/fecha/origen.
6. Reintentar el mismo lote no duplica precios. Si el contenido o los datos relevantes cambiaron desde la vista previa, invalidar la confirmación y pedir una nueva revisión del lote.

Usar límites de tamaño/filas claros, basados en los existentes y probados. No dejar asignaciones ilimitadas en memoria. No ejecutar macros, fórmulas, enlaces externos o contenido activo; una fórmula sin valor numérico verificable se señala, no se calcula mediante Excel remoto. Las exportaciones de texto aportado por usuarios no deben convertirse en fórmulas ejecutables al abrirlas.

El importador de **precios** debe ser accesible a Gerencia, Compras y Cómputo dentro de sus permisos de precios. No abrir importación de usuarios, inventario inicial o datos generales a esos roles por compartir pantalla.

### Regla 8 Necesidades netas: evitar comprar o pedir dos veces

No implementar una resta ingenua de «previsto menos stock menos total pedido menos total comprado». Pedido, OC, recepción, reserva y traslado pueden describir **las mismas unidades** en distintos momentos.

La fuente de necesidad es la revisión de referencia de la obra. Trabajar por material y unidad base; agrupar rubros sin atribuir a un rubro un saldo que no tiene esa atribución. Mantener la vista por rubro, pero reconciliar cobertura compartida a nivel obra/material.

Modelo funcional de cálculo:

```text
P = cantidad prevista por el presupuesto de referencia
C = cantidad ya consumida en la obra
S = stock físicamente disponible en esa obra para esta necesidad
T = cobertura pendiente, atribuida a la obra y aún no incorporada en C/S
Cubierto = C + S + T
Faltante para solicitar = max(0, P - Cubierto)
Exceso = max(0, Cubierto - P)
```

`T` no es la suma cruda de documentos. Se forma con cantidades trazadas por origen:

- Un pedido abierto y su OC vinculada representan una sola cobertura; ordenar no duplica la necesidad cubierta.
- La parte recibida sale de cobertura pendiente y entra en stock/consumo, o queda atribuida en galpón para esa obra hasta su traslado. No contar a la vez recepción, reserva y disponibilidad física de las mismas unidades.
- Una OC directa para la obra sin pedido cuenta por su pendiente atribuible. Una compra general de galpón no cubre todas las obras: se muestra como disponibilidad y solo se incorpora a una obra al asignarla, reservarla o transferirla explícitamente.
- Una reserva simple existente puede aportar cobertura cuando esté realmente asociada a la obra. Reservar no mueve stock; transferir esa reserva sustituye la cobertura por stock en destino.
- El stock general sin asignar no se descuenta simultáneamente de los faltantes de varias obras. Mostrarlo en otra columna y ofrecer «Usar/transferir» mediante las operaciones actuales.
- Cancelación/reducción de cobertura pendiente libera lo no recibido. Consumo transforma stock en ejecutado sin volver a generar necesidad. Una devolución de sobrante reduce lo disponible de la obra y puede aumentar la necesidad restante.
- Cambiar la referencia recalcula P, nunca reescribe el histórico ni crea compras automáticas. Si el nuevo previsto es menor a lo cubierto, sugerir cero y mostrar el exceso.

Implementar las asociaciones mínimas de cantidades necesarias para distinguir coberturas, reutilizando `requestId`, líneas, OC, recepciones y reservas existentes. No agregar lotes, trazabilidad de cada bolsa o un WMS. Si un histórico carece de relación suficiente, mostrar una advertencia «Cobertura sin vincular» y no presentar un faltante como exacto ocultando la ambigüedad. Los nuevos flujos deben registrar los vínculos desde el inicio.

**Ejemplo obligatorio:** previsto 100, pedido abierto 40 → sugerido 60. Crear OC de esas 40 → sigue 60. Recibir 20 → stock 20 y pendiente 20 → sigue 60. Consumir 5 → consumo 5, stock 15 y pendiente 20 → sigue 60. Cancelar las 20 pendientes del pedido/abastecimiento conforme las operaciones admitidas → cobertura 20 → sugerido 80. No cancelar una OC parcialmente recibida saltando sus protecciones: el test de liberación debe usar una operación válida de reducción/cancelación pendiente o una cobertura independiente sin recepciones.

La sugerencia se calcula **antes** de confirmar el pedido y se muestra con su desglose. Las cantidades son editables: permitir pedir más de lo previsto con advertencia e historial, sin aprobación obligatoria. Mantener pedidos manuales para obras sin presupuesto de referencia o necesidades imprevistas.

### Regla 9 Compras, OC y recepción

Conservar el circuito existente. Estados de OC: Borrador → Emitida → Recepción parcial → Recibida, y Cancelada donde corresponda. Compras puede emitir; registrar actor/fecha. No introducir cadenas de aprobación ni topes monetarios.

Preservar controles actuales: editar renglones en borrador; no anular una OC con recepciones ni borrar sus movimientos. Para una OC emitida sin recepciones, corregir mediante cancelación y nueva OC, enlazadas en el historial si se incorpora esa referencia. No crear un motor de revisiones de OC como el de presupuestos. Si ya hay recepciones, las correcciones no pueden manipular cantidades históricas ni eliminar stock.

**Importes de OC:** conservar cantidades, precios y equivalencias originales; aplicar al presentar nuevas operaciones el mismo default decimal explícito (2 decimales, HALF_UP por importe extendido y total como suma de líneas). No dejar el total vacío con `ROUNDING_POLICY_REQUIRED` como experiencia habitual. Los valores exactos de origen y las reglas históricas se conservan; documentar la frontera de redondeo y probar fracciones como 1/3. No sumar IVA ni conversiones de moneda sin información explícita.

Permitir compras generales para galpón/patio sin obra, como en V1. No imputar después su importe completo a cada obra que reciba materiales; tampoco inventar una valorización de transferencias.

No imponer una única OC por pedido si el sistema permite parcializar; sí mostrar compras relacionadas, cantidades pendientes y advertir duplicaciones. Cotizaciones y decisiones de proveedor siguen siendo manuales.

Recepciones: líneas, cantidad real, remito, ubicación, usuario y fecha. Proteger excedentes, repeticiones, destinos ajenos, ubicaciones inactivas y concurrencia. Cada confirmación actualiza pendiente y stock de forma atómica. Jefe recibe en sus obras; Compras, en galpón/patio por defecto; Gerencia puede delegar por ubicación con los permisos limitados definidos.

### Regla 10 Factura y pago informativo

Extender la referencia existente de OC con importe/moneda y estado informativo `Pendiente` / `Pagado`, más usuario/fecha del cambio. Conservar número de factura y sus datos de carga. No confundir «fecha de carga» con «fecha real de pago»; solo guardar esta última si se informa expresamente.

Gerencia/Compras mantienen número e importe; Administración restringida consulta y marca el estado informativo. Una reversión de Pagado a Pendiente conserva el evento anterior y su auditoría. No ejecutar transferencias, generar comprobantes fiscales, calcular saldos contables ni administrar cuotas. Mantener una referencia simple por OC, sin añadir un módulo de facturas múltiples.

### Regla 11 Stock e indicadores

Conservar transferencias, consumos, devoluciones, ajustes y mínimos. No convertir reservas existentes en un paso obligatorio de todo pedido. Ninguna acción de presupuesto, emisión de PDF o cambio de cliente mueve stock.

**Tres reportes:**

1. Presupuesto frente a compras/recepciones/consumos por obra, rubro y material. La comparación operativa principal es de cantidades; separar importes de compras cuando se muestran. No restar compras de materiales al precio de venta completo y llamar a eso beneficio.
2. Stock por ubicación/material: físico, reservado cuando exista, disponible, mínimo y alerta. No valoración contable.
3. Compras por obra/proveedor: cantidades, importes registrados, estado y fechas, conservando compras generales sin obra como categoría propia.

**Indicadores por cliente:** obras activas/finalizadas, importe presupuestado vigente y compras asociadas a sus obras, con acceso al detalle. Usar una sola revisión emitida vigente por presupuesto, no todas las revisiones ni borradores. Separar agrupaciones ARS/USD y bases impositivas incompatibles; no convertir monedas ni sumar importes de moneda desconocida como cero.

Filtros mínimos consistentes: cliente, obra, proveedor donde corresponda, período y estado. Fechas inclusivas de negocio con conversión explícita a UTC. Las consultas filtran/totalizan en servidor antes de paginar; las tarjetas no suman solo la página visible. Totales de pantalla y Excel deben reconciliar con el mismo criterio.

Para clientes con varias obras, agregar sin duplicar por joins de líneas. No repetir el importe total de una OC una vez por cada renglón. No imputar todas las compras generales al cliente que recibe después una transferencia.

### Regla 12 Migración puntual de CEO Obras: desarrollar, no ejecutar en producción

Preparar adaptadores/scripts para los archivos disponibles, con modo diagnóstico y dry-run. Reutilizar los importadores existentes. Identificar entidades recuperables y útiles: clientes si existen, proveedores, obras activas, sus vínculos, materiales/unidades y OC abiertas.

Cuidar especialmente OC parcialmente recibidas de origen: trasladar el compromiso pendiente sin volver a ingresar las unidades ya recibidas. No duplicar stock inicial, recepciones históricas y pendientes. Conservar código externo, procedencia, asociaciones y reporte de conciliación.

Deduplificación idempotente; entrada inmutable; resumen de creados/vinculados/rechazados; errores con fila/origen; sin coincidencias dudosas automáticas. Probar todo en base aislada con fixtures. No hacer migración histórica integral ni extracción invasiva del sistema de origen. La ejecución productiva y el corte son tareas operativas posteriores.

---
