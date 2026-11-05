'use client';
import { useAppRouter } from '@/lib/navigation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, SelectField } from '@/components/ui';
import { useSession } from '@/lib/session';
import { usePaged } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { BudgetFlow, useWorks } from '@/components/presupuesto/common';

export default function BudgetsPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Suspense fallback={<Loading />}>
        <BudgetList />
      </Suspense>
    </RequirePerm>
  );
}

function BudgetList() {
  const { can } = useSession();
  const router = useAppRouter();
  const workId = useSearchParams().get('workId') ?? '';
  const works = useWorks();
  const list = usePaged<Schemas['Budget']>('/budgets', { workId: workId || undefined });
  const workName = (id: string) => {
    const w = works.workById.get(id);
    return w ? `${w.code} · ${w.name}` : '—';
  };
  return (
    <Page
      title="Presupuestos"
      crumb="Presupuestos"
      actions={
        can('editBudget') && (
          <Link href={`/presupuestos/nuevo${workId ? `?workId=${workId}` : ''}`} className="btn">
            <Plus size={16} /> Nuevo presupuesto
          </Link>
        )
      }
    >
      <Card>
        <BudgetFlow step={2} />
      </Card>
      <Card
        title="Presupuestos por obra"
        bodyClass=""
        actions={
          <div className="filters">
            <SelectField
              entity="works" label="Obra"
              value={workId}
              placeholder="Todas"
              options={works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
              onChange={(e) => router.replace(e.target.value ? `/presupuestos?workId=${e.target.value}` : '/presupuestos')}
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
            <DataTable collection={{resource:"budgets",filters:{workId:workId||undefined},total:list.pagination?.total,reload:list.reload}}
              rows={list.rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/presupuestos/${r.id}`)}
              empty={<Empty title="Sin presupuestos">Creá un presupuesto para la obra y después sus versiones desde un cómputo.</Empty>}
              columns={[
                { key: 'name', header: 'Presupuesto', render: (r) => <b>{r.name}</b> },
                { key: 'work', header: 'Obra', render: (r) => workName(r.workId) },
                { key: 'upd', header: 'Actualizado', render: (r) => formatDateTime(r.updatedAt), hideMobile: true },
              ]}
              mobile={(r) => (
                <div className="stack" style={{ gap: 4 }}>
                  <b>{r.name}</b>
                  <span className="small muted">{workName(r.workId)}</span>
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
