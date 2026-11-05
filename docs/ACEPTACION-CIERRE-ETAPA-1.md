# Aceptación ejecutada del cierre de Etapa 1

## Correcciones posteriores al PR8 — 03/11/2026

Base remota revalidada `121264563b73f141e118a2a9f8093c727cc907b8`. Los resultados siguientes son de esta pasada, no conteos reutilizados del PR8. PostgreSQL 18 y API reales; credenciales y evidencias sensibles fuera de Git.

| Hallazgo | Reproducción confirmada | Corrección y regresión |
|---|---|---|
| H01 | Breadcrumb salía sin decisión; corrida ampliada detectó doble redirect al logout | Intención única en navegación existente, tres decisiones, guardado del cuerpo exacto; conflicto y ediciones tardías impiden salir. E2E con breadcrumb, menú/móvil, historial, logout sin POST al cancelar, recarga/cierre nativos, foco y persistencia real |
| H02 | Unidad sin importe con cantidad cero; consumo cero producía error de precisión | Cálculo unitario independiente en servidor, pendiente distinto de cero; pruebas de dominio y BASE grande, precios faltantes y foco |
| H03 | Selector descartaba costos sin aviso | Confirmación previa, revisión reversible en memoria y confirmación antes de guardar. Cancelar/restaurar conservan costos, cantidades y procedencia; ningún tipo de cambio/IVA supuesto |
| H04 | Faltaba alta/reemplazo contextual de materiales | Catálogo, consumo/precio, duplicados, unidades/procedencia, auditoría y sustitución explícita del agregado sin doble suma. API y E2E; borrador local e históricos preservados |
| H05 | Dos diálogos activos al comparar | Comparador como subvista del mismo Modal. Una capa, Tab/Escape, selección y restauración de foco comprobados |

Reproducciones privadas: `logs/review-repro-confirmed.log` (cinco fallas específicas) y `logs/review-fixed-first.log` (cinco aprobadas). Se corrigió antes una clave idempotente omitida del fixture: no se la presentó como defecto del producto. La ampliación inicial dio 64 aprobadas/3 fallas: selector ambiguo del test de historial y doble redirect real de logout en 1440/360; se conservaron assertions y se corrigieron las causas.

Una reproducción API adicional confirmó que, al omitir la evidencia y quitar materiales, la retención de evidencia podía guardar una composición VERIFIED inválida. Se revalida el contenido después de conservar evidencia; ahora devuelve 422 sin modificar la revisión. Evidencia: `logs/review-evidence-integrity-repro.log` y `logs/review-evidence-integrity-fixed.log`. En la reproducción aislada también agotó 5 s la instalación BASE bajo build concurrente; el verificador completo se ejecuta secuencialmente. No se eliminó ni relajó esa prueba.

## Suites completas de esta pasada

| Verificación | Resultado real | Evidencia privada |
|---|---|---|
| API completo anterior al último refuerzo |174 aprobadas + 3 runtime, tipos/build, salida 0 | `logs/technical-api-final-2.log` |
| API con el último refuerzo | 174 aprobadas + 3 runtime, tipos/build y salida 0; incluye conservación y revalidación de evidencia | `logs/technical-api-final-3.log` |
| Web |47 aprobadas, tipos/build y salida 0 | `logs/technical-web-final.log`, corrida `20261103_181943_2-web` |
| E2E completo |68/68 aprobados, builds API/web, salida 0; incluye 15 casos H01–H05 | `logs/technical-e2e-final.log`, corrida `20261103_182124_2-e2e` |
| V1 poblada → ampliada, binario/HTTP/navegador | Aprobado, salida 0; datos preservados y diff sin diferencias | `logs/technical-release-final.log` |
| DG → PostgreSQL → R1/R2/PDF/necesidades | Aprobado; demanda histórica incompleta explícita | `logs/dg-technical-postgresql.log`, `dg-technical-postgresql/verification.json` |
| Manual persistente | Arranque, health/login, cinco perfiles, edición descartada y parada aprobados; reinicio del código integrado pendiente | `manual/evidence/`, guía de pruebas manuales |

