'use client';
// Piezas compartidas del módulo APU / Cómputos / Presupuestos. Todos los montos vienen del backend.
import { useMemo } from 'react';
import { useAll, useApi } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { formatDate, formatDecimal, formatMoney, formatQty } from '@/lib/format';
import { DecimalField, SelectField, TextField } from '@/components/ui';

export type TaxBasis = Schemas['TaxBasis'];
export const TAX_LABEL: Record<TaxBasis, string> = {
  INCLUDED: 'IVA incluido',
  EXCLUDED: 'Sin IVA',
  UNSPECIFIED: 'Sin especificar',
};
export const TAX_OPTIONS = (Object.keys(TAX_LABEL) as TaxBasis[]).map((k) => ({ value: k, label: TAX_LABEL[k] }));
export const ROUNDING_LABEL: Record<string, string> = {
  HALF_UP: 'Redondeo común (desde 5, hacia arriba)',
  HALF_EVEN: 'Redondeo al par',
  DOWN: 'Sin redondeo (corta los decimales)',
};
export const ROUNDING_OPTIONS = Object.entries(ROUNDING_LABEL).map(([value, label]) => ({ value, label }));
export const BOUNDARY = 'EXTENDED_LINE_COMPONENTS' as const;
export const BOUNDARY_LABEL = 'Por componente extendido de cada línea (EXTENDED_LINE_COMPONENTS)';

export const STATUS_LABEL: Record<Schemas['BudgetStatus'], string> = { DRAFT: 'Borrador', REFERENCE: 'Referencia', ARCHIVED: 'Archivada' };
export const STATUS_TONE: Record<Schemas['BudgetStatus'], 'plain' | 'blue' | 'warn'> = { DRAFT: 'plain', REFERENCE: 'blue', ARCHIVED: 'warn' };

/** Catálogos de referencia en memoria para resolver nombres (sin cálculos). */
export function useCatalogs(enabled = true) {
  const units = useAll<Schemas['Unit']>(enabled ? '/units' : null);
  const categories = useAll<Schemas['Category']>(enabled ? '/categories' : null);
  const materials = useAll<Schemas['Material']>(enabled ? '/materials' : null);
  const unitById = useMemo(() => new Map(units.rows.map((u) => [u.id, u])), [units.rows]);
  const catById = useMemo(() => new Map(categories.rows.map((c) => [c.id, c])), [categories.rows]);
  const matById = useMemo(() => new Map(materials.rows.map((m) => [m.id, m])), [materials.rows]);
  return {
    units,
    categories,
    materials,
    unitById,
    catById,
    matById,
    loading: units.loading || categories.loading || materials.loading,
    error: units.error ?? categories.error ?? materials.error,
    reload: () => {
      units.reload();
      categories.reload();
      materials.reload();
    },
  };
}

export function useWorks(enabled = true) {
  const works = useAll<Schemas['WorkList']>(enabled ? '/works' : null);
  const workById = useMemo(() => new Map(works.rows.map((w) => [w.id, w])), [works.rows]);
  return { ...works, workById };
}

/** Flujo Cómputo → Presupuesto → Materiales necesarios. */
export function BudgetFlow({ step }: { step: 0 | 1 | 2 | 3 }) {
  const steps = [
    ['APU', 'Receta por unidad'],
    ['Cómputo', 'Cantidades por obra'],
    ['Presupuesto', 'Versiones guardadas'],
    ['Materiales', 'Necesarios consolidados'],
  ];
  return (
    <div className="flow" aria-label="Flujo de presupuesto">
      {steps.map(([t, s], i) => (
        <div key={t} className={`fs${i < step ? ' done' : i === step ? ' now' : ''}`} aria-current={i === step ? 'step' : undefined}>
          <i>{i + 1}</i>
          <span>{t}</span>
          <small>{s}</small>
        </div>
      ))}
    </div>
  );
}

