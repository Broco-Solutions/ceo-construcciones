'use client';
import { unitSymbol } from '@/lib/units';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Search,
  Tags,
} from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  Confirm,
  DefList,
  Empty,
  ErrorBox,
  Loading,
  TextArea,
  TextField,
  useToast,
} from '@/components/ui';
import { api, fieldErrors, type Schemas } from '@/lib/api';
import { useMutation, useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { dateInputToIso, formatDate, formatQty } from '@/lib/format';
import {
  LookupGate,
  QtyInput,
  positiveQty,
  useLookups,
} from '@/components/compras/common';
import { usePlanned, type PlannedRow } from '@/components/compras/usePlanned';

const STEPS = ['Obra', 'Rubro', 'Materiales', 'Fecha', 'Confirmar'] as const;

function NuevoPedido() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const lk = useLookups();
  const [step, setStep] = useState(sp.get('workId') ? 1 : 0);
  const [workId, setWorkId] = useState(sp.get('workId') ?? '');
  const [categoryId, setCategoryId] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [requiredAt, setRequiredAt] = useState('');
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const planned = usePlanned(workId || null);
  const needs = useApi<{ data: Schemas['NetNeeds'] }>(
    workId ? '/net-needs' : null,
    { workId },
  );
  const [coverageHash, setCoverageHash] = useState<string>();

  const activeWorks = lk.works.rows.filter((w) => w.status === 'ACTIVE');
  const catMaterials = useMemo(() => {
    const plannedIds = planned.plannedIds(categoryId);
    const s = search.trim().toLowerCase();
    // Catálogo activo del rubro + materiales previstos del rubro (etiquetas incluidas en la versión, aunque falten en el catálogo).
    const fromCatalog = lk.materials.rows
      .filter(
        (m) =>
          m.active && (m.categoryId === categoryId || plannedIds.has(m.id)),
      )
      .map((m) => ({
        id: m.id,
        code: m.code,
        name: m.name,
        unit: lk.units.map.get(m.unitId)?.code ?? '',
      }));
    const known = new Set(fromCatalog.map((m) => m.id));
    const onlyPlanned = planned
      .plannedRows(categoryId)
      .filter((p) => !known.has(p.materialId))
      .map((p) => ({
        id: p.materialId,
        code: p.material.code,
        name: p.material.name,
        unit: unitSymbol(p.unit),
      }));
    return [...fromCatalog, ...onlyPlanned].filter(
      (m) =>
        !s ||
        m.name.toLowerCase().includes(s) ||
        m.code.toLowerCase().includes(s),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lk.materials.rows, categoryId, search, planned.data]);

  const entered = Object.entries(qty).filter(([, v]) => v.trim() !== '');
  const invalid = entered.filter(([, v]) => !positiveQty(v)).map(([k]) => k);
  const lines = entered
    .filter(([, v]) => positiveQty(v))
    .map(([materialId, v]) => ({ materialId, quantity: positiveQty(v)! }));

  const create = useMutation((key: string, body: Schemas['RequestInput']) =>
    api.post<{ data: Schemas['RequestDetail'] }>('/requests', body, {
      idempotencyKey: key,
    }),
  );
  const errs = fieldErrors(create.error);

  const submit = async () => {
    const r = await create.run({
      workId,
      categoryId,
      requiredAt: dateInputToIso(requiredAt)!,
      notes: notes.trim() || undefined,
      lines,
      ...(coverageHash ? { coverageHash } : {}),
    });
    if (r) {
      toast.success('Pedido enviado a Compras');
      router.push(`/pedidos/${r.data.id}`);
    }
  };

  const canNext = [
    !!workId,
    !!categoryId,
    lines.length > 0 && invalid.length === 0,
    !!requiredAt,
    true,
  ][step];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Page title="Nuevo pedido" crumb={<Link href="/pedidos">Pedidos</Link>}>
      <LookupGate lk={lk}>
        <nav className="cmp-steps" aria-label="Pasos">
          {STEPS.map((s, i) => (
            <span key={s} aria-current={i === step ? 'step' : undefined}>
              {i + 1}. {s}
            </span>
          ))}
        </nav>

        {step === 0 && (
          <Card title="¿Para qué obra?">
            {activeWorks.length === 0 ? (
              <Empty title="No tenés obras activas asignadas" />
            ) : (
              <div className="stack">
                {activeWorks.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    className="cmp-act"
                    aria-pressed={workId === w.id}
                    onClick={() => {
                      setWorkId(w.id);
                      setCoverageHash(undefined);
                      setStep(1);
                    }}
                  >
                    <Building2 size={22} aria-hidden />
                    <div>
                      <b>{w.name}</b>
                      <span>{w.code}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {step === 1 && (
          <Card title="¿Qué rubro?">
            <div className="stack">
              {lk.categories.rows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="cmp-act"
                  aria-pressed={categoryId === c.id}
                  onClick={() => {
                    if (c.id !== categoryId) setQty({});
                    setCategoryId(c.id);
                    setStep(2);
                  }}
                >
                  <Tags size={22} aria-hidden />
                  <div>
                    <b>{c.name}</b>
                    <span>{c.code}</span>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card title={`Materiales · ${lk.categoryName(categoryId)}`}>
            <div className="stack">
              {planned.loading ? (
                <Loading label="Buscando presupuesto de referencia…" />
              ) : planned.error ? (
                <div className="note small" data-testid="planned-error">
                  No se pudieron cargar los materiales previstos. Podés cargar
                  el pedido igual; lo previsto se ve en el detalle.
                </div>
              ) : planned.missing ? (
                <div className="note small" data-testid="planned-missing">
                  La obra no tiene presupuesto de referencia: no hay cantidades
                  previstas para comparar.
                </div>
              ) : planned.data ? (
                <PlannedSummary
                  rows={planned.plannedRows(categoryId)}
                  categoryName={lk.categoryName(categoryId)}
                />
              ) : null}
              {needs.data?.data.referenceVersionId && (
                <>
                  <Button
                    variant="sec"
                    onClick={() => {
                      const ids = new Set(catMaterials.map((m) => m.id));
                      setQty(
                        Object.fromEntries(
                          needs
                            .data!.data.rows.filter(
                              (r) =>
                                ids.has(r.materialId) &&
                                r.remaining !== null &&
                                Number(r.remaining) > 0,
                            )
                            .map((r) => [r.materialId, r.remaining!]),
                        ),
                      );
                      setCoverageHash(needs.data!.data.coverageHash);
                    }}
                  >
                    Usar faltantes sugeridos
                  </Button>
                  <p className="small muted">
                    La cobertura se calcula por obra y material, compartida
                    entre rubros. Stock general sin asignar se informa por
                    separado.
                  </p>
                </>
              )}
              <ErrorBox error={needs.error} onRetry={needs.reload} />
              {needs.data?.data.materialDemandIncomplete && (
                <p className="alert warn">
                  El presupuesto de referencia contiene suministros sin
                  composición de materiales verificada. Los faltantes mostrados
                  son orientativos; revisá esas partidas antes de completar el
                  abastecimiento.
                </p>
              )}
              <div className="small muted">
                Las cantidades son editables. Podés pedir más de lo previsto,
                con advertencia y trazabilidad.
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Search size={16} aria-hidden className="muted" />
                <input
                  className="input"
                  style={{ flex: 1, minHeight: 44 }}
                  placeholder="Buscar material…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Buscar material"
                />
              </div>
              {catMaterials.length === 0 ? (
                <Empty title="Sin materiales en este rubro" />
              ) : (
                <div>
                  {catMaterials.map((m) => {
                    const unit = m.unit;
                    const p = planned.plannedFor(m.id, categoryId)?.quantity;
                    const bad = invalid.includes(m.id);
                    const need = needs.data?.data.rows.find(
                      (r) => r.materialId === m.id,
                    );
                    return (
                      <div key={m.id} className="cmp-line">
                        <div className="nm">
                          <b>{m.name}</b>
                          <span>
                            {m.code} · unidad {unit}
                            {p ? ` · previsto ${formatQty(p, unit)}` : ''}
                          </span>
                          {need && (
                            <span>
                              Previsto {need.planned ?? 'sin referencia'} ·
                              cubierto {need.covered} (consumido {need.consumed}{' '}
                              + obra {need.workAvailable} + pendiente{' '}
                              {need.pendingCoverage}) · faltante{' '}
                              {need.remaining ?? 'sin referencia'} · stock
                              general{' '}
                              {need.generalAvailable ??
                                'con acceso restringido'}
                            </span>
                          )}
                          {need?.warnings.map((w) => (
                            <span className="err" key={w}>
                              {w}
                            </span>
                          ))}
                          {need?.remaining !== null &&
                            need?.remaining !== undefined &&
                            Number(qty[m.id] ?? 0) > Number(need.remaining) && (
                              <span className="small err">
                                La cantidad supera el faltante sugerido. Podés
                                continuar.
                              </span>
                            )}
                          {bad && (
                            <span
                              className="err"
                              style={{ color: 'var(--bad)', display: 'block' }}
                            >
                              Cantidad inválida
                            </span>
                          )}
                        </div>
                        <QtyInput
                          label={`Cantidad de ${m.name} (${unit})`}
                          value={qty[m.id] ?? ''}
                          invalid={bad}
                          onChange={(v) => setQty((q) => ({ ...q, [m.id]: v }))}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="small muted">
                {lines.length} materiales con cantidad.
              </div>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card title="¿Para cuándo lo necesitás?">
            <div className="stack">
              <TextField
                label="Fecha requerida"
                type="date"
                min={today}
                value={requiredAt}
                onChange={(e) => setRequiredAt(e.target.value)}
                style={{ minHeight: 48, fontSize: 16 }}
                error={errs.requiredAt}
              />
              <TextArea
                label="Observaciones (opcional)"
                value={notes}
                maxLength={4000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Acceso, horario de descarga, contacto en obra…"
              />
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card title="Revisá y confirmá">
            <div className="stack">
              <DefList
                items={[
                  ['Obra', lk.workName(workId)],
                  ['Rubro', lk.categoryName(categoryId)],
                  ['Requerido para', formatDate(dateInputToIso(requiredAt))],
                  ['Observaciones', notes || '—'],
                ]}
              />
              <div>
                {lines.map((l) => (
                  <div key={l.materialId} className="cmp-line">
                    <div className="nm">
                      <b>
                        {lk.material(l.materialId)?.name ??
                          planned.plannedFor(l.materialId, categoryId)?.material
                            .name ??
                          'Material'}
                      </b>
                      <span>
                        {lk.material(l.materialId)?.code ??
                          planned.plannedFor(l.materialId, categoryId)?.material
                            .code}
                      </span>
                    </div>
                    <b>
                      {formatQty(
                        l.quantity,
                        lk.unitOf(l.materialId) ||
                          unitSymbol(
                            planned.plannedFor(l.materialId, categoryId)?.unit,
                          ),
                      )}
                    </b>
                  </div>
                ))}
              </div>
              <ErrorBox error={create.error} />
            </div>
          </Card>
        )}

        <div className="cmp-bar">
          <Button
            variant="sec"
            size="lg"
            disabled={step === 0 || create.pending}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft /> Atrás
          </Button>
          {step < 4 ? (
            <Button
              size="lg"
              disabled={!canNext}
              onClick={() => setStep(step + 1)}
            >
              Siguiente <ArrowRight />
            </Button>
          ) : (
            <Button
              size="lg"
              variant="ok"
              loading={create.pending}
              onClick={() => setConfirm(true)}
            >
              <Check /> Enviar pedido
            </Button>
          )}
        </div>
        <Confirm
          open={confirm}
          title="Enviar pedido"
          confirmLabel="Enviar"
          tone="ok"
          pending={create.pending}
          error={create.error}
          onClose={() => setConfirm(false)}
          onConfirm={submit}
        >
          Se enviará a Compras un pedido de {lines.length} materiales para{' '}
          {lk.workName(workId)}.
        </Confirm>
      </LookupGate>
    </Page>
  );
}

/** Materiales previstos del rubro por el presupuesto de referencia (sin economía), visibles antes de crear el pedido. */
function PlannedSummary({
  rows,
  categoryName,
}: {
  rows: PlannedRow[];
  categoryName: string;
}) {
  if (!rows.length)
    return (
      <div className="note small" data-testid="planned-empty">
        El presupuesto de referencia no prevé materiales para {categoryName}.
      </div>
    );
  return (
    <div className="note small" data-testid="planned-summary">
      <b>Previsto en el presupuesto de referencia · {categoryName}</b>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {rows.map((r) => (
          <li key={`${r.categoryId}-${r.materialId}`}>
            {r.material.code} · {r.material.name}:{' '}
            <b>{formatQty(r.quantity, unitSymbol(r.unit))}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function NuevoPedidoPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('createRequest')}>
      <Suspense fallback={<Loading />}>
        <NuevoPedido />
      </Suspense>
    </RequirePerm>
  );
}
