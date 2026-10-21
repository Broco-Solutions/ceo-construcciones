# PRD — CEO Construcciones · Etapa 1
**Versión:** 0.1 · Borrador para validación · 21/10/2026
**Estado:** NO APROBADO PARA DESARROLLO FUNCIONAL
**Responsable de aprobación:** dirección de proyecto Broco Solutions, con validación operativa de CEO Construcciones.
**Duración contractual:** 10 semanas desde primer pago y recepción de insumos/accesos requeridos.

## 1. Fuentes y criterio de alcance
Fuente contractual principal: Contrato Marco de Prestación de Servicios Informáticos, especialmente Anexo I — Etapa 1, ubicado en:
https://docs.google.com/document/d/1KAc0AJrNjK-miwRIr6Bc8NmOCUB0As1E/edit

Fuentes de relevamiento: carpeta de CEO, Excel de presupuesto, documentos de CEO Obras y presupuesto de Vivienda DG 1153:
https://drive.google.com/drive/folders/1WhUozFCgBwfvKZKVT6y5jnn5XOGG1cPl

Ante contradicción, prevalece el contrato. Los flujos y estados propuestos que no estén explícitos en el contrato son hipótesis de implementación a validar, no ampliaciones contractuales.

## 2. Problema y objetivo
CEO opera compras y pedidos en CEO Obras, presupuestos y análisis en Excel, y stock disperso en galpón, patio y obras. La información no permite controlar de forma integral lo previsto, pedido, comprado y consumido.

Se desarrollará una plataforma web con la OBRA como entidad central. El flujo principal va desde el cómputo y presupuesto hasta necesidades de materiales, solicitudes, cotizaciones, órdenes de compra, recepción, movimientos de stock y reportes. Se prioriza facilidad de uso desde PC y celular. La solución reemplazará gradualmente el circuito actual de pedidos y órdenes de compra de CEO Obras.

## 3. Usuarios y permisos
Roles contractuales iniciales:
- Cómputo y Presupuesto: administra análisis, precios y presupuestos según permisos aprobados.
- Compras: gestiona proveedores, solicitudes, cotizaciones, órdenes de compra y recepciones.
- Jefe de Obra: solicita materiales, consulta su obra y registra movimientos operativos de stock autorizados.
- Gerencia: consulta transversal y administra operaciones según matriz de permisos acordada.

Los permisos deben verificarse del lado del servidor. La asignación concreta de usuarios, acceso por obra, posibilidad de editar presupuestos, ajustes de stock y autorización de compras quedan por validar. No asumir que todos los miembros de un rol tienen acceso irrestricto.

## 4. Requisitos funcionales

### RF-01. Obras
- Crear, modificar y consultar obras, su estado, responsables y datos generales.
- Permitir hasta 10 obras activas en el alcance inicial.
- Relacionar cada presupuesto, pedido, orden de compra y movimiento de stock con la obra correspondiente cuando aplique.

### RF-02. Usuarios, autenticación y permisos
- Inicio y cierre de sesión con credenciales individuales.
- Administración de usuarios y roles.
- Autorización por operación y, cuando corresponda, por obra.
- Registro mínimo de autor, fecha y acción para cambios relevantes.

### RF-03. Catálogo de materiales y proveedores
- Materiales identificados mediante ID interno único, nombre, unidad de medida, rubro/categoría y estado.
- Distinguir unidad de consumo de presentación de compra; normalizar conversiones aprobadas.
- Precios editables con fecha, proveedor y criterio de impuestos confirmado.
- Proveedores con datos de contacto necesarios para compras.
- Importación inicial desde archivos facilitados por CEO y posibilidad de exportación.
- Considerar hasta 250 artículos en la carga inicial acordada.

### RF-04. Análisis unitarios
- Definir y editar cada ítem de trabajo: código interno, descripción, unidad de trabajo y rubro.
- Por unidad de trabajo, asociar N materiales con coeficiente de consumo y unidad.
- Calcular costo unitario de materiales = suma(consumo por unidad × precio unitario normalizado).
- Registrar mano de obra como importe por ítem, sin cálculo de jornales.
- Total unitario = costo unitario de materiales + mano de obra informada.
- Permitir reproducir los análisis pertinentes del Excel, no sus hojas, macros o fórmulas ajenas al alcance.
- Ítems sin análisis/materiales completos requieren advertencia y validación, no estimación automática.

