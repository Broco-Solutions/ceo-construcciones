'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Schemas } from '@/lib/api';
import { Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card } from '@/components/ui';
import { useSession } from '@/lib/session';
import { ExportButton, useSuppliers } from '@/components/catalogo/common';
import { MaterialPicker } from '@/components/catalogo/MaterialPicker';
import { PriceTable } from '@/components/catalogo/PriceTable';
import { PriceForm } from '@/components/catalogo/PriceForm';
import { PriceComparison } from '@/components/catalogo/PriceComparison';

export function MaterialReferencePanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Inner embedded={embedded} />
    </RequirePerm>
  );
}

function Inner({ embedded }: { embedded: boolean }) {
  const suppliers = useSuppliers(true);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [creating, setCreating] = useState(false);
  const [reference, setReference] = useState<Schemas['MaterialPrice']>();
  const [k, setK] = useState(0);
  const actions = (
    <>
      <Link href="/proveedores/importar-precios" className="btn sec">
        Importar Excel / CSV
      </Link>
      <Button
        onClick={() => {
          setReference(undefined);
          setCreating(true);
        }}
      >
        <Plus size={16} /> Registrar precio
      </Button>
    </>
  );
  const content = (
    <>
      <div className="stack">
        <div className="note small" role="note">
          <b className="ink">¿Cómo se actualizan los precios?</b>
          <div>
            Para cambiar el precio de un material, registrá uno nuevo. Los
            precios anteriores se conservan en el historial, con su vigencia,
            moneda e impuestos, para que puedas consultar los cambios.
          </div>
        </div>
        <Card bodyClass="">
          <div className="formgrid" style={{ padding: 12 }}>
            <MaterialPicker
              label="Filtrar por material"
              value={materialId}
              onChange={(m) => setMaterialId(m?.id ?? null)}
              includeInactive
            />
            <div className="field">
              <label htmlFor="flt-sup">Filtrar por proveedor</label>
              <select
                id="flt-sup"
                className="input"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="">Todos</option>
                {suppliers.rows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <PriceTable
            onRegisterReference={(price) => {
              setReference(price);
              setCreating(true);
            }}
            key={`${k}-${materialId}-${supplierId}`}
            materialId={materialId ?? undefined}
            supplierId={supplierId || undefined}
          />
        </Card>
        {materialId && <PriceComparison materialId={materialId} />}
      </div>
      {creating && (
        <PriceForm
          open
          supplierId={(reference?.supplierId ?? supplierId) || undefined}
          materialId={reference?.materialId ?? materialId ?? undefined}
          initialReference={reference}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setK((x) => x + 1);
          }}
        />
      )}
    </>
  );
  return embedded ? (
    <div className="stack">
      <div className="row">{actions}</div>
      {content}
    </div>
  ) : (
    <Page
      title="Precios"
      crumb={<Link href="/proveedores">Proveedores</Link>}
      actions={actions}
    >
      {content}
    </Page>
  );
}
