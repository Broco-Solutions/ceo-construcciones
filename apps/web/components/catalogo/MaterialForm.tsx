'use client';
import { unitLabel } from '@/lib/units';
import { useState } from 'react';
import { api, fieldErrors } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { decimalToInput, parseDecimalInput } from '@/lib/format';
import { Button, DecimalField, ErrorBox, Modal, SelectField, TextField, useToast } from '@/components/ui';
import { useCategories, useUnits, type Material } from './common';
import { AutoCodeField, AUTO_CODE } from '@/components/AutoCodeField';

const SHOWN = new Set(['code', 'name', 'unitId', 'categoryId', 'minimum']);

/**
 * Cuerpo enviado al servidor. En edición NUNCA incluye unitId: MaterialPatch lo rechaza con 422
 * (la unidad base es inmutable, incluso si coincide).
 */
export function materialBody(editing: boolean, f: { code: string; name: string; unitId: string; categoryId: string; active: boolean }, minimum: string | undefined) {
  const body: Record<string, unknown> = { code: !editing && !f.code.trim() ? AUTO_CODE : f.code.trim(), name: f.name.trim(), categoryId: f.categoryId || null, active: f.active };
  if (minimum !== undefined) body.minimum = minimum;
  if (!editing) body.unitId = f.unitId;
  return body;
}

/** Alta/edición de material. La unidad base sólo se elige al crear: el backend la trata como inmutable. */
export function MaterialForm({ open, onClose, material, onSaved }: { open: boolean; onClose: () => void; material?: Material | null; onSaved: (m: Material) => void }) {
  const editing = !!material;
  const units = useUnits();
  const cats = useCategories();
  const toast = useToast();
  const [f, setF] = useState(() => ({
    code: material?.code ?? '',
    name: material?.name ?? '',
    unitId: material?.unitId ?? '',
    categoryId: material?.categoryId ?? '',
    minimum: decimalToInput(material?.minimum) || '',
    active: material?.active ?? true,
  }));
  const [local, setLocal] = useState<Record<string, string>>({});
  const m = useMutation(async (_k, body: Record<string, unknown>) =>
    editing ? api.patch<{ data: Material }>(`/materials/${material!.id}`, body) : api.post<{ data: Material }>('/materials', body),
  );
  const errs = { ...fieldErrors(m.error), ...local };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const le: Record<string, string> = {};
    if (!f.name.trim()) le.name = 'Ingresá un nombre';
    if (!editing && !f.unitId) le.unitId = 'Elegí la unidad base';
    let minimum: string | undefined;
    if (f.minimum.trim()) {
      const p = parseDecimalInput(f.minimum);
      if (p === null || p.startsWith('-')) le.minimum = 'Mínimo inválido (número ≥ 0, hasta 8 decimales)';
      else minimum = p;
    } else if (editing) minimum = '0';
    setLocal(le);
    if (Object.keys(le).length) return;
    const body = materialBody(editing, f, minimum);
    const r = await m.run(body);
    if (r) {
      toast.success(editing ? 'Los cambios del material se guardaron' : 'Material creado correctamente');
      onSaved(r.data);
    }
  };

  const unitText = (id: string) => {
    const u = (material?.unit && material.unit.id === id ? material.unit : null) ?? units.map.get(id);
    return u ? unitLabel(u) : '…';
  };

  return (
    <Modal
      open={open}
      onClose={m.pending ? () => {} : onClose}
      side
      title={editing ? 'Editar material' : 'Nuevo material'}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button type="submit" form="material-form" loading={m.pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="material-form" className="stack" onSubmit={submit} noValidate>
        <AutoCodeField prefix="MAT" value={editing ? f.code : undefined} />
        <TextField label="Nombre" value={f.name} onChange={set('name')} error={errs.name} maxLength={500} required />
        {editing ? (
          <div className="field">
            <label>Unidad base</label>
            <div className="input muted">{unitText(f.unitId)}</div>
            <span className="hint">La unidad base no se puede cambiar, para no alterar las cantidades ya registradas. Si necesitás otra, creá un material nuevo.</span>
          </div>
        ) : (
          <SelectField
            searchable label="Unidad base"
            value={f.unitId}
            onChange={set('unitId')}
            error={errs.unitId}
            placeholder={units.loading ? 'Cargando…' : 'Elegí la unidad'}
            options={units.rows.map((u) => ({ value: u.id, label: unitLabel(u) }))}
            hint="No se podrá cambiar después. Stock, pedidos y cómputos se expresan en esta unidad."
          />
        )}
        <SelectField
          searchable label="Rubro"
          value={f.categoryId}
          onChange={set('categoryId')}
          error={errs.categoryId}
          placeholder="Sin rubro"
          options={cats.rows.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
        />
        <DecimalField label="Stock mínimo (en unidad base)" value={f.minimum} onChange={set('minimum')} error={errs.minimum} placeholder="0" hint="Opcional. Se usa para alertas de stock." />
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo
        </label>
        {/* Errores 422 que no corresponden a un campo visible (p. ej. unitId en edición) se muestran completos. */}
        <ErrorBox error={m.error && !Object.keys(fieldErrors(m.error)).some((k) => SHOWN.has(k) && !(editing && k === 'unitId')) ? m.error : null} />
      </form>
    </Modal>
  );
}
