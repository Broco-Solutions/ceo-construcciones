'use client';

import { useEffect, useState } from 'react';
import { api, type Schemas } from '@/lib/api';
import {
  Button,
  ErrorBox,
  Modal,
  TextField,
  fieldErrors,
  useToast,
} from '@/components/ui';
import { AutoCodeField, AUTO_CODE } from '@/components/AutoCodeField';
import { useMutation } from '@/lib/hooks';

type Client = Schemas['Client'];

export function ClientForm({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean;
  client?: Client;
  onClose: () => void;
  onSaved: (client: Client) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    code: '',
    name: '',
    taxId: '',
    contact: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  });
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (open) setActive(client?.active ?? true);
  }, [open, client]);
  useEffect(() => {
    if (open)
      setV({
        code: client?.code ?? '',
        name: client?.name ?? '',
        taxId: client?.taxId ?? '',
        contact: client?.contact ?? '',
        phone: client?.phone ?? '',
        email: client?.email ?? '',
        address: client?.address ?? '',
        notes: client?.notes ?? '',
      });
  }, [open, client]);
  const save = useMutation(async () => {
    const body = {
      code: client ? v.code.trim() : AUTO_CODE,
      name: v.name.trim(),
      taxId: v.taxId.trim() || null,
      contact: v.contact.trim() || null,
      phone: v.phone.trim() || null,
      email: v.email.trim() || null,
      address: v.address.trim() || null,
      notes: v.notes.trim() || null,
    };
    const r = client
      ? await api.patch<{ data: Client }>(`/clients/${client.id}`, {
          ...body,
          active,
        })
      : await api.post<{ data: Client }>('/clients', body);
    return r.data;
  });
  const set =
    (key: keyof typeof v) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setV((old) => ({ ...old, [key]: e.target.value }));
  const close = () => {
    save.reset();
    onClose();
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await save.run();
    if (result) {
      toast.success(client ? 'Cliente actualizado' : 'Cliente creado');
      onSaved(result);
      close();
    }
  };
  const fe = fieldErrors(save.error);
  return (
    <Modal
      open={open}
      onClose={close}
      side
      title={client ? `Editar cliente ${client.code}` : 'Nuevo cliente'}
    >
      <form className="stack" onSubmit={submit}>
        <AutoCodeField prefix="CLI" value={client?.code} />
        <TextField
          label="Nombre o razón social"
          value={v.name}
          onChange={set('name')}
          required
          maxLength={500}
          error={fe.name}
        />
        <TextField
          label="CUIT (opcional)"
          value={v.taxId}
          onChange={set('taxId')}
          maxLength={100}
          error={fe.taxId}
          hint="Si se informa, debe ser único."
        />
        <TextField
          label="Contacto"
          value={v.contact}
          onChange={set('contact')}
          maxLength={500}
          error={fe.contact}
        />
        <TextField
          label="Teléfono"
          value={v.phone}
          onChange={set('phone')}
          maxLength={100}
          error={fe.phone}
        />
        <TextField
          label="Email"
          type="email"
          value={v.email}
          onChange={set('email')}
          maxLength={500}
          error={fe.email}
        />
        <TextField
          label="Dirección"
          value={v.address}
          onChange={set('address')}
          maxLength={500}
          error={fe.address}
        />
        {client && (
          <label className="row">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />{' '}
            Cliente activo
          </label>
        )}
        <div className="field">
          <label htmlFor="client-notes">Observaciones</label>
          <textarea
            id="client-notes"
            className="input"
            rows={3}
            value={v.notes}
            onChange={set('notes')}
            maxLength={4000}
          />
        </div>
        <ErrorBox error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="sec" onClick={close} disabled={save.pending}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.pending}>
            {client ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
