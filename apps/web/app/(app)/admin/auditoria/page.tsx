'use client';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, DefList, Empty, ErrorBox, Loading, Modal, Mono, PagerBar, SelectField, TextField } from '@/components/ui';
import { useAll, usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { Schemas } from '@/lib/api';

type Log = Schemas['AuditEntry'];

type Filters = { entity: string; entityId: string; actorId: string; action: string; from: string; to: string };
const EMPTY: Filters = { entity: '', entityId: '', actorId: '', action: '', from: '', to: '' };
const ENTITIES: Record<string, string> = {
  ApuItem: 'Actividad de obra',
  ActivityCosting: 'Composición del costo',
  CatalogLoadRun: 'Carga de catálogo',
  CatalogOrigin: 'Origen de catálogo',
  categories: 'Rubro',
  Client: 'Cliente',
  Computation: 'Cómputo',
  InventoryBatch: 'Lote de inventario',
  LaborRate: 'Tarifa de mano de obra',
  LaborResource: 'Recurso de mano de obra',
  Location: 'Ubicación',
  Material: 'Material',
  MaterialPrice: 'Precio de material',
  MaterialRequest: 'Pedido de materiales',
  Presentation: 'Presentación de compra',
  PurchaseOrder: 'Orden de compra',
  BudgetTemplate: 'Plantilla de presupuesto',
  Budget: 'Presupuesto',
  BudgetDraft: 'Borrador de presupuesto',
  Supplier: 'Proveedor',
  Quotation: 'Cotización',
  Receipt: 'Recepción',
  Reservation: 'Reserva de stock',
  BudgetVersion: 'Revisión de presupuesto',
  StockBalance: 'Saldo de stock',
  StockMovement: 'Movimiento de stock',
  units: 'Unidad',
  User: 'Usuario',
  Work: 'Obra',
  clients: 'Importación de clientes',
  suppliers: 'Importación de proveedores',
  works: 'Importación de obras',
  materials: 'Importación de materiales',
  prices: 'Importación de precios',
  'purchase-orders': 'Importación de órdenes de compra',
  'initial-stock': 'Importación de stock inicial',
};
const ACTIONS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  ISSUE: 'Emisión',
  RESERVE: 'Reserva',
  PAYMENT_INFORMATION: 'Cambio de estado informativo de pago',
  ADJUSTMENT: 'Ajuste de stock',
  APPLY_REFERENCE_COSTS: 'Aplicación de costos de referencia',
  ASSIGN_WORKS: 'Asignación de obras',
  BOOTSTRAP_ADMIN: 'Alta inicial de Gerencia',
  CANCEL: 'Cancelación',
  CONNECT_VERIFIED_BASE_MATERIALS: 'Vinculación de materiales verificados',
  CONSUMPTION: 'Consumo',
  CORRECT_VERIFIED_SERVICE_LINK: 'Corrección de vínculo de servicio',
  CREATE_DEMO_ACCOUNT: 'Creación de cuenta demo',
  CREATE_VERSION: 'Creación de versión de costos',
  DELEGATE_RECEPTION: 'Delegación de recepción',
  IMPORT: 'Importación',
  INITIAL: 'Stock inicial',
  INSTALL_BASE: 'Incorporación de plantilla BASE',
  INVOICE_INFO: 'Registro de datos de factura',
  INVOICE_REFERENCE: 'Registro de referencia de factura',
  LOAD_REFERENCE_CATALOG: 'Carga de catálogo de referencia',
  LOGIN: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión',
  MINIMUM_BATCH: 'Configuración de mínimos por lote',
  MOVEMENT_BATCH: 'Registro de movimientos por lote',
  PDF_NOTES_VISIBILITY: 'Cambio de visibilidad de notas del PDF',
  PDF_PRESENTATION: 'Registro de presentación del PDF',
  PDF_VERSION: 'Registro de versión del PDF',
  RECEIPT: 'Ingreso por recepción',
  RECEIVE: 'Recepción registrada',
  RECONCILE_SOURCE_CATEGORY: 'Conciliación de rubro de origen',
  REPLACE_MATERIAL_AGGREGATE: 'Sustitución de costo agregado de materiales',
  RESERVE_RECEIPT: 'Reserva desde recepción',
  RETIRE_PROVISIONAL_PRICE_REFERENCE: 'Retiro de precio provisional',
  RETIRE_UNUSED_IMPORTED_SERVICE: 'Retiro de servicio importado en desuso',
  RETURN: 'Devolución',
  REVIEW_PRICES: 'Revisión de precios',
  SAVE_DRAFT: 'Guardado de borrador',
  SELECT: 'Selección de cotización',
  SELECT_REFERENCE: 'Selección de referencia de abastecimiento',
  SET_MINIMUM: 'Configuración de mínimo',
  STATUS: 'Cambio de estado',
  TRANSFER: 'Transferencia',
};
const options = (labels: Record<string, string>) => Object.entries(labels)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, 'es'));
const entityOptions = options(ENTITIES);
const actionOptions = options(ACTIONS);
const auditLabel = (labels: Record<string, string>, code: string) =>
  Object.hasOwn(labels, code) ? labels[code] : code;

