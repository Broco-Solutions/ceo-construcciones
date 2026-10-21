'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DefList, ErrorBox, Loading, Pill } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Supplier } from '@/components/catalogo/common';
import { SupplierForm } from '@/components/catalogo/SupplierForm';
import { PriceTable } from '@/components/catalogo/PriceTable';
import { PriceForm } from '@/components/catalogo/PriceForm';

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readSuppliers')}>
      <Inner id={id} canEdit={can('editSuppliers')} canPrice={can('readEconomic')} />
    </RequirePerm>
  );
}

function Inner({ id, canEdit, canPrice }: { id: string; canEdit: boolean; canPrice: boolean }) {
  const r = useApi<{ data: Supplier }>(`/suppliers/${id}`);
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [k, setK] = useState(0);
  const s = r.data?.data;
  return (
    <Page
      title={s?.name ?? 'Proveedor'}
      crumb={
        <>
          <Link href="/proveedores">Proveedores</Link> / {s?.code ?? '…'}
        </>
      }
      actions={
        s &&
        canEdit && (
          <Button variant="sec" onClick={() => setEditing(true)}>
            <Pencil size={16} /> Editar
          </Button>
        )
      }
    >
      {r.error ? (
        <ErrorBox error={r.error} onRetry={r.reload} />
      ) : !s ? (
        <Loading />
      ) : (
        <div className="stack">
          <Card title="Datos del proveedor">
            <DefList
              items={[
                ['Código', <span className="mono" key="c">{s.code}</span>],
                ['CUIT', s.taxId ?? '—'],
                ['Email', s.email ? <a key="e" href={`mailto:${s.email}`}>{s.email}</a> : '—'],
                ['Teléfono', s.phone ? <a key="p" href={`tel:${s.phone}`}>{s.phone}</a> : '—'],
                ['Dirección', s.address ?? '—'],
                ['Estado', s.active ? <Pill key="s" tone="ok">Activo</Pill> : <Pill key="s">Inactivo</Pill>],
                ['Actualizado', formatDateTime(s.updatedAt)],
              ]}
            />
            {s.notes && <p className="small" style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{s.notes}</p>}
          </Card>
          <Card
            title="Precios registrados"
            bodyClass=""
            actions={
              canPrice && (
                <Button size="sm" onClick={() => setPricing(true)}>
                  <Plus size={14} /> Registrar precio
                </Button>
              )
            }
          >
            <PriceTable key={k} supplierId={s.id} />
          </Card>
        </div>
      )}
      {editing && s && (
        <SupplierForm
          supplier={s}
          onClose={() => setEditing(false)}
          onSaved={(x) => {
            setEditing(false);
            r.setData({ data: x });
          }}
        />
      )}
      {pricing && s && (
        <PriceForm
          open
          supplierId={s.id}
          onClose={() => setPricing(false)}
          onSaved={() => {
            setPricing(false);
            setK((x) => x + 1);
          }}
        />
      )}
    </Page>
  );
}
