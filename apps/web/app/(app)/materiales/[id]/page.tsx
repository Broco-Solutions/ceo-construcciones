'use client';
import Link from 'next/link';
import { use, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Page } from '@/components/shell';
import { Button, Card, DefList, ErrorBox, Loading, Pill } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { formatDateTime, formatQty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useCategories, useUnits, type Material } from '@/components/catalogo/common';
import { MaterialForm } from '@/components/catalogo/MaterialForm';
import { Presentations } from '@/components/catalogo/Presentations';
import { PriceTable } from '@/components/catalogo/PriceTable';
import { PriceForm } from '@/components/catalogo/PriceForm';

export default function MaterialDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useSession();
  const economic = can('readEconomic');
  const r = useApi<{ data: Material }>(`/materials/${id}`);
  const units = useUnits();
  const cats = useCategories();
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [priceKey, setPriceKey] = useState(0);
  const m = r.data?.data;
  const unit = m ? units.map.get(m.unitId) : undefined;
  const unitCode = unit?.code ?? '';

  return (
    <Page
      title={m?.name ?? 'Material'}
      crumb={
        <>
          <Link href="/materiales">Materiales</Link> / {m?.code ?? '…'}
        </>
      }
      actions={
        m &&
        can('editMaterials') && (
          <Button variant="sec" onClick={() => setEditing(true)}>
            <Pencil size={16} /> Editar
          </Button>
        )
      }
    >
      {r.error ? (
        <ErrorBox error={r.error} onRetry={r.reload} />
      ) : !m ? (
        <Loading />
      ) : (
        <div className="stack">
          <Card title="Datos del material">
            <DefList
              items={[
                ['Código', <span className="mono" key="c">{m.code}</span>],
                ['Unidad base', unit ? `${unit.code} — ${unit.name}` : '…'],
                ['Rubro', m.categoryId ? (cats.map.get(m.categoryId)?.name ?? '…') : 'Sin rubro'],
                ['Stock mínimo', formatQty(m.minimum, unitCode)],
                ['Estado', m.active ? <Pill tone="ok" key="s">Activo</Pill> : <Pill key="s">Inactivo</Pill>],
                ['Actualizado', formatDateTime(m.updatedAt)],
              ]}
            />
            <p className="small muted" style={{ marginTop: 8 }}>
              La unidad base es inmutable. Stock, pedidos y cómputos se registran siempre en {unitCode || 'esta unidad'}.
            </p>
          </Card>
          <Presentations materialId={m.id} unitCode={unitCode} />
          {economic && (
            <Card
              title="Historial de precios"
              bodyClass=""
              actions={
                <Button size="sm" onClick={() => setPricing(true)}>
                  <Plus size={14} /> Registrar precio
                </Button>
              }
            >
              <PriceTable key={priceKey} materialId={m.id} unitCode={unitCode} />
            </Card>
          )}
        </div>
      )}
      {editing && m && (
        <MaterialForm
          open
          material={m}
          onClose={() => setEditing(false)}
          onSaved={(x) => {
            setEditing(false);
            r.setData({ data: x });
          }}
        />
      )}
      {pricing && m && (
        <PriceForm
          open
          materialId={m.id}
          onClose={() => setPricing(false)}
          onSaved={() => {
            setPricing(false);
            setPriceKey((k) => k + 1);
          }}
        />
      )}
    </Page>
  );
}
