# CEO Construcciones — Plan maestro de implementación para Codex

**Fecha:** 02/11/2026  
**Destino:** `Broco-Solutions/ceo-construcciones`  
**Base revisada:** `main` → `a9a075dc159c8c59d075aa5894534e3dbaae961e`  
**Resultado de esta misión:** cerrar la brecha funcional y de UX/UI, con pruebas y código integrado en `main`.  
**Fuera de esta misión:** configurar infraestructura, respaldos, restauraciones, dominios, servicios cloud o ejecutar cambios sobre datos productivos.  
**Estado de este archivo:** instrucciones de ejecución; no acredita que la implementación o sus pruebas ya se hayan realizado.

---

## 0. Mandato y condiciones de éxito

Implementá esta misión de punta a punta. No te limites a devolver otro plan, una maqueta, una lista de recomendaciones o cambios solo de frontend. El objetivo es una aplicación funcional, coherente con el diseño existente, que resuelva el circuito completo de la Etapa 1 y quede integrada en `main` después de superar sus controles.

La base existente se conserva. Se extienden dominio, API, pantallas, contratos, migraciones y pruebas. No reescribir autenticación, catálogos, cálculos decimales, recepciones ni inventario para agregar capacidades que pueden apoyarse en ellos.

### 0.1 Autoridad funcional para esta misión

1. Las decisiones más recientes del usuario gobiernan esta implementación: eliminar el término APU de la experiencia; incluir clientes, relación cliente–obras, cierre comercial, referencias informativas de factura/pago, importación Excel e indicadores; infraestructura diferida.
2. El documento funcional final es la referencia de producto. La auditoría describe diferencias observadas, no redefine necesidades.
3. Este plan convierte esas decisiones en tareas, criterios de aceptación y propuestas técnicas de implementación. Los defaults explícitos de este plan son decisiones de diseño para resolver el comportamiento, no afirmaciones sobre el Excel o la operación histórica de CEO.
4. El PRD y `AGENTS.md` de V1 contienen reglas antiguas: no reabrir asuntos ya decididos ni excluir funcionalidades autorizadas por apoyarse en esas versiones. Actualizar sus apartados superados, preservando límites de seguridad, integridad y privacidad.
5. No editar ni presentar como firmado un contrato. El usuario ya decidió incluir las ampliaciones en el desarrollo; no volver a bloquear esta misión por esa diferencia documental.

### 0.2 Autorización y límites de actuación

- Codex queda encargado del trabajo **full stack** de esta misión, incluidos `apps/api`, `apps/web`, Prisma, OpenAPI, pruebas y documentación.
- Está autorizado preparar ramas, commits, PR y la integración final a `main` con checks verdes. No usar force-push, no eludir revisiones requeridas o protecciones y no sobrescribir cambios de terceros.
- Se pueden crear y probar migraciones de aplicación en bases locales/efímeras. Eso es trabajo de desarrollo, no configuración de infraestructura.
- No ejecutar migraciones sobre producción, importar datos reales a producción, usar credenciales productivas para tests ni modificar Railway/Vercel/Cloudflare, secretos, planes, servicios, backups o políticas de despliegue.
- Puede ajustarse **CI de pruebas del repositorio** para verificar el producto y `main`; no agregar pasos de deployment ni cambiar plataformas.
- El merge puede disparar despliegues automáticos preexistentes. No asumir que «merge» es una operación sin impacto operativo. Aplicar el protocolo de compatibilidad de la sección 12.

### 0.3 Definición de terminado

La misión está terminada cuando se cumplen conjuntamente:

- Los requisitos de producto de la matriz están implementados en datos, servidor, interfaz y permisos.
- El usuario puede completar el recorrido cliente → obra → presupuesto → PDF → pedido → compra → recepción → stock → indicadores sin herramientas externas ni pasos técnicos artificiales.
- Se preservan datos e historias anteriores; no se pierden snapshots, órdenes, movimientos o permisos existentes.
- Hay pruebas unitarias, de integración real con PostgreSQL, contratos, E2E y revisión visual.
- El commit finalmente integrado en `main` es el que tiene evidencia válida. Un resultado de una rama antigua no es evidencia final.
- El reporte de cierre distingue código integrado, funciones verificadas y activación productiva diferida. No se afirma «en producción» por haber mergeado.
- No quedan requisitos funcionales aprobados sustituidos por TODO, mocks, pantallas vacías o textos «a definir». Los datos operativos de instalación y la infraestructura diferida se identifican aparte, sin convertirlos en nuevas decisiones de negocio.

---

## 1. Fuentes, lectura inicial y punto de partida

### 1.1 Fuentes de producto

- Documento funcional: https://docs.google.com/document/d/1HiAvffV5hO2iDBPbzCpnfI6B7R491SbCbQqcetoQ6nk/edit
- Auditoría entregada: `CEO_Construcciones_Auditoria_Gap_2026-11-02.md`.
- Carpeta de presupuestos: https://drive.google.com/drive/folders/1ApcnIxal6-RjIDc6VkfuxsvqSYhaxRTB
- Fuentes de aceptación: `Presupuesto BASE - OCTUBRE 26.xlsx`, `Presupuesto VIVIENDA DG 1153.xls`, PDF de DG 1153 REV C y notas del 26/10/2026.
- Importe comercial de referencia documentado de DG 1153 REV C: **$861.187.557,13 + IVA**. Es un dato del caso histórico, no un número a hardcodear ni una prueba suficiente por sí solo.

Los archivos reales deben obtenerse mediante los accesos autorizados o adjuntos del entorno. No asumir que una ruta `sandbox:` de ChatGPT existe en el equipo de Codex. No subir originales sensibles ni datos de clientes al repositorio por comodidad: conservarlos en un directorio privado ignorado y versionar solo fixtures mínimos autorizados o sanitizados.

Si falta una fuente real, avanzar con la implementación y pruebas sintéticas. Identificar explícitamente la prueba histórica no ejecutada; no fabricar un Excel ni ajustar cifras artificialmente para simular coincidencia.

### 1.2 Lectura de código obligatoria

Leer antes de modificar:

```text
AGENTS.md
README.md
docs/PRD-ETAPA-1.md
docs/ESTADO-PROYECTO.md
docs/MODELO-DATOS.md
docs/INTEGRACION-CLAUDE-CODE.md
docs/ANALISIS-EXCEL-PRESUPUESTOS.md
apps/api/prisma/schema.prisma
apps/api/src/core/auth.ts
apps/api/src/modules/{budgets,catalog,procurement,inventory,reports,exports,imports}.ts
apps/web/lib/permissions.ts
apps/web/components/presupuesto/*
apps/web/app/(app)/presupuestos/*
apps/web/app/(app)/pedidos/nuevo/page.tsx
apps/web/app/(app)/admin/importaciones/page.tsx
apps/web/components/catalogo/*
.github/workflows/api.yml
.github/workflows/web.yml
```

Inspeccionar también instrucciones anidadas, tests y componentes de shell/UI existentes. Si los paths cambiaron, resolver sus equivalentes reales; no crear módulos paralelos porque un archivo fue movido.

### 1.3 Hechos verificados del punto de partida

La auditoría encontró motor de costos por actividad, materiales previstos, snapshots, proveedores, pedidos, cotizaciones, órdenes, recepciones e inventario. Faltan o están incompletos clientes, cierre comercial, PDF de presupuesto, revisiones ligadas a emisión, Excel con mapeo, necesidades netas, Administración restringida e indicadores por cliente.

