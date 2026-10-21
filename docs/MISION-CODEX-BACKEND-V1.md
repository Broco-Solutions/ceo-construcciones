# MISIÓN ÚNICA PARA CODEX — BACKEND V1 COMPLETO
**Proyecto:** CEO Construcciones
**Objetivo:** implementar de punta a punta el backend y la base de datos de la Etapa 1, con autonomía y subagentes cuando estén disponibles, y entregar **un PR listo para revisión**. NO implementar frontend.
**Estado de la misión:** preparada para ejecutar; aún no es evidencia de código implementado.
**Repositorio:** https://github.com/Broco-Solutions/ceo-construcciones

## INSTRUCCIÓN PRINCIPAL
Actuá como tech lead ejecutor. Tu misión no es limitarte a proponer arquitectura ni hacer un scaffold: **implementá todos los módulos de backend contratados para la V1**, sus relaciones, migraciones, validaciones, documentación, tests y herramientas de importación/exportación. Organizate internamente en fases y **usá subagentes en paralelo si tu entorno permite subagentes**. No esperes prompts independientes por módulo y no detengas el trabajo en cada hito. Si no existe función de subagentes, ejecutá con el mismo plan en secuencia.

**Resultado esperado:** un backend REST comprobable, seguro, coherente, sin datos de cliente inventados y listo para revisión e integración con el frontend que hará Claude Code. No declarar "listo para producción" sin probar migraciones, back-ups, datos reales y recorridos end-to-end.

## 0. PREPARACIÓN OBLIGATORIA
1. Cloná/abrí el repo y leé COMPLETOS:
   - README.md
   - AGENTS.md
   - docs/PRD-ETAPA-1.md (**v1.0, fuente funcional**)
   - docs/ANALISIS-EXCEL-PRESUPUESTOS.md
   - docs/ESTADO-PROYECTO.md
   - docs/INSTRUCCIONES-PROYECTO-CHATGPT.md
2. Comprobá la estructura real y el stack existentes antes de generar código. Respetá **Next.js/TypeScript** para apps/api, **Prisma 6/PostgreSQL** y monorepo **pnpm**. Node.js 24 según README. Mantener el deployment en Railway y el servidor standalone con healthcheck existente.
3. La fuente contractual prioritaria es el **Contrato con Anexo I** referenciado en PRD. En caso de contradicción, no inventes ampliaciones. El PRD v1.0 fue cerrado internamente, pero contiene validaciones pendientes de CEO.
4. Creá la rama de trabajo `feat/backend-v1` desde `main` (si ya existe, usá la rama existente coherentemente, sin pisar cambios ajenos). **No commits directamente a main**, no merge automático ni deployment manual a producción.
5. Escribí un plan verificable y persistente en `docs/PLAN-IMPLEMENTACION-BACKEND-V1.md`: fases, tareas, dependencias, subagentes, owners de archivos y criterios de prueba. Usá ese archivo para retomar si el contexto se agota. La planificación es el comienzo: **seguí ejecutando la implementación**.

## 1. ARQUITECTURA NO NEGOCIABLE
- Monorepo: `apps/api` = backend y lógica de dominio; `apps/web` = frontend de Claude Code.
- **NO modificar `apps/web`**; si algo es necesario para sesión/proxy, especificá en documentación la tarea para Claude Code.
- Next.js Route Handlers, API REST versionada bajo `/api/v1` salvo healthcheck existente `/api/health`. Tipado estricto, DTOs/validaciones robustas.
- PostgreSQL (única base de datos) con Prisma y migraciones versionadas. No usar `prisma db push` en producción.
- No añadir NestJS, Redis, colas, microservicios, event buses, ORMs alternativos, otro backend ni servicios pagos sin aprobación.
- Las reglas de negocio, checks de rol/obra, integridad y cambios de stock viven **en el backend**.
- Definir errores normalizados, paginación simple, timestamps ISO UTC y aritmética decimal para unidades/precios; frontend presentará fechas en zona local.
- Sin almacenar documentos en esta V1: generar PDF de OC bajo demanda, guardar solo referencia textual de remito y número de factura. No crear bucket.
- Diseño para una empresa única, no multi-tenant genérico.

