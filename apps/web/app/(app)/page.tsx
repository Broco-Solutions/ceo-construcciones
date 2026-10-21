'use client';
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowLeftRight, Building2, PackageCheck, ShoppingCart, Warehouse } from 'lucide-react';
import { Page } from '@/components/shell';
import { Card, DataTable, Empty, ErrorBox, Loading, Mono, Pill } from '@/components/ui';
import { useAll, useApi, usePaged } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate, formatQty } from '@/lib/format';
import type { Page as P, Schemas } from '@/lib/api';
import { ORDER_STATUS, REQUEST_STATUS, WorkStatusPill } from '@/components/obras/labels';

type Work = Schemas['WorkList'];
type Req = Schemas['RequestDetail'];
type Alert = Schemas['StockAlert'];
type Order = { id: string; number: number; workId: string | null; status: Schemas['PurchaseOrderStatus']; createdAt: string; work?: { id: string; code: string; name: string } | null };

function Section<T>({ title, more, res, children }: { title: string; more?: string; res: { loading: boolean; error: unknown; reload: () => void; data?: T }; children: (d: T) => React.ReactNode }) {
  return (
    <Card title={title} bodyClass="" actions={more && <Link href={more} className="btn ghost sm">Ver todo</Link>}>
      {res.error ? <div className="bd"><ErrorBox error={res.error} onRetry={res.reload} /></div> : !res.data ? <Loading /> : children(res.data)}
    </Card>
  );
}

