# Estado del cierre de Etapa 1

## Pasada de cierre técnico para pruebas manuales — validación local aprobada

Base remota verificada de nuevo: `121264563b73f141e118a2a9f8093c727cc907b8`. Rama nueva `codex/cierre-tecnico-manual-20261103`; árbol inicial limpio. No se reiniciaron las fases del plan. No apareció el adjunto de revisión PR8; se usaron los hallazgos completos aportados por el usuario.

H01–H05 reproducidos con API/PostgreSQL/navegador reales, después de corregir una clave idempotente faltante del fixture de preparación. Evidencia privada: `logs/review-repro-confirmed.log` (cinco fallas específicas), `logs/review-fixed-first.log` (las cinco regresiones iniciales aprobadas). Se agregaron casos de conflicto real, respuesta real demorada, historial, logout, valoración reversible, composición y teclado; la primera corrida ampliada aprobó 64 casos y detectó un selector ambiguo de prueba y una doble redirección al logout en escritorio/móvil. Se corrigieron ambos; se repite la suite completa. No se reutilizan los conteos del PR8 como resultado de esta pasada.

API final de esta corrección: **174 pruebas + 3 runtime**, tipos/build y salida 0 (`logs/technical-api-final-3.log`, corrida `20261103_182819_26-api`). Un intento previo dejó 173 aprobadas y una preparación equivocada del caso de evidencia (usaba las claves de plantilla en lugar de las claves regeneradas del borrador); se corrigió el fixture y se repitió completo. El primer intento detectó seis desajustes de contrato en necesidades; se corrigió el schema generado, sin eliminar assertions. Web 47 y E2E 68/68 aprobaron con builds y salida 0 (`logs/technical-web-final.log`, `logs/technical-e2e-final.log`). Compatibilidad final binaria/HTTP/navegador V1→ampliada aprobada, salida 0 y sin diferencias de esquema (`logs/technical-release-final.log`). Smoke manual aprobado para los cinco perfiles; reinicio con código integrado pendiente.

DG: de los 57 casos originales, 2 A, 32 B recuperados y 23 C. Total actual de partidas con suministro: 2 A/52 B/24 C; se encontró además una contradicción antes omitida en CERCO. 67 materiales identificados incluyen contribuciones orientativas: no se declaran todos íntegramente validados. Costos de suministro agregados se conservan explícitamente separados de la composición física para evitar doble suma y precios cero ficticios. Venta recalculada 861.187.541,44, diferencia publicada −15,69; PostgreSQL real aprobado (`logs/dg-technical-postgresql.log`): R1/R2, cantidades, totales y PDF inmutable. Evidencia completa privada por hoja/celda en `dg-technical-final/`.

El entorno manual persistente usa base exclusiva `ceo_manual_test`, puertos 3100/3101 y credenciales privadas. Arranque real, health/login, cinco perfiles, edición descartada, permisos y parada aprobados (`logs/manual-acceptance-*.log`). Ambos procesos fueron identificados como propios; tras la parada no quedaron activos. La huella de datos se conservará para comparar al reiniciar con el código integrado. PDF extenso sintético de siete páginas y DG de siete páginas renderizados e inspeccionados; m²/m³, condiciones y textos dentro de página, sin etiquetas de economía interna. Evidencia privada `pdf-technical-final/`.

