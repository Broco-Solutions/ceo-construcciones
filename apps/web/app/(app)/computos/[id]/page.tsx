'use client';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FileSpreadsheet, Pencil } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DefList, Empty, ErrorBox, Loading, Pill } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatDateTime, formatQty } from '@/lib/format';
import { ComputationForm } from '@/components/presupuesto/ComputationForm';
import { BudgetFlow, useWorks } from '@/components/presupuesto/common';

export default function ComputationDetailPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Detail />
    </RequirePerm>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const q = useApi<{ data: Schemas['ComputationDetail'] }>(`/computations/${id}`);
  const works = useWorks();
  const [editing, setEditing] = useState(false);
  const c = q.data?.data;
  const crumb = <Link href="/computos">Cómputos</Link>;
  if (q.loading && !c) return <Page title="Cómputo"><Loading /></Page>;
  if (q.error || !c) return <Page title="Cómputo"><ErrorBox error={q.error} onRetry={q.reload} /></Page>;
  if (editing)
    return (
      <Page title={`Editar: ${c.name}`} crumb={crumb}>
        <ComputationForm initial={c} onSaved={() => (setEditing(false), q.reload())} onCancel={() => setEditing(false)} />
      </Page>
    );
  const w = works.workById.get(c.workId);
  const groups = new Map<string, { name: string; lines: Schemas['ComputationLineDetail'][] }>();
  c.lines.forEach((l) => {
    const g = groups.get(l.item.categoryId) ?? { name: l.item.category.name, lines: [] };
    g.lines.push(l);
    groups.set(l.item.categoryId, g);
  });
  return (
    <Page
      title={c.name}
      crumb={crumb}
      actions={
        can('editBudget') && (
          <>
            <Button variant="sec" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Editar
            </Button>
            <Link className="btn" href={`/presupuestos/nuevo?workId=${c.workId}&computationId=${c.id}`}>
              <FileSpreadsheet size={14} /> Presupuestar
            </Link>
          </>
        )
      }
    >
      <Card>
        <BudgetFlow step={1} />
      </Card>
      <Card title="Datos">
        <DefList
          items={[
            ['Obra', w ? <Link href={`/presupuestos?workId=${w.id}`}>{`${w.code} · ${w.name}`}</Link> : '—'],
            ['Ítems', String(c.lines.length)],
            ['Actualizado', formatDateTime(c.updatedAt)],
          ]}
        />
      </Card>
      <Card title="Cantidades por rubro" bodyClass="">
        {c.lines.length === 0 ? (
          <Empty title="Sin líneas" />
        ) : (
          [...groups.entries()].map(([k, g], n) => (
            <div key={k} className="rubro open">
              <div className="row" style={{ padding: '12px 18px', gap: 10 }}>
                <span className="mono small muted">{String(n + 1).padStart(2, '0')}</span>
                <b style={{ flex: 1 }}>{g.name}</b>
                <span className="small muted">{g.lines.length} ítems</span>
              </div>
              <div className="items">
                {g.lines.map((l) => (
                  <div key={l.id} className="row" style={{ padding: '6px 0', borderTop: '1px solid var(--line2)', gap: 8, flexWrap: 'wrap' }}>
                    {l.item.code && <span className="mono small">{l.item.code}</span>}
                    <Link href={`/apu/${l.itemId}`} style={{ flex: 1 }}>
                      {l.item.name}
                    </Link>
                    {l.item.components.length === 0 && <Pill tone="blue">Sólo MO</Pill>}
                    <b className="qty">{formatQty(l.quantity, unitSymbol(l.item.unit))}</b>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </Card>
    </Page>
  );
}
