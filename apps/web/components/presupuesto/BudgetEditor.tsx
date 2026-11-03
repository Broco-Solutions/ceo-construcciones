'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Download, Eye } from 'lucide-react';
import { Page } from '@/components/shell';
import {
  Button,
  Card,
  TextField,
  TextArea,
  SelectField,
  ErrorBox,
  Loading,
  Modal,
  Pill,
  useToast,
} from '@/components/ui';
import { api, type Schemas } from '@/lib/api';
import { useAll, useApi, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatMoney } from '@/lib/format';
import { unitSymbol } from '@/lib/units';
import { PriceComparison } from '@/components/catalogo/PriceComparison';
import { ReferenceButton } from './ReferenceButton';

type Content = Schemas['EditorContent'];
type Line = Content['lines'][number];
export function BudgetEditor({ id }: { id: string }) {
  const query = useApi<{ data: Schemas['BudgetEditor'] }>(
      `/budget-editor/${id}`,
    ),
    { can } = useSession(),
    toast = useToast();
  const [content, setContent] = useState<Content | null>(null),
    [revision, setRevision] = useState(0),
    [saved, setSaved] = useState(''),
    [step, setStep] = useState(0),
    [calculation, setCalculation] =
      useState<Schemas['CommercialCalculation']>(),
    [calcError, setCalcError] = useState<unknown>(),
    [context, setContext] = useState<string | null>(null),
    [pick, setPick] = useState(false),
    [search, setSearch] = useState(''),
    [preview, setPreview] = useState<string | null>(null);
  const initialized = useRef(false),
    sequence = useRef(0),
    previewRef = useRef<string | null>(null);
  const [expression, setExpression] = useState(''),
    [expressionError, setExpressionError] = useState<unknown>(),
    [priceChanges, setPriceChanges] = useState<Schemas['DraftPriceChanges']>(),
    [acceptedPrices, setAcceptedPrices] = useState<string[]>([]),
    [comparisonMaterial, setComparisonMaterial] = useState<string | null>(null);
  const activities = useAll<Schemas['ApuDetail']>(
    can('editBudget') ? '/apu-items' : null,
  );
  const categories = useAll<Schemas['Category']>(
      can('editBudget') ? '/categories' : null,
    ),
    units = useAll<Schemas['Unit']>(can('editBudget') ? '/units' : null);
  const priceList = useAll<Schemas['MaterialPrice']>(
    can('editBudget') ? '/prices' : null,
  );
  const suppliers = useAll<Schemas['Supplier']>(
    can('editBudget') ? '/suppliers' : null,
    { active: true },
  );
  const dirty = content !== null && JSON.stringify(content) !== saved;
  useEffect(() => {
    if (query.data && !initialized.current) {
      initialized.current = true;
      const draft = query.data.data.draft;
      if (draft) {
        const c = draft.content;
        setContent(c);
        setRevision(draft.revision);
        setSaved(JSON.stringify(c));
      }
    }
  }, [query.data]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  useEffect(() => {
    if (!content) return;
    const current = ++sequence.current,
      ctrl = new AbortController();
    const timer = setTimeout(() => {
      api
        .post<{ data: Schemas['CommercialCalculation'] }>(
          `/budget-editor/${id}/calculate`,
          content,
          { signal: ctrl.signal },
        )
        .then((r) => {
          if (current === sequence.current) {
            setCalculation(r.data);
            setCalcError(null);
          }
        })
        .catch((e) => {
          if (!ctrl.signal.aborted && current === sequence.current)
            setCalcError(e);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [content, id, can]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const save = useMutation(async () => {
    if (!content) return;
    const r = await api.put<{ data: Schemas['BudgetDraft'] }>(
      `/budget-editor/${id}`,
      { revision, content },
    );
    return { draft: r.data, body: JSON.stringify(content) };
  });
  const issue = useMutation((key: string, rev: number) =>
    api.post<{ data: Schemas['IssuedVersion'] }>(
      `/budget-editor/${id}/issue`,
      { revision: rev },
      { idempotencyKey: key },
    ),
  );
  const template = useMutation(async () => {
    if (content)
      return api.post('/budget-templates', {
        name: query.data?.data.name ?? 'Plantilla',
        content,
      });
  });
  const updatePrices = useMutation(async () => {
    if (content)
      return api.post<{ data: Schemas['DraftPriceChanges'] }>(
        `/budget-editor/${id}/price-updates`,
        content,
      );
  });
  async function reviewPrices() {
    const r = await updatePrices.run();
    if (r) {
      setPriceChanges(r.data);
      setAcceptedPrices(
        r.data.changes
          .filter((c) => !c.manual)
          .map((c) => `${c.lineKey}:${c.materialId}`),
      );
    }
  }
  function acceptPrices() {
    if (!content || !priceChanges) return;
    set({
      lines: content.lines.map((l) => ({
        ...l,
        materials: l.materials.map((m) => {
          const c = priceChanges.changes.find(
            (c) =>
              c.lineKey === l.key &&
              c.materialId === m.materialId &&
              acceptedPrices.includes(`${l.key}:${m.materialId}`),
          );
          return c
            ? { ...m, unitPrice: c.next, sourcePriceId: c.sourcePriceId }
            : m;
        }),
      })),
    });
    setPriceChanges(undefined);
    toast.success(
      'Precios aplicados al borrador. Guardá para conservar los cambios.',
    );
  }
  const [previewBusy, setPreviewBusy] = useState(false);
  async function persist() {
    const r = await save.run();
    if (r) {
      setRevision(r.draft.revision);
      setSaved(r.body);
      toast.success('Borrador guardado');
      return r.draft.revision;
    }
  }
  async function emit() {
    const rev = dirty ? await persist() : revision;
    if (!rev) return;
    const r = await issue.run(rev);
    if (r) {
      toast.success(`Revisión R${r.data.number} emitida`, {
        description:
          r.data.status === 'REFERENCE'
            ? 'Esta revisión es la referencia para materiales de la obra.'
            : 'La referencia de materiales existente se conserva.',
      });
      query.reload();
      await download(r.data.id);
    }
  }
  async function download(versionId: string) {
    try {
      await api.download(
        `/budget-issues/${versionId}/pdf`,
        undefined,
        'presupuesto.pdf',
      );
    } catch (e) {
      toast.failure('No se pudo descargar el presupuesto', e);
    }
  }
  async function seePreview() {
    if (!content) return;
    setPreviewBusy(true);
    try {
      const url = await api.preview(`/budget-editor/${id}/preview`, content);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = url;
      setPreview(url);
    } catch (e) {
      toast.failure('No se pudo previsualizar', e);
    } finally {
      setPreviewBusy(false);
    }
  }
  const set = (patch: Partial<Content>) =>
    setContent((old) => (old ? { ...old, ...patch } : old));
  const setLine = (key: string, patch: Partial<Line>) =>
    setContent((old) =>
      old
        ? {
            ...old,
            lines: old.lines.map((l) =>
              l.key === key ? { ...l, ...patch } : l,
            ),
          }
        : old,
    );
  const input = (value: string) =>
    value.trim() === '' ? null : value.trim().replace(',', '.');
  function changeValuation(
    patch: Partial<Pick<Content, 'currency' | 'taxBasis'>>,
  ) {
    if (!content) return;
    set({
      ...patch,
      lines: content.lines.map((l) => ({
        ...l,
        laborUnitCost: null,
        directUnitCost: null,
        materials: l.materials.map((m) => ({
          ...m,
          unitPrice: null,
          sourcePriceId: null,
        })),
      })),
    });
    toast.warning('Revisá los costos en la nueva moneda y tratamiento de IVA', {
      description:
        'Se conservaron cantidades y composiciones. No se convirtieron importes ni se supuso una tasa.',
    });
  }
  function addActivity(a: Schemas['ApuDetail']) {
    if (!content) return;
    const line: Line = {
      key: crypto.randomUUID(),
      itemId: a.id,
      code: a.code,
      name: a.name,
      categoryId: a.categoryId,
      category: a.category.name,
      unitId: a.unitId,
      unit: unitSymbol(a.unit),
      quantity: null,
      laborUnitCost:
        a.laborCurrency === content.currency &&
        a.laborTaxBasis === content.taxBasis
          ? a.laborCost
          : null,
      directUnitCost:
        a.directCost == null
          ? '0'
          : a.laborCurrency === content.currency &&
              a.laborTaxBasis === content.taxBasis
            ? a.directCost
            : null,
      status: 'ACTIVE',
      materials: a.components.map((c) => {
        const p = priceList.rows
          .filter(
            (p) =>
              p.materialId === c.materialId &&
              p.currency === content.currency &&
              p.taxBasis === content.taxBasis &&
              Date.parse(p.effectiveAt) <= Date.now() &&
              p.baseQuantity === '1' &&
              (!p.supplierId ||
                suppliers.rows.some((s) => s.id === p.supplierId)),
          )
          .sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0];
        return {
          materialId: c.materialId,
          name: c.material.name,
          unitId: c.material.unitId,
          unit: unitSymbol(c.material.unit),
          coefficient: c.coefficient,
          unitPrice: p?.price ?? null,
          sourcePriceId: p?.id ?? null,
        };
      }),
    };
    set({ lines: [...content.lines, line] });
    setPick(false);
  }
  function addDirect() {
    const category =
        categories.rows.find((c) => c.name.toUpperCase() === 'VARIOS') ??
        categories.rows[0],
      unit = units.rows.find((u) => u.symbol === 'gl') ?? units.rows[0];
    if (!content || !category || !unit) {
      toast.failure(
        'No se pudo agregar el concepto',
        new Error('Se necesita al menos un rubro y una unidad.'),
      );
      return;
    }
    const line: Line = {
      key: crypto.randomUUID(),
      itemId: null,
      code: null,
      name: 'Nuevo concepto directo',
      categoryId: category.id,
      category: category.name,
      unitId: unit.id,
      unit: unitSymbol(unit),
      quantity: null,
      laborUnitCost: '0',
      directUnitCost: null,
      status: 'ACTIVE',
      materials: [],
    };
    set({ lines: [...content.lines, line] });
    setContext(line.key);
  }
  if (query.error)
    return (
      <Page title="Presupuesto">
        <ErrorBox error={query.error} onRetry={query.reload} />
      </Page>
    );
  if (!query.data)
    return (
      <Page title="Presupuesto">
        <Loading />
      </Page>
    );
  const budget = query.data.data,
    editable = can('editBudget'),
    latest = budget.versions.find((v) => v.issue),
    selected = content?.lines.find((l) => l.key === context);
  const grouped = new Map<string, Line[]>();
  for (const l of content?.lines ?? [])
    grouped.set(l.categoryId, [...(grouped.get(l.categoryId) ?? []), l]);
  return (
    <Page
      title={budget.name}
      crumb={<Link href="/presupuestos">Presupuestos</Link>}
      actions={
        <>
          {editable && (
            <Button variant="sec" onClick={persist} loading={save.pending}>
              <Save size={16} /> Guardar borrador
            </Button>
          )}
          {latest && (
            <Button variant="sec" onClick={() => download(latest.id)}>
              <Download size={16} /> Descargar revisión vigente
            </Button>
          )}
        </>
      }
    >
      <Card>
        <div
          className="row"
          style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <div>
            <b>{budget.work.client?.name ?? 'Cliente sin vincular'}</b>
            <div className="small muted">
              {budget.work.name} ·{' '}
              {latest ? `Revisión R${latest.number}` : 'Sin emitir'}
            </div>
          </div>
          <Pill tone={dirty ? 'warn' : 'ok'}>
            {save.pending
              ? 'Guardando…'
              : save.error
                ? 'No se pudo guardar'
                : dirty
                  ? 'Cambios sin guardar'
                  : 'Guardado'}
          </Pill>
        </div>
      </Card>
      {content?.materialDemandIncomplete && (
        <div className="alert warn">
          La composición de materiales requiere revisión. Podés completar el
          presupuesto comercial; las necesidades de compra se mostrarán como
          orientativas.{' '}
          <Button size="sm" variant="sec" onClick={() => setStep(3)}>
            Revisar materiales
          </Button>
        </div>
      )}
      {!content ? (
        <Card>
          <p>
            Versión de costos anterior. Podés conservarla y copiarla a un
            presupuesto nuevo.
          </p>
        </Card>
      ) : (
        <>
          <div
            className="row budget-tabs"
            role="tablist"
            aria-label="Secciones del presupuesto"
          >
            {[
              'Cómputo y costos',
              'Precio de venta',
              'Presentación y PDF',
              'Materiales previstos',
              'Historial',
            ].map((name, i) => (
              <Button
                key={name}
                variant={step === i ? 'primary' : 'sec'}
                role="tab"
                aria-selected={step === i}
                onClick={() => setStep(i)}
              >
                {name}
              </Button>
            ))}
          </div>
          {step === 0 && (
            <>
              <Card
                title="Cómputo y costos"
                actions={
                  editable && (
                    <div className="row">
                      <Button
                        size="sm"
                        variant="sec"
                        onClick={() => setPick(true)}
                      >
                        <Plus size={14} /> Agregar actividad
                      </Button>
                      <Button size="sm" variant="sec" onClick={addDirect}>
                        Agregar concepto directo
                      </Button>
                    </div>
                  )
                }
              >
                <TextField
                  label="Buscar partida"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {[...grouped].map(([cid, lines]) => (
                  <details key={cid} open className="budget-category">
                    <summary>
                      <b>{lines[0].category}</b>
                      <span>
                        {formatMoney(
                          calculation?.categories.find(
                            (c) => c.categoryId === cid,
                          )?.totalCost,
                          content.currency,
                        )}
                      </span>
                    </summary>
                    {lines
                      .filter((l) =>
                        l.name
                          .toLocaleLowerCase()
                          .includes(search.toLocaleLowerCase()),
                      )
                      .map((l) => {
                        const result = calculation?.lines.find(
                          (c) => c.sourceLineId === l.key,
                        );
                        return (
                          <div key={l.key} className="budget-line">
                            <div>
                              <button
                                className="budget-line-name"
                                onClick={() => setContext(l.key)}
                              >
                                {l.name}
                              </button>
                              <div className="small muted">
                                {l.unit} ·{' '}
                                {l.status === 'EXCLUDED'
                                  ? 'Excluida'
                                  : l.status === 'INCLUDED'
                                    ? 'Incluida en otra partida'
                                    : 'Composición del costo'}
                              </div>
                            </div>
                            <TextField
                              label="Cantidad"
                              aria-label={`Cantidad · ${l.name}`}
                              inputMode="decimal"
                              value={l.quantity ?? ''}
                              onChange={(e) =>
                                setLine(l.key, {
                                  quantity: input(e.target.value),
                                })
                              }
                              disabled={!editable || l.status !== 'ACTIVE'}
                            />
                            <div>
                              <span className="small muted">
                                Costo por unidad
                              </span>
                              <b>
                                {formatMoney(
                                  result?.totalUnitCost,
                                  content.currency,
                                )}
                              </b>
                            </div>
                            <div>
                              <span className="small muted">Subtotal</span>
                              <b>
                                {formatMoney(
                                  result?.totalCost,
                                  content.currency,
                                )}
                              </b>
                            </div>
                          </div>
                        );
                      })}
                  </details>
                ))}
                {!content.lines.length && (
                  <p className="note">
                    Agregá actividades de obra o un concepto directo para
                    empezar. También podés guardar esta estructura como
                    plantilla.
                  </p>
                )}
                {editable && (
                  <div className="row">
                    <Button
                      variant="sec"
                      onClick={async () => {
                        if (await template.run())
                          toast.success('Plantilla guardada');
                      }}
                      loading={template.pending}
                    >
                      Guardar como plantilla
                    </Button>
                    <Button
                      variant="sec"
                      onClick={reviewPrices}
                      loading={updatePrices.pending}
                    >
                      Actualizar precios · revisar diferencias
                    </Button>
                  </div>
                )}
                <ErrorBox error={template.error} />
                <ErrorBox error={updatePrices.error} />
              </Card>
            </>
          )}
          {step === 1 && (
            <Card title="Precio de venta">
              <TextField
                label="Rentabilidad (%)"
                hint="Recargo sobre el costo. Por ejemplo: 50 agrega el 50% al costo."
                inputMode="decimal"
                value={content.markup}
                onChange={(e) =>
                  set({ markup: e.target.value.replace(',', '.') })
                }
                disabled={!editable}
              />
              <p className="small muted">
                Los ajustes particulares se editan en la composición de cada
                partida y reemplazan el recargo general sobre su base.
              </p>
            </Card>
          )}
          {step === 2 && (
            <Card title="Presentación y PDF">
              <div className="formgrid">
                <SelectField
                  label="Moneda"
                  value={content.currency}
                  options={[
                    { value: 'ARS', label: 'ARS' },
                    { value: 'USD', label: 'USD' },
                  ]}
                  onChange={(e) =>
                    changeValuation({ currency: e.target.value })
                  }
                  disabled={!editable}
                />
                <SelectField
                  label="Tratamiento de IVA"
                  value={content.taxBasis}
                  options={[
                    {
                      value: 'EXCLUDED',
                      label: '+ IVA (sin calcular alícuota)',
                    },
                    { value: 'INCLUDED', label: 'IVA incluido' },
                    { value: 'UNSPECIFIED', label: 'No especificado' },
                  ]}
                  onChange={(e) =>
                    changeValuation({
                      taxBasis: e.target.value as Content['taxBasis'],
                    })
                  }
                  disabled={!editable}
                />
              </div>
              <TextField
                label="Plazo"
                value={content.deadline}
                onChange={(e) => set({ deadline: e.target.value })}
                disabled={!editable}
              />
              <TextArea
                label="Condiciones"
                value={content.conditions}
                onChange={(e) => set({ conditions: e.target.value })}
                disabled={!editable}
              />
              <TextArea
                label="Exclusiones"
                value={content.exclusions}
                onChange={(e) => set({ exclusions: e.target.value })}
                disabled={!editable}
              />
              <TextArea
                label="Observaciones comerciales"
                value={content.observations}
                onChange={(e) => set({ observations: e.target.value })}
                disabled={!editable}
              />
              <div className="row">
                {editable && (
                  <>
                    <Button
                      variant="sec"
                      onClick={seePreview}
                      loading={previewBusy}
                    >
                      <Eye size={16} /> Previsualizar
                    </Button>
                    <Button
                      onClick={emit}
                      loading={issue.pending}
                      disabled={!calculation?.complete}
                    >
                      Emitir y descargar
                    </Button>
                  </>
                )}
              </div>
            </Card>
          )}
          {step === 3 && (
            <Card title="Materiales previstos">
              {content.materialDemandIncomplete && (
                <p className="alert warn">
                  La fuente contiene suministros sin composición verificada.
                  Esta lista es parcial y sus faltantes son orientativos hasta
                  revisar los materiales de esas partidas.
                </p>
              )}
              {content.materialDemandIncomplete !== undefined && (
                <label className="row">
                  <input
                    type="checkbox"
                    checked={!content.materialDemandIncomplete}
                    disabled={!editable}
                    onChange={(e) =>
                      set({ materialDemandIncomplete: !e.target.checked })
                    }
                  />{' '}
                  Materiales revisados para abastecimiento
                </label>
              )}
              <p className="small muted">
                Los recargos comerciales no modifican estas cantidades.
              </p>
              {calculation?.materials.map((m) => (
                <div className="row" key={m.materialId}>
                  <b>{m.name}</b>
                  <span>
                    {m.quantity} {m.unit}
                  </span>
                </div>
              ))}
            </Card>
          )}
          {step === 4 && (
            <Card title="Historial">
              {budget.versions.map((v) => (
                <div className="row" key={v.id}>
                  <b>
                    {v.issue
                      ? `Revisión R${v.number}`
                      : `Versión de costos anterior V${v.number}`}
                  </b>
                  {v.issue ? (
                    <>
                      <span>
                        {formatMoney(v.issue.commercialTotal, v.currency)}
                      </span>
                      <Button
                        variant="sec"
                        size="sm"
                        onClick={() => download(v.id)}
                      >
                        Descargar
                      </Button>
                    </>
                  ) : (
                    <Link href={`/presupuestos/versiones/${v.id}`}>
                      Consultar costos
                    </Link>
                  )}
                  <Link href={`/presupuestos/nuevo?sourceVersionId=${v.id}`}>
                    Copiar a nuevo presupuesto
                  </Link>
                  {v.status === 'REFERENCE' ? (
                    <Pill tone="ok">Referencia para materiales</Pill>
                  ) : (
                    <ReferenceButton version={v} onDone={query.reload} />
                  )}
                </div>
              ))}
            </Card>
          )}
          <Card>
            <div className="budget-summary" aria-live="polite">
              <div>
                <span>Costo total (incluye VARIOS)</span>
                <b>{formatMoney(calculation?.totalCost, content.currency)}</b>
              </div>
              <div>
                <span>Rentabilidad · recargo sobre el costo</span>
                <b>{content.markup}%</b>
              </div>
              <div>
                <span>Precio de venta</span>
                <b>
                  {formatMoney(calculation?.commercialTotal, content.currency)}
                </b>
              </div>
            </div>
            {calculation?.issues.map((i) => (
              <p key={i.lineKey} className="small err">
                {i.message}
              </p>
            ))}
          </Card>
        </>
      )}
      <ErrorBox error={calcError} />
      <ErrorBox error={save.error} />
      <ErrorBox error={issue.error} />
      <Modal
        open={pick}
        onClose={() => setPick(false)}
        title="Agregar actividad de obra"
        wide
      >
        <div className="stack">
          {activities.rows
            .filter((a) => a.active)
            .map((a) => (
              <Button key={a.id} variant="sec" onClick={() => addActivity(a)}>
                {a.category.name} · {a.name} ({unitSymbol(a.unit)})
              </Button>
            ))}
          <ErrorBox error={activities.error} />
        </div>
      </Modal>
      <Modal
        open={!!selected}
        onClose={() => setContext(null)}
        title="Composición del costo"
        wide
      >
        {selected && (
          <div className="stack">
            <TextField
              label="Actividad / concepto"
              value={selected.name}
              onChange={(e) => setLine(selected.key, { name: e.target.value })}
              disabled={!editable}
            />
            <div className="formgrid">
              <SelectField
                label="Rubro"
                value={selected.categoryId}
                options={categories.rows.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                onChange={(e) => {
                  const c = categories.rows.find(
                    (c) => c.id === e.target.value,
                  );
                  if (c)
                    setLine(selected.key, {
                      categoryId: c.id,
                      category: c.name,
                    });
                }}
                disabled={!editable}
              />
              <SelectField
                label="Unidad"
                value={selected.unitId}
                options={units.rows.map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
                onChange={(e) => {
                  const u = units.rows.find((u) => u.id === e.target.value);
                  if (u)
                    setLine(selected.key, {
                      unitId: u.id,
                      unit: unitSymbol(u),
                    });
                }}
                disabled={!editable}
              />
            </div>
            <SelectField
              label="Participación"
              value={selected.status}
              options={[
                { value: 'ACTIVE', label: 'Con costo independiente' },
                { value: 'INCLUDED', label: 'Incluida en otra partida' },
                { value: 'EXCLUDED', label: 'Excluida' },
              ]}
              onChange={(e) =>
                setLine(selected.key, {
                  status: e.target.value as Line['status'],
                })
              }
              disabled={!editable}
            />
            <div className="formgrid">
              <TextField
                label="Mano de obra por unidad"
                value={selected.laborUnitCost ?? ''}
                inputMode="decimal"
                onChange={(e) =>
                  setLine(selected.key, {
                    laborUnitCost: input(e.target.value),
                  })
                }
                disabled={!editable}
              />
              <TextField
                label="Otros costos directos por unidad"
                value={selected.directUnitCost ?? ''}
                inputMode="decimal"
                onChange={(e) =>
                  setLine(selected.key, {
                    directUnitCost: input(e.target.value),
                  })
                }
                disabled={!editable}
              />
            </div>
            {editable && (
              <details>
                <summary>Ayuda para calcular cantidad</summary>
                <TextField
                  label="Operación aritmética"
                  hint="Por ejemplo: (4 + 2) * 3."
                  value={expression}
                  onChange={(e) => {
                    setExpression(e.target.value);
                    setExpressionError(undefined);
                  }}
                />
                <Button
                  variant="sec"
                  onClick={async () => {
                    try {
                      const r = await api.post<{ data: { quantity: string } }>(
                        '/quantity-expression',
                        { expression },
                      );
                      setLine(selected.key, { quantity: r.data.quantity });
                      setExpression('');
                    } catch (e) {
                      setExpressionError(e);
                    }
                  }}
                >
                  Usar resultado como cantidad
                </Button>
                <ErrorBox error={expressionError} />
              </details>
            )}
            {selected.materials.map((m, i) => (
              <div className="stack" key={m.materialId}>
                <div className="formgrid">
                  <TextField
                    label={`${m.name} · consumo por unidad (${m.unit})`}
                    value={m.coefficient}
                    onChange={(e) =>
                      setLine(selected.key, {
                        materials: selected.materials.map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                coefficient: e.target.value.replace(',', '.'),
                              }
                            : x,
                        ),
                      })
                    }
                    disabled={!editable}
                  />
                  <TextField
                    label={`${m.name} · precio por ${m.unit}`}
                    value={m.unitPrice ?? ''}
                    onChange={(e) =>
                      setLine(selected.key, {
                        materials: selected.materials.map((x, n) =>
                          n === i
                            ? {
                                ...x,
                                unitPrice: input(e.target.value),
                                sourcePriceId: null,
                              }
                            : x,
                        ),
                      })
                    }
                    disabled={!editable}
                  />
                </div>
                {editable && (
                  <Button
                    size="sm"
                    variant="sec"
                    onClick={() => setComparisonMaterial(m.materialId)}
                  >
                    Comparar corralones · {m.name}
                  </Button>
                )}
              </div>
            ))}
            <details>
              <summary>Ajustes particulares</summary>
              <TextField
                label="Recargo de esta partida (%)"
                hint="Reemplaza los recargos de esta partida. Vacío conserva el general o excepciones por componente."
                value={selected.markup ?? ''}
                onChange={(e) =>
                  setLine(selected.key, {
                    markup: input(e.target.value) ?? undefined,
                    materialMarkup: undefined,
                    laborMarkup: undefined,
                    directMarkup: undefined,
                  })
                }
                disabled={!editable}
              />
              {selected.markup === undefined && (
                <div className="formgrid">
                  {(
                    [
                      ['materialMarkup', 'Recargo de materiales (%)'],
                      ['laborMarkup', 'Recargo de mano de obra (%)'],
                      ['directMarkup', 'Recargo de otros directos (%)'],
                    ] as const
                  ).map(([field, label]) => (
                    <TextField
                      key={field}
                      label={label}
                      hint="Vacío usa el general."
                      value={selected[field] ?? ''}
                      onChange={(e) =>
                        setLine(selected.key, {
                          [field]: input(e.target.value) ?? undefined,
                        })
                      }
                      disabled={!editable}
                    />
                  ))}
                </div>
              )}
            </details>
            <p className="note small">
              Ajuste para este presupuesto. El catálogo y las revisiones
              emitidas se conservan.
            </p>
            <Button onClick={() => setContext(null)}>Listo</Button>
          </div>
        )}
      </Modal>
      <Modal
        open={!!priceChanges}
        onClose={() => setPriceChanges(undefined)}
        title="Revisar actualización de precios"
        wide
      >
        <div className="stack">
          {priceChanges?.changes.length === 0 && (
            <p>No hay nuevas referencias comparables vigentes.</p>
          )}
          {priceChanges?.changes.map((c) => {
            const key = `${c.lineKey}:${c.materialId}`;
            return (
              <label className="row" key={key}>
                <input
                  type="checkbox"
                  checked={acceptedPrices.includes(key)}
                  onChange={(e) =>
                    setAcceptedPrices((old) =>
                      e.target.checked
                        ? [...old, key]
                        : old.filter((x) => x !== key),
                    )
                  }
                />
                <span>
                  {c.name}: {c.previous ?? 'Sin precio'} → {c.next} ·{' '}
                  {c.effectiveAt.slice(0, 10)}
                  {c.manual
                    ? ' · Ajuste manual: conservar salvo selección expresa'
                    : ''}
                </span>
              </label>
            );
          })}
          <Button onClick={acceptPrices}>Aplicar selección al borrador</Button>
        </div>
      </Modal>
      <Modal
        open={!!comparisonMaterial}
        onClose={() => setComparisonMaterial(null)}
        title="Comparar corralones"
        wide
      >
        {comparisonMaterial && selected && (
          <PriceComparison
            materialId={comparisonMaterial}
            onSelect={(price, normalized) => {
              if (
                price.currency !== content?.currency ||
                price.taxBasis !== content?.taxBasis
              ) {
                toast.failure(
                  'Precio no comparable',
                  new Error(
                    'La moneda y el IVA deben coincidir con el presupuesto.',
                  ),
                );
                return;
              }
              setLine(selected.key, {
                materials: selected.materials.map((m) =>
                  m.materialId === comparisonMaterial
                    ? { ...m, unitPrice: normalized, sourcePriceId: price.id }
                    : m,
                ),
              });
              setComparisonMaterial(null);
            }}
          />
        )}
      </Modal>
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Vista previa comercial"
        wide
      >
        {preview && (
          <iframe
            src={preview}
            title="PDF comercial del presupuesto"
            style={{ width: '100%', height: '65vh', border: 0 }}
          />
        )}
      </Modal>
    </Page>
  );
}
