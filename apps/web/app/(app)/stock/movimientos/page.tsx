'use client';
import { unitSymbol } from '@/lib/units';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { Schemas } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import { formatDateTime, formatQty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Page } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill, SelectField } from '@/components/ui';
import { InvNav, LocationSelect, MOVEMENT_LABEL, MaterialSelect, movementLocLabel, useInvLookups } from '@/components/inventario/common';

type Movement = Schemas['MovementDetail'];
const TONE: Record<Movement['type'], 'ok' | 'warn' | 'bad' | 'blue' | 'plain'> = {
  INITIAL: 'plain',
  RECEIPT: 'ok',
  TRANSFER: 'blue',
  CONSUMPTION: 'warn',
  RETURN: 'ok',
  ADJUSTMENT: 'bad',
};

function MovimientosInner() {
  const sp = useSearchParams();
  const { can } = useSession();
  const lk = useInvLookups();
  const [materialId, setMaterialId] = useState('');
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [locationId, setLocationId] = useState('');
  const { rows, pagination, page, setPage, loading, error, reload } = usePaged<Movement>('/movements', { materialId, workId, locationId });

  const mat = (id: string) => lk.matById.get(id);

  return (
    <Page
      title="Movimientos de stock"
      crumb="Inventario"
      actions={
        can('consume') && (
          <Link className="btn" href="/stock/movimientos/nuevo">
            <Plus size={16} /> Registrar movimiento
          </Link>
        )
      }
    >
      <InvNav />
      <Card bodyClass="">
        <div className="filters">
          <div style={{ minWidth: 260 }}>
            <MaterialSelect value={materialId} onChange={setMaterialId} materials={lk.materials} placeholder="Todos" />
          </div>
          <div style={{ minWidth: 200 }}>
            <SelectField label="Obra" value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="Todas" options={lk.works.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
          </div>
          <div style={{ minWidth: 220 }}>
            <LocationSelect label="Ubicación (origen o destino)" value={locationId} onChange={setLocationId} locations={lk.locations} placeholder="Todas" />
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
                empty={<Empty title="Sin movimientos" />}
                columns={[
                  { key: 'f', header: 'Fecha', render: (r) => <span className="small">{formatDateTime(r.createdAt)}</span> },
                  { key: 't', header: 'Tipo', render: (r) => <Pill tone={TONE[r.type]}>{MOVEMENT_LABEL[r.type]}</Pill> },
                  { key: 'm', header: 'Material', render: (r) => mat(r.materialId)?.name ?? <span className="mono small">{r.materialId}</span> },
                  { key: 'q', header: 'Cantidad', align: 'r', render: (r) => formatQty(r.quantity, unitSymbol(mat(r.materialId)?.unit)) },
                  { key: 'o', header: 'Origen', render: (r) => movementLocLabel(r.source, r.sourceId) },
                  { key: 'd', header: 'Destino', render: (r) => movementLocLabel(r.destination, r.destinationId) },
                  { key: 'ac', header: 'Registró', hideMobile: true, render: (r) => <span className="small">{r.actorName || '—'}</span> },
                  { key: 'w', header: 'Obra', hideMobile: true, render: (r) => (r.workId ? lk.workById.get(r.workId)?.name ?? '—' : '—') },
                  { key: 'x', header: 'Detalle', hideMobile: true, render: (r) => <span className="small muted">{[r.reason, r.reservationId && 'Satisface reserva', r.receiptLineId && 'Desde recepción'].filter(Boolean).join(' · ') || '—'}</span> },
                ]}
                mobile={(r) => (
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="row">
                      <Pill tone={TONE[r.type]}>{MOVEMENT_LABEL[r.type]}</Pill>
                      <span className="small muted" style={{ flex: 1, textAlign: 'right' }}>
                        {formatDateTime(r.createdAt)}
                      </span>
                    </div>
                    <b>
                      {mat(r.materialId)?.name ?? 'Material'} · {formatQty(r.quantity, unitSymbol(mat(r.materialId)?.unit))}
                    </b>
                    <span className="small muted">
                      {movementLocLabel(r.source, r.sourceId)} → {movementLocLabel(r.destination, r.destinationId)}
                    </span>
                    {r.actorName && <span className="small muted">Registró: {r.actorName}</span>}
                    {r.reason && <span className="small">Motivo: {r.reason}</span>}
                  </div>
                )}
              />
              <PagerBar pagination={pagination} page={page} setPage={setPage} />
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}

export default function MovimientosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <MovimientosInner />
    </Suspense>
  );
}
