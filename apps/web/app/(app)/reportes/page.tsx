'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Download, Info } from 'lucide-react';
import { api, type Pagination, type Schemas } from '@/lib/api';
import { useAll, useApi } from '@/lib/hooks';
import { formatQty } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, PagerBar, Pill, SelectField, useToast } from '@/components/ui';
import { MaterialSelect, useInvLookups } from '@/components/inventario/common';

type Report = Schemas['MaterialReport'];
type Row = Schemas['ReportRow'];

const DEF_LABEL: Record<keyof Report['definitions'], string> = {
  requested: 'Pedido',
  purchased: 'Comprado',
  received: 'Recibido',
  consumed: 'Consumido',
  available: 'Disponible',
  categoryAttribution: 'Atribución por rubro',
};
const STATUS_LABEL: Record<string, string> = { DRAFT: 'borrador', REFERENCE: 'referencia', ARCHIVED: 'archivada' };

/** Separa "CODIGO: explicación" que devuelve el backend; muestra la explicación tal cual. */
function splitWarning(w: string) {
  const m = /^([A-Z0-9_]+):\s*(.*)$/.exec(w);
  return m ? { code: m[1], text: m[2] } : { code: null, text: w };
}

function Variance({ v, unit }: { v: string | null; unit: string }) {
  if (v === null) return <span className="muted" title="Sin referencia: no se calcula desvío">—</span>;
  const neg = v.startsWith('-') && /[1-9]/.test(v);
  const zero = !/[1-9]/.test(v);
  return <Pill tone={zero ? 'ok' : neg ? 'ok' : 'warn'}>{`${!neg && !zero ? '+' : ''}${formatQty(v, unit)}`}</Pill>;
}

function ReportInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const lk = useInvLookups();
  const workId = sp.get('workId') ?? '';
  const categoryId = sp.get('categoryId') ?? '';
  const materialId = sp.get('materialId') ?? '';
  const versionId = sp.get('versionId') ?? '';
  const [page, setPage] = useState(1);
  const cats = useAll<{ id: string; code: string; name: string }>('/categories');
  const q = { workId, categoryId, materialId, versionId, page, pageSize: 50 };
  const rep = useApi<{ data: Report; pagination: Pagination }>(workId ? '/reports/materials' : null, q);
  const [exporting, setExporting] = useState(false);

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    setPage(1);
    router.replace(`/reportes${n.toString() ? `?${n}` : ''}`);
  };

  const exportXlsx = async () => {
    setExporting(true);
    try {
      const name = await api.download('/reports/materials/export', { workId, categoryId, materialId, versionId }, 'seguimiento-materiales.xlsx');
      toast(`Descargado ${name}`);
    } catch (e) {
      toast((e as Error).message, 'bad');
    } finally {
      setExporting(false);
    }
  };

  const r = rep.data?.data;
  const hasPlanned = !!r?.version;
  const cols: { key: string; header: string; render: (x: Row) => React.ReactNode; align?: 'r'; hideMobile?: boolean }[] = [
    { key: 'm', header: 'Material', render: (x) => <><b>{x.name}</b> <span className="mono small muted">{x.code}</span></> },
    { key: 'pl', header: 'Previsto', align: 'r', render: (x) => (x.planned === null ? <span className="muted" title="Sin versión de referencia">—</span> : formatQty(x.planned, x.unit)) },
    { key: 'rq', header: 'Pedido', align: 'r', render: (x) => formatQty(x.requested, x.unit) },
    { key: 'pu', header: 'Comprado', align: 'r', render: (x) => formatQty(x.purchased, x.unit) },
    { key: 're', header: 'Recibido', align: 'r', render: (x) => formatQty(x.received, x.unit) },
    { key: 'co', header: 'Consumido', align: 'r', render: (x) => formatQty(x.consumed, x.unit) },
    { key: 'ph', header: 'Físico obra', align: 'r', hideMobile: true, render: (x) => (x.physical === null ? <span className="muted" title="No atribuible al rubro">—</span> : formatQty(x.physical, x.unit)) },
    { key: 'rs', header: 'Reservado', align: 'r', hideMobile: true, render: (x) => (x.reserved === null ? <span className="muted">—</span> : formatQty(x.reserved, x.unit)) },
    { key: 'av', header: 'Disponible', align: 'r', render: (x) => (x.available === null ? <span className="muted" title="No atribuible al rubro">—</span> : <b>{formatQty(x.available, x.unit)}</b>) },
    ...(hasPlanned
      ? [
          { key: 'rtr', header: 'Falta pedir', align: 'r' as const, render: (x: Row) => (x.remainingToRequest === null ? '—' : formatQty(x.remainingToRequest, x.unit)) },
          { key: 'rtp', header: 'Falta comprar', align: 'r' as const, render: (x: Row) => (x.remainingToPurchase === null ? '—' : formatQty(x.remainingToPurchase, x.unit)) },
          { key: 'cv', header: "Desvío consumo (consumido − previsto)", align: 'r' as const, render: (x: Row) => <Variance v={x.consumptionVariance} unit={x.unit} /> },
        ]
      : []),
  ];

  return (
    <Page
      title="Seguimiento de materiales"
      crumb="Informes"
      actions={
        workId && (
          <Button variant="sec" onClick={exportXlsx} loading={exporting}>
            <Download size={16} /> Exportar Excel
          </Button>
        )
      }
    >
      <Card bodyClass="">
        <div className="filters">
          <div style={{ minWidth: 240 }}>
            <SelectField label="Obra" value={workId} onChange={(e) => setParam('workId', e.target.value)} placeholder="Seleccioná una obra" options={lk.works.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} />
          </div>
          <div style={{ minWidth: 200 }}>
            <SelectField label="Rubro" value={categoryId} onChange={(e) => setParam('categoryId', e.target.value)} placeholder="Todos" options={cats.rows.map((c) => ({ value: c.id, label: c.name }))} />
          </div>
          <div style={{ minWidth: 260 }}>
            <MaterialSelect value={materialId} onChange={(v) => setParam('materialId', v)} materials={lk.materials} placeholder="Todos" />
          </div>
        </div>
        <div className="bd stack">
          <ErrorBox error={lk.error ?? rep.error} onRetry={rep.reload} />
          {!workId ? (
            lk.loading ? <Loading /> : <Empty title="Elegí una obra">El informe muestra cantidades previstas, pedidas, compradas, recibidas, consumidas y disponibles por material.</Empty>
          ) : rep.loading && !r ? (
            <Loading />
          ) : r ? (
            <>
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                {r.version ? (
                  <Pill tone="blue">
                    Referencia: versión {r.version.number} ({STATUS_LABEL[r.version.status] ?? r.version.status})
                  </Pill>
                ) : (
                  <Pill tone="warn">Sin versión de referencia</Pill>
                )}
                {rep.loading && <span className="small muted">Actualizando…</span>}
              </div>
              {r.warnings.length > 0 && (
                <div className="alert warn" role="status">
                  <ul style={{ margin: 0 }}>
                    {r.warnings.map((w) => {
                      const s = splitWarning(w);
                      return <li key={w}>{s.text}{s.code && <span className="mono small muted"> ({s.code})</span>}</li>;
                    })}
                  </ul>
                </div>
              )}
              <DataTable
                rows={r.rows}
                rowKey={(x) => x.materialId}
                columns={cols}
                empty={<Empty title="Sin movimientos de materiales para esta obra" />}
                mobile={(x) => (
                  <div className="stack" style={{ gap: 6 }}>
                    <b>{x.name}</b>
                    <div className="dl">
                      <div><small>Previsto</small><span>{x.planned === null ? '—' : formatQty(x.planned, x.unit)}</span></div>
                      <div><small>Pedido</small><span>{formatQty(x.requested, x.unit)}</span></div>
                      <div><small>Comprado</small><span>{formatQty(x.purchased, x.unit)}</span></div>
                      <div><small>Recibido</small><span>{formatQty(x.received, x.unit)}</span></div>
                      <div><small>Consumido</small><span>{formatQty(x.consumed, x.unit)}</span></div>
                      <div><small>Disponible</small><span>{x.available === null ? '—' : formatQty(x.available, x.unit)}</span></div>
                      {hasPlanned && <div><small>Desvío consumo</small><span><Variance v={x.consumptionVariance} unit={x.unit} /></span></div>}
                    </div>
                  </div>
                )}
              />
              <PagerBar pagination={rep.data?.pagination} page={page} setPage={setPage} />
              <details>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  <Info size={13} /> Cómo se calcula cada columna
                </summary>
                <div className="dl" style={{ marginTop: 8 }}>
                  {(Object.keys(DEF_LABEL) as (keyof Report['definitions'])[]).map((k) => (
                    <div key={k}>
                      <small>{DEF_LABEL[k]}</small>
                      <span className="small">{r.definitions[k]}</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          ) : null}
        </div>
      </Card>
    </Page>
  );
}

export default function ReportesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('reports')}>
      <Suspense fallback={<Loading />}>
        <ReportInner />
      </Suspense>
    </RequirePerm>
  );
}
