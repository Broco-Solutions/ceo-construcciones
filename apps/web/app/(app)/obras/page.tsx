'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { Page } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PagerBar, SelectField, Mono } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { Schemas } from '@/lib/api';
import { WorkStatusPill, WORK_STATUS_OPTIONS } from '@/components/obras/labels';
import { WorkForm } from '@/components/obras/WorkForm';

type Work = Schemas['WorkList'];

export default function ObrasPage() {
  const { can } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(false);
  const list = usePaged<Work>('/works', { status: status || undefined }, 100);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? list.rows.filter((w) => w.name.toLowerCase().includes(t) || w.code.toLowerCase().includes(t)) : list.rows;
  }, [list.rows, q]);
  const manage = can('manageWorks');

  return (
    <Page
      title="Obras"
      actions={
        manage && (
          <Button onClick={() => setForm(true)}>
            <Plus /> Nueva obra
          </Button>
        )
      }
    >
      <Card bodyClass="">
        <div className="filters">
          <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Todos" options={WORK_STATUS_OPTIONS} />
          <div className="field">
            <label htmlFor="q-obra">Buscar</label>
            <div className="row" style={{ gap: 6 }}>
              <Search size={16} aria-hidden className="muted" />
              <input id="q-obra" className="input" placeholder="Nombre o código (en esta página)" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        </div>
        {list.error ? (
          <div className="bd">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(w) => w.id}
            onRowClick={(w) => router.push(`/obras/${w.id}`)}
            columns={[
              { key: 'code', header: 'Código', render: (w) => <Mono>{w.code}</Mono> },
              { key: 'name', header: 'Obra', render: (w) => <b className="ink">{w.name}</b> },
              { key: 'status', header: 'Estado', render: (w) => <WorkStatusPill status={w.status} /> },
              { key: 'loc', header: 'Ubicación de stock', hideMobile: true, render: (w) => w.location?.code ?? '—' },
              { key: 'upd', header: 'Actualizada', hideMobile: true, render: (w) => formatDate(w.updatedAt) },
            ]}
            mobile={(w) => (
              <div className="stack" style={{ gap: 4 }}>
                <div className="row">
                  <b className="ink" style={{ flex: 1 }}>{w.name}</b>
                  <WorkStatusPill status={w.status} />
                </div>
                <span className="small muted">
                  <Mono>{w.code}</Mono> · {w.location?.code ?? 'sin ubicación'}
                </span>
              </div>
            )}
            empty={
              <Empty title={q || status ? 'No hay obras con esos filtros' : 'Todavía no hay obras'}>
                {!q && !status && (manage ? 'Creá la primera obra con “Nueva obra”.' : 'No tenés obras asignadas.')}
              </Empty>
            }
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </Card>
      {manage && <WorkForm open={form} onClose={() => setForm(false)} onSaved={(w) => router.push(`/obras/${w.id}`)} />}
    </Page>
  );
}
