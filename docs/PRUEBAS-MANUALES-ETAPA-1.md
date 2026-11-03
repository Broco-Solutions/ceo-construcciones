# Pruebas manuales de Etapa 1

Este entorno es local, aislado y persistente. Las pruebas manuales no equivalen a aceptación del piloto ni habilitación productiva. No se aplican migraciones ni datos a producción.

Código funcional probado: `3fa7a54bf68f7266a527e8e1c3d50a6956703be0`. El smoke se ejecutó sobre estos mismos archivos antes del commit; API 174 + 3 runtime, web 47, E2E 68 y compatibilidad V1/ampliada aprobaron. La revisión posterior de integridad también pasó API completo; CI del PR vuelve a construir y probar el candidato integrado. El arranque registra el SHA realmente compilado en `release.json`; la comprobación posterior al merge se añade al registro del [PR #9](https://github.com/Broco-Solutions/ceo-construcciones/pull/9).

## Arranque desde WSL

Desde una terminal WSL, con Docker local disponible:

```bash
cd /home/rcoirini/proyectos-bs/ceo-construcciones
bash CEO_Manual_Local.sh start
```

Esperar el mensaje `LISTO`. El comando valida Docker/destino/puertos, aplica las migraciones de aplicación exclusivamente a `ceo_manual_test`, completa los datos iniciales faltantes y compila ambos servidores. No resetea la base, no cambia contraseñas existentes y no mata procesos ajenos. Dejar esta terminal abierta. No ejecutar el runner automatizado ni otro build mientras estos servidores usan `.next`.

- Aplicación: <http://localhost:3100>
- API/health: <http://127.0.0.1:3101/api/health>
- Detener desde otra terminal: `bash CEO_Manual_Local.sh stop`; también sirve Ctrl+C en la terminal supervisora.
- Comprobar procesos, versión y ubicación de credenciales: `bash CEO_Manual_Local.sh status`.
- Repetir el smoke de sólo lectura y edición descartada: `node apps/web/scripts/manual-smoke.mjs`.

El SHA, árbol y huella de cambios que **efectivamente se compilaron** quedan en `~/.local/state/ceo-construcciones-codex/manual/release.json`. Un árbol con cambios locales se identifica explícitamente. La sesión de Codex puede cerrar sus procesos al finalizar: el comando anterior es el arranque para la terminal del usuario, no una promesa de que la app permanezca encendida.

Las credenciales únicas de los cinco perfiles están en `~/.local/state/ceo-construcciones-codex/manual/credenciales.json` (permiso 600). Consultarlas localmente con `less` y no pegarlas en tickets, Git o chats. Los logs, conexión manual y evidencias también quedan en esa carpeta privada. No usar credenciales productivas.

## Datos iniciales y repetición

Cliente `MAN-CLI`: obras Norte y Sur (`MAN-OBR-1/2`). Otro cliente: obra ajena `MAN-OBR-3`. El Jefe de Obra está asignado inicialmente sólo a Norte. Cinco perfiles, tres proveedores `MAN-PROV-1/2/3`, cemento/cal, precios, plantilla sintética, galpón `MAN-GAL` y patio `MAN-PAT`. Administración tiene recepción delegada en galpón. Hay stock sintético, OC de obra pendiente de recibir y OC general con importe informativo de factura.

El presupuesto sintético tiene costo unitario 1.524 ARS: mano de obra 1.000 + directo 500 + dos unidades de material a 12. Con cantidad 2, costo 3.048; recargo 50%, venta 4.572. Son valores iniciales: conservar los cambios realizados durante pruebas. Para repetir un recorrido comercial, crear otro presupuesto desde la plantilla y usar nombres distintivos; para compras, crear nuevos documentos. No borrar ni resetear para repetir.

BASE se incorpora como una plantilla versionada. DG está sólo en esta instalación privada, si existe su archivo normalizado privado; no contiene composición física íntegramente validada. Los faltantes se muestran por partida. El ejemplo sintético completo permite probar el flujo sin esos límites históricos.

## Recorrido de aceptación manual

| Caso | Acción | Resultado esperado |
|---|---|---|
| 1. Cliente y obras | Gerencia: abrir MAN-CLI y las dos obras; crear otra obra con cliente | Relación persistida; el Jefe no puede abrir la obra ajena |
| 2. BASE y costo unitario | Nuevo presupuesto desde BASE; cantidades vacías y cero | Costo por unidad conocido visible; vacío pendiente, cero sin subtotal ni demanda; faltantes explícitos |
| 3. Cantidades y VARIOS | Sintético: cantidad 2; agregar actividad en VARIOS | Subtotal/totales actualizan sin perder foco; no se deducen insumos de directos |
| 4. Salida del editor | Modificar; breadcrumb, menú, Atrás/Adelante y logout; probar las tres decisiones | Cancelar conserva escrito/destino; guardar sale una vez; descartar no persiste; recarga/cierre usa aviso nativo |
| 5. Moneda/IVA | Cancelar cambio; luego confirmar y restaurar revisión | Cancelar deja todo igual; confirmar exige revisión sin convertir importes; restaurar recupera borrador anterior |
| 6. Composición y corralones | Agregar/reemplazar/quitar material; consumo/precio; comparar proveedores, Tab/Escape | Una capa modal; equivalencia explícita; sin duplicados; precio manual retira procedencia; maestro intacto |
| 7. Rentabilidad | Cambiar recargo final y comparar materiales | Cambia precio comercial; mismas cantidades de materiales y costo |
| 8. R1/R2/PDF | Emitir, modificar borrador y emitir de nuevo; abrir R1, historial y PDF | Dos revisiones, una referencia; R1 inmutable; PDF comercial sin costos, recargo ni composición interna |
| 9. Excel de precios | Archivo sintético, mapear, revisar inconsistencias, confirmar e intentar repetir | Vista previa no importa; confirmación persiste; idempotencia impide duplicación |
| 10. Abastecimiento | Nueva necesidad 100; pedido 40; OC 40; recepción parcial 20; consumo 5; transferencia aparte | Sin doble conteo; transferencia cambia ubicación, no consumo; OC sin aprobación obligatoria |
| 11. Administración | Acceder con su perfil; recibir OC general delegada; revisar importe/estado de factura | Alcance limitado; sin presupuestos, catálogo económico general ni obras ajenas |
| 12. Indicadores | Gerencia: cliente/obra/proveedor, emitir nueva revisión y exportar | No suma R1+R2 como dos presupuestos; filtros y exportación consistentes |

Revisar también móvil 360/390 y escritorio 1280/1440, teclado, estados de guardado, condiciones largas y PDF de varias páginas. Registrar caso, perfil, nombre del documento, acción, resultado observado y esperado. No adjuntar credenciales ni originales privados.

## Separación de resultados

Un error de edición, cálculo, permiso o integridad es un defecto de aplicación. Una partida histórica sin rendimiento/unidad verificada es una limitación específica de datos, detallada en [conciliación DG](DG-1153-RECONCILIACION.md); reconocer un aviso no vuelve exacta la demanda. La habilitación productiva, sus migraciones/datos y la aceptación operativa por CEO son posteriores y requieren su proceso autorizado.

La evidencia de esta pasada se registra en [aceptación](ACEPTACION-CIERRE-ETAPA-1.md) y [estado](ESTADO-CIERRE-ETAPA-1.md). Consultar allí el candidato validado y la integración; `release.json` acredita el binario local usado.
