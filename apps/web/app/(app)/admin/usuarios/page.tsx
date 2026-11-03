'use client';
import { useState } from 'react';
import { Building2, Pencil, Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  Pill,
} from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { ROLE_LABEL } from '@/lib/permissions';
import { formatDate } from '@/lib/format';
import type { Schemas } from '@/lib/api';
import { AssignmentsForm, UserForm } from '@/components/admin/UserForm';
import { DelegationsForm } from '@/components/admin/DelegationsForm';

type User = Schemas['User'];

export default function UsuariosPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('adminUsers')}>
      <Usuarios />
    </RequirePerm>
  );
}

function Usuarios() {
  const list = usePaged<User>('/users', {}, 50);
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  const [assign, setAssign] = useState<User | undefined>();
  const [delegate, setDelegate] = useState<User | undefined>();
  const actions = (u: User) => (
    <div
      className="row"
      style={{ gap: 6 }}
      onClick={(e) => e.stopPropagation()}
    >
      <Button size="sm" variant="sec" onClick={() => setEdit(u)}>
        <Pencil /> Editar
      </Button>
      <Button size="sm" variant="sec" onClick={() => setAssign(u)}>
        <Building2 /> Obras
      </Button>
      <Button size="sm" variant="sec" onClick={() => setDelegate(u)}>
        Recepciones
      </Button>
    </div>
  );
  return (
    <Page
      title="Usuarios"
      crumb="Administración"
      actions={
        <Button onClick={() => setEdit('new')}>
          <Plus /> Nuevo usuario
        </Button>
      }
    >
      <Card bodyClass="">
        {list.error ? (
          <div className="bd">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.rows}
            rowKey={(u) => u.id}
            columns={[
              {
                key: 'n',
                header: 'Nombre',
                render: (u) => <b className="ink">{u.name}</b>,
              },
              { key: 'e', header: 'Email', render: (u) => u.email },
              { key: 'r', header: 'Rol', render: (u) => ROLE_LABEL[u.role] },
              {
                key: 'a',
                header: 'Estado',
                render: (u) =>
                  u.active ? (
                    <Pill tone="ok">Activo</Pill>
                  ) : (
                    <Pill tone="bad">Inactivo</Pill>
                  ),
              },
              {
                key: 'c',
                header: 'Alta',
                hideMobile: true,
                render: (u) => formatDate(u.createdAt),
              },
              { key: 'x', header: '', render: actions },
            ]}
            mobile={(u) => (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row">
                  <b className="ink" style={{ flex: 1 }}>
                    {u.name}
                  </b>
                  {u.active ? (
                    <Pill tone="ok">Activo</Pill>
                  ) : (
                    <Pill tone="bad">Inactivo</Pill>
                  )}
                </div>
                <span className="small muted">
                  {u.email} · {ROLE_LABEL[u.role]}
                </span>
                {actions(u)}
              </div>
            )}
            empty={<Empty title="No hay usuarios" />}
          />
        )}
        <PagerBar
          pagination={list.pagination}
          page={list.page}
          setPage={list.setPage}
        />
      </Card>
      <UserForm
        open={edit !== null}
        user={edit === 'new' || edit === null ? undefined : edit}
        onClose={() => setEdit(null)}
        onSaved={list.reload}
      />
      <AssignmentsForm user={assign} onClose={() => setAssign(undefined)} />
      <DelegationsForm user={delegate} onClose={() => setDelegate(undefined)} />
    </Page>
  );
}
