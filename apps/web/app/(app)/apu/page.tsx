'use client';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useAppRouter } from '@/lib/navigation';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { EntitySearch } from '@/components/EntitySearch';
import { useDebounced } from '@/components/catalogo/common';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  Pill,
  SelectField,
} from '@/components/ui';
import { useSession } from '@/lib/session';
import { usePaged } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import {
  BudgetFlow,
  TAX_LABEL,
  useCatalogs,
} from '@/components/presupuesto/common';

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
  const router = useAppRouter();
  const cat = useCatalogs();
  const [categoryId, setCategoryId] = useState('');
  const [q,setQ]=useState(''),[entityId,setEntityId]=useState(''),[active,setActive]=useState('');
  const search=useDebounced(q);
  const list = usePaged<Schemas['ApuDetail']>('/apu-items', {
    categoryId: categoryId || undefined, search:search||undefined, id:entityId||undefined, active:active||undefined,
  });
  const edit = can('editBudget');
  const labor = (a: Schemas['ApuDetail']) =>
    a.referenceCost ? (a.referenceCost.laborCost === null ? 'Pendiente' : formatMoney(a.referenceCost.laborCost, a.referenceCost.currency)) : a.laborCost ? formatMoney(a.laborCost, a.laborCurrency) : '—';
  return (
    <Page
      title="Actividades de obra"
      crumb="Catálogos / Actividades de obra"
      actions={
        edit && (
          <Link href="/apu/nuevo" className="btn">
            <Plus size={16} /> Nueva actividad
          </Link>
        )
      }
    >
      <Card>
        <BudgetFlow step={0} />
      </Card>
      <Card
        title="Actividades de obra"
        actions={
          <FilterToolbar primary={<EntitySearch resource="apu-items" label="Buscar actividad por ítem, descripción o código" text={q} id={entityId} query={{categoryId:categoryId||undefined,active:active||undefined}} onChange={(q,id)=>{setQ(q);setEntityId(id);}}/>} activeCount={Number(!!categoryId)+Number(!!active)} onClear={()=>{setCategoryId('');setActive('');}}>
            <SelectField label="Estado" value={active} onChange={e=>setActive(e.target.value)} placeholder="Todos" options={[{value:"true",label:"Activo"},{value:"false",label:"Inactivo"}]}/>
            <SelectField
              searchable label="Rubro"
              value={categoryId}
              placeholder="Todos"
              options={cat.categories.rows.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              onChange={(e) => setCategoryId(e.target.value)}
            />
          </FilterToolbar>
        }
        bodyClass=""
      >
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox error={list.error} onRetry={list.reload} />
        ) : (
          <>
            <DataTable collection={{resource:"apu-items",filters:{categoryId:categoryId||undefined,search:search||undefined,id:entityId||undefined,active:active||undefined},total:list.pagination?.total,reload:list.reload}}
              rows={list.rows}
              rowKey={(r) => r.id}
              onRowClick={(r) => router.push(`/apu/${r.id}`)}
              empty={
                <Empty
                  title={q||categoryId||active?"No hay actividades con esos filtros":"Todavía no hay actividades"}
                  action={
                    edit && (
                      <Button onClick={() => router.push('/apu/nuevo')}>
                        Crear la primera
                      </Button>
                    )
                  }
                >
                  Una actividad define qué materiales, mano de obra y costo por
                  unidad lleva un trabajo.
                </Empty>
              }
              columns={[
                {
                  key: 'code',
                  header: 'Código',
                  render: (r) => <span className="mono">{r.code ?? '—'}</span>,
                },
                { key: 'name', header: 'Ítem', render: (r) => <b>{r.name}</b> },
                { key: 'cat', header: 'Rubro', render: (r) => r.category.name },
                {
                  key: 'unit',
                  header: 'Unidad',
                  render: (r) => unitSymbol(r.unit),
                },
                {
                  key: 'mat',
                  header: 'Materiales',
                  render: (r) =>
                    r.components.length ? (
                      `${r.components.length}`
                    ) : (
                      <Pill tone="blue">Sin materiales</Pill>
                    ),
                },
                {
                  key: 'mo',
                  header: 'Mano de obra / u.',
                  align: 'r',
                  render: (r) => `${labor(r)} · ${TAX_LABEL[r.referenceCost?.taxBasis ?? r.laborTaxBasis]}`,
                  hideMobile: true,
                },
                {
                  key: 'cost', header: 'Costo por unidad', align: 'r',
                  render: (r) => r.referenceCost ? (r.referenceCost.totalUnitCost === null ? 'Datos por revisar' : formatMoney(r.referenceCost.totalUnitCost, r.referenceCost.currency)) : 'Ver composición',
                },
                {
                  key: 'st',
                  header: 'Estado',
                  render: (r) =>
                    r.active ? (
                      <Pill tone="ok">Activo</Pill>
                    ) : (
                      <Pill>Inactivo</Pill>
                    ),
                },
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
                  <span className="small">
                    {r.components.length
                      ? `${r.components.length} materiales`
                      : 'Sin materiales'}{' '}
                    · Mano de obra {labor(r)}
                    {r.referenceCost && <span className="small"> · Costo por unidad: {r.referenceCost.totalUnitCost === null ? 'Datos por revisar' : formatMoney(r.referenceCost.totalUnitCost, r.referenceCost.currency)}</span>}
                  </span>
                </div>
              )}
            />
            <PagerBar
              pagination={list.pagination}
              page={list.page}
              setPage={list.setPage}
            />
          </>
        )}
      </Card>
    </Page>
  );
}