Commit funcional: `3fa7a54bf68f7266a527e8e1c3d50a6956703be0`. Diff revisado y búsqueda de credenciales privadas/patrones de claves sin hallazgos. Sin cambios de esquema, configuración cloud ni infraestructura. Integración controlada en [PR #9](https://github.com/Broco-Solutions/ceo-construcciones/pull/9): el registro del PR acredita sus checks, SHA remoto y smoke posterior al merge. Este checkpoint local no afirma por adelantado que se haya integrado o desplegado. Código funcional `3fa7a54`, documentación `1480eec`; las actualizaciones posteriores de documentación conservan los mismos archivos de aplicación.

Los registros siguientes corresponden al cierre PR8 anterior.


Actualizado: **03/11/2026**. Base: `main` `a9a075dc159c8c59d075aa5894534e3dbaae961e`. Rama preservada: `codex/cierre-etapa1-20261102-234511-12781`.

## Hitos ejecutados

| Fase | Resultado verificable |
|---|---|
| F0 | Plan, reanudación, auditoría, reglas, fuentes y V1 leídos; baseline API 130 + runtime3, web47 y E2E49 recuperado. Instrucciones full stack actualizadas. Docker/PostgreSQL y GitHub verificados |
| F1 | Actividades de obra, costo/composición, directos reutilizables y plantillas; IDs/enlaces/motor V1 conservados |
| F2 | Clientes con varias obras, obra nueva con cliente activo, legado nullable; cinco perfiles, DTO mínimos, delegación por destino |
| F3 | Editor integrado, cantidades y ayuda aritmética, costos/directos/VARIOS, recargos reemplazables, borrador optimista y conflictos útiles |
| F4 | Emisión R1/R2 idempotente e inmutable, PDF/preview comercial, referencia material separada, datos públicos congelados |
| F5 | Precios históricos, comparación de tres proveedores con equivalencias/moneda/IVA, revisión mensual, XLSX/mapeo/diferencias/commit atómico |
| F6 | Necesidades sin doble conteo, reservas/recepción/traslado trazados, pedidos manuales y OC sin aprobación, recepción delegada y factura/pago informativos |
| F7 | Reportes cuantitativos e indicadores cliente/obra/proveedor, totales servidor y Excel, monedas/IVA separados, legado sin importe inventado |
| F8 | Seis migraciones sobre base vacía y V1 poblada, adaptador dry-run/ejecución/repetición aislados, BASE real y DG real contra PostgreSQL; revisión UI/PDF ejecutada. Límites de datos históricos documentados |
| F9 | Revisión, pruebas locales y compatibilidad binaria/navegador aprobadas. [PR #8](https://github.com/Broco-Solutions/ceo-construcciones/pull/8) abierto; ver su estado/checks/SHA de integración, sin anticipar merge ni habilitación productiva |

## Evidencia del candidato

- API: **163 pruebas + 3 runtime aprobadas**, typecheck/build, salida 0. `logs/final-api-pdf.log`, corrida `20261103_141545_2-api`.
- Web: **47 unitarias**, typecheck/build, salida 0. `logs/final-web-verified.log`, corrida `20261103_140910_3-web`.
- E2E final: **53/53** aprobados, builds API/web, API y PostgreSQL reales, salida 0; incluye BASE real. `logs/final-e2e-verified.log`, corrida `20261103_141825_2-e2e`.
- DG: 96 actividades, costo **562.046.921,72**, venta **861.187.538,55**; diferencia frente al PDF histórico **−18,58**, trazada sin hardcodear total. R1/reintento/R2/maestros congelados/materiales/necesidades aprobados. PDF de siete páginas renderizado, campos privados ausentes y todos los bloques dentro de márgenes.
- BASE: 146 actividades/17 rubros/53 observaciones; cantidad inicial cero y advertencia de composición/IVA. Uso real, emisión R1 y advertencias verificados en el último E2E.
- Compatibilidad fuente V1→ampliada aprobada con diff sin diferencias. La prueba adicional de binarios HTTP y navegador aprobó V1 y esquema ampliado, incluida alta web real en ambos, salida 0. `logs/release-compatibility-binary-browser.log`, base `ceo_release_test_9b1620c3631c47aa9b1838f50d771a02`.

Las rutas de logs anteriores son relativas al directorio privado `~/.local/state/ceo-construcciones-codex/`. No se publican credenciales, originales empresariales o logs sin revisar. Las capturas sintéticas están en `apps/web/docs/evidencia/`.

## Datos pendientes de puesta en marcha

DG conserva 57 agregados de suministros sin composición física verificable; 28 renglones materiales están verificados. La aplicación señala demanda orientativa (`materialDemandIncomplete`, `exact: false`) y permite registrar su revisión. No se declara aceptada toda su composición física. El export definitivo de OC abiertas y entidades de CEO Obras no se recibió; el adaptador está probado, el corte empresarial no se ejecutó.

## Integración y entorno productivo

El usuario autorizó integrar cuando pasen calidad y compatibilidad. La metadata de GitHub muestra autodespliegue existente de main mediante `railway-app[bot]`; se valida que el código nuevo preserve V1 sin necesitar la migración productiva. Se respetarán protecciones/checks, sin force-push ni despliegue manual.

**No hubo migraciones/importaciones productivas ni cambios de infraestructura.** La incorporación del código no implica que las funciones nuevas estén habilitadas sobre el esquema productivo. Ver [release](RELEASE-CIERRE-ETAPA-1.md), [migraciones](MIGRACION-CIERRE-ETAPA-1.md), [aceptación](ACEPTACION-CIERRE-ETAPA-1.md), [matriz R01–R30](REQUISITOS-ETAPA-1-CIERRE.md) y [conciliación DG](DG-1153-RECONCILIACION.md).

## Checkpoint de integración — PR #8

Tres commits iniciales publicados: `a8f816e` (aplicación, contratos y migraciones), `a6b0a1b` (pruebas, fuentes aisladas y evidencia) y `538941d` (documentación). El [PR #8](https://github.com/Broco-Solutions/ceo-construcciones/pull/8) es la fuente verificable de checks del candidato y del estado de merge; allí se registra el SHA final sin anticiparlo en este commit. `main` seguía en la base original al abrirlo. GitHub no devolvió reglas de rama aplicables en la consulta previa; aun así se esperan todos los checks y se verifica de nuevo antes del merge.

No hay preguntas funcionales pendientes. Permanecen datos de puesta en marcha: composición física completa de los agregados históricos y export definitivo para transición. No impiden revisar/integrar la capacidad funcional implementada con sus advertencias, ni autorizan una carga productiva.
