'use client';
import { useState } from 'react';
import { Page } from '@/components/shell';
import { Tabs } from '@/components/ui';
import { useSession } from '@/lib/session';
import { NamedCatalog } from '@/components/catalogo/NamedCatalog';

export default function CatalogoPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'cat' | 'unit'>('cat');
  const canEdit = can('editCatalogBase');
  return (
    <Page title="Rubros y unidades" crumb="Catálogo">
      <div className="stack">
        <Tabs
          tabs={[
            { key: 'cat', label: 'Rubros' },
            { key: 'unit', label: 'Unidades' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'cat' ? (
          <NamedCatalog key="cat" path="/categories" title="Rubros" singular="rubro" canEdit={canEdit} />
        ) : (
          <NamedCatalog
            key="unit"
            path="/units"
            title="Unidades"
            singular="unidad"
            fem
            canEdit={canEdit}
            hint="Cambiar el nombre o el símbolo de una unidad no modifica las cantidades ya cargadas en materiales ni APU."
          />
        )}
      </div>
    </Page>
  );
}
