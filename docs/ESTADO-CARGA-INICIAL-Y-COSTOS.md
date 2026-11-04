# Carga inicial CEO y costos de referencia — ejecución

Encargo recibido el 04/11/2026. El archivo `CEO_PLAN_CARGA_INICIAL_Y_COSTOS_CODEX.md` no estaba en el árbol al iniciar; se usa el texto completo adjunto por el usuario (P0–P7, CI-01…CI-48), que autoriza este incremento full stack. El plan maestro anterior es contexto histórico.

## Evidencia vigente

- Base real: `3df832de3633829d5f20b0f4e1cb566def83e081`; `origin/main` verificado sin commits posteriores al comenzar. Rama `codex/carga-inicial-costos`.
- Se preservaron `apple-icon.png:Zone.Identifier`, `icon.png:Zone.Identifier` y `public/brand/ceo-logo-azul.png`, no versionados. Ningún cambio de código local previo. PR10–13 conservados.
- Arranque manual ejecutado en el SHA base; base y credenciales conservadas. Capturas previas privadas en `~/.local/state/ceo-construcciones-codex/catalog-baseline/`. Se detuvieron sólo los procesos propios antes de compilar/probar.
- Original BASE verificado: SHA256 `5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e`. DG: `0e2e7b84dec93f910a5bd826c25bc61d05856a8952aaaea38f0c3ae2bb6facc0`. Originales e inventario detallado permanecen privados.
- Inventario inicial del original: 17 rubros, 146 actividades, 234 filas candidatas de producto/presentación y 80 registros candidatos MO/servicios. 74 actividades con composición MO conciliada exactamente a 8 decimales. Los candidatos no equivalen a registros importados ni completos.
- P1/P3: carga local aplicada. 17 rubros previos reutilizados, 146 actividades, 222 materiales PRECIOS activos, 94 identidades activas de receta, 222 presentaciones activas por material y 372 precios históricos, 78 recursos MO y 37 tarifas (27 BASE + 10 DG). Reejecución sin creaciones/conflictos; 1.429 correspondencias verificadas sin discrepancias. Ver [resultado y faltantes por registro](CARGA-INICIAL-RESULTADOS.md).
- P2/P5: API conectada, revisión explícita/seleccionable de borrador y snapshots. Caso sintético 6.100 → 6.500 → 6.900, venta 91.500 → 97.500 → 103.500, demanda constante 40 kg y R1/PDF inmutables. Guardar/aplicar no emite.
- P4/P6: verificadores independientes con salida 0: API **186 + 3 runtime** (`20261104_023014_2-api`), web **49** + typecheck/build (`20261104_025827_2-web`), E2E **72** (`20261104_030444_2-e2e`). Regresión adicional del cargador **5/5**, incluyendo revisión optimista al retirar un servicio provisional. No se eliminaron assertions ni se sustituyó persistencia por mocks.
- Compatibilidad final: `logs/catalog-release-candidate.log`, salida 0, V1 poblada → PR9 poblado → nuevo, API standalone/navegador reales, snapshot/PDF iguales, stock/OC parcial intactos y `No difference detected`. Base aislada conservada `ceo_release_test_15f71e2378674d6290c01f18830fc73c`.
- Manual: `CEO_Manual_Local.sh start` ejecutado; smokes existente y de catálogo aprobados con cinco perfiles. BASE146/74 MO comprobada, cantidades0 y costos unitarios conocidos visibles; ediciones sólo descartadas. La propuesta sintética multipágina se emite una vez y su descarga repetida conserva bytes. Reinicio del candidato versionado ejecutado sin reset; `manual/release.json` y el PR registran la comprobación del mismo código integrado.
- Visual: capturas/revisión a 1440/1280/768/390/360, materiales/MO/actividad/composición/revisión y BASE real. [Evidencia sintética publicable](../apps/web/docs/evidencia/costos/); evidencia sensible en `catalog-final/` privado. PDF sintético de **6 páginas**, unidades m²/m³, nombres largos, incluidas/excluidas y condiciones inspeccionado; sin costos internos, MO o recargo. R1/R2 numéricas también renderizadas.
- Se corrigieron durante la pasada: fecha de tarifa adelantada por UTC, preview que no seguía selección parcial, unidad ausente al filtrar presentación, cachés redondeadas interpretadas como contradicción, fechas/fuentes heredadas entre bloques y servicios de alquiler/bombeo tratados como materiales. Los intentos fallidos de contrato/fixtures/selectores y colisión de compilación se corrigieron; sólo las ejecuciones con código 0 citadas acreditan aceptación.
- P7: [PR #14](https://github.com/Broco-Solutions/ceo-construcciones/pull/14), commits `dd3a750` (API/carga), `48eb3f4` (web/evidencia), `6a7570b` (documentación). Revisión de 88 archivos sin originales, credenciales ni claves; SQL conserva el checksum ensayado (una línea vacía final indicada por diff-check, sin impacto). El PR registra candidato final, checks y SHA remoto después del merge normal. No hay habilitación productiva ni aceptación del piloto por CEO.

Durante P7 se reprodujo otra carrera de UI con respuesta real demorada: después de solicitar navegación con cambios, la revisión de costos podía reabrir una segunda capa modal (dos diálogos observados, sin escritura). Se invalidan respuestas al cerrar, navegar o desmontar el editor. La regresión E2E preserva el único diálogo de navegación, las observaciones y el borrador/revisión; preview sigue siendo de sólo lectura. El caso focalizado pasó contra API/PostgreSQL reales y la suite completa volvió a pasar 72/72 con esa regresión incorporada.

## Matriz requisito → implementación → prueba → evidencia

La evidencia API usa PostgreSQL real; E2E usa API standalone y web de producción con otra base aislada. Los resultados locales anteriores corresponden al candidato; PR/checks y `manual/release.json` registran el SHA integrado. Las limitaciones de datos no se declaran costos completos.

| ID | Implementación / prueba | Evidencia / estado |
|---|---|---|
| CI-01 | Baseline y marca PR10–13 | Árbol comparado y capturas privadas; regresiones de navegación y pulido E2E |
| CI-02 | Originales e inventario | Hashes BASE/DG y lector XML/BIFF acotado; sin macros |
| CI-03 | Actividades/rubros | verify-ceo-source: 146 actividades/17 rubros de esta fuente; claves de celda distintas |
| CI-04 | PRECIOS completa | 268 filas no vacías: 234 candidatas y 34 exclusiones justificadas |
| CI-05 | Identidad | 222 productos activos por evidencia; marcas/cementos separados; pares CAS/Elena sin fusión especulativa |
| CI-06 | Presentación | ceo-inventory + caso sintético: 25 kg normalizado una vez; fórmula/caché diferenciadas |
| CI-07 | Fechas | reference-dates + catalog-load: día/mes/desconocida; 62 provisionales archivadas sin borrar importes |
| CI-08 | Fiscal | MO UNSPECIFIED, E/F independientes; aportes no IVA; pruebas de incompatibilidad |
| CI-09 | Nulos/cero | ceo-inventory/source-linear-cost y comerciales: REF/ausente no cero, consumo cero válido |
| CI-10 | MO real y DG | 27 tarifas BASE, 10 DG en mismos recursos; ejemplo original J22=3334,20 |
| CI-11 | Catálogos | Carga aplicada: actividades, materiales, MO y referencias persistidas; smoke manual aprobado |
| CI-12 | Idempotencia | catalog-load.integration: doble aplicación concurrente + no-op; reejecución original local |
| CI-13 | Coexistencia | Rubro anterior con audit/hash y composición propia intactos; archivo de referencias provisionales |
| CI-14 | Edición usuario | catalog-load.integration: nombre editado conservado y conflicto explícito |
| CI-15 | Atomicidad | Bloqueo por fuente, transacción serializable/reintento y rollback probado |
| CI-16 | Sin operaciones | Conteos locales antes/después idénticos; sin clientes/obras/proveedores/stock/compras creados por carga |
| CI-17 | MO calculada | cost-references.integration: tarifa oficial afecta cálculo y conserva coeficientes |
| CI-18 | MO directa | Actividad directa conserva importe al actualizar tarifa no vinculada |
| CI-19 | Sin doble MO | Modalidad excluyente validada; sustitución de agregado con evidencia/preview/expectedDirectCost |
| CI-20 | Material vinculado | Caso 12500→15000 por bolsa; unitario 6100→6500, consumo igual |
| CI-21 | Serie elegida | reference-selection + integración: no menor precio ni cambio de proveedor automático |
| CI-22 | Incompatibles | Moneda/IVA/presentación/futuro; referencias retiradas fuera de selección/comparación/exportación |
| CI-23 | Servicios | Volquetes/baños/bombeo/alquileres fuera de stock; costos directos sin insumos fabricados |
| CI-24 | Cantidad cero/vacía | editor-corrections H02 y comerciales mantienen unitario sin costo extendido/demanda |
| CI-25 | BASE nueva | Plantilla conectada y selección compatible; smoke de 146 vínculos/74 MO aprobado |
| CI-26 | Copia emitida | cost-references.integration: copia R1 conserva 3600 por defecto |
| CI-27 | Borrador independiente | Tarifas/precios nuevos no escriben en el borrador antes de aplicar revisión |
| CI-28 | Preview | Preview sin escritura y selección vacía/parcial; venta 91500/97500/103500 |
| CI-29 | Manuales | Ajustes desmarcados y conservados; sustitución sólo al seleccionar expresamente |
| CI-30 | Receta particular | Consumo particular 5/manual999 preservado; actualización no copia receta maestra |
| CI-31 | Conflicto | Hash de revisión/referencias revalidado en transacción; no se pierde contenido |
| CI-32 | Recargo | Caso comercial 50% final, sin cambio de cantidad/consumo al actualizar costos |
| CI-33 | Históricos | R1 snapshot y bytes PDF idénticos tras actualizar; pruebas API/E2E |
| CI-34 | Emisión | Guardar/aplicar no emite; siguiente emisión R2 y redescarga idempotente |
| CI-35 | Abastecimiento | Caso numérico demanda siempre40kg + net-needs 100/40/40/20/5 |
| CI-36 | Indicadores | management-reports y cierre: referencia actual sin sumar revisiones anteriores |
| CI-37 | Permisos | access-contract y nuevas rutas: Jefe/Admin403, sin tarifas/historial/impacto |
| CI-38 | Compras | Consulta de MO permitida y escritura403; API real, smoke manual aprobado |
| CI-39 | Historia MO | Trigger append-only; inactivar recurso no modifica snapshots |
| CI-40 | H01 | E2E edición tardía, conflicto, guardar/salir, cancelar, Atrás/Adelante, logout y revisión de costos demorada |
| CI-41 | H05 | E2E comparación una capa y teclado/foco conservados |
| CI-42 | H03 | E2E moneda/IVA cancelables y restauración completa, incluyendo procedencias MO |
| CI-43 | Visual | Capturas sintéticas1440/1280/768/390/360; inspección y smoke BASE aprobados |
| CI-44 | Volumen | Resolver en lote; precios/recursos paginados; BASE146 con cálculo en lote y sin perder foco al tipear; revisión manual aprobada |
| CI-45 | Esquemas | Release V1 poblada→PR9 poblado→nuevo: HTTP/browser, snapshots/PDF iguales, diff vacío |
| CI-46 | Reinicio manual | Arranque/reinicio versionado y smokes aprobados sin reset; SHA local compilado en release.json y coincidencia con main registrada en PR14 |
| CI-47 | Contrato/suites | OpenAPI122 rutas/161 operaciones; API186+runtime3, web49 y E2E72 con salida0 |
| CI-48 | Entrega | Informe por entidad/faltantes y guía ejecutada; PR14/checks/registro de SHA acreditan integración y smoke del mismo código |

No se ejecutaron operaciones productivas ni cambios de infraestructura. El [PR14](https://github.com/Broco-Solutions/ceo-construcciones/pull/14) es el registro verificable de estado de merge/checks/SHA; no se anticipa un SHA de merge dentro de este commit.
