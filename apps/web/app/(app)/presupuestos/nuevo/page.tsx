'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  ErrorBox,
  fieldErrors,
  Loading,
  SelectField,
  TextField,
  useToast,
} from '@/components/ui';
import { useSession } from '@/lib/session';
import { useMutation, useApi } from '@/lib/hooks';
import { api, ApiError, type Schemas } from '@/lib/api';
import { BudgetFlow, useWorks } from '@/components/presupuesto/common';

export default function NewBudgetPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('editBudget')}>
      <Page
        title="Nuevo presupuesto"
        crumb={<Link href="/presupuestos">Presupuestos</Link>}
      >
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
  const sourceVersionId = sp.get('sourceVersionId');
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [name, setName] = useState('');
  const templates = useApi<{ data: Schemas['BudgetTemplate'][] }>(
    '/budget-templates',
  );
  const legacy =
    templates.error instanceof ApiError &&
    (templates.error.code === 'FEATURE_NOT_ENABLED' ||
      templates.error.status === 404);
  const base = useApi<{ data: Schemas['BaseTemplateInfo'] }>(
    '/budget-templates/base',
  );
  const install = useMutation((key: string) =>
    api.post<{ data: Schemas['BudgetTemplate'] }>(
      '/budget-templates/base',
      undefined,
      { idempotencyKey: key },
    ),
  );
  const [templateId, setTemplateId] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const save = useMutation((key: string, body: Schemas['BudgetInput']) =>
    api.post<{ data: Schemas['Budget'] }>(
      computationId || legacy ? '/budgets' : '/budget-editor',
      {
        ...body,
        ...(!computationId && !legacy && sourceVersionId
          ? { sourceVersionId }
          : !computationId && !legacy && templateId
            ? { templateId }
            : {}),
      },
      { idempotencyKey: key },
    ),
  );
  if (works.loading) return <Loading />;
  if (works.error)
    return <ErrorBox error={works.error} onRetry={works.reload} />;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!workId) er.workId = 'Elegí la obra.';
    if (!name.trim()) er.name = 'Ingresá un nombre.';
    setErrs(er);
    if (Object.keys(er).length) return;
    const r = await save.run({ workId, name: name.trim() });
    if (r) {
      toast.success('Presupuesto creado correctamente');
      router.push(
        computationId || legacy
          ? `/presupuestos/${r.data.id}?nuevaVersion=1${computationId ? '&computationId=' + computationId : ''}`
          : `/presupuestos/editor/${r.data.id}`,
      );
    }
  }
  const fe = { ...fieldErrors(save.error), ...errs };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Card title="Presupuesto">
        <div className="formgrid">
          <SelectField
            label="Obra"
            value={workId}
            placeholder="Elegir obra…"
            options={works.rows.map((w) => ({
              value: w.id,
              label: `${w.code} · ${w.name}`,
            }))}
            onChange={(e) => setWorkId(e.target.value)}
            error={fe.workId}
          />
          <TextField
            label="Nombre"
            value={name}
            maxLength={300}
            onChange={(e) => setName(e.target.value)}
            placeholder="Presupuesto de obra"
            error={fe.name}
          />
        </div>
        {!computationId && !legacy && (
          <SelectField
            label="Empezar desde"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="En blanco"
            options={(templates.data?.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            hint="La plantilla copia rubros y composiciones. Los cambios quedan sólo en este presupuesto."
          />
        )}
        {!computationId && base.data && (
          <details>
            <summary>
              Plantilla BASE de CEO · {base.data.data.activities} actividades
            </summary>
            <p className="note">
              {base.data.data.notice} Incorporar la plantilla agrega sus
              materiales de referencia con códigos BASE propios y sus
              rubros/unidades; no reemplaza el catálogo existente.
            </p>
            <details>
              <summary>
                Observaciones de la fuente ({base.data.data.issues.length})
              </summary>
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {base.data.data.issues.map((i, n) => (
                  <p className="small" key={n}>
                    Fila {i.row}: {i.message}
                  </p>
                ))}
              </div>
            </details>
            <Button
              variant="sec"
              loading={install.pending}
              onClick={async () => {
                const r = await install.run();
                if (r) {
                  templates.reload();
                  setTemplateId(r.data.id);
                  toast.success('BASE incorporada y seleccionada');
                }
              }}
            >
              Incorporar y usar BASE
            </Button>
            <ErrorBox error={install.error} />
          </details>
        )}
        <p className="small muted">
          Cargá las cantidades, revisá el costo y definí la rentabilidad al
          final. Guardar un borrador no emite una revisión.
        </p>
        {legacy ? (
          <p className="note">
            El presupuesto comercial todavía no está habilitado en este entorno.
            Podés conservar el circuito V1 de versiones de costos desde un
            cómputo.
          </p>
        ) : (
          <ErrorBox error={templates.error} onRetry={templates.reload} />
        )}
      </Card>
      <ErrorBox error={save.error} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <Button
          variant="sec"
          size="lg"
          onClick={() => router.push('/presupuestos')}
          disabled={save.pending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="lg" loading={save.pending}>
          Crear presupuesto
        </Button>
      </div>
    </form>
  );
}
