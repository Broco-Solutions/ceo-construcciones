'use client';
import { useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  ErrorBox,
  Loading,
  PagerBar,
  Pill,
  TextField,
  SelectField,
  useToast,
} from '@/components/ui';
import { usePaged, useMutation } from '@/lib/hooks';
import { api, type Schemas } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDateTime, formatMoney } from '@/lib/format';
export default function Administration() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('invoiceAdmin')}>
      <Orders />
    </RequirePerm>
  );
}
function Orders() {
  const list = usePaged<Schemas['AdministrativeOrder']>(
      '/order-administration',
    ),
    [selected, setSelected] = useState<Schemas['AdministrativeOrder']>(),
    { can } = useSession();
  return (
    <Page title="Factura y pago informativo" crumb="Compras">
      <Card>
        <p className="note">
          Referencias de las órdenes de compra. El estado informa un pago
          realizado fuera del sistema.
        </p>
      </Card>
      <Card bodyClass="">
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <ErrorBox error={list.error} onRetry={list.reload} />
        ) : (
          <DataTable
            rows={list.rows}
            rowKey={(o) => o.id}
            onRowClick={setSelected}
            columns={[
              { key: 'n', header: 'OC', render: (o) => `OC-${o.number}` },
              {
                key: 's',
                header: 'Proveedor / obra',
                render: (o) => (
                  <>
                    <b>{o.supplier.name}</b>
                    <div className="small muted">
                      {o.work?.name ?? 'Compra general'}
                    </div>
                  </>
                ),
              },
              {
                key: 'i',
                header: 'Factura',
                render: (o) => o.invoiceNumber ?? 'Sin referencia',
              },
              {
                key: 'a',
                header: 'Importe informado',
                render: (o) =>
                  formatMoney(o.invoiceInfo?.amount, o.invoiceInfo?.currency),
              },
              {
                key: 'p',
                header: 'Pago informativo',
                render: (o) => (
                  <Pill
                    tone={
                      o.invoiceInfo?.paymentStatus === 'PAID' ? 'ok' : 'warn'
                    }
                  >
                    {o.invoiceInfo?.paymentStatus === 'PAID'
                      ? 'Pagado'
                      : 'Pendiente'}
                  </Pill>
                ),
              },
            ]}
            mobile={(o) => (
              <div>
                <b>
                  OC-{o.number} · {o.supplier.name}
                </b>
                <div>
                  {o.invoiceNumber ?? 'Sin factura'} ·{' '}
                  {o.invoiceInfo?.paymentStatus === 'PAID'
                    ? 'Pagado'
                    : 'Pendiente'}
                </div>
              </div>
            )}
          />
        )}
        <PagerBar
          pagination={list.pagination}
          page={list.page}
          setPage={list.setPage}
        />
      </Card>
      {selected && (
        <Invoice
          key={`${selected.id}-${selected.invoiceInfo?.changedAt}`}
          order={selected}
          edit={can('processPurchases')}
          onSaved={() => {
            setSelected(undefined);
            list.reload();
          }}
        />
      )}
    </Page>
  );
}
function Invoice({
  order,
  edit,
  onSaved,
}: {
  order: Schemas['AdministrativeOrder'];
  edit: boolean;
  onSaved: () => void;
}) {
  const toast = useToast(),
    [number, setNumber] = useState(order.invoiceNumber ?? ''),
    [amount, setAmount] = useState(order.invoiceInfo?.amount ?? ''),
    [currency, setCurrency] = useState(order.invoiceInfo?.currency ?? 'ARS');
  const save = useMutation(() =>
    api.put(`/order-administration/${order.id}/invoice`, {
      invoiceNumber: number,
      amount: amount.replace(',', '.'),
      currency,
    }),
  );
  const payment = useMutation((_key: string, status: 'PAID' | 'PENDING') =>
    api.put(`/order-administration/${order.id}/payment`, {
      paymentStatus: status,
    }),
  );
  return (
    <Card title={`OC-${order.number} · ${order.supplier.name}`}>
      <div className="formgrid">
        <TextField
          label="Número de factura"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          disabled={!edit}
        />
        <TextField
          label="Importe de factura"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={!edit}
        />
        <SelectField
          label="Moneda de factura"
          value={currency}
          options={[
            { value: 'ARS', label: 'ARS' },
            { value: 'USD', label: 'USD' },
          ]}
          onChange={(e) => setCurrency(e.target.value)}
          disabled={!edit}
        />
      </div>
      <p className="small muted">
        Carga: {formatDateTime(order.invoiceLoadedAt)} ·{' '}
        {order.invoiceLoadedByName ?? '—'}
        <br />
        Última actualización informativa:{' '}
        {formatDateTime(order.invoiceInfo?.changedAt)}
        {' · '}
        {order.informationChangedByName ?? '—'}
      </p>
      <div className="row">
        {edit && (
          <Button
            variant="sec"
            loading={save.pending}
            disabled={!number.trim() || !amount.trim()}
            onClick={async () => {
              if (await save.run()) {
                toast.success('Referencia de factura guardada');
                onSaved();
              }
            }}
          >
            Guardar referencia
          </Button>
        )}
        <Button
          disabled={!order.invoiceNumber}
          loading={payment.pending}
          onClick={async () => {
            if (
              await payment.run(
                order.invoiceInfo?.paymentStatus === 'PAID'
                  ? 'PENDING'
                  : 'PAID',
              )
            ) {
              toast.success('Estado informativo actualizado');
              onSaved();
            }
          }}
        >
          {order.invoiceInfo?.paymentStatus === 'PAID'
            ? 'Marcar Pendiente'
            : 'Marcar Pagado'}
        </Button>
      </div>
      <ErrorBox error={save.error} />
      <ErrorBox error={payment.error} />
    </Card>
  );
}
