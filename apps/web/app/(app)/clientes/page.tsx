'use client';
import { useAppRouter } from '@/lib/navigation';

import { EntitySearch } from '@/components/EntitySearch';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  Mono,
  PagerBar,
} from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useDebounced } from '@/components/catalogo/common';
import { ClientForm } from '@/components/clientes/ClientForm';
import type { Schemas } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function ClientesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readClients')}>
      <Clients />
    </RequirePerm>
  );
}
function Clients() {
  const { can } = useSession();
  const router = useAppRouter();
  const [q, setQ] = useState('');
  const [entityId,setEntityId]=useState('');
  const [open, setOpen] = useState(false);
  const search = useDebounced(q.trim());
  const list = usePaged<Schemas['Client']>(
    '/clients',
    { q: search || undefined, id:entityId||undefined },
    50,
  );
  return (
    <Page
      title="Clientes"
      actions={
        can('editClients') && (
          <Button onClick={() => setOpen(true)}>
            <Plus /> Nuevo cliente
          </Button>
        )
      }
    >
      <Card bodyClass="">
        <div className="filters">
          <EntitySearch inputId="client-search" resource="clients" text={q} id={entityId} placeholder="Nombre, CUIT o código" onChange={(q,id)=>{setQ(q);setEntityId(id);}}/>
        </div>
        {list.error ? (
          <div className="bd">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable collection={{resource:"clients",filters:{q:search||undefined,id:entityId||undefined},total:list.pagination?.total,reload:list.reload}}
            rows={list.rows}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/clientes/${c.id}`)}
            columns={[
              {
                key: 'code',
                header: 'Código',
                render: (c) => <Mono>{c.code}</Mono>,
              },
              {
                key: 'name',
                header: 'Cliente',
                render: (c) => <b>{c.name}</b>,
              },
              {
                key: 'tax',
                header: 'CUIT',
                hideMobile: true,
                render: (c) => c.taxId ?? '—',
              },
              {
                key: 'works',
                header: 'Obras',
                render: (c) =>
                  String(
                    (c as Schemas['Client'] & { _count?: { works: number } })
                      ._count?.works ?? 0,
                  ),
              },
            ]}
            mobile={(c) => (
              <div className="stack" style={{ gap: 2 }}>
                <b>{c.name}</b>
                <span className="small muted">
                  <Mono>{c.code}</Mono>
                  {c.taxId ? ` · ${c.taxId}` : ''}
                </span>
              </div>
            )}
            empty={
              <Empty title={q ? "No hay clientes con esos filtros" : "Todavía no hay clientes"}>
                Creá el primer cliente antes de registrar una obra nueva.
              </Empty>
            }
          />
        )}
        <PagerBar
          pagination={list.pagination}
          page={list.page}
          setPage={list.setPage}
        />
      </Card>
      <ClientForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(c) => {
          setOpen(false);
          router.push(`/clientes/${c.id}`);
        }}
      />
    </Page>
  );
}
