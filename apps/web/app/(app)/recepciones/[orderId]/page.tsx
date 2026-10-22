'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import { Card, DefList, ErrorBox, Loading } from '@/components/ui';
import { useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { LookupGate, ORDER_STATUS, StatusPill, useLookups, type VisibleOrder } from '@/components/compras/common';
import { ReceiptForm, ReceiptHistory, canReceive } from '@/components/compras/Receipts';

function Recibir() {
  const { orderId } = useParams<{ orderId: string }>();
  const lk = useLookups();
  const o = useApi<{ data: VisibleOrder }>(`/purchase-orders/${orderId}`);
  const [tick, setTick] = useState(0);
  const crumb = <Link href="/recepciones">Recepciones</Link>;
  if (o.error) return <Page title="Recepción" crumb={crumb}><ErrorBox error={o.error} onRetry={o.reload} /></Page>;
  if (!o.data) return <Page title="Recepción" crumb={crumb}><Loading /></Page>;
  const ord = o.data.data;
  return (
    <Page title={`Recibir OC-${ord.number}`} crumb={crumb}>
      <LookupGate lk={lk}>
        <Card title="Orden" actions={<StatusPill map={ORDER_STATUS} value={ord.status} />}>
          <DefList items={[['Obra', lk.workName(ord.workId)], ['Destino', ord.destination ? ord.destination.name : lk.locationName(ord.destinationId)], ['Creada por', ord.createdByName ?? '—'], ['Detalle', <Link key="d" href={`/ordenes/${ord.id}`}>Ver OC</Link>]]} />
        </Card>
        {canReceive(ord) ? (
          <ReceiptForm key={`f${tick}`} order={ord} lk={lk} onDone={() => { o.reload(); setTick((t) => t + 1); }} />
        ) : (
          <div className="alert ok">Esta orden no tiene entregas pendientes de recibir ({ORDER_STATUS[ord.status][0]}).</div>
        )}
        <ReceiptHistory key={`h${tick}`} order={ord} lk={lk} />
      </LookupGate>
    </Page>
  );
}

export default function RecibirPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('receive')}>
      <Recibir />
    </RequirePerm>
  );
}
