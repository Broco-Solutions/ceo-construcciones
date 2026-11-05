'use client';
import { useAppRouter } from '@/lib/navigation';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Page } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, SelectField } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime } from '@/lib/format';
import { LookupGate, REQUEST_STATUS, StatusPill, useLookups, type RequestDetail, type RequestStatus } from '@/components/compras/common';

function Pedidos() {
  const sp = useSearchParams();
  const router = useAppRouter();
  const { can } = useSession();
  const lk = useLookups();
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [categoryId, setCategoryId] = useState(sp.get('categoryId') ?? '');
  const [status, setStatus] = useState<RequestStatus | ''>((sp.get('status') as RequestStatus | null) ?? '');
  // Filtros aplicados en el servidor antes de paginar.
  const list = usePaged<RequestDetail>('/requests', { workId: workId || undefined, categoryId: categoryId || undefined, status: status || undefined });
  const rows = list.rows;

  const setW = (v: string) => {
    setWorkId(v);
    router.replace(v ? `/pedidos?workId=${v}` : '/pedidos');
  };

  return (
    <Page
      title="Pedidos de materiales"
      crumb="Compras"
      actions={
        can('createRequest') && (
          <Link className="btn" href={workId ? `/pedidos/nuevo?workId=${workId}` : '/pedidos/nuevo'}>
            <Plus size={16} /> Nuevo pedido
          </Link>
        )
      }
    >
      <LookupGate lk={lk}>
        <Card bodyClass="">
          <div className="filters">
            <SelectField entity="works" label="Obra" value={workId} onChange={(e) => setW(e.target.value)} placeholder="Todas" options={lk.works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
            <SelectField searchable label="Rubro" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} placeholder="Todos" options={lk.categories.rows.map((c) => ({ value: c.id, label: c.name }))} />
            <SelectField
              label="Estado"
              value={status}
              onChange={(e) => setStatus(e.target.value as RequestStatus | '')}
              placeholder="Todos"
              options={Object.entries(REQUEST_STATUS).map(([k, [l]]) => ({ value: k, label: l }))}
              data-testid="request-filter-status"
            />
          </div>
          {list.pagination && <div className="bd small muted" data-testid="list-total">{list.pagination.total} pedidos</div>}
          {list.error ? (
            <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
          ) : list.loading && !list.data ? (
            <Loading />
          ) : (
            <DataTable collection={{resource:"requests",filters:{workId:workId||undefined,categoryId:categoryId||undefined,status:status||undefined},total:list.pagination?.total,reload:list.reload}}
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/pedidos/${r.id}`)}
              empty={
                <Empty title="Sin pedidos" action={can('createRequest') ? <Link className="btn" href="/pedidos/nuevo">Crear pedido</Link> : undefined}>
                  No hay pedidos para los filtros elegidos.
                </Empty>
              }
              columns={[
                { key: 'c', header: 'Creado', render: (r) => formatDateTime(r.createdAt) },
                { key: 'w', header: 'Obra', render: (r) => lk.workName(r.workId) },
                { key: 'r', header: 'Rubro', render: (r) => lk.categoryName(r.categoryId) },
                { key: 'f', header: 'Requerido para', render: (r) => formatDate(r.requiredAt) },
                { key: 'l', header: 'Materiales', align: 'r', render: (r) => r.lines.length },
                { key: 's', header: 'Estado', render: (r) => <StatusPill map={REQUEST_STATUS} value={r.status} /> },
              ]}
              mobile={(r) => (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row">
                    <b style={{ flex: 1 }}>{lk.categoryName(r.categoryId)}</b>
                    <StatusPill map={REQUEST_STATUS} value={r.status} />
                  </div>
                  <span className="small">{lk.workName(r.workId)}</span>
                  <span className="small muted">
                    {r.lines.length} materiales · para el {formatDate(r.requiredAt)}
                  </span>
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

export default function PedidosPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Pedidos />
    </Suspense>
  );
}
