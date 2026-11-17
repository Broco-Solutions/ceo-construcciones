# CEO Construcciones — Checklist maestro de V1 y cierre de Etapa 1

**Proyecto:** CEO Construcciones  
**Equipo:** Broco Solutions  
**Actualizado:** 16/11/2026  
**Objetivo inmediato:** entregar una **V1 funcional, estable y presentable** para demostración y validación con CEO.  
**Objetivo final:** completar la **Etapa 1** y habilitar su uso operativo.

> **Estado inicial de seguimiento:** 0/47 objetivos V1 y 0/32 objetivos E1 formalmente cerrados **en este checklist**. Esto no significa que estén sin desarrollar: el repositorio ya contiene implementaciones y pruebas de los circuitos principales. Cada punto se marca como cerrado solamente después de revisar evidencia suficiente para el hito correspondiente.
>
> **Alcance de V1:** demostración/validación con datos controlados; no equivale a puesta en operación definitiva. Si se decide operar datos reales durante V1, deben adelantarse las condiciones de seguridad, respaldo y transición aplicables.

## Cómo usar este archivo

Esta es la **única lista maestra de objetivos y prioridades**. No reemplaza las fuentes funcionales ni los registros técnicos:
- Alcance: [PRD Etapa 1](PRD-ETAPA-1.md) y [decisiones](DECISIONES-CIERRE.md). Prevalecen contrato y Anexo I ante contradicciones.
- Evidencia funcional: [aceptación](ACEPTACION-CIERRE-ETAPA-1.md) y [matriz de trazabilidad](REQUISITOS-ETAPA-1-CIERRE.md).
- Cambios, checks, integración y despliegue: [estado del proyecto](ESTADO-PROYECTO.md).
- Contexto de demo y límites de los datos: [demo online](DEMO-ONLINE.md).

**Prioridad:** `[V1]` = necesario para la entrega de validación; `[E1]` = necesario para el cierre definitivo, sin bloquear por sí solo la demostración de V1.  
**Naturaleza:** `[V]` = verificar; `[D]` = definir con responsables; `[P]` = pendiente operativo/documental.

**Estados:** `Por verificar` (casilla vacía sin anotación), `Listo` (casilla marcada y evidencia), `Requiere ajuste`, `Bloqueado`, `Diferido`, `No aplica` (siempre con justificación).  
**Regla de cierre:** no marcar `[x]` solo porque hay código, tests o demo previa. Verificar el comportamiento del punto en el alcance del hito y registrar responsable, fecha y evidencia (PR, caso de prueba, captura o validación). Los cambios parciales no cierran automáticamente toda la tarea.

**Formato para registrar avances**, debajo de la tarea correspondiente:
`  - Estado: Listo | Responsable: ... | Fecha: AAAA-MM-DD | Evidencia: enlace o referencia | Observaciones: ...`
Para ajustes o bloqueos, conservar `[ ]` e indicar `Estado: Requiere ajuste / Bloqueado / Diferido` con causa y próximo paso. **No incorporar credenciales, datos privados ni secretos.**

**En cada intervención de Codex o del equipo:** leer este archivo antes de elegir el objetivo, no ampliar alcance por iniciativa propia, actualizar solo los puntos afectados con evidencia real y actualizar [ESTADO-PROYECTO](ESTADO-PROYECTO.md) si hay un hito técnico. Incluir las actualizaciones documentales en el mismo PR del trabajo. Revisar primero el estado más reciente de `main`; las modificaciones se realizan en una rama/PR conforme a [AGENTS.md](../AGENTS.md), nunca asumiendo que la creación de un PR habilita un despliegue o migración. Ante cambios de prioridad acordados, actualizar la etiqueta y el resumen de conteos.

---

# Hito 1 — Entrega V1

## Nivel 1 — Revisión general y ajustes menores

**Complejidad:** baja. **Objetivo:** detectar y resolver problemas visibles para que el sistema sea fácil de recorrer y presentar.

