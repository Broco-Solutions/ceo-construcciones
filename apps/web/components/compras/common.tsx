'use client';
// Utilidades compartidas del módulo Compras (pedidos, cotizaciones, OC, recepciones).
import { unitSymbol } from '@/lib/units';
import './compras.css';
import { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { Schemas } from '@/lib/api';
import { useAll, useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime, parseDecimalInput } from '@/lib/format';
import { Card, ErrorBox, Loading, Pill } from '@/components/ui';

export type Work = Schemas['WorkList'];
export type Category = Schemas['Category'];
export type Unit = Schemas['Unit'];
export type Material = Schemas['Material'];
export type Location = Schemas['Location'];
export type Supplier = Schemas['Supplier'];
export type RequestDetail = Schemas['RequestDetail'];
export type RequestStatus = Schemas['RequestStatus'];
export type OrderDetail = Schemas['OrderDetail'];
export type ChiefOrder = Schemas['ChiefOrder'];
export type VisibleOrder = Schemas['VisibleOrder'];
export type OrderStatus = Schemas['PurchaseOrderStatus'];
export type QuotationStatus = Schemas['QuotationStatus'];
export type TaxBasis = Schemas['TaxBasis'];
export type AuditLog = Schemas['AuditEntry'];
export type Receipt = Schemas['ReceiptDetail'];

type Tone = 'ok' | 'warn' | 'bad' | 'blue' | 'plain';

export const REQUEST_STATUS: Record<RequestStatus, [string, Tone]> = {
  DRAFT: ['Borrador', 'plain'],
  SUBMITTED: ['Enviado', 'blue'],
  PROCESSING: ['En proceso', 'warn'],
  COMPLETED: ['Completado', 'ok'],
  CANCELLED: ['Cancelado', 'bad'],
};
/** Transiciones válidas según POST /requests/{id}/status. */
export const REQUEST_TRANSITIONS: Partial<Record<RequestStatus, RequestStatus[]>> = {
  SUBMITTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
};
export const ORDER_STATUS: Record<OrderStatus, [string, Tone]> = {
  DRAFT: ['Borrador', 'plain'],
  ISSUED: ['Emitida', 'blue'],
  PARTIALLY_RECEIVED: ['Recepción parcial', 'warn'],
  RECEIVED: ['Recibida', 'ok'],
  CANCELLED: ['Anulada', 'bad'],
};
export const QUOTATION_STATUS: Record<QuotationStatus, [string, Tone]> = {
  DRAFT: ['Borrador', 'plain'],
  RECEIVED: ['Recibida', 'blue'],
  SELECTED: ['Seleccionada', 'ok'],
  REJECTED: ['Rechazada', 'bad'],
};
export const TAX_BASIS: Record<TaxBasis, string> = {
  UNSPECIFIED: 'Sin especificar',
  INCLUDED: 'IVA incluido',
  EXCLUDED: 'Sin IVA (neto)',
};
export const LOCATION_KIND: Record<Location['kind'], string> = { WAREHOUSE: 'Galpón', YARD: 'Patio', WORK: 'Obra' };

export function StatusPill<S extends string>({ map, value }: { map: Record<S, [string, Tone]>; value: S }) {
  const [label, tone] = map[value] ?? [value, 'plain'];
  return <Pill tone={tone}>{label}</Pill>;
}

function byId<T extends { id: string }>(rows: T[]) {
  const m = new Map<string, T>();
  rows.forEach((r) => m.set(r.id, r));
  return m;
}
function useMap<T extends { id: string }>(path: string | null, query?: Record<string, string>) {
  const r = useAll<T>(path, query);
  const map = useMemo(() => byId(r.rows), [r.rows]);
  return { ...r, map };
}

/** Catálogos de lectura usados por todo el módulo. Proveedores sólo para roles económicos. */
export function useLookups(opts: { suppliers?: boolean } = {}) {
  const { can } = useSession();
  const works = useMap<Work>('/works');
  const categories = useMap<Category>('/categories');
  const units = useMap<Unit>('/units');
  const materials = useMap<Material>('/materials');
  const locations = useMap<Location>('/locations');
  const suppliers = useMap<Supplier>(opts.suppliers && can('readSuppliers') ? '/suppliers' : null);
  const loading = works.loading || categories.loading || units.loading || materials.loading || locations.loading || suppliers.loading;
  const error = works.error || categories.error || units.error || materials.error || locations.error || suppliers.error;
  const reload = () => [works, categories, units, materials, locations, suppliers].forEach((x) => x.reload());
  const workName = (id: string | null | undefined) => {
    if (!id) return 'Sin obra (general)';
    const w = works.map.get(id);
    return w ? `${w.code} · ${w.name}` : 'Obra';
  };
  const material = (id: string) => materials.map.get(id);
  const materialLabel = (id: string) => {
    const m = materials.map.get(id);
    return m ? `${m.code} · ${m.name}` : 'Material';
  };
  const unitOf = (materialId: string) => {
    const m = materials.map.get(materialId);
    return m ? unitSymbol(units.map.get(m.unitId)) : '';
  };
  const locationName = (id: string | null | undefined) => {
    if (!id) return '—';
    const l = locations.map.get(id);
    return l ? `${l.name} (${LOCATION_KIND[l.kind]})` : 'Ubicación';
  };
  const categoryName = (id: string | null | undefined) => (id ? categories.map.get(id)?.name ?? 'Rubro' : 'Sin rubro');
  const supplierName = (id: string | null | undefined) => (id ? suppliers.map.get(id)?.name ?? 'Proveedor' : '—');
  return { works, categories, units, materials, locations, suppliers, loading, error, reload, workName, material, materialLabel, unitOf, locationName, categoryName, supplierName };
}

/**
 * Nombre de usuario para DTO que todavía no traen nombre (pedido.requestedById, cotización.selectedById).
 * Sólo Gerencia consulta /users; el resto ve "Vos" o "Usuario". OC, recepciones e historiales usan
 * createdByName/invoiceLoadedByName/actorName del DTO y no pasan por acá.
 */
export function useUserName() {
  const { user, can } = useSession();
  const users = useMap<Schemas['User']>(can('adminUsers') ? '/users' : null);
  return (id: string | null | undefined) => {
    if (!id) return 'Sistema';
    if (id === user?.id) return `${user.name} (vos)`;
    return users.map.get(id)?.name ?? 'Usuario';
  };
}

/* ---------- aritmética decimal en texto (BigInt escalado), sólo para el stepper de cantidades ---------- */
const SCALE = 8;
function toScaled(s: string): bigint {
  const neg = s.startsWith('-');
  const [i, f = ''] = s.replace('-', '').split('.');
  const v = BigInt(i || '0') * BigInt(10) ** BigInt(SCALE) + BigInt((f + '0'.repeat(SCALE)).slice(0, SCALE) || '0');
  return neg ? -v : v;
}
function fromScaled(v: bigint): string {
  const neg = v < BigInt(0);
  const a = neg ? -v : v;
  const base = BigInt(10) ** BigInt(SCALE);
  const i = (a / base).toString();
  const f = (a % base).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${i}${f ? `.${f}` : ''}`;
}
/** Suma un entero (paso del stepper) a un decimal en texto. Nunca baja de 0. */
export function stepDecimal(value: string, delta: number): string {
  const cur = parseDecimalInput(value) ?? '0';
  const next = toScaled(cur) + BigInt(delta) * BigInt(10) ** BigInt(SCALE);
  return fromScaled(next < BigInt(0) ? BigInt(0) : next);
}
const toInput = (s: string) => s.replace('.', ',');

/** Control táctil de cantidad: −/+ grandes y entrada decimal con coma. `value` es texto tal como lo tipea el usuario. */
export function QtyInput({ value, onChange, label, invalid, disabled }: { value: string; onChange: (v: string) => void; label: string; invalid?: boolean; disabled?: boolean }) {
  return (
    <div className="cmp-qty">
      <button type="button" aria-label={`Restar 1 a ${label}`} disabled={disabled || !value || (parseDecimalInput(value) ?? '0') === '0'} onClick={() => onChange(toInput(stepDecimal(value, -1)))}>
        <Minus size={18} />
      </button>
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        aria-invalid={invalid ? true : undefined}
        placeholder="0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" aria-label={`Sumar 1 a ${label}`} disabled={disabled} onClick={() => onChange(toInput(stepDecimal(value, 1)))}>
        <Plus size={18} />
      </button>
    </div>
  );
}

const ACTIONS: Record<string, string> = {
  CREATE: 'Creación',
  STATUS: 'Cambio de estado',
  UPDATE: 'Modificación',
  SELECT: 'Selección',
  INVOICE_REFERENCE: 'Referencia de factura',
  RECEIVE: 'Recepción',
};
function describe(log: AuditLog, statusMap?: Record<string, [string, Tone]>, locationName?: (id: string) => string) {
  const after = log.after as Record<string, unknown> | null;
  if (log.action === 'STATUS' && after && typeof after.from === 'string' && typeof after.to === 'string') {
    const l = (s: string) => statusMap?.[s]?.[0] ?? s;
    return `${l(after.from)} → ${l(after.to)}`;
  }
  if (log.action === 'INVOICE_REFERENCE' && after && 'after' in after) return `Factura N.º ${String(after.after)}`;
  // Recepciones (entityType Receipt, enlazadas a la OC por after.orderId).
  if (log.action === 'RECEIVE' && after) {
    const parts: string[] = [];
    if (typeof after.deliveryNote === 'string') parts.push(`Remito ${after.deliveryNote}`);
    if (typeof after.locationId === 'string' && locationName) parts.push(locationName(after.locationId));
    if (Array.isArray(after.lines)) parts.push(`${after.lines.length} renglón${after.lines.length === 1 ? '' : 'es'}`);
    return parts.join(' · ') || null;
  }
  return null;
}

/** Historial de auditoría como línea de tiempo. El autor sale de actorName del DTO (sin consultar /users). */
export function HistoryTimeline({
  path,
  statusMap,
  title = 'Seguimiento',
  locationName,
}: {
  path: string | null;
  statusMap?: Record<string, [string, Tone]>;
  title?: string;
  locationName?: (id: string) => string;
}) {
  const r = useApi<{ data: AuditLog[] }>(path, { pageSize: 100 });
  const { user } = useSession();
  if (!path) return null;
  const who = (log: AuditLog) => {
    if (!log.actorId) return 'Sistema';
    const n = log.actorName ?? 'Usuario';
    return log.actorId === user?.id ? `${n} (vos)` : n;
  };
  return (
    <Card title={title}>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} onRetry={r.reload} />
      ) : !r.data?.data.length ? (
        <div className="muted small">Sin movimientos registrados.</div>
      ) : (
        <ol className="cmp-tl" data-testid="history-timeline">
          {r.data.data.map((log) => {
            const d = describe(log, statusMap, locationName);
            return (
              <li key={log.id} data-action={log.action} data-entity={log.entityType}>
                <i aria-hidden style={log.action === 'RECEIVE' ? { background: 'var(--ok)' } : undefined} />
                <div>
                  <b>
                    {ACTIONS[log.action] ?? log.action}
                    {d ? ` · ${d}` : ''}
                  </b>
                  <span>
                    {formatDateTime(log.createdAt)} · {who(log)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Estado de carga/errores de catálogos para pantallas del módulo. */
export function LookupGate({ lk, children }: { lk: ReturnType<typeof useLookups>; children: React.ReactNode }) {
  if (lk.error) return <ErrorBox error={lk.error} onRetry={lk.reload} />;
  if (lk.loading) return <Loading label="Cargando catálogos…" />;
  return <>{children}</>;
}

/** Valida cantidad positiva ingresada por el usuario; devuelve texto API o null. */
export function positiveQty(input: string): string | null {
  const v = parseDecimalInput(input);
  if (!v || v.startsWith('-') || toScaled(v) === BigInt(0)) return null;
  return v;
}

/* ---------- OC: importes informados por el servidor ---------- */

export const ROUNDING_WARNING = 'Importe no calculado: falta definir política de redondeo (validación CEO pendiente)';

/** Advertencia cuando el servidor no informa importes (amountWarning o null). Nunca se calcula en JS. */
export function AmountWarning({ order }: { order: OrderDetail }) {
  const missing = order.amountWarning === 'ROUNDING_POLICY_REQUIRED' || order.totalAmount === null || order.lines.some((l) => l.lineAmount === null);
  if (!missing) return null;
  return (
    <div className="alert warn" role="alert" data-testid="oc-rounding-warning">
      <b>{ROUNDING_WARNING}</b>
      <div className="small">
        Algún renglón no tiene división exacta (cantidad × precio ÷ cantidad base). El sistema no redondea ni completa importes: los renglones afectados y el total
        quedan sin valor hasta que CEO defina la política.
      </div>
    </div>
  );
}

/* ---------- OC existentes para un pedido / cotización ---------- */

type ExistingOrders = { rows: VisibleOrder[]; total: number; loading: boolean; error: unknown };

/**
 * Órdenes no anuladas ya creadas para el pedido o la cotización (filtros requestId/quotationId del servidor).
 * No bloquea: el pedido admite compras parciales o a distintos proveedores.
 */
export function useExistingOrders(requestId: string | null, quotationId: string | null): ExistingOrders {
  const byReq = useApi<{ data: VisibleOrder[]; pagination: Schemas['Pagination'] }>(requestId ? '/purchase-orders' : null, { requestId: requestId ?? undefined, pageSize: 100 });
  const byQuo = useApi<{ data: VisibleOrder[]; pagination: Schemas['Pagination'] }>(quotationId ? '/purchase-orders' : null, { quotationId: quotationId ?? undefined, pageSize: 100 });
  return useMemo(() => {
    const m = new Map<string, VisibleOrder>();
    [...(byReq.data?.data ?? []), ...(byQuo.data?.data ?? [])].filter((o) => o.status !== 'CANCELLED').forEach((o) => m.set(o.id, o));
    const truncated = (byReq.data?.pagination.total ?? 0) > 100 || (byQuo.data?.pagination.total ?? 0) > 100;
    return { rows: [...m.values()].sort((a, b) => a.number - b.number), total: truncated ? -1 : m.size, loading: byReq.loading || byQuo.loading, error: byReq.error || byQuo.error };
  }, [byReq.data, byQuo.data, byReq.loading, byQuo.loading, byReq.error, byQuo.error]);
}

export function ExistingOrdersWarning({ existing, ack, onAck }: { existing: ExistingOrders; ack: boolean; onAck: (v: boolean) => void }) {
  if (existing.loading) return <div className="small muted">Verificando órdenes existentes…</div>;
  if (existing.error) return <div className="note small">No se pudo verificar si ya hay órdenes para este pedido/cotización.</div>;
  if (!existing.rows.length) return null;
  return (
    <div className="alert warn" role="alert" data-testid="oc-duplicate-warning">
      <b>Ya existen órdenes de compra no anuladas para este {existing.rows.some((o) => 'quotationId' in o && o.quotationId) ? 'pedido o cotización' : 'pedido'}:</b>
      <div className="small">
        {existing.rows.map((o, i) => (
          <span key={o.id}>
            {i > 0 && ', '}
            <a href={`/ordenes/${o.id}`} target="_blank" rel="noreferrer">
              OC-{o.number}
            </a>{' '}
            ({ORDER_STATUS[o.status][0]})
          </span>
        ))}
        {existing.total === -1 && ' y otras.'}
      </div>
      <div className="small">Crear otra OC es válido para compras parciales o a otro proveedor. Verificá que no estés duplicando la compra.</div>
      <label className="row small" style={{ gap: 6, marginTop: 6 }}>
        <input type="checkbox" data-testid="oc-duplicate-ack" checked={ack} onChange={(e) => onAck(e.target.checked)} />
        Revisé las órdenes existentes y quiero crear otra.
      </label>
    </div>
  );
}
