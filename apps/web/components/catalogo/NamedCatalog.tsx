'use client';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api';
import { useAll, useMutation } from '@/lib/hooks';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, Modal, TextField, useToast } from '@/components/ui';

type Named = { id: string; code: string; name: string };

/** Listado + alta/edición para catálogos código/nombre (rubros, unidades). */
export function NamedCatalog({ path, title, singular, canEdit, hint, fem }: { path: '/categories' | '/units'; title: string; singular: string; canEdit: boolean; hint?: string; fem?: boolean }) {
  const list = useAll<Named>(path);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Named | 'new' | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = list.rows.filter((r) => !needle || r.code.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)).sort((a, b) => a.code.localeCompare(b.code));
  return (
    <Card
      title={title}
      bodyClass=""
      actions={
        canEdit && (
          <Button size="sm" onClick={() => setEdit('new')}>
            <Plus size={14} /> {fem ? 'Nueva' : 'Nuevo'} {singular}
          </Button>
        )
      }
    >
      <div className="filters" style={{ padding: 12 }}>
        <input className="input" type="search" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`Buscar ${title.toLowerCase()}`} />
        {hint && <span className="small muted">{hint}</span>}
      </div>
      {list.error ? (
        <div style={{ padding: 12 }}>
          <ErrorBox error={list.error} onRetry={list.reload} />
        </div>
      ) : list.loading ? (
        <Loading />
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty={<Empty title={`Sin ${title.toLowerCase()}`} />}
          columns={[
            { key: 'c', header: 'Código', render: (r) => <span className="mono">{r.code}</span> },
            { key: 'n', header: 'Nombre', render: (r) => r.name },
            ...(canEdit
              ? [
                  {
                    key: 'a',
                    header: '',
                    align: 'r' as const,
                    render: (r: Named) => (
                      <Button size="sm" variant="ghost" onClick={() => setEdit(r)} aria-label={`Editar ${r.name}`}>
                        <Pencil size={14} /> Editar
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          mobile={(r) => (
            <div className="row">
              <span className="mono">{r.code}</span>
              <span style={{ flex: 1 }}>{r.name}</span>
              {canEdit && (
                <Button size="sm" variant="sec" onClick={() => setEdit(r)}>
                  Editar
                </Button>
              )}
            </div>
          )}
        />
      )}
      {edit && (
        <NamedForm
          path={path}
          singular={singular}
          fem={fem}
          item={edit === 'new' ? null : edit}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            list.reload();
          }}
        />
      )}
    </Card>
  );
}

function NamedForm({ path, singular, fem, item, onClose, onSaved }: { path: string; singular: string; fem?: boolean; item: Named | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ code: item?.code ?? '', name: item?.name ?? '' });
  const [local, setLocal] = useState<Record<string, string>>({});
  const m = useMutation(async (_k, body: { code: string; name: string }) => (item ? api.patch(`${path}/${item.id}`, body) : api.post(path, body)));
  const errs = { ...fieldErrors(m.error), ...local };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const le: Record<string, string> = {};
    if (!f.code.trim()) le.code = 'Ingresá un código';
    if (!f.name.trim()) le.name = 'Ingresá un nombre';
    setLocal(le);
    if (Object.keys(le).length) return;
    const r = await m.run({ code: f.code.trim(), name: f.name.trim() });
    if (r) {
      const S = `${singular[0].toUpperCase()}${singular.slice(1)}`;
      toast(`${S} ${item ? 'actualizad' : 'cread'}${fem ? 'a' : 'o'}`);
      onSaved();
    }
  };
  return (
    <Modal
      open
      title={item ? `Editar ${singular}` : `${fem ? 'Nueva' : 'Nuevo'} ${singular}`}
      onClose={m.pending ? () => {} : onClose}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={m.pending}>
            Cancelar
          </Button>
          <Button type="submit" form="named-form" loading={m.pending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="named-form" className="stack" onSubmit={submit} noValidate>
        <TextField label="Código" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} error={errs.code} maxLength={500} />
        <TextField label="Nombre" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errs.name} maxLength={500} />
        <ErrorBox error={m.error && Object.keys(fieldErrors(m.error)).length === 0 ? m.error : null} />
      </form>
    </Modal>
  );
}
