# Resultado de carga inicial CEO — resumen sanitizado

Fuente principal BASE, SHA256 `5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e`. DG aporta diez tarifas históricas de julio a las categorías BASE y permanece como complemento histórico privado, con el hash y límites de [su conciliación](DG-1153-RECONCILIACION.md); no se convierte en padrón operativo ni sobreescribe BASE.

Las cifras de la tabla siguiente corresponden a PR14; el complemento vigente se concilia al final de este documento.

| Entidad | Resultado local PR14 |
|---|---:|
| Rubros de BASE previa reutilizados por evidencia de instalación | 17 |
| Unidades usadas por el catálogo activo (9 previas + 3 nuevas) | 12 |
| Actividades nuevas del catálogo | 146 |
| Materiales PRECIOS activos / provisionales de servicio inactivos | 222 / 10 |
| Identidades separadas de receta activas / provisionales de servicio inactivas | 94 / 2 |
| Presentaciones de materiales activos / conservadas en identidades inactivas | 222 / 10 |
| Precios históricos seleccionables (186 netos + 186 con IVA) | 372 |
| Referencias provisionales sustituidas, archivadas sin borrar importes | 62 |
| Conceptos MO / tarifas históricas (27 BASE + 10 DG) | 78 / 37 |
| Actividades con MO calculada conciliada | 74 |
| Clientes, obras, proveedores, pedidos, OC o movimientos creados por la carga | 0 |

La extracción creó cinco unidades; tres siguen usadas por el catálogo activo y dos quedan conservadas tras reclasificar servicios. Se reutilizan nueve unidades anteriores sin inferir equivalencias físicas.

La primera aplicación creó rubros provisionales propios; se reconciliaron con los 17 rubros comprobados de la instalación BASE anterior. Sólo se retiraron esas filas provisionales sin ediciones ni referencias del usuario, dentro de una transacción con verificaciones y auditoría. No se borraron categorías anteriores, actividades, presupuestos ni datos operativos del usuario. La reejecución anterior ya había creado cero entidades; la conciliación posterior también creó cero y terminó sin conflictos.

Los 234 candidatos PRECIOS se concilian como 222 materiales y 12 servicios excluidos del stock (volquetes, baños, bombeo y alquileres). Sus 268 filas no vacías están inventariadas: 234 candidatas y 34 encabezados/filas excluidas con motivo. MO contiene 80 candidatos: 78 conceptos y dos servicios de suministro+MO combinados sin tarifa salarial fabricada. Se conservan 51 conceptos sin tarifa. Las 27 tarifas conocidas incluyen categorías por hora/día y servicios por unidad, con el mes de fuente. El 21% de aportes no se importa como IVA.

El cemento de `PRECIOS!A5:G5` conserva presentación de 25 kg; la normalización se comprobó una sola vez. El caso real `01-TareasP!J22` se concilió con las tarifas `MO real !D11/D13` y consumos 0,20 h: **3.334,20**. Es evidencia histórica, no recomendación salarial.

El PR14 conservó todos los suministros como agregados. La corrección focalizada posterior sustituye únicamente las composiciones físicas y económicas demostradas; el resto conserva el agregado histórico. La sustitución y el importe original quedan auditados, sin residuos ni doble suma. Se conserva el tratamiento de cada referencia (E neto/F incluido) y se distingue de la valoración comercial no informada y de MO; no se convierten importes.

Se recuperaron **44 referencias** cuya fórmula explícita `F/B` demostraba la presentación, pese a diferencias de decimales en el caché G. Se conserva el original y la observación; el precio de presentación se normaliza una vez con Decimal. La fila `PRECIOS!A87` conserva un conflicto real (`G87=F87`, presentación 1000), sin equivalencia supuesta. Los valores E y F se incorporan como referencias separadas EXCLUDED/INCLUDED, sin aplicar una alícuota.

La revisión de DG inventarió 213 renglones PRECIOS: 41 cotizaciones ya coinciden con BASE, 165 requieren confirmar el alcance/canal de una cotización diferente y 7 requieren identidad/especificación. No se promueven cambios particulares de DG al catálogo general ni se deduce un precio nuevo por diferencia. Las diez tarifas de categorías horarias/diarias de julio sí tienen correspondencia nominal, unidad y encabezado documentados; comparten recursos con octubre y permanecen en su historial. En MO DG se revisaron además 68 filas de servicios: dos coinciden con referencias BASE, 52 no tienen tarifa y 14 conservan alcance histórico por verificar; ninguna completa de manera verificable una tarifa ausente de BASE. El detalle de los 213 casos está en `catalog-dg-complement-final.json` privado.

