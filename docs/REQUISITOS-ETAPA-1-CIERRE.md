# Matriz requisito → código → prueba → evidencia

Actualizada al hito F8 del 03/11/2026. Las rutas API son relativas a `apps/api/src/` y las pantallas/componentes a `apps/web/`. Los nombres de pruebas abreviados corresponden a archivos del repositorio, ejecutados contra PostgreSQL real cuando requieren persistencia.

La implementación funcional F1–F7 está verificada. El estado de candidato/CI/integración se consulta en [ESTADO-CIERRE-ETAPA-1.md](ESTADO-CIERRE-ETAPA-1.md). “Verificado” no significa habilitado en producción ni aceptación del piloto por CEO.

| Requisito | Comportamiento implementado | Código | Prueba real | Evidencia/alcance |
|---|---|---|---|---|
| R01 | Auth, asignaciones y allowlists de servidor | core/auth.ts; router.ts; reception-access.ts | access-contract; closure-access; login-protection; auth.spec | T03–05/T36/T51 |
| R02 | ABM y ficha de clientes | catalog.ts; clientes/; ClientForm.tsx | closure-access; closure.spec | T01/T02 |
| R03 | Cliente con varias obras; vínculo histórico nullable | schema.prisma; catalog.ts; WorkForm.tsx | closure-access; closure.spec; release-compatibility | T01/T02/T47 |
| R04 | Obras V1 extendidas y proyección compatible | core/db.ts; catalog.ts; obras/ | catalog-integration-gaps; release-compatibility | T01–03/T52 |
| R05 | Proveedores e historia conservados | catalog.ts; procurement.ts; proveedores/ | integration; procurement; journey.spec | T06/T35 |
| R06 | Materiales, unidades y rubros conservados | catalog.ts; base-template.ts | catalog-integration-gaps; automatic-codes; journey.spec | T06/T23 |
| R07 | Actividades, costo por unidad y composición | ApuForm.tsx; BudgetEditor.tsx; budgets.ts | commercial.integration; closure.spec; visual.spec | T07/T09–12 |
| R08 | Plantillas, BASE y copia independiente | base-template.ts; commercial.ts; data/base-template.json | commercial.integration; zz-base.spec; historical-db-fixture | T08/T10 |
| R09 | Grilla, cálculo inmediato, ayuda aritmética y conflicto | commercial-domain.ts; BudgetEditor.tsx | commercial.test; commercial.integration; closure.spec | T09/T13/T14 |
| R10 | Directos y VARIOS sin porcentaje impuesto | commercial-domain.ts; budgets.ts; ApuItem.directCost | commercial.test; commercial.integration; DG real | T11 |
| R11 | Recargo general y excepciones que reemplazan | commercial-domain.ts; BudgetEditor.tsx | commercial.test; closure.spec; DG real | T12 |
| R12 | Borrador optimista, R1/R2 inmutables y referencia separada | commercial.ts; BudgetDraft; BudgetIssue | commercial.integration; net-needs.integration; closure.spec | T15–18/T53 |
| R13 | PDF comercial, preview y datos congelados | commercial-pdf.ts; commercial.ts | commercial.integration; closure.spec; PDF DG renderizado | T19–21 |
| R14 | Historia y actualización deliberada de borrador | reference-prices.ts; commercial.ts; PriceComparison.tsx | reference-prices.integration; commercial.integration | T10/T22 |
| R15 | Tres corralones, equivalencias y revisión mensual | reference-prices.ts; PriceComparison.tsx | reference-prices.test; reference-prices.integration | T23/T24 |
| R16 | XLSX, mapeo, diferencias y commit atómico | reference-prices.ts; imports.ts; PriceImport.tsx | reference-prices.integration; imports.integration | T25–28 |
| R17 | Pedido manual y permisos preservados | procurement.ts; pedidos/nuevo/ | procurement; net-needs.integration; flows.spec; journey.spec | T29/T35 |
| R18 | Necesidades P−C−S−T sin doble conteo | net-needs.ts; ReceiptCoverage; procurement.ts | net-needs.integration; closure.spec; DG real | T30–34 |
| R19 | OC sin aprobación obligatoria, historia y política de importes | procurement.ts; shared.ts; OrderAmountPolicy | procurement; catalog-integration-gaps; journey.spec | T35/T37/T54 |
| R20 | Recepción parcial/total e idempotencia transaccional | procurement.ts; reception-access.ts | inventory; procurement; closure-access; journey.spec | T35–38 |
| R21 | Delegación por destino con revocación efectiva | reception-access.ts; receipt-desk.ts; DelegationsForm.tsx | closure-access; closure.spec | T36 |
| R22 | Administración y factura/pago informativos auditados | order-administration.ts; administracion/; permissions.ts | closure-access; management-reports; closure.spec | T04/T05/T39 |
| R23 | Stock, reservas, traslado, consumo, devolución y mínimos | inventory.ts; net-needs.ts; MovementForm.tsx | inventory; inventory-integration-gaps; journey.spec; mobile.spec | T38/T40 |
| R24 | Seguimiento cuantitativo y Excel conciliados | reports.ts; management-reports.ts; reportes/ | reports.integration; management-reports.integration; journey.spec | T41–44 |
| R25 | Indicadores por cliente/obra/proveedor, moneda e IVA | management-reports.ts; indicadores/ | management-reports.integration; closure.spec | T41–44 |
| R26 | UX integrada, tokens y navegación responsive | BudgetEditor.tsx; shell.tsx; globals.css; lib/nav.ts | closure.spec; zz-base.spec; visual.spec; inspección PNG | T07/T09/T13/T48–50 |
| R27 | Adaptador, dry-run y ejecución idempotente aislada | transition-ceo-obras.ts; imports.ts | transition.integration; release-compatibility | T45/T47; corte empresarial pendiente de export real |
| R28 | Regresión API/PostgreSQL, runtime y navegador real | tests/; e2e/; workflows/api.yml; workflows/web.yml | Ver ACEPTACION-CIERRE-ETAPA-1.md y checks del PR | T51/T52 y suites completas |
| R29 | Fuera de la misión, por instrucción del usuario | Sin cambios de configuración | No se declara verificado | Obligación contractual preservada |
| R30 | DG REV C real, costos/venta/recargos/PDF y demanda conocida | read-historical-xls.py; reconcile-dg.ts; historical-db-fixture.ts | DG-1153-RECONCILIACION.md; verification.json privado | T46 ejecutado con diferencias; composición física completa pendiente de datos |

