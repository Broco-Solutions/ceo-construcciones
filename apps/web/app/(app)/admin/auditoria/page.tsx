'use client';
import { useMemo, useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, DefList, Empty, ErrorBox, Loading, Modal, Mono, PagerBar, TextField } from '@/components/ui';
import { useAll, usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime } from '@/lib/format';
import type { Schemas } from '@/lib/api';

type Log = Schemas['AuditLog'];

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
  const [entity, setEntity] = useState('');
  const [entityId, setEntityId] = useState('');
  const [applied, setApplied] = useState({ entity: '', entityId: '' });
  const [sel, setSel] = useState<Log | null>(null);
  const list = usePaged<Log>('/audit', { entity: applied.entity || undefined, entityId: applied.entityId || undefined }, 50);
  const users = useAll<Schemas['User']>('/users');
  const names = useMemo(() => new Map(users.rows.map((u) => [u.id, u.name])), [users.rows]);
  const actor = (id: string | null) => (id ? names.get(id) ?? id : 'Sistema');
  return (
    <Page title="Auditoría" crumb="Administración">
      <Card bodyClass="">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ entity: entity.trim(), entityId: entityId.trim() });
          }}
        >
          <TextField label="Entidad" placeholder="p. ej. Work, User, PurchaseOrder" value={entity} onChange={(e) => setEntity(e.target.value)} />
          <TextField label="ID de entidad" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
          <Button type="submit" variant="sec">Filtrar</Button>
          {(applied.entity || applied.entityId) && (
            <Button variant="ghost" onClick={() => (setEntity(''), setEntityId(''), setApplied({ entity: '', entityId: '' }))}>Limpiar</Button>
          )}
        </form>
        {list.error ? (
          <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.rows}
            rowKey={(l) => l.id}
            onRowClick={setSel}
            columns={[
              { key: 'f', header: 'Fecha', render: (l) => formatDateTime(l.createdAt) },
              { key: 'u', header: 'Usuario', render: (l) => actor(l.actorId) },
              { key: 'a', header: 'Acción', render: (l) => <Mono>{l.action}</Mono> },
              { key: 'e', header: 'Entidad', render: (l) => l.entityType },
              { key: 'i', header: 'ID', hideMobile: true, render: (l) => <Mono>{l.entityId}</Mono> },
            ]}
            mobile={(l) => (
              <div>
                <div className="row"><Mono>{l.action}</Mono><span style={{ flex: 1 }} />{formatDateTime(l.createdAt)}</div>
                <span className="small muted">{l.entityType} · {actor(l.actorId)}</span>
              </div>
            )}
            empty={<Empty title="Sin registros de auditoría" />}
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
                ['Usuario', actor(sel.actorId)],
                ['Acción', <Mono key="a">{sel.action}</Mono>],
                ['Entidad', sel.entityType],
                ['ID', <Mono key="i">{sel.entityId}</Mono>],
              ]}
            />
            <b>Antes</b>
            <Json value={sel.before} />
            <b>Después</b>
            <Json value={sel.after} />
          </>
        )}
      </Modal>
    </Page>
  );
}
