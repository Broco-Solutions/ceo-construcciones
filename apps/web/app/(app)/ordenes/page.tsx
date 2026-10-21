'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, Mono, PagerBar, SelectField, type Column } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { LookupGate, ORDER_STATUS, StatusPill, useLookups, type OrderStatus, type VisibleOrder } from '@/components/compras/common';

function Ordenes() {
  const sp = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const eco = can('readEconomic');
  const lk = useLookups({ suppliers: true });
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const list = usePaged<VisibleOrder>('/purchase-orders', { workId: workId || undefined, supplierId: (eco && supplierId) || undefined });
  // La API no filtra por estado: el filtro aplica sobre la página cargada.
  const rows = status ? list.rows.filter((o) => o.status === status) : list.rows;

  const cols: Column<VisibleOrder>[] = [
    { key: 'n', header: 'N.º', render: (o) => <Mono>OC-{o.number}</Mono> },
    { key: 'w', header: 'Obra', render: (o) => lk.workName(o.workId) },
    ...(eco ? [{ key: 'p', header: 'Proveedor', render: (o: VisibleOrder) => ('supplierId' in o ? lk.supplierName(o.supplierId) : '—') }] : []),
    { key: 'd', header: 'Destino', render: (o) => lk.locationName(o.destinationId), hideMobile: true },
    { key: 'f', header: 'Creada', render: (o) => formatDateTime(o.createdAt) },
    { key: 's', header: 'Estado', render: (o) => <StatusPill map={ORDER_STATUS} value={o.status} /> },
  ];

  return (
    <Page
      title="Órdenes de compra"
      crumb="Compras"
      actions={
        can('processPurchases') && (
          <Link className="btn" href="/ordenes/nueva">
            <Plus size={16} /> Nueva OC
          </Link>
        )
      }
    >
      <LookupGate lk={lk}>
        <Card bodyClass="">
          <div className="filters">
            <SelectField label="Obra" value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="Todas" options={lk.works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
            {eco && <SelectField label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Todos" options={lk.suppliers.rows.map((s) => ({ value: s.id, label: s.name }))} />}
            <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')} placeholder="Todos" options={Object.entries(ORDER_STATUS).map(([k, [l]]) => ({ value: k, label: l }))} hint={status ? 'Filtra la página actual' : undefined} />
          </div>
          {list.error ? (
            <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
          ) : list.loading && !list.data ? (
            <Loading />
          ) : (
            <DataTable
              rows={rows}
              rowKey={(o) => o.id}
              onRowClick={(o) => router.push(`/ordenes/${o.id}`)}
              empty={<Empty title="Sin órdenes de compra" />}
              columns={cols}
              mobile={(o) => (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row">
                    <b style={{ flex: 1 }}>OC-{o.number}</b>
                    <StatusPill map={ORDER_STATUS} value={o.status} />
                  </div>
                  <span className="small">{lk.workName(o.workId)}</span>
                  {eco && 'supplierId' in o && <span className="small">{lk.supplierName(o.supplierId)}</span>}
                  <span className="small muted">Destino: {lk.locationName(o.destinationId)}</span>
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

export default function OrdenesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readOrders')}>
      <Suspense fallback={<Loading />}>
        <Ordenes />
      </Suspense>
    </RequirePerm>
  );
}
