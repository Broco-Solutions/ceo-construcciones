'use client';
import { unitSymbol } from '@/lib/units';
import { useMemo, useState } from 'react';
import { api, fieldErrors, type Schemas } from '@/lib/api';
import { useAll, useApi, useMutation } from '@/lib/hooks';
import { decimalToInput, parseDecimalInput } from '@/lib/format';
import {
  Button,
  Card,
  DecimalField,
  Empty,
  ErrorBox,
  Loading,
  SelectField,
  useToast,
} from '@/components/ui';
import {
  buildPrices,
  emptyValuation,
  PricesEditor,
  usePrices,
  validateValuation,
  valuationBody,
  ValuationFields,
  type PriceChoice,
} from './common';

type LineOv = {
  quantity: string;
  laborUnitCost: string;
  materials: Record<string, { coefficient: string; unitPrice: string }>;
};

/** Crea una versión inmutable de presupuesto desde un cómputo de la obra. */
export function VersionForm({
  budget,
  defaultComputationId,
  onCreated,
  onCancel,
}: {
  budget: Schemas['BudgetDetail'];
  defaultComputationId?: string;
  onCreated: (v: Schemas['VersionCreated']) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const comps = useAll<Schemas['Computation']>('/computations', {
    workId: budget.workId,
  });
  const [computationId, setComputationId] = useState(
    defaultComputationId ?? '',
  );
  const comp = useApi<{ data: Schemas['ComputationDetail'] }>(
    computationId ? `/computations/${computationId}` : null,
  );
  const prices = usePrices();
  const [val, setVal] = useState(emptyValuation);
  const [choices, setChoices] = useState<Record<string, PriceChoice>>({});
  const [ovs, setOvs] = useState<Record<string, LineOv>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [priceErrs, setPriceErrs] = useState<Record<string, string>>({});
  // Idempotency-Key estable por intención: useMutation reutiliza la clave si el cuerpo es idéntico (reintento tras
  // error de red/timeout) y genera una nueva si el cuerpo cambió o tras un éxito. Doble clic: el segundo run() se ignora.
  const create = useMutation((key: string, body: Schemas['VersionInput']) =>
    api.post<{ data: Schemas['VersionCreated'] }>(
      `/budgets/${budget.id}/versions`,
      body,
      { idempotencyKey: key },
    ),
  );
  const lines =
    comp.data?.data.id === computationId ? comp.data.data.lines : [];
  const mats = useMemo(() => {
    const m = new Map<string, { id: string; name: string; unit?: string }>();
    lines.forEach((l) =>
      l.item.components.forEach((c) =>
        m.set(c.materialId, {
          id: c.materialId,
          name: c.material.name,
          unit: unitSymbol(c.material.unit),
        }),
      ),
    );
    return [...m.values()];
  }, [lines]);

  const setOv = (lineId: string, patch: Partial<LineOv>) =>
    setOvs((o) => ({
      ...o,
      [lineId]: {
        ...(o[lineId] ?? { quantity: '', laborUnitCost: '', materials: {} }),
        ...patch,
      },
    }));

  async function submit() {
    const e = validateValuation(val);
    if (!computationId) e.computationId = 'Elegí el cómputo.';
    const p = buildPrices(
      mats.map((m) => m.id),
      Object.fromEntries(
        mats.map((m) => [
          m.id,
          choices[m.id] ?? {
            mode: prices.byMaterial.get(m.id)?.length ? 'ref' : 'manual',
            priceId: '',
            unitPrice: '',
          },
        ]),
      ),
      parseDecimalInput,
    );
    const overrides: NonNullable<Schemas['VersionInput']['overrides']> = [];
    for (const l of lines) {
      const o = ovs[l.id];
      if (!o) continue;
      const item: (typeof overrides)[number] = { lineId: l.id };
      if (o.quantity.trim()) {
        const q = parseDecimalInput(o.quantity);
        if (!q) e[`ov.${l.id}.quantity`] = 'Cantidad inválida.';
        else item.quantity = q;
      }
      if (o.laborUnitCost.trim()) {
        const q = parseDecimalInput(o.laborUnitCost);
        if (!q) e[`ov.${l.id}.labor`] = 'Importe inválido.';
        else item.laborUnitCost = q;
      }
      const mo: NonNullable<(typeof item)['materials']> = [];
      for (const [mid, v] of Object.entries(o.materials)) {
        const entry: (typeof mo)[number] = { materialId: mid };
        if (v.coefficient.trim()) {
          const c = parseDecimalInput(v.coefficient);
          if (!c) e[`ov.${l.id}.${mid}.c`] = 'Consumo inválido.';
          else entry.coefficient = c;
        }
        if (v.unitPrice.trim()) {
          const c = parseDecimalInput(v.unitPrice);
          if (!c) e[`ov.${l.id}.${mid}.p`] = 'Precio inválido.';
          else entry.unitPrice = c;
        }
        if (entry.coefficient || entry.unitPrice) mo.push(entry);
      }
      if (mo.length) item.materials = mo;
      if (item.quantity || item.laborUnitCost || item.materials)
        overrides.push(item);
    }
    setErrs(e);
    setPriceErrs(p.errors);
    if (Object.keys(e).length || Object.keys(p.errors).length) return;
    if (create.pending) return;
    const r = await create.run({
      ...valuationBody(val),
      prices: p.prices,
      computationId,
      ...(overrides.length ? { overrides } : {}),
    });
    if (r) {
      toast.success(`Versión ${r.data.number} creada correctamente`);
      onCreated(r.data);
    }
  }

  const fe = { ...fieldErrors(create.error), ...errs };

  if (comps.loading) return <Loading />;
  if (comps.error)
    return <ErrorBox error={comps.error} onRetry={comps.reload} />;
  if (!comps.rows.length)
    return (
      <Empty title="La obra no tiene cómputos">
        Creá primero un cómputo para esta obra.
      </Empty>
    );

  return (
    <div className="stack">
      <div className="note small">
        Cada versión guarda las cantidades, los consumos y los precios tal como
        están ahora. Si después cambia el cómputo o un precio, esta versión no
        se modifica: para reflejar los cambios, creá una versión nueva.
      </div>
      <SelectField
        label="Cómputo de origen"
        value={computationId}
        placeholder="Elegir cómputo…"
        options={comps.rows.map((c) => ({ value: c.id, label: c.name }))}
        onChange={(e) => {
          setComputationId(e.target.value);
          setOvs({});
          setChoices({});
        }}
        error={fe.computationId}
      />
      <Card title="Moneda, impuestos y redondeo">
        <ValuationFields value={val} onChange={setVal} errors={fe} />
      </Card>
      {computationId &&
        (comp.loading ? (
          <Loading />
        ) : comp.error ? (
          <ErrorBox error={comp.error} onRetry={comp.reload} />
        ) : (
          <>
            <Card title="Precios por material">
              {prices.loading ? (
                <Loading label="Cargando precios…" />
              ) : prices.error ? (
                <ErrorBox error={prices.error} onRetry={prices.reload} />
              ) : (
                <PricesEditor
                  materials={mats}
                  choices={choices}
                  onChange={setChoices}
                  errors={priceErrs}
                  byMaterial={prices.byMaterial}
                />
              )}
            </Card>
            <Card title="Sobrescrituras puntuales (opcional)">
              <p className="small muted">
                Sólo para esta versión. Dejá vacío para usar lo del cómputo y de
                la actividad.
              </p>
              {lines.map((l) => {
                const o = ovs[l.id];
                return (
                  <details
                    key={l.id}
                    style={{
                      borderTop: '1px solid var(--line2)',
                      padding: '8px 0',
                    }}
                  >
                    <summary style={{ cursor: 'pointer' }}>
                      <b>{l.item.name}</b>{' '}
                      <span className="small muted">
                        · {l.item.category.name}
                      </span>
                      {o &&
                        (o.quantity ||
                          o.laborUnitCost ||
                          Object.values(o.materials).some(
                            (m) => m.coefficient || m.unitPrice,
                          )) && (
                          <span className="pill blue" style={{ marginLeft: 6 }}>
                            Con ajustes
                          </span>
                        )}
                    </summary>
                    <div className="formgrid" style={{ marginTop: 8 }}>
                      <DecimalField
                        label={`Cantidad (${unitSymbol(l.item.unit)})`}
                        placeholder={decimalToInput(l.quantity)}
                        value={o?.quantity ?? ''}
                        onChange={(e) =>
                          setOv(l.id, { quantity: e.target.value })
                        }
                        error={fe[`ov.${l.id}.quantity`]}
                      />
                      <DecimalField
                        label={`Mano de obra por ${unitSymbol(l.item.unit)}`}
                        value={o?.laborUnitCost ?? ''}
                        onChange={(e) =>
                          setOv(l.id, { laborUnitCost: e.target.value })
                        }
                        error={fe[`ov.${l.id}.labor`]}
                      />
                    </div>
                    {l.item.components.map((c) => {
                      const mv = o?.materials[c.materialId] ?? {
                        coefficient: '',
                        unitPrice: '',
                      };
                      const setM = (patch: Partial<typeof mv>) =>
                        setOv(l.id, {
                          materials: {
                            ...(o?.materials ?? {}),
                            [c.materialId]: { ...mv, ...patch },
                          },
                        });
                      return (
                        <div key={c.materialId} className="formgrid">
                          <DecimalField
                            label={`${c.material.name}: consumo (${unitSymbol(c.material.unit)})`}
                            placeholder={decimalToInput(c.coefficient)}
                            value={mv.coefficient}
                            onChange={(e) =>
                              setM({ coefficient: e.target.value })
                            }
                            error={fe[`ov.${l.id}.${c.materialId}.c`]}
                          />
                          <DecimalField
                            label={`${c.material.name}: precio unitario`}
                            value={mv.unitPrice}
                            onChange={(e) =>
                              setM({ unitPrice: e.target.value })
                            }
                            error={fe[`ov.${l.id}.${c.materialId}.p`]}
                          />
                        </div>
                      );
                    })}
                  </details>
                );
              })}
            </Card>
          </>
        ))}
      <ErrorBox error={create.error} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <Button
          variant="sec"
          size="lg"
          onClick={onCancel}
          disabled={create.pending}
        >
          Cancelar
        </Button>
        <Button
          size="lg"
          onClick={submit}
          data-testid="crear-version"
          loading={create.pending}
          disabled={!computationId}
        >
          Crear versión
        </Button>
      </div>
    </div>
  );
}