- [x] **1.1 [V1] [V] Acceso al sistema:** comprobar que el dominio público, inicio de sesión y cierre de sesión funcionan correctamente.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-16 | Resultado: login válido/inválido, recarga, logout con revocación, redirección anónima, sesión inválida y recuperación, 429, cookies y Origin verificados en local. Sesión vencida persistida rechazada por API/PostgreSQL; dominio público HTTP 200 sin autenticación. | Evidencia: `apps/web/e2e/auth.spec.ts` (20/20 en stack local real), `apps/api/tests/access-contract.integration.test.ts` (6/6), `login-protection.integration.test.ts` (8/8) y runtime API (3/3). Logs privados en `~/.local/state/ceo-construcciones-codex/logs/20261116_094850_34320-e2e/` y `20261116_093241_22569-api/`. Validación V1 local, sin login productivo ni aceptación del cliente.
- [x] **1.2 [V1] [V] Usuarios y perfiles:** probar los cinco perfiles: Gerencia, Cómputo/Presupuestos, Compras, Jefe de Obra y Administración Restringida.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-16 | Resultado: los cinco usuarios sintéticos inician sesión, muestran nombre/perfil concordantes con `/auth/me` y cierran sesión; el token anterior devuelve 401 después del logout. | Evidencia: `apps/web/e2e/auth.spec.ts`, casos «accesos y menú escritorio/móvil» (10/10), API/PostgreSQL y Chromium reales; log privado `~/.local/state/ceo-construcciones-codex/logs/20261116_094850_34320-e2e/e2e.log`. No constituye auditoría profunda de permisos de Nivel 2.
- [x] **1.3 [V1] [V] Menú y navegación:** revisar que cada usuario encuentre fácilmente sus funciones habituales.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-16 | Resultado: enlaces esperados por perfil, rutas principales, sección activa, identidad de sesión conservada y regreso a Inicio verificados; Administración sólo muestra sus dos enlaces autorizados y Jefe no muestra enlaces económicos. Menú móvil abre, cierra y navega con los cinco perfiles. | Evidencia: `apps/web/e2e/auth.spec.ts`, casos de navegación por rol y «accesos y menú escritorio/móvil»; `apps/web/tests/permissions.test.ts` (3/3). Log privado `~/.local/state/ceo-construcciones-codex/logs/20261116_094850_34320-e2e/e2e.log`. Alcance limitado al menú; no cierra 1.4 ni Nivel 2.
- [x] **1.4 [V1] [V] Experiencia móvil:** recorrer las principales pantallas desde un celular.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-16 | Resultado: Chromium local real, 23 combinaciones pantalla/perfil a 360 y 390 px (los cinco perfiles), sin desborde de página ni controles sin etiqueta; identidad conservada. Formularios representativos completados/cancelados a 360/390/1280 y regresión de escritorio aprobada. Sin cambios de diseño/CSS. | Evidencia: `apps/web/e2e/visual.spec.ts`, `ux-regression.spec.ts`, `mobile.spec.ts`, `ux-mobile.spec.ts`; E2E final 110/110. Logs privados `~/.local/state/ceo-construcciones-codex/logs/20261116_112151_52701-e2e/`; capturas actuales en `mission02-20261116/visual-after-selection/` privado. Validación V1 local, sin aceptación del cliente.
- [x] **1.5 [V1] [V] Formularios y mensajes:** identificar campos confusos, validaciones difíciles de interpretar y acciones innecesarias.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-16 | Resultado: etiquetas, validaciones existentes, conservación de datos ante rechazo, Guardar/Cancelar, modales/foco, doble envío y avisos de éxito/error verificados. Defecto reproducido de asociación accesible de ayuda/error corregido en Field/TextField/SelectField nativo/TextArea, preservando descripciones propias. Contadores con singular gramatical menor («1 resultados/seleccionados») registrados como mejora opcional, sin impedir uso. | Evidencia: `apps/web/tests/combobox.test.tsx` (6/6), `notifications.test.tsx`, `login-ui.test.tsx`, E2E `ux.spec.ts`, `ux-regression.spec.ts`, `codes-and-form-layout.spec.ts`; web final 61/61, tipos/build correctos y E2E 110/110. Reproducción y revalidación privadas en `~/.local/state/ceo-construcciones-codex/mission02-20261116/`; sin nuevas reglas de validación de negocio.
- [x] **1.6 [V1] [V] Buscadores, filtros y tablas:** comprobar búsquedas, paginación, selección múltiple y exportaciones principales.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-16 | Resultado: búsquedas por código/nombre, tildes/espacios, homónimos e ID; filtros/limpieza/paginación; fila/página/todos/exclusión e invalidez real del filtro verificados. Reproducida y corregida pérdida de selección por actualización demorada del texto tras elegir ID en Clientes, Obras, Materiales, Proveedores y Actividades. Caso profundo: 115 clientes/3 páginas, Excel filtrado 115 y selección congelada 114 tras exclusión, sin alta posterior. Excel filtrado/seleccionado de Obras, Materiales, Proveedores, Pedidos, OC y Stock, más informe filtrado, parseados a 1280/360/390 px. | Evidencia: `apps/web/e2e/ux-transversal.spec.ts` (12/12), `features.spec.ts`, `apps/web/tests/table-selection.test.tsx` y `combobox.test.tsx`; E2E final 110/110 y web 61/61. Log privado `~/.local/state/ceo-construcciones-codex/logs/20261116_112151_52701-e2e/e2e.log`. Límites, vencimientos y autorizaciones de exportación conservados; sin PR ni publicación.
- [x] **1.7 [V1] [V] PDF de presupuestos:** revisar presentación, encabezados, cantidades, subtotales, totales y condiciones comerciales.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: encabezados, cantidades/unidades, precios comerciales con precisión, subtotales, total, moneda/IVA y condiciones verificados; sin composición, costos ni recargos internos. Vista previa/R1 coherentes; R1 conserva sus bytes tras cambios de maestros y borrador, R2 conserva sus condiciones propias. Formato histórico V1 byte idéntico y versiones antiguas de costos no se convierten en venta. Corregidos separadores sobre texto y rubros largos fuera del ancho imprimible en V2. | Evidencia: `apps/api/tests/pdf-v2.test.ts` (5/5), `commercial.integration.test.ts` y E2E `closure.spec.ts`; API final 216 + 3 runtime, web 61 y E2E 110 aprobadas. PDF simples y extensos de 9/29 páginas revisados. Evidencia privada: `~/.local/state/ceo-construcciones-codex/mission03-20261116/`, corridas `final/` y validación/render actualizado `resume-20261117/validation.json` (18 PDF, 76 páginas entre ambos objetivos). Cierre V1 local, sin PR/publicación ni aceptación del cliente.
- [x] **1.8 [V1] [V] PDF de órdenes de compra:** revisar proveedor, destino, materiales, cantidades, precios y formato.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: proveedor/CUIT/domicilio, destino obra y general/patio, materiales/presentaciones, cantidades, precios/base, importes, moneda/IVA y total comprobados; 0,33 + 0,34 = 0,67. Datos emitidos congelados frente a cambios de maestros; sólo notas autorizadas públicas, sin datos privados de factura. Descargar no modifica OC, auditoría ni stock; cancelación conserva contenido y cambia estado visible. OC histórica sin política conserva advertencia y no inventa total. | Evidencia: `apps/api/tests/procurement.integration.test.ts` (6/6), `pdf-v2.test.ts` y E2E `flows.spec.ts`; API final 216 + 3 runtime, web 61 y E2E 110 aprobadas. OC simples, histórica y extensas emitida/cancelada de 12 páginas revisadas; corrección compartida de separadores con regresión geométrica. PDF/PNG y hashes privados en `~/.local/state/ceo-construcciones-codex/mission03-20261116/resume-20261117/`; logs completos previos en `final/`. Sin cambios de cálculos, permisos, modelos ni infraestructura. Avance V1: 8/47 verificados; E1 no se modifica.
- [x] **1.9 [V1] [P] Protección de accesos:** revisar que no permanezcan credenciales vigentes expuestas en documentación compartida.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: revisión textual previa y exclusiones Git conservadas; completada inspección visual del inventario `git ls-files`: 93 PNG (88 capturas y cinco iconos/logos) y tres PDF (12/29/1 páginas). Sin exposición de secretos detectada. Las tres capturas `login/despues-visible-*.png` contienen exclusivamente ejemplo sintético sin cuenta, confirmado por README de evidencia y `login-visual.spec.ts`; no son credenciales operativas. | Evidencia: 16 hojas de contacto PNG, extracción directa de texto PDF con pdf-lib existente y render de las 42 páginas con Windows.Data.Pdf, revisadas en siete hojas. Sin OCR, instalaciones ni lectura de credenciales privadas online. Auxiliares/evidencia temporal fuera del repositorio en `/tmp/ceo-m04-visual/` y `%LOCALAPPDATA%/Temp/ceo-m04-visual/`. Avance actual: 10/47 V1; Nivel 1 completo, sin aceptación operativa del cliente.
- [x] **1.10 [V1] [P] Registrar hallazgos:** preparar una lista de errores o mejoras menores, evitando duplicados.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Evidencia: consolidación de Misiones 01–03 y registros históricos en el hito Misión 04 de `ESTADO-PROYECTO.md`; singular pendiente confirmado en `apps/web/components/ui.tsx:247`. Sin correcciones opcionales ni pruebas integrales nuevas. Avance V1: 9/47; Nivel 1 pendiente de completar 1.9.

