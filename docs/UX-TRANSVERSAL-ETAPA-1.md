# UX transversal de Etapa 1

Base real: main `2859bff9106d6d995cd240b5b0ab18e754abe35d`. Se conservan las dos modificaciones locales de documentación sobre la cuenta permanente Broco y los tres archivos del usuario sin publicar. No se modifican usuarios, claves, roles, infraestructura ni datos BASE/DG. Evidencia sensible sólo en `~/.local/state/ceo-construcciones-codex/ux-transversal/`.

## Matriz de ejecución

| Pantalla/control | Cambio / acción | Rol vigente | Prueba y estado |
|---|---|---|---|
| Catálogos, filtros y formularios extensos | Combobox común remoto/local, búsqueda normalizada y dependencias | Autorización de cada entidad en servidor | P1–P2 en ejecución; aún no aceptado |
| Actividades / presupuesto / cómputo | Buscar por ítem/código/nombre, incorporar varias tras revisar | Gerencia/Cómputo; consulta económica existente | P1–P2 pendiente de prueba |
| Tablas operativas y exportación | Página / filtro congelado / exclusiones, Excel con el mismo alcance | Permisos existentes; sin cambios de usuarios en lote | P2 pendiente de prueba |
| Stock, alertas y ubicación sin saldo | Mínimos por lote, cero/herencia, revisión y atomicidad | Gerencia/Compras | P3 pendiente de prueba |
| Movimientos | Multilínea, validación compartida, reservas, idempotencia y rollback | Según tipo/asignación actuales | P3 pendiente de prueba |
| Presupuesto PDF | V1 conservada; V2 sólo nuevas emisiones y preview | Permisos económicos actuales | P4 pendiente de prueba |
| OC PDF | Presentación versionada al emitir sin recalcular histórico | Gerencia/Compras/Cómputo según lectura vigente | P4 pendiente de inspección/prueba |
| Informes e Inicio | KPI/series servidor, grupos monetarios y gráficos con detalle accesible | Cliente sólo Gerencia; ámbito actual de otros perfiles | P5 pendiente de prueba |
| Entorno online | Smoke pequeño sólo con registros nuevos DEMO UX | Credenciales vigentes, sin resets | P6 pendiente de integración |

## Excepciones previstas que requieren verificación

Estados, moneda, IVA y tipos cortos conservan selección nativa. Usuarios no recibe selección masiva. Historial/auditoría sólo permite lectura/exportación. Recepción permanece dentro de una OC. No se infieren los 76 casos históricos parciales. Cada hito reemplazará el estado pendiente por código/prueba/evidencia concretos.

## Evidencia incremental (rama, todavía sin publicar)

- `Combobox.tsx` / `EntityPicker.tsx` / `EntitySearch.tsx`: cuatro pruebas en `combobox.test.tsx` pasan (IDs, homónimos, teclado/Escape dentro del modal, paginación y respuesta tardía). Adopción en catálogos, formularios, composición, stock e informes en curso; falta revisión completa renderizada.
- `entity-search.ts`: PostgreSQL normaliza NFD/tokens antes del predicado autorizado y la paginación; prueba real encuentra el registro 65 por tildes/espacios y mantiene restricción por ID.
- `selections.ts` + `table-selection.ts` + `DataTable`: instantánea actor/filtro/IDs/versiones con vencimiento 30 minutos y límite explícito 2.000; extensiones preservan versiones, exclusiones no incorporan altas posteriores. Integración exporta 64 de 65 tras excluir uno y detecta cambios/IDs ajenos/otro actor. Dos unitarias de tabla pasan (página/todos/excluir/paginar/móvil/no navegar/invalidez del filtro/exportación/error).
- `inventory-batches.ts` y validación compartida de `inventory.ts`: preview y confirmación serializable/idempotente, límites 200 mínimos/100 movimientos, errores por fila. Integración pasó mínimos sin saldo, propio/0/herencia, no movimientos, repetición concurrente idéntica, conflicto, permisos y transferencia/reserva/consumo/devolución con rechazo de duplicados/insuficiencia. Los nueve casos anteriores de inventario también pasaron. Falta ampliar concurrencia y E2E del lote.
- `commercial-pdf-v1.ts`: cuerpo original conservado. Golden sintético V1 generado con el renderer de main: SHA256 `38e71b1a6621649b098e2db3da162c8f198a456159d64dfc9989eb5458d25434`. Prueba PostgreSQL inserta una R1 histórica con sus invariantes activas, reemite sin crear R2 por cambio de diseño y verifica R1 idéntica tras una R2 V2.
- V2 comparte `pdf-layout-v2.ts` y el asset oficial azul empacado en API. Tres pruebas PDF pasan: V1/fallback/golden; una página y 146 partidas largas; OC extensa con presentación/unidad/estado y bytes estables. Renderización e inspección visual todavía pendientes.
- OC nuevas capturan presentación pública en auditoría al emitir, sin consultar precios nuevos al descargar. OC anteriores sin presentación conservan el renderer legado (no se inventa un historial que antes no existía). Notas se publican sólo por elección explícita `notesPublic`; las notas anteriores son privadas por defecto. Una prueba real conserva el PDF después de cambiar nombres maestros.
- `management-reports.ts` agrega series/KPI sobre todo el filtro con decimales exactos. Cinco pruebas de informes pasan: monedas/IVA separados, última revisión, compras generales, corte argentino, paginación/Excel, permisos y nulos históricos. Gráficos SVG usan Number sólo para geometría; sus etiquetas y Excel conservan decimales de servidor. Falta smoke/visual.
- Primer pase amplio de API: 206 pruebas pasaron; falló el inventario estático de rutas OpenAPI porque aún no enumeraba las seis rutas nuevas. Se actualizó esa enumeración conservando sus assertions. No se cuenta como suite aprobada hasta repetirla. Primer pase de web: 56 unitarias pasaron; las dos nuevas de tablas pasaron después en ejecución focalizada. Pendientes verificadores finales/build/E2E/publicación.

