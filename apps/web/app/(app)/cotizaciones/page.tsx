'use client';
import { useAppRouter } from '@/lib/navigation';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, SelectField } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { LookupGate, REQUEST_STATUS, StatusPill, useLookups, type RequestDetail, type RequestStatus } from '@/components/compras/common';

/** Pedidos que necesitan compra: Enviados y En proceso, cada grupo filtrado y paginado por el servidor. */
const NEEDS_PURCHASE: { status: RequestStatus; title: string }[] = [
  { status: 'SUBMITTED', title: 'Pedidos enviados (sin tomar)' },
  { status: 'PROCESSING', title: 'Pedidos en proceso de compra' },
];

function Group({ status, title, workId, lk }: { status: RequestStatus; title: string; workId: string; lk: ReturnType<typeof useLookups> }) {
  const router = useAppRouter();
  const list = usePaged<RequestDetail>('/requests', { workId: workId || undefined, status });
  return (
    <Card title={`${title}${list.pagination ? ` · ${list.pagination.total}` : ''}`} bodyClass="">
      <div data-testid={`needs-purchase-${status}`}>
        {list.error ? (
          <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => router.push(`/cotizaciones/${r.id}`)}
            empty={<Empty title={`No hay pedidos en estado ${REQUEST_STATUS[status][0].toLowerCase()}`} />}
            columns={[
              { key: 'w', header: 'Obra', render: (r) => lk.workName(r.workId) },
              { key: 'c', header: 'Rubro', render: (r) => lk.categoryName(r.categoryId) },
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
                <span className="small muted">{r.lines.length} materiales · para el {formatDate(r.requiredAt)}</span>
              </div>
            )}
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </div>
    </Card>
  );
}

function Cotizaciones() {
  const lk = useLookups();
  const [workId, setWorkId] = useState('');
  return (
    <Page title="Cotizaciones" crumb="Compras">
      <LookupGate lk={lk}>
        <Card title="Pedidos que necesitan compra">
          <div className="filters">
            <SelectField entity="works" label="Obra" value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="Todas" options={lk.works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
          </div>
        </Card>
        {NEEDS_PURCHASE.map((g) => (
          <Group key={g.status} status={g.status} title={g.title} workId={workId} lk={lk} />
        ))}
      </LookupGate>
    </Page>
  );
}

export default function CotizacionesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Cotizaciones />
    </RequirePerm>
  );
}
