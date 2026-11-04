'use client';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { useSession } from '@/lib/session';
import { MaterialReferencePanel } from '@/components/catalogo/MaterialReferencePanel';
import { LaborReferences } from '@/components/catalogo/LaborReferences';
export default function CostsPage() {
  const { can } = useSession(),
    [tab, setTab] = useState('Materiales');
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Page title="Costos de referencia" crumb="Catálogo">
        <div className="tabs" role="tablist" aria-label="Costos de referencia">
          {['Materiales', 'Mano de obra'].map((label) => (
            <button
              key={label}
              role="tab"
              aria-selected={label === tab}
              className={label === tab ? 'tab active' : 'tab'}
              onClick={() => setTab(label)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'Materiales' ? (
          <MaterialReferencePanel embedded />
        ) : (
          <LaborReferences />
        )}
      </Page>
    </RequirePerm>
  );
}