export default function Home() {
  const { user, can } = useSession();
  const jefe = user?.role === 'JEFE_OBRA';
  const works = usePaged<Work>('/works', { status: 'ACTIVE' }, 100);
  const reqs = useApi<P<Req>>('/requests', { page: 1, pageSize: 8 });
  const alerts = useApi<P<Alert>>('/stock/alerts', { page: 1, pageSize: 8 });
  // OC recientes: roles económicos (Jefe tiene sus recepciones en accesos rápidos).
  const orders = useApi<P<Order>>(can('readEconomic') ? '/purchase-orders' : null, { page: 1, pageSize: 8 });
  // RequestDetail no trae nombre de obra: se resuelve con las obras visibles (incluye pausadas/finalizadas).
  // Las OC usan la relación `work` del DTO.
  const allWorks = useAll<Work>('/works');
  const workName = useMemo(() => new Map(allWorks.rows.map((w) => [w.id, w.name])), [allWorks.rows]);
  const wn = (id: string | null) => (id ? workName.get(id) ?? '—' : '—');

  const acts = [
    can('createRequest') && { href: '/pedidos/nuevo', label: 'Nuevo pedido', sub: 'Pedir materiales para la obra', icon: ShoppingCart },
    can('receive') && { href: '/recepciones', label: 'Recepciones', sub: 'Registrar lo que llegó', icon: PackageCheck },
    { href: '/stock', label: jefe ? 'Stock de mi obra' : 'Stock', sub: 'Disponible y reservado', icon: Warehouse },
    can('consume') && { href: '/stock/movimientos/nuevo', label: 'Consumo / devolución', sub: 'Registrar uso de materiales', icon: ArrowLeftRight },
  ].filter(Boolean) as { href: string; label: string; sub: string; icon: typeof Warehouse }[];

  return (
    <Page title={`Hola, ${user?.name.split(' ')[0] ?? ''}`} crumb="Inicio">
      {jefe && (
        <div className="formgrid">
          {acts.map((a) => (
            <Link key={a.href} href={a.href} className="card act" style={{ padding: 18, display: 'flex', gap: 14, alignItems: 'center', color: 'inherit' }}>
              <a.icon size={28} aria-hidden />
              <div>
                <b className="ink" style={{ fontSize: 16 }}>{a.label}</b>
                <div className="small muted">{a.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {!jefe && (
        <div className="kpis">
          <div className="kpi"><small>Obras activas</small><b>{works.pagination?.total ?? '—'}</b><span>según permisos</span></div>
          <div className="kpi"><small>Pedidos</small><b>{reqs.data?.pagination.total ?? '—'}</b><span>registrados</span></div>
          <div className="kpi"><small>Alertas de stock</small><b>{alerts.data?.pagination.total ?? '—'}</b><span>bajo mínimo</span></div>
          {orders.data && <div className="kpi"><small>Órdenes de compra</small><b>{orders.data.pagination.total}</b><span>registradas</span></div>}
        </div>
      )}
      <div className="grid2">
        <div className="stack">
          <Section title={jefe ? 'Mis obras' : 'Obras activas'} more="/obras" res={{ ...works, data: works.data }}>
            {() => (
              <DataTable
                rows={works.rows.slice(0, 10)}
                rowKey={(w) => w.id}
                columns={[
                  { key: 'c', header: 'Código', render: (w) => <Link href={`/obras/${w.id}`}><Mono>{w.code}</Mono></Link> },
                  { key: 'n', header: 'Obra', render: (w) => <Link href={`/obras/${w.id}`} className="ink">{w.name}</Link> },
                  { key: 's', header: 'Estado', render: (w) => <WorkStatusPill status={w.status} /> },
                ]}
                mobile={(w) => <Link href={`/obras/${w.id}`} className="row" style={{ color: 'inherit' }}><b className="ink" style={{ flex: 1 }}>{w.name}</b><Mono>{w.code}</Mono></Link>}
                empty={<Empty title={jefe ? 'No tenés obras activas asignadas' : 'No hay obras activas'} />}
              />
            )}
          </Section>
          <Section title="Pedidos recientes" more="/pedidos" res={reqs}>
            {(d) => (
              <DataTable
                rows={d.data}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'f', header: 'Fecha', render: (r) => <Link href={`/pedidos/${r.id}`}>{formatDate(r.createdAt)}</Link> },
                  { key: 'o', header: 'Obra', render: (r) => wn(r.workId) },
                  { key: 'n', header: 'Necesario', hideMobile: true, render: (r) => formatDate(r.requiredAt) },
                  { key: 's', header: 'Estado', render: (r) => <Pill tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Pill> },
                ]}
                mobile={(r) => <Link href={`/pedidos/${r.id}`} className="row" style={{ color: 'inherit' }}><span style={{ flex: 1 }}><b className="ink">{wn(r.workId)}</b><br /><span className="small muted">{formatDate(r.createdAt)}</span></span><Pill tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Pill></Link>}
                empty={<Empty title="Sin pedidos todavía" />}
              />
            )}
          </Section>
        </div>
        <div className="stack">
          <Section title="Alertas de stock" more="/stock/alertas" res={alerts}>
            {(d) => (
              <DataTable
                rows={d.data}
                rowKey={(a) => `${a.materialId}:${a.locationId}`}
                columns={[
                  { key: 'm', header: 'Material', render: (a) => <><b className="ink">{a.material.name}</b><div className="small muted">{a.location.name}</div></> },
                  { key: 'd', header: 'Disponible', align: 'r', render: (a) => formatQty(a.available, a.material.unit.code) },
                  { key: 'min', header: 'Mínimo', align: 'r', render: (a) => formatQty(a.minimum, a.material.unit.code) },
                ]}
                mobile={(a) => <div><b className="ink">{a.material.name}</b><div className="small muted">{a.location.name} · disp. {formatQty(a.available, a.material.unit.code)} / mín. {formatQty(a.minimum, a.material.unit.code)}</div></div>}
                empty={<Empty title="Sin alertas de stock">Ningún material está bajo su mínimo.</Empty>}
              />
            )}
          </Section>
          {can('readEconomic') && (
            <Section title="Órdenes de compra recientes" more="/ordenes" res={orders}>
              {(d) => (
                <DataTable
                  rows={d.data}
                  rowKey={(o) => o.id}
                  columns={[
                    { key: 'n', header: 'OC', render: (o) => <Link href={`/ordenes/${o.id}`}><Mono>#{o.number}</Mono></Link> },
                    { key: 'o', header: 'Obra', render: (o) => (o.work?.name ?? wn(o.workId)) },
                    { key: 'f', header: 'Fecha', hideMobile: true, render: (o) => formatDate(o.createdAt) },
                    { key: 's', header: 'Estado', render: (o) => <Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill> },
                  ]}
                  mobile={(o) => <Link href={`/ordenes/${o.id}`} className="row" style={{ color: 'inherit' }}><Mono>#{o.number}</Mono><span style={{ flex: 1 }}>{(o.work?.name ?? wn(o.workId))}</span><Pill tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Pill></Link>}
                  empty={<Empty title="Sin órdenes de compra" />}
                />
              )}
            </Section>
          )}
        </div>
      </div>
    </Page>
  );
}