En el commit base hay evidencia histórica de 47 pruebas unitarias web y 49 E2E aprobados. No tratarlos como resultados actuales ni como un mínimo de cantidad a inflar: ejecutar la suite real y añadir cobertura del comportamiento nuevo.

`AGENTS.md` todavía reparte API a Codex y frontend a Claude, y excluye coeficientes comerciales. Esta misión autoriza a Codex a completar ambas capas y actualiza esas restricciones funcionales, sin borrar las reglas de seguridad.

### 1.4 Archivos de continuidad que debe mantener Codex

Crear o actualizar dentro de `docs/`:

| Archivo | Contenido |
|---|---|
| `PLAN-CIERRE-ETAPA-1.md` | Este plan y ajustes técnicos justificados. |
| `REQUISITOS-ETAPA-1-CIERRE.md` | Matriz requisito → código → pruebas → evidencia. |
| `DECISIONES-CIERRE.md` | Defaults adoptados y decisiones técnicas; separar confirmaciones del usuario. |
| `ESTADO-CIERRE-ETAPA-1.md` | Estado por fase, rama, último SHA, tests, problemas reales y próximo paso. |
| `ACEPTACION-CIERRE-ETAPA-1.md` | Resultados de criterios de aceptación, no una lista marcada sin ejecutar. |
| `UX-ETAPA-1.md` | Glosario, navegación, patrones y evidencias visuales. |

No duplicar documentación por cada intento. Actualizar el estado después de cada hito para que la misión pueda retomarse sin reinterpretar el alcance.

---

## 2. Replanteo de APU: cambiar la experiencia, conservar el dominio útil

### 2.1 Terminología adoptada en este plan

La interfaz no debe exigir que el usuario entienda «APU». El concepto funcional se presenta así:

| Término anterior/interno | Texto visible |
|---|---|
| APU / ítem APU | **Actividad de obra** |
| Catálogo APU | **Actividades de obra** — dentro de Catálogos |
| Análisis del APU | **Composición del costo** |
| Precio/costo unitario del APU | **Costo por unidad** |
| Coeficiente de material | **Consumo por unidad** |
| BOM | **Materiales previstos** |
| Snapshot | **Revisión guardada** |
| Override | **Ajuste para este presupuesto** |
| Markup | **Rentabilidad (%)**, con ayuda «recargo sobre el costo» |
| Idempotencia, rounding boundary, hashes | No visibles en el flujo habitual. |

Ejemplo de actividad: «Mampostería de ladrillo hueco», unidad m². La actividad tiene un costo por unidad formado por materiales, mano de obra y otros costos directos cuando correspondan. En el presupuesto se selecciona/reutiliza la actividad, se ingresa su cantidad y se obtiene el subtotal.

**No llamar «Materiales» a las actividades.** Una actividad es un trabajo; sus materiales son los insumos necesarios para realizarlo. Tampoco convertir el catálogo en un motor técnico que el usuario deba reconstruir en cada obra.

### 2.2 Comportamiento esperado

- El usuario habitual inicia en **Presupuestos** o dentro de una obra, no en un paso obligatorio «Crear APU».
- Las actividades y sus composiciones se mantienen en un catálogo auxiliar reutilizable.
- En el presupuesto se puede consultar la composición de una actividad de forma contextual, sin salir ni perder cambios.
- Modificar una composición o costo solo para el presupuesto no altera la actividad maestra. Cambiar el catálogo requiere una acción explícita y permiso.
- Los nombres técnicos `ApuItem`, `apu-items` y relaciones internas pueden conservarse por compatibilidad. No hacer una migración masiva de nombres SQL ni romper API solo para cambiar textos.
- La navegación visible puede usar `/actividades`. Mantener enlaces antiguos mediante alias o redirecciones seguras si se modifica la ruta. Nunca eliminar datos o rutas de uso externo sin compatibilidad.
- Revisar menús, títulos, formularios, ayudas, vacíos, errores, breadcrumbs, exportaciones, etiquetas accesibles y guía de uso. Cambiar únicamente el título del menú no completa el requisito.

---

## 3. Alcance y límites: completar lo aprobado, sin hacer otro sistema

### Incluido

Clientes y obras vinculadas; proveedores; actividades y plantillas; costos por unidad; carga de cantidades; VARIOS; cierre comercial; revisiones y PDF; precios históricos y comparación de hasta tres corralones; importación de listas; pedidos manuales/asistidos; cotizaciones/OC; recepciones; factura y pago informativos; Administración restringida; stock y movimientos; tres reportes e indicadores por cliente; adaptadores de migración puntual; pruebas y documentación.

### Excluido

- Backups, retención, restauración, observabilidad cloud, uptime, redes, dominios, secretos, nuevos servicios y configuración de despliegue.
- Contabilidad, cuentas corrientes, ejecución de pagos, facturación fiscal, conciliación, múltiples cuotas de pago o liquidación de salarios.
- Certificados de avance, CAC, RR. HH., asistencia, flota, contratos de subcontratistas, CRM comercial y portales nuevos.
- Lectura automática de planos, macros Excel, motor general de fórmulas entre celdas, interpretación con IA o OCR.
- Sincronización permanente con CEO Obras, listas de proveedores o UOCRA; WhatsApp y correos automáticos.
- Inventario valorizado contablemente, lotes, números de serie, logística avanzada o reservas obligatorias para toda operación.
- Reescritura de arquitectura, cambio de ORM/framework, incorporación de Redis, colas, buckets o SaaS.

**Diferimiento explícito:** R29 de la auditoría (backups) no pertenece al cierre de esta misión. No configurar nada ni eliminar una obligación contractual para simular que está resuelta. Registrar «fuera de la misión, por instrucción del usuario» una sola vez.

---

## 4. Diseño UX/UI y consistencia visual

### 4.1 Trabajo previo de diseño, verificable

Antes de rehacer pantallas, ejecutar la V1 local contra datos sintéticos y capturar las vistas de inicio, obras, proveedores, presupuesto, pedidos, OC, stock y móvil. Inventariar tokens, tipografía, espaciado, tarjetas, tablas, diálogos, botones, colores semánticos, iconos y mensajes.

Conservar ese lenguaje visual. Reutilizar shell, controles, notificaciones y formatos. No imponer otra identidad, importar otra biblioteca UI completa ni resolver cada pantalla con estilos inline distintos. Centralizar los cambios compartidos necesarios y comprobar su impacto en pantallas existentes.

### 4.2 Navegación propuesta

Respetar agrupaciones existentes, con una sola entrada canónica por módulo:

- **Inicio / Indicadores** según perfil.
- **Clientes**, **Obras**, **Presupuestos**.
- **Compras**: pedidos, cotizaciones, órdenes y recepciones.
- **Stock**: disponibilidad, movimientos y mínimos.
- **Catálogos**: actividades de obra, materiales, proveedores/precios, rubros/unidades.
- **Administración** únicamente para las funciones autorizadas.

Evitar dos secciones diferentes para el mismo proveedor. El acceso a su ficha puede existir desde múltiples pantallas, pero con un único recurso y formulario.

### 4.3 Espacio principal de presupuesto

Crear una experiencia de trabajo integrada, reutilizando los componentes actuales cuando sirvan:

**Encabezado:** cliente, obra, nombre, estado editorial, revisión vigente y estado de guardado.