/* ---------- configuración de valuación (moneda, base, redondeo) ---------- */
export type ValuationState = { currency: string; taxBasis: string; precision: string; roundingMode: string };
export const emptyValuation: ValuationState = { currency: '', taxBasis: '', precision: '', roundingMode: '' };

export function validateValuation(v: ValuationState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!/^[A-Z]{3}$/.test(v.currency)) e.currency = 'Código de 3 letras en mayúsculas (p. ej. ARS).';
  if (!v.taxBasis) e.taxBasis = 'Elegí la base impositiva.';
  if (!/^[0-6]$/.test(v.precision)) e.precision = 'Entero entre 0 y 6.';
  if (!v.roundingMode) e.roundingMode = 'Elegí el modo de redondeo.';
  return e;
}

export function ValuationFields({ value, onChange, errors }: { value: ValuationState; onChange: (v: ValuationState) => void; errors: Record<string, string> }) {
  return (
    <>
      <div className="formgrid">
        <TextField
          label="Moneda"
          value={value.currency}
          maxLength={3}
          placeholder="ARS"
          onChange={(e) => onChange({ ...value, currency: e.target.value.toUpperCase() })}
          error={errors.currency}
        />
        <SelectField
          label="Base impositiva"
          value={value.taxBasis}
          placeholder="Elegir…"
          options={TAX_OPTIONS}
          onChange={(e) => onChange({ ...value, taxBasis: e.target.value })}
          error={errors.taxBasis}
          hint="Debe coincidir con la de los precios elegidos."
        />
        <SelectField
          label="Decimales (precisión)"
          value={value.precision}
          placeholder="Elegir…"
          options={['0', '1', '2', '3', '4', '5', '6'].map((n) => ({ value: n, label: n }))}
          onChange={(e) => onChange({ ...value, precision: e.target.value })}
          error={errors.precision}
        />
        <SelectField
          label="Modo de redondeo"
          value={value.roundingMode}
          placeholder="Elegir…"
          options={ROUNDING_OPTIONS}
          onChange={(e) => onChange({ ...value, roundingMode: e.target.value })}
          error={errors.roundingMode}
        />
      </div>
      <p className="small muted">Frontera de redondeo: {BOUNDARY_LABEL}. Es la única admitida por el sistema.</p>
    </>
  );
}

export function valuationBody(v: ValuationState) {
  return {
    currency: v.currency,
    taxBasis: v.taxBasis as TaxBasis,
    roundingBoundary: BOUNDARY,
    precision: Number.parseInt(v.precision, 10), // entero de configuración, no un importe
    roundingMode: v.roundingMode as 'HALF_UP' | 'HALF_EVEN' | 'DOWN',
  };
}

/* ---------- precios explícitos por material ---------- */
export type PriceChoice = { mode: 'ref' | 'manual'; priceId: string; unitPrice: string };
export type PriceEntry = { materialId: string; priceId?: string; unitPrice?: string };

export function usePrices(enabled = true) {
  const prices = useAll<Schemas['MaterialPrice']>(enabled ? '/prices' : null);
  const byMaterial = useMemo(() => {
    const m = new Map<string, Schemas['MaterialPrice'][]>();
    for (const p of prices.rows) m.set(p.materialId, [...(m.get(p.materialId) ?? []), p]);
    return m;
  }, [prices.rows]);
  return { ...prices, byMaterial };
}

export function priceLabel(p: Schemas['MaterialPrice'], unit?: string) {
  return `${formatMoney(p.price, p.currency)} por ${formatQty(p.baseQuantity, unit)} · ${TAX_LABEL[p.taxBasis]} · ${formatDate(p.effectiveAt)}${p.source ? ` · ${p.source}` : ''}`;
}

