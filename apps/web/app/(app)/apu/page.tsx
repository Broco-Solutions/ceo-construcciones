'use client';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill, SelectField } from '@/components/ui';
import { useSession } from '@/lib/session';
import { usePaged } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { BudgetFlow, TAX_LABEL, useCatalogs } from '@/components/presupuesto/common';

export default function ApuListPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <ApuList />
    </RequirePerm>
  );
}

function ApuList() {
  const { can } = useSession();
  const router = useRouter();
  const cat = useCatalogs();
  const [categoryId, setCategoryId] = useState('');
  const list = usePaged<Schemas['ApuDetail']>('/apu-items', { categoryId: categoryId || undefined });
  const edit = can('editBudget');
  const labor = (a: Schemas['ApuDetail']) => (a.laborCost ? formatMoney(a.laborCost, a.laborCurrency) : '—');
  return (
    <Page
      title="Análisis de precios unitarios"
      crumb="Presupuestos / APU"
      actions={
        edit && (
          <Link href="/apu/nuevo" className="btn">
            <Plus size={16} /> Nuevo APU
          </Link>
        )
      }
    >
      <Card>
        <BudgetFlow step={0} />
      </Card>
      <Card
        title="Ítems de APU"
        actions={
          <div className="filters">
            <SelectField
              label="Rubro"
              value={categoryId}
              placeholder="Todos"
              options={cat.categories.rows.map((c) => ({ value: c.id, label: c.name }))}
              onChange={(e) => setCategoryId(e.target.value)}
            />
          </div>
        }
        bodyClass=""
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
              onRowClick={(r) => router.push(`/apu/${r.id}`)}
              empty={
                <Empty title="Todavía no hay APU" action={edit && <Button onClick={() => router.push('/apu/nuevo')}>Crear el primero</Button>}>
                  Un APU define qué materiales y cuánta mano de obra lleva una unidad de trabajo.
                </Empty>
              }
              columns={[
                { key: 'code', header: 'Código', render: (r) => <span className="mono">{r.code ?? '—'}</span> },
                { key: 'name', header: 'Ítem', render: (r) => <b>{r.name}</b> },
                { key: 'cat', header: 'Rubro', render: (r) => r.category.name },
                { key: 'unit', header: 'Unidad', render: (r) => unitSymbol(r.unit) },
                {
                  key: 'mat',
                  header: 'Materiales',
                  render: (r) => (r.components.length ? `${r.components.length}` : <Pill tone="blue">Sólo mano de obra</Pill>),
                },
                { key: 'mo', header: 'Mano de obra / u.', align: 'r', render: (r) => `${labor(r)} · ${TAX_LABEL[r.laborTaxBasis]}`, hideMobile: true },
                { key: 'st', header: 'Estado', render: (r) => (r.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>) },
              ]}
              mobile={(r) => (
                <div className="stack" style={{ gap: 4 }}>
                  <b>
                    {r.code && <span className="mono">{r.code} · </span>}
                    {r.name}
                  </b>
                  <span className="small muted">
                    {r.category.name} · {unitSymbol(r.unit)}
                  </span>
                  <span className="small">{r.components.length ? `${r.components.length} materiales` : 'Sólo mano de obra'} · MO {labor(r)}</span>
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
