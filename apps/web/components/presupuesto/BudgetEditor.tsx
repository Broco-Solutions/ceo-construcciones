'use client';
import { ActivityMultiPicker } from './ActivityMultiPicker';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Plus, Save, Download, Eye, Pencil, Trash2 } from 'lucide-react';
import { Page } from '@/components/shell';
import {
  Button,
  Card,
  Confirm,
  DefList,
  TextField,
  TextArea,
  SelectField,
  ErrorBox,
  Loading,
  Modal,
  Pill,
  useToast,
} from '@/components/ui';
import { api, ApiError, type Schemas } from '@/lib/api';
import { useAll, useApi, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatMoney, formatQty, formatReferenceDate } from '@/lib/format';
import { unitSymbol } from '@/lib/units';
import { PriceComparison } from '@/components/catalogo/PriceComparison';
import { useNavigationBlocker } from '@/lib/navigation';
import {
  MaterialPicker,
  type PickedMaterial,
} from '@/components/catalogo/MaterialPicker';
import { ReferenceButton } from './ReferenceButton';

type Content = Schemas['EditorContent'];
type Line = Content['lines'][number];
type Calculation = Schemas['CommercialCalculation'];
type CalculationIssue = Calculation['issues'][number];

function incompleteIssues(error: unknown): CalculationIssue[] | undefined {
  if (!(error instanceof ApiError) || error.code !== 'INCOMPLETE_BUDGET') return;
  return Array.isArray(error.details)
    ? error.details.filter(
        (issue) => typeof issue?.lineKey === 'string' && typeof issue?.message === 'string',
      )
    : [];
}

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
    [calculated, setCalculated] = useState<{ content: Content; result: Calculation }>(),
    [calcError, setCalcError] = useState<unknown>(),
    [context, setContext] = useState<string | null>(null),
    [pick, setPick] = useState(false),
    [search, setSearch] = useState(''),
    [preview, setPreview] = useState<string | null>(null);
  const [removalKey, setRemovalKey] = useState<string | null>(null);
  const [quantityTarget, setQuantityTarget] = useState<string | null>(null);
  const [pdfRejection, setPdfRejection] = useState<{ content: Content; issues: CalculationIssue[] }>();
  const pdfIssuesRef = useRef<HTMLDivElement>(null);
  const calculation = calculated?.result;
  const currentCalculation = calculated?.content === content ? calculation : undefined;
  const rejectedIssues = pdfRejection?.content === content ? pdfRejection.issues : undefined;
  const contentRef = useRef(content),
    savedRef = useRef(saved),
    revisionRef = useRef(revision);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const addingActivity = useRef(false);
  contentRef.current = content;
  savedRef.current = saved;
  revisionRef.current = revision;
  const comparisonTrigger = useRef<HTMLElement | null>(null);
  const [materialPicker, setMaterialPicker] = useState<string | null>(null);
  const [materialError, setMaterialError] = useState('');
  const [valuation, setValuation] = useState<{
    previous: Content;
    patch: Partial<Pick<Content, 'currency' | 'taxBasis'>>;
    reviewing: boolean;
  } | null>(null);
  const initialized = useRef(false),
    sequence = useRef(0),
    costReviewSequence = useRef(0),
    previewRef = useRef<string | null>(null);
  const [expression, setExpression] = useState(''),
    [expressionError, setExpressionError] = useState<unknown>(),
    [priceChanges, setPriceChanges] = useState<Schemas['ReferenceCostReview']>(),
    [acceptedPrices, setAcceptedPrices] = useState<string[]>([]),
    [comparisonMaterial, setComparisonMaterial] = useState<string | null>(null);
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
    if (window.innerWidth > 820) return;
    tabListRef.current
      ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      ?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [step]);
  useEffect(() => {
    if (step !== 0 || !quantityTarget) return;
    const quantity = document.querySelector<HTMLInputElement>(
      `[data-budget-line="${CSS.escape(quantityTarget)}"] input`,
    );
    const category = quantity?.closest('details');
    if (category) category.open = true;
    quantity?.focus();
    setQuantityTarget(null);
  }, [step, quantityTarget]);
  useEffect(() => {
    setMaterialPicker(null);
    setMaterialError('');
    setExpression('');
    setExpressionError(undefined);
  }, [context]);
  useEffect(() => {
    if (comparisonMaterial)
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('[role="dialog"] button:not(.x)')
          ?.focus(),
      );
  }, [comparisonMaterial]);
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
            setCalculated({ content, result: r.data });
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
      costReviewSequence.current++;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const save = useMutation(async (_key: string, body: Content, rev: number) => {
    const r = await api.put<{ data: Schemas['BudgetDraft'] }>(
      `/budget-editor/${id}`,
      { revision: rev, content: body },
    );
    return { draft: r.data, body: JSON.stringify(body) };
  });
  const issue = useMutation(async (key: string, rev: number, submitted: Content) => {
    try {
      return await api.post<{ data: Schemas['IssuedVersion'] }>(
        `/budget-editor/${id}/issue`,
        { revision: rev },
        { idempotencyKey: key },
      );
    } catch (error) {
      showPdfRejection(error, submitted);
      throw error;
    }
  });
  const updatePrices = useMutation(async () => {
    if (content)
      return api.post<{ data: Schemas['ReferenceCostReview'] }>(
        `/budget-editor/${id}/cost-review`,
        { revision, content },
      );
  });
  async function reviewPrices() {
    const requestSequence = ++costReviewSequence.current;
    previewCostSelection.reset();
    applyCosts.reset();
    const r = await updatePrices.run();
    if (r && requestSequence === costReviewSequence.current) {
      setPriceChanges(r.data);
      setAcceptedPrices(
        r.data.changes
          .filter((c) => !c.manual)
          .map((c) => c.key),
      );
    }
  }
  const previewCostSelection = useMutation((_key: string, selected: string[]) =>
    api.post<{ data: Schemas['ReferenceCostReview'] }>(`/budget-editor/${id}/cost-review`, { revision, content, selected }));
  async function changeCostSelection(selected: string[]) {
    if (!priceChanges) return;
    const requestSequence = ++costReviewSequence.current;
    setAcceptedPrices(selected);
    const result = await previewCostSelection.run(selected);
    if (!result || requestSequence !== costReviewSequence.current) return;
    if (result.data.planHash !== priceChanges.planHash) {
      setPriceChanges(undefined);
      toast.warning('Las referencias cambiaron. Volvé a revisar las diferencias antes de aplicarlas.');
      return;
    }
    setPriceChanges(result.data);
  }
  const applyCosts = useMutation((_key: string, body: Schemas['CostApplyInput']) => api.post<{ data: Schemas['BudgetDraft'] }>(`/budget-editor/${id}/apply-cost-review`, body));
  async function acceptPrices() {
    if (!content || !priceChanges) return;
    const reviewed = JSON.stringify(content);
    const result = await applyCosts.run({ revision: priceChanges.revision, content, planHash: priceChanges.planHash, selected: acceptedPrices });
    if (!result) return;
    const next = result.data.content;
    setRevision(result.data.revision);
    setSaved(JSON.stringify(next));
    if (JSON.stringify(contentRef.current) === reviewed) setContent(next);
    setPriceChanges(undefined);
    toast.success('Costos de referencia aplicados al borrador. Las revisiones emitidas se conservan.');
  }
  const [previewBusy, setPreviewBusy] = useState(false);
  async function persist(body = contentRef.current) {
    if (!body) return;
    if (valuation?.reviewing) {
      toast.warning(
        'Confirmá la revisión de costos o restaurá el borrador previo antes de guardar.',
      );
      return;
    }
    const r = await save.run(body, revisionRef.current);
    if (r) {
      revisionRef.current = r.draft.revision;
      savedRef.current = r.body;
      setRevision(r.draft.revision);
      setSaved(r.body);
      toast.success('Borrador guardado');
      return r.draft.revision;
    }
  }
  useNavigationBlocker({
    dirty,
    save: async () => {
      if ((await persist()) === undefined) return false;
      return JSON.stringify(contentRef.current) === savedRef.current;
    },
    onPrompt: () => {
      costReviewSequence.current++;
      setContext(null);
      setRemovalKey(null);
      setComparisonMaterial(null);
      setPick(false);
      setPriceChanges(undefined);
      setPreview(null);
    },
  });
  async function emit() {
    const rev = dirty ? await persist() : revision;
    const submitted = contentRef.current;
    if (!rev || !submitted || JSON.stringify(submitted) !== savedRef.current) return;
    const r = await issue.run(rev, submitted);
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
  function showPdfRejection(error: unknown, submitted: Content) {
    const issues = incompleteIssues(error);
    if (!issues) return false;
    if (contentRef.current === submitted) {
      setPdfRejection({ content: submitted, issues });
      requestAnimationFrame(() => pdfIssuesRef.current?.focus());
    }
    return true;
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
    if (currentCalculation?.complete === false || rejectedIssues) {
      pdfIssuesRef.current?.focus();
      return;
    }
    setPreviewBusy(true);
    try {
      const url = await api.preview(`/budget-editor/${id}/preview`, content);
      costReviewSequence.current++;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
      previewRef.current = url;
      setPreview(url);
    } catch (e) {
      if (!showPdfRejection(e, content)) {
        toast.failure('No se pudo previsualizar', e);
      }
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
    if (
      Object.entries(patch).every(
        ([k, v]) => content[k as 'currency' | 'taxBasis'] === v,
      )
    )
      return;
    setValuation({
      previous: structuredClone(content),
      patch,
      reviewing: false,
    });
  }
  function confirmValuation() {
    if (!valuation) return;
    set({
      ...valuation.patch,
      lines: valuation.previous.lines.map((l) => ({
        ...l,
        laborUnitCost: null,
        laborReferences: undefined,
        directUnitCost: null,
        materials: l.materials.map((m) => ({
          ...m,
          unitPrice: null,
          sourcePriceId: null,
          sourcePriceBasis: undefined,
          sourcePriceFactor: undefined,
        })),
      })),
    });
    setValuation({ ...valuation, reviewing: true });
  }
  function closeComparison() {
    const materialId = comparisonMaterial;
    setComparisonMaterial(null);
    requestAnimationFrame(() => {
      const trigger = materialId
        ? document.querySelector<HTMLElement>(
            `[data-compare-material="${CSS.escape(materialId)}"]`,
          )
        : comparisonTrigger.current;
      trigger?.focus();
    });
  }
  function chooseMaterial(m: PickedMaterial | null) {
    if (!m || !selected || !materialPicker) return;
    if (
      selected.materials.some(
        (x) => x.materialId === m.id && x.materialId !== materialPicker,
      )
    ) {
      setMaterialError(
        'Este material ya está en la composición. Modificá su consumo en el renglón existente.',
      );
      return;
    }
    const next: Line['materials'][number] = {
      materialId: m.id,
      name: m.name,
      unitId: m.unitId,
      unit: unitSymbol(m.unit),
      coefficient: null,
      unitPrice: null,
      sourcePriceId: null,
    };
    setLine(selected.key, {
      materials:
        materialPicker === 'new'
          ? [...selected.materials, next]
          : selected.materials.map((x) =>
              x.materialId === materialPicker ? next : x,
            ),
    });
    setMaterialPicker(null);
    setMaterialError('');
  }
  async function buildActivityLine(a: Schemas['ApuDetail'], current: NonNullable<typeof content>) {
    let reference: Schemas['ResolvedActivityCost'] | null = null;
    try { reference = (await api.get<{data:Schemas['ResolvedActivityCost']|null}>(`/activity-costing/${a.id}`)).data; }
    catch (error) { if ((error as {status?:number}).status !== 503) throw error; }
    const compatible=reference?.content.currency===current.currency && reference?.content.taxBasis===current.taxBasis;
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
        a.laborCurrency === current.currency &&
        a.laborTaxBasis === current.taxBasis
          ? a.laborCost
          : null,
      directUnitCost:
        a.directCost == null
          ? '0'
          : a.laborCurrency === current.currency &&
              a.laborTaxBasis === current.taxBasis
            ? a.directCost
            : null,
      status: 'ACTIVE',
      materials: a.components.map((c) => {
        const p = priceList.rows
          .filter(
            (p) =>
              p.materialId === c.materialId &&
              p.currency === current.currency &&
              p.taxBasis === current.taxBasis &&
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
    if (compatible && reference) {
      line.laborUnitCost=reference.laborCost;
      line.directUnitCost=reference.directCost;
      line.materialsIncludedInDirect=reference.content.materialsIncludedInDirect;
      line.materialReview=reference.content.materialReview;
      if(reference.content.laborMode==='CALCULATED' && reference.labor.every(r=>r.value!==null))line.laborReferences=reference.labor.map(r=>({...r,value:r.value!,source:r.source??''}));
      line.materials=line.materials.map(m=>{const selected=reference.materials.find(p=>p.materialId===m.materialId);return selected?.sourcePriceId?{...m,unitPrice:selected.unitPrice,sourcePriceId:selected.sourcePriceId,...(selected.sourcePriceBasis?{sourcePriceBasis:selected.sourcePriceBasis}:{}),...(selected.sourcePriceFactor?{sourcePriceFactor:selected.sourcePriceFactor}:{})}:m;});
    }
    return line;
  }
  async function addActivities(activities: Schemas['ApuDetail'][]) {
    if(addingActivity.current)return;
    addingActivity.current=true;
    try {
      const original=contentRef.current;
      if(!original)throw new Error('El borrador no está disponible.');
      const lines:Line[]=[];
      for(const activity of activities)lines.push(await buildActivityLine(activity,original));
      const latest=contentRef.current;
      if(!latest||latest.currency!==original.currency||latest.taxBasis!==original.taxBasis)throw new Error('La moneda o el IVA cambiaron mientras se consultaban las referencias. Revisá e incorporá de nuevo.');
      set({lines:[...latest.lines,...lines]});
      setPick(false);
    } finally {addingActivity.current=false;}
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
    reference = budget.versions.find((v) => v.status === 'REFERENCE'),
    selected = content?.lines.find((l) => l.key === context);

  const removal = content?.lines.find((line) => line.key === removalKey);
  const removalBlocked = save.pending || issue.pending || !!valuation?.reviewing;
  const removalCost = currentCalculation?.unitCosts?.find((cost) => cost.lineKey === removalKey);
  const removalSubtotal = currentCalculation?.lines.find((line) => line.sourceLineId === removalKey);
  function requestRemoval(key: string) {
    save.setError(null);
    setContext(null);
    setRemovalKey(key);
  }

  async function removeLine() {
    if (!editable || !removal || !contentRef.current || removalBlocked) return;
    const next = {
      ...contentRef.current,
      lines: contentRef.current.lines.filter((line) => line.key !== removal.key),
    };
    if ((await persist(next)) === undefined) return;
    setContent((latest) => latest && {
      ...latest,
      lines: latest.lines.filter((line) => line.key !== removal.key),
    });
    setRemovalKey(null);
  }

  const grouped = new Map<string, Line[]>();
  const linesByName = new Map<string, Line[]>();
  for (const l of content?.lines ?? []) {
    grouped.set(l.categoryId, [...(grouped.get(l.categoryId) ?? []), l]);
    linesByName.set(l.name, [...(linesByName.get(l.name) ?? []), l]);
  }
  function lineIdentifier(line: Line) {
    const matches = linesByName.get(line.name);
    if (!matches || matches.length < 2) return '';
    if (line.code && !matches.some((other) => other.key !== line.key && other.code === line.code))
      return line.code;
    const position = (grouped.get(line.categoryId) ?? []).indexOf(line) + 1;
    return [line.code, `Partida ${position} del rubro ${line.category}`].filter(Boolean).join(' · ');
  }

  const pdfBlocked = currentCalculation?.complete === false || !!rejectedIssues;
  const issuesByLine = new Map<string | null, string[]>();
  for (const issue of rejectedIssues ?? currentCalculation?.issues ?? []) {
    // El backend puede asociar el total comercial a la primera línea lista.
    const key = issue.message === 'El total comercial excede la precisión admitida. Revisá las cantidades y los costos.'
      ? null
      : (content?.lines.some((line) => line.key === issue.lineKey) ? issue.lineKey : null);
    const messages = issuesByLine.get(key) ?? [];
    messages.push(issue.message);
    issuesByLine.set(key, messages);
  }

  function goToCorrection(line?: Line) {
    setStep(0);
    if (!line) {
      setSearch('');
      return;
    }
    if (!line.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) setSearch('');
    const unitCost = currentCalculation?.unitCosts?.find((cost) => cost.lineKey === line.key);
    if (unitCost?.quantityPending ?? (line.quantity === null)) {
      setQuantityTarget(line.key);
    } else {
      setContext(line.key);
    }
  }
  return (
    <Page
      title={budget.name}
      crumb={<Link href="/presupuestos">Presupuestos</Link>}
      actions={
        <>
          {editable && (
            <Button variant="sec" onClick={() => persist()} loading={save.pending}>
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
      {content && (
        <Card title="Moneda y tratamiento de IVA">
          {' '}
          <div className="formgrid">
            <SelectField
              label="Moneda"
              value={content.currency}
              options={[
                { value: 'ARS', label: 'ARS' },
                { value: 'USD', label: 'USD' },
              ]}
              onChange={(e) => changeValuation({ currency: e.target.value })}
              disabled={!editable || !!valuation}
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
              disabled={!editable || !!valuation}
            />
          </div>
          <p className="small muted">
            Los importes corresponden a esta valoración. No se realizan
            conversiones automáticas.
          </p>
          {valuation?.reviewing && (
            <div className="alert warn stack">
              <b>Revisión de costos en curso</b>
              <p>
                Los importes anteriores se conservaron temporalmente para volver
                atrás. Completá y revisá los valores en la nueva moneda/IVA
                antes de confirmar.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Button
                  variant="sec"
                  onClick={() => {
                    setContent(valuation.previous);
                    setValuation(null);
                  }}
                >
                  Restaurar borrador previo al cambio
                </Button>
                <Button onClick={() => setValuation(null)}>
                  Confirmar revisión de costos
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
      {(calculation?.materialDemandIncomplete ??
        content?.materialDemandIncomplete) && (
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
            ref={tabListRef}
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
                <p className="small muted">
                  Este presupuesto tiene sus propias cantidades. Si se creó desde un cómputo, los cambios posteriores en cualquiera de los dos quedan en su documento.
                </p>
                <TextField
                  label="Buscar partida"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {[...grouped].map(([cid, lines]) => (
                  <details key={cid} open className="budget-category">
                    <summary>
                      <b><ChevronRight size={18} aria-hidden="true" />{lines[0].category}</b>
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
                        const identifier = lineIdentifier(l);
                        const result = calculation?.lines.find(
                          (c) => c.sourceLineId === l.key,
                        );
                        const unitCost = calculation?.unitCosts?.find(
                          (c) => c.lineKey === l.key,
                        );
                        const missingCosts = unitCost?.missingCosts ?? [];
                        const hasIssue = calculation?.issues.some(
                          (i) => i.lineKey === l.key,
                        );
                        return (
                          <div key={l.key} className="budget-line" data-budget-line={l.key}>
                            <div>
                              <button
                                className="budget-line-name"
                                onClick={() => setContext(l.key)}
                              >
                                {l.name}
                              </button>
                              {identifier && <div className="small muted">{identifier}</div>}
                              <div className="small muted">
                                {l.unit} ·{' '}
                                {l.status === 'EXCLUDED'
                                  ? 'Excluida'
                                  : l.status === 'INCLUDED'
                                    ? 'Incluida en otra partida'
                                    : 'Composición del costo'}
                              </div>
                              {editable && (
                                <div className="row budget-line-actions">
                                  <Button variant="sec" size="sm" onClick={() => setContext(l.key)}>
                                    <Pencil size={14} aria-hidden="true" /> Editar partida
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={removalBlocked}
                                    onClick={() => requestRemoval(l.key)}
                                  >
                                    <Trash2 size={14} aria-hidden="true" /> Quitar
                                  </Button>
                                </div>
                              )}
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
                                {missingCosts.length > 0
                                  ? 'Costo pendiente'
                                  : formatMoney(
                                      unitCost?.totalUnitCost ??
                                        result?.totalUnitCost,
                                      content.currency,
                                    )}
                              </b>
                            </div>
                            <div>
                              <span className="small muted">Subtotal</span>
                              <b>
                                {hasIssue
                                  ? 'Costo pendiente'
                                  : formatMoney(
                                      unitCost?.zeroQuantity
                                        ? '0'
                                        : result?.totalCost,
                                      content.currency,
                                    )}
                              </b>
                              {unitCost?.quantityPending && l.status === 'ACTIVE' && (
                                <span className="small muted">
                                  Cantidad pendiente
                                </span>
                              )}
                              {missingCosts.length > 0 && (
                                <div className="small err">
                                  Falta informar {missingCosts.join(' · ')}.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </details>
                ))}
                {!content.lines.length && (
                  <p className="note">
                    Agregá actividades de obra o un concepto directo para empezar.
                  </p>
                )}
                {editable && (
                  <div className="row">
                    <Button
                      variant="sec"
                      onClick={reviewPrices}
                      loading={updatePrices.pending}
                    >
                      Revisar costos de referencia
                    </Button>
                  </div>
                )}
                <ErrorBox error={updatePrices.error} />
              </Card>
            </>
          )}
          {step === 1 && (
            <Card title="Precio de venta">
              <TextField
                label="Rentabilidad (%)"
                hint="La rentabilidad es un recargo sobre el costo. Por ejemplo, con un costo de $100.000 y un recargo del 50 %, el precio de venta es $150.000."
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
              <p className="small muted">
                Podés previsualizar el PDF, emitir la primera revisión (R1) y
                descargarla. Si editás el borrador y volvés a emitir, se genera
                R2 y queda disponible la R1.
              </p>
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
              <div className="row" style={{ flexWrap: 'wrap' }}>
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
                      disabled={!currentCalculation?.complete || pdfBlocked || save.pending}
                    >
                      Emitir y descargar
                    </Button>
                  </>
                )}
              </div>
              {pdfBlocked && (
                <div
                  className="alert warn stack"
                  ref={pdfIssuesRef}
                  tabIndex={-1}
                  role="region"
                  aria-label="Todavía no se puede generar el PDF"
                >
                  <b>Todavía no se puede generar el PDF</b>
                  {issuesByLine.size === 0 ? (
                    <p>
                      {content.lines.length
                        ? 'Completá al menos una partida activa con cantidad mayor a cero y costos completos para generar el PDF.'
                        : 'Agregá al menos una actividad con cantidad y costos completos para generar el PDF.'}
                    </p>
                  ) : (
                    <>
                      <p>Hay datos pendientes en el presupuesto. Revisá las siguientes partidas.</p>
                      <ul className="stack">
                        {[...issuesByLine].map(([key, messages]) => {
                          const line = content.lines.find((item) => item.key === key);
                          const identifier = line && lineIdentifier(line);
                          const prefix = line ? `${line.name}: ` : '';
                          return (
                            <li key={key ?? ''}>
                              {line && <b>{line.name}{identifier && ` · ${identifier}`}</b>}
                              {messages.map((message, index) => (
                                <p key={index}>{prefix && message.startsWith(prefix) ? message.slice(prefix.length) : message}</p>
                              ))}
                              {editable && (
                                <Button variant="sec" size="sm" onClick={() => goToCorrection(line)}>
                                  Ir a corregir
                                </Button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </Card>
          )}
          {step === 3 && (
            <Card title="Materiales previstos">
              <p className="small muted">
                {budget.draft
                  ? 'Estas cantidades se calculan a partir del borrador que estás consultando.'
                  : 'Estas cantidades se calculan a partir del contenido que estás consultando.'}
                {reference && ` Para abastecimiento, la referencia de este presupuesto es ${reference.issue ? `R${reference.number}` : `V${reference.number}`}.`}
              </p>
              <Button variant="sec" size="sm" onClick={() => setStep(4)}>
                Ver historial de revisiones
              </Button>
              {(calculation?.materialDemandIncomplete ??
                content.materialDemandIncomplete) && (
                <p className="alert warn">
                  La fuente contiene suministros sin composición verificada.
                  Esta lista es parcial y sus faltantes son orientativos hasta
                  revisar los materiales de esas partidas.
                </p>
              )}
              {calculation?.materialReviewIssues?.map((issue) => (
                <div className="note stack" key={issue.lineKey}>
                  <b>{issue.name}</b>
                  <span>{issue.detail}</span>
                  {editable && (
                    <Button
                      variant="sec"
                      size="sm"
                      onClick={() => setContext(issue.lineKey)}
                    >
                      Revisar composición · {issue.name}
                    </Button>
                  )}
                </div>
              ))}
              <p className="small muted">
                La exactitud se determina por los faltantes y la evidencia de
                cada partida. Reconocer un aviso no completa su composición.
              </p>
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
            {step !== 2 && calculation?.issues.map((i, index) => (
              <p key={index} className="small err">
                {i.message}
              </p>
            ))}
          </Card>
        </>
      )}
      <ErrorBox error={calcError} />
      <ErrorBox error={removal ? null : save.error} />
      <ErrorBox error={incompleteIssues(issue.error) ? null : issue.error} />
      <Modal
        open={pick}
        onClose={() => setPick(false)}
        title="Agregar actividad de obra"
        wide
      >
        <div className="stack">
          <ActivityMultiPicker existingIds={content?.lines.flatMap(l=>l.itemId?[l.itemId]:[])??[]} onAdd={addActivities}/>
        </div>
      </Modal>
      <Modal
        open={!!selected}
        onClose={() =>
          comparisonMaterial ? closeComparison() : setContext(null)
        }
        title={
          comparisonMaterial ? 'Comparar corralones' : 'Composición del costo'
        }
        wide
      >
        {selected && comparisonMaterial ? (
          <div className="stack">
            <Button variant="sec" onClick={closeComparison}>
              Volver a la composición
            </Button>
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
                      ? { ...m, unitPrice: normalized, sourcePriceId: price.id, sourcePriceBasis: undefined, sourcePriceFactor: undefined }
                      : m,
                  ),
                });
                closeComparison();
              }}
            />
          </div>
        ) : (
          selected && (
            <div className="stack">
              <TextField
                label="Actividad / concepto"
                value={selected.name}
                onChange={(e) =>
                  setLine(selected.key, { name: e.target.value })
                }
                disabled={!editable}
              />
              <div className="formgrid">
                <SelectField
                  searchable label="Rubro"
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
                  searchable label="Unidad"
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
              {selected.laborReferences?.length ? <details className="note small"><summary>Composición de mano de obra</summary>{selected.laborReferences.map(r=><p key={r.resourceId}>{r.name} · {formatQty(r.coefficient,r.unit)} × {formatMoney(r.value,content?.currency)} · {r.dateLabel??'Fecha desconocida'} · {r.source}</p>)}<p>Ingresar un importe manual retira estas referencias únicamente de este presupuesto.</p></details>:null}
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
                  label="Cantidad"
                  inputMode="decimal"
                  value={selected.quantity ?? ''}
                  onChange={(e) =>
                    setLine(selected.key, { quantity: input(e.target.value) })
                  }
                  disabled={!editable || selected.status !== 'ACTIVE'}
                />
                <TextField
                  label="Mano de obra por unidad"
                  value={selected.laborUnitCost ?? ''}
                  inputMode="decimal"
                  onChange={(e) =>
                    setLine(selected.key, {
                      laborUnitCost: input(e.target.value),
                      laborReferences: undefined,
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
              <p className="small muted">
                Si un costo es cero, ingresá 0. Un campo vacío indica un costo pendiente.
              </p>
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
                        const r = await api.post<{
                          data: { quantity: string };
                        }>('/quantity-expression', { expression });
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
              {editable && (
                <label className="row">
                  <input
                    type="checkbox"
                    checked={selected.materialsIncludedInDirect ?? false}
                    onChange={(e) =>
                      setLine(selected.key, {
                        materialsIncludedInDirect: e.target.checked,
                      })
                    }
                  />
                  Materiales valorizados dentro del agregado directo
                </label>
              )}
              {selected.materialsIncludedInDirect && (
                <p className="note">
                  El agregado directo contiene el costo de suministro. Estos
                  consumos generan cantidades físicas; sus precios de referencia
                  no se suman otra vez. Sustituí el agregado por la composición
                  cuando dispongas de precios completos.
                </p>
              )}
              {editable && (
                <>
                  <Button
                    variant="sec"
                    onClick={() => {
                      setMaterialPicker('new');
                      setMaterialError('');
                    }}
                  >
                    Agregar material
                  </Button>
                  {materialPicker && (
                    <div className="note stack">
                      <MaterialPicker
                        value={null}
                        onChange={chooseMaterial}
                        label={
                          materialPicker === 'new'
                            ? 'Material a agregar'
                            : 'Material de reemplazo'
                        }
                      />
                      {materialError && <p className="err">{materialError}</p>}
                      <Button
                        variant="sec"
                        onClick={() => setMaterialPicker(null)}
                      >
                        Cancelar selección de material
                      </Button>
                    </div>
                  )}
                </>
              )}
              {selected.materials.map((m, i) => (
                <div className="stack" key={m.materialId}>
                  <div className="formgrid">
                    <TextField
                      label={`${m.name} · consumo por unidad (${m.unit})`}
                      value={m.coefficient ?? ''}
                      onChange={(e) =>
                        setLine(selected.key, {
                          materials: selected.materials.map((x, n) =>
                            n === i
                              ? {
                                  ...x,
                                  coefficient: input(e.target.value),
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
                                  sourcePriceBasis: undefined,
                                  sourcePriceFactor: undefined,
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
                      data-compare-material={m.materialId}
                      onClick={(e) => {
                        comparisonTrigger.current = e.currentTarget;
                        setComparisonMaterial(m.materialId);
                      }}
                    >
                      Comparar corralones · {m.name}
                    </Button>
                  )}
                  {editable && (
                    <div className="row">
                      <Button
                        size="sm"
                        variant="sec"
                        onClick={() => {
                          setMaterialPicker(m.materialId);
                          setMaterialError('');
                        }}
                      >
                        Reemplazar material · {m.name}
                      </Button>
                      <Button
                        size="sm"
                        variant="sec"
                        onClick={() =>
                          setLine(selected.key, {
                            materials: selected.materials.filter(
                              (x) => x.materialId !== m.materialId,
                            ),
                          })
                        }
                      >
                        Quitar material · {m.name}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {editable && (
                <details>
                  <summary>Evidencia de composición y costos directos</summary>
                  <p className="small muted">
                    Completá los materiales y consumos verificables. Un costo
                    directo legítimo no produce materiales. Identificá el
                    documento o cálculo que lo sustenta.
                  </p>
                  <TextArea
                    label="Detalle de revisión de materiales"
                    value={selected.materialReview?.detail ?? ''}
                    onChange={(e) =>
                      setLine(selected.key, {
                        materialReview: {
                          status:
                            selected.materialReview?.status ?? 'UNRESOLVED',
                          detail: e.target.value,
                          evidence: selected.materialReview?.evidence ?? '',
                        },
                      })
                    }
                  />
                  <TextField
                    label="Fuente o evidencia de composición"
                    value={selected.materialReview?.evidence ?? ''}
                    onChange={(e) =>
                      setLine(selected.key, {
                        materialReview: {
                          status:
                            selected.materialReview?.status ?? 'UNRESOLVED',
                          detail:
                            selected.materialReview?.detail ??
                            'Revisión de composición de esta partida',
                          evidence: e.target.value,
                        },
                      })
                    }
                  />
                  <SelectField
                    label="Estado de composición"
                    value={selected.materialReview?.status ?? 'UNRESOLVED'}
                    options={[
                      {
                        value: 'UNRESOLVED',
                        label: 'Faltantes o ambigüedades pendientes',
                      },
                      {
                        value: 'VERIFIED',
                        label: 'Composición física documentada',
                      },
                      { value: 'DIRECT', label: 'Costo directo documentado' },
                    ]}
                    onChange={(e) =>
                      setLine(selected.key, {
                        materialReview: {
                          status: e.target.value as NonNullable<
                            Line['materialReview']
                          >['status'],
                          detail:
                            selected.materialReview?.detail ??
                            'Revisión de composición de esta partida',
                          evidence: selected.materialReview?.evidence ?? '',
                        },
                      })
                    }
                  />
                  {selected.materialsIncludedInDirect &&
                    selected.directUnitCost !== null &&
                    selected.directUnitCost !== '0' &&
                    selected.materials.length > 0 && (
                      <Button
                        variant="sec"
                        disabled={
                          !selected.materialReview?.evidence ||
                          selected.materials.some(
                            (m) =>
                              m.coefficient === null ||
                              (Number(m.coefficient) !== 0 &&
                                m.unitPrice === null),
                          )
                        }
                        onClick={() =>
                          setLine(selected.key, {
                            directUnitCost: '0',
                            materialsIncludedInDirect: false,
                            materialReview: {
                              status: 'VERIFIED',
                              detail: `Se sustituyó el agregado directo de ${selected.directUnitCost} ${content?.currency} por la composición detallada; no se acumulan ambos costos. ${selected.materialReview?.detail ?? ''}`,
                              evidence: selected.materialReview!.evidence,
                            },
                          })
                        }
                      >
                        Sustituir agregado directo por esta composición
                      </Button>
                    )}
                </details>
              )}
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
              <div className="row">
                <Button onClick={() => setContext(null)}>Listo</Button>
                {editable && (
                  <Button
                    variant="danger"
                    disabled={removalBlocked}
                    onClick={() => requestRemoval(selected.key)}
                  >
                    Quitar del presupuesto
                  </Button>
                )}
              </div>
            </div>
          )
        )}
      </Modal>
      <Confirm
        open={editable && !!removal}
        title="Quitar partida del presupuesto"
        confirmLabel="Quitar partida"
        tone="danger"
        onClose={() => setRemovalKey(null)}
        onConfirm={removeLine}
        pending={save.pending}
        error={save.error}
      >
        {removal && (
          <div className="stack">
            <div>
              <b>{removal.name}</b>
              {(lineIdentifier(removal) || removal.code) && (
                <div className="small muted">{lineIdentifier(removal) || removal.code}</div>
              )}
              <div className="small muted">Rubro · {removal.category}</div>
            </div>
            <DefList items={[
              ['Cantidad', `${formatQty(removal.quantity)} ${removal.unit}`],
              ['Costo unitario', formatMoney(removalCost?.totalUnitCost ?? removalSubtotal?.totalUnitCost, content?.currency)],
              ['Subtotal', formatMoney(
                removalCost?.zeroQuantity && !removalCost.missingCosts.length && removal.status === 'ACTIVE'
                  ? '0'
                  : removalSubtotal?.totalCost,
                content?.currency,
              )],
            ]} />
            <p>Esta partida se quitará del presupuesto actual. El cómputo original, el catálogo de actividades y las revisiones emitidas no se modificarán.</p>
          </div>
        )}
      </Confirm>
      <Modal
        open={!!priceChanges}
        onClose={() => { costReviewSequence.current++; setPriceChanges(undefined); }}
        title="Revisar costos de referencia"
        wide
      >
        <div className="stack">
          {priceChanges?.changes.length === 0 && (
            <p>No hay nuevas referencias comparables vigentes.</p>
          )}
          {priceChanges?.changes.map((c) => {
            const key = c.key;
            return (
              <label className="row" key={key}>
                <input
                  type="checkbox"
                  checked={acceptedPrices.includes(key)}
                  disabled={previewCostSelection.pending || applyCosts.pending}
                  onChange={(e) => void changeCostSelection(e.target.checked ? [...acceptedPrices, key] : acceptedPrices.filter(x => x !== key))}
                />
                <span>
                  {c.kind === 'COMPOSITION' ? 'Sustituir suministro histórico por composición BASE (cambio de receta separado)' : c.kind === 'LABOR' ? 'Mano de obra' : 'Materiales'} · {c.name}: {c.previous === null ? 'Sin precio' : formatMoney(c.previous, content?.currency)} → {formatMoney(c.next, content?.currency)} ·{' '}
                  {formatReferenceDate(c.dateLabel, c.datePrecision)} · {c.source}
                  {c.kind === 'COMPOSITION' ? ' · Desmarcado: requiere aceptación expresa; no es un cambio de tarifa' : c.manual
                    ? ' · Ajuste manual: conservar salvo selección expresa'
                    : ''}
                </span>
              </label>
            );
          })}
          <div className="note">La actualización de precios conserva cantidades, consumos y rentabilidad. Las sustituciones de composición se ofrecen por separado y sólo se aplican si las seleccionás. Costo: {formatMoney(priceChanges?.before.totalCost, content?.currency)} → {formatMoney(priceChanges?.after.totalCost, content?.currency)}. Venta: {formatMoney(priceChanges?.before.commercialTotal, content?.currency)} → {formatMoney(priceChanges?.after.commercialTotal, content?.currency)}.</div>
          {previewCostSelection.error && <ErrorBox error={previewCostSelection.error} />}
          {applyCosts.error && <ErrorBox error={applyCosts.error} />}
          <Button disabled={applyCosts.pending || previewCostSelection.pending || !!previewCostSelection.error} onClick={acceptPrices}>Aplicar selección al borrador</Button>
        </div>
      </Modal>
      <Modal
        open={!!valuation && !valuation.reviewing}
        onClose={() => setValuation(null)}
        title="Cambiar moneda o IVA"
      >
        <p>
          Se dejarán pendientes los precios de materiales, mano de obra y otros
          directos de {valuation?.previous.lines.length} partidas. No se
          convertirán importes ni se supondrá una alícuota.
        </p>
        <p>
          Podés restaurar el borrador previo mientras revisás los nuevos
          valores. Las revisiones emitidas se conservan.
        </p>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <Button onClick={confirmValuation}>Cambiar y revisar costos</Button>
          <Button variant="sec" onClick={() => setValuation(null)}>
            Conservar valoración
          </Button>
        </div>
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