Referencias de interacción: [APG combobox](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/), [APG checkbox](https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/) y [gráficos accesibles](https://www.w3.org/WAI/tutorials/images/complex/). La revisión React usa el skill `vercel:react-best-practices`; se conservan los componentes/tokens de este repositorio.

## Candidato para integración inmediata

El usuario priorizó publicar el candidato actual para su demo y pidió detener los ajustes adicionales. La limpieza documental final y la evidencia visual ampliada aún no se declaran completadas. Se conserva un único plan activo. No hay migraciones, cambios de roles/credenciales/configuración cloud ni recargas BASE/DG.

- API: verificador aislado completo aprobado, **211 + 3 runtime**, tipos/build salida 0 (`ux-transversal/final-api.log`). Se agregó después una prueba de seguridad Excel (aprobada) y se repiten los controles en CI sobre una base nueva. Un intento adicional sobre una base de diagnóstico reutilizada falló en dos fixtures que requieren instalación inicial (BASE y cuentas DEMO ya presentes); no se borró esa base ni se quitaron assertions.
- Web: **60 pruebas**, typecheck/build salida 0 (`ux-transversal/final-web.log`); se corrigió después una advertencia CSS de compatibilidad sin cambiar comportamiento.
- E2E focalizado: **10/10** (`ux-transversal/eighth-e2e.log`), API/PostgreSQL reales, incluidos tres páginas (115 clientes), selección congelada/exclusión/exportación, mínimos 0/herencia/conflicto, transferencia con reserva/doble clic y actividades múltiples con repetición expresa. Suite completa del candidato en ejecución.
- PDF: todos los PNG de 29 páginas sintéticas de presupuesto y 12 de OC renderizados e inspeccionados en privado. Golden V1 e integración histórica pasan. El dominio no cambió aún; no se declara comprobación online de este incremento.

Excepciones: estados/moneda/IVA/tipos cortos siguen nativos; rubros/unidades/ubicaciones pequeños pueden usar opciones locales completas. Usuarios no tiene acción masiva; recepción continúa por OC y su historia permite exportar, sin recibir OC en bloque. La selección/exportación tiene límite explícito de 2.000 resultados y vencimiento de 30 minutos; mínimos 200 filas, movimientos 100. Las OC históricas sin presentación congelada conservan el renderer anterior; no se inventa retrospectivamente un historial.

## Limpieza documental acotada

Inventario previo: seis planes/prompts de ejecución superados. Sus reglas detalladas se consolidaron en `DECISIONES-CIERRE.md`, criterios T01–T54 en `ACEPTACION-CIERRE-ETAPA-1.md`, convenciones REST en el README API y preparación local en la guía manual. Se retiraron el plan maestro anterior, reanudación TXT, LEEME de desbloqueo y los planes/misión backend y cierre; su historial permanece en Git. README ahora es índice y AGENTS apunta a fuentes vigentes. Se conserva documentación específica de contratos, operación/demo, migración, fuentes, conciliación, pruebas y evidencias históricas. El preparador valida el plan y estado vigentes.

Dos metadatos Windows `:Zone.Identifier` sin seguimiento se copiaron de forma recuperable a `~/.local/state/ceo-construcciones-codex/ux-transversal/limpieza-local/` antes de retirarlos. El logo azul local del usuario, originales, credenciales, bases, respaldos, migraciones, fixtures, pruebas y referencias visuales se conservaron. Único plan activo: `CEO_PLAN_UX_UI_TRANSVERSAL_CODEX.md`. No hubo limpieza de datos ni de usuarios.
