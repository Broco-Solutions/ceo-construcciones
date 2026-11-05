'use client';
import { useEffect, useMemo, useState } from 'react';
import { api, type Schemas, type Role } from '@/lib/api';
import { useAll, useApi, useMutation } from '@/lib/hooks';
import { ROLE_LABEL } from '@/lib/permissions';
import { Button, ErrorBox, Field, Loading, Modal, SelectField, TextField, fieldErrors, useToast } from '@/components/ui';

type User = Schemas['User'];
const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as Role[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

/** Alta (con contraseña) o edición (nombre/rol/activo/contraseña opcional) de usuario. */
export function UserForm({ open, user, onClose, onSaved }: { open: boolean; user?: User; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('JEFE_OBRA');
  const [active, setActive] = useState(true);
  const [password, setPassword] = useState('');
  useEffect(() => {
    if (!open) return;
    setEmail(user?.email ?? '');
    setName(user?.name ?? '');
    setRole(user?.role ?? 'JEFE_OBRA');
    setActive(user?.active ?? true);
    setPassword('');
  }, [open, user]);
  const save = useMutation(async (_k: string) => {
    if (user) {
      const body: Schemas['UserPatch'] = { name: name.trim(), role, active };
      if (password) body.password = password;
      return api.patch(`/users/${user.id}`, body);
    }
    return api.post('/users', { email: email.trim(), name: name.trim(), role, password } satisfies Schemas['UserInput']);
  });
  const fe = fieldErrors(save.error);
  const close = () => {
    save.reset();
    onClose();
  };
  return (
    <Modal open={open} onClose={close} side title={user ? `Editar ${user.name}` : 'Nuevo usuario'}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save.run()) {
            toast.success(user ? 'Los cambios del usuario se guardaron' : 'Usuario creado correctamente');
            onSaved();
            close();
          }
        }}
      >
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!user} error={fe.email} autoComplete="off" />
        <TextField label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} error={fe.name} />
        <SelectField label="Rol" value={role} onChange={(e) => setRole(e.target.value as Role)} options={ROLE_OPTIONS} error={fe.role} />
        <TextField
          label={user ? 'Nueva contraseña (opcional)' : 'Contraseña'}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!user}
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          hint="Mínimo 8 caracteres. Comunicala al usuario por un canal seguro."
          error={fe.password}
        />
        {user && (
          <label className="row" style={{ gap: 8 }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Usuario activo
          </label>
        )}
        <ErrorBox error={save.error} />
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button variant="sec" onClick={close} disabled={save.pending}>Cancelar</Button>
          <Button type="submit" loading={save.pending}>{user ? 'Guardar' : 'Crear usuario'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Asignación de obras a un usuario (PUT reemplaza el conjunto completo). */
export function AssignmentsForm({ user, onClose }: { user?: User; onClose: () => void }) {
  const toast = useToast();
  const current = useApi<{ data: { workId: string }[] }>(user ? `/users/${user.id}/assignments` : null);
  const works = useAll<Schemas['WorkList']>(user ? '/works' : null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  useEffect(() => {
    if (current.data) setSel(new Set(current.data.data.map((a) => a.workId)));
  }, [current.data]);
  const save = useMutation((_k: string) => api.put(`/users/${user!.id}/assignments`, { workIds: [...sel] }));
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return works.rows.filter((w) => !t || w.name.toLowerCase().includes(t) || w.code.toLowerCase().includes(t));
  }, [works.rows, q]);
  const close = () => {
    save.reset();
    onClose();
  };
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <Modal open={!!user} onClose={close} side title={`Obras de ${user?.name ?? ''}`}>
      {user?.role !== 'JEFE_OBRA' && <div className="note">Las asignaciones limitan el acceso sólo para Jefe de Obra; los demás roles ven todas las obras.</div>}
      {current.loading || works.loading ? (
        <Loading />
      ) : (
        <>
          <ErrorBox error={current.error ?? works.error} onRetry={() => (current.reload(), works.reload())} />
          <TextField label="Buscar obra" value={q} onChange={(e) => setQ(e.target.value)} />
          <Field label={`Obras asignadas (${sel.size})`}>
            <div className="stack" style={{ gap: 6, maxHeight: '50vh', overflowY: 'auto' }}>
              {shown.map((w) => (
                <label key={w.id} className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={sel.has(w.id)} onChange={() => toggle(w.id)} />
                  <span className="mono">{w.code}</span> {w.name}
                </label>
              ))}
              {shown.length === 0 && <span className="muted small">No hay obras.</span>}
            </div>
          </Field>
        </>
      )}
      <ErrorBox error={save.error} />
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button variant="sec" onClick={close} disabled={save.pending}>Cancelar</Button>
        <Button
          loading={save.pending}
          disabled={!current.data}
          onClick={async () => {
            if (await save.run()) {
              toast.success('Obras asignadas guardadas');
              close();
            }
          }}
        >
          Guardar asignaciones
        </Button>
      </div>
    </Modal>
  );
}
