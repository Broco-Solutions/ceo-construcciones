'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Tag } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { ExportButton, useDebounced, type Supplier } from '@/components/catalogo/common';
import { SupplierForm } from '@/components/catalogo/SupplierForm';

export default function ProveedoresPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readSuppliers')}>
      <Inner canEdit={can('editSuppliers')} />
    </RequirePerm>
  );
}

function Inner({ canEdit }: { canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [active, setActive] = useState<'yes' | 'no' | 'all'>('yes');
  const [creating, setCreating] = useState(false);
  const n = useDebounced(q.trim());
  // Búsqueda y estado los filtra el servidor antes de paginar.
  const list = usePaged<Supplier>('/suppliers', { search: n || undefined, active: active === 'all' ? undefined : active === 'yes' });
  const rows = list.rows;
  return (
    <Page
      title="Proveedores"
      crumb="Compras"
      actions={
        <>
          <Link className="btn sec" href="/proveedores/precios">
            <Tag size={16} /> Precios
          </Link>
          <ExportButton path="/exports/suppliers" label="Exportar" fallbackName="proveedores.xlsx" />
          {canEdit && (
            <Button onClick={() => setCreating(true)}>
              <Plus size={16} /> Nuevo proveedor
            </Button>
          )}
        </>
      }
    >
      <Card bodyClass="">
        <div className="filters" style={{ padding: 12 }}>
          <input className="input" type="search" id="q-proveedor" placeholder="Buscar proveedores…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar proveedores" />
          <select className="input" value={active} onChange={(e) => setActive(e.target.value as typeof active)} id="f-proveedor-estado" aria-label="Estado">
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
          <DataTable<Supplier>
            rows={rows}
            rowKey={(s) => s.id}
            onRowClick={(s) => router.push(`/proveedores/${s.id}`)}
            empty={<Empty title="Sin proveedores">{n ? 'Probá con otra búsqueda.' : undefined}</Empty>}
            columns={[
              { key: 'c', header: 'Código', render: (s) => <span className="mono">{s.code}</span> },
              { key: 'n', header: 'Nombre', render: (s) => <b>{s.name}</b> },
              { key: 't', header: 'CUIT', render: (s) => s.taxId ?? '—', hideMobile: true },
              { key: 'e', header: 'Contacto', render: (s) => [s.email, s.phone].filter(Boolean).join(' · ') || '—', hideMobile: true },
              { key: 's', header: 'Estado', render: (s) => (s.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>) },
            ]}
            mobile={(s) => (
              <div className="stack" style={{ gap: 4 }}>
                <div className="row">
                  <b style={{ flex: 1 }}>{s.name}</b>
                  {s.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>}
                </div>
                <span className="small muted">
                  <span className="mono">{s.code}</span>
                  {s.taxId ? ` · ${s.taxId}` : ''}
                </span>
              </div>
            )}
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </Card>
      {creating && <SupplierForm onClose={() => setCreating(false)} onSaved={(s) => router.push(`/proveedores/${s.id}`)} />}
    </Page>
  );
}
