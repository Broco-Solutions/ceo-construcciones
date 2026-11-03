# DG 1153: revisión técnica de composición y conciliación

Revisión posterior a PR8, 03/11/2026. Se volvieron a leer BASE XLSX, DG XLS y PDF originales privados; no se dedujo la ausencia de fuentes ni se conservaron las 57 conclusiones anteriores por defecto.

## Fuentes y extracción corregida

- BASE SHA-256: `5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e`.
- DG XLS SHA-256: `0e2e7b84dec93f910a5bd826c25bc61d05856a8952aaaea38f0c3ae2bb6facc0`.
- PDF REV C, tres páginas, SHA-256: `33db3be83a905441dd20fc6b3575cba43af78fc243a11245b5b43e7743c5e4c6`.
- Revisión utilizada: `PRESUPUESTO REV C`, precios junio de 2026.

`historical-composition.ts` recorre referencias de celdas, rangos, sumas y escalas explícitas de forma acotada. No evalúa JavaScript, macros, funciones Excel generales o enlaces externos. Los valores cacheados son entradas históricas identificadas, no resultados de ejecutar el archivo. Se agregaron pruebas específicas de referencias locales, encabezados sin código, materiales sin marcador x, precio ausente, ciclos y factores ambiguos.

El adaptador anterior omitía encabezados sin código, filas sin x y referencias locales E→E o conversiones de subtotal. Esos límites se corrigieron. Se eliminó la tolerancia de coincidencia de costo del 0,1%; una diferencia económica no se usa para inventar una composición física. Una placa explícita de 1000×1000 mm equivale a 1 m² según `PRECIOS!A215`; esta equivalencia queda registrada. No se supone densidad para convertir kg a litros o m³.

## Clasificación de los 57 casos reportados en PR8

| Clase | Casos | Criterio |
|---|---:|---|
| A | **2** | Alquiler/limpieza o movilidad explícitos: costo directo, sin materiales deducidos |
| B | **32** | Composición recuperable, recuperada desde referencias y consumos de la fuente |
| C | **23** | Ausencia o contradicción real identificada por celda; se conservan las partes conocidas como orientativas |

En el conjunto actual de partidas con suministro hay **2 A / 52 B / 24 C**. El caso C adicional es CERCO (`REV C!E17`): se detectaron contradicciones antes omitidas entre RAFIA/postes y las unidades de sus referencias de precios. No se declara íntegro sólo porque había sido incluido entre los 28 materiales del cierre anterior.

Se identifican **67 materiales consolidados**, con contribuciones parcialmente orientativas; esto no significa 67 demandas íntegramente verificadas. Hay **52 composiciones** físicas documentadas. Permanecen ocho celdas sin precio de referencia numérico: `03-Aisl!G167:G169`, `03-Aisl!G171`, `03-Aisl!G199`, `04-EstructHE!G39`, `07-CarpetC!G10`, `07-ContrapC!G228`. Sus consumos explícitos pueden conservarse; el precio sigue nulo.

### Resultado por partida (resumen sanitizado)

La columna de celda se refiere a `PRESUPUESTO REV C`. El informe privado contiene la cadena completa hasta cada material, precio y consumo, junto con fórmula, unidad y evidencia de resolución. No se publican originales ni listados de precios sensibles.