La demanda de fuentes incompletas conserva `materialDemandIncomplete`, `exact: false` y advertencias. No se marca completa la composición física DG por disponer de un costo agregado. BASE y DG no se cargaron en producción. La transición empresarial exige el export definitivo; el adaptador probado no equivale a haber migrado las OC reales.


## Correcciones de aceptación posteriores al PR8

| Hallazgo | Reproducción / corrección | Código | Regresión / evidencia |
|---|---|---|---|
| H01 | Pérdida por salida sin decisión; guardado asíncrono y logout coordinados | `lib/navigation.tsx`, `session.tsx`, `BudgetEditor.tsx`, navegación existente | `editor-corrections.spec.ts`: breadcrumb, menú, móvil, Atrás/Adelante, logout, conflicto real, respuesta demorada, recarga/cierre nativo |
| H02 | Costo unitario antes de cantidades; cero no produce demanda, vacío pendiente | `commercial-domain.ts`, OpenAPI y editor | `commercial.test.ts`, `zz-base.spec.ts`: BASE 146 actividades, cero/vacío/positivo; precio faltante |
| H03 | Confirmación previa y revisión reversible de moneda/IVA | `BudgetEditor.tsx` | `editor-corrections.spec.ts`: cancelar idéntico, revisar sin convertir, restaurar |
| H04 | Material de catálogo contextual, reemplazo, consumo/precio, agregado sin doble costo | editor, `commercial.ts`, `commercial-domain.ts` | API real + E2E: equivalencia, duplicados, procedencia, cero/nulo, R1/R2, auditoría |
| H05 | Comparador como subvista de la composición | editor, `Modal`, `MaterialPicker` | E2E: única capa, Tab, Escape, retorno y foco |
| DG | Extracción simbólica acotada y faltantes por partida, no reconocimiento global | `historical-composition.ts`, extractores BASE/DG, revisión en editor/API | 4 pruebas del adaptador; fixture DG PostgreSQL; [conciliación](DG-1153-RECONCILIACION.md) |
| Manual | Base persistente exclusiva, cinco perfiles, credenciales privadas | `CEO_Manual_Local.sh`, `manual-local.ts`, `manual-smoke.mjs` | [guía](PRUEBAS-MANUALES-ETAPA-1.md); resultado real en aceptación/estado |

Los resultados finales de esta pasada se registran por corrida en aceptación; los conteos del PR8 se conservan como antecedente, no como prueba de estas correcciones.
