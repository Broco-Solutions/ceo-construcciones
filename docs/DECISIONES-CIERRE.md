# Decisiones del cierre de Etapa 1

## Confirmadas por el usuario

- Codex implementa API y web durante esta misión.
- La interfaz muestra Actividades de obra, Costo por unidad y Composición del costo.
- Clientes pueden tener varias obras; obras históricas sin cliente continúan legibles.
- Se autorizan costos directos/VARIOS, recargo comercial, revisiones, PDF comercial, importación Excel, necesidades netas, Administración restringida e indicadores.
- No se toca infraestructura ni se ejecutan migraciones/importaciones en producción.

## Decisiones técnicas aplicadas

- La relación `Work.clientId` es nullable para preservar el histórico. Con esquema ampliado, toda obra nueva requiere cliente activo, incluso con catálogo vacío. Frente a esquema V1 se conserva el alta original y se informa que clientes aún no están habilitados; no se inventa una identidad transitoria.
- La migración comercial es aditiva y añade el perfil `ADMINISTRACION`; los permisos de negocio se otorgan por allowlist de servidor, nunca sólo desde el menú.
- El sondeo read-only del esquema habilita funciones por capacidad real; las consultas implícitas y relaciones de Work se proyectan a campos V1 mientras faltan columnas. No se ejecuta DDL desde requests ni se agregan variables cloud.
- OC nuevas guardan una política independiente de importes: HALF_UP a dos decimales por renglón; total suma importes mostrados. Las históricas sin política conservan exactitud/aviso original.
- Recibir en galpón una OC destinada a obra reserva esas unidades para la obra y vincula recibo/reserva. Trasladar satisface esa reserva. Una compra general no se asigna automáticamente. Históricos sin vínculo suficiente se advierten como orientativos.
- Precios cero explícitos son válidos; faltante conserva null/ausencia. Referencias futuras o de proveedores inactivos no se proponen como vigentes. Comparación separa moneda/IVA y verifica equivalencias almacenadas.
- BASE real se incorpora sólo por acción explícita y atómica, con códigos propios estables; no se carga desde una migración ni al iniciar servidor. La fuente tiene referencias IVA contradictorias: la plantilla conserva `UNSPECIFIED` y observaciones, sin inventar una tasa. Cantidad cero excluye la partida de costos/demanda; las positivas incompletas bloquean emisión.
- Adaptadores de transición y lectura XLS son herramientas de datos locales aisladas. No incorporan sincronización externa ni ejecutan contenido activo. Los pendientes de OC se calculan ordenado menos recibido antes de importar, sin generar stock previo.
- La demanda física se redondea a ocho decimales HALF_UP por material/rubro y se consolida desde esas mismas filas, como inventario. Una cantidad positiva inferior a la precisión admitida no se transforma en cero silenciosamente. Los importes comerciales se calculan con Decimal y se redondean a dos decimales por partida.
- `ApuItem.directCost` guarda costos directos reutilizables, sin alterar recetas ni columnas de mano de obra existentes. La proyección V1 omite esa columna hasta que esté disponible.
- La fuente incompleta conserva `materialDemandIncomplete`; el usuario puede registrar su revisión en Materiales previstos. Necesidades indica orientación y no exactitud mientras persista ese estado. Esto no impide emitir un precio comercial conocido ni impone un circuito de aprobación.
- El PDF imprime el precio unitario comercial con su precisión de cálculo para que explique el importe extendido de dos decimales. Emisiones congelan datos públicos, condiciones y versión de formato; una descarga posterior no consulta nombres o precios maestros actuales.
- Indicadores suman una emisión vigente por presupuesto. No convierten versiones V1 de costos en ventas ni mezclan monedas/IVA. OC antiguas con fracciones recurrentes y sin política declarada se cuentan como sin valorización verificable, sin inventar cero.