| Celda | Partida | Clase | Evidencia o dato pendiente |
|---|---|---|---|
| E18 | OBRADOR Y MOVILIDAD | A | Servicio explícito de movilidad o alquiler/limpieza; costo directo |
| E19 | BAÑO QUIMICO | A | Servicio explícito de movilidad o alquiler/limpieza; costo directo |
| E20 | CARTEL DE OBRA REGLAMENTARIO | B | Referencias y consumos explícitos: 01-TareasP!J45, 01-TareasP!I44, 01-TareasP!G44 |
| E21 | REPLANTEO | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E41 | CAPA AISLADORA EN MUROS INTERIORES  (ENVOLVENTE) 2 HORIZONTALES + 2 VERTICALES. | B | Referencias y consumos explícitos: 03-Aisl!J38, 03-Aisl!I35, 03-Aisl!G35 |
| E43 | AISLACIÓN B/ CONTRAPISO VEREDAS EXT. Y ACCESO VEHICULAR ( FILM POLIET.200 MICRONES ). | B | Referencias y consumos explícitos: 03-Aisl!J49, 03-Aisl!I48, 03-Aisl!G48 |
| E44 | AZOTADO IMPERMEABLE Y PINTURA ASFÁLTICA EN CARA INTERIOR DOBLE MURO. | B | Referencias y consumos explícitos: 03-Aisl!J200, 03-Aisl!I195, 03-Aisl!G195 |
| E45 | AISLACIÓN TÉRMICA EN DOBLE MURO PLACA POLIESTIRENO  ( 1 X 50 MM  EN 20 KG DE DENSIDAD ). | B | Referencias y consumos explícitos: 03-Aisl!J172, 03-Aisl!I167, 03-Aisl!G167 |
| E46 | MANTA Y MEMBRANA LÍQUIDA ( LOCALES SANITARIOS+ALFEIZAR VENTANAS + BOX DUCHA). | C | Unidades contradictorias entre receta y referencia de precio; confirmar unidad/equivalencia |
| E68 | VIGAS DE FUNDACION (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E69 | CABEZALES (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E70 | TABIQUES Y COLUMNAS VISTAS EN TABLAS (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E71 | TABIQUES Y COLUMNAS (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E72 | VIGAS (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E73 | VIGAS VISTAS EN TABLAS  (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E74 | LOSAS MACIZAS (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E75 | LOSAS MACIZAS VISTAS EN FENOLICO (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E76 | ESCALERA (H-30) | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E79 | COLUMNAS UPN 180X2 + PLACA BASE 200X200X9,5MM LARGO 2,60 | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E80 | PERFIL IPN 160 + PLACA DE ACERO (LARGO APROX. 2,60M) | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E83 | MAMPOSTERIA CIMIENTOS LADRILLOS COMUNES 0,30M . | B | Referencias y consumos explícitos: 05-MampCA!J39, 05-MampCA!J38, 05-MampCA!I35 |
| E84 | MAMPOSTERIA CIMIENTOS LADRILLOS COMUNES 0,15M . | B | Referencias y consumos explícitos: 05-MampCA!J39, 05-MampCA!J38, 05-MampCA!I35 |
| E86 | MAMPOSTERIA DE LADRILLOS COMUNES ELEVACIÓN 0.15 | C | Unidades contradictorias entre receta y referencia de precio; confirmar unidad/equivalencia |
| E87 | MAMPOSTERIA INTERIOR DE LADRILLOS COMUNES  0.15 M.( MURO DOBLE). | B | Referencias y consumos explícitos: 05-MampCA!J97, 05-MampCA!I89, 05-MampCA!G89 |
| E88 | MAMPOSTERIA EXTERIOR DE LADRILLOS COMUNES  0.15 M.( MURO DOBLE ). | B | Referencias y consumos explícitos: 05-MampCA!J97, 05-MampCA!I89, 05-MampCA!G89 |
| E89 | PARRILLERO ( LOSAS / PULMON). | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E119 | REVOQUE IMPERMEABLE + GRUESO EXTERIOR EN ALTURA. | B | Referencias y consumos explícitos: 06-RevoqC!J55, 06-RevoqC!I51, 06-RevoqC!G51 |
| E121 | REVOQUE INTERIOR GRUESO BAJO REVESTIMIENTOS. | B | Referencias y consumos explícitos: 06-RevoqC!J42, 06-RevoqC!I39, 06-RevoqC!G39 |
| E143 | CONTRAPISOS SOBRE TERRENO NATURAL EN INTERIORES 15 CM ESPESOR (MORTERO MDC 350 ) | B | Referencias y consumos explícitos: 07-ContrapC!J126, 07-ContrapC!I121, 07-ContrapC!G121 |
| E144 | CONTRAPISOS SOBRE LOSAS 8 CM DE ESPESOR (MORTERO MDC 350) | B | Referencias y consumos explícitos: 07-ContrapC!J139, 07-ContrapC!I136, 07-ContrapC!G136 |
| E145 | CARPETAS DE CEMENTO | B | Referencias y consumos explícitos: 07-CarpetC!J11, 07-CarpetC!I8, 07-CarpetC!G8 |
| E146 | CARPETON SOBRE PISO RADIANTE H17, e: 6CM CON MALLA SIMA | B | Referencias y consumos explícitos: 07-ContrapC!J178, 07-ContrapC!I175, 07-ContrapC!G175 |
| E163 | LOSAS REGLAMENTARIOS LOTE . H21 LLANEADO A MANO CON MALLA / 12 CM ESPESOR. INGRESO VEHI… | B | Referencias y consumos explícitos: 07-ContrapC!J229, 07-ContrapC!I226, 07-ContrapC!G226 |
| E165 | PREPARACION DE SUELO PARA LOSETAS PREMOLDEADAS ESTACIONAMIENTO BAJO PERGOLA | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E167 | CARPETAS DE CEMENTO | B | Referencias y consumos explícitos: 07-CarpetC!J11, 07-CarpetC!I8, 07-CarpetC!G8 |
| E168 | CORDÓN PERIMETRAL EN SOLADOS EXTERIORES. | C | Reutilización/amortización de encofrado: falta regla física; se conserva D sin convertir costo en consumo |
| E182 | COLOCACION DE PISOS PORCELANATO EN EXTERIORES. | B | Referencias y consumos explícitos: 08-09-PisosRev!J82, 08-09-PisosRev!I80, 08-09-PisosRev!G80 |
| E186 | PISO DE PORFIDO INGRESO VEHICULAR (SIN TOMADO DE JUNTAS) | B | Referencias y consumos explícitos: 08-09-PisosRev!J294, 08-09-PisosRev!I290, 08-09-PisosRev!G290 |
| E187 | LOSETAS CRIBADAS DE HORMIGON | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E207 | REVESTIMIENTOS CON PLACAS DE  PORCELLANATO | B | Referencias y consumos explícitos: 08-09-PisosRev!J82, 08-09-PisosRev!I80, 08-09-PisosRev!G80 |
| E219 | CIELORRASO SUSPENDIDO DE YESO | C | Factor del subtotal sin regla física documentada; validar su función |
| E223 | FRENTES Y PANTALLAS | B | Referencias y consumos explícitos: 10-Yeso!J78, 10-Yeso!I70, 10-Yeso!G70 |
| E225 | GARGANTA (3 CARAS + 4 ARISTA) | B | Referencias y consumos explícitos: 10-Yeso!J107, 10-Yeso!I99, 10-Yeso!G99 |
| E226 | ARISTAS | B | Referencias y consumos explícitos: 10-Yeso!J90, 10-Yeso!I87, 10-Yeso!G87 |
| E236 | CARPETA DE NIVELACION SOBRE CONTRAPISO DE PENDIENTE ( CARPETA DE CEMENTO BAJO MEMBRANAS ). | B | Referencias y consumos explícitos: 07-CarpetC!J11, 07-CarpetC!I8, 07-CarpetC!G8 |
| E237 | AISLACION HIDRÁULICA  / MEMBRANA GEOTEXTIL 4MM , TERMINADA CON PINTURA ACRÍLICA. | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E239 | BABETA PERIMETRAL / MANTA Y PINTURA ACRILICA EN MOJINETE PERIMETRAL. | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E257 | MENORES A 2 m2 | B | Referencias y consumos explícitos: 06-RevoqC!P76, 06-RevoqC!O76, 06-RevoqC!J80 |
| E258 | ENTRE 2 y 5 m2 | B | Referencias y consumos explícitos: 06-RevoqC!P77, 06-RevoqC!O77, 06-RevoqC!J80 |
| E259 | ENTRE 5 y 10 m2 | B | Referencias y consumos explícitos: 06-RevoqC!P78, 06-RevoqC!O78, 06-RevoqC!J80 |
| E260 | MAYORES A 10 m2 | B | Referencias y consumos explícitos: 06-RevoqC!P79, 06-RevoqC!O79, 06-RevoqC!J80 |
| E261 | PUERTA INGRESO | B | Referencias y consumos explícitos: 06-RevoqC!P76, 06-RevoqC!O76, 06-RevoqC!J80 |
| E262 | PUERTAS INTERIORES | B | Referencias y consumos explícitos: 06-RevoqC!P76, 06-RevoqC!O76, 06-RevoqC!J80 |
| E263 | PUERTAS CORREDIZAS | B | Referencias y consumos explícitos: 06-RevoqC!P76, 06-RevoqC!O76, 06-RevoqC!J80 |
| E268 | COLOCACIÒN DE UMBRALES y ALFEIZAR | B | Referencias y consumos explícitos: 13-Marmoleria!J22, 13-Marmoleria!J21, 13-Marmoleria!I20 |
| E282 | CAÑERIA DE 220 INDEPENDIENTE | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |
| E285 | INSTALACIÒN ALIMENTACION AGUA FRIA Y CALIENTE | C | Importe agregado sin cantidades/unidades de todos los insumos; falta desglose físico |

Los C concretos comprenden replanteo sin desglose, pintura kg/litros, encofrado/reutilización y factores de subtotal, perfiles/placas sin lista física, arena kg/m³, parrillero, importe fijo de preparación de suelo, losetas sin equivalencia de piezas, membranas/babetas sin consumos y las instalaciones calculadas como porcentaje de mano de obra. El informe privado detalla cada celda; no se atribuyen al cliente los casos B que eran límites del adaptador.

## Resultado económico recalculado

| Concepto | Fuente | Aplicación | Diferencia |
|---|---:|---:|---:|
| Costo | 562.046.923,9518 | **562.046.923,96** | +0,0082 |
| Venta desde precios unitarios cacheados | 861.187.557,1262 | **861.187.541,44** | −15,6862 |
| Venta publicada/PDF | 861.187.557,13 | **861.187.541,44** | **−15,69** |

La diferencia anterior de −18,58 cambió al separar el costo de suministro agregado conocido de sus consumos físicos. Se conservan los importes E/F y factores comerciales de la fuente por partida, sin compensaciones ni un total objetivo literal. `materialsIncludedInDirect` identifica que esos materiales ya están valorizados dentro del agregado: sus cantidades se computan, sus precios de referencia no se suman otra vez y los ausentes no se transforman en cero. El usuario puede sustituir el agregado por composición valorizada de forma explícita y auditada.

La diferencia comercial se descompone exactamente en **−15,707214** por la política de precio unitario frente al precio cacheado ya redondeado, más **+0,021014** por redondear los importes extendidos a dos decimales. Su suma es **−15,686200** respecto del cálculo fuente sin redondear; el publicado redondea a centavos. `rowDifferences` deja el cálculo de cada partida y los subtotales suman 861.187.541,44. No hay tolerancias agregadas para aprobar.

## Integridad y evidencia ejecutada

`dg-technical-postgresql/verification.json` y `logs/dg-technical-postgresql.log` prueban contra una base nueva: 96 actividades, plantilla independiente, R1/reintento/R2, PDF histórico inmutable después de modificar maestros, demanda invariable con recargo y necesidades iguales a la referencia. `materialDemandIncomplete` permanece verdadero por los 24 C; no se certifica abastecimiento histórico íntegro.

El checkbox global de reconocimiento fue retirado. Los faltantes concretos viven por partida, con detalle/fuente/evidencia y cambios auditados. Guardar no permite borrar el marcador ni la evidencia previa sólo quitando campos o cambiando el booleano. Resolver una partida exige documentar composición/consumos o un directo legítimo; no se agregó aprobación comercial.

BASE se reextrajo con el mismo lector: **146 actividades, 17 rubros y 71 observaciones**. Conserva IVA `UNSPECIFIED` por contradicciones reales. La extracción 2 tiene nombre/versionado propios al incorporarla, sin sobrescribir plantillas anteriores, otras obras o emitidos. Cantidades iniciales cero; precios ausentes nulos.

Evidencia sensible completa: `~/.local/state/ceo-construcciones-codex/dg-technical-final/` y `dg-technical-postgresql/`. Las fuentes no se importaron en producción. El entorno manual recibe únicamente una copia privada del contenido normalizado y sus limitaciones. La revisión visual/PDF y los resultados finales se registran en ACEPTACION-CIERRE-ETAPA-1.md.
