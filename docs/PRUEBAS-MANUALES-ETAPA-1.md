# Pruebas manuales de Etapa 1

Este entorno es local, aislado y persistente. Las pruebas manuales no equivalen a aceptación del piloto ni habilitación productiva. No se aplican migraciones ni datos a producción.

El arranque registra el SHA y la huella exacta del código compilado en `release.json`; `bash CEO_Manual_Local.sh status` permite consultarlos. Los resultados de la misión de costos de referencia se registran en [su estado y matriz](ESTADO-CARGA-INICIAL-Y-COSTOS.md). Las cifras del PR9 y PR13 son antecedentes y no sustituyen esta validación.

## Arranque desde WSL

Desde una terminal WSL, con Docker local disponible:

```bash
cd /home/rcoirini/proyectos-bs/ceo-construcciones
bash CEO_Manual_Local.sh start
```

Esperar el mensaje `LISTO`. El comando valida Docker/destino/puertos, aplica las migraciones de aplicación exclusivamente a `ceo_manual_test`, completa los datos iniciales faltantes y compila ambos servidores. No resetea la base, no cambia contraseñas existentes y no mata procesos ajenos. Dejar esta terminal abierta. No ejecutar el runner automatizado ni otro build mientras estos servidores usan `.next`.

- Aplicación: <http://localhost:3100>
- API/health: <http://127.0.0.1:3101/api/health>
- Detener desde otra terminal: `bash CEO_Manual_Local.sh stop`; también sirve Ctrl+C en la terminal supervisora.
- Comprobar procesos, versión y ubicación de credenciales: `bash CEO_Manual_Local.sh status`.
- Repetir el smoke de sólo lectura y edición descartada: `node apps/web/scripts/manual-smoke.mjs`.

El SHA, árbol y huella de cambios que **efectivamente se compilaron** quedan en `~/.local/state/ceo-construcciones-codex/manual/release.json`. Un árbol con cambios locales se identifica explícitamente. La sesión de Codex puede cerrar sus procesos al finalizar: el comando anterior es el arranque para la terminal del usuario, no una promesa de que la app permanezca encendida.

Las credenciales únicas de los cinco perfiles están en `~/.local/state/ceo-construcciones-codex/manual/credenciales.json` (permiso 600). Consultarlas localmente con `less` y no pegarlas en tickets, Git o chats. Los logs, conexión manual y evidencias también quedan en esa carpeta privada. No usar credenciales productivas.

## Datos iniciales y repetición

Cliente `MAN-CLI`: obras Norte y Sur (`MAN-OBR-1/2`). Otro cliente: obra ajena `MAN-OBR-3`. El Jefe de Obra está asignado inicialmente sólo a Norte. Cinco perfiles, tres proveedores `MAN-PROV-1/2/3`, cemento/cal, precios, plantilla sintética, galpón `MAN-GAL` y patio `MAN-PAT`. Administración tiene recepción delegada en galpón. Hay stock sintético, OC de obra pendiente de recibir y OC general con importe informativo de factura.

El presupuesto sintético tiene costo unitario 1.524 ARS: mano de obra 1.000 + directo 500 + dos unidades de material a 12. Con cantidad 2, costo 3.048; recargo 50%, venta 4.572. Son valores iniciales: conservar los cambios realizados durante pruebas. Para repetir un recorrido comercial, crear otro presupuesto desde la plantilla y usar nombres distintivos; para compras, crear nuevos documentos. No borrar ni resetear para repetir.

BASE CEO — Octubre 2026 tiene actividades en el catálogo normal, recursos/tarifas de MO, materiales y precios históricos. Los materiales de origen usan códigos `CEO-`; `MAN-*` identifica ejemplos sintéticos. Las plantillas BASE anteriores y los presupuestos iniciados se conservan. DG sigue siendo un documento histórico privado con limitaciones físicas por partida, no un padrón de clientes/obras/proveedores. El ejemplo sintético completo permite probar el flujo sin esas limitaciones.

## Costos de referencia y catálogo inicial

La preparación se ejecuta una vez de forma explícita, con los servidores manuales detenidos. No se importa de nuevo durante cada arranque. Originales, manifiestos y resultados detallados están en `~/.local/state/ceo-construcciones-codex/`, fuera de Git. El comando valida PostgreSQL loopback `ceo_manual_test`, contenedor y puerto; un destino cloud se rechaza.

