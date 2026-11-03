'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  BarChart3,
  FileSpreadsheet,
  Pencil,
  ShoppingCart,
  Warehouse,
} from 'lucide-react';
import { Page } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  DefList,
  Empty,
  ErrorBox,
  Loading,
  Mono,
  Pill,
} from '@/components/ui';
import { useAll, useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/permissions';
import type { Schemas } from '@/lib/api';
import { LOCATION_KIND, WorkStatusPill } from '@/components/obras/labels';
import { WorkForm } from '@/components/obras/WorkForm';

export default function ObraDetalle() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const manage = can('manageWorks');
  const [edit, setEdit] = useState(false);
  const w = useApi<{ data: Schemas['WorkDetail'] }>(`/works/${id}`);
  // Sólo Gerencia puede listar usuarios: se resuelven nombres de asignados y responsable.
  const users = useAll<Schemas['User']>(can('adminUsers') ? '/users' : null);
  const byId = useMemo(
    () => new Map(users.rows.map((u) => [u.id, u])),
    [users.rows],
  );

  if (w.error)
    return (
      <Page title="Obra" crumb={<Link href="/obras">Obras</Link>}>
        <ErrorBox error={w.error} onRetry={w.reload} />
      </Page>
    );
  if (!w.data)
    return (
      <Page title="Obra" crumb={<Link href="/obras">Obras</Link>}>
        <Loading />
      </Page>
    );
  const work = w.data.data;
  const loc = work.location;
  const manager = work.managerId ? byId.get(work.managerId) : undefined;
  const assigned = work.assignments.map((a) => ({
    userId: a.userId,
    user: byId.get(a.userId),
  }));

  const links = [
    can('readEconomic') && {
      href: `/presupuestos?workId=${work.id}`,
      label: 'Presupuestos',
      icon: FileSpreadsheet,
    },
    {
      href: `/pedidos?workId=${work.id}`,
      label: 'Pedidos',
      icon: ShoppingCart,
    },
    loc && {
      href: `/stock?locationId=${loc.id}`,
      label: 'Stock de la obra',
      icon: Warehouse,
    },
    can('reports') && {
      href: `/reportes?workId=${work.id}`,
      label: 'Seguimiento de materiales',
      icon: BarChart3,
    },
  ].filter(Boolean) as {
    href: string;
    label: string;
    icon: typeof Warehouse;
  }[];

  return (
    <Page
      title={work.name}
      crumb={
        <>
          <Link href="/obras">Obras</Link> / <Mono>{work.code}</Mono>
        </>
      }
      actions={
        manage && (
          <Button variant="sec" onClick={() => setEdit(true)}>
            <Pencil /> Editar
          </Button>
        )
      }
    >
      <div className="grid2">
        <div className="stack">
          <Card title="Datos de la obra">
            <DefList
              items={[
                ['Código', <Mono key="c">{work.code}</Mono>],
                ['Estado', <WorkStatusPill key="s" status={work.status} />],
                [
                  'Cliente',
                  work.client ? (
                    can('readClients') ? (
                      <Link href={`/clientes/${work.client.id}`}>
                        {work.client.name}
                      </Link>
                    ) : (
                      work.client.name
                    )
                  ) : (
                    'Cliente sin vincular'
                  ),
                ],
                ['Dirección', work.address ?? 'No informada'],
                [
                  'Responsable',
                  work.managerId
                    ? manager
                      ? manager.name
                      : manage
                        ? 'Usuario no encontrado'
                        : 'Asignado'
                    : 'Sin responsable',
                ],
                ['Alta', formatDateTime(work.createdAt)],
                ['Última modificación', formatDateTime(work.updatedAt)],
              ]}
            />
          </Card>
          <Card title="Ubicación de stock">
            {loc ? (
              <DefList
                items={[
                  ['Código', <Mono key="c">{loc.code}</Mono>],
                  ['Nombre', loc.name],
                  ['Tipo', LOCATION_KIND[loc.kind]],
                  [
                    'Estado',
                    loc.active ? (
                      <Pill key="a" tone="ok">
                        Activa
                      </Pill>
                    ) : (
                      <Pill key="a">Inactiva</Pill>
                    ),
                  ],
                ]}
              />
            ) : (
              <Empty title="La obra no tiene ubicación de stock" />
            )}
          </Card>
        </div>
        <div className="stack">
          <Card title="Presupuesto de referencia" id="obra-referencia">
            {work.referenceVersionId ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="small" data-testid="obra-ref-estado">
                  La obra tiene una versión de presupuesto de referencia
                  vigente.
                </p>
                {can('readEconomic') ? (
                  <Link
                    href={`/presupuestos/versiones/${work.referenceVersionId}`}
                    className="btn sec"
                    data-testid="obra-ref-version"
                  >
                    <FileSpreadsheet /> Ver versión de referencia
                  </Link>
                ) : (
                  <Link
                    href={`/reportes?workId=${work.id}`}
                    className="btn sec"
                    data-testid="obra-ref-materiales"
                  >
                    <BarChart3 /> Materiales previstos (sin importes)
                  </Link>
                )}
              </div>
            ) : (
              <p className="small muted" data-testid="obra-ref-estado">
                Sin versión de referencia seleccionada: no hay materiales
                previstos para comparar.
              </p>
            )}
          </Card>
          <Card title="Accesos">
            <div className="stack" style={{ gap: 8 }}>
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="btn sec lg"
                  style={{ justifyContent: 'flex-start' }}
                >
                  <l.icon /> {l.label}
                </Link>
              ))}
            </div>
          </Card>
          {manage && (
            <Card
              title={`Usuarios asignados (${assigned.length})`}
              bodyClass=""
            >
              {users.error && (
                <div className="bd">
                  <ErrorBox error={users.error} onRetry={users.reload} />
                </div>
              )}
              <DataTable
                rows={assigned}
                rowKey={(a) => a.userId}
                columns={[
                  {
                    key: 'n',
                    header: 'Usuario',
                    render: (a) =>
                      a.user ? (
                        <b className="ink">{a.user.name}</b>
                      ) : (
                        <Mono>{a.userId}</Mono>
                      ),
                  },
                  {
                    key: 'r',
                    header: 'Rol',
                    render: (a) => (a.user ? ROLE_LABEL[a.user.role] : '—'),
                  },
                  {
                    key: 'e',
                    header: 'Email',
                    hideMobile: true,
                    render: (a) => a.user?.email ?? '—',
                  },
                ]}
                empty={
                  <Empty title="Sin usuarios asignados">
                    {manage && 'Asigná obras desde Administración > Usuarios.'}
                  </Empty>
                }
              />
              {manage && (
                <div className="bd">
                  <Link href="/admin/usuarios" className="btn sec sm">
                    Gestionar asignaciones
                  </Link>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
      {manage && (
        <WorkForm
          open={edit}
          work={work}
          onClose={() => setEdit(false)}
          onSaved={() => w.reload()}
        />
      )}
    </Page>
  );
}