**Navegación local:** `Cómputo y costos` → `Precio de venta` → `Presentación y PDF`. `Materiales previstos` e `Historial` son vistas accesibles del mismo presupuesto, no pasos que obliguen a rehacerlo.

**Grilla por rubros:** actividad/concepto, unidad, cantidad, costo por unidad, subtotal. Rubros plegables con total; búsqueda; agregar actividad; agregar concepto directo; excluir partida; orden estable. CANTIDAD debe ser el control más accesible por teclado.

**Resumen persistente:** costo total, ajustes/composición de VARIOS cuando estén presentes, recargo comercial y precio final. No encimar el resumen sobre las últimas filas ni sobre el teclado móvil.

**Edición contextual:** composición del costo, referencia de precio, comparador de proveedores y ajustes puntuales. Usar el patrón de diálogo/edición existente, sin cadenas de modales anidados.

**Acciones inequívocas:** Guardar borrador, Previsualizar, Emitir y descargar, Descargar revisión vigente. Guardar no equivale a emitir; previsualizar no crea revisión.

### 4.4 Reglas de interacción

- Recalcular con debounce corto, no bloquear el tipeo ni mover el foco. La API devuelve el resultado decimal autoritativo; no duplicar reglas monetarias independientes en JavaScript.
- Descartar respuestas de cálculo desactualizadas. Conservar la última edición si una respuesta anterior llega tarde.
- Si un dato está incompleto, señalarlo junto al campo; no cambiarlo silenciosamente por cero.
- Estado de guardado honesto: «Cambios sin guardar», «Guardando», «Guardado», «No se pudo guardar». Nunca éxito sin confirmación del servidor.
- Proteger cambios sin guardar al salir, excepto si ya se persistieron correctamente.
- Navegación por teclado, foco visible, Escape en diálogos, restauración de foco, etiquetas accesibles y errores legibles.
- No usar `alert()`/`confirm()` nativos para flujos principales ni confirmaciones repetidas para acciones inocuas.
- En teléfono priorizar pedidos, recepción y consumo; presupuesto debe ser utilizable sin forzar una tabla de escritorio sobre toda la página.
- Estados vacíos con siguiente acción; errores con recuperación; no IDs técnicos como nombres; códigos siguen siendo referencias secundarias.
- Formatos consistentes de fecha, moneda, separadores y unidades; fechas de negocio en Argentina. Los datos y cálculos del servidor no deben depender de la zona horaria del runner.

### 4.5 Umbral visual de aceptación

Revisar 360/390 px, 768 px y escritorio 1280/1440 px; no desbordes de página, textos cortados o controles superpuestos. Las tablas amplias pueden tener desplazamiento interno deliberado, sin desplazar toda la app. Comprobar listas vacías, nombres largos, errores, cientos de ítems y datos parciales. No aceptar screenshots actualizados en bloque sin inspección visual real.

---

## 5. Reglas funcionales cerradas para implementar

### 5.1 Clientes, proveedores y obras

**Clientes:** nombre/razón social requerido; CUIT opcional; contacto, teléfono/email, dirección y observaciones. Alta, búsqueda, edición e inactivación. Detectar CUIT duplicado cuando se haya informado; no exigir un CUIT inventado a un particular. Sin eliminación física de clientes relacionados.

Un cliente puede existir antes de tener obras y luego tener varias. Cada **obra nueva** debe vincularse a un cliente principal. Para las obras históricas, agregar relación nullable de transición y mostrar «Cliente sin vincular» hasta completar un mapeo real. No asignar un cliente genérico ficticio ni borrar obras para satisfacer una restricción.

**Obras:** conservar estado, responsables, asignaciones y ubicación propia. Agregar cliente, dirección/datos de obra necesarios para la salida comercial. La ficha de cliente lista sus obras y presupuestos; la ficha de obra conserva pedidos, compras y stock. Inactivar un cliente no cancela obras ni operaciones existentes.

**Proveedores:** reutilizar ABM, historial, CUIT, datos de contacto e inactivación. No duplicar el módulo. Un proveedor inactivo conserva documentos históricos, pero no se propone por defecto para compras nuevas.

### 5.2 Permisos y Administración restringida

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

### 5.3 Actividades, plantillas, cantidades y costos

- Reutilizar composiciones: materiales y consumo por unidad, mano de obra por unidad y, cuando aplique, otros costos directos. No representar seguros o tercerizados como material ficticio o salario si no lo son.
- La mano de obra se mantiene manualmente con las referencias aportadas por CEO/UOCRA; no crear nómina ni sincronización externa.
- Permitir crear presupuesto desde plantilla BASE, desde otro presupuesto/revisión o en blanco. Copiar estructura y composiciones, no relaciones vivas que modifiquen otra obra.
- Mantener orden de rubros/actividades, unidad y descripciones. Los 16 rubros del ejemplo no son un límite del sistema.
- Dejar editar cantidades con operaciones aritméticas simples opcionales. Usar parser acotado, sin `eval`, referencias a celdas, variables externas o código ejecutable. Guardar cantidad resultante y, si se conserva la expresión, tratarla como ayuda trazable.
- Un renglón incompleto puede permanecer en borrador; no emitir importes engañosos. Distinguir precio faltante, cero informado, partida excluida y concepto incluido sin importe independiente. Los incluidos/excluidos no deben duplicar costos ni materiales de otra partida.
- `cantidad × costo por unidad = subtotal`. Sumar rubros con el motor decimal existente. Los costos y consumos incluidos en una revisión deben congelarse.
- Los cambios al catálogo no alteran revisiones emitidas. Para un borrador existente, «Actualizar precios» muestra diferencias y requiere aceptación; no reemplazar ajustes particulares silenciosamente.
- La actualización de la composición maestra y el ajuste para una obra son acciones separadas y auditables.

### 5.4 VARIOS y rentabilidad comercial

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

### 5.5 Borrador, revisiones y presupuesto de referencia

Separar tres conceptos:

1. **Borrador editable**: guardar cambios no crea una revisión cada vez.
2. **Revisión emitida**: captura inmutable de contenido, cantidades, costos, precio comercial, datos del cliente/obra, condiciones, reglas de cálculo y versión de plantilla PDF.
3. **Referencia de abastecimiento de la obra**: una revisión elegida para materiales previstos, no una aprobación comercial ni la suma de presupuestos alternativos.

Primera emisión crea R1. Editar después de emitir abre/continúa un borrador basado en esa revisión y conserva la anterior. Emitir el cambio crea R2. Previsualizar o volver a descargar R1/R2 sin cambios no crea otra.

Usar idempotencia existente y huella de contenido normalizado. Excluir de esa huella timestamps de descarga o metadatos volátiles; incluir cambios de contenido comercial y condiciones. Concurrencia y doble clic no pueden crear dos revisiones por una intención.

Mantener la selección explícita de referencia para abastecimiento, accesible a quienes editan presupuestos, sin pedir autorización de Gerencia adicional. Como default de UX: primera emisión de la obra puede establecer la referencia si no existe; una nueva revisión del mismo presupuesto de referencia la actualiza con aviso; emitir un presupuesto distinto no reemplaza automáticamente el seleccionado. Cambiar referencia no modifica pedidos, OC, recepciones o consumos ya registrados.

En indicadores comerciales se utiliza **una revisión vigente por presupuesto**, excluyendo borradores e históricos. Esto no convierte todas las propuestas en ventas confirmadas; etiquetar los montos como «Presupuestado».