**Criterio de cierre:** sistema accesible, navegable y presentable, sin problemas que impidan las tareas principales.

## Nivel 2 — Reglas funcionales y permisos

**Complejidad:** baja a media. **Objetivo:** confirmar autorizaciones y reglas básicas.

- [x] **2.1 [V1] [V] Permisos de Gerencia:** acceso completo a la administración y módulos incluidos.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: Gerencia consulta usuarios y módulos, administra obras/delegaciones, carga stock inicial y opera compras; sin rechazos indebidos en los casos ejercitados. Evidencia: closure-access, procurement e inventory; navegación E2E escritorio/móvil. | Pruebas: seis archivos API 40/40 y archivo ampliado final 8/8 (41 casos distintos en total), permisos web 3/3, auth E2E 20/20; tipos API y builds API/web aprobados. Logs privados: `~/.local/state/ceo-construcciones-codex/mission05/`. Sin aceptación del cliente.
- [x] **2.2 [V1] [V] Permisos de Cómputo/Presupuestos:** acceso a actividades, costos, cómputos, presupuestos y referencias autorizadas.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: Cómputo consulta obras/catálogos, crea clientes y opera actividades, borrador, revisiones/emisión/PDF comercial; no administra usuarios/obras ni emite OC o mueve stock. Evidencia: commercial (actor COMPUTO), closure-access y matriz access-contract; navegación E2E. | Pruebas: seis archivos API 40/40 y archivo ampliado final 8/8 (41 casos distintos en total), permisos web 3/3, auth E2E 20/20; tipos API y builds API/web aprobados. Logs privados: `~/.local/state/ceo-construcciones-codex/mission05/`. Sin aceptación del cliente.
- [x] **2.3 [V1] [V] Permisos de Compras:** proveedores, precios, pedidos, cotizaciones, OC y stock autorizado.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: Compras consulta módulos económicos operativos, crea/emite OC y carga factura, transfiere stock; no administra usuarios/obras, edita presupuestos/actividades ni ajusta stock. Evidencia: closure-access y matriz access-contract; navegación E2E. | Pruebas: seis archivos API 40/40 y archivo ampliado final 8/8 (41 casos distintos en total), permisos web 3/3, auth E2E 20/20; tipos API y builds API/web aprobados. Logs privados: `~/.local/state/ceo-construcciones-codex/mission05/`. Sin aceptación del cliente.
- [x] **2.4 [V1] [V] Permisos de Jefe de Obra:** acceso únicamente a obras asignadas y sin exposición de precios o costos internos.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: Jefe consulta obra asignada, consume stock propio; obra/pedido/historial ajenos e ID de OC general rechazados con 403 sin data. DTO de OC sin economía; filtros aíslan obras y modificaciones prohibidas se rechazan. Evidencia: closure-access, procurement, inventory, security y access-contract; navegación E2E. | Pruebas: seis archivos API 40/40 y archivo ampliado final 8/8 (41 casos distintos en total), permisos web 3/3, auth E2E 20/20; tipos API y builds API/web aprobados. Logs privados: `~/.local/state/ceo-construcciones-codex/mission05/`. Sin aceptación del cliente.
- [x] **2.5 [V1] [V] Permisos de Administración Restringida:** gestión informativa de factura/pago y recepciones expresamente delegadas, sin acceso económico general.
  - Estado: Listo | Responsable: Codex | Fecha: 2026-11-17 | Resultado: Administración consulta DTO mínimo y cambia pago informativo; no edita factura ni accede a módulos/búsquedas/exportaciones/PDF/historiales globales. Recepción sólo en destino delegado, DTO sin economía, reintento idempotente y revocación inmediata incluso con la misma clave; bandeja vacía tras revocar. Evidencia: closure-access y access-contract; navegación E2E. | Pruebas: seis archivos API 40/40 y archivo ampliado final 8/8 (41 casos distintos en total), permisos web 3/3, auth E2E 20/20; tipos API y builds API/web aprobados. Logs privados: `~/.local/state/ceo-construcciones-codex/mission05/`. Sin aceptación del cliente.
