'use client';
import { useEffect, useState } from 'react';
import { api, type Schemas } from '@/lib/api';
import { useAll, useMutation } from '@/lib/hooks';
import { Button, ErrorBox, Modal, SelectField, TextField, fieldErrors, useToast } from '@/components/ui';
import { WORK_STATUS_OPTIONS } from './labels';
import { AutoCodeField, AUTO_CODE } from '@/components/AutoCodeField';

type Work = Schemas['WorkList'];

/** Alta/edición de obra (sólo Gerencia). `work` undefined = alta. */
export function WorkForm({ open, work, onClose, onSaved }: { open: boolean; work?: Work; onClose: () => void; onSaved: (w: Schemas['Work']) => void }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Schemas['WorkStatus']>('ACTIVE');
  const [managerId, setManagerId] = useState('');
  const users = useAll<Schemas['User']>(open ? '/users' : null);
  useEffect(() => {
    if (!open) return;
    setCode(work?.code ?? '');
    setName(work?.name ?? '');
    setStatus(work?.status ?? 'ACTIVE');
    setManagerId(work?.managerId ?? '');
  }, [open, work]);
  const save = useMutation(async (_key: string) => {
    const body = { code: work ? code.trim() : AUTO_CODE, name: name.trim(), status, managerId: managerId || null };
    const r = work
      ? await api.patch<{ data: Schemas['Work'] }>(`/works/${work.id}`, body)
      : await api.post<{ data: Schemas['Work'] }>('/works', body);
    return r.data;
  });
  const fe = fieldErrors(save.error);
  const close = () => {
    save.reset();
    onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const w = await save.run();
    if (w) {
      toast(work ? 'Obra actualizada' : 'Obra creada');
      onSaved(w);
      close();
    }
  };
  const managers = users.rows.filter((u) => u.active && (u.role === 'JEFE_OBRA' || u.role === 'GERENCIA' || u.id === managerId));
  return (
    <Modal open={open} onClose={close} side title={work ? `Editar obra ${work.code}` : 'Nueva obra'}>
      <form className="stack" onSubmit={submit}>
        <AutoCodeField prefix="OBR" value={work ? code : undefined} />
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required maxLength={500} error={fe.name} />
        <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value as Schemas['WorkStatus'])} options={WORK_STATUS_OPTIONS} error={fe.status} />
        <SelectField
          label="Responsable"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          placeholder={users.loading ? 'Cargando usuarios…' : 'Sin responsable'}
          options={managers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
          error={fe.managerId}
          hint="El responsable no otorga acceso: asigná la obra al usuario desde Administración > Usuarios."
        />
        {!work && <div className="note">Al crear la obra se genera automáticamente su ubicación de stock.</div>}
        <ErrorBox error={users.error} onRetry={users.reload} />
        <ErrorBox error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="sec" onClick={close} disabled={save.pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.pending}>
            {work ? 'Guardar cambios' : 'Crear obra'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
