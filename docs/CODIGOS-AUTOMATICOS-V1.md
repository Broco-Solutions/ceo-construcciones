# Códigos automáticos V1

## Convención de códigos

| Entidad | Prefijo | Primer código |
|---|---|---|
| Obras | OBR | OBR-001 |
| Proveedores | PRV | PRV-001 |
| Rubros | RUB | RUB-001 |
| Unidades | UNI | UNI-001 |
| Materiales | MAT | MAT-001 |
| Galpones y patios | UBI | UBI-001 |
| Ítems APU | APU | APU-001 |

El código se genera al **guardar**, nunca se reserva al abrir el formulario.
Se muestra de solo lectura en alta y edición. La numeración parte de 001 o
continúa después del mayor código válido preexistente de cada tipo.

La ubicación creada automáticamente al crear una obra mantiene su convención
histórica `OBRA-<codigo-de-obra>` (por ejemplo `OBRA-OBR-001`).

## API y compatibilidad

Los endpoints POST de las entidades anteriores aceptan `code: "AUTO"`
como señal explícita para reservar el siguiente código en el servidor; esto
mantiene el contrato OpenAPI actual (código requerido en POST). Los otros
clientes pueden continuar enviando códigos propios y las importaciones
conservan los códigos del origen sin renumerar registros existentes.

El POST de APU también genera código cuando el campo está ausente o es nulo.
Para edición, el backend conserva la compatibilidad anterior con códigos
manuales; la interfaz de usuario no los permite cambiar.

## Garantías de integridad

La migración `20261022000300_code_counters` crea `CodeCounter`
con una fila por entidad e inicializa sus valores leyendo el máximo sufijo
numérico existente. No modifica tablas ni códigos previos.

El contador se incrementa dentro de la **misma transacción Serializable**
que crea el registro; un conflicto por concurrencia se reintenta por la
función compartida de transacciones. El código reservado no se pierde si
falla la creación. Si una importación posterior trae un código de la misma
serie, se salta el valor ocupado sin reescribir datos.

## Puesta en marcha en Railway

1. Revisar y fusionar PR después de que CI API y Web estén verdes.
2. Verificar que Railway haya terminado de desplegar el nuevo código.
3. En la consola API (`/app`), ejecutar:

   `./node_modules/.bin/prisma migrate deploy`

4. Comprobar `./node_modules/.bin/prisma migrate status`: debe incluir la
   nueva migración aplicada. **No usar `migrate dev` ni `db push`.**
5. Probar una alta de obra, proveedor y rubro; verificar secuencia, accesos
   y edición sin cambiar códigos. No ejecutar tests E2E sintéticos en producción.

La migración requiere autorización del operador responsable del entorno.
No se aplica automáticamente al arrancar el servicio, y un build exitoso
por sí solo no la aplica.
