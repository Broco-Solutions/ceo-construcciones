'use client';
import { MaterialMultiPicker } from '@/components/MaterialMultiPicker';
// Editor de renglones comerciales (cotización / OC): material, presentación, cantidad, precio y cantidad base del precio.
import { useId, useState } from 'react';
import { EntityPicker } from '@/components/EntityPicker';
import { unitSymbol } from '@/lib/units';

import { Trash2 } from 'lucide-react';
import type { Schemas } from '@/lib/api';
import { decimalToInput, parseDecimalInput } from '@/lib/format';
import { MaterialPicker } from '@/components/catalogo/MaterialPicker';
import { positiveQty, type useLookups } from './common';

export type LineDraft = { materialId: string; presentationId: string; quantity: string; unitPrice: string; baseQuantity: string };
export const emptyLine = (materialId = '', quantity = ''): LineDraft => ({ materialId, presentationId: '', quantity: quantity ? decimalToInput(quantity) : '', unitPrice: '', baseQuantity: '1' });
export const lineFrom = (l: { materialId: string; presentationId?: string | null; quantity: string; unitPrice: string; baseQuantity: string }): LineDraft => ({
  materialId: l.materialId,
  presentationId: l.presentationId ?? '',
  quantity: decimalToInput(l.quantity),
  unitPrice: decimalToInput(l.unitPrice),
  baseQuantity: decimalToInput(l.baseQuantity),
});

/** Valida y convierte a CommercialLineInput; devuelve errores por índice. */
export function toCommercial(lines: LineDraft[]) {
  const errors: Record<number, string> = {};
  const out: Schemas['CommercialLineInput'][] = [];
  lines.forEach((l, i) => {
    const quantity = positiveQty(l.quantity);
    const price = parseDecimalInput(l.unitPrice);
    const base = positiveQty(l.baseQuantity);
    if (!l.materialId) errors[i] = 'Elegí el material';
    else if (!quantity) errors[i] = 'Cantidad inválida';
    else if (!price || price.startsWith('-')) errors[i] = 'Precio inválido';
    else if (!base) errors[i] = 'Cantidad base inválida';
    else out.push({ materialId: l.materialId, presentationId: l.presentationId || undefined, quantity, unitPrice: price, baseQuantity: base });
  });
  const ids = lines.map((l) => l.materialId).filter(Boolean);
  if (new Set(ids).size !== ids.length) errors[-1] = 'Hay materiales repetidos: un renglón por material.';
  return { out, errors, ok: Object.keys(errors).length === 0 && out.length > 0 };
}

export function CommercialLines({
  lines,
  onChange,
  supplierId,
  lk,
  lockMaterials,
  errors = {},
  currency,
}: {
  lines: LineDraft[];
  onChange: (l: LineDraft[]) => void;
  supplierId: string;
  lk: ReturnType<typeof useLookups>;
  lockMaterials?: boolean;
  errors?: Record<number, string>;
  currency?: string;
}) {
  const uid = useId();
  const [chosen,setChosen]=useState<Record<string,Schemas['Material']>>({}),[notice,setNotice]=useState('');
  const set = (i: number, patch: Partial<LineDraft>) => onChange(lines.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  return (
    <div className="stack">
      {notice&&<p className="note" role="status">{notice}</p>}
      {errors[-1] && <div className="alert bad">{errors[-1]}</div>}
      {lines.map((l, i) => {
        const unit = chosen[l.materialId]?.unit ? unitSymbol(chosen[l.materialId].unit) : lk.unitOf(l.materialId);
        return (
          <div key={i} className="card" style={{ padding: 12 }}>
            <div className="stack" style={{ gap: 10 }}>
              {lockMaterials ? (
                <b>{lk.materialLabel(l.materialId)}</b>
              ) : (
                <MaterialPicker value={l.materialId || null} onChange={m=>{if(m)setChosen(old=>({...old,[m.id]:{...m,unit:m.unit??undefined}}));const previous=chosen[l.materialId]??lk.material(l.materialId),differentUnit=!!m&&!!previous&&previous.unitId!==m.unitId;if(l.materialId)setNotice('Al cambiar el material se retiraron el precio y la presentación anteriores.'+(differentUnit?' La cantidad queda pendiente por el cambio de unidad.':''));set(i,{materialId:m?.id??'',presentationId:'',baseQuantity:'1',unitPrice:'',...(differentUnit?{quantity:''}:{})});}}/>
              )}
              <div className="formgrid">
                <div className="field">
                  <label htmlFor={`${uid}-q-${i}`}>Cantidad ({unit || 'unidad base'})</label>
                  <input id={`${uid}-q-${i}`} className="input" inputMode="decimal" value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                </div>
                <EntityPicker<Schemas['Presentation']> resource="presentations" label="Presentación" value={l.presentationId} disabled={!l.materialId} query={{materialId:l.materialId,active:true,supplierId:supplierId||undefined}} onChange={p=>set(i,{presentationId:p?.id??'',baseQuantity:p?decimalToInput(p.baseQuantity):'1'})} placeholder="Sin presentación (precio por unidad base)"/>
                <div className="field">
                  <label htmlFor={`${uid}-u-${i}`}>Precio{currency ? ` (${currency})` : ''}</label>
                  <input id={`${uid}-u-${i}`} className="input" inputMode="decimal" value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} />
                </div>
                <div className="field">
                  <label htmlFor={`${uid}-b-${i}`}>Precio por cantidad base{unit ? ` (${unit})` : ''}</label>
                  <input id={`${uid}-b-${i}`} className="input" inputMode="decimal" value={l.baseQuantity} disabled={!!l.presentationId} onChange={(e) => set(i, { baseQuantity: e.target.value })} />
                  <span className="hint">Ej.: precio por bolsa de 50 kg → 50.</span>
                </div>
              </div>
              <div className="row">
                {errors[i] && <span className="small" style={{ color: 'var(--bad)', fontWeight: 600, flex: 1 }}>{errors[i]}</span>}
                <span className="sp" style={{ flex: 1 }} />
                {lines.length > 1 && (
                  <button type="button" className="btn ghost sm" onClick={() => onChange(lines.filter((_, n) => n !== i))}>
                    <Trash2 /> Quitar renglón
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {!lockMaterials && (
        <div className="stack">
          <MaterialMultiPicker existingIds={lines.map(l=>l.materialId).filter(Boolean)} onAdd={materials=>{setChosen(old=>({...old,...Object.fromEntries(materials.map(m=>[m.id,m]))}));const next=[...lines];for(const material of materials){const empty=next.findIndex(l=>!l.materialId&&!l.quantity&&!l.unitPrice&&!l.presentationId);if(empty>=0)next[empty]=emptyLine(material.id);else next.push(emptyLine(material.id));}onChange(next);}}/>
          <button type="button" className="btn sec" onClick={() => onChange([...lines, emptyLine()])}>
            Agregar renglón
          </button>
        </div>
      )}
    </div>
  );
}