La reejecución final creó cero entidades y reportó cero conflictos; la verificación por lote comparó **1.429 correspondencias persistidas** con sus destinos, sin discrepancias. Doce identidades provisionales propias de servicio quedaron inactivas y fuera de las recetas, sin borrar la identidad ni tocar históricos. Ningún saldo, pedido, compra, recepción, consumo, cliente, obra o proveedor operativo se generó por importar.

Los encabezados `PRECIOS!A203/A206/A247` acreditan fechas de día en 2025; no heredan CAS/Octubre 2026 ni el bloque de alquileres. `A220/A228` no acreditan fecha. Se archivaron 62 referencias provisionales incorrectamente atribuidas, sin borrar filas de precios; las correctas generan nuevas referencias y las sin fecha permanecen pendientes. Las archivadas no aparecen como candidatas en precios, comparación, exportación o revisión de costos. El acceso por ID conserva el dato y lo marca por revisar. De las 372 seleccionables, 26 conservan día y 346 mes.

Once pares de nombres coincidentes entre CAS y La Elena quedan separados: H8/H13/H17/H21/H25/H30/H40 y morteros. Sin una especificación técnica común no se deduce identidad únicamente de grado/nombre. El sistema permite varias cotizaciones para una identidad comprobada; los recorridos existentes de tres proveedores y la prueba de selección conservan esa capacidad.

## Conciliación por entidad

| Entidad / origen | Candidatos | Creados/conservados por esta misión | Reutilizados / límites |
|---|---:|---|---|
| Rubros COSTO | 17 | Cero nuevos netos | 17 anteriores; provisionales propios conciliados con evidencia |
| Unidades del catálogo activo | 12 | 3 usadas nuevas; otras 2 conservadas sin uso activo | 9 anteriores por símbolo documentado |
| Productos PRECIOS | 234 | 222 identidades activas | 12 servicios fuera de stock; 10 identidades provisionales propias inactivas |
| Identidades de receta | 96 provisionales | 94 activas | 2 servicios provisionales inactivos; sin fusión por nombre parecido |
| Presentaciones | 222 materiales activos | 222 + 10 conservadas en identidades inactivas | Sin alterar las anteriores del usuario |
| Filas de cotización | 222 productos | 186 con referencias neta/con IVA separadas: 372 precios | 36 sin referencia aplicable; 62 provisionales archivadas sin borrar importes |
| MO BASE | 80 | 78 conceptos; 27 tarifas | 51 sin tarifa; 2 servicios combinados no tratados como salario |
| Categorías MO DG | 10 tarifas | 10 tarifas; cero conceptos nuevos | 10 correspondencias sobre los recursos BASE |
| Actividades / definición de costos | 146 | 146 + 146 | 74 con MO calculada; 63 con alguna limitación; restantes directas/pending según fuente |
| Plantilla conectada | 1 | 1 | Versiones anteriores y borradores existentes preservados |

La última reejecución crea cero y reutiliza todas las correspondencias sin conflictos. Los avisos se cuentan por registro y pueden coexistir con una entidad cargada; no son rechazos globales ni ceros supuestos. `catalog-counts-final.json`, manifiestos, runs y verificación de destinos privados permiten conciliar estas cifras.

## Avisos y límites registrados en PR14 (antecedente)

Manifiesto y cadenas privadas: `~/.local/state/ceo-construcciones-codex/catalog-inventory-v3.json`, `catalog-dg-complement-final.json`, `catalog-source-verification.json` y `catalog-load-*.json`. Se publican claves y causas, sin originales, listados económicos ni credenciales. **164 avisos** BASE: 36 precios, 12 servicios excluidos del stock, 53 casos de MO (51 sin tarifa y 2 combinados) y 63 actividades con faltantes o composición por revisar. Un aviso no equivale a una entidad rechazada.

