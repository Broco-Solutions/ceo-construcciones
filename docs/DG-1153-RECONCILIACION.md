# DG 1153: conciliación histórica ejecutada

Fecha de verificación: 03/11/2026. Fuentes reales recuperadas de las referencias del plan; originales y resultados detallados en el directorio privado `~/.local/state/ceo-construcciones-codex/`. No se cargaron datos productivos.

## Procedencia y método

- BASE XLSX: SHA-256 `5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e`.
- DG XLS: SHA-256 `0e2e7b84dec93f910a5bd826c25bc61d05856a8952aaaea38f0c3ae2bb6facc0`. Hoja `PRESUPUESTO REV C`; precios de junio de 2026 según el PDF original de tres páginas.
- `read-historical-xls.py` lee valores BIFF cacheados y decodifica fórmulas, sin ejecutarlas. `reconcile-dg.ts` extrae cantidades, costos y factores comerciales por partida/componente. Los factores identificados son 0, 3, 15, 42, 45, 55, 60 y 63%; no se ajustan para alcanzar un total esperado.
- `verify-historical-db.ts` crea otra base PostgreSQL aislada y aplica las diez migraciones. `historical-db-fixture.ts` usa autenticación, router, Prisma y las operaciones reales de plantilla, presupuesto, emisión y necesidades.

## Resultados

| Concepto | Fuente | Aplicación | Diferencia aplicación − fuente |
|---|---:|---:|---:|
| Costo de las partidas | 562.046.923,9518 | 562.046.921,72 | −2,2318 |
| Venta calculada desde cantidades y componentes | 861.187.557,1262 | 861.187.538,55 | −18,5762 |
| Venta publicada, subtotales y PDF REV C | 861.187.557,13 | 861.187.538,55 | −18,58 |

Se procesaron **96 actividades**, de las cuales 93 tienen cantidad positiva y tres están incluidas sin importe independiente. Las diferencias quedan trazadas por fila en `dg-reconciliation-final/reconciliation.json` y `source-lines.json`. Proceden de precios/componentes unitarios redondeados en la planilla frente al redondeo extendido por partida de la aplicación, y de la normalización explícita a ocho decimales. No hay una partida de compensación ni un total objetivo incrustado en el cálculo.

La prueba PostgreSQL verifica copia independiente de plantilla, R1, reintento idempotente, R2, demanda invariable al cambiar rentabilidad, PDF de R1 invariable después de cambiar el cliente y coincidencia entre materiales calculados, referencia y necesidades. Registro: `dg-postgresql-release/verification.json` y log `logs/dg-postgresql-release.log`.

## Límites de la fuente, visibles en la aplicación

Se verificaron **28 renglones de materiales**. Existen **57 agregados de suministros sin composición física completamente verificable**; permanecen como costos directos, sin fabricar materiales, unidades o consumos. Por ejemplo, hay reutilización de encofrado que no coincide con multiplicar sin más coeficiente por precio y referencias de bombeo sin precio verificable. El cotejo comercial está ejecutado; la composición física completa de esa obra no se presenta como aceptada.

El contenido conserva `materialDemandIncomplete: true`. El editor muestra la advertencia y la pestaña Materiales permite registrar la revisión del usuario. Las necesidades derivadas conservan las cantidades conocidas pero indican `exact: false` y una advertencia; el marcado no cambia precios ni genera una aprobación obligatoria. Completar esa composición exige datos verificables de CEO, no una decisión funcional nueva.

BASE contiene **146 actividades y 17 rubros**, con **53 observaciones de fuente**. Las cantidades iniciales son cero. Las referencias fiscales de las hojas son contradictorias: el tratamiento es `UNSPECIFIED`, visible al usuario. No se supone una alícuota ni se interpreta una referencia rota como precio cero. La incorporación es explícita, atómica e idempotente; nunca un seed automático productivo. El artefacto derivado versionado es `apps/api/data/base-template.json`.

## Reproducción aislada

Con los originales fuera de Git, las herramientas aceptan rutas explícitas; consultar sus mensajes de uso. El adaptador BASE conserva origen por fila. Para DG, primero normalizar BIFF, ejecutar `reconcile-dg.ts` y después `verify-historical-db.ts` con el contenido normalizado y el JSON fuente. Los directorios de salida deben ser nuevos. Los scripts con base de datos rechazan destinos que no sean loopback de pruebas. No borran bases ni usan credenciales productivas.

El PDF comercial generado se renderiza por página y se inspecciona junto con extracción de texto y límites de los bloques. Las condiciones y partidas incluidas se imprimen; costos, factores comerciales y composición interna no se publican. Los precios unitarios conservan su precisión de cálculo y los importes por partida se muestran a dos decimales, de modo que el precio impreso explica el subtotal.
