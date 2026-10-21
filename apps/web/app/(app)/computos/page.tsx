'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, SelectField } from '@/components/ui';
import { useSession } from '@/lib/session';
import { usePaged } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { BudgetFlow, useWorks } from '@/components/presupuesto/common';

export default function ComputosPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Suspense fallback={<Loading />}>
        <ComputosList />
      </Suspense>
    </RequirePerm>
  );
}

function ComputosList() {
  const { can } = useSession();
  const router = useRouter();
  const sp = useSearchParams();
  const workId = sp.get('workId') ?? '';
  const works = useWorks();
  const list = usePaged<Schemas['Computation']>('/computations', { workId: workId || undefined });
  const workName = (id: string) => {
    const w = works.workById.get(id);
    return w ? `${w.code} · ${w.name}` : '—';
  };
  return (
    <Page
      title="Cómputos"
      crumb="Presupuestos / Cómputos"
      actions={
        can('editBudget') && (
          <Link href={`/computos/nuevo${workId ? `?workId=${workId}` : ''}`} className="btn">
            <Plus size={16} /> Nuevo cómputo
          </Link>
        )
      }
    >
      <Card>
        <BudgetFlow step={1} />
      </Card>
      <Card
        title="Cómputos por obra"
        bodyClass=""
        actions={
          <div className="filters">
            <SelectField
              label="Obra"
              value={workId}
              placeholder="Todas"
              options={works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
              onChange={(e) => router.replace(e.target.value ? `/computos?workId=${e.target.value}` : '/computos')}
            />
          </div>
        }
      >
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox error={list.error} onRetry={list.reload} />
        ) : (
          <>
            <DataTable
              rows={list.rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/computos/${r.id}`)}
              empty={<Empty title="Sin cómputos">Un cómputo registra las cantidades medidas de cada ítem APU en una obra.</Empty>}
              columns={[
                { key: 'name', header: 'Cómputo', render: (r) => <b>{r.name}</b> },
                { key: 'work', header: 'Obra', render: (r) => workName(r.workId) },
                { key: 'upd', header: 'Actualizado', render: (r) => formatDateTime(r.updatedAt), hideMobile: true },
              ]}
              mobile={(r) => (
                <div className="stack" style={{ gap: 4 }}>
                  <b>{r.name}</b>
                  <span className="small muted">{workName(r.workId)}</span>
                  <span className="small">{formatDateTime(r.updatedAt)}</span>
                </div>
              )}
            />
            <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
          </>
        )}
      </Card>
    </Page>
  );
}
