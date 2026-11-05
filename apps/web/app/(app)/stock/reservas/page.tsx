'use client';
import { unitSymbol } from '@/lib/units';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, type Page as PageOf, type Schemas } from '@/lib/api';
import { useApi, useMutation, usePaged } from '@/lib/hooks';
import { formatDateTime, formatQty, parseDecimalInput, isPositiveDecimal } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, Confirm, DataTable, DecimalField, Empty, ErrorBox, Loading, Modal, PagerBar, Pill, SelectField, fieldErrors, useToast } from '@/components/ui';
import { InvNav, LocationSelect, MaterialSelect, RESERVATION_LABEL, locLabel, useInvLookups, type Loc, type Mat, type Work } from '@/components/inventario/common';

type Reservation = Schemas['Reservation'];

export default function ReservasPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('manageStock')}>
      <ReservasInner />
    </RequirePerm>
  );
}

function ReservasInner() {
  const toast = useToast();
  const lk = useInvLookups();
  const [workId, setWorkId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const { rows, pagination, page, setPage, loading, error, reload } = usePaged<Reservation>('/reservations', { workId, materialId });
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const cancel = useMutation((_k: string, id: string) => api.post(`/reservations/${id}/cancel`));

  const doCancel = async () => {
    if (!cancelling) return;
    const r = await cancel.run(cancelling.id);
    if (r) {
      toast.success('Reserva cancelada', { description: 'El saldo pendiente vuelve a estar disponible.' });
      setCancelling(null);
      reload();
    } else reload();
  };

  const unit = (id: string) => unitSymbol(lk.matById.get(id)?.unit);

  return (
    <Page
      title="Reservas"
      crumb="Inventario"
      actions={
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> Nueva reserva
        </Button>
      }
    >
      <InvNav />
      <div className="note">Reservar no modifica el stock físico: reduce el disponible de la ubicación de origen hasta que se transfiera a la obra o se cancele.</div>
      <Card bodyClass="">
        <div className="filters">
          <div style={{ minWidth: 220 }}>
            <SelectField entity="works" label="Obra" value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="Todas" options={lk.works.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
          </div>
          <div style={{ minWidth: 260 }}>
            <MaterialSelect value={materialId} onChange={setMaterialId} materials={lk.materials} placeholder="Todos" />
          </div>
        </div>
        <div className="bd">
          <ErrorBox error={error ?? lk.error} onRetry={reload} />
          {loading ? (
            <Loading />
          ) : (
            <>
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                empty={<Empty title="Sin reservas" />}
                columns={[
                  { key: 'f', header: 'Fecha', render: (r) => <span className="small">{formatDateTime(r.createdAt)}</span> },
                  { key: 'm', header: 'Material', render: (r) => lk.matById.get(r.materialId)?.name ?? <span className="mono">{r.materialId}</span> },
                  { key: 'o', header: 'Origen', render: (r) => locLabel(lk.locById.get(r.sourceId)) },
                  { key: 'w', header: 'Obra', render: (r) => lk.workById.get(r.workId)?.name ?? '—' },
                  { key: 'q', header: 'Reservado', align: 'r', render: (r) => formatQty(r.quantity, unit(r.materialId)) },
                  { key: 'ff', header: 'Transferido', align: 'r', render: (r) => formatQty(r.fulfilledQuantity, unit(r.materialId)) },
                  { key: 's', header: 'Estado', render: (r) => <Pill tone={RESERVATION_LABEL[r.status].tone}>{RESERVATION_LABEL[r.status].label}</Pill> },
                  {
                    key: 'x',
                    header: '',
                    render: (r) =>
                      r.status === 'ACTIVE' ? (
                        <Button size="sm" variant="ghost" onClick={() => setCancelling(r)}>
                          Cancelar saldo
                        </Button>
                      ) : null,
                  },
                ]}
                mobile={(r) => (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row">
                      <b style={{ flex: 1 }}>{lk.matById.get(r.materialId)?.name ?? 'Material'}</b>
                      <Pill tone={RESERVATION_LABEL[r.status].tone}>{RESERVATION_LABEL[r.status].label}</Pill>
                    </div>
                    <span className="small muted">
                      {locLabel(lk.locById.get(r.sourceId))} → {lk.workById.get(r.workId)?.name ?? 'Obra'}
                    </span>
                    <div className="dl">
                      <div><small>Reservado</small><span>{formatQty(r.quantity, unit(r.materialId))}</span></div>
                      <div><small>Transferido</small><span>{formatQty(r.fulfilledQuantity, unit(r.materialId))}</span></div>
                    </div>
                    {r.status === 'ACTIVE' && (
                      <Button variant="sec" onClick={() => setCancelling(r)}>
                        Cancelar saldo
                      </Button>
                    )}
                  </div>
                )}
              />
              <PagerBar pagination={pagination} page={page} setPage={setPage} />
            </>
          )}
        </div>
      </Card>

      {creating && (
        <ReservationModal
          locations={lk.locations}
          works={lk.works}
          materials={lk.materials}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      <Confirm
        open={!!cancelling}
        title="Cancelar saldo de la reserva"
        tone="danger"
        confirmLabel="Cancelar saldo"
        pending={cancel.pending}
        error={cancel.error}
        onConfirm={doCancel}
        onClose={() => {
          cancel.reset();
          setCancelling(null);
        }}
      >
        {cancelling && (
          <p>
            Se libera el saldo no transferido de la reserva de <b>{lk.matById.get(cancelling.materialId)?.name ?? 'material'}</b> para{' '}
            <b>{lk.workById.get(cancelling.workId)?.name ?? 'la obra'}</b> (reservado {formatQty(cancelling.quantity, unit(cancelling.materialId))}, transferido{' '}
            {formatQty(cancelling.fulfilledQuantity, unit(cancelling.materialId))}). Lo ya transferido no cambia. Esta acción no se puede deshacer.
          </p>
        )}
      </Confirm>
    </Page>
  );
}

function ReservationModal({ locations, works, materials, onClose, onSaved }: { locations: Loc[]; works: Work[]; materials: Mat[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ materialId: '', sourceId: '', workId: '', quantity: '' });
  const [local, setLocal] = useState<Record<string, string>>({});
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const mat = materials.find((m) => m.id === f.materialId);
  const bal = useApi<PageOf<Schemas['Stock']>>(f.materialId && f.sourceId ? '/stock' : null, { materialId: f.materialId, locationId: f.sourceId });
  const m = useMutation((key: string, body: Schemas['ReservationInput']) => api.post('/reservations', body, { idempotencyKey: key }));
  const fe = { ...fieldErrors(m.error), ...local };

  const submit = async () => {
    const errs: Record<string, string> = {};
    const quantity = parseDecimalInput(f.quantity);
    if (!f.materialId) errs.materialId = 'Elegí un material.';
    if (!f.sourceId) errs.sourceId = 'Elegí el origen.';
    if (!f.workId) errs.workId = 'Elegí la obra.';
    if (!isPositiveDecimal(quantity)) errs.quantity = 'Ingresá una cantidad mayor a 0.';
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const r = await m.run({ materialId: f.materialId, sourceId: f.sourceId, workId: f.workId, quantity: quantity as string });
    if (r) {
      toast.success('Reserva creada correctamente');
      onSaved();
    } else bal.reload();
  };

  const row = bal.data?.data[0];
  return (
    <Modal
      open
      side
      title="Nueva reserva"
      onClose={m.pending ? () => {} : onClose}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={m.pending}>
            Reservar
          </Button>
        </>
      }
    >
      <div className="note">Reservar no modifica el stock físico, reduce el disponible del origen. El material llega a la obra cuando se registra la transferencia.</div>
      <MaterialSelect value={f.materialId} onChange={set('materialId')} materials={materials} error={fe.materialId} />
      <LocationSelect label="Origen (galpón o patio)" value={f.sourceId} onChange={set('sourceId')} locations={locations} kinds={['WAREHOUSE', 'YARD']} error={fe.sourceId} />
      {f.materialId && f.sourceId && (
        <div className="small">
          {bal.loading ? 'Consultando saldo…' : row ? <>Disponible en origen: <b>{formatQty(row.available, unitSymbol(row.material.unit))}</b> (físico {formatQty(row.physical)}, reservado {formatQty(row.reserved)})</> : 'Sin saldo registrado en esta ubicación.'}
        </div>
      )}
      <SelectField label="Obra destino" value={f.workId} onChange={(e) => set('workId')(e.target.value)} placeholder="Seleccioná una obra" error={fe.workId} options={works.filter((w) => w.status === 'ACTIVE').map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
      <DecimalField label={`Cantidad${mat?.unit ? ` (${unitSymbol(mat.unit)})` : ''}`} value={f.quantity} onChange={(e) => set('quantity')(e.target.value)} error={fe.quantity} />
      <ErrorBox error={m.error} />
    </Modal>
  );
}