**Compatibilidad de versiones V1:** los snapshots anteriores son versiones de costos, no evidencia de una emisión comercial. Mantener su consulta, comparación y materiales de referencia; ofrecer copiar a un borrador nuevo. No fabricar una fecha de emisión, recargo o precio de venta histórico ni tratar `totalCost` como venta. Señalar «Versión de costos anterior» cuando corresponda. En indicadores, la falta de importe comercial es un dato no disponible, no un cero; las referencias de abastecimiento V1 siguen siendo válidas para cantidades.

### 5.6 PDF comercial

Implementar PDF de presupuesto, no confundirlo con el PDF de OC existente.

Contenido: identidad de CEO, cliente/comitente, obra/dirección, fecha de emisión, número/revisión, rubros y partidas ordenadas, unidad, cantidad, precio comercial unitario/importe, subtotales, total, moneda/IVA, condiciones, exclusiones, observaciones y plazo informado. Campos editables en la aplicación; no se pide un editor arbitrario de archivos PDF.

Excluir costos internos, composición de materiales, coeficientes, recargo interno y anotaciones privadas tanto del texto como de metadatos innecesarios. La vista previa comercial debe ser la misma representación que se descarga.

Generar desde la revisión congelada, no desde el catálogo actual. Repetir la descarga reproduce contenido e importes aunque hayan cambiado el cliente, los precios o la obra. Usar activos autorizados existentes y no inventar un logo oficial. Sin bucket nuevo: reutilizar dependencias/capacidades locales y una estrategia determinista basada en snapshot.

Probar varias páginas, nombres extensos, caracteres españoles, m²/m³, importes grandes, saltos de rubro, encabezados repetidos y numeración. Una última hoja solo con pie o un total cortado es un defecto.

### 5.7 Precios, comparación de corralones e importación

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

### 5.8 Necesidades netas: evitar comprar o pedir dos veces

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

### 5.9 Compras, OC y recepción

Conservar el circuito existente. Estados de OC: Borrador → Emitida → Recepción parcial → Recibida, y Cancelada donde corresponda. Compras puede emitir; registrar actor/fecha. No introducir cadenas de aprobación ni topes monetarios.

Preservar controles actuales: editar renglones en borrador; no anular una OC con recepciones ni borrar sus movimientos. Para una OC emitida sin recepciones, corregir mediante cancelación y nueva OC, enlazadas en el historial si se incorpora esa referencia. No crear un motor de revisiones de OC como el de presupuestos. Si ya hay recepciones, las correcciones no pueden manipular cantidades históricas ni eliminar stock.

**Importes de OC:** conservar cantidades, precios y equivalencias originales; aplicar al presentar nuevas operaciones el mismo default decimal explícito (2 decimales, HALF_UP por importe extendido y total como suma de líneas). No dejar el total vacío con `ROUNDING_POLICY_REQUIRED` como experiencia habitual. Los valores exactos de origen y las reglas históricas se conservan; documentar la frontera de redondeo y probar fracciones como 1/3. No sumar IVA ni conversiones de moneda sin información explícita.

Permitir compras generales para galpón/patio sin obra, como en V1. No imputar después su importe completo a cada obra que reciba materiales; tampoco inventar una valorización de transferencias.

No imponer una única OC por pedido si el sistema permite parcializar; sí mostrar compras relacionadas, cantidades pendientes y advertir duplicaciones. Cotizaciones y decisiones de proveedor siguen siendo manuales.

Recepciones: líneas, cantidad real, remito, ubicación, usuario y fecha. Proteger excedentes, repeticiones, destinos ajenos, ubicaciones inactivas y concurrencia. Cada confirmación actualiza pendiente y stock de forma atómica. Jefe recibe en sus obras; Compras, en galpón/patio por defecto; Gerencia puede delegar por ubicación con los permisos limitados definidos.

### 5.10 Factura y pago informativo

Extender la referencia existente de OC con importe/moneda y estado informativo `Pendiente` / `Pagado`, más usuario/fecha del cambio. Conservar número de factura y sus datos de carga. No confundir «fecha de carga» con «fecha real de pago»; solo guardar esta última si se informa expresamente.

Gerencia/Compras mantienen número e importe; Administración restringida consulta y marca el estado informativo. Una reversión de Pagado a Pendiente conserva el evento anterior y su auditoría. No ejecutar transferencias, generar comprobantes fiscales, calcular saldos contables ni administrar cuotas. Mantener una referencia simple por OC, sin añadir un módulo de facturas múltiples.

### 5.11 Stock e indicadores

Conservar transferencias, consumos, devoluciones, ajustes y mínimos. No convertir reservas existentes en un paso obligatorio de todo pedido. Ninguna acción de presupuesto, emisión de PDF o cambio de cliente mueve stock.

**Tres reportes:**

1. Presupuesto frente a compras/recepciones/consumos por obra, rubro y material. La comparación operativa principal es de cantidades; separar importes de compras cuando se muestran. No restar compras de materiales al precio de venta completo y llamar a eso beneficio.
2. Stock por ubicación/material: físico, reservado cuando exista, disponible, mínimo y alerta. No valoración contable.
3. Compras por obra/proveedor: cantidades, importes registrados, estado y fechas, conservando compras generales sin obra como categoría propia.

**Indicadores por cliente:** obras activas/finalizadas, importe presupuestado vigente y compras asociadas a sus obras, con acceso al detalle. Usar una sola revisión emitida vigente por presupuesto, no todas las revisiones ni borradores. Separar agrupaciones ARS/USD y bases impositivas incompatibles; no convertir monedas ni sumar importes de moneda desconocida como cero.

Filtros mínimos consistentes: cliente, obra, proveedor donde corresponda, período y estado. Fechas inclusivas de negocio con conversión explícita a UTC. Las consultas filtran/totalizan en servidor antes de paginar; las tarjetas no suman solo la página visible. Totales de pantalla y Excel deben reconciliar con el mismo criterio.

Para clientes con varias obras, agregar sin duplicar por joins de líneas. No repetir el importe total de una OC una vez por cada renglón. No imputar todas las compras generales al cliente que recibe después una transferencia.

### 5.12 Migración puntual de CEO Obras: desarrollar, no ejecutar en producción

Preparar adaptadores/scripts para los archivos disponibles, con modo diagnóstico y dry-run. Reutilizar los importadores existentes. Identificar entidades recuperables y útiles: clientes si existen, proveedores, obras activas, sus vínculos, materiales/unidades y OC abiertas.

Cuidar especialmente OC parcialmente recibidas de origen: trasladar el compromiso pendiente sin volver a ingresar las unidades ya recibidas. No duplicar stock inicial, recepciones históricas y pendientes. Conservar código externo, procedencia, asociaciones y reporte de conciliación.

Deduplificación idempotente; entrada inmutable; resumen de creados/vinculados/rechazados; errores con fila/origen; sin coincidencias dudosas automáticas. Probar todo en base aislada con fixtures. No hacer migración histórica integral ni extracción invasiva del sistema de origen. La ejecución productiva y el corte son tareas operativas posteriores.

---

## 6. Arquitectura de implementación: cambios mínimos con garantías

### 6.1 Reutilizar y extender

