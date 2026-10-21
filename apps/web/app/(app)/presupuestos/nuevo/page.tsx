'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, ErrorBox, fieldErrors, Loading, SelectField, TextField, useToast } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useMutation } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
import { BudgetFlow, useWorks } from '@/components/presupuesto/common';

export default function NewBudgetPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('editBudget')}>
      <Page title="Nuevo presupuesto" crumb={<Link href="/presupuestos">Presupuestos</Link>}>
        <Suspense fallback={<Loading />}>
          <Form />
        </Suspense>
      </Page>
    </RequirePerm>
  );
}

function Form() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const works = useWorks();
  const computationId = sp.get('computationId');
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [name, setName] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = useMutation((_k: string, body: Schemas['BudgetInput']) => api.post<{ data: Schemas['Budget'] }>('/budgets', body));
  if (works.loading) return <Loading />;
  if (works.error) return <ErrorBox error={works.error} onRetry={works.reload} />;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!workId) er.workId = 'Elegí la obra.';
    if (!name.trim()) er.name = 'Ingresá un nombre.';
    setErrs(er);
    if (Object.keys(er).length) return;
    const r = await save.run({ workId, name: name.trim() });
    if (r) {
      toast('Presupuesto creado. Ahora creá la primera versión.');
      router.push(`/presupuestos/${r.data.id}?nuevaVersion=1${computationId ? `&computationId=${computationId}` : ''}`);
    }
  }
  const fe = { ...fieldErrors(save.error), ...errs };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Card>
        <BudgetFlow step={2} />
      </Card>
      <Card title="Presupuesto">
        <div className="formgrid">
          <SelectField label="Obra" value={workId} placeholder="Elegir obra…" options={works.rows.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))} onChange={(e) => setWorkId(e.target.value)} error={fe.workId} />
          <TextField label="Nombre" value={name} maxLength={300} onChange={(e) => setName(e.target.value)} placeholder="Presupuesto de obra" error={fe.name} />
        </div>
        <p className="small muted">El presupuesto agrupa versiones. Cada versión se calcula desde un cómputo de esta obra con precios y criterios explícitos.</p>
      </Card>
      <ErrorBox error={save.error} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="sec" size="lg" onClick={() => router.push('/presupuestos')} disabled={save.pending}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" loading={save.pending}>
          Crear presupuesto
        </Button>
      </div>
    </form>
  );
}