## 2. COORDINACIÓN DE SUBAGENTES / OWNERSHIP
Usá hasta 5–6 frentes independientes y un **integrador principal**. No generes decenas de agentes que multipliquen conflictos.
- **Integrador/arquitectura (único dueño):** esquema Prisma, migraciones, contratos/DTOs compartidos, decisiones transaccionales y rutas comunes. Definí primero entidades/interfaces fundamentales.
- **Agente A — identidad, RBAC, obras y auditoría:** auth, roles, permisos por obra, operaciones registradas.
- **Agente B — catálogos, APU, cómputos y presupuestos:** materiales, proveedores, precios, análisis unitarios, snapshots de versiones, importación tabular.
- **Agente C — pedidos, cotizaciones, OC y remitos:** flujo de compras, PDF, referencias de factura, recepciones.
- **Agente D — ubicaciones, stock, reservas, transferencias, consumos:** reglas consistentes y transacciones.
- **Agente E — reportes, exportaciones, pruebas transversales, OpenAPI y documentación.**

Dependencias: el integrador fija primero el modelo y contratos comunes; después delega archivos no superpuestos. **Nunca permitir ediciones concurrentes del mismo `schema.prisma`, migraciones o contratos OpenAPI** sin reconciliación por el integrador. Ante un choque, resolverlo antes de seguir. Es responsabilidad del integrador entregar un solo backend coherente que compile y pase pruebas, no 5 implementaciones aisladas.

## 3. MÓDULOS FUNCIONALES A IMPLEMENTAR

### 3.1 Autenticación, usuarios y permisos
- Login/logout con credenciales por usuario. No registro público de cuentas.
- Passwords con hashing moderno, sesiones de servidor revocables, cookies HttpOnly/Secure/SameSite apropiadas, expiración, tratamiento CSRF y políticas básicas contra fuerza bruta; sin tokens persistidos en localStorage.
- **Cuatro roles en tres niveles:** GERENCIA; COMPRAS; COMPUTO_PRESUPUESTOS; JEFE_OBRA.
- Gerencia administra y ve módulos de V1; Compras gestiona su circuito; Cómputo gestiona precios/APU/presupuestos; Jefe de Obra solo sus obras, puede pedir/recibir/consumir según permisos.
- **Un Jefe de Obra no accede a información económica** ni a otra obra usando IDs manuales o llamadas directas a API.
- Crear administración simple de usuarios/asignaciones a obras y un bootstrap de cuenta inicial mediante variables/CLI **sin credenciales predeterminadas ni secretos en Git**.
- Matriz de acciones más fina queda parametrizable/delimitada por permisos sensatos, documentando lo que requiere aprobación operativa de CEO.

### 3.2 Obras
- CRUD, responsable(s), estado, asignaciones a usuarios y relación con presupuesto, pedidos, stock.
- Contrato contempla hasta 10 obras activas como alcance de operación, **no limitar artificialmente la cantidad de registros por código**.

### 3.3 Materiales, unidades, presentaciones, proveedores y precios
- Catálogo de materiales con ID interno único, descripción, rubro/categoría, unidad base, estado.
- Proveedores; relación materiales/proveedores con precios y fecha; presentación de compra diferente de unidad de consumo, conversiones explícitas y verificables.
- Precios de referencia con distinción de IVA y moneda **sin fingir una política fiscal que CEO aún no validó**.
- Evitar registros duplicados y precios inválidos. Import/export vía plantillas estándar CSV/XLSX con validación previa, reporte de errores y proceso idempotente o control de duplicados.
- Los datos originales heterogéneos (PDF de proveedores o `.xls` legado) pueden normalizarse externamente antes de importar: **NO desarrollar IA interna ni parser universal de PDF**.