- [ ] **2.6 [V1] [D] Responsables operativos:** confirmar quién registra recepciones, consumos, devoluciones y ajustes de inventario.
- [ ] **2.7 [V1] [D] IVA, monedas y redondeo:** acordar las reglas necesarias para validar cálculos comerciales, cotizaciones y OC.
- [ ] **2.8 [V1] [D] Unidades y presentaciones:** validar equivalencias utilizadas en las pruebas; por ejemplo, bolsa de cemento y kilogramos de consumo.
- [ ] **2.9 [V1] [V] Simplicidad de aprobaciones:** confirmar que emitir presupuestos y OC no requiera aprobaciones adicionales obligatorias.
- [ ] **2.10 [E1] [P] Consolidar reglas definitivas:** documentar decisiones funcionales vigentes sin copiar procesos de Excel por costumbre.

**Criterio de cierre V1:** permisos comprobados y reglas necesarias para los circuitos de demostración definidas.

## Nivel 3 — Clientes, obras, catálogos y presupuestos

**Complejidad:** media. **Objetivo:** demostrar el circuito comercial completo.

- [ ] **3.1 [V1] [V] Clientes:** alta, edición, consulta e historial.
- [ ] **3.2 [V1] [V] Obras:** alta, asignación de responsables, estado y asociación con clientes.
- [ ] **3.3 [V1] [V] Relación cliente–obras:** comprobar que un cliente pueda tener varias obras.
- [ ] **3.4 [V1] [V] Catálogos:** materiales, unidades, rubros, proveedores y presentaciones necesarios para los recorridos de prueba.
- [ ] **3.5 [V1] [V] Actividades de obra:** composición de materiales, consumos por unidad, mano de obra y costos directos.
- [ ] **3.6 [V1] [V] Cómputos:** ingreso y modificación de cantidades por actividad.
- [ ] **3.7 [V1] [V] Plantilla BASE:** reutilización de actividades y costos sin alterar registros originales.
- [ ] **3.8 [V1] [V] Cálculo de presupuestos:** costo unitario, subtotal por rubro, VARIOS y recargo comercial.
- [ ] **3.9 [V1] [V] Precios de referencia:** actualización explícita de borradores, preservando precios particulares e históricos.
- [ ] **3.10 [V1] [V] Revisiones:** guardar borrador, emitir R1, modificar y emitir R2 sin alterar R1.
- [ ] **3.11 [V1] [V] PDF comercial:** confirmar que no exponga costos internos, composición de materiales ni margen.
- [ ] **3.12 [V1] [V] Materiales previstos:** comprobar que cantidades presupuestadas generen correctamente las necesidades de materiales.
- [ ] **3.13 [E1] [D] Conciliación DG 1153:** revisar la diferencia histórica documentada de $15,69 y confirmar el criterio aceptado de cálculo y redondeo.

