# Notificaciones, unidades predeterminadas y textos de ayuda — V1

Mejoras de experiencia sobre la V1 en producción. No cambian procesos de negocio,
permisos ni cálculos.

## 1. Notificaciones

Componente global en `apps/web/components/notifications.tsx`. Se usa con `useToast()`:

```ts
const toast = useToast();
toast.success('Unidad creada correctamente');
toast.success('Planilla descargada', { description: nombreArchivo });
toast.failure('No se pudo descargar el informe', error); // texto del servidor en lenguaje de usuario
toast.warning('…'); toast.info('…'); toast.error('…');
```

| Variante | Uso | Duración | Accesibilidad |
|---|---|---|---|
| Éxito | Operación completada | 4,5 s | `role="status"`, `aria-live="polite"` |
| Información | Mensaje neutral | 5,5 s | `role="status"` |
| Advertencia | Requiere atención (p. ej. conflicto 409) | 8 s | `role="status"` |
| Error | Operación fallida | Queda visible hasta cerrarla | `role="alert"`, `aria-live="assertive"` |

- Escritorio: esquina superior derecha, debajo del encabezado de la página (no tapa sus
  acciones). Móvil: a todo el ancho, sobre la barra inferior.
- Botón «Cerrar notificación» en todas. El tiempo se pausa mientras el puntero o el foco
  están encima. Como máximo cuatro a la vista: salen primero las más antiguas que no son
  errores. El mismo mensaje repetido no se apila.
- Sólo se notifica un éxito después de que el servidor confirmó la operación. Los errores de
  validación siguen apareciendo junto a cada campo, sin notificación adicional.
- Los mensajes estándar de validación (en inglés) se traducen al español y los errores
  técnicos (JSON, idempotencia, integridad, errores del navegador) se reemplazan por
  indicaciones para el usuario (`lib/api.ts`). Las reglas de negocio informadas por el
  servidor se muestran tal cual.

## 2. Unidades de medida predeterminadas

La migración versionada `20261023000100_default_units` agrega a `Unit` un campo opcional
`symbol` y carga 15 unidades habituales en obra:

Unidad (un), Metro (m), Metro cuadrado (m²), Metro cúbico (m³), Centímetro (cm),
Milímetro (mm), Kilogramo (kg), Gramo (g), Tonelada (t), Litro (L), Mililitro (mL),
Hora (h), Jornal (jornal), Día (día), Global (gl).

Las presentaciones comerciales (bolsa de 50 kg, caja, rollo) siguen siendo presentaciones de
cada material, no unidades.

Reglas de la carga:

- **Sin duplicados.** Antes de crear cada unidad se compara contra todas las existentes por
  nombre, código y símbolo, sin distinguir mayúsculas, acentos, espacios ni puntos y con
  variantes habituales: «M», «mts» o «Metros» cuentan como Metro; «KG» o «kilos», como
  Kilogramo; «M2», «Metros cuadrados», como Metro cuadrado. Si ya existe, no se crea.
  «ml» se interpreta como metro lineal (uso de obra), no como mililitro.
- **No destructiva.** No renombra, borra ni modifica unidades existentes (tampoco les asigna
  símbolo) y no toca materiales, APU, presupuestos ni cantidades.
- **Respeta los códigos automáticos.** Cada unidad nueva toma su código `UNI-###` del mismo
  contador que usa la aplicación, salteando códigos ya ocupados; la secuencia nunca
  retrocede. Las altas posteriores desde «Catálogo → Rubros y unidades» continúan la serie.
- **Idempotente.** Ejecutarla de nuevo no crea nada.

El símbolo se edita desde «Catálogo → Rubros y unidades». Los selectores muestran «Metro
cuadrado (m²)» y las cantidades, «12 m²». Una unidad anterior sin símbolo se muestra con su
código manual (p. ej. «KG») o con su nombre.

### Puesta en marcha en Railway

Es el mismo procedimiento ya usado para los códigos automáticos y requiere autorización del
responsable del entorno:

1. Tener un backup verificado de la base.
2. Fusionar el PR y esperar a que Railway termine de desplegar la API.
3. En la consola del servicio API (`/app`):

   ```bash
   ./node_modules/.bin/prisma migrate deploy
   ./node_modules/.bin/prisma migrate status
   ```

   `migrate status` debe listar `20261023000100_default_units` como aplicada.
   No usar `migrate dev` ni `db push`.
4. Abrir «Catálogo → Rubros y unidades → Unidades» y verificar el listado.

No hace falta ningún seed adicional ni `pnpm`.

## 3. Textos de ayuda

Se reescribieron los textos que describían la implementación (por ejemplo, «Historial
append-only», «foto inmutable», «el servidor rechaza (conflicto)», «Validación del
servidor», etiquetas de redondeo con `HALF_UP`) en lenguaje de usuario, conservando las
mismas reglas.

## Verificación

- Unitarias web: notificaciones (variantes, roles accesibles, duración, cierre, pausa,
  máximo visible, repetidos, sin éxito ante rechazo), traducción de mensajes y unidades.
- Integración API (PostgreSQL 18): 15 unidades con código `UNI-###` y símbolo; dos
  ejecuciones adicionales sin cambios; alta de unidad propia que continúa la secuencia.
- Base con unidades heredadas («KG», «M», «Metros cuadrados», «lts», códigos `UNI-` ya
  ocupados) más materiales y APU: sin duplicados, datos previos idénticos, códigos salteados.
- E2E desktop y móvil: posición de la notificación, texto en una línea, cierre, error
  persistente sin detalles técnicos, selectores con nombre y símbolo y ayuda de precios.