- Prisma/PostgreSQL permanece en API; web consume contratos, no accede a BD.
- Conservar cálculo decimal y fronteras históricas; extender costo directo y cálculo comercial en funciones de dominio testeables.
- Reutilizar auditoría, transacciones, idempotencia, numeración y almacenamiento de versiones.
- Separar DTO interno de DTO comercial/operativo: el rol limitado nunca recibe un objeto completo al que la UI solo oculta columnas.
- Actualizar OpenAPI desde su generador y regenerar tipos del frontend; no editar solo el archivo generado ni usar `any` para evitar incompatibilidades.
- Tests de autorización en servidor para todos los recursos nuevos y recursos existentes afectados por el quinto rol.

### 6.2 Nuevos datos conceptuales, no nombres de tabla obligatorios

| Necesidad | Extensión esperada |
|---|---|
| Cliente y obras | Cliente + relación de obra, índice/filtros y códigos consistentes con el repositorio. |
| Costos directos | Componente/campo explícito para costo no material y no salarial. |
| Plantillas | Estructura reutilizable ordenada de rubros/actividades; sin dependencia viva de la obra original. |
| Borrador | Estado editable persistido con control de concurrencia. |
| Emisión | Revisión inmutable con datos comerciales, contenido de presentación y huella. |
| Referencia | Vínculo explícito de referencia de abastecimiento independiente de la vigencia comercial. |
| Administración | Nuevo rol y DTO de OC/factura limitado. |
| Recepción delegada | Relación usuario–ubicación para esa operación, no rol genérico privilegiado. |
| Cobertura | Asociaciones cuantitativas mínimas de pedidos/OC/recepciones/reservas para evitar doble conteo. |
| Listas de precios | Datos normalizados, origen, validación y confirmación idempotente del lote. |

Seleccionar el diseño físico mínimo después de leer el esquema. No crear una tabla por cada concepto si se resuelve coherentemente con las existentes. Tampoco meter todos los datos nuevos en JSON opaco sin validación o sin capacidad de consultar las relaciones requeridas.

### 6.3 Integridad y compatibilidad

- Migraciones aditivas, versionadas y revisadas. No editar migraciones ya aplicadas ni regenerar la BD desde cero para que pase un test.
- Cliente nullable para datos antiguos, requerido por validación en altas nuevas; completar vínculo con datos reales posteriormente.
- Preservar snapshots y auditorías. Si se necesita un formato nuevo, versionarlo y mantener lector del formato anterior.
- Conflictos de edición de borrador: versión optimista/`updatedAt` o mecanismo equivalente; devolver conflicto útil, no perder cambios.
- Cálculo/previsualización sin efectos persistentes. Emisión/importación/recepción con confirmación e idempotencia.
- Ninguna migración asume que todas las obras, materiales o unidades están limpios. Reportar incompatibilidades sin inventar equivalencias.
- Semillas de prueba sintéticas y aisladas; no crear cuentas con contraseñas fijas productivas ni introducir personas reales como fixture público.

---

## 7. Secuencia de ejecución por entregables verticales

Cada fase entrega funcionalidad completa de las capas afectadas. Antes de avanzar: typecheck, pruebas focalizadas y actualización de estado. La integración a `main` se hace por incrementos seguros o, si hay dependencias de esquema inseparables, mediante una rama de integración con revisión final. No dejar frontend simulando endpoints que no existen.

| Fase | Resultado | Requisitos de auditoría | Depende de |
|---|---|---|---|
| F0 | Baseline, reglas actuales y plan de compatibilidad | R01, R28 | — |
| F1 | Terminología y actividades reutilizables | R07, R08, R09, R26 | F0 |
| F2 | Clientes, obras, permisos y receptor delegado | R02–R06, R21, R22 parcial | F0 |
| F3 | Costeo, VARIOS, borrador y cierre comercial | R08–R12, R26 | F1, F2 |
| F4 | Emisión, PDF y revisiones | R12, R13 | F3 |
| F5 | Precios, corralones y Excel | R14–R16 | F1, F2; integrarse con F3 |
| F6 | Necesidades netas, compras y Administración | R17–R23 | F2, F3, F5 |
| F7 | Indicadores y reportes conciliados | R24, R25 | F2, F4, F6 |
| F8 | Migración aislada y aceptación integral | R27, R28, R30 | F1–F7 |
| F9 | Revisión final, CI y merge verificado | Todos excepto R29 | F8 |

### F0 — Reconocer baseline y actualizar instrucciones

1. Confirmar repositorio/remoto, rama, SHA y árbol de trabajo. No descartar trabajo local ajeno. Obtener cambios de `main` y comparar con la auditoría.
2. Leer fuentes e instrucciones; capturar baseline visual y técnico. Identificar scripts de prueba reales y autorización de los endpoints afectados.
3. Ejecutar suite base en BD aislada. Registrar fallas preexistentes con evidencia; no usarlas como permiso para omitir regresión.
4. Actualizar `AGENTS.md`/PRD con alcance full stack, fuentes actuales, terminología y exclusión de infraestructura. Conservar reglas de secretos, integridad y review.
5. Inspeccionar en lectura el vínculo entre `main` y autodeploy, sin cambiarlo. Definir estrategia de compatibilidad antes de agregar campos que rompan consultas viejas.

**Aceptación:** matriz trazable inicial, captura de SHA y baseline, límite de infraestructura explícito, ninguna modificación productiva.

### F1 — Actividades de obra y sistema visual

1. Inventariar tokens/componentes y documentar patrones a reutilizar.
2. Sustituir APU en toda la experiencia visible, mantener compatibilidad interna/rutas.
3. Preparar catálogo de actividades con composición clara y edición autorizada.
4. Incorporar plantillas mínimas y duplicación de estructura; evitar el arranque obligatorio en un catálogo vacío.
5. Definir y construir los componentes de grilla por rubros, resumen de costos y edición contextual que reutilizará F3.

**Aceptación:** el usuario puede entender una actividad y su costo por unidad sin jerga; no desaparecen actividades ni cálculos previos; no se crea un design system paralelo.

### F2 — Clientes, obras y permisos

1. Migración aditiva y API de clientes; relación obra–cliente y filtros.
2. Ficha de cliente con varias obras y navegación de regreso; formularios con inactivación no destructiva.
3. Incorporar el perfil restringido mediante allowlists explícitas y revisar consultas/exposiciones existentes.
4. Responsabilidad de recepción por ubicación y UI de asignación solo Gerencia.
5. Mantener ABM proveedor y sus vínculos; no reconstruirlo.

**Aceptación:** cliente con dos obras, datos antiguos legibles sin cliente, prohibición de nuevas obras sin cliente, permisos positivos/negativos completos y sin filtraciones vía exportaciones.

### F3 — Presupuesto de trabajo y cierre comercial

1. Modelo de borrador editable, revisión optimista y rutas de cálculo sin escritura.
2. Crear desde plantilla/otro presupuesto; seleccionar cliente/obra y mantener orden de rubros.
3. Grilla cantidad/unidad/costo/subtotal y operaciones auxiliares; totales sin perder foco.
4. Costos directos y VARIOS explícitos; recargo general sencillo y ajustes secundarios acotados.
5. Actualizar precios del borrador con vista previa; separación entre edición local y catálogo.
6. Pruebas matemáticas y consistencia con materiales previstos.

**Aceptación:** cambiar una cantidad recalcula; recargo no altera consumo de materiales; borradores no generan revisiones por cada guardado; errores no se transforman en ceros.

### F4 — Revisiones y PDF comercial

