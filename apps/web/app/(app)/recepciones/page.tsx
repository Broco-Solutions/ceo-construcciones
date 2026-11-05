'use client';
import { useAppRouter } from '@/lib/navigation';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, Mono, PagerBar } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { LOCATION_KIND, LookupGate, ORDER_STATUS, StatusPill, useLookups, type OrderStatus, type VisibleOrder } from '@/components/compras/common';

/** OC con entregas pendientes: Emitidas y con Recepción parcial, filtradas y paginadas por el servidor. */
const PENDING: { status: OrderStatus; title: string }[] = [
  { status: 'ISSUED', title: 'Emitidas, sin recepciones' },
  { status: 'PARTIALLY_RECEIVED', title: 'Con recepción parcial' },
];

function Group({ status, title, lk }: { status: OrderStatus; title: string; lk: ReturnType<typeof useLookups> }) {
  const router = useAppRouter();
  const list = usePaged<VisibleOrder>('/purchase-orders', { status });
  const dest = (o: VisibleOrder) => (o.destination ? `${o.destination.name} (${LOCATION_KIND[o.destination.kind]})` : lk.locationName(o.destinationId));
  const mats = (o: VisibleOrder) => o.lines.map((l) => lk.material(l.materialId)?.name ?? 'Material').join(', ');
  return (
    <Card title={`${title}${list.pagination ? ` · ${list.pagination.total}` : ''}`} bodyClass="">
      <div data-testid={`pending-receipts-${status}`}>
        {list.error ? (
          <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable collection={{resource:"purchase-orders",filters:{status},total:list.pagination?.total,reload:list.reload}}
            rows={list.rows}
            rowKey={(o) => o.id}
            onRowClick={(o) => router.push(`/recepciones/${o.id}`)}
            empty={<Empty title="No hay órdenes en este estado" />}
            columns={[
              { key: 'n', header: 'N.º', render: (o) => <Mono>OC-{o.number}</Mono> },
              { key: 'w', header: 'Obra', render: (o) => lk.workName(o.workId) },
              { key: 'd', header: 'Destino', render: dest },
              { key: 'l', header: 'Materiales', render: mats },
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
                <span className="small muted">{mats(o)}</span>
              </div>
            )}
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </div>
    </Card>
  );
}

function Recepciones() {
  const lk = useLookups();
  return (
    <Page title="Recepciones" crumb="Compras">
      <LookupGate lk={lk}>
        {PENDING.map((g) => (
          <Group key={g.status} status={g.status} title={g.title} lk={lk} />
        ))}
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
