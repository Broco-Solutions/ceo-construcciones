# Relevamiento técnico del Excel de presupuestos — CEO Construcciones
**Estado:** primera inspección técnica · 21/10/2026 · Pendiente validación con Cómputo y Presupuesto
**Fuente:** archivo original "Presupuesto BASE - OCTUBRE 26.xls" recibido en:
https://drive.google.com/drive/folders/1ApcnIxal6-RjIDc6VkfuxsvqSYhaxRTB

## 1. Inventario de estructura
- Formato XLS legado (BIFF8 / OLE2).
- 22 hojas; 9.950 celdas con fórmulas.
- PRECIOS: tabla mixta de proveedor/material/presentación/unidades, importes y costo por unidad. Se detectaron aproximadamente 233 filas candidatas de artículos con unidad, no equivalentes a 233 SKU únicos.
- MO real: tarifas por día/hora y referencias de trabajo, OCTUBRE 2026.
- COSTO: síntesis de rubros, ítems, costos unitarios de materiales y mano de obra, cantidades y subtotales; alrededor de 143 filas de ítem con costo. Las cantidades están mayormente vacías: solo 4 ítems aparecen con cantidad 1 como datos auxiliares y con importes nulos.
- 19 hojas por rubro (tareas preliminares, movimiento de suelo, aislaciones, estructura, mamposterías, revoques, contrapisos, carpetas, pisos/revestimientos, cielorrasos/yeso, cubiertas, marmolería) con recetas de materiales y mano de obra.

## 2. Lógica relevante para Etapa 1
1. Cada ítem de obra tiene rubro, descripción y unidad de cómputo (m², m³, ml, unidad, global, etc.).
2. Una receta de análisis unitario contiene materiales por unidad de trabajo: material, coeficiente de consumo, unidad y precio normalizado.
3. Costo unitario de material = suma(coeficiente × costo unitario del material).
4. Mano de obra se debe guardar como valor por ítem, sin reproducir cálculos de jornal/tarifas horarias.
5. Costo unitario del ítem = materiales + valor de mano de obra; total del ítem = cantidad medida × costo unitario.
6. Lista de materiales prevista para una obra = consolidación de las recetas de los ítems por sus cantidades.
7. Los coeficientes de venta, rentabilidad, indexaciones y cálculos adicionales del Excel NO forman parte del contrato.

### Ejemplo verificable: CERCO DE OBRA (hoja 01-TareasP, filas 11–22)
Por 1 ml: RAFIA 1 ml, MALLA 2 m², POSTES 0,4 unidad, ALAMBRE GALVANIZADO 0,07 kg, BASES 0,01 m³.
- Total unitario de materiales (valor guardado en Excel): ARS 12.146,87.
- Mano de obra: ARS 3.334,20.
- Costo unitario total: ARS 15.481,07.
Los importes son valores guardados en el Excel y deben confirmarse con la persona responsable del cómputo; no son cotizaciones actuales.

## 3. Hallazgos de calidad y ambigüedades
- En PRECIOS, de las ~233 filas candidatas se observaron ~27 sin precio unitario positivo (cero o faltante). No importarlas como precios válidos sin revisión.
- Variantes de unidades y presentación: KG/kg, U/unid, m²/M2, m³/M3, rollos, bolsones, piezas y valores de cantidad por presentación. Normalización obligatoria antes de agregar consumos.
- Los códigos visibles de análisis se repiten entre ítems (por ejemplo TP1, MS2, PC1). No son identificadores únicos fiables.
- Hojas con rótulos "PRECIOS CON IVA" y "PRECIOS SIN IVA" coexisten. Definir con CEO una única base de precio para cálculos comparables.
- La hoja COSTO incluye coeficientes de ajuste/venta (ejemplo: 1,5 para materiales y mano de obra) que deben quedar fuera del motor V1.
- Hay datos de referencia desactualizados y agrupamientos por proveedor. Un material no debe ser el nombre de una fila: necesita ID, unidad normalizada y proveedor/precio aparte.
- Los 143 ítems en COSTO son una base de costos, NO una obra completa presupuestada con cantidades. El PDF de Vivienda DG 1153 contiene rubros y cantidades, pero no permite comprobar por sí solo el despiece unitario esperado.
- Este análisis inspeccionó registros y valores calculados guardados. La revisión definitiva de exactitud exige un presupuesto editable real y la validación de algunos ítems con CEO.

## 4. Modelo propuesto de reemplazo
- Material: ID interno, nombre, unidad base, categoría.
- Presentación de compra: material, cantidad por presentación, unidad, proveedor.
- Precio de material: precio, criterio IVA, fecha, moneda y fuente/proveedor.
- Rubro e Ítem de análisis: código legible no único, descripción, unidad de trabajo.
- Línea de análisis: ítem, material, cantidad por unidad de trabajo, unidad/correspondencia.
- Presupuesto versión y línea: obra, ítem, cantidad, snapshot de costos; calcular BOM consolidado.
No replicar hojas ni fórmulas: modelar datos y reglas del negocio.

## 5. Próxima validación sugerida
Solicitar al responsable de Cómputo y Presupuesto un archivo Excel real con cantidades completas y seleccionar 3 casos:
1. Ítem con varios materiales y mano de obra (cerco o mampostería).
2. Ítem con conversión de presentación de compra (bolsón/bolsa, m² por pieza, etc.).
3. Una obra o rubro completo para contrastar subtotal y materiales totales.

Definir explícitamente impuestos, moneda, redondeo, versiones y unidades. Una vez aprobadas esas reglas, Codex puede implementar el motor de cálculo con tests numéricos.
