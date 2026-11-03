'use client';
import { useAppRouter } from '@/lib/navigation';
import { unitSymbol } from '@/lib/units';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Page } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { formatQty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { ExportButton, useCategories, useUnits, type Material } from '@/components/catalogo/common';
import { MaterialForm } from '@/components/catalogo/MaterialForm';

export default function MaterialesPage() {
  const { can } = useSession();
  const router = useAppRouter();
  const units = useUnits();
  const cats = useCategories();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState<'all' | 'yes' | 'no'>('yes');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  // search/categoryId/active se aplican en el servidor antes de paginar.
  const list = usePaged<Material>('/materials', { search: search || undefined, categoryId: categoryId || undefined, active: active === 'all' ? undefined : active === 'yes' });
  const rows = list.rows;
  // Relaciones incluidas en el DTO; el catálogo sólo como respaldo.
  const unit = (m: Material) => unitSymbol(m.unit ?? units.map.get(m.unitId));
  const cat = (m: Material) => (m.categoryId ? (m.category?.name ?? cats.map.get(m.categoryId)?.name ?? '…') : '—');

  return (
    <Page
      title="Materiales"
      crumb="Catálogo"
      actions={
        <>
          <ExportButton path="/exports/materials" label="Exportar" fallbackName="materiales.xlsx" />
          {can('editMaterials') && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> Nuevo material
            </Button>
          )}
        </>
      }
    >
      <Card bodyClass="">
        <div className="filters" style={{ padding: 12 }}>
          <input className="input" type="search" placeholder="Buscar por código o nombre…" value={q} onChange={(e) => setQ(e.target.value)} id="q-material" aria-label="Buscar materiales" />
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} id="f-material-rubro" aria-label="Rubro">
            <option value="">Todos los rubros</option>
            {cats.rows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="input" value={active} onChange={(e) => setActive(e.target.value as typeof active)} id="f-material-estado" aria-label="Estado">
            <option value="yes">Activos</option>
            <option value="no">Inactivos</option>
            <option value="all">Todos</option>
          </select>
        </div>
        {list.error ? (
          <div style={{ padding: 12 }}>
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <>
            <DataTable
              rows={rows}
              rowKey={(m) => m.id}
              onRowClick={(m) => router.push(`/materiales/${m.id}`)}
              empty={
                <Empty title="Sin materiales" action={can('editMaterials') && !search && !categoryId ? <Button onClick={() => setCreating(true)}>Crear el primero</Button> : undefined}>
                  {search || categoryId ? 'Probá con otra búsqueda o rubro.' : 'Todavía no hay materiales cargados.'}
                </Empty>
              }
              columns={[
                { key: 'code', header: 'Código', render: (m) => <span className="mono">{m.code}</span> },
                { key: 'name', header: 'Nombre', render: (m) => <b>{m.name}</b> },
                { key: 'unit', header: 'Unidad base', render: (m) => unit(m) },
                { key: 'cat', header: 'Rubro', render: cat, hideMobile: true },
                { key: 'min', header: 'Mínimo', align: 'r', render: (m) => formatQty(m.minimum, unit(m)), hideMobile: true },
                { key: 'st', header: 'Estado', render: (m) => (m.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>) },
              ]}
              mobile={(m) => (
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row">
                    <b style={{ flex: 1 }}>{m.name}</b>
                    {m.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>}
                  </div>
                  <span className="small muted">
                    <span className="mono">{m.code}</span> · {unit(m)} · {cat(m)}
                  </span>
                </div>
              )}
            />
            <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
          </>
        )}
      </Card>
      {creating && <MaterialForm open onClose={() => setCreating(false)} onSaved={(m) => router.push(`/materiales/${m.id}`)} />}
    </Page>
  );
}