**Criterio de cierre V1:** obra creada, presupuesto calculado, revisiones/PDF emitidos y materiales previstos coherentes. Un error general de cálculo **sí bloquea V1**, aunque la conciliación histórica de DG quede para E1.

## Nivel 4 — Compras, recepciones y stock

**Complejidad:** media a alta. **Objetivo:** verificar trazabilidad de los materiales.

- [ ] **4.1 [V1] [V] Pedidos de materiales:** creación manual y a partir de necesidades de obra.
- [ ] **4.2 [V1] [V] Necesidades pendientes:** verificar que pedidos, OC, recepciones y reservas no se contabilicen dos veces.
- [ ] **4.3 [V1] [V] Cotizaciones:** registrar ofertas y comparar proveedores sin asumir equivalencias de moneda, IVA o presentación.
- [ ] **4.4 [V1] [V] Órdenes de compra:** creación, edición de borrador, emisión, cancelación permitida y numeración.
- [ ] **4.5 [V1] [V] Compras generales:** OC para galpón/patio sin asociarlas a una obra.
- [ ] **4.6 [V1] [V] Recepciones:** ingresos parciales y completos, remitos y cantidades pendientes.
- [ ] **4.7 [V1] [V] Recepción por usuario:** Jefe de Obra en su obra, Compras en ubicaciones generales y delegaciones específicas.
- [ ] **4.8 [V1] [V] Stock físico y disponible:** distinguir existencias, reservas y disponibilidad real.
- [ ] **4.9 [V1] [V] Reservas:** reservar reduce disponible, no el stock físico.
- [ ] **4.10 [V1] [V] Transferencias:** trasladar materiales a una obra no registra automáticamente consumo.
- [ ] **4.11 [V1] [V] Consumos y devoluciones:** registrar salidas efectivas de obra y retornos.
- [ ] **4.12 [V1] [V] Ajustes de inventario:** permisos, motivos y trazabilidad.
- [ ] **4.13 [V1] [V] Stock mínimo:** configuración y alertas visuales sin compras automáticas.
- [ ] **4.14 [E1] [V] Registro administrativo de factura:** validar número, importe, moneda y estado informativo Pagado/Pendiente con responsables.
- [ ] **4.15 [V1] [V] Auditoría:** comprobar actor y fecha de las operaciones principales.
- [ ] **4.16 [V1] [V] Informes:** comparar previsto, pedido, comprado, recibido y consumido, con filtros y exportación.