| Tipo | Origen | Causa / dato pendiente |
|---|---|---|
| price | `PRECIOS!A9` | PRECIOS!E9:F9: precio ausente o error |
| price | `PRECIOS!A12` | PRECIOS!E12:F12: precio ausente o error |
| price | `PRECIOS!A13` | PRECIOS!E13:F13: precio ausente o error |
| price | `PRECIOS!A41` | PRECIOS!E41:F41: precio ausente o error |
| price | `PRECIOS!A42` | PRECIOS!E42:F42: precio ausente o error |
| price | `PRECIOS!A43` | PRECIOS!E43:F43: precio ausente o error |
| price | `PRECIOS!A44` | PRECIOS!E44:F44: precio ausente o error |
| price | `PRECIOS!A45` | PRECIOS!E45:F45: precio ausente o error |
| price | `PRECIOS!A47` | PRECIOS!E47:F47: precio ausente o error |
| price | `PRECIOS!A66` | PRECIOS!E66:F66: precio ausente o error |
| price | `PRECIOS!A87` | PRECIOS!G87: normalización cacheada difiere de F/B; requiere revisión |
| price | `PRECIOS!A148` | PRECIOS!E148:F148: precio ausente o error |
| price | `PRECIOS!A149` | PRECIOS!E149:F149: precio ausente o error |
| service | `PRECIOS!A187` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A188` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A189` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A190` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A202` | Referencia de servicio; no se crea material de stock. |
| price | `PRECIOS!A204` | PRECIOS!E204:F204: precio ausente o error |
| price | `PRECIOS!A205` | PRECIOS!E205:F205: precio ausente o error |
| price | `PRECIOS!A209` | PRECIOS!E209:F209: precio ausente o error |
| price | `PRECIOS!A212` | PRECIOS!E212:F212: precio ausente o error |
| price | `PRECIOS!A213` | PRECIOS!E213:F213: precio ausente o error |
| price | `PRECIOS!A221` | PRECIOS!E221:F221: precio ausente o error |
| price | `PRECIOS!A222` | PRECIOS!E222:F222: precio ausente o error |
| price | `PRECIOS!A223` | PRECIOS!E223:F223: precio ausente o error |
| price | `PRECIOS!A224` | PRECIOS!E224:F224: precio ausente o error |
| price | `PRECIOS!A225` | PRECIOS!E225:F225: precio ausente o error |
| price | `PRECIOS!A226` | PRECIOS!E226:F226: precio ausente o error |
| price | `PRECIOS!A227` | PRECIOS!E227:F227: precio ausente o error |
| price | `PRECIOS!A229` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A230` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A231` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A232` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A233` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A234` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A235` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A236` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A237` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A238` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| price | `PRECIOS!A239` | Fecha/precio sin evidencia suficiente; referencia sin valor aplicable. |
| service | `PRECIOS!A241` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A242` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A243` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A244` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A245` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A246` | Referencia de servicio; no se crea material de stock. |
| service | `PRECIOS!A270` | Referencia de servicio; no se crea material de stock. |
| labor | `MO real !K25` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K26` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K31` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K32` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K33` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K34` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K35` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K36` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K46` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K47` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K48` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K50` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K52` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K53` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K54` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K55` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K56` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K57` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K58` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K59` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K60` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K61` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K62` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K63` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K64` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K65` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K66` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K67` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K68` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K69` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K79` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K80` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K81` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K82` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K83` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K84` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K85` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K86` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K87` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K97` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K98` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K113` | Suministro y MO combinados; no es tarifa salarial. |
| labor | `MO real !K114` | Suministro y MO combinados; no es tarifa salarial. |
| labor | `MO real !K124` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K125` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K134` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K135` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K136` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K137` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K146` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K147` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K157` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| labor | `MO real !K158` | Columna sin tarifa numérica verificable; concepto conservado sin valor. |
| activity | `COSTO!B12` | 01-TareasP!G13: unidad m contradice PRECIOS!C230 (un); no se supone equivalencia; 01-TareasP!G15: unidad un contradice PRECIOS!C184 (m); no se supone equivalencia |
| activity | `COSTO!B13` | COSTO!E13: importe fijo 240000 sin desglose físico |
| activity | `COSTO!B14` | F sin costo numérico: MO pendiente |
| activity | `COSTO!B19` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B20` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B21` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B22` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B23` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B24` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B29` | F sin costo numérico: MO pendiente |
| activity | `COSTO!B30` | COSTO!E30: importe fijo 59100 sin desglose físico |
| activity | `COSTO!B31` | COSTO!E31: importe fijo 19073.068181818181818181818181818181818181818181818181818181818181818181818181818 sin desglose físico |
| activity | `COSTO!B32` | COSTO!E32: importe fijo 43029.545454545454545454545454545454545454545454545454545454545454545454545454546 sin desglose físico |
| activity | `COSTO!B38` | 03-Aisl!G157: unidad L contradice PRECIOS!C138 (kg); no se supone equivalencia |
| activity | `COSTO!B39` | COSTO!E39: importe fijo 17600 sin desglose físico |
| activity | `COSTO!B44` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B45` | 04-EstructHE!I57: división de costo por 2 (reutilización/amortización); cantidad física D57 conservada como orientativa, falta definir uso físico; 04-EstructHE!J59: factor 1.2 del subtotal sin regla física; no se transforma en rendimiento |
| activity | `COSTO!B46` | 04-EstructHE!I57: división de costo por 2 (reutilización/amortización); cantidad física D57 conservada como orientativa, falta definir uso físico; 04-EstructHE!J59: factor 1.2 del subtotal sin regla física; no se transforma en rendimiento |
| activity | `COSTO!B47` | 04-EstructHE!I91: división de costo por 2 (reutilización/amortización); cantidad física D91 conservada como orientativa, falta definir uso físico; 04-EstructHE!I92: división de costo por 2 (reutilización/amortización); cantidad física D92 conservada como orientativa, falta definir uso físico |
| activity | `COSTO!B48` | E sin costo numérico: directo pendiente; 04-EstructHE!I74: división de costo por 2 (reutilización/amortización); cantidad física D74 conservada como orientativa, falta definir uso físico; 04-EstructHE!I75: división de costo por 2 (reutilización/amortización); cantidad física D75 conservada como orientativa, falta definir uso físico |
| activity | `COSTO!B49` | 04-EstructHE!I141: división de costo por 2 (reutilización/amortización); cantidad física D141 conservada como orientativa, falta definir uso físico; 04-EstructHE!I144: división de costo por 2 (reutilización/amortización); cantidad física D144 conservada como orientativa, falta definir uso físico |
| activity | `COSTO!B50` | 04-EstructHE!I178: división de costo por 2 (reutilización/amortización); cantidad física D178 conservada como orientativa, falta definir uso físico; 04-EstructHE!I179: división de costo por 2 (reutilización/amortización); cantidad física D179 conservada como orientativa, falta definir uso físico |
| activity | `COSTO!B51` | E sin costo numérico: directo pendiente; 04-EstructHE!I376: división de costo por 2 (reutilización/amortización); cantidad física D376 conservada como orientativa, falta definir uso físico; 04-EstructHE!I377: división de costo por 2 (reutilización/amortización); cantidad física D377 conservada como orientativa, falta definir uso físico |
| activity | `COSTO!B52` | COSTO!E52: importe fijo 7000 sin desglose físico |
| activity | `COSTO!B54` | COSTO!E54: importe fijo 205743 sin desglose físico |
| activity | `COSTO!B62` | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia |
| activity | `COSTO!B63` | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia |
| activity | `COSTO!B64` | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia |
| activity | `COSTO!B67` | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia |
| activity | `COSTO!B78` | COSTO!E78: importe fijo 200000 sin desglose físico |
| activity | `COSTO!B93` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B94` | COSTO!E94: importe fijo 25000 sin desglose físico |
| activity | `COSTO!B102` | 07-ContrapC!G26: unidad m² contradice PRECIOS!C86 (); no se supone equivalencia |
| activity | `COSTO!B108` | F sin costo numérico: MO pendiente |
| activity | `COSTO!B109` | 08-09-PisosRev!G265: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia |
| activity | `COSTO!B114` | COSTO!E114: importe fijo 5185.983 sin desglose físico |
| activity | `COSTO!B115` | F sin costo numérico: MO pendiente |
| activity | `COSTO!B116` | 08-09-PisosRev!I229: división de costo por 2 (reutilización/amortización); cantidad física D229 conservada como orientativa, falta definir uso físico |
| activity | `COSTO!B127` | COSTO!E127: importe fijo 12000 sin desglose físico |
| activity | `COSTO!B131` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B134` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B140` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B143` | 10-Yeso!J62: factor 1.5 del subtotal sin regla física; no se transforma en rendimiento |
| activity | `COSTO!B144` | 10-Yeso!J62: factor 1.5 del subtotal sin regla física; no se transforma en rendimiento |
| activity | `COSTO!B149` | 10-Yeso!J62: factor 1.5 del subtotal sin regla física; no se transforma en rendimiento |
| activity | `COSTO!B159` | 07-ContrapCA!G81: unidad m³ contradice PRECIOS!C202 (un); no se supone equivalencia |
| activity | `COSTO!B160` | COSTO!E160: importe fijo 17600 sin desglose físico |
| activity | `COSTO!B162` | COSTO!E162: importe fijo 17600 sin desglose físico |
| activity | `COSTO!B163` | COSTO!E163: importe fijo 11120.42 sin desglose físico |
| activity | `COSTO!B164` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente |
| activity | `COSTO!B166` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente |
| activity | `COSTO!B181` | COSTO!E181: importe fijo 7500 sin desglose físico |
| activity | `COSTO!B187` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B188` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B190` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B192` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B193` | E sin costo numérico: directo pendiente |
| activity | `COSTO!B196` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente |
| activity | `COSTO!B199` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente |
| activity | `COSTO!B202` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente |
| activity | `COSTO!B203` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente |
| activity | `COSTO!B204` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente; COSTO!E204: expresión no admitida para extracción física (SUM(K11:K198)*4%/4) |
| activity | `COSTO!B205` | F sin costo numérico: MO pendiente; E sin costo numérico: directo pendiente; COSTO!E205: expresión no admitida para extracción física (SUM(K11:K198)*4%/4) |

