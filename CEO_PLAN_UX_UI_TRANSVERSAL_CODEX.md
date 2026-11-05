# CEO — misión vigente de UX/UI transversal

Único plan activo. Reúne el encargo recibido en Markdown y su copia TXT: son una sola misión. Base comprobada `2859bff9106d6d995cd240b5b0ab18e754abe35d`; rama `codex/ux-transversal-etapa-1`. No autoriza retroceder el árbol. Estado: **implementación en curso, sin aceptación ni publicación de este incremento**.

## Resultado y límites

Reducir clics y mejorar búsqueda, selección, lotes de inventario, documentos e informes sobre la aplicación existente. Entregar código probado, PR con checks y merge autorizado sin bypass, autodespliegue existente y smoke en https://ceo-construcciones.brocosolutions.com. No basta un componente aislado o localhost.

Conservar marca, login, sidebar, tokens, modales centrados, navegación protegida, roles y restricciones económicas, H01–H05, decimales/redondeos, VARIOS antes del recargo, actualización expresa de borradores, históricos inmutables, reservas y separación transferencia/consumo. No modificar usuarios, contraseñas, roles, infraestructura, DNS, recursos, cargas BASE/DG ni operaciones ajenas. No inferir composiciones parciales. Sin servicios nuevos ni reescritura económica.

Preferir esquema actual. Una migración imprescindible será aditiva, probada y declarada; para aplicación online se exige destino comprobado y respaldo puntual, y autorización específica si excede el encargo. Prohibidos DDL en requests, db push, reset, truncado, force-push y bypass. Las pruebas destructivas usan exclusivamente PostgreSQL local aislado. El smoke online sólo crea registros nuevos identificados **DEMO UX**, con materiales/ubicaciones independientes; no borra datos ni emite comunicaciones u OC reales.

## Incrementos y aceptación

Actualizar este archivo al avanzar; evidencia detallada y matriz pantalla → código → prueba en [UX transversal](docs/UX-TRANSVERSAL-ETAPA-1.md), operación en la guía manual y estado de integración en ESTADO-PROYECTO. No duplicar planes por hito.

| Fase | Entregable y controles obligatorios | Estado |
|---|---|---|
| P0 | Inspección de main/árbol/reglas/diseño; preservar cambios locales; baseline público y PDF históricos | Baseline capturado en privado; inventario inicial realizado |
| P1 | Combobox APG compartido, filtros coherentes, búsqueda normalizada en servidor y selección estable | Primitiva y adaptadores adoptados; 5 unitarias de combobox y 3 de selección pasan; revisión visual final pendiente |
| P2 | Adopción en catálogos/formularios/presupuestos/compras/inventario/informes; actividades múltiples; selección y Excel con alcance idéntico | Implementado; E2E real de 115 resultados/3 páginas, exclusión, Excel y actividades múltiples aprobado |
| P3 | Mínimos y movimientos multilínea atómicos, preview, conflictos, idempotencia y reglas compartidas | API y UI implementadas; integración y E2E de mínimos/conflicto/reserva/transferencia/doble clic aprobados; regresión final pendiente |
| P4 | PDF V2 presupuesto/OC con marca y paginación; V1/bytes/hash preservados | Implementado; golden V1/integración/PDF V2 aprobados; 29 páginas presupuesto y 12 OC renderizadas e inspeccionadas |
| P5 | Informes ejecutivos y físicos, KPI/series servidor conciliables, gráficos accesibles y navegación contextual | Implementado; 5 pruebas reales de informes pasan; visual/smoke final pendiente |
| P6 | Tipos/builds/unitarias/integración/E2E completos; visual/PDF; PR/checks/merge/despliegue/smoke público | API final 211 + 3 runtime, tipos/build salida 0; web/E2E completos y publicación en curso |
| Cierre documental | Inventariar, consolidar y retirar sólo duplicados/superados; enlaces y verificaciones; commit separado | Pendiente, después de implementar |

### Controles comunes y adopción

Combobox con ID real, nombre y contexto para homónimos, apertura sin escribir, selección y limpieza, etiqueta estable fuera de la página, inactivos históricos visibles sin nueva elegibilidad. Consulta remota antes de paginar, debounce/cancelación/respuestas fuera de orden, carga acotada y cargar más. Búsqueda tolerante a tildes/caso/espacios, códigos conservados. Consulta libre y sugerencia que filtra por entidad son distintas de la selección obligatoria. Sin crear entidades al escribir. Cliente → obras, origen → saldos/reservas y material → presentaciones validan dependencias sin perder otros campos. Teclado APG, Escape primero opciones, foco, lector, clic externo, viewport/zoom/móvil; lista dentro del contexto modal. Listas cortas pueden seguir nativas. Estados vacíos distinguen ausencia, filtro, asignación y error; reintentar conserva estado.

Aplicación a clientes, obras, proveedores, materiales, actividades, rubros, ubicaciones y MO en filtros y formularios. Actividades: búsqueda por ítem/descripción/código en todo el conjunto autorizado y combinación con rubro/estado; multiincorporación al presupuesto/cómputo con revisión y duplicación expresa, sin alterar renglones previos. Registrar excepciones específicas en la matriz, sin checkbox inútil o acción ficticia.

### Selección y exportación