### 3.4 Análisis de precios unitarios (APU) y presupuestos
- Rubros, ítems constructivos y APU editables.
- Consumos unitarios **ingresados por usuario** (p.ej. 4,5 kg de cemento/1 m² cielorraso); NO deducir recetas desde ingeniería/plano ni copiar todas las fórmulas/hojas Excel.
- Costo materiales = suma(coeficiente × precio del material normalizado); costo de mano de obra = **importe unitario**; costo total por unidad = ambos.
- Separar **cómputo de cantidades** de **cálculo de presupuesto**; presupuesto versionado con ítems, cantidades, rubros, precios y costos congelados por versión.
- Permitir sobrescribir material y mano de obra a nivel de versión de presupuesto sin modificar catálogo general ni revaluar versiones históricas.
- Consolidar BOM/lista prevista por material y unidad = suma coeficiente × cantidad de cada ítem.
- Usar `Decimal`, redondeos documentados, reglas sobre IVA que exijan campo explícito o queden configurables. No calcular jornales, coeficientes de venta, costos indirectos ni rentabilidad.
- Crear pruebas numéricas con datos conocidos del PRD y del análisis Excel; advertir si faltan inputs para validar presupuesto real.

### 3.5 Pedidos y cotizaciones
- Solicitudes de materiales para obra/rubro con fecha requerida, solicitante, líneas, cantidades y estados básicos.
- Comparar necesidad presupuestada, pedido acumulado y existencias disponibles.
- Registrar varias cotizaciones de distintos proveedores, plazo y precio/currency; comparación manual y selección trazable. Para monedas incompatibles no inventar una tasa automática.
- Desde el pedido, proponer resolver cada faltante por **reserva y posterior transferencia** de inventario o por **compra**, incluso combinación; nunca comprar automáticamente.

### 3.6 Órdenes de compra
- Numeración única y robusta ante concurrencia; proveedor, ítems, precios, estados, PDF exportable sin bucket y auditoría.
- OC de obra, enlazada a pedido cuando aplique, **o OC general sin obra** para reponer galpón/patio, siempre con destino identificado.
- Estados mínimos borrador/emitida/parcialmente recibida/recibida/anulada, con reglas verificables, sin inventar autorización de pago.
- **Únicamente número de factura + timestamp automático de carga + usuario** asociado a la OC, cargado después de pago externo; no entidad factura contable, no adjuntos, no pagos, no saldos.
- El estado de recepción y la referencia de factura son independientes.

### 3.7 Recepción y remitos
- Recepciones totales/parciales por renglón de OC, cantidades y referencia de remito.
- Ingreso físico al destino real (galpón, patio u obra), actor y timestamp; puede registrar Compras, Gerencia o Jefe de Obra autorizado.
- Cada recepción es transaccional e idempotente frente a reintentos o doble confirmación: actualizar pendiente y stock **una sola vez**.
- No aceptar sobre-recepción no autorizada ni stock duplicado.
- No realizar contabilidad ni anexar fotos/PDF de facturas.

### 3.8 Stock, reservas y movimientos
- Ubicaciones: galpón, patio, y una por obra. Carga inicial desde recuento aportado por CEO.
- Cantidad **física**, **reservada** y **disponible = física − reservada** por material y ubicación.
- Reserva simple vinculada a pedido/obra, reduce disponible y **no reduce físico**; verificar disponibilidad con bloqueo/transacción frente a concurrencia. Liberación/cancelación auditable.
- Transferencia con confirmación: descontar físico origen, ingresar físico destino y saldar reserva aplicable sin doble descuento.
- Consumo desde ubicación obra, devolución, ajuste con motivo, ingreso por recepción; historia append-only/auditable.
- No permitir saldos negativos por caminos normales. Si operación incorrecta: error explícito, no compensación silenciosa.
- Alerta visual simple por mínimo configurable por material/ubicación; sin orden de compra automática.
- Sin FIFO/valorización contable, lotes, serialización, lectores, offline ni logística pesada.

### 3.9 Seguimiento, reportes y Excel
- Informes por obra, rubro, material: **previsto, pedido, comprado, recibido (si corresponde) y consumido** en cantidades consistentes.
- No confundir costo presupuestado con costo real total, ni mostrar rentabilidad o porcentaje de avance global inventado.
- Exportación a Excel/CSV para los reportes relevantes y datos en formatos abiertos/utilizables.
- Mantener query eficiente con paginación en vistas grandes.

