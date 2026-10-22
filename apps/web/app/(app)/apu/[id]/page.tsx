'use client';
import { unitSymbol, unitLabel } from '@/lib/units';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Calculator, Pencil } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DefList, ErrorBox, Loading, Pill, useToast } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi, useMutation } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
import { formatMoney, formatQty, parseDecimalInput } from '@/lib/format';
import { ApuForm } from '@/components/presupuesto/ApuForm';
import {
  buildPrices,
  CalcLines,
  CalcSummary,
  emptyValuation,
  PricesEditor,
  TAX_LABEL,
  usePrices,
  validateValuation,
  valuationBody,
  ValuationFields,
  type PriceChoice,
} from '@/components/presupuesto/common';

export default function ApuDetailPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <ApuDetail />
    </RequirePerm>
  );
}

function ApuDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const q = useApi<{ data: Schemas['ApuDetail'] }>(`/apu-items/${id}`);
  const [editing, setEditing] = useState(false);
  const apu = q.data?.data;
  if (q.loading && !apu) return <Page title="APU"><Loading /></Page>;
  if (q.error || !apu) return <Page title="APU"><ErrorBox error={q.error} onRetry={q.reload} /></Page>;
  const crumb = <Link href="/apu">APU</Link>;
  if (editing)
    return (
      <Page title={`Editar: ${apu.name}`} crumb={crumb}>
        <ApuForm
          initial={apu}
          onSaved={(a) => {
            q.setData({ data: a });
            setEditing(false);
            q.reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </Page>
    );
  const laborOnly = apu.components.length === 0;
  return (
    <Page
      title={apu.name}
      crumb={crumb}
      actions={
        can('editBudget') && (
          <Button variant="sec" onClick={() => setEditing(true)}>
            <Pencil size={14} /> Editar
          </Button>
        )
      }
    >
      <Card title="Datos del ítem">
        <DefList
          items={[
            ['Código', apu.code ? <span className="mono">{apu.code}</span> : '—'],
            ['Rubro', apu.category.name],
            ['Unidad de trabajo', unitLabel(apu.unit)],
            ['Mano de obra por unidad', apu.laborCost ? `${formatMoney(apu.laborCost, apu.laborCurrency)} · ${TAX_LABEL[apu.laborTaxBasis]}` : `Sin importe · ${TAX_LABEL[apu.laborTaxBasis]}`],
            ['Estado', apu.active ? <Pill tone="ok">Activo</Pill> : <Pill>Inactivo</Pill>],
          ]}
        />
      </Card>
      <Card title={`Receta por 1 ${unitSymbol(apu.unit)}`} bodyClass={laborOnly ? 'bd' : ''}>
        {laborOnly ? (
          <div className="alert warn">Ítem sólo de mano de obra: no consume materiales.</div>
        ) : (
          <div className="tblwrap">
            <table className="t">
              <thead>
                <tr>
                  <th scope="col">Material</th>
                  <th className="r" scope="col">Consumo por {unitSymbol(apu.unit)}</th>
                </tr>
              </thead>
              <tbody>
                {apu.components.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="mono small">{c.material.code}</span> {c.material.name}
                    </td>
                    <td className="r qty">{formatQty(c.coefficient, unitSymbol(c.material.unit))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CalculatePanel apu={apu} />
    </Page>
  );
}

function CalculatePanel({ apu }: { apu: Schemas['ApuDetail'] }) {
  const toast = useToast();
  const prices = usePrices();
  const [val, setVal] = useState(emptyValuation);
  const [choices, setChoices] = useState<Record<string, PriceChoice>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [priceErrs, setPriceErrs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Schemas['BudgetCalculation'] | null>(null);
  const calc = useMutation((_k: string, body: Schemas['ValuationInput']) =>
    api.post<{ data: Schemas['BudgetCalculation'] }>(`/apu-items/${apu.id}/calculate`, body),
  );
  const mats = apu.components.map((c) => ({ id: c.materialId, name: c.material.name, unit: unitSymbol(c.material.unit) }));

  async function run() {
    const e = validateValuation(val);
    const p = buildPrices(
      mats.map((m) => m.id),
      // completa modo por defecto visible en pantalla
      Object.fromEntries(mats.map((m) => [m.id, choices[m.id] ?? { mode: prices.byMaterial.get(m.id)?.length ? 'ref' : 'manual', priceId: '', unitPrice: '' }])),
      parseDecimalInput,
    );
    setErrs(e);
    setPriceErrs(p.errors);
    if (Object.keys(e).length || Object.keys(p.errors).length) return;
    const r = await calc.run({ ...valuationBody(val), prices: p.prices });
    if (r) {
      setResult(r.data);
      toast.success('Costo del APU calculado');
    }
  }

  return (
    <Card title="Consultar costo calculado">
      <p className="small muted">
        Elegí la moneda, los impuestos, el redondeo y un precio por material para estimar el costo de 1 {unitSymbol(apu.unit)}. Es una simulación: el resultado no se guarda.
      </p>
      <ValuationFields value={val} onChange={setVal} errors={errs} />
      {prices.loading ? <Loading label="Cargando precios…" /> : prices.error ? <ErrorBox error={prices.error} onRetry={prices.reload} /> : (
        <PricesEditor materials={mats} choices={choices} onChange={setChoices} errors={priceErrs} byMaterial={prices.byMaterial} />
      )}
      <ErrorBox error={calc.error} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button size="lg" onClick={run} loading={calc.pending}>
          <Calculator size={16} /> Calcular
        </Button>
      </div>
      {result && (
        <div className="stack">
          <CalcSummary calc={result} />
          <CalcLines calc={result} />
        </div>
      )}
    </Card>
  );
}
