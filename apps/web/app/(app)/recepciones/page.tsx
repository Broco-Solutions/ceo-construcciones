'use client';
import { useRouter } from 'next/navigation';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, Mono, PagerBar } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { LookupGate, ORDER_STATUS, StatusPill, useLookups, type VisibleOrder } from '@/components/compras/common';
import { canReceive } from '@/components/compras/Receipts';

function Recepciones() {
  const router = useRouter();
  const lk = useLookups();
  const list = usePaged<VisibleOrder>('/purchase-orders', {});
  // OCs emitidas con pendientes (la API no filtra por estado: se filtra la página cargada).
  const rows = list.rows.filter(canReceive);
  return (
    <Page title="Recepciones" crumb="Compras">
      <LookupGate lk={lk}>
        <Card title="Órdenes con entregas pendientes" bodyClass="">
          {list.error ? (
            <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
          ) : list.loading && !list.data ? (
            <Loading />
          ) : (
            <DataTable
              rows={rows}
              rowKey={(o) => o.id}
              onRowClick={(o) => router.push(`/recepciones/${o.id}`)}
              empty={<Empty title="No hay órdenes pendientes de recibir" />}
              columns={[
                { key: 'n', header: 'N.º', render: (o) => <Mono>OC-{o.number}</Mono> },
                { key: 'w', header: 'Obra', render: (o) => lk.workName(o.workId) },
                { key: 'd', header: 'Destino', render: (o) => lk.locationName(o.destinationId) },
                { key: 'l', header: 'Materiales', render: (o) => o.lines.map((l) => lk.material(l.materialId)?.name ?? 'Material').join(', ') },
                { key: 'f', header: 'Creada', render: (o) => formatDateTime(o.createdAt), hideMobile: true },
                { key: 's', header: 'Estado', render: (o) => <StatusPill map={ORDER_STATUS} value={o.status} /> },
              ]}
              mobile={(o) => (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row">
                    <b style={{ flex: 1, fontSize: 15 }}>OC-{o.number}</b>
                    <StatusPill map={ORDER_STATUS} value={o.status} />
                  </div>
                  <span className="small">{lk.workName(o.workId)}</span>
                  <span className="small muted">{o.lines.map((l) => lk.material(l.materialId)?.name ?? 'Material').join(', ')}</span>
                </div>
              )}
            />
          )}
          <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
        </Card>
      </LookupGate>
    </Page>
  );
}

export default function RecepcionesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('receive')}>
      <Recepciones />
    </RequirePerm>
  );
}