### RF-05. Cómputos, presupuestos y versiones
- Crear presupuesto asociado a obra y versión.
- Agregar rubros e ítems de análisis, cargar cantidades medidas y calcular subtotales y total de obra.
- Generar listado consolidado de materiales requeridos: suma de cantidades de cada ítem × consumos unitarios.
- Mostrar desglose de materiales y mano de obra.
- Guardar versiones sin perder la trazabilidad de las anteriores.
- Exportar información relevante a Excel.
- Pendiente: definir bases de precios/impuestos, tratamiento de versiones aprobadas y redondeos.

### RF-06. Pedidos de materiales
- Desde la obra, solicitar materiales, cantidades y fecha requerida, vinculando obra y rubro cuando proceda.
- Consultar disponibilidad de stock al crear/revisar el pedido, por ubicación.
- Identificar materiales que pueden cubrirse con existencias y faltantes susceptibles de compra.
- Registrar estados, responsables e historial de cambios. Estados definitivos a validar con usuarios de CEO.

### RF-07. Cotizaciones
- Registrar ofertas de varios proveedores para las necesidades del pedido.
- Comparar precio, moneda cuando aplique, disponibilidad/plazo y observaciones.
- Registrar la elección del proveedor con trazabilidad.
- No se requiere envío automático de solicitudes ni integraciones externas.
- Pendiente: definir cómo comparar distintas monedas sin introducir cotizaciones automáticas fuera de alcance.

### RF-08. Órdenes de compra
- Crear orden asociada a proveedor y, cuando aplique, obra y pedido.
- Numeración única y PDF imprimible/compartible manualmente.
- Detallar materiales, cantidades y precios pactados.
- Gestionar emisión, recepción parcial/total y anulación con trazabilidad.
- No implementar facturación, autorización de pagos ni conciliación financiera.

### RF-09. Recepciones y remitos
- Registrar una o varias recepciones por orden, con cantidades recibidas por renglón, fecha y referencia de remito.
- Mantener cantidades pendientes de recibir.
- Asociar la recepción a una ubicación de destino; generar ingreso de stock correspondiente.
- Pendiente: definir si remito requiere foto/PDF adjunto o basta un número/referencia.
- Evitar duplicación de recepción y sobre-recepción accidental.

### RF-10. Stock por ubicación
- Ubicaciones mínimas: galpón, patio y obras.
- Carga inicial desde inventario contado y suministrado por el cliente.
- Mostrar stock disponible por artículo y ubicación al preparar pedidos.
- Registrar ingresos, transferencias entre ubicaciones, consumos, devoluciones y ajustes con motivo y actor.
- Alertas visuales dentro de la plataforma por stock mínimo configurable.
- Historial auditable de movimientos.
- Pendiente: política de stock negativo, responsable de aprobación de ajustes y tratamiento de reservas.

### RF-11. Seguimiento e informes
- Comparar por obra, rubro y material los cuatro indicadores: previsto, pedido, comprado y consumido.
- Mostrar necesidades pendientes, desvíos de cantidad y evolución de órdenes.
- Exportar reportes a Excel.
- Mantener clara la distinción entre material comprado, recibido y efectivamente consumido.

### RF-12. Transición desde CEO Obras
- Importación acordada de proveedores, obras activas y órdenes de compra abiertas.
- Historial completo anterior conservado como archivo exportado, no integrado de forma automática a la base nueva.
- Convivencia temporal de ambas aplicaciones durante primeras semanas de uso.
- La nueva plataforma sustituye el circuito operativo de pedidos y órdenes de compra de CEO Obras, sin integración automática entre ambos sistemas.
- La disponibilidad y calidad del export para migración requieren confirmación.

### RF-13. Experiencia de uso
- Interfaz en español, sencilla, consistente y adaptada a computadora y celular.
- Priorización de flujos móviles para los jefes de obra: consultar, pedir y registrar movimientos autorizados.
- Acceso con conexión a internet; no se requiere modo offline ni aplicación móvil nativa.

## 5. Reglas transversales propuestas (pendientes de validación donde corresponda)
- Mantener unidades coherentes: consumo, presentación de compra, cantidad recibida y cantidad física deben poder convertirse o relacionarse explícitamente.
- Cada ítem de análisis debe tener un identificador interno único, porque los códigos del Excel se repiten.
- Precios históricos y consumos usados para presupuestos/versiones deben conservar contexto para permitir auditoría; el momento exacto de congelamiento requiere validación.
- Usar aritmética decimal y reglas de redondeo consistentes. No calcular ventas ni márgenes.
- No aceptar importaciones con material ambiguo, cantidades inválidas ni referencia inexistente sin reporte de errores.
- Los movimientos que alteran existencias deben ejecutarse de manera atómica en PostgreSQL.