1. Emitir genera snapshot comercial inmutable y actualiza revisión vigente sin aprobación especial.
2. Edición posterior conserva la revisión anterior; descarga y preview no duplican.
3. Referencia para abastecimiento coherente y no confundida con vigencia comercial.
4. PDF desde snapshot con vista previa, datos completos, condiciones y exclusiones.
5. Revisión visual y pruebas de contenido del PDF, además del parser.

**Aceptación:** R1 descargable, cambios en borrador, R2 emitida, R1 intacta, reintentos sin duplicación y costos privados ausentes de la salida comercial.

### F5 — Precios y Excel

1. Comparador de hasta tres referencias vigentes, unidades/presentaciones compatibles y selección manual.
2. Lectura XLSX, selección de hoja, mapeo de columnas y resolución segura contra catálogo.
3. Vista anterior/nueva, errores por fila, duplicados, confirmación y revalidación transaccional.
4. Permisos específicos para importación de precios sin abrir administración general.
5. Recordatorio mensual in-app sin procesos externos.

**Aceptación:** importar columnas reordenadas, preservar historia, impedir comparar IVA/unidades incompatibles, reintento no duplica, ningún dato productivo tocado.

### F6 — Abastecimiento y cierre operativo

1. Servicio de cobertura neta con pruebas antes de conectar el botón de sugerencias.
2. Pedido con previsto/cubierto/faltante editable antes de confirmar; conservar ruta manual.
3. Integrar cobertura con OC, recepciones, reservas opcionales y transferencias sin doble conteo.
4. Mantener estados/controles OC e incorporar historial de emisor donde falte.
5. Agregar referencia de importe/estado de pago y vista de Administración restringida.
6. Completar recepción delegada sin ampliar accesos económicos.

**Aceptación:** caso 100/40/60 durante todo el ciclo; Compras emite sin aprobación; recepción actualiza stock una vez; pago informativo no afecta stock ni dinero real.

### F7 — Indicadores y reportes

1. Consultas agregadas en servidor, filtros e índices necesarios.
2. Tres vistas existentes/ampliadas y agrupación por cliente, sin dashboard financiero nuevo.
3. Totalizar revisiones vigentes; distinguir presupuesto de referencia para cantidades.
4. Conciliar pantalla, tarjetas y Excel, monedas y período.

**Aceptación:** dos obras de un cliente con varias revisiones y OC de varios renglones; totales exactos sin duplicaciones y sin exposición a roles no autorizados.

### F8 — Datos y aceptación end-to-end

1. Adaptadores de origen y dry-run de migración en aislado; contar/vincular, no sobreescribir a ciegas.
2. Fixture DG 1153 con procedencia, importes originales y revisión identificada; no usar precios actuales.
3. Ejecutar recorrido integral sobre datos sintéticos y sobre el caso real disponible; registrar diferencias justificadas.
4. Probar migración desde schema V1 poblado, no solo desde BD vacía.
5. Revisar UX completa por rol/escritorio/móvil; corregir fricción y regresiones antes del merge final.

**Aceptación:** integridad de históricos, evidencia de cálculo/PDF, ausencia de duplicaciones, scripts de migración listos sin ejecución productiva.

### F9 — Cierre y publicación en main

1. Auditoría de diff, permisos, reglas monetarias, cobertura, pruebas y ausencia de infraestructura modificada.
2. Regenerar contratos y tipos; documentación consistente con implementación.
3. Ejecutar CI sobre el SHA final y resolver fallas reales.
4. Merge permitido cuando se cumplan controles de calidad y compatibilidad; no forzar protecciones.
5. Verificar SHA remoto de `main`, checks posteriores y continuidad; entregar resumen con evidencia.

**Aceptación:** no solo PR abierto ni rama local. Si una protección externa o una incompatibilidad productiva impide integrar, reportar bloqueo concreto y trabajo restante con precisión; no llamar a la misión terminada ni prometer ejecución futura.

---

## 8. Matriz de trazabilidad del gap

Conservar los IDs R de la auditoría. Esta matriz indica trabajo objetivo; no marcar una fila como terminada hasta adjuntar archivos y resultados reales.

| ID | Decisión de implementación | Fase | Evidencia mínima |
|---|---|---|---|
| R01 | Conservar auth/asignaciones y extender allowlists. | F2 | T03–T05, T36, T51 |
| R02 | ABM/ficha de clientes. | F2 | T01, T02 |
| R03 | Cliente con varias obras; relación nueva/histórica segura. | F2 | T01, T02, T47 |
| R04 | Extender obras, no reemplazarlas. | F2 | T01–T03 |
| R05 | Preservar proveedores y su historia. | F2 | T06 |
| R06 | Preservar materiales/unidades/rubros. | F1 | T06, T23, regresión |
| R07 | Actividades + composición/costo por unidad, conservando motor. | F1/F3 | T07, T09–T12 |
| R08 | Plantillas y reutilización completa. | F1/F3 | T08, T10 |
| R09 | Grilla ágil, cálculo inmediato y ayuda aritmética. | F3 | T09, T13, T14 |
| R10 | VARIOS y directos explícitos, sin 4% universal. | F3 | T11 |
| R11 | Recargo general y excepciones no acumuladas. | F3 | T12 |
| R12 | Borrador separado de revisiones emitidas. | F3/F4 | T15–T18, T53 |
| R13 | PDF comercial privado/publicable correctamente. | F4 | T19–T21 |
| R14 | Precio histórico y actualización deliberada de borrador. | F5 | T10, T22 |
| R15 | Corralones comparables + aviso mensual. | F5 | T23, T24 |
| R16 | XLSX/mapeo/diferencias/commit. | F5 | T25–T28 |
| R17 | Mantener pedido manual y permisos. | F6 | T29, T35 |
| R18 | Faltante neto sin doble conteo. | F6 | T30–T34 |
| R19 | Conservar OC sin aprobación, estados y trazas. | F6 | T35, T37, T54 |
| R20 | Recepción parcial/total transaccional. | F6 | T35–T38 |
| R21 | Receptor delegado solo por destino. | F2/F6 | T36 |
| R22 | Administración + importe/pago informativos. | F2/F6 | T04, T05, T39 |
| R23 | Preservar transferir/consumir/devolver/mínimos. | F6 | T38, T40 |
| R24 | Seguimiento cuantitativo/Excel conciliado. | F7 | T41–T44 |
| R25 | Compras por proveedor e indicadores por cliente. | F7 | T41–T44 |
| R26 | UX integrada y terminología clara. | F1–F8 | T07, T09, T13, T48–T50 |
| R27 | Adaptador/dry-run de transición, sin tocar producción. | F8 | T45–T47 |
| R28 | Mantener pruebas existentes y añadir nuevas. | Todas | CI final, T51, T52 |
| R29 | Infraestructura/respaldos diferidos por el usuario. | Fuera | Sin cambios de configuración; no declarar verificado. |
| R30 | Reconciliar DG 1153 y su salida comercial. | F8 | T46 y registro de fuentes/diferencias. |

No confundir una capacidad fuera de la misión con un requisito funcional omitido. R29 no se usa para afirmar 100% de producción; los demás R tienen implementación o verificación específica.

---

## 9. Plan de pruebas: casos concretos, no solo cantidad de tests

### 9.1 Capas y política de calidad

**Unitarias:** reglas de dinero, precedencia del recargo, cantidades, cobertura, selección de precio vigente, huella editorial y parsing. Fixtures pequeños y legibles.

