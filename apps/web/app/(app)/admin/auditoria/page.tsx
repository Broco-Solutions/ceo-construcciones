'use client';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, DefList, Empty, ErrorBox, Loading, Modal, Mono, PagerBar, SelectField, TextField } from '@/components/ui';
import { useAll, usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { Schemas } from '@/lib/api';

type Log = Schemas['AuditEntry'];

type Filters = { entity: string; entityId: string; actorId: string; action: string; from: string; to: string };
const EMPTY: Filters = { entity: '', entityId: '', actorId: '', action: '', from: '', to: '' };

/** Día local (yyyy-mm-dd) a instante ISO; `to` incluye el día completo. */
function dayToIso(day: string, end: boolean): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export default function AuditoriaPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('adjustStock')}>
      <Auditoria />
    </RequirePerm>
  );
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  return (
    <pre className="mono small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface2)', padding: 10, borderRadius: 8, maxHeight: '40vh', overflow: 'auto', margin: 0 }}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Auditoria() {
  const [f, setF] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [sel, setSel] = useState<Log | null>(null);
  const t = (v: string) => v.trim() || undefined;
  // Todos los filtros se aplican en el servidor antes de paginar; fechas ISO inclusivas.
  const list = usePaged<Log>(
    '/audit',
    { entity: t(applied.entity), entityId: t(applied.entityId), actorId: applied.actorId || undefined, action: t(applied.action), from: dayToIso(applied.from, false), to: dayToIso(applied.to, true) },
    50,
  );
  // Selector de usuario: esta pantalla es sólo de Gerencia, que sí puede listar /users.
  const users = useAll<Schemas['User']>('/users');
  const actor = (l: Log) => (l.actorId ? l.actorName ?? 'Usuario sin nombre' : 'Sistema');
  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const anyApplied = Object.values(applied).some(Boolean);
  return (
    <Page title="Auditoría" crumb="Administración">
      <Card bodyClass="">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied(f);
          }}
        >
          <TextField id="f-audit-entity" label="Entidad" placeholder="p. ej. Work, Material, PurchaseOrder" value={f.entity} onChange={set('entity')} />
          <TextField id="f-audit-entity-id" label="ID de entidad" value={f.entityId} onChange={set('entityId')} />
          <SelectField
            id="f-audit-actor"
            label="Usuario"
            value={f.actorId}
            onChange={set('actorId')}
            placeholder="Todos"
            options={users.rows.map((u) => ({ value: u.id, label: u.name }))}
          />
          <TextField id="f-audit-action" label="Acción" placeholder="p. ej. CREATE, UPDATE" value={f.action} onChange={set('action')} />
          <TextField id="f-audit-from" label="Desde" type="date" value={f.from} onChange={set('from')} />
          <TextField id="f-audit-to" label="Hasta (inclusive)" type="date" value={f.to} onChange={set('to')} />
          <Button type="submit" variant="sec">Filtrar</Button>
          {anyApplied && (
            <Button variant="ghost" onClick={() => (setF(EMPTY), setApplied(EMPTY))}>Limpiar</Button>
          )}
        </form>
        {list.error ? (
          <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable collection={{resource:"audit",filters:{entity:t(applied.entity),entityId:t(applied.entityId),actorId:applied.actorId||undefined,action:t(applied.action),from:dayToIso(applied.from,false),to:dayToIso(applied.to,true)},total:list.pagination?.total,reload:list.reload}}
            rows={list.rows}
            rowKey={(l) => l.id}
            onRowClick={setSel}
            columns={[
              { key: 'f', header: 'Fecha', render: (l) => formatDateTime(l.createdAt) },
              { key: 'u', header: 'Usuario', render: (l) => actor(l) },
              { key: 'a', header: 'Acción', render: (l) => <Mono>{l.action}</Mono> },
              { key: 'e', header: 'Entidad', render: (l) => l.entityType },
              { key: 'i', header: 'ID', hideMobile: true, render: (l) => <Mono>{l.entityId}</Mono> },
            ]}
            mobile={(l) => (
              <div>
                <div className="row"><Mono>{l.action}</Mono><span style={{ flex: 1 }} />{formatDateTime(l.createdAt)}</div>
                <span className="small muted">{l.entityType} · {actor(l)}</span>
              </div>
            )}
            empty={<Empty title={anyApplied ? 'Sin registros con esos filtros' : 'Sin registros de auditoría'} />}
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} side title="Detalle de auditoría">
        {sel && (
          <>
            <DefList
              items={[
                ['Fecha', formatDateTime(sel.createdAt)],
                ['Usuario', actor(sel)],
                ['Acción', <Mono key="a">{sel.action}</Mono>],
                ['Entidad', sel.entityType],
                ['ID', <Mono key="i">{sel.entityId}</Mono>],
              ]}
            />
            <b>Antes</b>
            {sel.before === null && sel.action !== 'CREATE' ? <p className="small muted">Sin estado previo registrado.</p> : <Json value={sel.before} />}
            <b>Después</b>
            <Json value={sel.after} />
          </>
        )}
      </Modal>
    </Page>
  );
}
