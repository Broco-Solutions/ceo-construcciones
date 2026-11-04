# Resultado de carga inicial CEO — resumen sanitizado

Fuente principal BASE, SHA256 `5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e`. DG aporta diez tarifas históricas de julio a las categorías BASE y permanece como complemento histórico privado, con el hash y límites de [su conciliación](DG-1153-RECONCILIACION.md); no se convierte en padrón operativo ni sobreescribe BASE.

| Entidad | Resultado local |
|---|---:|
| Rubros de BASE previa reutilizados por evidencia de instalación | 17 |
| Actividades nuevas del catálogo | 146 |
| Materiales PRECIOS activos / provisionales de servicio inactivos | 222 / 10 |
| Identidades separadas de receta activas / provisionales de servicio inactivas | 94 / 2 |
| Presentaciones de materiales activos / conservadas en identidades inactivas | 222 / 10 |
| Precios históricos seleccionables (186 netos + 186 con IVA) | 372 |
| Referencias provisionales sustituidas, archivadas sin borrar importes | 62 |
| Conceptos MO / tarifas históricas (27 BASE + 10 DG) | 78 / 37 |
| Actividades con MO calculada conciliada | 74 |
| Clientes, obras, proveedores, pedidos, OC o movimientos creados por la carga | 0 |

La primera aplicación creó rubros provisionales propios; se reconciliaron con los 17 rubros comprobados de la instalación BASE anterior. Sólo se retiraron esas filas provisionales sin ediciones ni referencias del usuario, dentro de una transacción con verificaciones y auditoría. No se borraron categorías anteriores, actividades, presupuestos ni datos operativos del usuario. La reejecución anterior ya había creado cero entidades; la conciliación posterior también creó cero y terminó sin conflictos.

Los 234 candidatos PRECIOS se concilian como 222 materiales y 12 servicios excluidos del stock (volquetes, baños, bombeo y alquileres). Sus 268 filas no vacías están inventariadas: 234 candidatas y 34 encabezados/filas excluidas con motivo. MO contiene 80 candidatos: 78 conceptos y dos servicios de suministro+MO combinados sin tarifa salarial fabricada. Se conservan 51 conceptos sin tarifa. Las 27 tarifas conocidas incluyen categorías por hora/día y servicios por unidad, con el mes de fuente. El 21% de aportes no se importa como IVA.

El cemento de `PRECIOS!A5:G5` conserva presentación de 25 kg; la normalización se comprobó una sola vez. El caso real `01-TareasP!J22` se concilió con las tarifas `MO real !D11/D13` y consumos 0,20 h: **3.334,20**. Es evidencia histórica, no recomendación salarial.

Los suministros agregados conservan su costo de origen sin volver a sumar los componentes. Para usar precios nuevos por insumo se exige una sustitución explícita, composición completa y evidencia del alcance retirado; no se inventan residuos. Los tratamientos de IVA contradictorios de BASE se conservan como no informados, sin convertir precios incluidos o excluidos.

Se recuperaron **44 referencias** cuya fórmula explícita `F/B` demostraba la presentación, pese a diferencias de decimales en el caché G. Se conserva el original y la observación; el precio de presentación se normaliza una vez con Decimal. La fila `PRECIOS!A87` conserva un conflicto real (`G87=F87`, presentación 1000), sin equivalencia supuesta. Los valores E y F se incorporan como referencias separadas EXCLUDED/INCLUDED, sin aplicar una alícuota.

La revisión de DG inventarió 213 renglones PRECIOS: 41 cotizaciones ya coinciden con BASE, 165 requieren confirmar el alcance/canal de una cotización diferente y 7 requieren identidad/especificación. No se promueven cambios particulares de DG al catálogo general ni se deduce un precio nuevo por diferencia. Las diez tarifas de categorías horarias/diarias de julio sí tienen correspondencia nominal, unidad y encabezado documentados; comparten recursos con octubre y permanecen en su historial. En MO DG se revisaron además 68 filas de servicios: dos coinciden con referencias BASE, 52 no tienen tarifa y 14 conservan alcance histórico por verificar; ninguna completa de manera verificable una tarifa ausente de BASE. El detalle de los 213 casos está en `catalog-dg-complement-final.json` privado.

La reejecución final creó cero entidades y reportó cero conflictos; la verificación por lote comparó **1.429 correspondencias persistidas** con sus destinos, sin discrepancias. Doce identidades provisionales propias de servicio quedaron inactivas y fuera de las recetas, sin borrar la identidad ni tocar históricos. Ningún saldo, pedido, compra, recepción, consumo, cliente, obra o proveedor operativo se generó por importar.

Los encabezados `PRECIOS!A203/A206/A247` acreditan fechas de día en 2025; no heredan CAS/Octubre 2026 ni el bloque de alquileres. `A220/A228` no acreditan fecha. Se archivaron 62 referencias provisionales incorrectamente atribuidas, sin borrar filas de precios; las correctas generan nuevas referencias y las sin fecha permanecen pendientes. Las archivadas no aparecen como candidatas en precios, comparación, exportación o revisión de costos. El acceso por ID conserva el dato y lo marca por revisar. De las 372 seleccionables, 26 conservan día y 346 mes.

Once pares de nombres coincidentes entre CAS y La Elena quedan separados: H8/H13/H17/H21/H25/H30/H40 y morteros. Sin una especificación técnica común no se deduce identidad únicamente de grado/nombre. El sistema permite varias cotizaciones para una identidad comprobada; los recorridos existentes de tres proveedores y la prueba de selección conservan esa capacidad.

## Faltantes y límites por registro

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