Las tres runtime se omiten intencionadamente en el primer grupo y después se ejecutan por separado: no faltan tres integraciones. Persistencia, permisos y recorridos del cierre usan API/PostgreSQL reales. El caso de respuesta demorada retiene una respuesta de un PUT que sí llegó a la API; no reemplaza la persistencia por un mock. Los tests unitarios web y los casos preexistentes de error de transporte conservan sus simulaciones acotadas.

## Revisión visual y PDF

BASE de 146 actividades inspeccionada a 1440/1280/768/390/360: cantidades, costo unitario conocido antes de cantidad, subtotales, pendiente y avisos legibles; controles conservan foco y no hay desborde horizontal. Se reutilizan componentes, estilos y notificaciones existentes. Capturas privadas en `visual-technical-final/cierre/base-revision-*.png`; los screenshots sintéticos históricos de Git no se sustituyen por datos privados.

PDF sintético extenso y DG: siete páginas cada uno, renderizados e inspeccionados en primera/intermedia/última página. Comprobación de todas las páginas sin texto fuera del papel, m²/m³, 28 nombres largos, condiciones extensas, incluidos/excluidos y ausencia de etiquetas internas de costo/recargo/composición. R1 permanece byte idéntico después de cambiar borrador y maestros. Evidencia privada en `pdf-technical-final/inspection.json` y sus PNG/PDF. La API no ha cambiado el renderer de PDF en esta corrección. También se inspeccionó DG en el entorno manual, a 1440/360: composición, comparación como subvista, condiciones, resumen comercial e historial (vacío antes de primera emisión); capturas privadas `manual/evidence/`. El historial con R1/R2 emitidas se comprueba en E2E.

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
| T46 | Fuente real DG/XLS/PDF, factores por fórmula y costos por partida; ver [conciliación](DG-1153-RECONCILIACION.md). 57 casos originales revisados: 2 A/32 B/23 C; diferencia comercial publicada −15,69 conciliada por precisión, sin compensación ficticia |
| T48–T50 | `closure.spec`, `zz-base.spec`, `visual.spec`, regresión móvil: flujo completo de cliente a indicadores, nombres largos, teclado/foco, 1440/1280/768/390/360, navegación/formularios/notificaciones; inspección visual de PNG y PDF |
| T51–T52 | Sesiones, origen/CSRF, validación, allowlists, exportaciones y artefacto runtime; compatibilidad binaria/navegador aprobada antes de merge |
| T53–T54 | Versiones V1 se mantienen como costos y no venta; directos no fabrican materiales; OC nuevas con política explícita y antiguas sin reinterpretación, incluidas fracciones recurrentes |

## Límites de aceptación

La aceptación técnica no equivale a aprobación del piloto por CEO. DG permite conciliar el importe comercial y los materiales verificables; no permite certificar toda su composición física. El export empresarial definitivo para la transición sigue siendo un dato de puesta en marcha. Los avisos correspondientes están implementados y probados. Infraestructura y datos productivos no se modificaron.

## Incremento de carga inicial y costos — 04/11/2026

El incremento posterior a PR13 incorpora catálogos BASE y referencias materiales/MO conectadas, sin reiniciar F0–F9. La aceptación técnica CI-01…CI-48, resultados reales, trazabilidad, visual/PDF y estado de integración están en [estado de costos](ESTADO-CARGA-INICIAL-Y-COSTOS.md). Los resultados anteriores de este documento son históricos y no sustituyen esa matriz. No se declara aceptación de piloto ni habilitación productiva.

## Catálogo de criterios T01–T54

Consolidado desde el plan anterior. Un criterio definido no equivale a prueba aprobada; consultar resultados por candidato y la matriz vigente.