```bash
bash CEO_Catalogo_Local.sh inspect "$HOME/.local/state/ceo-construcciones-codex/sources/base.xlsx" "$HOME/.local/state/ceo-construcciones-codex/catalog-inventory-v3.json"
bash CEO_Catalogo_Local.sh apply "$HOME/.local/state/ceo-construcciones-codex/catalog-inventory-v3.json" "$HOME/.local/state/ceo-construcciones-codex/sources/base.xlsx" 5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e
bash CEO_Catalogo_Local.sh inspect-dg "$HOME/.local/state/ceo-construcciones-codex/sources/dg.xls" "$HOME/.local/state/ceo-construcciones-codex/catalog-dg-complement-final.json"
bash CEO_Catalogo_Local.sh apply "$HOME/.local/state/ceo-construcciones-codex/catalog-dg-complement-final.json" "$HOME/.local/state/ceo-construcciones-codex/sources/dg.xls" 0e2e7b84dec93f910a5bd826c25bc61d05856a8952aaaea38f0c3ae2bb6facc0
# El resultado devuelve runId; verificarlo con:
bash CEO_Catalogo_Local.sh verify RUN_ID
```

La carga local ya fue aplicada y repetida. Se comprobaron 17 rubros reutilizados con evidencia de la BASE anterior, 146 actividades, 222 materiales activos de PRECIOS, 94 identidades activas de receta y dos provisionales inactivas que no se fusionan sin evidencia, 222 presentaciones de materiales activos y 10 conservadas de servicios inactivos, 372 referencias de precio (186 netas y 186 con IVA), 78 conceptos de MO y 37 tarifas (27 BASE y 10 DG). Hay 74 actividades con composición MO recuperada. Son referencias históricas: su fecha de origen no es la fecha de importación. Las celdas sin cotización o sin unidad/rendimiento reconciliado permanecen pendientes; los agregados históricos no se suman otra vez a materiales.

| Paso | Recorrido | Comprobar |
|---|---|---|
| 1 | Catálogo: buscar materiales por `CEO-`, actividades y BASE CEO | Registros persistentes en catálogos; no sólo una plantilla |
| 2 | Catálogo → Costos de referencia → Mano de obra → Registrar tarifa | Fuente, fecha, moneda/IVA y actividades vinculadas visibles; historial conservado |
| 3 | Abrir una actividad vinculada y otra de MO directa | Cambia la calculada en la misma serie compatible; la directa conserva su importe |
| 4 | Materiales → Actualizar esta referencia | Mantiene proveedor/canal y presentación; ingresar nuevo precio/fecha; no elegir el más barato automáticamente |
| 5 | Nuevo presupuesto desde BASE CEO | Costos disponibles como opción inicial; cantidades cero; faltantes y referencias históricas explícitos |
| 6 | Borrador anterior → Revisar costos de referencia | Previsualizar no escribe; manuales desmarcados; confirmar conserva cantidades, consumos particulares y recargo |
| 7 | Guardar y luego emitir R2; descargar también R1 | Guardar no emite; R1/PDF idénticos; demanda material invariable por cambiar sólo costos |
| 8 | Otros perfiles y reinicio con `CEO_Manual_Local.sh` | Jefe/Administración sin economía; Compras consulta MO sin editar; datos y credenciales conservados |

Para sustituir un suministro agregado en una actividad, elegir composición completa, referencias compatibles y documentar evidencia del alcance que se retira. La vista previa retira el agregado completo y no crea ajustes residuales. Cancelar conserva la configuración anterior. Cambiar moneda/IVA no convierte valores.

Para revisar este incremento: `node apps/web/scripts/catalog-manual-smoke.mjs` conserva las pruebas del usuario y crea una sola copia `MAN — revisión de catálogo inicial` si no existe. Guarda evidencia privada en `catalog-final/`. `node apps/web/scripts/catalog-pdf-smoke.mjs` crea una única propuesta sintética `MAN — PDF multipágina`, preserva su R1 y permite redescargarla sin emitir otra revisión. La regresión `node apps/web/scripts/catalog-preview-navigation.mjs` demora una respuesta real de revisión y comprueba una sola capa de diálogo al navegar con cambios, sin escritura; ejecutarla después del smoke de catálogo. Estos auxiliares requieren el servidor local abierto; no usan la base E2E.

