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

- [ ] **1.1 [V1] [V] Acceso al sistema:** comprobar que el dominio público, inicio de sesión y cierre de sesión funcionan correctamente.
  - Estado: Bloqueado (validación parcial) | Responsable: Codex / revisión Broco Solutions | Fecha: 2026-11-16 | PR: [#22](https://github.com/Broco-Solutions/ceo-construcciones/pull/22) | Evidencia: GET HTTPS público `/login` 200 y `/api/v1/auth/me` anónimo 401, TLS válido y sin login online; web 60/60, incluidos `login-ui.test.tsx` 3/3 y `proxy.test.ts` 3/3 (cookies separadas, Retry-After y error 502); API 65 aprobadas / 150 omitidas, incluidos `security.test.ts` 5/5, `login-protection.test.ts` 4/4 y el caso sin BD de `access-contract.integration.test.ts` 1/1. | Observaciones: los verificadores locales api/web/e2e rechazaron iniciar por ausencia de `~/.local/state/ceo-construcciones-codex/local.env`; Docker informa integración WSL no disponible. No se verificaron login real local, persistencia, redirecciones, logout, sesión vencida/inválida ni 429 integrado. Cookies/origen comprobados parcialmente en unitarias; no equivalen a sesión real. Sin defecto de aplicación reproducido ni cambio de código.
- [ ] **1.2 [V1] [V] Usuarios y perfiles:** probar los cinco perfiles: Gerencia, Cómputo/Presupuestos, Compras, Jefe de Obra y Administración Restringida.
  - Estado: Bloqueado (validación parcial) | Responsable: Codex / revisión Broco Solutions | Fecha: 2026-11-16 | PR: [#22](https://github.com/Broco-Solutions/ceo-construcciones/pull/22) | Evidencia: inspección de `identity.ts`, `session.tsx`, `permissions.ts`, `shell.tsx` y auxiliares E2E; `permissions.test.ts` 3/3 dentro de web 60/60. Los cinco roles y denominaciones existen; `SidebarUser` usa nombre y `ROLE_LABEL`. | Observaciones: falta PostgreSQL aislado por preparación local e integración Docker/WSL no disponibles; no se ejecutaron accesos/cierres ni reconocimiento visual de los cinco perfiles sintéticos. `auth.spec.ts` cubre navegación de cuatro perfiles y `closure.spec.ts` incluye acceso de Administración, pero no se ejecutaron en esta misión. Sin auditoría funcional profunda ni modificaciones de roles/permisos.
- [ ] **1.3 [V1] [V] Menú y navegación:** revisar que cada usuario encuentre fácilmente sus funciones habituales.
  - Estado: Bloqueado (validación parcial) | Responsable: Codex / revisión Broco Solutions | Fecha: 2026-11-16 | PR: [#22](https://github.com/Broco-Solutions/ceo-construcciones/pull/22) | Evidencia: inspección de `NAV`, `PERMS`, `useNavItems`, `NavLinks`, `AppShell` y layouts; `permissions.test.ts` 3/3. Cada href de NAV tiene página existente y figura en el build web aprobado. El filtro excluye enlaces económicos del Jefe y limita Administración a `/administracion` y `/recepcion-delegada`; el logo enlaza al inicio. | Observaciones: inspección estática y unitarias parciales; sin ejecutar navegación real por perfil, conservación de sesión, sección activa y apertura/cierre/navegación del menú móvil. E2E bloqueado por preparación local/Docker WSL no disponibles. No se revisó 1.4 ni se rediseñó el menú.
- [ ] **1.4 [V1] [V] Experiencia móvil:** recorrer las principales pantallas desde un celular.
- [ ] **1.5 [V1] [V] Formularios y mensajes:** identificar campos confusos, validaciones difíciles de interpretar y acciones innecesarias.
- [ ] **1.6 [V1] [V] Buscadores, filtros y tablas:** comprobar búsquedas, paginación, selección múltiple y exportaciones principales.
- [ ] **1.7 [V1] [V] PDF de presupuestos:** revisar presentación, encabezados, cantidades, subtotales, totales y condiciones comerciales.
- [ ] **1.8 [V1] [V] PDF de órdenes de compra:** revisar proveedor, destino, materiales, cantidades, precios y formato.
- [ ] **1.9 [V1] [P] Protección de accesos:** revisar que no permanezcan credenciales vigentes expuestas en documentación compartida.
- [ ] **1.10 [V1] [P] Registrar hallazgos:** preparar una lista de errores o mejoras menores, evitando duplicados.

**Criterio de cierre:** sistema accesible, navegable y presentable, sin problemas que impidan las tareas principales.

## Nivel 2 — Reglas funcionales y permisos

**Complejidad:** baja a media. **Objetivo:** confirmar autorizaciones y reglas básicas.

- [ ] **2.1 [V1] [V] Permisos de Gerencia:** acceso completo a la administración y módulos incluidos.
- [ ] **2.2 [V1] [V] Permisos de Cómputo/Presupuestos:** acceso a actividades, costos, cómputos, presupuestos y referencias autorizadas.
- [ ] **2.3 [V1] [V] Permisos de Compras:** proveedores, precios, pedidos, cotizaciones, OC y stock autorizado.
- [ ] **2.4 [V1] [V] Permisos de Jefe de Obra:** acceso únicamente a obras asignadas y sin exposición de precios o costos internos.
- [ ] **2.5 [V1] [V] Permisos de Administración Restringida:** gestión informativa de factura/pago y recepciones expresamente delegadas, sin acceso económico general.
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
