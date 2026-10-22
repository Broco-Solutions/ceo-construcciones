'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, DataTable, Empty, ErrorBox, Loading, Mono, PagerBar, Pill } from '@/components/ui';
import { usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import type { Schemas } from '@/lib/api';
import { LOCATION_KIND } from '@/components/obras/labels';
import { LocationForm } from '@/components/admin/LocationForm';

type Loc = Schemas['Location'];

export default function UbicacionesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('manageLocations')}>
      <Ubicaciones />
    </RequirePerm>
  );
}

function Ubicaciones() {
  const list = usePaged<Loc>('/locations', {}, 50);
  const [edit, setEdit] = useState<Loc | 'new' | null>(null);
  const btn = (l: Loc) => (
    <Button size="sm" variant="sec" onClick={(e) => (e.stopPropagation(), setEdit(l))}><Pencil /> Editar</Button>
  );
  const kind = (l: Loc) => (l.kind === 'WORK' && l.workId ? <Link href={`/obras/${l.workId}`}>{LOCATION_KIND.WORK}</Link> : LOCATION_KIND[l.kind]);
  return (
    <Page title="Ubicaciones" crumb="Administración" actions={<Button onClick={() => setEdit('new')}><Plus /> Nuevo galpón o patio</Button>}>
      <div className="note">Las ubicaciones de tipo Obra se crean automáticamente con cada obra.</div>
      <Card bodyClass="">
        {list.error ? (
          <div className="bd"><ErrorBox error={list.error} onRetry={list.reload} /></div>
        ) : list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.rows}
            rowKey={(l) => l.id}
            columns={[
              { key: 'c', header: 'Código', render: (l) => <Mono>{l.code}</Mono> },
              { key: 'n', header: 'Nombre', render: (l) => <b className="ink">{l.name}</b> },
              { key: 'k', header: 'Tipo', render: kind },
              { key: 'a', header: 'Estado', render: (l) => (l.active ? <Pill tone="ok">Activa</Pill> : <Pill>Inactiva</Pill>) },
              { key: 's', header: 'Stock', hideMobile: true, render: (l) => <Link href={`/stock?locationId=${l.id}`}>Ver stock</Link> },
              { key: 'x', header: '', render: btn },
            ]}
            mobile={(l) => (
              <div className="stack" style={{ gap: 6 }}>
                <div className="row"><b className="ink" style={{ flex: 1 }}>{l.name}</b>{l.active ? <Pill tone="ok">Activa</Pill> : <Pill>Inactiva</Pill>}</div>
                <span className="small muted"><Mono>{l.code}</Mono> · {LOCATION_KIND[l.kind]}</span>
                <div>{btn(l)}</div>
              </div>
            )}
            empty={<Empty title="No hay ubicaciones" />}
          />
        )}
        <PagerBar pagination={list.pagination} page={list.page} setPage={list.setPage} />
      </Card>
      <LocationForm open={edit !== null} loc={edit === 'new' || edit === null ? undefined : edit} onClose={() => setEdit(null)} onSaved={list.reload} />
    </Page>
  );
}
