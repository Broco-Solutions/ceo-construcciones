'use client';
import { unitSymbol } from '@/lib/units';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { formatQty, parseDecimalInput } from '@/lib/format';
import { Button, DecimalField, ErrorBox, Modal, fieldErrors, useToast } from '@/components/ui';
import type { Schemas } from '@/lib/api';
import { MaterialPicker } from '@/components/catalogo/MaterialPicker';
import { LocationSelect, MIN_SOURCE_LABEL, type Loc, type Mat } from './common';

/** PUT /stock/{locationId}/minimum (Gerencia/Compras). */
export function MinimumModal({
  initial,
  current,
  locations,
  materials,
  onClose,
  onSaved,
}: {
  initial: { locationId: string; materialId: string };
  /** Saldo actual (si se abrió desde una fila) para mostrar el mínimo efectivo y su origen. */
  current?: Pick<Schemas['Stock'], 'minimum' | 'minimumSource' | 'locationId' | 'materialId'>;
  locations: Loc[];
  materials: Mat[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [locationId, setLocationId] = useState(initial.locationId);
  const [materialId, setMaterialId] = useState(initial.materialId);
  const [mode, setMode] = useState<'set' | 'inherit'>('set');
  const [value, setValue] = useState(current?.minimumSource === 'LOCATION' ? current.minimum : '');
  const cur = current && current.locationId === locationId && current.materialId === materialId ? current : undefined;
  const [local, setLocal] = useState<Record<string, string>>({});
  const mat = materials.find((m) => m.id === materialId);
  const m = useMutation((_key: string, body: { materialId: string; minimum: string | null }) => api.put(`/stock/${locationId}/minimum`, body));
  const fe = { ...fieldErrors(m.error), ...local };

  const submit = async () => {
    const errs: Record<string, string> = {};
    if (!locationId) errs.locationId = 'Elegí una ubicación.';
    if (!materialId) errs.materialId = 'Elegí un material.';
    let minimum: string | null = null;
    if (mode === 'set') {
      minimum = parseDecimalInput(value);
      if (minimum === null || minimum.startsWith('-')) errs.minimum = 'Ingresá una cantidad válida (0 o mayor).';
    }
    setLocal(errs);
    if (Object.keys(errs).length) return;
    const r = await m.run({ materialId, minimum });
    if (r) {
      toast.success(mode === 'inherit' ? 'La ubicación vuelve a usar el mínimo del material' : 'Stock mínimo actualizado');
      onSaved();
    }
  };

  return (
    <Modal
      open
      side
      onClose={m.pending ? () => {} : onClose}
      title="Configurar mínimo por ubicación"
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={m.pending}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="note">
        El mínimo general se define en el material{mat ? ` (${formatQty(mat.minimum, unitSymbol(mat.unit))})` : ''} y se hereda en todas las ubicaciones. Acá podés
        fijar un mínimo propio para una ubicación. <b>Un valor 0 desactiva el mínimo heredado en esa ubicación</b> (no genera alerta). Quitar el mínimo propio
        vuelve a usar el del material. No genera reposición automática.
      </div>
      {cur && (
        <p className="small" data-testid="minimum-current">
          Mínimo efectivo actual:{' '}
          <b>{cur.minimumSource === 'NONE' ? 'sin mínimo' : `${formatQty(cur.minimum, unitSymbol(mat?.unit))} (${MIN_SOURCE_LABEL[cur.minimumSource].label})`}</b>
        </p>
      )}
      <LocationSelect label="Ubicación" value={locationId} onChange={setLocationId} locations={locations} error={fe.locationId} />
      <MaterialPicker value={materialId || null} onChange={(pm) => setMaterialId(pm?.id ?? '')} error={fe.materialId} />
      <div className="row" role="radiogroup" aria-label="Tipo de mínimo" style={{ gap: 16, flexWrap: 'wrap' }}>
        <label className="row" style={{ gap: 6 }}>
          <input type="radio" checked={mode === 'set'} onChange={() => setMode('set')} /> Definir mínimo propio
        </label>
        <label className="row" style={{ gap: 6 }}>
          <input type="radio" checked={mode === 'inherit'} onChange={() => setMode('inherit')} /> Quitar mínimo propio (usar el del material)
        </label>
      </div>
      {mode === 'set' && (
        <DecimalField label={`Mínimo${mat?.unit ? ` (${unitSymbol(mat.unit)})` : ''}`} value={value} onChange={(e) => setValue(e.target.value)} error={fe.minimum} hint="0 desactiva la alerta en esta ubicación." />
      )}
      <ErrorBox error={m.error} />
    </Modal>
  );
}