**Criterio de cierre V1:** recorrido pedido → OC → recepción → stock → transferencia → consumo, con saldos coherentes.

## Puerta de salida de V1

Comprobar antes de comunicar que la V1 está lista:

1. Los **47 puntos etiquetados [V1]** cuentan con resultado, o con excepción no bloqueante explícitamente aceptada. Esto incluye **7.7**, tratado transversalmente desde el inicio.
2. Hay una prueba integral de los circuitos comercial y de materiales con registros DEMO controlados.
3. No hay errores bloqueantes conocidos en importes, cantidades, autorizaciones o integridad de datos.
4. Los PDF de presupuesto y OC fueron revisados.
5. Los ajustes menores diferidos tienen registro y responsable.
6. Broco Solutions confirma que la versión está preparada para validación con CEO.

**Resultado:** V1 lista para demostración/validación. **No es aceptación operativa del piloto.**

---

# Hito 2 — Cierre definitivo de Etapa 1

Los puntos V1 verificados se conservan. Los niveles 5 y 6 pueden prepararse en paralelo cuando hay dependencias externas, sin desviar el cierre de V1.

## Nivel 5 — Datos reales y preparación operativa

**Complejidad:** alta.

- [ ] **5.1 [E1] [V] Catálogo cargado:** revisar el catálogo completo de 146 actividades, rubros y materiales provenientes de BASE.
- [ ] **5.2 [E1] [P] Composiciones incompletas:** evaluar las 76 actividades con limitaciones y completar las necesarias para operar, sin inventar datos históricos.
- [ ] **5.3 [E1] [P] Precios vigentes:** confirmar cotizaciones actuales y distinguirlas de referencias históricas.
- [ ] **5.4 [E1] [P] Mano de obra:** verificar tarifas aplicables y referencias faltantes.
- [ ] **5.5 [E1] [V] Importaciones Excel:** previsualización, errores, confirmación y conservación del historial.
- [ ] **5.6 [E1] [P] Seleccionar obra piloto:** elegir obra representativa y responsables.
- [ ] **5.7 [E1] [P] Preparar inventario inicial:** obtener recuento físico de CEO por material y ubicación.
- [ ] **5.8 [E1] [D] Mínimos operativos:** acordar mínimos para el piloto.
- [ ] **5.9 [E1] [V] Indicadores reales:** validar informes por cliente, obra y proveedor contra información operativa.
- [ ] **5.10 [E1] [P] Documentación integral:** consolidar Clientes, Obras, Presupuestos, Catálogos, Compras, Stock, perfiles y reglas vigentes.

**Criterio de cierre:** datos del piloto revisados, responsables identificados y limitaciones documentadas. No es indispensable completar las 76 composiciones si no se necesitan y su limitación queda explícita.

## Nivel 6 — Seguridad, continuidad y transición desde CEO Obras

**Complejidad:** alta a muy alta.