/** Día local (yyyy-mm-dd) a instante ISO; `to` incluye el día completo. */
function dayToIso(day: string, end: boolean): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default function AuditoriaPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('adjustStock')}>
      <Auditoria />
    </RequirePerm>
  );
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return (
    <pre className="mono small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface2)', padding: 10, borderRadius: 8, maxHeight: '40vh', overflow: 'auto', margin: 0 }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Auditoria() {
  const [f, setF] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [sel, setSel] = useState<Log | null>(null);
  const t = (v: string) => v.trim() || undefined;
  // Todos los filtros se aplican en el servidor antes de paginar; fechas ISO inclusivas.
  const list = usePaged<Log>(
    '/audit',
    { entity: t(applied.entity), entityId: t(applied.entityId), actorId: applied.actorId || undefined, action: t(applied.action), from: dayToIso(applied.from, false), to: dayToIso(applied.to, true) },
    50,
  );
  // Selector de usuario: esta pantalla es sólo de Gerencia, que sí puede listar /users.
  const users = useAll<Schemas['User']>('/users');
  const actor = (l: Log) => (l.actorId ? l.actorName ?? 'Usuario sin nombre' : 'Sistema');
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const anyApplied = Object.values(applied).some(Boolean);
  return (
    <Page title="Auditoría" crumb="Administración">
      <Card bodyClass="">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(f);
          }}
        >
          <SelectField
            id="f-audit-actor"
            label="Usuario"
            value={f.actorId}
            onChange={set('actorId')}
            placeholder="Todos"
            options={users.rows.map((u) => ({ value: u.id, label: u.name }))}
          />
          <TextField id="f-audit-from" label="Desde" type="date" value={f.from} onChange={set('from')} />
          <TextField id="f-audit-to" label="Hasta (inclusive)" type="date" value={f.to} onChange={set('to')} />
          <SelectField label="Tipo de registro" value={f.entity} onChange={set('entity')} placeholder="Todos" options={entityOptions} />
          <SelectField label="Operación" value={f.action} onChange={set('action')} placeholder="Todas" options={actionOptions} />
          <details>
            <summary>Filtro por identificador</summary>
            <TextField label="ID de registro" value={f.entityId} onChange={set('entityId')} />
          </details>
          <Button type="submit" variant="sec">Filtrar</Button>
          {anyApplied && (
            <Button variant="ghost" onClick={() => (setF(EMPTY), setApplied(EMPTY))}>Limpiar</Button>
          )}
        </form>
        {list.error ? (
          <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable collection={{resource:"audit",filters:{entity:t(applied.entity),entityId:t(applied.entityId),actorId:applied.actorId||undefined,action:t(applied.action),from:dayToIso(applied.from,false),to:dayToIso(applied.to,true)},total:list.pagination?.total,reload:list.reload}}
            rows={list.rows}
            rowKey={(l) => l.id}
            onRowClick={setSel}
            columns={[
              { key: 'f', header: 'Fecha', render: (l) => formatDateTime(l.createdAt) },
              { key: 'u', header: 'Usuario', render: (l) => actor(l) },
              { key: 'a', header: 'Operación', render: (l) => auditLabel(ACTIONS, l.action) },
              { key: 'e', header: 'Tipo de registro', render: (l) => auditLabel(ENTITIES, l.entityType) },
            ]}
            mobile={(l) => (
              <div>
                <div className="row"><b>{auditLabel(ACTIONS, l.action)}</b><span style={{ flex: 1 }} />{formatDateTime(l.createdAt)}</div>
                <span className="small muted">{auditLabel(ENTITIES, l.entityType)} · {actor(l)}</span>
              </div>
            )}
            empty={<Empty title={anyApplied ? 'Sin registros con esos filtros' : 'Sin registros de auditoría'} />}
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} side title="Detalle de auditoría">
        {sel && (
          <>
            <DefList
              items={[
                ['Fecha', formatDateTime(sel.createdAt)],
                ['Usuario', actor(sel)],
                ['Operación', auditLabel(ACTIONS, sel.action)],
                ['Tipo de registro', auditLabel(ENTITIES, sel.entityType)],
              ]}
            />
            <details>
              <summary>Detalle técnico</summary>
              <DefList items={[
                ['Código de operación', <Mono key="a">{sel.action}</Mono>],
                ['Código de tipo', <Mono key="e">{sel.entityType}</Mono>],
                ['ID de registro', <Mono key="i">{sel.entityId}</Mono>],
              ]} />
              <b>Antes</b>
              {sel.before === null && sel.action !== 'CREATE' ? <p className="small muted">Sin estado previo registrado.</p> : <Json value={sel.before} />}
              <b>Después</b>
              <Json value={sel.after} />
            </details>
          </>
        )}
      </Modal>
    </Page>
  );
}
