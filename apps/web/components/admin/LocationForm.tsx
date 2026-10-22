'use client';
import { useEffect, useState } from 'react';
import { api, type Schemas } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { Button, ErrorBox, GeneratedCode, Modal, SelectField, TextField, fieldErrors, useToast } from '@/components/ui';

type Loc = Schemas['Location'];

/** Alta de galpón/patio o edición (código, nombre, activo). Las ubicaciones de obra se crean con la obra. */
export function LocationForm({ open, loc, onClose, onSaved }: { open: boolean; loc?: Loc; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'WAREHOUSE' | 'YARD'>('WAREHOUSE');
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (!open) return;
    setName(loc?.name ?? '');
    setKind(loc?.kind === 'YARD' ? 'YARD' : 'WAREHOUSE');
    setActive(loc?.active ?? true);
  }, [open, loc]);
  const save = useMutation((_k: string) =>
    loc ? api.patch(`/locations/${loc.id}`, { name: name.trim(), active }) : api.post('/locations', { name: name.trim(), kind }),
  );
  const fe = fieldErrors(save.error);
  const close = () => {
    save.reset();
    onClose();
  };
  return (
    <Modal open={open} onClose={close} side title={loc ? `Editar ${loc.code}` : 'Nueva ubicación'}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save.run()) {
            toast(loc ? 'Ubicación actualizada' : 'Ubicación creada');
            onSaved();
            close();
          }
        }}
      >
        <GeneratedCode current={loc?.code} example={kind === "WAREHOUSE" ? "GAL-001" : "PAT-001"} />
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required error={fe.name} />
        {!loc && (
          <SelectField label="Tipo" value={kind} onChange={(e) => setKind(e.target.value as 'WAREHOUSE' | 'YARD')} options={[{ value: 'WAREHOUSE', label: 'Galpón' }, { value: 'YARD', label: 'Patio' }]} error={fe.kind} />
        )}
        {loc && (
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Ubicación activa
          </label>
        )}
        <ErrorBox error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="sec" onClick={close} disabled={save.pending}>Cancelar</Button>
          <Button type="submit" loading={save.pending}>{loc ? 'Guardar' : 'Crear ubicación'}</Button>
        </div>
      </form>
    </Modal>
  );
}
