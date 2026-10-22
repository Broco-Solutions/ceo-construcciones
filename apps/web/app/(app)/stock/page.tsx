'use client';
import { unitSymbol } from '@/lib/units';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Download, Plus, SlidersHorizontal } from 'lucide-react';
import { api, type Schemas } from '@/lib/api';
import { usePaged } from '@/lib/hooks';
import { formatDateTime, formatQty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Page } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill, useToast } from '@/components/ui';
import { InvNav, KIND_LABEL, LocationSelect, MaterialSelect, MinimumValue, locLabel, useInvLookups } from '@/components/inventario/common';
import { MinimumModal } from '@/components/inventario/MinimumModal';

type Stock = Schemas['Stock'];

function StockInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { can } = useSession();
  const locationId = sp.get('locationId') ?? '';
  const materialId = sp.get('materialId') ?? '';
  const lk = useInvLookups();
  const { rows, pagination, page, setPage, loading, error, reload } = usePaged<Stock>('/stock', { locationId, materialId });
  const [minFor, setMinFor] = useState<{ locationId: string; materialId: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  const setParam = (k: string, v: string) => {
    const q = new URLSearchParams(sp.toString());
    if (v) q.set(k, v);
    else q.delete(k);
    router.replace(`/stock${q.toString() ? `?${q}` : ''}`);
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const name = await api.download('/exports/stock', undefined, 'stock.xlsx');
      toast.success('Planilla de stock descargada', { description: name });
    } catch (e) {
      toast.failure('No se pudo descargar la planilla de stock', e);
    } finally {
      setExporting(false);
    }
  };

  const current = locationId ? lk.locById.get(locationId) : undefined;
  const depots = lk.locations.filter((l) => l.active && l.kind !== 'WORK');
  const workLocs = lk.locations.filter((l) => l.active && l.kind === 'WORK');

  return (
    <Page
      title="Stock"
      crumb="Inventario"
      actions={
        <>
          <Button variant="sec" onClick={exportXlsx} loading={exporting}>
            <Download size={16} /> Exportar Excel
          </Button>
          {can('manageStock') && (
            <Button variant="sec" onClick={() => setMinFor({ locationId, materialId })}>
              <SlidersHorizontal size={16} /> Configurar mínimo
            </Button>
          )}
          {can('consume') && (
            <Link className="btn" href={`/stock/movimientos/nuevo${locationId ? `?sourceId=${locationId}` : ''}`}>
              <Plus size={16} /> Registrar movimiento
            </Link>
          )}
        </>
      }
    >
      <InvNav />
      <Card title="Acceso rápido">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button size="sm" variant={!locationId ? 'primary' : 'sec'} onClick={() => setParam('locationId', '')}>
            Todas las ubicaciones
          </Button>
          {depots.map((l) => (
            <Button key={l.id} size="sm" variant={locationId === l.id ? 'primary' : 'sec'} onClick={() => setParam('locationId', l.id)}>
              {KIND_LABEL[l.kind]} · {l.name}
            </Button>
          ))}
          {(workLocs.length > QUICK_WORKS ? workLocs.filter((l, i) => i < QUICK_WORKS || l.id === locationId) : workLocs).map((l) => (
            <Button key={l.id} size="sm" variant={locationId === l.id ? 'primary' : 'ghost'} onClick={() => setParam('locationId', l.id)}>
              Obra · {l.name}
            </Button>
          ))}
          {workLocs.length > QUICK_WORKS && <span className="small muted">y {workLocs.length - QUICK_WORKS} obras más: elegilas en el filtro Ubicación.</span>}
          {lk.loading && <span className="small muted">Cargando ubicaciones…</span>}
        </div>
      </Card>

      <Card bodyClass="">
        <div className="filters">
          <div style={{ minWidth: 220 }}>
            <LocationSelect label="Ubicación" value={locationId} onChange={(v) => setParam('locationId', v)} locations={lk.locations} placeholder="Todas" />
          </div>
          <div style={{ minWidth: 260 }}>
            <MaterialSelect value={materialId} onChange={(v) => setParam('materialId', v)} materials={lk.materials} placeholder="Todos" />
          </div>
        </div>
        <div className="bd">
          {current && (
            <p className="small muted" style={{ marginTop: 0 }}>
              Mostrando saldos de <b>{locLabel(current)}</b>.
            </p>
          )}
          <p className="small muted" style={{ marginTop: 0 }}>
            Disponible = físico − reservado, calculado por el sistema. El mínimo mostrado es el efectivo para esa ubicación e indica si es propio de la ubicación, heredado del material o si no hay mínimo.
          </p>
          <ErrorBox error={error ?? lk.error} onRetry={reload} />
          {loading ? (
            <Loading />
          ) : (
            <>
              <DataTable
                rows={rows}
                rowKey={(r) => r.id}
                empty={
                  <Empty title="Sin saldos registrados">
                    {locationId || materialId ? 'No hay saldos para el filtro elegido.' : 'Todavía no se registraron movimientos de stock.'}
                  </Empty>
                }
                columns={[
                  { key: 'm', header: 'Material', render: (r) => <><b>{r.material.name}</b> <span className="mono small muted">{r.material.code}</span></> },
                  { key: 'l', header: 'Ubicación', render: (r) => locLabel(r.location) },
                  { key: 'p', header: 'Físico', align: 'r', render: (r) => formatQty(r.physical, unitSymbol(r.material.unit)) },
                  { key: 'r', header: 'Reservado', align: 'r', render: (r) => formatQty(r.reserved, unitSymbol(r.material.unit)) },
                  { key: 'a', header: 'Disponible', align: 'r', render: (r) => <b>{formatQty(r.available, unitSymbol(r.material.unit))}</b> },
                  { key: 'min', header: 'Mínimo', align: 'r', render: (r) => <MinimumValue minimum={r.minimum} source={r.minimumSource} unit={unitSymbol(r.material.unit)} /> },
                  {
                    key: 'st',
                    header: 'Estado',
                    render: (r) =>
                      r.belowMinimum ? (
                        <Pill tone="bad">
                          <AlertTriangle size={12} /> Bajo mínimo
                        </Pill>
                      ) : (
                        <Pill tone="ok">OK</Pill>
                      ),
                  },
                  { key: 'u', header: 'Actualizado', hideMobile: true, render: (r) => <span className="small muted">{formatDateTime(r.updatedAt)}</span> },
                  ...(can('manageStock')
                    ? [
                        {
                          key: 'x',
                          header: '',
                          render: (r: Stock) => (
                            <Button size="sm" variant="ghost" onClick={() => setMinFor({ locationId: r.locationId, materialId: r.materialId })}>
                              Mínimo
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
                mobile={(r) => (
                  <div className="stack" style={{ gap: 6 }}>
                    <div className="row">
                      <b style={{ flex: 1 }}>{r.material.name}</b>
                      {r.belowMinimum ? <Pill tone="bad">Bajo mínimo</Pill> : <Pill tone="ok">OK</Pill>}
                    </div>
                    <span className="small muted">{locLabel(r.location)}</span>
                    <div className="dl">
                      <div><small>Físico</small><span>{formatQty(r.physical, unitSymbol(r.material.unit))}</span></div>
                      <div><small>Reservado</small><span>{formatQty(r.reserved, unitSymbol(r.material.unit))}</span></div>
                      <div><small>Disponible</small><span><b>{formatQty(r.available, unitSymbol(r.material.unit))}</b></span></div>
                      <div><small>Mínimo</small><span><MinimumValue minimum={r.minimum} source={r.minimumSource} unit={unitSymbol(r.material.unit)} /></span></div>
                    </div>
                    {can('manageStock') && (
                      <Button size="sm" variant="sec" onClick={() => setMinFor({ locationId: r.locationId, materialId: r.materialId })}>
                        Configurar mínimo
                      </Button>
                    )}
                  </div>
                )}
              />
              <PagerBar pagination={pagination} page={page} setPage={setPage} />
            </>
          )}
        </div>
      </Card>

      {minFor && (
        <MinimumModal
          initial={minFor}
          current={minFor.locationId && minFor.materialId ? rows.find((r) => r.locationId === minFor.locationId && r.materialId === minFor.materialId) : undefined}
          locations={lk.locations}
          materials={lk.materials}
          onClose={() => setMinFor(null)}
          onSaved={() => {
            setMinFor(null);
            reload();
          }}
        />
      )}
    </Page>
  );
}

const QUICK_WORKS = 8;

export default function StockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StockInner />
    </Suspense>
  );
}
