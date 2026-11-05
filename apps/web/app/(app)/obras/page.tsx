'use client';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useAppRouter } from '@/lib/navigation';
import { EntitySearch } from '@/components/EntitySearch';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Page } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  SelectField,
  Mono,
} from '@/components/ui';
import { usePaged, useAll } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { Schemas } from '@/lib/api';
import { WorkStatusPill, WORK_STATUS_OPTIONS } from '@/components/obras/labels';
import { WorkForm } from '@/components/obras/WorkForm';
import { useDebounced } from '@/components/catalogo/common';

type Work = Schemas['WorkList'];

export default function ObrasPage() {
  const { can } = useSession();
  const router = useAppRouter();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [entityId,setEntityId]=useState('');
  const [clientId, setClientId] = useState('');
  const clients = useAll<Schemas['Client']>(
    can('readClients') ? '/clients' : null,
  );
  const [form, setForm] = useState(false);
  const search = useDebounced(q.trim());
  // Filtros aplicados por el servidor antes de paginar (q + status); el total viene en pagination.total.
  const list = usePaged<Work>(
    '/works',
    {
      status: status || undefined,
      q: search || undefined,
      id: entityId || undefined,
      clientId: clientId || undefined,
    },
    50,
  );
  const rows = list.rows;
  const manage = can('manageWorks');

  return (
    <Page
      title="Obras"
      actions={
        manage && (
          <Button onClick={() => setForm(true)}>
            <Plus /> Nueva obra
          </Button>
        )
      }
    >
      <Card bodyClass="">
        <FilterToolbar primary={<EntitySearch inputId="q-obra" resource="works" text={q} id={entityId} placeholder="Nombre o código" query={{clientId:clientId||undefined,status:status||undefined}} onChange={(q,id)=>{setQ(q);setEntityId(id);}}/>} activeCount={Number(!!clientId)+Number(!!status)} onClear={()=>{setClientId('');setStatus('');setEntityId('');}}>
          {can('readClients') && clients.rows.length > 0 && (
            <SelectField
              entity="clients" label="Cliente"
              value={clientId}
              placeholder="Todos"
              options={clients.rows.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              onChange={(e) => {setClientId(e.target.value);setEntityId('');}}
            />
          )}
          <SelectField
            id="f-obra-estado"
            label="Estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="Todos"
            options={WORK_STATUS_OPTIONS}
          />
        </FilterToolbar>
        {list.error ? (
          <div className="bd">
            <ErrorBox error={list.error} onRetry={list.reload} />
          </div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable collection={{resource:"works",filters:{status:status||undefined,q:search||undefined,id:entityId||undefined,clientId:clientId||undefined},total:list.pagination?.total,reload:list.reload}}
            rows={rows}
            rowKey={(w) => w.id}
            onRowClick={(w) => router.push(`/obras/${w.id}`)}
            columns={[
              {
                key: 'code',
                header: 'Código',
                render: (w) => <Mono>{w.code}</Mono>,
              },
              {
                key: 'name',
                header: 'Obra',
                render: (w) => <b className="ink">{w.name}</b>,
              },
              {
                key: 'status',
                header: 'Estado',
                render: (w) => <WorkStatusPill status={w.status} />,
              },
              {
                key: 'loc',
                header: 'Ubicación de stock',
                hideMobile: true,
                render: (w) => w.location?.code ?? '—',
              },
              {
                key: 'upd',
                header: 'Actualizada',
                hideMobile: true,
                render: (w) => formatDate(w.updatedAt),
              },
            ]}
            mobile={(w) => (
              <div className="stack" style={{ gap: 4 }}>
                <div className="row">
                  <b className="ink" style={{ flex: 1 }}>
                    {w.name}
                  </b>
                  <WorkStatusPill status={w.status} />
                </div>
                <span className="small muted">
                  <Mono>{w.code}</Mono> · {w.location?.code ?? 'sin ubicación'}
                </span>
              </div>
            )}
            empty={
              <Empty
                title={
                  q || status
                    ? 'No hay obras con esos filtros'
                    : 'Todavía no hay obras'
                }
              >
                {!q &&
                  !status &&
                  (manage
                    ? 'Creá la primera obra con “Nueva obra”.'
                    : 'No tenés obras asignadas.')}
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
      {manage && (
        <WorkForm
          open={form}
          onClose={() => setForm(false)}
          onSaved={(w) => router.push(`/obras/${w.id}`)}
        />
      )}
    </Page>
  );
}
