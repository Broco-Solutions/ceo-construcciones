'use client';
// Recepción de OC (parcial o total) y su historial. Apto celular.
import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import { api, type Schemas } from '@/lib/api';
import { useApi, useMutation } from '@/lib/hooks';
import { compareDecimal, formatDateTime, formatQty } from '@/lib/format';
import { Button, Card, Confirm, ErrorBox, Loading, SelectField, TextField, useToast } from '@/components/ui';
import { LOCATION_KIND, QtyInput, positiveQty, useUserName, type Receipt, type useLookups, type VisibleOrder } from './common';

type Line = { id: string; materialId: string; quantity: string; receivedQuantity: string; pendingQuantity?: string };

export const canReceive = (o: VisibleOrder) => o.status === 'ISSUED' || o.status === 'PARTIALLY_RECEIVED';

export function ReceiptForm({ order, lk, onDone }: { order: VisibleOrder; lk: ReturnType<typeof useLookups>; onDone: () => void }) {
  const toast = useToast();
  const lines = order.lines as Line[];
  // Ubicaciones válidas: la de la obra de la OC; Gerencia/Compras también galpones y patios.
  const locs = lk.locations.rows.filter((l) => l.active && (order.workId ? l.workId === order.workId || !l.workId : !l.workId));
  const [locationId, setLocationId] = useState(locs.some((l) => l.id === order.destinationId) ? order.destinationId : locs[0]?.id ?? '');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [touched, setTouched] = useState(false);

  const entered = Object.entries(qty).filter(([, v]) => v.trim() !== '');
  const invalid = entered.filter(([, v]) => !positiveQty(v)).map(([k]) => k);
  const body: Schemas['ReceiptInput'] = {
    locationId,
    deliveryNote: deliveryNote.trim(),
    lines: entered.filter(([, v]) => positiveQty(v)).map(([orderLineId, v]) => ({ orderLineId, quantity: positiveQty(v)! })),
  };
  // Clave de idempotencia estable por intención: se reutiliza si el envío falla por red/timeout.
  const save = useMutation((key: string, b: Schemas['ReceiptInput']) => api.post<{ data: Receipt }>(`/purchase-orders/${order.id}/receipts`, b, { idempotencyKey: key }));
  const ready = !!locationId && !!body.deliveryNote && body.lines.length > 0 && invalid.length === 0;
  // Cambiar los datos tras un error de red es una nueva intención: se descarta la clave.
  const edit = <T,>(fn: (v: T) => void) => (v: T) => {
    if (save.error) save.reset();
    fn(v);
  };

  const submit = async () => {
    const r = await save.run(body);
    if (r) {
      toast('Recepción registrada');
      setConfirm(false);
      setQty({});
      setDeliveryNote('');
      onDone();
    }
  };

  return (
    <Card title="Registrar recepción">
      <div className="stack">
        <div className="formgrid">
          <TextField label="N.º de remito" value={deliveryNote} maxLength={500} onChange={(e) => edit(setDeliveryNote)(e.target.value)} error={touched && !body.deliveryNote ? 'Ingresá el remito' : undefined} style={{ minHeight: 48, fontSize: 16 }} />
          <SelectField label="Ubicación que recibe" value={locationId} onChange={(e) => edit(setLocationId)(e.target.value)} placeholder="Elegí ubicación" options={locs.map((l) => ({ value: l.id, label: `${l.name} (${LOCATION_KIND[l.kind]})` }))} style={{ minHeight: 48 }} />
        </div>
        <div>
          {lines.map((l) => {
            const u = lk.unitOf(l.materialId);
            const done = l.pendingQuantity !== undefined ? positiveQty(l.pendingQuantity) === null : compareDecimal(l.receivedQuantity, l.quantity) >= 0;
            return (
              <div key={l.id} className="cmp-line">
                <div className="nm">
                  <b>{lk.material(l.materialId)?.name ?? 'Material'}</b>
                  <span>
                    Pedido {formatQty(l.quantity, u)} · recibido {formatQty(l.receivedQuantity, u)}
                    {l.pendingQuantity !== undefined && <> · <b>pendiente {formatQty(l.pendingQuantity, u)}</b></>}
                  </span>
                  {invalid.includes(l.id) && <span style={{ color: 'var(--bad)', display: 'block', fontSize: 12, fontWeight: 600 }}>Cantidad inválida</span>}
                </div>
                {done ? (
                  <span className="pill ok">Completo</span>
                ) : (
                  <div className="row" style={{ gap: 6 }}>
                    {l.pendingQuantity !== undefined && (
                      <button type="button" className="btn ghost sm" onClick={() => edit(setQty)({ ...qty, [l.id]: l.pendingQuantity!.replace('.', ',') })}>
                        Todo
                      </button>
                    )}
                    <QtyInput label={`Cantidad recibida de ${lk.material(l.materialId)?.name ?? 'material'} (${u})`} value={qty[l.id] ?? ''} invalid={invalid.includes(l.id)} onChange={(v) => edit(setQty)({ ...qty, [l.id]: v })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <ErrorBox error={!confirm ? save.error : null} />
        {save.error?.isNetwork && !confirm && <div className="note small">No se confirmó la recepción por un problema de conexión. Reintentá: se reenviará la misma operación sin duplicarla.</div>}
        <Button
          size="lg"
          variant="ok"
          onClick={() => {
            setTouched(true);
            if (ready) setConfirm(true);
          }}
          disabled={body.lines.length === 0}
        >
          <PackageCheck /> {save.error?.isNetwork ? 'Reintentar recepción' : 'Revisar recepción'}
        </Button>
      </div>
      <Confirm open={confirm} title="Confirmar recepción" tone="ok" confirmLabel={save.error?.isNetwork ? 'Reintentar' : 'Confirmar recepción'} pending={save.pending} error={save.error} onClose={() => setConfirm(false)} onConfirm={submit}>
        <div className="stack" style={{ gap: 6 }}>
          <span>
            Remito <b>{body.deliveryNote}</b> · recibe en <b>{lk.locationName(locationId)}</b>
          </span>
          {body.lines.map((b) => {
            const l = lines.find((x) => x.id === b.orderLineId)!;
            return (
              <span key={b.orderLineId}>
                {lk.material(l.materialId)?.name}: <b>{formatQty(b.quantity, lk.unitOf(l.materialId))}</b>
              </span>
            );
          })}
          <span className="small muted">El stock de la ubicación se actualiza al confirmar.</span>
        </div>
      </Confirm>
    </Card>
  );
}

export function ReceiptHistory({ order, lk }: { order: VisibleOrder; lk: ReturnType<typeof useLookups> }) {
  const r = useApi<{ data: Receipt[] }>(`/purchase-orders/${order.id}/receipts`, { pageSize: 100 });
  const name = useUserName();
  const lines = order.lines as Line[];
  return (
    <Card title="Entregas recibidas">
      {r.loading && !r.data ? (
        <Loading />
      ) : r.error ? (
        <ErrorBox error={r.error} onRetry={r.reload} />
      ) : !r.data?.data.length ? (
        <div className="muted small">Todavía no hay recepciones.</div>
      ) : (
        <ol className="cmp-tl">
          {r.data.data.map((rc) => (
            <li key={rc.id}>
              <i aria-hidden style={{ background: 'var(--ok)' }} />
              <div>
                <b>
                  Remito {rc.deliveryNote ?? '—'} · {lk.locationName(rc.locationId)}
                </b>
                <span>
                  {formatDateTime(rc.createdAt)} · {name(rc.receivedById)}
                </span>
                {rc.lines.map((l) => {
                  const ol = lines.find((x) => x.id === l.orderLineId);
                  return (
                    <span key={l.id} style={{ display: 'block' }}>
                      {ol ? lk.material(ol.materialId)?.name : 'Renglón'}: {formatQty(l.quantity, ol ? lk.unitOf(ol.materialId) : '')}
                    </span>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