## Cierre de vinculación material real posterior al PR14 — 04/11/2026

Reproducción ejecutada sobre main `7dbc7b1`: una base nueva con el cargador/original BASE creó 146 actividades, **0** con materiales vinculados y **0** referencias materiales elegidas. La base manual persistida también tenía 146/0/0; la verificación de sus 1.429 correspondencias previas no detectó ediciones divergentes. La prueba sintética anterior no acreditaba propagación en BASE. Evidencia privada `base-link-before-isolated.json`, `base-link-before-manual.json` y `base-link-manual-before-verification.json`.

La clasificación cubre cada actividad del archivo confirmado, sin imponer estos conteos a fuentes futuras:

| Clase final | Actividades | Criterio |
|---|---:|---|
| A | 3 | Directos legítimos, sin materiales de stock: obrador/movilidad, baño químico y colocación de ménsulas. No se fabrica consumo. |
| B | 67 | Expresión económica y consumo físico comprobados; identidades/presentaciones y referencias elegidas. Suministro calculado, agregado retirado una sola vez. |
| C | 76 | Datos parciales, identidad/unidad o alcance sin respaldo suficiente; conservan importes históricos conocidos y el faltante concreto. |
| D pendiente | 0 | No se deja una receta comprobada bloqueada sólo por la regla fiscal global. Las reglas resueltas se incorporan a B. |