### 3.10 CEO Obras: migración inicial sin sincronización
- Entregar **formatos de importación y scripts reproducibles** para proveedores, obras activas y OC abiertas; incluir preview/dry-run, validación, mapeo, reporte de errores y repetición segura.
- Entregar procedimiento de exportación/archivo histórico que quedará fuera de nueva BD.
- Si faltan archivos de extracción o acceso a CEO Obras, crear adapters/plantillas y tests con datos sintéticos. **Marcar la migración real como PENDIENTE DE DATOS DEL CLIENTE**, no inventarla ni afirmar que se ejecutó.
- No sincronización automática con sistema viejo o Hollistor; no migrar histórico completo.

## 4. MATRIZ MÍNIMA DE ACEPTACIÓN (AUTOMATIZAR PRUEBAS)
Las pruebas deben funcionar en base local/efímera, **nunca con la base productiva de Railway**:
1. Gerencia CRUD obra. Jefe no puede acceder a otra obra ni a precios aunque invoque la API a mano.
2. APU: consumos 4,5 kg cemento, 6,6 kg cal, 0,07 m³ arena para 1 m²; presupuesto de 100 m² → 450 kg, 660 kg, 7 m³. Probar ajuste puntual de precio y snapshot histórico inmutable.
3. Versiones de presupuesto y BOM consolidados con más de un ítem que consume el mismo material.
4. Solicitud/cotizaciones y OC con numeración única ante creación simultánea; también OC **sin obra** con destino galpón/patio.
5. OC parcial 10 pedidas, 4 recibidas con remito: stock sube 4, quedan 6 pendientes; reintento no vuelve a sumar 4. La referencia factura con número y fecha de carga no altera inventario.
6. Saldo ejemplo: físico 120, reservado 30 → disponible 90. Reservar 60 → físico 120, reservado 90, disponible 30; transferir 60 mueve físico, salda reserva y deja el saldo correcto en origen/destino.
7. Dos solicitudes concurrentes no generan sobre-reserva; no inventario negativo ni movimiento duplicado.
8. Consumo y devolución en obra actualizan inventario y reporte previsto/pedido/comprado/consumido sin doble contabilización.
9. Mínimo: el nivel configurado produce estado de alerta consultable, no compra automática.
10. Importador rechaza duplicados, IDs faltantes, unidad inconsistente y números inválidos; reimportación controlada.
11. Errores 401/403/404/409 correctamente aplicados; auditoría registra actor/timestamp.
12. API `/api/health` y ruta de readiness para BD si es necesaria, build y migraciones verificadas.

## 5. OPENAPI E INTEGRACIÓN PARA CLAUDE CODE
- Versionar especificación OpenAPI completa en `docs/openapi.yaml` (o `json`) y asegurar correspondencia con endpoints reales.
- Documentar autenticación, scopes por rol/obra, paginación, filtros, cuerpos, errores, ejemplos seguros, DTOs y endpoints para reportes.
- Crear `docs/CONTRATO-FRONTEND.md` con los flujos y dependencias de cada pantalla, sin crearla.
- **Sesión entre Vercel web y Railway API:** priorizar un modelo de sesión HttpOnly con proxy same-origin `/api/*` en Vercel; documentar configuración/rewrite necesaria para Claude Code. No depender de cookies third-party entre `vercel.app` y `railway.app`; no colocar JWT en localStorage. Resolver origin/CSRF de forma compatible con proxy.
- Generar ejemplos de peticiones o colección de API para que frontend e integrador prueben el circuito sin interfaz gráfica.

## 6. CALIDAD, CI Y SEGURIDAD
- Comandos reproducibles: install, lint/typecheck, tests unitarios/integración, build API, migración a DB local; incorporar scripts faltantes del repo.
- `pnpm-lock.yaml` commiteado; versiones compatibles con Node y Railway standalone. No dejar `pnpm start` como requisito dentro de un contenedor runtime sin pnpm; conservar arranque existente.
- CI GitHub Actions liviano si falta, con PostgreSQL efímero, sin secretos reales, ejecutando las pruebas disponibles.
- Autorización en cada endpoint sensible, nunca solo frontend. Sanitización/validación de input. Cuidado con PDF injection, logs con PII y subida de archivos.
- Precaución con transacciones Prisma concurrentes y restricciones DB para saldos; explicar elección y probar.
- No usar datos reales de CEO en tests, commits, pantallas ficticias ni servidores públicos.
- Documentar estrategia de backups semanales/30 días y proceso de restauración (contractual). **No afirmar que backups están configurados ni que fueron probados** si no se verifican en Railway.
- Mantener observabilidad básica sin añadir infraestructura pesada.