**Integración PostgreSQL:** relaciones, restricciones, transacciones, permisos, idempotencia, concurrencia, migraciones y agregaciones. BD efímera/local, no mock de Prisma para acreditar integridad.

**Contratos API:** OpenAPI, DTO por rol, validaciones, códigos de error, compatibilidad anterior y formatos nuevos.

**E2E reales:** navegador + API + PostgreSQL aislado. Los mocks pueden servir para fallos de red o estados de error específicos, no reemplazar los recorridos funcionales que deben demostrar persistencia.

**Visuales y PDF:** inspeccionar capturas y páginas renderizadas; verificar foco, dimensiones, longitudes, contraste y accesibilidad básica. Un parser que abre un PDF no prueba legibilidad.

**Regresión V1:** mantener pruebas de autenticación, cookie/sesión, proveedores, stock, reservas, devoluciones, OC, importaciones y descargas existentes. Solo cambiar expectativas cuando la regla cambió deliberadamente y documentarlo; no retirar tests incómodos ni bajar timeouts/controles para simular éxito.

### 9.2 Casos de aceptación obligatorios

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

### 9.3 Datos de prueba mínimos

Dataset sintético: dos clientes, uno con dos obras activas y una finalizada; tres proveedores comparables y uno incompatible/inactivo; galpón y patio; usuarios por perfil y un receptor delegado; materiales con unidades/presentaciones diferentes; actividades con materiales+MO, solo MO y costo directo; VARIOS; presupuestos con varias revisiones; pedidos/OC parciales y generales; recepciones, transferencias y consumos.

Agregar fechas anteriores, futuras, cambio de mes y cierre de día de Argentina. Incluir al menos una lista con números en formato local y una unidad ambigua. No usar únicamente el camino feliz de un material/una obra/un usuario.

---

## 10. Comandos y automatización de calidad

Usar las versiones fijadas por el repositorio actual; no actualizar dependencias mayores como parte del gap. Los comandos siguientes existen en la base revisada, pero confirmar sus scripts al iniciar.

**Condición previa obligatoria:** `DATABASE_URL` debe apuntar a PostgreSQL local/efímero aislado, con nombre que contenga `test`, sin túnel ni acceso a la base productiva. Validar destino sin imprimir credenciales. No copiar variables de Railway para facilitar una ejecución.

```bash
# Desde la raíz del repo; solo después de validar destino de pruebas.
pnpm install --frozen-lockfile
pnpm --dir apps/api db:generate
pnpm --dir apps/api db:deploy

# Contratos y tipos. Versionar los artefactos coherentes con el cambio.
pnpm --dir apps/api api:generate
pnpm --dir apps/web api:types

pnpm --dir apps/api typecheck
RUN_INTEGRATION=1 pnpm --dir apps/api test
pnpm --dir apps/api build
pnpm --dir apps/api test:runtime

pnpm --dir apps/web typecheck
pnpm --dir apps/web test
pnpm --dir apps/web build
pnpm --dir apps/web exec playwright install --with-deps chromium
apps/web/scripts/e2e-ci.sh

git diff --check
```

Además:

- Añadir scripts focalizados/fixtures para aceptación histórica, snapshots/PDF y migración V1. Documentarlos con comandos reproducibles.
- No declarar integraciones aprobadas si se omitieron por falta de `RUN_INTEGRATION` o BD.
- `test:runtime` necesita el artefacto compilado y el entorno aislado esperado. No asumir que un test unitario comprueba el servidor real.
- Las pruebas monetarias usan strings decimales y expectativas explícitas, no comparaciones con tolerancias enormes que oculten errores.
- La generación de contratos debe dejar el repositorio consistente; en CI, regenerar y exigir diff vacío.
- No agregar un «lint exitoso» al reporte si no existe un script ejecutado. Usar las comprobaciones reales del proyecto.
- Mantener los workflows API y web; ampliar API para cubrir `main` además de PR y dejar de depender únicamente del nombre histórico `codex/ceo-v1-backend`. Esto es CI de prueba, no configuración productiva.
- No hacer obligatorios secrets de producción para verificar PR. Usar datos sintéticos y PostgreSQL efímero como hoy.
- Guardar evidencia visual/PDF y logs acotados en artefactos; no llenar el repositorio con dumps, binarios de builds ni screenshots con datos personales.

---

## 11. Organización de trabajo de Codex

### 11.1 Una sola responsabilidad de integración

Un agente/coordinador es dueño de la integración, las migraciones Prisma y el contrato OpenAPI. Si el entorno permite colaboradores, pueden repartirse código no superpuesto, por ejemplo UI, dominio y pruebas, pero nunca editar simultáneamente el mismo esquema/generador/archivo compartido. La misión debe ser ejecutable también por una sola instancia, sin depender de una función de agentes paralelos.

No usar una división rígida «Codex solo backend/otro agente UI» para dejar el producto incompleto. Esta misión encarga ambas capas a Codex.

### 11.2 Ciclo de cada entrega

1. Leer el estado y detectar cambios ajenos.
2. Descomponer el requisito en datos, comportamiento, UI, permisos y pruebas.
3. Escribir ejemplos de aceptación y tests focalizados de reglas críticas.
4. Implementar el incremento mínimo completo.
5. Ejecutar tests, inspeccionar UI/PDF reales y corregir.
6. Revisar diff y actualizar contrato/documentación.
7. Commit coherente, evidencia y siguiente paso claro.
8. Integrar según la seguridad del release, no solo según el orden numérico de la fase.

No posponer todas las pruebas o toda la UX al final. No sustituir integraciones por mocks para anunciar que una fase está completa.

### 11.3 Control de scope durante la misión

Cada cambio debe corresponder a un R, un test o una garantía necesaria de compatibilidad/seguridad. Una mejora ajena se registra fuera de esta misión y no se implementa por iniciativa propia. No abrir funcionalidades de pagos, CRM, planificación, facturación, historial completo o valoración de stock para «aprovechar» el desarrollo.

Cuando una cuestión técnica no modifica el negocio, elegir la alternativa más simple compatible con este plan y documentarla, sin pedir al usuario que decida nombres de tablas, rutas o librerías. Cuando aparezca una limitación real, trabajar el resto del alcance y comunicar el hecho, no inventar que quedó resuelto.

---

## 12. Integración a main sin tocar infraestructura

### 12.1 Estrategia Git

- Partir de `main` actualizado. Rama de misión sugerida: `codex/ceo-etapa1-cierre-funcional`.
- Commits por incremento probado. PR de integración con matriz de requisitos y evidencia; pueden usarse PR verticales separados si cada uno es desplegable de forma segura y se verifican sus dependencias.
- No dejar medias funciones visibles en `main`. Un backend nuevo sin pantalla o una pantalla con datos ficticios no son una entrega funcional.
- No force-push a `main`, no `reset --hard` sobre trabajo ajeno, no ignorar checks requeridos y no autoaprobar revisiones exigidas por la plataforma.
- La autorización del usuario permite el merge después de calidad y compatibilidad; no se requiere pedir nuevamente permiso por cada mejora ya incluida.

### 12.2 Riesgo específico: merge y cambios de esquema

El objetivo «todo a main» convive con «no tocar infraestructura». Las migraciones nuevas no se aplican solas por estar en Git, y añadir columnas al modelo puede hacer que consultas Prisma existentes intenten leerlas antes de que existan.