MO calculada permanece en 74 actividades; esa condición puede solaparse con A/B/C y no acredita completitud material. La matriz privada `base-link-inventory.json` contiene para las 146: celdas/cadenas, identidad, unidad, presentación, precio y procedencia, agregado original, suma reconstruida, diferencia y límites físicos/económicos por separado. No se publican listas económicas ni originales.

Se resolvieron restricciones técnicas concretas: referencias E/F/G; precio de presentación normalizado una vez; equivalencias explícitas de bolsón=1 m³ y placa 1000×1000 mm=1 m²; consumos redondeados sólo al final; celdas vacías dentro de SUM; factores económicos explícitos de receta que **no** se transforman en rendimiento ni se clasifican como alícuotas. Los promedios entre productos distintos no prueban identidad física única. Amortizaciones y recargos sobre un subtotal sin alcance físico no se convierten en consumos.

Los precios sin fecha conservan su importe y precisión UNKNOWN, quedan fijados a la referencia histórica seleccionada y fuera de comparaciones/selección automática como última cotización. MaterialPrice V1 exige timestamp: se usa epoch técnico, documentado como **no fecha de cotización**, y UI/exportación muestran “Fecha no informada”. Las referencias nuevas del usuario permanecen append-only. La regla de origen está anclada en correspondencias privadas verificadas; el cliente API no puede inventar un factor o mezclar IVA/proveedor/presentación.

La BASE operativa se completa en la misma plantilla y en los mismos IDs de actividad, sólo cuando las huellas de instalación siguen coincidiendo. Identidades antiguas y plantillas particulares se conservan. Presupuestos/snapshots no se reescriben. Un borrador previo agregado recibe una propuesta **COMPOSITION**, separada, desmarcada y condicionada a que la receta/importe previo sigan siendo los comprobados. Cambios particulares no se convierten al actualizar precios.

Prueba privada ejecutada: `verify-base-material-links.ts`, salida0, original verificado y PostgreSQL/API reales. Verifica todas las B y casos `COSTO!B27` (simple), `B35` (varios insumos/bolsa25kg y bolsón1m³), `B65` (varios insumos), directo `B13` e incompleto `B170`. Registra un precio de prueba en la misma serie/presentación del cemento importado `PRECIOS!A5`; cambia actividad y presupuesto nuevo, conserva consumo particular 6, ajuste manual 999, recargo 37,5%, demanda y R1/PDF. El borrador anterior sólo cambia al aceptar; R2 se emite después. Repetición sin duplicados/reversión; edición de usuario preservada. Los importes de prueba sólo se agregan a la base aislada del escenario, no al catálogo manual real.

Prueba publicable: `base-material-links.integration.test.ts` crea un XLSX sanitizado con la estructura/fórmulas originales y lo extrae/aplica; no inserta una receta preconectada. Cubre concurrencia, corrección PR14→composición, plantilla congelada, borrador previo y rechazo de factores/valoraciones sin prueba. La prueba sintética 6100→6500→6900 se conserva.

### Correspondencia de las actividades de esta fuente

Las causas se sanitizan; la matriz privada conserva los valores y la cadena completa. “Histórico conocido” no equivale a ausencia numérica.