## Vinculación real de materiales BASE — complemento posterior al PR14

Código de aplicación probado: commits `b228580`, `ee24d35` y `559c909`; documentación/checks/SHA de main en [PR15](https://github.com/Broco-Solutions/ceo-construcciones/pull/15). El SHA exacto compilado del entorno manual está en `manual/release.json` privado y se verifica nuevamente tras integrar. Pruebas nuevas reales y suites: API187+3, web49, E2E72; datos y PDF preservados, sin cambios de esquema.

El complemento ya se aplica explícitamente en local, no durante cada arranque. Conserva el catálogo/credenciales y presupuestos previos; 67 actividades tienen materiales calculados, 3 son directos legítimos y 76 conservan límites específicos. La MO calculada sigue en 74; estos grupos se solapan. Ver [clasificación por actividad](CARGA-INICIAL-RESULTADOS.md#cierre-de-vinculación-material-real-posterior-al-pr14--04112026).

Para probar un caso real completo:

1. En **Actividades de obra**, buscar **REVOQUE HIDROFUGO CAPA AISLADORA** (`COSTO!B35`). La ficha distingue **Materiales calculados**, **Mano de obra**, **Otros directos** y **Costo por unidad**. La composición incluye cemento, arena y aditivo; otros directos 0, sin sumar el suministro original otra vez.
2. En **Costos de referencia → Materiales**, buscar **CEMENTO PORTLAND LOMA NEGRA** de BASE (`PRECIOS!A5`), fuente Orlandi/mayo 2026, presentación 25 kg. Usar **Actualizar esta referencia**, conservando canal, presentación, moneda e IVA informado; registrar una fecha y precio de prueba propios. No cambiar el IVA comercial del presupuesto para forzar compatibilidad.
3. Volver a la actividad: cambia el costo por unidad; los consumos permanecen. La referencia histórica anterior continúa en el historial. Un valor de prueba se identifica por su registro posterior, sin alterar el precio original.
4. Crear un presupuesto desde **BASE CEO — Octubre 2026**. Toma referencias de esa serie; cantidades iniciales 0. La copia `MAN — BASE materiales vinculados` también permite recorrer la UI sin reemplazar el borrador anterior.
5. En un borrador creado con las composiciones nuevas, modificar un consumo o precio particular y guardar. Después de registrar otra referencia, abrir **Revisar costos de referencia**: previsualizar, seleccionar sólo el cambio deseado y aplicar. Se conservan consumos, ajustes manuales y recargo; guardar no emite.
6. En **MAN — revisión de catálogo inicial** (anterior al complemento), el agregado se conserva. La revisión ofrece **Sustituir suministro histórico por composición BASE (cambio de receta separado)**, **desmarcado**. Sólo la aceptación expresa sustituye ese suministro. No se ofrece sustitución automática si se cambió su receta o agregado particular; las tarifas no reemplazan composiciones.
7. Emitir R1 antes de un cambio y R2 después de aceptar. Redescargar R1: mismo PDF, sin costos internos ni composición. El cambio de precios no altera la demanda física.
8. Comparar con **OBRADOR Y MOVILIDAD** (`B13`, directo) y **MENORES A 2m2** (`B170`, falta cotización de cal `PRECIOS!E12:F12`). Conservan su naturaleza y el faltante específico; no reciben materiales o ceros inventados.

Las referencias sin fecha muestran **Fecha no informada**. Conservan importes conocidos sin presentarlos como una cotización actual ni compararlos por una fecha técnica. Los factores numéricos explícitos de receta se documentan como factores económicos, no IVA ni rendimiento.

El original y el manifiesto usados en el complemento están fuera de Git. Comandos ejecutados con app manual detenida:

```bash
bash CEO_Catalogo_Local.sh inspect "$HOME/.local/state/ceo-construcciones-codex/sources/base.xlsx" "$HOME/.local/state/ceo-construcciones-codex/base-link-inventory.json"
bash CEO_Catalogo_Local.sh apply "$HOME/.local/state/ceo-construcciones-codex/base-link-inventory.json" "$HOME/.local/state/ceo-construcciones-codex/sources/base.xlsx" 5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e
```

La inspección es sin escritura; la aplicación se confirmó por comando explícito. Su reejecución conserva precios posteriores y ediciones; no requiere repetirla para arrancar. `node apps/web/scripts/base-links-manual-smoke.mjs` verifica los vínculos reales, crea una sola copia MAN si falta, revisa cinco anchos y descarta edición; no registra precios de prueba en el catálogo manual. Evidencia sensible en `base-link-manual/` privado. La prueba de propagación con precio nuevo se ejecuta en otra base aislada con `apps/api/scripts/verify-base-material-links.ts`; informe privado `base-link-real-verification.json`.

## Recorrido de aceptación manual

| Caso | Acción | Resultado esperado |
|---|---|---|
| 1. Cliente y obras | Gerencia: abrir MAN-CLI y las dos obras; crear otra obra con cliente | Relación persistida; el Jefe no puede abrir la obra ajena |
| 2. BASE y costo unitario | Nuevo presupuesto desde BASE; cantidades vacías y cero | Costo por unidad conocido visible; vacío pendiente, cero sin subtotal ni demanda; faltantes explícitos |
| 3. Cantidades y VARIOS | Sintético: cantidad 2; agregar actividad en VARIOS | Subtotal/totales actualizan sin perder foco; no se deducen insumos de directos |
| 4. Salida del editor | Modificar; breadcrumb, menú, Atrás/Adelante y logout; probar las tres decisiones | Cancelar conserva escrito/destino; guardar sale una vez; descartar no persiste; recarga/cierre usa aviso nativo |
| 5. Moneda/IVA | Cancelar cambio; luego confirmar y restaurar revisión | Cancelar deja todo igual; confirmar exige revisión sin convertir importes; restaurar recupera borrador anterior |
| 6. Composición y corralones | Agregar/reemplazar/quitar material; consumo/precio; comparar proveedores, Tab/Escape | Una capa modal; equivalencia explícita; sin duplicados; precio manual retira procedencia; maestro intacto |
| 7. Rentabilidad | Cambiar recargo final y comparar materiales | Cambia precio comercial; mismas cantidades de materiales y costo |
| 8. R1/R2/PDF | Emitir, modificar borrador y emitir de nuevo; abrir R1, historial y PDF | Dos revisiones, una referencia; R1 inmutable; PDF comercial sin costos, recargo ni composición interna |
| 9. Excel de precios | Archivo sintético, mapear, revisar inconsistencias, confirmar e intentar repetir | Vista previa no importa; confirmación persiste; idempotencia impide duplicación |
| 10. Abastecimiento | Nueva necesidad 100; pedido 40; OC 40; recepción parcial 20; consumo 5; transferencia aparte | Sin doble conteo; transferencia cambia ubicación, no consumo; OC sin aprobación obligatoria |
| 11. Administración | Acceder con su perfil; recibir OC general delegada; revisar importe/estado de factura | Alcance limitado; sin presupuestos, catálogo económico general ni obras ajenas |
| 12. Indicadores | Gerencia: cliente/obra/proveedor, emitir nueva revisión y exportar | No suma R1+R2 como dos presupuestos; filtros y exportación consistentes |

Revisar también móvil 360/390 y escritorio 1280/1440, teclado, estados de guardado, condiciones largas y PDF de varias páginas. Registrar caso, perfil, nombre del documento, acción, resultado observado y esperado. No adjuntar credenciales ni originales privados.

## Separación de resultados

Un error de edición, cálculo, permiso o integridad es un defecto de aplicación. Una partida histórica sin rendimiento/unidad verificada es una limitación específica de datos, detallada en [conciliación DG](DG-1153-RECONCILIACION.md); reconocer un aviso no vuelve exacta la demanda. La habilitación productiva, sus migraciones/datos y la aceptación operativa por CEO son posteriores y requieren su proceso autorizado.

La evidencia de esta pasada se registra en [aceptación](ACEPTACION-CIERRE-ETAPA-1.md) y [estado](ESTADO-CIERRE-ETAPA-1.md). Consultar allí el candidato validado y la integración; `release.json` acredita el binario local usado.
