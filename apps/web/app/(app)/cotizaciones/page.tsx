'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, SelectField } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import { LookupGate, REQUEST_STATUS, StatusPill, useLookups, type RequestDetail } from '@/components/compras/common';

function Cotizaciones() {
  const router = useRouter();
  const lk = useLookups();
  const [workId, setWorkId] = useState('');
  const list = usePaged<RequestDetail>('/requests', { workId: workId || undefined });
  // Pedidos que necesitan compra: enviados o en proceso (la API no filtra por estado; se filtra la página).
  const rows = list.rows.filter((r) => r.status === 'SUBMITTED' || r.status === 'PROCESSING');
  return (
    <Page title="Cotizaciones" crumb="Compras">
      <LookupGate lk={lk}>
        <Card title="Pedidos que necesitan compra" bodyClass="">
          <div className="filters">
            <SelectField label="Obra" value={workId} onChange={(e) => setWorkId(e.target.value)} placeholder="Todas" options={lk.works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
          </div>
          {list.error ? (
            <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
          ) : list.loading && !list.data ? (
            <Loading />
          ) : (
            <DataTable
              rows={rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/cotizaciones/${r.id}`)}
              empty={<Empty title="No hay pedidos pendientes de compra en esta página" />}
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
        </Card>
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
