'use client';
import { BatchActions } from '@/components/inventario/InventoryBatch';
import { unitSymbol } from '@/lib/units';
import { useState } from 'react';
import Link from 'next/link';
import type { Schemas } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import { formatQty } from '@/lib/format';
import { Page } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill } from '@/components/ui';
import { InvNav, LocationSelect, MaterialSelect, MinimumValue, useInvLookups } from '@/components/inventario/common';

type Alert = Schemas['StockAlert'];

export default function AlertasPage() {
  const lk = useInvLookups();
  const [locationId, setLocationId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const { rows, pagination, page, setPage, loading, error, reload } = usePaged<Alert>('/stock/alerts', { locationId, materialId });

  return (
    <Page title="Alertas de mínimos" crumb="Inventario" actions={<BatchActions locationId={locationId} allowMovement={false} onSaved={reload}/>}>
      <InvNav />
      <div className="note">
        Materiales cuyo disponible está por debajo del mínimo efectivo de la ubicación. Incluye ubicaciones sin movimientos (físico 0). Un mínimo 0 configurado
        en la ubicación desactiva la alerta allí. No se genera reposición automática.
      </div>
      <Card bodyClass="">
        <div className="filters">
          <div style={{ minWidth: 220 }}>
            <LocationSelect label="Ubicación" value={locationId} onChange={setLocationId} locations={lk.locations} placeholder="Todas" />
          </div>
          <div style={{ minWidth: 260 }}>
            <MaterialSelect value={materialId} onChange={setMaterialId} materials={lk.materials} placeholder="Todos" />
          </div>
        </div>
        <div className="bd">
          <ErrorBox error={error} onRetry={reload} />
          {loading && !rows.length ? (
            <Loading />
          ) : (
            <>
              <DataTable collection={{resource:"stock/alerts",filters:{locationId,materialId},total:pagination?.total,reload}}
                selectionActions={({rows,clear})=><BatchActions selected={rows} locationId={locationId} onSaved={()=>{clear();reload();}}/>}
                rows={rows}
                rowKey={(r) => `${r.materialId}:${r.locationId}`}
                empty={<Empty title="Sin alertas">Ningún material está por debajo de su mínimo.</Empty>}
                columns={[
                  { key: 'm', header: 'Material', render: (r) => <><b>{r.material.name}</b> <span className="mono small muted">{r.material.code}</span></> },
                  { key: 'l', header: 'Ubicación', render: (r) => <Link href={`/stock?locationId=${r.locationId}`}>{r.location.name}</Link> },
                  { key: 'p', header: 'Físico', align: 'r', render: (r) => formatQty(r.physical, unitSymbol(r.material.unit)) },
                  { key: 'r', header: 'Reservado', align: 'r', render: (r) => formatQty(r.reserved, unitSymbol(r.material.unit)) },
                  { key: 'a', header: 'Disponible', align: 'r', render: (r) => <b style={{ color: 'var(--bad)' }}>{formatQty(r.available, unitSymbol(r.material.unit))}</b> },
                  { key: 'min', header: 'Mínimo', align: 'r', render: (r) => <MinimumValue minimum={r.minimum} source={r.minimumSource} unit={unitSymbol(r.material.unit)} /> },
                  { key: 's', header: '', render: (r) => <Pill tone="bad">{r.balanceId ? 'Bajo mínimo' : 'Sin stock registrado'}</Pill> },
                ]}
                mobile={(r) => (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row">
                      <b style={{ flex: 1 }}>{r.material.name}</b>
                      <Pill tone="bad">Bajo mínimo</Pill>
                    </div>
                    <span className="small muted">{r.location.name}</span>
                    <div className="dl">
                      <div><small>Disponible</small><span><b>{formatQty(r.available, unitSymbol(r.material.unit))}</b></span></div>
                      <div><small>Mínimo</small><span><MinimumValue minimum={r.minimum} source={r.minimumSource} unit={unitSymbol(r.material.unit)} /></span></div>
                      <div><small>Físico</small><span>{formatQty(r.physical, unitSymbol(r.material.unit))}</span></div>
                      <div><small>Reservado</small><span>{formatQty(r.reserved, unitSymbol(r.material.unit))}</span></div>
                    </div>
                  </div>
                )}
              />
              <PagerBar pagination={pagination} page={page} setPage={setPage} />
            </>
          )}
        </div>
      </Card>
    </Page>
  );
}