/** Arma el array `prices` y devuelve errores por material. */
export function buildPrices(materialIds: string[], choices: Record<string, PriceChoice>, parse: (s: string) => string | null) {
  const out: PriceEntry[] = [];
  const errors: Record<string, string> = {};
  for (const id of materialIds) {
    const c = choices[id];
    if (!c || (c.mode === 'ref' && !c.priceId)) {
      errors[id] = 'Elegí un precio de referencia o ingresá uno manual.';
      continue;
    }
    if (c.mode === 'ref') out.push({ materialId: id, priceId: c.priceId });
    else {
      const v = parse(c.unitPrice);
      if (!v) errors[id] = 'Precio unitario inválido.';
      else out.push({ materialId: id, unitPrice: v });
    }
  }
  return { prices: out, errors };
}

export function PricesEditor({
  materials,
  choices,
  onChange,
  errors,
  byMaterial,
}: {
  materials: { id: string; name: string; unit?: string }[];
  choices: Record<string, PriceChoice>;
  onChange: (c: Record<string, PriceChoice>) => void;
  errors: Record<string, string>;
  byMaterial: Map<string, Schemas['MaterialPrice'][]>;
}) {
  if (!materials.length) return <p className="small muted">No hay materiales para valorizar: sólo se usará la mano de obra.</p>;
  const set = (id: string, patch: Partial<PriceChoice>) => {
    const cur = choices[id] ?? { mode: (byMaterial.get(id)?.length ? 'ref' : 'manual') as PriceChoice['mode'], priceId: '', unitPrice: '' };
    onChange({ ...choices, [id]: { ...cur, ...patch } });
  };
  return (
    <div className="stack">
      {materials.map((m) => {
        const refs = byMaterial.get(m.id) ?? [];
        const c = choices[m.id] ?? { mode: refs.length ? 'ref' : 'manual', priceId: '', unitPrice: '' };
        return (
          <div key={m.id} className="formgrid" style={{ alignItems: 'end' }}>
            <SelectField
              label={`${m.name}${m.unit ? ` (${m.unit})` : ''}`}
              value={c.mode}
              options={[
                { value: 'ref', label: `Precio de referencia (${refs.length})` },
                { value: 'manual', label: 'Ingresar precio unitario' },
              ]}
              onChange={(e) => set(m.id, { mode: e.target.value as PriceChoice['mode'] })}
            />
            {c.mode === 'ref' ? (
              <SelectField
                label="Precio"
                value={c.priceId}
                placeholder={refs.length ? 'Elegir…' : 'Sin precios cargados'}
                options={refs.map((p) => ({ value: p.id, label: priceLabel(p, m.unit) }))}
                onChange={(e) => set(m.id, { priceId: e.target.value })}
                error={errors[m.id]}
              />
            ) : (
              <DecimalField
                label={`Precio por ${m.unit ?? 'unidad'}`}
                value={c.unitPrice}
                placeholder="0,00"
                onChange={(e) => set(m.id, { unitPrice: e.target.value })}
                error={errors[m.id]}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- resultado de cálculo (BudgetCalculation / StoredSnapshot) ---------- */
type Calc = Schemas['BudgetCalculation'] | Schemas['StoredSnapshot'];

export function CalcSummary({ calc }: { calc: Calc }) {
  return (
    <div className="kpis">
      <div className="kpi">
        <small>Materiales</small>
        <b>{formatMoney(calc.materialCost, calc.currency)}</b>
      </div>
      <div className="kpi">
        <small>Mano de obra</small>
        <b>{formatMoney(calc.laborCost, calc.currency)}</b>
      </div>
      <div className="kpi">
        <small>Costo total</small>
        <b>{formatMoney(calc.totalCost, calc.currency)}</b>
      </div>
      <div className="kpi">
        <small>Criterio</small>
        <b style={{ fontSize: 14 }}>{TAX_LABEL[calc.taxBasis]}</b>
        <span className="small muted">
          {calc.precision} decimales · {calc.roundingMode}
        </span>
      </div>
    </div>
  );
}

/** Desglose por línea: costo unitario y total con materiales y mano de obra. */
export function CalcLines({ calc }: { calc: Calc }) {
  const cur = calc.currency;
  const byCat = new Map<string, Schemas['SnapshotLine'][]>();
  for (const l of calc.lines) byCat.set(l.categoryId, [...(byCat.get(l.categoryId) ?? []), l]);
  return (
    <div>
      {calc.categories.map((cat, n) => (
        <div key={cat.categoryId} className="rubro open">
          <div className="row" style={{ padding: '12px 18px', gap: 10 }}>
            <span className="mono small muted">{String(n + 1).padStart(2, '0')}</span>
            <b style={{ flex: 1 }}>{cat.name}</b>
            <span className="small muted hide-m">
              Mat. {formatMoney(cat.materialCost, cur)} · MO {formatMoney(cat.laborCost, cur)}
            </span>
            <b className="num">{formatMoney(cat.totalCost, cur)}</b>
          </div>
          <div className="items">
            {(byCat.get(cat.categoryId) ?? []).map((l) => (
              <details key={l.sourceLineId} style={{ padding: '6px 0', borderTop: '1px solid var(--line2)' }}>
                <summary style={{ cursor: 'pointer' }}>
                  <span className="row" style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                    {l.code && <span className="mono small">{l.code}</span>}
                    <b>{l.name}</b>
                    <span className="small muted">{formatQty(l.quantity, l.unit)}</span>
                    <span className="small">
                      Unitario {formatMoney(l.totalUnitCost, cur)} (mat. {formatMoney(l.materialUnitCost, cur)} + MO {formatMoney(l.laborUnitCost, cur)})
                    </span>
                    <b className="num">Total {formatMoney(l.totalCost, cur)}</b>
                  </span>
                </summary>
                {l.materials.length === 0 ? (
                  <p className="small muted">Ítem sólo de mano de obra: sin materiales.</p>
                ) : (
                  <div className="tblwrap">
                    <table className="t">
                      <thead>
                        <tr>
                          <th scope="col">Material</th>
                          <th className="r" scope="col">Consumo / unidad</th>
                          <th className="r" scope="col">Precio unitario</th>
                          <th className="r" scope="col">Costo / unidad</th>
                          <th className="r" scope="col">Cantidad total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.materials.map((m) => (
                          <tr key={m.materialId}>
                            <td>{m.name}</td>
                            <td className="r">{formatQty(m.coefficient, m.unit)}</td>
                            <td className="r">{formatMoney(m.unitPrice, cur)}</td>
                            <td className="r">{formatMoney(m.unitCost, cur)}</td>
                            <td className="r">{formatQty(m.quantity, m.unit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="small muted">
                  Materiales {formatMoney(l.materialCost, cur)} · Mano de obra {formatMoney(l.laborCost, cur)}
                </p>
              </details>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CalcMaterials({ calc }: { calc: Calc }) {
  if (!calc.materials.length) return <p className="small muted">Sin materiales (sólo mano de obra).</p>;
  return (
    <div className="tblwrap">
      <table className="t">
        <thead>
          <tr>
            <th scope="col">Material</th>
            <th className="r" scope="col">Cantidad necesaria</th>
          </tr>
        </thead>
        <tbody>
          {calc.materials.map((m) => (
            <tr key={m.materialId}>
              <td>{m.name}</td>
              <td className="r qty">{formatQty(m.quantity, m.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const fmtCoef = (s: string) => formatDecimal(s);

/** Versión de referencia vigente de la obra (WorkDetail.referenceVersionId); null si no hay. */
export function useWorkReference(workId: string | null | undefined) {
  const q = useApi<{ data: Schemas['WorkDetail'] }>(workId ? `/works/${workId}` : null);
  return { referenceVersionId: q.data?.data.id === workId ? q.data?.data.referenceVersionId ?? null : null, reload: q.reload, loading: q.loading };
}

export function ReferencePill() {
  return (
    <span className="pill ok" data-testid="referencia-obra" title="Versión de referencia vigente de la obra">
      Referencia de la obra
    </span>
  );
}