- [ ] **6.1 [E1] [D] Contrato y respaldo:** contrastar Anexo I y documentación técnica para definir frecuencia y retención exigidas.
- [ ] **6.2 [E1] [P] Backups recurrentes:** acreditar programación, ubicación, retención y responsable.
- [ ] **6.3 [E1] [P] Restauración:** comprobar recuperación de copia en entorno aislado.
- [ ] **6.4 [E1] [V] Monitoreo operativo:** revisar alertas de fallas, disponibilidad y procedimiento de recuperación.
- [ ] **6.5 [E1] [P] Exportación de CEO Obras:** obtener proveedores, obras activas, OC abiertas y cantidades pendientes reales.
- [ ] **6.6 [E1] [P] Conciliación de transición:** comparar origen/destino e identificar duplicados o registros ambiguos.
- [ ] **6.7 [E1] [D] Fecha de corte:** acordar fin del uso operativo anterior para evitar duplicados.
- [ ] **6.8 [E1] [P] Archivo histórico:** conservar exportación verificable de operaciones no migradas.
- [ ] **6.9 [E1] [P] Migración operativa:** ejecutar solo datos aprobados, con respaldo previo y autorización explícita.
- [ ] **6.10 [E1] [V] Verificación posterior:** comprobar cantidades, accesos, OC abiertas y saldos.

**Criterio de cierre:** continuidad y recuperación acreditadas; transición conciliada y controlada. **Si V1 incorpora operaciones reales, adelantar las salvaguardas necesarias; la etiqueta E1 no las elimina.**

## Nivel 7 — Piloto, capacitación y aceptación final

**Complejidad:** muy alta.

- [ ] **7.1 [E1] [P] Prueba integral con obra real:** recorrido completo desde presupuesto hasta consumo e informes.
- [ ] **7.2 [E1] [P] Validación con Cómputo:** velocidad y exactitud de actividades, costos y presupuestos.
- [ ] **7.3 [E1] [P] Validación con Compras:** pedidos, cotizaciones, OC, recepciones y abastecimiento.
- [ ] **7.4 [E1] [P] Validación con Jefe de Obra:** móvil, pedidos, recepción, consumos y devoluciones.
- [ ] **7.5 [E1] [P] Validación con Gerencia y Administración:** visibilidades, indicadores, facturas informativas y consultas.
- [ ] **7.6 [E1] [P] Registrar observaciones:** clasificar bloqueantes, ajustes y mejoras opcionales.
- [ ] **7.7 [V1] [P] Corregir bloqueantes de la entrega:** resolver errores que impidan operar los circuitos de demostración de V1. Los bloqueantes del piloto deben resolverse también antes del cierre E1.
- [ ] **7.8 [E1] [P] Capacitación:** recorridos breves por perfil e instrucciones de uso.
- [ ] **7.9 [E1] [P] Aceptación operativa:** registrar conformidad de referentes de CEO.
- [ ] **7.10 [E1] [P] Habilitación definitiva:** acordar uso cotidiano, soporte y cierre formal de Etapa 1.

**Criterio de cierre:** sistema utilizado y aceptado por CEO en el circuito operativo real.

## Puerta de salida de Etapa 1

1. V1 validada y bloqueantes resueltos.
2. Datos de operación revisados y conciliados.
3. Respaldos recurrentes y restauración acreditados.
4. Transición CEO Obras completada o decisión documentada sobre los datos históricos.
5. Pruebas con referentes y capacitación suficientes.
6. Limitaciones aceptadas y mejoras posteriores registradas.
7. Conformidad de CEO sobre el alcance acordado.

**Resultado:** sistema habilitado para uso operativo y Etapa 1 formalmente cerrada.

---

## Resumen de alcance (79 objetivos originales; sin duplicar)

| Nivel | Área | V1 | E1 | Total |
|---|---|---:|---:|---:|
| 1 | Revisión general y ajustes menores | 10 | 0 | 10 |
| 2 | Reglas funcionales y permisos | 9 | 1 | 10 |
| 3 | Clientes, obras, catálogos y presupuestos | 12 | 1 | 13 |
| 4 | Compras, recepciones y stock | 15 | 1 | 16 |
| 5 | Datos reales y preparación operativa | 0 | 10 | 10 |
| 6 | Seguridad, continuidad y migración | 0 | 10 | 10 |
| 7 | Piloto, capacitación y aceptación | 1 | 9 | 10 |
| **Total** | | **47** | **32** | **79** |

**Orden de trabajo:** primero V1 (accesos → perfiles → cálculos y PDFs → compras/stock → reportes → prueba integral → corrección de bloqueantes); después completar datos reales, respaldo, transición, piloto, capacitación y aceptación de E1. Solicitar con anticipación exportaciones, obra piloto y evidencia de respaldos para evitar esperas.

**Regla final:** comprobar antes de programar; priorizar simplicidad funcional y trazabilidad. Este checklist sigue los objetivos, **no declara por sí solo que un entorno, función o contrato esté aprobado**.
