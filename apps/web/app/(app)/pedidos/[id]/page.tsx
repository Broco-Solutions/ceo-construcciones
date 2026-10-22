'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { FileText, Scale } from 'lucide-react';
import { Page } from '@/components/shell';
import { Button, Card, Confirm, DataTable, DefList, ErrorBox, Loading, useToast } from '@/components/ui';
import { api, type Schemas } from '@/lib/api';
import { useApi, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime, formatQty } from '@/lib/format';
import { HistoryTimeline, LookupGate, REQUEST_STATUS, REQUEST_TRANSITIONS, StatusPill, useLookups, useUserName, type RequestDetail, type RequestStatus } from '@/components/compras/common';

const ACTION_LABEL: Partial<Record<RequestStatus, string>> = { PROCESSING: 'Tomar en proceso', COMPLETED: 'Marcar completado', CANCELLED: 'Cancelar pedido' };

export default function PedidoDetalle() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const toast = useToast();
  const lk = useLookups();
  const userName = useUserName();
  const r = useApi<{ data: RequestDetail }>(`/requests/${id}`);
  const needs = useApi<{ data: Schemas['Needs'] }>(`/requests/${id}/needs`);
  const [target, setTarget] = useState<RequestStatus | null>(null);
  const [histKey, setHistKey] = useState(0);
  const change = useMutation((_k: string, status: RequestStatus) => api.post(`/requests/${id}/status`, { status }));

  const crumb = <Link href="/pedidos">Pedidos</Link>;
  if (r.error) return <Page title="Pedido" crumb={crumb}><ErrorBox error={r.error} onRetry={r.reload} /></Page>;
  if (!r.data) return <Page title="Pedido" crumb={crumb}><Loading /></Page>;
  const req = r.data.data;
  const transitions = can('processPurchases') ? REQUEST_TRANSITIONS[req.status] ?? [] : [];
  const buyable = can('processPurchases') && (req.status === 'SUBMITTED' || req.status === 'PROCESSING');

  const doChange = async () => {
    if (!target) return;
    const ok = await change.run(target);
    if (ok !== undefined) {
      toast(`Pedido: ${REQUEST_STATUS[target][0]}`);
      setTarget(null);
      r.reload();
      setHistKey((k) => k + 1);
    } else r.reload();
  };

  const needByMat = new Map((needs.data?.data.lines ?? []).map((l) => [l.materialId, l]));

  return (
    <Page
      title={`Pedido · ${lk.categoryName(req.categoryId)}`}
      crumb={crumb}
      actions={
        <>
          {buyable && can('readEconomic') && (
            <Link className="btn sec" href={`/cotizaciones/${req.id}`}>
              <Scale size={16} /> Cotizaciones
            </Link>
          )}
          {can('readOrders') && (
            <Link className="btn sec" href={`/ordenes?requestId=${req.id}`} data-testid="request-orders-link">
              Ver OC del pedido
            </Link>
          )}
          {buyable && (
            <Link className="btn sec" href={`/ordenes/nueva?requestId=${req.id}`}>
              <FileText size={16} /> Crear OC
            </Link>
          )}
          {transitions.map((t) => (
            <Button key={t} variant={t === 'CANCELLED' ? 'danger' : 'primary'} onClick={() => setTarget(t)}>
              {ACTION_LABEL[t]}
            </Button>
          ))}
        </>
      }
    >
      <LookupGate lk={lk}>
        <Card title="Datos del pedido" actions={<StatusPill map={REQUEST_STATUS} value={req.status} />}>
          <DefList
            items={[
              ['Obra', lk.workName(req.workId)],
              ['Rubro', lk.categoryName(req.categoryId)],
              ['Requerido para', formatDate(req.requiredAt)],
              ['Solicitado por', userName(req.requestedById)],
              ['Creado', formatDateTime(req.createdAt)],
              ['Observaciones', req.notes || '—'],
            ]}
          />
        </Card>

        <Card title="Materiales y necesidades" bodyClass="">
          {needs.error && <div className="bd"><ErrorBox error={needs.error} onRetry={needs.reload} /></div>}
          {needs.data && !needs.data.data.versionId && <div className="bd"><div className="note small">La obra no tiene presupuesto de referencia: no hay cantidades previstas.</div></div>}
          <DataTable
            rows={req.lines}
            rowKey={(l) => l.id}
            columns={[
              { key: 'm', header: 'Material', render: (l) => lk.materialLabel(l.materialId) },
              { key: 'q', header: 'Solicitado', align: 'r', render: (l) => <b>{formatQty(l.quantity, lk.unitOf(l.materialId))}</b> },
              { key: 'p', header: 'Previsto', align: 'r', render: (l) => formatQty(needByMat.get(l.materialId)?.planned, lk.unitOf(l.materialId)) },
              { key: 'a', header: 'Pedido en la obra (total)', align: 'r', render: (l) => formatQty(needByMat.get(l.materialId)?.alreadyRequested, lk.unitOf(l.materialId)) },
              {
                key: 'd',
                header: 'Disponible por ubicación',
                render: (l) => <Availability rows={needByMat.get(l.materialId)?.availability} unit={lk.unitOf(l.materialId)} name={lk.locationName} loading={needs.loading} />,
              },
            ]}
            mobile={(l) => {
              const n = needByMat.get(l.materialId);
              const u = lk.unitOf(l.materialId);
              return (
                <div className="stack" style={{ gap: 4 }}>
                  <b>{lk.materialLabel(l.materialId)}</b>
                  <span className="small">
                    Solicitado <b>{formatQty(l.quantity, u)}</b> · Previsto {formatQty(n?.planned, u)}
                  </span>
                  <span className="small muted">Pedido en la obra: {formatQty(n?.alreadyRequested, u)}</span>
                  <Availability rows={n?.availability} unit={u} name={lk.locationName} loading={needs.loading} />
                </div>
              );
            }}
          />
          <div className="bd small muted">“Pedido en la obra” es lo pedido en todos los pedidos no cancelados de la obra para el material, incluido este pedido (no es lo pedido además de este).</div>
        </Card>

        <HistoryTimeline key={histKey} path={`/requests/${id}/history`} statusMap={REQUEST_STATUS} title="Historial del pedido" />

        <Confirm
          open={!!target}
          title={target ? ACTION_LABEL[target]! : ''}
          tone={target === 'CANCELLED' ? 'danger' : 'primary'}
          pending={change.pending}
          error={change.error}
          onClose={() => {
            setTarget(null);
            change.reset();
          }}
          onConfirm={doChange}
        >
          El pedido pasará de <b>{REQUEST_STATUS[req.status][0]}</b> a <b>{target ? REQUEST_STATUS[target][0] : ''}</b>.
          {target === 'CANCELLED' && ' Sólo se puede cancelar si no tiene reservas activas ni OC vigentes.'}
        </Confirm>
      </LookupGate>
    </Page>
  );
}

function Availability({ rows, unit, name, loading }: { rows?: Schemas['Needs']['lines'][number]['availability']; unit: string; name: (id: string) => string; loading: boolean }) {
  if (loading) return <span className="muted small">…</span>;
  if (!rows?.length) return <span className="muted small">Sin stock registrado</span>;
  return (
    <span className="small">
      {rows.map((a) => (
        <span key={a.locationId} style={{ display: 'block' }}>
          {name(a.locationId)}: <b>{formatQty(a.available, unit)}</b> <span className="muted">(físico {formatQty(a.physical)}, reservado {formatQty(a.reserved)})</span>
        </span>
      ))}
    </span>
  );
}