No basta con escribir una migración aditiva y afirmar que el release es compatible. Hay que demostrarlo.

**Ruta preferida:** diseño expand/compatible, con migraciones versionadas y pruebas en aislado. Preservar funciones V1 contra schema anterior cuando el despliegue automático de `main` pueda adelantarse a la habilitación de las nuevas migraciones.

Cuando haga falta, usar un control acotado de disponibilidad del esquema de aplicación, consultado de forma read-only en servidor, sin nuevo servicio ni nuevas variables cloud. El control puede basarse en migraciones requeridas efectivamente aplicadas. No intentar crear tablas desde una request ni «reparar» producción automáticamente.

- Los endpoints antiguos deben usar proyecciones compatibles cuando faltan columnas nuevas; auditar selecciones implícitas de `Work`, `PurchaseOrder` y relaciones afectadas.
- Las funciones que requieren el esquema nuevo deben responder claramente «no habilitadas en este entorno» sin fallar toda la aplicación ni devolver cifras falsas; la interfaz muestra ese estado de forma honesta.
- Tras aplicar las migraciones en un entorno habilitado, las funciones se activan por capacidad real del esquema y deben superar la suite completa. No considerar la pantalla deshabilitada como prueba funcional del requisito.
- No agregar un framework de feature flags: solo el mecanismo mínimo necesario para un release compatible.
- Probar ambos estados (schema V1 y expandido). Aplicar migraciones solo en local/CI durante esta misión.

**Si no se puede demostrar compatibilidad sin una intervención productiva excluida:** no empujar un cambio que rompa la aplicación para cumplir formalmente «main». Completar código/tests en la rama, dejar PR y bloqueo exacto. No ejecutar la migración productiva sin autorización ni afirmar integración completa. Este es un control de seguridad, no una excusa para omitir funcionalidades.

### 12.3 Checks de merge obligatorios

- Tests de API, web, integración, runtime y E2E aprobados en el SHA candidato actual.
- Contratos/tipos sincronizados y build API/web correcto.
- Migraciones probadas desde BD vacía y V1 poblada.
- Roles, revisiones, cobertura neta y conciliación de reportes aprobados.
- UI y PDF inspeccionados; no eliminar regresión visual a ciegas.
- Ningún cambio de secretos, backups, servicios, planes cloud o datos productivos.
- Diff revisado: sin mocks productivos, TODO funcional, logs sensibles o dependencias mayores innecesarias.
- Merge con protecciones respetadas y SHA remoto de `main` comprobado después.
- Verificar CI posterior en `main`. No reutilizar los resultados de una rama si hubo resolución de conflictos distinta.

### 12.4 Qué significa el resultado final

**«Implementado e integrado en main»**: fuente, migraciones, UI, tests y documentación están integrados y verificados.

**«Habilitado en producción»**: requiere una comprobación adicional del entorno y sus datos. No afirmarlo en esta misión sin haberlo verificado legítimamente; configuración productiva y ejecución de migración quedan fuera de las acciones autorizadas aquí.

No desactivar un autodeploy existente por iniciativa propia ni disparar deployments manuales. Si el merge lo dispara, observar su estado permitido en lectura sin cambiar infraestructura. Nunca usar la exclusión de backups para omitir la seguridad de compatibilidad de aplicación.

---

## 13. Criterios de aceptación históricos y cierre del piloto

### 13.1 DG 1153 como caso, no como planilla a clonar

Extraer a un fixture normalizado los rubros, actividades, unidades, cantidades, costos de materiales/MO/directos y ajustes comerciales de la revisión correcta. Identificar fuente, hoja y fecha de precios; mantener trazabilidad de conversiones. No copiar macros o dependencias externas.

Comparar:

- Cantidades y costo por actividad/rubro.
- VARIOS como partidas con valores reales de esa obra.
- Excepciones comerciales donde existan, sin forzar el mismo recargo a todo el histórico.
- Importe comercial y contenido del PDF.
- Materiales previstos para abastecimiento, no afectados por rentabilidad.
- Diferencias atribuibles a fuente/revisión/redondeo, si las hubiera, con números y explicación.

Las pruebas no deben pasar únicamente porque se escribió `$861.187.557,13` en una expectativa alimentada con el mismo literal. El recorrido debe producir importes desde las entradas y las reglas verificadas.

### 13.2 No mezclar datos de negocio con decisiones pendientes

Nombres de usuarios concretos, un CUIT faltante o archivos de migración incompletos son datos de puesta en marcha. El sistema debe admitir su configuración y señalar ausencias; no desarrollar un producto basado en personas hardcodeadas.

Si no se obtuvo un archivo real, informar «verificación histórica no ejecutada: falta fuente X», con los demás tests ya realizados. No presentar el caso histórico como aprobado ni el producto como aceptado por CEO por haber pasado datos sintéticos.

---

## 14. Entrega final exigida a Codex

El resumen de cierre debe incluir, con evidencia verificable:

1. **Qué quedó implementado**, agrupado por capacidades de producto, y matriz R → archivos → tests.
2. **Terminología y UX**: confirmar Actividades de obra, Costo por unidad y Composición del costo; capturas representativas escritorio/móvil y PDF.
3. **Resultados reales** de unitarias, integración, contratos, runtime, E2E y aceptación histórica, indicando omitidos/fallas sin maquillarlos.
4. **Migraciones** creadas, compatibilidad con datos/esquema anteriores y ambientes donde se probaron. Aclarar que no se aplicaron sobre producción.
5. **Git**: ramas/PR, commits, SHA finalmente presente en `main` y enlaces de CI del candidato/merge. Si no hubo merge, decirlo expresamente.
6. **Fuera de misión**: infraestructura/respaldos/configuración y ejecución productiva no modificados. No presentarlos como hallazgos que bloquean el desarrollo ya probado.
7. **Limitaciones reales**, si existen: fuente de DG no accesible, permisos de GitHub, protección de rama o incompatibilidad no resuelta. No escribir «todo listo» con funciones aprobadas faltantes.

La salida no debe terminar en «plan listo para implementar». El encargo a Codex es ejecutar este plan y cerrar la brecha, no producir otro plan.

---

## 15. Referencias de evidencia del repositorio

Enlaces anclados al commit inspeccionado; al ejecutar, comparar con `main` actual:

- [Instrucciones antiguas de agentes](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/AGENTS.md)
- [Modelo Prisma](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/api/prisma/schema.prisma)
- [Cálculos y versiones](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/api/src/modules/budgets.ts)
- [Compras/recepciones](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/api/src/modules/procurement.ts)
- [Inventario](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/api/src/modules/inventory.ts)
- [Reportes](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/api/src/modules/reports.ts)
- [Importaciones](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/api/src/modules/imports.ts)
- [Permisos web](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/web/lib/permissions.ts)
- [Formulario de versiones V1](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/web/components/presupuesto/VersionForm.tsx)
- [Formulario de cómputos V1](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/apps/web/components/presupuesto/ComputationForm.tsx)
- [CI API](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/.github/workflows/api.yml)
- [CI Web](https://github.com/Broco-Solutions/ceo-construcciones/blob/a9a075dc159c8c59d075aa5894534e3dbaae961e/.github/workflows/web.yml)

**Criterio final:** completar una V1 existente con una experiencia de presupuestación y operación mucho más clara; no rehacer el sistema ni ampliar el proyecto a un ERP general.
