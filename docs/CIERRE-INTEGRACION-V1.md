# Cierre backend de integración V1 — issue #3

Fuentes leídas: [issue #3](https://github.com/Broco-Solutions/ceo-construcciones/issues/3) y los [14 hallazgos de FRONTEND-V1.md](https://github.com/Broco-Solutions/ceo-construcciones/blob/9f3a898/docs/FRONTEND-V1.md) de la rama `claude/ceo-v1-frontend`. Implementación exclusivamente en `codex/ceo-v1-backend`, [PR #1](https://github.com/Broco-Solutions/ceo-construcciones/pull/1). El PR #2 sigue siendo responsabilidad de Claude Code. Sin merge, despliegue, acceso a producción ni cambios en apps/web. No requiere migración Prisma ni servicios nuevos.

## Disposición de los 14 hallazgos originales

| Nº | Hallazgo | Resolución backend / decisión |
| --- | --- | --- |
| 1 | Destino de devolución de Jefe | GET /locations incluye sus ubicaciones completas y sólo id/code/name/kind/active de galpones/patios activos. GET individual global devuelve la misma proyección. No concede saldos globales, obras ajenas ni egresos de galpón al Jefe. RETURN conserva origen de obra autorizada e idempotencia. |
| 2 | Ubicaciones y nombres de actores | Movimientos: source/destination mínimos y actorName; una ubicación de otra obra no asignada se proyecta null, aunque la transferencia tenga destino autorizado. Historia pedido/OC/auditoría: actorName nullable. Recepción: actorName/location. OC: createdByName y, sólo roles económicos, invoiceLoadedByName. Ningún objeto de cuenta/email adicional. |
| 3 | Errores422 | OpenAPI documenta tanto issues Zod como flatten {formErrors,fieldErrors}; cada familia conserva su respuesta existente. No unificar arbitrariamente el runtime que la UI ya soporta. |
| 4 | Filtros de servidor | status en pedidos/OC/cotizaciones; q/search en obras, proveedores y materiales; active en materiales/proveedores. Auditoría: actorId/action/from/to además de entity/entityId. Todos filtran antes de paginar y contar. Fechas ISO inclusivas; entidad/acción son texto de auditoría, sin enum cerrado inventado. |
| 5 | Pendientes OC económica | pendingQuantity calculada por línea también en OrderDetail, como en ChiefOrder. |
| 6 | Importes OC | lineAmount y totalAmount exactos como texto, quantity×unitPrice/baseQuantity, moneda/base impositiva de la OC sin agregar IVA. Si la división no es exacta hasta8 decimales, línea afectada y total null, amountWarning=ROUNDING_POLICY_REQUIRED. No se impone redondeo a2dec ni política fiscal; V-01 sigue pendiente CEO. Es suma de importes en la base cargada, no total fiscal con impuestos inferidos. |
| 7 | Referencia de presupuesto para Jefe | WorkDetail.referenceVersionId, null si no hay referencia, después de autorización de obra; no incluye versión/snapshot económico. |
| 8 | Materiales de versión descriptivos | materials añade material/unit {id,code,name}; materialsByCategory añade también category. Las etiquetas son del catálogo actual; las cantidades y el snapshot de la versión siguen congelados. |
| 9 | Precios/unidad/Material | OpenAPI explicita baseQuantity equivalente a1 sin presentación y equivalencia exacta con ella. MaterialPatch excluye unitId: enviarlo devuelve422, incluso si coincide; cambiar unidad requiere otro material. Material admite relaciones opcionales y MaterialDetail las exige en GET. |
| 10 | Mano de obra vacía | Se conserva laborCost obligatorio y no nullable: no se inventa cero ni se incorpora ausencia de MO. Un0 debe ser explícito. Claude debe exigir ingreso/confirmación deliberada en UI; no necesita nueva regla backend. |
| 11 | Origen del mínimo | Stock y alertas incluyen minimumSource: LOCATION si override local, incluso0; MATERIAL si heredado positivo; NONE si no hay override y global0. |
| 12 | Recepciones/historia, comparación y duplicación OC | Historia OC incluye RECEIVE con entityType Receipt, entityId del recibo, after.orderId, actorName y createdAt; accesible sólo a roles económicos. Jefe usa GET receipts seguro. Comparación: createdAt,id asc; líneas materialId,id; no ranking automático. alreadyRequested incluye el pedido consultado y excluye cancelados. Filtros OC requestId/quotationId permiten advertir órdenes existentes; no se impone unicidad: compras parciales/proveedores distintos siguen permitidos. |
| 13 | Preview y auditoría de obra | Preview sólo valida y devuelve rowCount/errores/hash; fila1 es primera de datos sin encabezado. No devuelve transformación normalizada; la vista de contenido es local. UPDATE Work guarda before/after completos de campos de obra. |
| 14 | IDs de líneas e idempotencia de versión | PATCH computations permite lines[].id propio/no repetido y conserva identidad. Sin id, conserva sólo si el APU es único antes/después; duplicados requieren id para conservarla, o se recrean sin matching posicional inventado. Versiones requieren Idempotency-Key por actor+presupuesto,201 en replay mismo cuerpo y409 al cambiarlo. Mismo intento concurrente crea una versión y auditoría; intenciones nuevas se numeran separadamente. Snapshots históricos intactos. |

## Compatibilidad y pasos para Claude Code

1. Actualizar el PR #2 desde la última rama backend y ejecutar `pnpm --dir apps/web api:types`. Los tipos no se regeneraron en esta tarea porque implicaría editar apps/web.
2. Habilitar RETURN del Jefe con destinos WAREHOUSE/YARD activos del listado paginado; no consultar stock global para completar el selector. Conservar UUID ante timeout y cubrir E2E móvil.
3. VersionForm debe enviar Idempotency-Key mediante la misma disciplina de intención/reintento que otros movimientos. No crear una clave distinta al reintentar un timeout. Usar lines[].id al editar cómputos, especialmente APU repetidos, y refrescar líneas al guardar.
4. Enviar filtros al servidor y usar pagination.total; quitar el filtrado exclusivamente sobre la página actual. Usar metadatos/actorName del DTO en lugar de consultar /users para roles no administradores.
5. Presentar pendingQuantity, lineAmount/totalAmount y amountWarning del servidor. No recalcular ni redondear importes en JS ni inferir IVA; null significa mostrar advertencia. Conservar precisión textual; falta validar política monetaria final con CEO.
6. Consultar OC existentes por requestId/quotationId antes de confirmar otra; advertir y permitir la decisión explícita, sin bloquear pedidos que admiten múltiples compras. Mostrar/enlazar recepciones de historia operativa según rol.
7. WorkDetail.referenceVersionId habilita materiales/reporte sin economía para Jefe. Usar material/unit/category incluidos para evitar búsquedas incompletas por página.
8. POST idempotentes de OC/recepción/movimiento pueden repetir un snapshot guardado con el contrato anterior sin los campos nuevos. OpenAPI define uniones de resultado histórico/actual sólo en POST; GET exige DTO enriquecido actual. Tras replay legado, consultar GET para descripciones, sin repetir la operación ni cambiar la clave.
9. Mantener ambos formatos422, dejar de enviar unitId en MaterialPatch, exigir mano de obra explícita aun cuando sea0 y mostrar el origen del mínimo.
10. Agregar CI frontend real (tipos/typecheck/tests/build) y E2E contra servicios aislados. La CI API de este PR no acredita los11 tests ni24 E2E web reportados anteriormente. Excluir el artefacto apps/web/test-results/.last-run.json en el PR frontend si no corresponde versionarlo.

La issue #3 no debe considerarse cerrada hasta completar el trabajo de Claude y la auditoría integrada. No quedan ajustes backend diferidos por comodidad. Las reglas de IVA/redondeo final, permisos/estados operativos definitivos y prohibición funcional de múltiples OC por pedido/cotización siguen pendientes de CEO; se mantuvo el comportamiento conservador sin inventarlas.

## Verificación

Las suites específicas cubren destinos y RETURN idempotente del Jefe sin fuga de saldos/obras, reintentos concurrentes de versiones/cambio de cuerpo, identidad de líneas y snapshots, filtros/paginación, DTO de OC/importes exactos y advertencias, trazabilidad de recepción/actores, mínimos, formatos422 y las respuestas idempotentes históricas validadas con AJV. OpenAPI sigue en85 rutas/114 operaciones. La evidencia final de suite/build/CI se registra en ESTADO-PROYECTO.md y en el mismo PR #1; no equivale a validación del frontend o producción.

Resultado final local: **122/122 pruebas**,23 archivos y cero omisiones, RUN_INTEGRATION=1/RUN_RUNTIME=1, PostgreSQL aislado nuevo y pool3. Instalación, generación Prisma, typecheck, migrate diff y build correctos. Sin migraciones nuevas. CI de esta revisión: consultar checks/descripcion PR#1.