## 7. AUTONOMÍA Y PUNTOS DE BLOQUEO
- **NO pedir aprobación cada 30 minutos ni después de cada módulo.** Continuar hasta lograr el entregable integral en la misma misión.
- Decisiones técnicas menores: elegí la alternativa más sencilla y dejá un ADR breve si tiene efecto relevante.
- Datos/reglas externas faltantes (Excel real con cantidades, IVA exacto, presentación/unidades, privilegios finos, export legacy, estados definitivos): diseñá para configuración o validación explícita, documentá `PENDIENTE CEO` y pruebas sintéticas, pero no inventes el contenido.
- Si una decisión sí bloquea la exactitud de un módulo, implementá la estructura y partes no ambiguas, registrá qué no queda validado y seguí con otros módulos. Preguntá solo por bloqueos verdaderamente irresolubles dentro del entorno.
- **Prohibido aplicar migraciones a Postgres de PRODUCCIÓN, limpiar tablas, seed de cliente, o cambiar Railway/Vercel productivos sin consentimiento explícito adicional.** Probá contra DB local/test; entregá procedimiento seguro para pasar a producción cuando se autorice.
- Un pipeline verde no equivale a puesta en producción ni validación del piloto. Lo que requiera datos de CEO debe figurar pendiente.

## 8. ENTREGABLES Y DEFINICIÓN DE TERMINADO
La misión solo puede declarar backend V1 listo para revisión cuando:
- [ ] Modelo Prisma coherente y migraciones probadas en BD de desarrollo/test.
- [ ] Endpoints REST completos de los módulos de arriba, con RBAC, validación y respuestas homogéneas.
- [ ] Reglas de APU/presupuesto versionado y BOM calculadas y probadas.
- [ ] Pedidos, ofertas, OC/PDF, referencia de factura, recepciones y movimientos de inventario probados con casos reales de lógica (fixtures sintéticos).
- [ ] Stock reservado/transferido/consumido consistente ante concurrencia.
- [ ] Importadores plantillas y exportadores reproducibles; distinguir importación de datos reales aún pendiente.
- [ ] OpenAPI y contrato para Claude Code completos.
- [ ] Tests y build pasando; CI si es viable, sin acceso a base productiva.
- [ ] `docs/ESTADO-PROYECTO.md` actualizado **en la rama** con módulos hechos, links PR y verificaciones; `docs/PLAN-IMPLEMENTACION-BACKEND-V1.md` actualizado con conclusiones.
- [ ] Lista explícita y acotada de pendientes de validación CEO, riesgo de deploy y pasos de rollback.
- [ ] Un único PR `feat/backend-v1` → `main` listo para que lo revise el usuario. **No hacer merge**.

**Reporte final de Codex (obligatorio):**
1. PR y commits principales.
2. Lista concreta de módulos implementados y endpoints disponibles.
3. Resultado de comandos de prueba, cantidad de tests, migraciones y build.
4. Decisiones técnicas importantes sin sobreingeniería.
5. Qué no pudo verificarse por falta de datos externos; diferenciar pendiente funcional de pendiente de aceptación.
6. Procedimiento de revisión local y deploy seguro posterior, sin ejecutarlo.
7. Qué necesita Claude Code para implementar el frontend sin reinterpretar backend.

## 9. COMENZÁ YA
Después de leer fuentes y verificar repo: creá rama y plan, coordiná subagentes y **seguí hasta entregar el PR integral**. No pares tras diseñar arquitectura, configurar CI o hacer un solo módulo. No esperes otro prompt del usuario por cada fase.
