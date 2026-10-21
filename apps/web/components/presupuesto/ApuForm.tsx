'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api, fieldErrors, type Schemas } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { decimalToInput, parseDecimalInput } from '@/lib/format';
import { Button, Card, DecimalField, ErrorBox, Loading, SelectField, TextField, useToast } from '@/components/ui';
import { TAX_OPTIONS, useCatalogs } from './common';
import { parseLaborCost } from './validation';

type Row = { key: number; materialId: string; coefficient: string };
let seq = 0;

export function ApuForm({ initial, onSaved, onCancel }: { initial?: Schemas['ApuDetail']; onSaved: (apu: Schemas['ApuDetail']) => void; onCancel: () => void }) {
  const cat = useCatalogs();
  const toast = useToast();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [unitId, setUnitId] = useState(initial?.unitId ?? '');
  const [laborCost, setLaborCost] = useState(decimalToInput(initial?.laborCost));
  const [laborCurrency, setLaborCurrency] = useState(initial?.laborCurrency ?? '');
  const [laborTaxBasis, setLaborTaxBasis] = useState<string>(initial?.laborTaxBasis ?? '');
  const [active, setActive] = useState(initial?.active ?? true);
  const [rows, setRows] = useState<Row[]>(() =>
    (initial?.components ?? []).map((c) => ({ key: ++seq, materialId: c.materialId, coefficient: decimalToInput(c.coefficient) })),
  );
  const [errs, setErrs] = useState<Record<string, string>>({});

  const save = useMutation((_k: string, body: Schemas['ApuInput']) =>
    initial ? api.patch<{ data: Schemas['ApuDetail'] }>(`/apu-items/${initial.id}`, body) : api.post<{ data: Schemas['ApuDetail'] }>('/apu-items', body),
  );

  if (cat.loading) return <Loading />;
  if (cat.error) return <ErrorBox error={cat.error} onRetry={cat.reload} />;

  const matOptions = cat.materials.rows
    .filter((m) => m.active || rows.some((r) => r.materialId === m.id))
    .map((m) => ({ value: m.id, label: `${m.code} · ${m.name} (${cat.unitById.get(m.unitId)?.code ?? '?'})` }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!name.trim()) er.name = 'Ingresá el nombre del ítem.';
    if (!categoryId) er.categoryId = 'Elegí el rubro.';
    if (!unitId) er.unitId = 'Elegí la unidad de trabajo.';
    const labor = parseLaborCost(laborCost);
    if (labor.error) er.laborCost = labor.error;
    if (!/^[A-Z]{3}$/.test(laborCurrency)) er.laborCurrency = 'Código de 3 letras (p. ej. ARS).';
    if (!laborTaxBasis) er.laborTaxBasis = 'Elegí la base impositiva de la mano de obra.';
    const components: Schemas['ApuInput']['components'] = [];
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      if (!r.materialId) er[`components.${i}.materialId`] = 'Elegí un material.';
      else if (seen.has(r.materialId)) er[`components.${i}.materialId`] = 'Material repetido.';
      seen.add(r.materialId);
      const c = parseDecimalInput(r.coefficient);
      if (!c || c === '0') er[`components.${i}.coefficient`] = 'Consumo mayor a 0 (p. ej. 4,5).';
      if (r.materialId && c) components.push({ materialId: r.materialId, coefficient: c });
    });
    setErrs(er);
    if (Object.keys(er).length) return;
    const res = await save.run({
      code: code.trim() || null,
      name: name.trim(),
      categoryId,
      unitId,
      laborCost: labor.value!,
      laborCurrency,
      laborTaxBasis: laborTaxBasis as Schemas['ApuInput']['laborTaxBasis'],
      active,
      components,
    });
    if (res) {
      toast(initial ? 'APU actualizado.' : 'APU creado.');
      onSaved(res.data);
    }
  }
  const fe = { ...fieldErrors(save.error), ...errs };
  const unitCode = cat.unitById.get(unitId)?.code;

  return (
    <form onSubmit={submit} className="stack" noValidate>
      <Card title="Ítem">
        <div className="formgrid">
          <SelectField
            label="Rubro"
            value={categoryId}
            placeholder="Elegir rubro…"
            options={cat.categories.rows.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` }))}
            onChange={(e) => setCategoryId(e.target.value)}
            error={fe.categoryId}
          />
          <TextField label="Código (opcional)" value={code} onChange={(e) => setCode(e.target.value)} maxLength={100} hint="No necesita ser único." error={fe.code} />
          <TextField label="Nombre del ítem" value={name} onChange={(e) => setName(e.target.value)} maxLength={300} error={fe.name} placeholder="Aplicado a la cal completo" />
          <SelectField
            label="Unidad de trabajo"
            value={unitId}
            placeholder="Elegir unidad…"
            options={cat.units.rows.map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` }))}
            onChange={(e) => setUnitId(e.target.value)}
            error={fe.unitId}
          />
        </div>
        <label className="row small" style={{ gap: 6, marginTop: 10 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activo
        </label>
      </Card>

      <Card
        title={`Materiales por ${unitCode ?? 'unidad de trabajo'}`}
        actions={
          <Button size="sm" variant="sec" onClick={() => setRows((r) => [...r, { key: ++seq, materialId: '', coefficient: '' }])}>
            <Plus size={14} /> Agregar material
          </Button>
        }
      >
        <div className="note small">
          Cargá el consumo de cada material para <b>1 {unitCode ?? 'unidad de trabajo'}</b>, con coma decimal. Ejemplo: “Aplicado a la cal completo — 1 m²: Cemento
          4,5 kg; Cal 6,6 kg; Arena 0,07 m³”.
        </div>
        {rows.length === 0 ? (
          <div className="alert warn" style={{ marginTop: 10 }}>
            Este APU es <b>sólo de mano de obra</b>: no consume materiales. Si corresponde, agregá materiales con el botón de arriba.
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 10 }}>
            {rows.map((r, i) => {
              const m = cat.matById.get(r.materialId);
              return (
                <div key={r.key} className="formgrid" style={{ alignItems: 'end' }}>
                  <SelectField
                    label={`Material ${i + 1}`}
                    value={r.materialId}
                    placeholder="Elegir material…"
                    options={matOptions}
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, materialId: e.target.value } : x)))}
                    error={fe[`components.${i}.materialId`]}
                  />
                  <DecimalField
                    label={`Consumo${m ? ` (${cat.unitById.get(m.unitId)?.code ?? ''})` : ''}`}
                    value={r.coefficient}
                    placeholder="4,5"
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, coefficient: e.target.value } : x)))}
                    error={fe[`components.${i}.coefficient`]}
                  />
                  <div className="field">
                    <Button variant="ghost" aria-label={`Quitar material ${i + 1}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <Trash2 size={14} /> Quitar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title={`Mano de obra por ${unitCode ?? 'unidad'}`}>
        <div className="formgrid">
          <DecimalField label="Importe de mano de obra" value={laborCost} placeholder="0,00" onChange={(e) => setLaborCost(e.target.value)} error={fe.laborCost} hint="Obligatorio. Si el ítem no tiene mano de obra, ingresá 0." required />
          <TextField label="Moneda" value={laborCurrency} maxLength={3} placeholder="ARS" onChange={(e) => setLaborCurrency(e.target.value.toUpperCase())} error={fe.laborCurrency} />
          <SelectField
            label="Base impositiva"
            value={laborTaxBasis}
            placeholder="Elegir…"
            options={TAX_OPTIONS}
            onChange={(e) => setLaborTaxBasis(e.target.value)}
            error={fe.laborTaxBasis}
          />
        </div>
      </Card>

      <ErrorBox error={save.error} />
      <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="sec" size="lg" onClick={onCancel} disabled={save.pending}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" loading={save.pending}>
          {initial ? 'Guardar cambios' : 'Crear APU'}
        </Button>
      </div>
    </form>
  );
}
