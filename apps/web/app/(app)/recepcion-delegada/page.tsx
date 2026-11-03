'use client';
import { useState } from 'react';
import { Page } from '@/components/shell';
import {
  Button,
  Card,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  TextField,
  useToast,
} from '@/components/ui';
import { usePaged, useMutation } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
export default function DelegatedReceipts() {
  const q = usePaged<Schemas['DelegatedOrder']>('/receipt-desk');
  return (
    <Page title="Recepciones delegadas">
      <p className="note">
        Entregas en destinos que Gerencia te asignó para recibir. Esta
        delegación no da acceso a precios ni a otros saldos.
      </p>
      {q.error ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : q.loading ? (
        <Loading />
      ) : q.rows.length ? (
        q.rows.map((o) => <Receive key={o.id} order={o} onSaved={q.reload} />)
      ) : (
        <Empty title="No hay entregas pendientes en tus destinos delegados" />
      )}
      <PagerBar pagination={q.pagination} page={q.page} setPage={q.setPage} />
    </Page>
  );
}
function Receive({
  order,
  onSaved,
}: {
  order: Schemas['DelegatedOrder'];
  onSaved: () => void;
}) {
  const [remito, setRemito] = useState(''),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    toast = useToast();
  const save = useMutation((key: string, body: Schemas['ReceiptInput']) =>
    api.post(`/purchase-orders/${order.id}/receipts`, body, {
      idempotencyKey: key,
    }),
  );
  return (
    <Card title={`OC-${order.number} · ${order.destination.name}`}>
      <div className="stack">
        <TextField
          label={`Remito de OC-${order.number}`}
          value={remito}
          onChange={(e) => setRemito(e.target.value)}
        />
        {order.lines.map((l) => (
          <TextField
            key={l.id}
            label={`${l.material.name} · pendiente ${l.pendingQuantity} ${l.material.unit.symbol ?? l.material.unit.name}`}
            inputMode="decimal"
            value={quantities[l.id] ?? ''}
            onChange={(e) =>
              setQuantities((v) => ({ ...v, [l.id]: e.target.value }))
            }
          />
        ))}
        <Button
          disabled={
            !remito.trim() || !Object.values(quantities).some((v) => v.trim())
          }
          loading={save.pending}
          onClick={async () => {
            if (
              await save.run({
                locationId: order.destination.id,
                deliveryNote: remito,
                lines: Object.entries(quantities)
                  .filter(([, v]) => v.trim())
                  .map(([orderLineId, quantity]) => ({
                    orderLineId,
                    quantity: quantity.replace(',', '.'),
                  })),
              })
            ) {
              toast.success('Recepción registrada');
              setQuantities({});
              setRemito('');
              onSaved();
            }
          }}
        >
          Confirmar recepción
        </Button>
        <ErrorBox error={save.error} />
      </div>
    </Card>
  );
}