Checkbox de encabezado sólo página visible, parcial e independiente de navegación; equivalente móvil. Ofrecer todos los N del filtro, congelando IDs/versiones autorizados con límite explícito, exclusiones y conteo. Persistir al paginar/ordenar; invalidar visiblemente al cambiar filtro/contexto; proteger lotes editados. Nuevos registros no ingresan solos; conflictos revisables. Compartir predicado para tabla/conteo/selección/Excel; exportar filtrados y seleccionados son acciones distintas, incluyen todo el alcance, contexto/unidades/fechas/estados y restricciones económicas, sin fórmulas ejecutables. No bajas/cancelaciones masivas ni edición/borrado/repetición de históricos. Recepciones siguen una OC y las emisiones sus flujos existentes.

### Inventario

Mínimos: elegir combinaciones explícitas material–ubicación, incluidos materiales sin saldo; mostrar general/propio/efectivo y antes/después. Valor propio, cero desactiva, null hereda, vacío no escribe. Común sólo por unidad compatible; revisión de cada combinación, altas/cambios/sin cambios. Transacción acotada completa o nada, idempotencia/auditoría/conflictos por fila, sólo Gerencia/Compras. No stock físico/reservado/movimientos/reposición.

Movimientos: encabezado común, filas con unidad/saldos/cantidad obligatoria positiva y reserva/rubro pertinentes; varios materiales revisados sin prellenado silencioso. Origen único compatible. Transferencia/consumo/devolución según permisos; inicial/ajustes exclusivos de Gerencia con apertura/motivo existentes; recepción sólo OC. Validación compartida individual/lote, transacción/idempotencia, permisos/asignaciones/estado/unidades/reservas/disponibilidad actuales, duplicados explícitos, concurrencia sin negativos, rollback y formulario conservado. Registro por material y actor unido al identificador de lote; sin anular históricos.

### PDF e informes

Congelar renderer V1 y despachar por versión guardada, fallback legado documentado; nuevas emisiones/preview V2. Versión de diseño sola no crea revisión ni modifica hashes históricos. R1 previa idéntica byte a byte. OC respeta su política histórica real y PDF oficial almacenado; nuevas presentaciones sin recalcular catálogos ni inventar revisiones. Assets oficiales embebidos/empacados en API, sin dependencia de carpeta web/URL en emisión. A4, marca/identificación/fecha, entidades, tabla legible, rubros, repetición de encabezados, nombres largos/unidades/acento/números grandes, totales/condiciones/exclusiones y página X/Y. Sin costos/MO/recargo/composición interna/metadatos privados. Estados, moneda/IVA y destino OC explícitos, sin datos empresariales/condiciones inventados.

Informes actuales con filtros → KPI → 2/3 gráficos útiles → detalle/Excel; servidor agrega todo el filtro autorizado. Una revisión vigente, monedas/IVA separados, generales sin obra separados, nulos no son cero. Métrica/fecha/alcance claros, venta no es costo ni beneficio real. Cliente sólo Gerencia según permiso actual; demás ámbitos servidor. Físico distingue etapas superpuestas, no suma productos/unidades distintos ni llama avance al consumo. Color acompañado de texto/leyenda; SVG accesible/resumen/tablas, drill-down conserva filtros URL. Error/vacío/carga sin datos ficticios.

## Pruebas y entrega

Demostrar búsqueda fuera de primeras páginas, homónimos/tildes, selección/limpieza/dependencias, teclado/modal/respuestas tardías; ≥3 páginas con página/todos/exclusión/cambio de filtro y exportación exacta; mínimos distintos/0/herencia/sin saldo/error/concurrencia; transferir/consumir/devolver y reservas/duplicados/insuficiencia/reintentos/roles/atomicidad; los cinco perfiles; PDFs de una y muchas páginas hasta 146 actividades con V1 inmutable y V2 sin fugas; KPI/series/Excel conciliados fuera de página, monedas/IVA/unidades/nulos/revisiones; regresiones de edición y propagación/importación/demanda; UI a 1440/1280/768/390/360 y teclado/zoom.

Ejecutar y esperar resultados reales de `bash CEO_Verificar_Local.sh api`, `web`, `e2e`, sin compartir artefactos/puertos con la app manual. Regenerar OpenAPI/tipos si cambia contrato. No eliminar assertions ni ocultar suites omitidas. Evidencia sensible/originales/credenciales fuera de Git; PDF/capturas sintéticos publicables. PR(s) coherentes, revisión de secretos/diff/checks, reconciliar main si avanza; confirmar SHA main y despliegues web/API por separado, luego smoke público con credenciales privadas vigentes, sin resets.

Al final, limpieza documental en commit separado: inventariar antes, consolidar decisiones/pendientes/evidencia en documentos específicos vigentes, retirar duplicados/superados con historial Git preservado, README índice breve y AGENTS sin misiones obsoletas. Antes de retirar un archivo local único no versionado, copia recuperable fuera del repositorio. No tocar secretos/.env/fuentes/backups/DB/migraciones/pruebas/fixtures/referencias visuales/cambios en curso. Actualizar vínculos/scripts/CI y comprobar arranque/build/pruebas.

Cierre con resumen por eje, matriz/excepciones, PR/SHA/checks/despliegues reales, suites/visual/PDF/preservación histórica, recorrido público de diez pasos, migraciones/datos DEMO UX efectivos, limitaciones y limpieza realizada. Sólo declarar **MEJORA TRANSVERSAL IMPLEMENTADA Y VERIFICADA ONLINE** con evidencia completa; de existir bloqueo, informar exactamente implementación/verificación faltante sin sustituir dominio por localhost.
