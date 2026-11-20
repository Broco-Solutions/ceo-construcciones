'use client';
import { useAppRouter } from '@/lib/navigation';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { useAll, useMutation, useApi } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
import { useWorks } from '@/components/presupuesto/common';

type Origin = 'blank' | 'computation' | 'template' | 'revision';

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
  const router = useAppRouter();
  const toast = useToast();
  const works = useWorks();
  const sourceVersionId = sp.get('sourceVersionId');
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [name, setName] = useState('');
  const [computationId, setComputationId] = useState(sp.get('computationId') ?? '');
  const [origin, setOrigin] = useState<Origin>(
    sp.get('computationId') ? 'computation' : sourceVersionId ? 'revision' : 'blank',
  );
  const computations = useAll<Schemas['Computation']>(
    origin === 'computation' && workId ? '/computations' : null,
    { workId },
  );
  const computation = useApi<{ data: Schemas['ComputationDetail'] }>(
    origin === 'computation' && workId && computationId
      ? `/computations/${computationId}`
      : null,
  );
  const detail = computation.data?.data;
  const selectedComputation = detail?.id === computationId && detail.workId === workId
    ? detail
    : undefined;
  const computationOptions = computations.rows
    .filter((c) => c.workId === workId)
    .map((c) => ({ value: c.id, label: c.name }));
  if (selectedComputation && !computationOptions.some((c) => c.value === computationId))
    computationOptions.push({ value: selectedComputation.id, label: selectedComputation.name });
  const templates = useApi<{ data: Schemas['BudgetTemplate'][] }>(
    '/budget-templates',
  );
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
  const [useReferenceCosts,setUseReferenceCosts]=useState(!sourceVersionId);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [created, setCreated] = useState(false);
  const save = useMutation((key: string, body: Schemas['EditorCreateInput']) =>
    api.post<{ data: Schemas['Budget'] }>(
      '/budget-editor',
      body,
      { idempotencyKey: key },
    ),
  );
  if (works.loading) return <Loading />;
  if (works.error)
    return <ErrorBox error={works.error} onRetry={works.reload} />;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (created) return;
    const er: Record<string, string> = {};
    if (!workId) er.workId = 'Elegí la obra.';
    if (!name.trim()) er.name = 'Ingresá un nombre.';
    if (origin === 'computation' && !selectedComputation)
      er.computationId = 'Elegí un cómputo de esta obra.';
    if (origin === 'template' && !templateId) er.templateId = 'Elegí una plantilla.';
    setErrs(er);
    if (Object.keys(er).length) return;
    const r = await save.run({
      workId,
      name: name.trim(),
      ...(origin === 'computation' ? { computationId } : { useReferenceCosts }),
      ...(origin === 'template' ? { templateId } : {}),
      ...(origin === 'revision' && sourceVersionId ? { sourceVersionId } : {}),
    });
    if (r) {
      setCreated(true);
      toast.success('Presupuesto creado correctamente');
      router.push(`/presupuestos/editor/${r.data.id}`);
    }
  }
  const fe = { ...fieldErrors(save.error), ...errs };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Card title="Presupuesto" bodyClass="bd stack">
        <div className="formgrid">
          <SelectField
            entity="works" label="Obra"
            value={workId}
            placeholder="Elegir obra…"
            options={works.rows.map((w) => ({
              value: w.id,
              label: `${w.code} · ${w.name}`,
            }))}
            onChange={(e) => {
              if (e.target.value !== workId) setComputationId('');
              setWorkId(e.target.value);
            }}
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
        <SelectField
          label="Empezar desde"
          value={origin}
          onChange={(e) => {
            setOrigin(e.target.value as Origin);
            setErrs({});
          }}
          options={[
            { value: 'blank', label: 'Empezar en blanco' },
            { value: 'computation', label: 'Usar cómputo existente' },
            { value: 'template', label: 'Usar plantilla' },
            ...(sourceVersionId ? [{ value: 'revision', label: 'Copiar revisión anterior' }] : []),
          ]}
        />
        {origin === 'computation' && (
          <>
            <p className="small muted">
              Se copiarán las actividades y cantidades del cómputo seleccionado. Los cambios posteriores del cómputo no actualizarán automáticamente este presupuesto.
            </p>
            <SelectField
              label="Cómputo de origen"
              value={computationId}
              placeholder="Elegir cómputo…"
              disabled={!workId || computations.loading}
              options={computationOptions}
              onChange={(e) => {
                setComputationId(e.target.value);
                setErrs({});
              }}
              error={fe.computationId}
              hint={!workId ? 'Elegí la obra para ver sus cómputos.' : undefined}
            />
            {workId && !computations.loading && !computations.error && !computationOptions.length &&
              <p className="small muted">La obra todavía no tiene cómputos.</p>}
            {workId && <ErrorBox error={computations.error} onRetry={computations.reload} />}
            {computationId && (
              <>
                {computation.loading && <Loading label="Cargando actividades…" />}
                <ErrorBox error={computation.error} onRetry={computation.reload} />
                {detail?.id === computationId && detail.workId !== workId &&
                  <p className="note">El cómputo pertenece a otra obra.</p>}
                {selectedComputation && (
                  <p className="small muted">
                    {selectedComputation.name} · {selectedComputation.lines.length} {selectedComputation.lines.length === 1 ? 'actividad' : 'actividades'}
                  </p>
                )}
                <div>
                  <Button variant="sec" size="sm" onClick={() => {
                    setComputationId('');
                    setErrs({});
                  }}>
                    Quitar selección
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {origin === 'template' && (
          <SelectField
            label="Plantilla"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="Elegir plantilla…"
            options={(templates.data?.data ?? []).map((t) => ({
              value: t.id,
              label: t.name,
            }))}
            hint="La plantilla copia rubros y composiciones. Los cambios quedan sólo en este presupuesto."
            error={fe.templateId}
          />
        )}
        {origin !== 'computation' && <label className="row"><input type="checkbox" checked={useReferenceCosts} onChange={e=>setUseReferenceCosts(e.target.checked)}/>Usar costos de referencia disponibles, conservando ajustes manuales</label>}
        {(origin === 'blank' || origin === 'template') && base.data && (
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
                  setOrigin('template');
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
        {origin === 'template' && (
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
        <Button
          type="submit"
          size="lg"
          loading={save.pending}
          disabled={created || (origin === 'computation' && !!computationId && computation.loading)}
        >
          Crear presupuesto
        </Button>
      </div>
    </form>
  );
}
