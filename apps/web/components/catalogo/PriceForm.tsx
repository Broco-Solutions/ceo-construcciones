'use client';
import { useEffect, useState } from 'react';
import { api, fieldErrors } from '@/lib/api';
import { useAll, useMutation } from '@/lib/hooks';
import { dateInputToIso, formatQty, isPositiveDecimal, parseDecimalInput } from '@/lib/format';
import { Button, DecimalField, ErrorBox, Modal, SelectField, TextField, useToast } from '@/components/ui';
import { MaterialPicker, type PickedMaterial } from './MaterialPicker';
import { TAX_BASIS_LABEL, useSuppliers, useUnits, type MaterialPrice, type Presentation, type TaxBasis } from './common';

const CURRENCIES = ['ARS', 'USD'];

/** Registro de precio (append-only: nunca se edita uno existente). */
export function PriceForm({
  open,
  onClose,
  onSaved,
  materialId: fixedMaterial,
  supplierId: fixedSupplier,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (p: MaterialPrice) => void;
  materialId?: string;
  supplierId?: string;
}) {
  const toast = useToast();
  const units = useUnits();
  const suppliers = useSuppliers(true);
  const [materialId, setMaterialId] = useState<string | null>(fixedMaterial ?? null);
  const [material, setMaterial] = useState<PickedMaterial | null>(null);
  const [f, setF] = useState({ supplierId: fixedSupplier ?? '', presentationId: '', price: '', currency: '', taxBasis: '' as TaxBasis | '', effectiveAt: '', source: '' });
  const [local, setLocal] = useState<Record<string, string>>({});
  const pres = useAll<Presentation>(materialId ? '/presentations' : null, { materialId: materialId ?? undefined });
  const activePres = pres.rows.filter((p) => p.active);
  const selPres = activePres.find((p) => p.id === f.presentationId) ?? null;
  const [unitId, setUnitId] = useState<string | null>(null);
  useEffect(() => {
    if (!fixedMaterial) return;
    api.get<{ data: { unitId: string } }>(`/materials/${fixedMaterial}`).then((r) => setUnitId(r.data.unitId)).catch(() => {});
  }, [fixedMaterial]);
  const unitCode = units.map.get(material?.unitId ?? unitId ?? '')?.code ?? '';

  const m = useMutation(async (_k, body: Record<string, unknown>) => api.post<{ data: MaterialPrice }>('/prices', body));
  const errs = { ...fieldErrors(m.error), ...local };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const le: Record<string, string> = {};
    if (!materialId) le.materialId = 'Elegí el material';
    const price = parseDecimalInput(f.price);
    if (!price || !isPositiveDecimal(price)) le.price = 'Ingresá un precio mayor a cero';
    const bq = selPres ? selPres.baseQuantity : '1';
    if (!bq || !isPositiveDecimal(bq)) le.baseQuantity = 'Ingresá la cantidad en unidad base (mayor a cero)';
    if (!f.currency) le.currency = 'Elegí la moneda';
    if (!f.taxBasis) le.taxBasis = 'Indicá la base impositiva';
    setLocal(le);
    if (Object.keys(le).length) return;
    const body: Record<string, unknown> = {
      materialId,
      supplierId: f.supplierId || null,
      presentationId: selPres?.id ?? null,
      price,
      baseQuantity: bq,
      currency: f.currency,
      taxBasis: f.taxBasis,
    };
    if (f.effectiveAt) body.effectiveAt = dateInputToIso(f.effectiveAt);
    if (f.source.trim()) body.source = f.source.trim();
    const r = await m.run(body);
    if (r) {
      toast('Precio registrado');
      onSaved(r.data);
    }
  };

  return (
    <Modal
      open={open}
      side
      onClose={m.pending ? () => {} : onClose}
      title="Registrar precio"
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button type="submit" form="price-form" loading={m.pending}>
            Registrar
          </Button>
        </>
      }
    >
      <form id="price-form" className="stack" onSubmit={submit} noValidate>
        <div className="note small">Los precios son un historial: no se editan. Para corregir o actualizar, registrá un precio nuevo con su fecha de vigencia.</div>
        {!fixedMaterial && (
          <MaterialPicker
            value={materialId}
            error={errs.materialId}
            onChange={(mat) => {
              setMaterial(mat);
              setMaterialId(mat?.id ?? null);
              setF((x) => ({ ...x, presentationId: '' }));
            }}
          />
        )}
        <SelectField
          label="Proveedor"
          value={f.supplierId}
          onChange={set('supplierId')}
          disabled={!!fixedSupplier}
          error={errs.supplierId}
          placeholder={suppliers.loading ? 'Cargando…' : 'Sin proveedor (referencia)'}
          options={suppliers.rows.filter((s) => s.active || s.id === f.supplierId).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
        />
        <SelectField
          label="Presentación"
          value={f.presentationId}
          onChange={set('presentationId')}
          disabled={!materialId}
          error={errs.presentationId}
          placeholder={materialId ? 'Por unidad base' : 'Elegí primero el material'}
          options={activePres.map((p) => ({ value: p.id, label: `${p.name} — 1 = ${formatQty(p.baseQuantity, unitCode)}` }))}
        />
        {selPres ? (
          <div className="field">
            <label>Cantidad en unidad base</label>
            <div className="input muted">{formatQty(selPres.baseQuantity, unitCode)}</div>
            <span className="hint">Tomada de la presentación: el precio corresponde a 1 {selPres.name}.</span>
          </div>
        ) : (
          <div className="field">
            <label>Cantidad en unidad base</label>
            <div className="input muted">{formatQty('1', unitCode)}</div>
            <span className="hint">Sin presentación, el precio se registra por 1 unidad base{unitCode ? ` (${unitCode})` : ''}. Para precios por bolsa, caja, etc., elegí o creá una presentación en el material.</span>
          </div>
        )}
        <div className="formgrid">
          <DecimalField label="Precio" value={f.price} onChange={set('price')} error={errs.price} placeholder="0,00" />
          <SelectField label="Moneda" value={f.currency} onChange={set('currency')} error={errs.currency} placeholder="Elegí" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>
        <SelectField
          label="Base impositiva"
          value={f.taxBasis}
          onChange={set('taxBasis')}
          error={errs.taxBasis}
          placeholder="Elegí explícitamente"
          options={(Object.keys(TAX_BASIS_LABEL) as TaxBasis[]).map((k) => ({ value: k, label: TAX_BASIS_LABEL[k] }))}
        />
        <TextField label="Vigente desde" type="date" value={f.effectiveAt} onChange={set('effectiveAt')} error={errs.effectiveAt} hint="Si lo dejás vacío, rige desde el momento del registro." />
        <TextField label="Fuente" value={f.source} onChange={set('source')} error={errs.source} maxLength={500} placeholder="Ej.: lista de precios, cotización telefónica" />
        <ErrorBox error={m.error && Object.keys(fieldErrors(m.error)).length === 0 ? m.error : null} />
      </form>
    </Modal>
  );
}
