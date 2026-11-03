'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  DefList,
  Empty,
  ErrorBox,
  Loading,
  Mono,
} from '@/components/ui';
import { useApi } from '@/lib/hooks';
import type { Schemas } from '@/lib/api';
import { ClientForm } from '@/components/clientes/ClientForm';
import { WorkStatusPill } from '@/components/obras/labels';
import { useSession } from '@/lib/session';
import { WorkForm } from '@/components/obras/WorkForm';

type ClientDetail = Schemas['ClientDetail'];
export default function ClientDetailPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readClients')}>
      <ClientDetailInner />
    </RequirePerm>
  );
}
function ClientDetailInner() {
  const { can } = useSession();
  const [newWork, setNewWork] = useState(false);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const query = useApi<{ data: ClientDetail }>(`/clients/${id}`);
  const client = query.data?.data;
  if (query.error)
    return (
      <Page title="Cliente" crumb={<Link href="/clientes">Clientes</Link>}>
        <ErrorBox error={query.error} onRetry={query.reload} />
      </Page>
    );
  if (!client)
    return (
      <Page title="Cliente" crumb={<Link href="/clientes">Clientes</Link>}>
        <Loading />
      </Page>
    );
  return (
    <Page
      title={client.name}
      crumb={
        <>
          <Link href="/clientes">Clientes</Link> / <Mono>{client.code}</Mono>
        </>
      }
      actions={
        <>
          {can('editClients') && (
            <Button variant="sec" onClick={() => setEdit(true)}>
              <Pencil /> Editar
            </Button>
          )}
          {can('manageWorks') && client.active && (
            <Button onClick={() => setNewWork(true)}>
              <Plus /> Nueva obra
            </Button>
          )}
        </>
      }
    >
      <div className="grid2">
        <Card title="Datos del cliente">
          <DefList
            items={[
              ['CUIT', client.taxId ?? 'No informado'],
              ['Contacto', client.contact ?? '—'],
              ['Teléfono', client.phone ?? '—'],
              ['Email', client.email ?? '—'],
              ['Dirección', client.address ?? '—'],
              ['Observaciones', client.notes ?? '—'],
            ]}
          />
        </Card>
        <Card title={`Obras (${client.works.length})`} bodyClass="">
          <DataTable
            rows={client.works}
            rowKey={(w) => w.id}
            onRowClick={(w) => router.push(`/obras/${w.id}`)}
            columns={[
              {
                key: 'code',
                header: 'Código',
                render: (w) => <Mono>{w.code}</Mono>,
              },
              { key: 'name', header: 'Obra', render: (w) => <b>{w.name}</b> },
              {
                key: 'status',
                header: 'Estado',
                render: (w) => <WorkStatusPill status={w.status} />,
              },
            ]}
            mobile={(w) => (
              <div>
                <b>{w.name}</b>
                <span className="small muted"> · {w.code}</span>
              </div>
            )}
            empty={
              <Empty title="Este cliente todavía no tiene obras">
                Podés vincularlo al crear la próxima obra.
              </Empty>
            }
          />
        </Card>
      </div>
      <Card title="Presupuestos del cliente">
        {client.works.flatMap((w) =>
          w.budgets.map((b) => (
            <p key={b.id}>
              <Link href={`/presupuestos/${b.id}`}>{b.name}</Link> · {w.name}
            </p>
          )),
        )}
      </Card>
      <ClientForm
        open={edit}
        client={client}
        onClose={() => setEdit(false)}
        onSaved={() => {
          setEdit(false);
          query.reload();
        }}
      />
      <WorkForm
        open={newWork}
        defaultClientId={client.id}
        onClose={() => setNewWork(false)}
        onSaved={() => {
          setNewWork(false);
          query.reload();
        }}
      />
    </Page>
  );
}