## 6. Arquitectura y coordinación de agentes
Repositorio único: https://github.com/Broco-Solutions/ceo-construcciones
- apps/api: Next.js Route Handlers / TypeScript, Prisma, PostgreSQL y Railway. Responsable de dominio, permisos, validaciones, migraciones, importaciones, PDF backend cuando corresponda y contratos OpenAPI.
- apps/web: Next.js / TypeScript desplegado en Vercel. Responsable de UX, navegación, formularios, reportes visuales y comunicación con la API.
- Codex trabaja principalmente en apps/api y contratos de API; Claude Code principalmente en apps/web. Ninguno cambia unilateralmente el dominio del otro.
- Usar ramas/PR separados por tarea; no desarrollar nuevas funcionalidades sin criterios de aceptación claros.
- Bucket compatible con S3 en Railway solo si se confirma carga de remitos u otros adjuntos. No añadir servicios auxiliares sin necesidad.

## 7. Requisitos no funcionales y contractuales
- Acceso individual, autorización efectiva por rol y registro de operaciones.
- Backups automáticos al menos semanales, retención mínima de 30 días desde producción, monitoreo básico.
- Objetivo contractual de disponibilidad mensual 99,5 %, con exclusiones pactadas.
- Exportabilidad de base y archivos del cliente en formato abierto/utilizable; código y documentación transferibles según contrato.
- Secretos fuera del repositorio, TLS, validación del servidor y pruebas de los flujos críticos.
- No utilizar datos confidenciales del cliente fuera de la finalidad autorizada ni introducirlos sin necesidad en prompts, logs o commits.
- Revisión de seguridad y recuperación de datos antes de liberar a usuarios reales.

## 8. Entregables y criterios de aceptación
1. Usuarios de roles aprobados ingresan y solo ejecutan las operaciones autorizadas.
2. Se puede dar de alta una obra y vincularle un presupuesto versionado.
3. Dado un análisis unitario validado, la app reproduce su costo de materiales y total unitario; prueba de referencia: CERCO DE OBRA del Excel (materiales $12.146,87; mano de obra $3.334,20; total $15.481,07), sujeto a confirmación de base impositiva y vigencia de precios.
4. Dadas cantidades de una obra, se genera listado consolidado de materiales por artículo/unidad; se verifican unidades y conversiones.
5. Un jefe de obra puede crear solicitud; Compras consulta stock, registra cotizaciones, elige proveedor y emite OC numerada PDF.
6. Recepciones parciales actualizan pendientes y stock en la ubicación correcta; la trazabilidad es consultable.
7. Se registran transferencias, consumos, devoluciones y ajustes; hay alertas de mínimos.
8. El informe por obra muestra previsto/pedido/comprado/consumido y se puede exportar.
9. Se importan proveedores, obras activas y OC abiertas acordadas desde CEO Obras; histórico queda exportado.
10. Piloto con una obra real, carga inicial acordada, capacitación a usuarios clave, puesta en producción y acompañamiento inicial.
11. Backups y permisos verificados antes de la puesta en producción.

## 9. Fuera de alcance de la Etapa 1
- Integraciones automáticas con CEO Obras, Hollistor u otros terceros.
- Facturación y carga de facturas, pagos a proveedores, tesorería y conciliaciones.
- Certificación de avance de obra e indexación CAC automática.
- Cálculo de mano de obra por jornales, costos indirectos, coeficientes de venta o rentabilidad.
- RR. HH., asistencia, subcontratistas y mantenimiento de vehículos.
- Códigos de barras, lectores, RFID, offline, valorización contable del stock.
- WhatsApp/email automático, IA aplicada al producto, aplicaciones móviles nativas.
- Migración histórica completa o recuento físico del stock por Broco.

## 10. Pendientes de validación con CEO
P1. Criterio de precio sin/con IVA para los análisis y presupuestos; el Excel mezcla ambos.
P2. Confirmar unidades y conversiones para artículos por bolsa, m², m³, kg, rollo, etc.; depurar precio cero y códigos duplicados.
P3. Entregar un Excel editable de presupuesto real con cantidades cargadas y una lista de materiales esperada, para pruebas de equivalencia.
P4. Validar matriz de permisos detallada y quién autoriza presupuestos, ajustes, compras y recepciones.
P5. Confirmar estados del pedido/OC, entrega al galpón vs. obra, remito como número o archivo y proceso de consumo en obra.
P6. Definir cómo se comparan cotizaciones en distintas monedas.
P7. Definir export/formatos reales disponibles de CEO Obras, corte de migración y responsables de aprobación del piloto.

**Nota:** este borrador no autoriza implementación automática. Después de validar los puntos que afecten cálculos y flujos, aprobar por módulo y derivar tareas separadas a Codex y Claude Code.
