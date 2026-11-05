# CEO Construcciones

Sistema de obras, presupuestos, compras e inventario. Monorepo pnpm/TypeScript con Next.js en `apps/web` y `apps/api`; Prisma/PostgreSQL exclusivamente en API. Node 24, pnpm 10.18.3. La demo online no equivale a aceptación operativa del piloto.

- **Aplicación:** https://ceo-construcciones.brocosolutions.com
- **Estado, candidato y checks:** [ESTADO-PROYECTO](docs/ESTADO-PROYECTO.md).
- **Único plan activo:** [UX/UI transversal](CEO_PLAN_UX_UI_TRANSVERSAL_CODEX.md); [matriz y evidencias](docs/UX-TRANSVERSAL-ETAPA-1.md).
- **Alcance:** [PRD](docs/PRD-ETAPA-1.md), [decisiones](docs/DECISIONES-CIERRE.md), [requisitos/trazabilidad](docs/REQUISITOS-ETAPA-1-CIERRE.md) y [aceptación](docs/ACEPTACION-CIERRE-ETAPA-1.md). Contrato/Anexo I prevalecen; pendientes conservados.
- **Operación:** [demo online y accesos privados](docs/DEMO-ONLINE.md), [pruebas manuales/local](docs/PRUEBAS-MANUALES-ETAPA-1.md), [backend](docs/OPERACION-BACKEND.md) y [compatibilidad/release](docs/RELEASE-CIERRE-ETAPA-1.md).
- **Contratos:** [API y comandos](apps/api/README.md), [OpenAPI](docs/api/openapi.json), [integración web](docs/INTEGRACION-CLAUDE-CODE.md), [modelo](docs/MODELO-DATOS.md).
- **Datos CEO:** [resultados de carga](docs/CARGA-INICIAL-RESULTADOS.md), [aceptación de costos](docs/ESTADO-CARGA-INICIAL-Y-COSTOS.md) y [conciliación DG](docs/DG-1153-RECONCILIACION.md). Las 76 composiciones parciales no se completan por suposición.
- **Trabajo de agentes:** [AGENTS](AGENTS.md) e [instrucciones de continuidad](docs/INSTRUCCIONES-PROYECTO-CHATGPT.md).

## Trabajo y comprobaciones locales

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/api db:generate
bash CEO_Manual_Local.sh start
bash CEO_Verificar_Local.sh api
bash CEO_Verificar_Local.sh web
bash CEO_Verificar_Local.sh e2e
```

Consultar la guía manual antes de preparar el entorno. Los verificadores API/E2E usan bases aisladas nuevas; la base manual es persistente y distinta. No compilar sobre una app activa ni usar credenciales productivas para tests. El arranque no carga producción ni restablece usuarios. Seguridad, permisos, cálculos decimales e históricos se validan en servidor.
