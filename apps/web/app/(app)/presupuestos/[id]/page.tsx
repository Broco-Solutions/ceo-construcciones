'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Columns2, Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, DefList, Empty, ErrorBox, Loading, Modal, Pill, SelectField } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { BudgetFlow, STATUS_LABEL, STATUS_TONE, TAX_LABEL, ReferencePill, useWorkReference, useWorks } from '@/components/presupuesto/common';
import { VersionForm } from '@/components/presupuesto/VersionForm';
import { ReferenceButton } from '@/components/presupuesto/ReferenceButton';
import { VersionCompare } from '@/components/presupuesto/VersionCompare';

export default function BudgetDetailPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Suspense fallback={<Loading />}>
        <Detail />
      </Suspense>
    </RequirePerm>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const q = useApi<{ data: Schemas['BudgetDetail'] }>(`/budgets/${id}`);
  const works = useWorks();
  const [newOpen, setNewOpen] = useState(sp.get('nuevaVersion') === '1' && can('editBudget'));
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const budget = q.data?.data;
  const ref = useWorkReference(budget?.workId);
  const reloadAll = () => (q.reload(), ref.reload());
  const crumb = <Link href="/presupuestos">Presupuestos</Link>;
  if (q.loading && !budget) return <Page title="Presupuesto"><Loading /></Page>;
  if (q.error || !budget) return <Page title="Presupuesto"><ErrorBox error={q.error} onRetry={q.reload} /></Page>;
  const w = works.workById.get(budget.workId);
  const versions = [...budget.versions].sort((x, y) => y.number - x.number);
  const va = versions.find((v) => v.id === a);
  const vb = versions.find((v) => v.id === b);
  const vOpts = versions.map((v) => ({ value: v.id, label: `Versión ${v.number} · ${formatDateTime(v.createdAt)}` }));
  return (
    <Page
      title={budget.name}
      crumb={crumb}
      actions={
        can('editBudget') && (
          <Button onClick={() => setNewOpen(true)}>
            <Plus size={16} /> Nueva versión
          </Button>
        )
      }
    >
      <Card>
        <BudgetFlow step={versions.length ? 3 : 2} />
      </Card>
      <Card title="Datos">
        <DefList
          items={[
            ['Obra', w ? <Link href={`/presupuestos?workId=${w.id}`}>{`${w.code} · ${w.name}`}</Link> : '—'],
            ['Versiones', String(versions.length)],
            ['Referencia de la obra', ref.referenceVersionId ? (() => { const rv = versions.find((x) => x.id === ref.referenceVersionId); return rv ? `Versión ${rv.number}` : 'Versión de otro presupuesto'; })() : 'Sin referencia'],
            ['Creado', formatDateTime(budget.createdAt)],
          ]}
        />
        {w && (
          <div className="row small" style={{ marginTop: 8, gap: 12 }}>
            <Link href={`/computos?workId=${w.id}`}>Ver cómputos de la obra</Link>
          </div>
        )}
      </Card>
      <Card title="Historial de versiones" bodyClass="">
        <DataTable
          rows={versions}
          rowKey={(v) => v.id}
          onRowClick={(v) => router.push(`/presupuestos/versiones/${v.id}`)}
          empty={<Empty title="Sin versiones">Creá la primera versión desde un cómputo de la obra.</Empty>}
          columns={[
            { key: 'n', header: 'Versión', render: (v) => <span className="row" style={{ gap: 6 }}><b>V{v.number}</b>{ref.referenceVersionId === v.id && <ReferencePill />}</span> },
            { key: 'st', header: 'Estado', render: (v) => <Pill tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Pill> },
            { key: 'comp', header: 'Cómputo', render: (v) => v.snapshot.computationName, hideMobile: true },
            { key: 'crit', header: 'Criterio', render: (v) => `${v.currency} · ${TAX_LABEL[v.taxBasis]} · ${v.precision} dec. · ${v.roundingMode}`, hideMobile: true },
            { key: 'tot', header: 'Costo total', align: 'r', render: (v) => <b>{formatMoney(v.snapshot.totalCost, v.currency)}</b> },
            { key: 'f', header: 'Creada', render: (v) => formatDateTime(v.createdAt), hideMobile: true },
            { key: 'ref', header: '', render: (v) => <span onClick={(e) => e.stopPropagation()}><ReferenceButton version={v} onDone={reloadAll} /></span> },
          ]}
          mobile={(v) => (
            <div className="stack" style={{ gap: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <b>Versión {v.number}</b>
                {ref.referenceVersionId === v.id && <ReferencePill />}
                <Pill tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</Pill>
              </div>
              <span className="small muted">{v.snapshot.computationName} · {formatDateTime(v.createdAt)}</span>
              <b>{formatMoney(v.snapshot.totalCost, v.currency)}</b>
              <span onClick={(e) => e.stopPropagation()}><ReferenceButton version={v} onDone={reloadAll} /></span>
            </div>
          )}
        />
      </Card>
      {versions.length >= 2 && (
        <Card title={<><Columns2 size={16} aria-hidden /> Comparar versiones</>}>
          <div className="formgrid">
            <SelectField label="Versión A" value={a} placeholder="Elegir…" options={vOpts} onChange={(e) => setA(e.target.value)} />
            <SelectField label="Versión B" value={b} placeholder="Elegir…" options={vOpts} onChange={(e) => setB(e.target.value)} />
          </div>
          {va && vb ? va.id === vb.id ? <p className="small muted">Elegí dos versiones distintas.</p> : <VersionCompare a={va} b={vb} /> : <p className="small muted">Elegí dos versiones para verlas lado a lado.</p>}
        </Card>
      )}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Nueva versión de presupuesto" wide>
        {newOpen && (
          <VersionForm
            budget={budget}
            defaultComputationId={sp.get('computationId') ?? undefined}
            onCreated={(v) => {
              setNewOpen(false);
              router.push(`/presupuestos/versiones/${v.id}`);
            }}
            onCancel={() => setNewOpen(false)}
          />
        )}
      </Modal>
    </Page>
  );
}
