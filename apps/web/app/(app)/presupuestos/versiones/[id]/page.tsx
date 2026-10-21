'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DefList, Empty, ErrorBox, Loading, Pill, Tabs } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatDateTime, formatQty } from '@/lib/format';
import { BOUNDARY_LABEL, BudgetFlow, CalcLines, CalcSummary, ROUNDING_LABEL, STATUS_LABEL, STATUS_TONE, TAX_LABEL, useCatalogs, useWorks } from '@/components/presupuesto/common';
import { ReferenceButton } from '@/components/presupuesto/ReferenceButton';

export default function VersionPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <VersionDetail />
    </RequirePerm>
  );
}

type TabKey = 'costos' | 'materiales' | 'criterio';

function VersionDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useApi<{ data: Schemas['VersionDetail'] }>(`/budget-versions/${id}`);
  const [tab, setTab] = useState<TabKey>('costos');
  const works = useWorks();
  const v = q.data?.data;
  if (q.loading && !v) return <Page title="Versión"><Loading /></Page>;
  if (q.error || !v) return <Page title="Versión"><ErrorBox error={q.error} onRetry={q.reload} /></Page>;
  const s = v.snapshot;
  const w = works.workById.get(v.budget.workId);
  return (
    <Page
      title={`${v.budget.name} · Versión ${v.number}`}
      crumb={
        <>
          <Link href="/presupuestos">Presupuestos</Link> / <Link href={`/presupuestos/${v.budgetId}`}>{v.budget.name}</Link>
        </>
      }
      actions={<ReferenceButton version={v} onDone={q.reload} />}
    >
      <Card>
        <BudgetFlow step={tab === 'materiales' ? 3 : 2} />
      </Card>
      <Card>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Pill tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Pill>
          <span className="small muted">Versión inmutable · creada {formatDateTime(v.createdAt)}</span>
          {v.status === 'REFERENCE' && <span className="small muted">Referencia de la obra (no implica aprobación económica).</span>}
        </div>
        <CalcSummary calc={s} />
      </Card>
      <Tabs<TabKey>
        tabs={[
          { key: 'costos', label: 'Costos por rubro e ítem' },
          { key: 'materiales', label: 'Materiales necesarios' },
          { key: 'criterio', label: 'Criterio y origen' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'costos' && (
        <Card title="Desglose" bodyClass="">
          {s.lines.length ? <CalcLines calc={s} /> : <Empty title="Sin líneas" />}
        </Card>
      )}
      {tab === 'materiales' && <Materials versionId={v.id} />}
      {tab === 'criterio' && (
        <Card title="Criterio de cálculo">
          <DefList
            items={[
              ['Obra', w ? `${w.code} · ${w.name}` : '—'],
              ['Cómputo de origen', <Link key="c" href={`/computos/${s.computationId}`}>{s.computationName}</Link>],
              ['Moneda', v.currency],
              ['Base impositiva', TAX_LABEL[v.taxBasis]],
              ['Precisión', `${v.precision} decimales`],
              ['Modo de redondeo', ROUNDING_LABEL[v.roundingMode] ?? v.roundingMode],
              ['Frontera de redondeo', BOUNDARY_LABEL],
              ['Sobrescrituras puntuales', s.overrides.length ? `${s.overrides.length} líneas ajustadas` : 'Ninguna'],
            ]}
          />
        </Card>
      )}
    </Page>
  );
}

function Materials({ versionId }: { versionId: string }) {
  const q = useApi<{ data: Schemas['VersionMaterials'] }>(`/budget-versions/${versionId}/materials`);
  const cat = useCatalogs();
  const [byCat, setByCat] = useState(false);
  if (q.loading || cat.loading) return <Loading />;
  if (q.error || cat.error) return <ErrorBox error={q.error ?? cat.error} onRetry={() => (q.reload(), cat.reload())} />;
  const d = q.data!.data;
  const name = (id: string) => {
    const m = cat.matById.get(id);
    return m ? `${m.code} · ${m.name}` : id;
  };
  const unit = (id: string) => cat.unitById.get(id)?.code;
  const groups = new Map<string, typeof d.materialsByCategory>();
  d.materialsByCategory.forEach((r) => groups.set(r.categoryId, [...(groups.get(r.categoryId) ?? []), r]));
  return (
    <Card
      title="Materiales necesarios consolidados"
      bodyClass=""
      actions={
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={byCat} onChange={(e) => setByCat(e.target.checked)} /> Ver por rubro
        </label>
      }
    >
      {!d.materials.length ? (
        <Empty title="Sin materiales">Esta versión sólo tiene mano de obra.</Empty>
      ) : !byCat ? (
        <div className="tblwrap">
          <table className="t">
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th className="r" scope="col">Cantidad necesaria</th>
              </tr>
            </thead>
            <tbody>
              {d.materials.map((m) => (
                <tr key={m.materialId}>
                  <td>{name(m.materialId)}</td>
                  <td className="r qty">{formatQty(m.quantity, unit(m.unitId))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        [...groups.entries()].map(([cid, rows]) => (
          <div key={cid} className="rubro open">
            <div className="row" style={{ padding: '10px 18px' }}>
              <b>{cat.catById.get(cid)?.name ?? cid}</b>
            </div>
            <div className="items">
              {rows.map((m) => (
                <div key={m.materialId} className="row" style={{ padding: '4px 0', borderTop: '1px solid var(--line2)' }}>
                  <span style={{ flex: 1 }}>{name(m.materialId)}</span>
                  <b className="qty">{formatQty(m.quantity, unit(m.unitId))}</b>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
