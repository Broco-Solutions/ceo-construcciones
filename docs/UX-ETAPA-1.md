# UX de cierre de Etapa 1

## Glosario visible

| Interno compatible | Texto de interfaz |
|---|---|
| APU / `apu-items` | Actividad de obra |
| análisis | Composición del costo |
| costo unitario | Costo por unidad |
| coeficiente | Consumo por unidad |
| snapshot | Revisión guardada |
| override | Ajuste para este presupuesto |

Las rutas/API internas se mantienen mientras existan consumidores V1; la navegación no obliga al usuario a conocer esos nombres. El código automático puede conservar el prefijo histórico APU, como identificador.

## Recorrido implementado

El alta de presupuesto elige obra y plantilla, incluida BASE por incorporación explícita. El editor reúne Cómputo y costos, Precio de venta, Presentación y PDF, Materiales previstos e Historial. Cambiar cantidades calcula en servidor sin crear revisiones; la composición se edita en un diálogo contextual. VARIOS y otros directos no requieren inventar materiales. La rentabilidad se define al cerrar el precio de venta. Guardar mantiene un borrador; emitir crea una revisión y descarga su PDF.

Se reutilizan tokens CSS, AppPage, Card, formularios, Modal, Button, Tabs, PagerBar y notificaciones existentes. Se conserva la navegación anterior para presupuestos V1 y enlaces guardados. Clientes y sus obras se enlazan desde las fichas; indicadores ofrecen filtros servidor. Administración muestra únicamente su escritorio y recepción delegada, según permiso.

Los estados de carga, error, conflicto, falta de esquema y falta de datos tienen mensajes distintos. Moneda o tratamiento fiscal no convierten precios silenciosamente. La composición física incompleta se advierte en el editor y necesidades; no se representa como cobertura exacta. No hay pasos de aprobación obligatorios para OC ni para recepción delegada.

## Revisión visual ejecutada

Los recorridos Playwright usan API, sesión, proxy y PostgreSQL reales. El editor se captura a 1440, 1280, 768, 390 y 360 píxeles y comprueba ausencia de desborde de página. El escenario verifica que la cantidad conserva foco mientras llegan cálculos. Se inspeccionaron visualmente capturas de escritorio y celular, recepción delegada de Administración y la composición BASE extensa. La regresión móvil conserva pedido, recepción, consumo/devolución y notificaciones.

Capturas: `apps/web/docs/evidencia/cierre/` y evidencia V1 regenerada en `apps/web/docs/evidencia/`. El render comercial DG tiene siete páginas; se inspeccionan inicio/cierre, acentos, unidades, nombres largos, subtotales, total y partidas incluidas. Todos sus bloques están dentro de los márgenes y no contiene costos ni recargos internos. Ver [conciliación DG](DG-1153-RECONCILIACION.md) y [aceptación](ACEPTACION-CIERRE-ETAPA-1.md).