| Actividad / celda COSTO | Clase | Resultado o causa concreta |
|---|---|---|
| `COSTO!B12` | C | 01-TareasP!G13: unidad m contradice PRECIOS!C230 (un); no se supone equivalencia; 01-TareasP!G15: unidad un contradice PRECIOS!C184 (m); no se supone equivalencia; 01-TareasP!G13: unidad m distinta de PRECIOS!A230 (un); equivalencia ausente.; 01-TareasP!G15: unidad un distinta de PRECIOS!A184 (m); equivalencia ausente. |
| `COSTO!B13` | A | Directo legítimo sin insumos de stock. |
| `COSTO!B14` | A | Directo legítimo sin insumos de stock. |
| `COSTO!B15` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B16` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B19` | C | COSTO!B19: suministro sin composición verificable; importe ausente. |
| `COSTO!B20` | C | COSTO!B20: suministro sin composición verificable; importe ausente. |
| `COSTO!B21` | C | COSTO!B21: suministro sin composición verificable; importe ausente. |
| `COSTO!B22` | C | COSTO!B22: suministro sin composición verificable; importe ausente. |
| `COSTO!B23` | C | COSTO!B23: suministro sin composición verificable; importe ausente. |
| `COSTO!B24` | C | COSTO!B24: suministro sin composición verificable; importe ausente. |
| `COSTO!B27` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B28` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B29` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B30` | C | COSTO!E30: importe fijo histórico sin desglose físico |
| `COSTO!B31` | C | COSTO!E31: importe fijo histórico sin desglose físico |
| `COSTO!B32` | C | COSTO!E32: importe fijo histórico sin desglose físico |
| `COSTO!B33` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B34` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B35` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B36` | C | 03-Aisl!G167: 03-Aisl!G167: valor numérico ausente; importe histórico ausente, sin inventar referencia.; 03-Aisl!G168: 03-Aisl!G168: valor numérico ausente; importe histórico ausente, sin inventar referencia.; 03-Aisl!G169: 03-Aisl!G169: valor numérico ausente; importe histórico ausente, sin inventar referencia.; 03-Aisl!G171: 03-Aisl!G171: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B37` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B38` | C | 03-Aisl!G157: unidad L contradice PRECIOS!C138 (kg); no se supone equivalencia; 03-Aisl!G157: unidad L distinta de PRECIOS!A138 (kg); equivalencia ausente. |
| `COSTO!B39` | C | COSTO!E39: importe fijo histórico sin desglose físico |
| `COSTO!B40` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B44` | C | COSTO!B44: suministro sin composición verificable; importe ausente. |
| `COSTO!B45` | C | 04-EstructHE!I57: división de costo por 2 (reutilización/amortización); cantidad física D57 conservada como orientativa, falta definir uso físico; 04-EstructHE!J59: factor 1.2 del subtotal sin regla física; no se transforma en rendimiento; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G54: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B46` | C | 04-EstructHE!I57: división de costo por 2 (reutilización/amortización); cantidad física D57 conservada como orientativa, falta definir uso físico; 04-EstructHE!J59: factor 1.2 del subtotal sin regla física; no se transforma en rendimiento; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G54: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B47` | C | 04-EstructHE!I91: división de costo por 2 (reutilización/amortización); cantidad física D91 conservada como orientativa, falta definir uso físico; 04-EstructHE!I92: división de costo por 2 (reutilización/amortización); cantidad física D92 conservada como orientativa, falta definir uso físico; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G88: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia.; 04-EstructHE!G92: identidad de precio no recuperada; importe histórico conocido, sin inventar referencia. |
| `COSTO!B48` | C | 04-EstructHE!I74: división de costo por 2 (reutilización/amortización); cantidad física D74 conservada como orientativa, falta definir uso físico; 04-EstructHE!I75: división de costo por 2 (reutilización/amortización); cantidad física D75 conservada como orientativa, falta definir uso físico; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G69: [7]PRECIOS!E192: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G70: 04-EstructHE!G70: valor numérico ausente; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G72: [7]PRECIOS!G59: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G73: [7]PRECIOS!G58: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G74: [7]PRECIOS!G179: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G75: [7]PRECIOS!E177: celda no disponible; importe histórico ausente, sin inventar referencia.; COSTO!B48: agregado original ausente; no se inventa un costo completo. |
| `COSTO!B49` | C | 04-EstructHE!I141: división de costo por 2 (reutilización/amortización); cantidad física D141 conservada como orientativa, falta definir uso físico; 04-EstructHE!I144: división de costo por 2 (reutilización/amortización); cantidad física D144 conservada como orientativa, falta definir uso físico; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G140: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia.; 04-EstructHE!G141: unidad un distinta de PRECIOS!A184 (m); equivalencia ausente. |
| `COSTO!B50` | C | 04-EstructHE!I178: división de costo por 2 (reutilización/amortización); cantidad física D178 conservada como orientativa, falta definir uso físico; 04-EstructHE!I179: división de costo por 2 (reutilización/amortización); cantidad física D179 conservada como orientativa, falta definir uso físico; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G175: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia.; 04-EstructHE!G178: unidad un distinta de PRECIOS!A184 (m); equivalencia ausente. |
| `COSTO!B51` | C | 04-EstructHE!I376: división de costo por 2 (reutilización/amortización); cantidad física D376 conservada como orientativa, falta definir uso físico; 04-EstructHE!I377: división de costo por 2 (reutilización/amortización); cantidad física D377 conservada como orientativa, falta definir uso físico; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 04-EstructHE!G371: [7]PRECIOS!G193: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G372: [7]PRECIOS!K197: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G374: [7]PRECIOS!G59: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G375: [7]PRECIOS!G58: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G376: [7]PRECIOS!G179: celda no disponible; importe histórico ausente, sin inventar referencia.; 04-EstructHE!G377: [7]PRECIOS!G176: celda no disponible; importe histórico ausente, sin inventar referencia.; COSTO!B51: agregado original ausente; no se inventa un costo completo. |
| `COSTO!B52` | C | COSTO!E52: importe fijo histórico sin desglose físico |
| `COSTO!B54` | C | COSTO!E54: importe fijo histórico sin desglose físico |
| `COSTO!B57` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B58` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B59` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B60` | C | 05-MampCA!G91: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B61` | C | 05-MampCA!G75: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B62` | C | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia; 05-MampCA!G48: unidad kg distinta de PRECIOS!A31 (BOLSON); equivalencia ausente.; 05-MampCA!G49: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B63` | C | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia; 05-MampCA!G48: unidad kg distinta de PRECIOS!A31 (BOLSON); equivalencia ausente.; 05-MampCA!G49: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B64` | C | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia; 05-MampCA!G48: unidad kg distinta de PRECIOS!A31 (BOLSON); equivalencia ausente.; 05-MampCA!G49: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B65` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B66` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B67` | C | 05-MampCA!G48: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia; 05-MampCA!G48: unidad kg distinta de PRECIOS!A31 (BOLSON); equivalencia ausente.; 05-MampCA!G49: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B69` | C | 05-MampC!G236: 05-MampC!G236: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B70` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B71` | C | 05-MampC!G264: 05-MampC!G264: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B73` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B74` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B75` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B76` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B77` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B78` | C | COSTO!E78: importe fijo histórico sin desglose físico |
| `COSTO!B82` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B83` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B84` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B85` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B86` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B87` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B89` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B90` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B91` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B92` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B93` | C | COSTO!B93: suministro sin composición verificable; importe ausente. |
| `COSTO!B94` | C | COSTO!E94: importe fijo histórico sin desglose físico |
| `COSTO!B95` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B96` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B100` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B101` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B102` | C | 07-ContrapC!G26: unidad m² contradice PRECIOS!C86 (); no se supone equivalencia |
| `COSTO!B103` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B104` | C | 07-CarpetC!G10: 07-CarpetC!G10: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B105` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B107` | C | 07-ContrapC!G164: 07-ContrapC!G164: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B108` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B109` | C | 08-09-PisosRev!G265: unidad kg contradice PRECIOS!C31 (m³); no se supone equivalencia; 08-09-PisosRev!G265: unidad kg distinta de PRECIOS!A31 (BOLSON); equivalencia ausente. |
| `COSTO!B110` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B112` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B113` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B114` | C | COSTO!E114: importe fijo histórico sin desglose físico |
| `COSTO!B115` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B116` | C | 08-09-PisosRev!I229: división de costo por 2 (reutilización/amortización); cantidad física D229 conservada como orientativa, falta definir uso físico; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.; 08-09-PisosRev!G230: PRECIOS: fórmula no soportada: +AVERAGE(G47:G53); importe histórico conocido, sin inventar referencia. |
| `COSTO!B117` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B118` | C | 07-CarpetC!G10: 07-CarpetC!G10: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B119` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B122` | C | 08-09-PisosRev!G160: 08-09-PisosRev!G160: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B123` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B124` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B125` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B126` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B127` | C | COSTO!E127: importe fijo histórico sin desglose físico |
| `COSTO!B128` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B129` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B130` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B131` | C | COSTO!B131: suministro sin composición verificable; importe ausente. |
| `COSTO!B132` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B134` | C | COSTO!B134: suministro sin composición verificable; importe ausente. |
| `COSTO!B135` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B138` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B139` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B140` | C | COSTO!B140: suministro sin composición verificable; importe ausente. |
| `COSTO!B143` | C | 10-Yeso!J62: factor 1.5 del subtotal sin regla física; no se transforma en rendimiento; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose. |
| `COSTO!B144` | C | 10-Yeso!J62: factor 1.5 del subtotal sin regla física; no se transforma en rendimiento; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose. |
| `COSTO!B145` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B146` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B147` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B148` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B149` | C | 10-Yeso!J62: factor 1.5 del subtotal sin regla física; no se transforma en rendimiento; El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose. |
| `COSTO!B150` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B151` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B152` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B156` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B157` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B158` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B159` | C | 07-ContrapCA!G81: unidad m³ contradice PRECIOS!C202 (un); no se supone equivalencia; PRECIOS!A202: servicio, no insumo de stock. |
| `COSTO!B160` | C | COSTO!E160: importe fijo histórico sin desglose físico |
| `COSTO!B161` | C | 07-CarpetC!G10: 07-CarpetC!G10: valor numérico ausente; importe histórico ausente, sin inventar referencia. |
| `COSTO!B162` | C | COSTO!E162: importe fijo histórico sin desglose físico |
| `COSTO!B163` | C | COSTO!E163: importe fijo histórico sin desglose físico |
| `COSTO!B164` | C | COSTO!B164: suministro sin composición verificable; importe ausente. |
| `COSTO!B166` | C | COSTO!B166: suministro sin composición verificable; importe ausente. |
| `COSTO!B170` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B171` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B172` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B173` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B174` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B175` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B176` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B177` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B178` | C | PRECIOS!A12: importe F o presentación B ausente; el valor conocido de receta se conserva como histórico. |
| `COSTO!B181` | A | Directo legítimo sin insumos de stock. |
| `COSTO!B182` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B183` | B | Composición y referencias vinculables; prueba lineal y presentación explícita. |
| `COSTO!B187` | C | COSTO!B187: suministro sin composición verificable; importe ausente. |
| `COSTO!B188` | C | COSTO!B188: suministro sin composición verificable; importe ausente. |
| `COSTO!B190` | C | COSTO!B190: suministro sin composición verificable; importe ausente. |
| `COSTO!B192` | C | COSTO!B192: suministro sin composición verificable; importe ausente. |
| `COSTO!B193` | C | COSTO!B193: suministro sin composición verificable; importe ausente. |
| `COSTO!B196` | C | COSTO!B196: suministro sin composición verificable; importe ausente. |
| `COSTO!B199` | C | COSTO!B199: suministro sin composición verificable; importe ausente. |
| `COSTO!B202` | C | COSTO!B202: suministro sin composición verificable; importe ausente. |
| `COSTO!B203` | C | COSTO!B203: suministro sin composición verificable; importe ausente. |
| `COSTO!B204` | C | COSTO!E204: expresión no admitida para extracción física (SUM(K11:K198)*4%/4) |
| `COSTO!B205` | C | COSTO!E205: expresión no admitida para extracción física (SUM(K11:K198)*4%/4) |

### Complemento aplicado en la base manual

Aplicación `cmw222m5600fb721tnuvs6xyd`: 67 vinculadas, cero conflictos; cero materiales/actividades/plantillas nuevos y ninguna operación creada. Se agregaron 12 referencias y 12 presentaciones comprobadas sobre identidades existentes; 9 correspondencias de equivalencia reutilizan identidades previas y 2 documentan factores económicos. Total de correspondencias 1.531, verificación sin discrepancias. Referencias PRECIOS anteriores 372 conservadas, más 12 referencias de composición; no se borraron las 62 provisionales archivadas.

La reejecución final crea cero y conserva las67 conexiones, con cero conflictos. Se normaliza el orden de claves JSON antes de comparar la definición; PostgreSQL JSONB no se interpreta como edición de usuario por reordenar claves. Las pruebas exigen ausencia de estos falsos conflictos y preservación de conflictos reales. Evidencias privadas `base-link-manual-apply.json`, `base-link-manual-repeat-final.json`, `base-link-manual-verification.json`.

## Habilitación online autorizada — 05/11/2026

La misión posterior autorizó y ejecutó respaldo puntual, las siete migraciones pendientes, BASE/DG con vinculación PR15 y accesos/datos DEMO en el entorno online existente. El registro, límites históricos, accesos privados y smoke real del dominio están en [DEMO-ONLINE.md](DEMO-ONLINE.md). Esto no cambia el carácter exclusivamente local de las ejecuciones anteriores ni los controles de sus auxiliares.
