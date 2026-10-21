'use client';
import { useState } from 'react';
import { api, fieldErrors } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { Button, ErrorBox, Modal, TextArea, TextField, useToast } from '@/components/ui';
import { orNull, type Supplier } from './common';

export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: Supplier | null; onClose: () => void; onSaved: (s: Supplier) => void }) {
  const toast = useToast();
  const editing = !!supplier;
  const [f, setF] = useState({
    code: supplier?.code ?? '',
    name: supplier?.name ?? '',
    taxId: supplier?.taxId ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
    active: supplier?.active ?? true,
  });
  const [local, setLocal] = useState<Record<string, string>>({});
  const m = useMutation(async (_k, body: Record<string, unknown>) =>
    editing ? api.patch<{ data: Supplier }>(`/suppliers/${supplier!.id}`, body) : api.post<{ data: Supplier }>('/suppliers', body),
  );
  const errs = { ...fieldErrors(m.error), ...local };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const le: Record<string, string> = {};
    if (!f.code.trim()) le.code = 'Ingresá un código';
    if (!f.name.trim()) le.name = 'Ingresá la razón social o nombre';
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) le.email = 'Email inválido';
    setLocal(le);
    if (Object.keys(le).length) return;
    const r = await m.run({
      code: f.code.trim(),
      name: f.name.trim(),
      taxId: orNull(f.taxId),
      email: orNull(f.email),
      phone: orNull(f.phone),
      address: orNull(f.address),
      notes: orNull(f.notes),
      active: f.active,
    });
    if (r) {
      toast(editing ? 'Proveedor actualizado' : 'Proveedor creado');
      onSaved(r.data);
    }
  };
  return (
    <Modal
      open
      side
      title={editing ? 'Editar proveedor' : 'Nuevo proveedor'}
      onClose={m.pending ? () => {} : onClose}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button type="submit" form="supplier-form" loading={m.pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="supplier-form" className="stack" onSubmit={submit} noValidate>
        <TextField label="Código" value={f.code} onChange={set('code')} error={errs.code} maxLength={500} />
        <TextField label="Nombre / razón social" value={f.name} onChange={set('name')} error={errs.name} maxLength={500} />
        <TextField label="CUIT" value={f.taxId} onChange={set('taxId')} error={errs.taxId} maxLength={500} placeholder="30-12345678-9" />
        <TextField label="Email" type="email" value={f.email} onChange={set('email')} error={errs.email} />
        <TextField label="Teléfono" type="tel" value={f.phone} onChange={set('phone')} error={errs.phone} maxLength={500} />
        <TextField label="Dirección" value={f.address} onChange={set('address')} error={errs.address} maxLength={500} />
        <TextArea label="Notas" value={f.notes} onChange={set('notes')} error={errs.notes} maxLength={4000} rows={3} />
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo
        </label>
        <ErrorBox error={m.error && Object.keys(fieldErrors(m.error)).length === 0 ? m.error : null} />
      </form>
    </Modal>
  );
}