| Test | Escenario y resultado esperado |
|---|---|
| T01 | Crear cliente con dos obras; ficha/obras/enlaces/filtrado muestran asociaciones correctas. |
| T02 | Inactivar cliente preserva obras y revisiones; altas nuevas exigen cliente; histórica sin vínculo sigue consultable sin inventar identidad. |
| T03 | Gerencia/Compras/Cómputo ven todas las obras según módulo; Jefe solo asignadas, también por ID directo, búsquedas y exportación. |
| T04 | Administración entra a OC/factura informativa y no a clientes globales, presupuestos, actividades, costos, stock, usuarios ni reportes económicos generales. |
| T05 | DTO restringidos no filtran campos sensibles; no basta con ocultar botones. Probar enlaces, filtros y exportaciones existentes con el rol nuevo. |
| T06 | Proveedor/material/unidad existente conserva historia; proveedor inactivo no se ofrece para alta nueva y sus OC siguen accesibles. |
| T07 | Ninguna pantalla habitual, error o etiqueta accesible exige APU/BOM/snapshot/override. Un enlace antiguo válido no se rompe. |
| T08 | Crear desde BASE y desde otra revisión copia rubros/actividades/orden; editar nueva obra no altera la fuente ni su historial. |
| T09 | Cambiar cantidad actualiza costo unitario/subtotal/total sin perder foco ni guardar una revisión; backend y pantalla coinciden. |
| T10 | Cambiar catálogo/precios no cambia emitidos; actualización de borrador tiene diferencias visibles y respeta ajustes particulares. |
| T11 | VARIOS permite cantidad y costo directo; no fabrica materiales ni impone 4%. Partida incluida/excluida no duplica costo o demanda. |
| T12 | Costo 3.000.000 y recargo 50% → venta 4.500.000; excepción reemplaza general sin stacking; precio cambia, materiales no. |
| T13 | Operación aritmética sencilla resuelve cantidad; expresiones maliciosas/inválidas no ejecutan código ni guardan valores falsos. |
| T14 | Dos editores o respuestas de cálculo fuera de orden no pisan cambios silenciosamente; conflicto útil y último input preservado. |
| T15 | Guardar borrador cinco veces no crea cinco revisiones; preview tampoco. Emitir crea R1. |
| T16 | Descargar R1 repetidamente o reintentar la emisión sin cambios no duplica revisión. |
| T17 | Editar un emitido crea trabajo editable, no sobrescribe R1; emitir crea R2; cliente/condiciones/precios congelados de R1 se conservan. |
| T18 | Referencia de abastecimiento y revisión vigente se manejan separadas; emitir otro presupuesto no cambia la referencia seleccionada de forma sorpresiva. |
| T19 | PDF contiene cliente, obra, revisión, cantidades, precio comercial, moneda/IVA y condiciones; no contiene costos ni recargo internos. |
| T20 | PDF largo con m²/m³/acentos/nombres largos/totales grandes no corta renglones o totales; subtotales visibles suman el total. |
| T21 | Cambiar datos maestros después de emitir no cambia el PDF histórico; preview corresponde al contenido que se emite. |
| T22 | Nuevo precio conserva anterior; una fecha futura no se usa como vigente; precios explícitos cero/faltante se distinguen. |
| T23 | Comparar tres proveedores por misma unidad/IVA/moneda; marcar menor/empates; incompatibles y faltantes no se muestran como mejores. |
| T24 | Recordatorio mensual aparece según fecha de revisión, cambia de mes correctamente y no requiere job/servicio externo. |
| T25 | XLSX con columnas reordenadas/hojas distintas: mapear, ver valores normalizados y diferencias, confirmar y consultar historia. |
| T26 | Material desconocido, unidad incompatible, IVA ambiguo, duplicado, número local o fórmula no verificable se identifica con fila y no modifica datos antes de confirmar. |
| T27 | Reintento de lote no duplica; lote cambiado invalida huella; rechazo no deja importación parcial invisible. |
| T28 | Compras/Cómputo importan precios sin acceso a importaciones administrativas; archivos excesivos/activos/enlaces externos no se ejecutan. |
| T29 | Pedido manual funciona sin presupuesto; material sugerido puede ajustarse y cantidad mayor se advierte sin imponer aprobación. |
| T30 | Previsto 100/pedido 40 → falta 60; vincular OC por 40 no cambia el faltante a 20. |
| T31 | Recibir 20, consumir 5 y trasladar cobertura asignada mantiene el total cubierto coherente sin contar pedido/OC/recepción dos veces. |
| T32 | Stock general 40 no se asigna automáticamente a dos obras. Reserva/traslado explícito de esas unidades evita doble cobertura. |
| T33 | Cancelación válida de pendiente, devolución y cambio de referencia recalculan faltante/exceso sin borrar historia; faltante mínimo cero. |
| T34 | Dos confirmaciones simultáneas revalidan cobertura; IDs/reintentos no duplican pedidos involuntarios; no ocultar históricos sin vínculo. |
| T35 | Compras crea/emite OC sin Gerencia; estados e historial correctos; mantiene pedido/cotización/proveedor/destino. |
| T36 | Jefe recibe solo en su obra; Compras en galpón/patio; delegado recibe únicamente destino asignado sin ver economía ni otro stock. |
| T37 | OC borrador editable; emitida se conserva; cancelar sin recepción no borra auditoría; parcial no puede cancelarse destructivamente. |
| T38 | Recepción doble/excedida/concurrente no duplica físico; estado parcial/recibida se actualiza con las mismas cantidades. |
| T39 | Registrar número/importe y marcar Pagado/Pendiente deja actor/fecha; Administración no edita conceptos fuera de su permiso ni ejecuta pagos. |
| T40 | Galpón 100 → transferir 30 a obra: galpón70/obra30/consumo0; consumir5: obra25/consumo5; devolución/ajuste conservan trazas y mínimos. |
| T41 | Cliente con dos obras y presupuestos R1/R2: tarjetas suman solo la revisión vigente por presupuesto; borradores e históricos no duplican. |
| T42 | OC con varias líneas no multiplica importe por joins; compra general sin obra no se imputa a cada cliente receptor. |
| T43 | ARS/USD y bases impositivas incompatibles se separan; valor faltante no se representa como cero ni como beneficio calculado. |
| T44 | Filtros por cliente/obra/proveedor/período y totales servidor coinciden con exportación, incluso con varias páginas y corte horario Argentina. |
| T45 | Migración dry-run concilia creados/vinculados/rechazados y no escribe; ejecución aislada idempotente no duplica. |
| T46 | DG 1153 con fuentes reales y precios históricos: verificar costo, particularidades comerciales, materiales y PDF; registrar diferencias de revisión/redondeo sin hardcodear total. |
| T47 | Migrar esquema V1 poblado con obras sin cliente, snapshots antiguos, precios, OC parciales y stock: datos previos intactos y legibles. |
| T48 | Desktop: flujo completo con nombres largos, errores y carga grande; teclado/foco; sin grillas desalineadas, colores o botones inconsistentes. |
| T49 | Móvil 360/390: pedido, recepción, consumo/devolución y navegación sin desborde general ni acciones tapadas. |
| T50 | Flujo integral: cliente → dos obras → plantilla → cantidades → costo → recargo → R1/PDF → R2 → pedido neto → OC → recepción → consumo → indicadores. |
| T51 | Seguridad de aplicación: sesión, CSRF/origen, validación, exportaciones seguras, rechazo de roles no autorizados, sin secretos en logs ni fixtures. |
| T52 | Compatibilidad de release: binario nuevo contra schema V1 preserva las funciones existentes o el merge inseguro se detiene con motivo; con schema expandido todas las funciones nuevas pasan. |
| T53 | Versión V1 de costos conserva lectura, comparación y referencia de materiales; no se presenta como venta emitida ni se fabrica precio comercial para indicadores. |
| T54 | OC con unidades de presentación y fracciones recurrentes obtiene importes mostrados/totales coherentes con la política explícita; no modifica el precio de origen ni suma IVA por suposición. |

Los IDs agrupan varios tests cuando sea necesario. No inventar un requisito de «54 pruebas exactas»: importa cobertura demostrada y resultados reales.
