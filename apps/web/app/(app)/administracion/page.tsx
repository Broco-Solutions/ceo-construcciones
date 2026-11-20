'use client';
import { useEffect, useRef, useState } from 'react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  Confirm,
  DataTable,
  DefList,
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
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { ORDER_STATUS } from '@/components/compras/common';
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
    [currency, setCurrency] = useState(order.invoiceInfo?.currency ?? 'ARS'),
    [confirmPayment, setConfirmPayment] = useState(false);
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
  const isPaid = order.invoiceInfo?.paymentStatus === 'PAID';
  const nextStatus = isPaid ? 'Pendiente' : 'Pagado';
  const invoiceAmount = order.invoiceInfo?.amount;
  const invoiceCurrency = order.invoiceInfo?.currency;
  const purchaseHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    purchaseHeading.current?.focus();
  }, []);
  return (
    <Card title={`OC-${order.number} · ${order.supplier.name}`}>
      <div className="stack">
        <section>
          <h3 ref={purchaseHeading} tabIndex={-1}>Datos de la compra</h3>
          <DefList items={[
            ['Orden de compra', `OC-${order.number}`],
            ['Proveedor', order.supplier.name],
            ['Obra', order.work ? `${order.work.code} · ${order.work.name}` : 'Compra general'],
            ['Fecha de la OC', formatDateTime(order.createdAt)],
            ['Estado de la OC', ORDER_STATUS[order.status][0]],
          ]} />
          <b>Materiales comprados</b>
          {order.items.length ? (
            <ul>
              {order.items.map((item, index) => (
                <li key={index}>{item.description} · {formatQty(item.quantity, item.unit)}</li>
              ))}
            </ul>
          ) : <p className="small muted">Sin materiales registrados.</p>}
        </section>
        <section>
          <h3>Referencia de factura</h3>
          <DefList items={[
            ['Número registrado', order.invoiceNumber ?? 'Sin referencia'],
            ['Importe informado', invoiceAmount ? formatMoney(invoiceAmount, invoiceCurrency) : 'Sin importe informado'],
            ['Pago informativo', <Pill key="payment" tone={isPaid ? 'ok' : 'warn'}>{isPaid ? 'Pagado' : 'Pendiente'}</Pill>],
          ]} />
          {edit && (
            <div className="formgrid">
              <TextField
                label="Número de factura"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
              <TextField
                label="Importe de factura"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <SelectField
                label="Moneda de factura"
                value={currency}
                options={[
                  { value: 'ARS', label: 'ARS' },
                  { value: 'USD', label: 'USD' },
                ]}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
          )}
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
              disabled={!order.invoiceNumber || save.pending}
              onClick={() => setConfirmPayment(true)}
            >
              Marcar {nextStatus}
            </Button>
          </div>
          <ErrorBox error={save.error} />
        </section>
      </div>
      <Confirm
        open={confirmPayment}
        title={`Marcar ${nextStatus}`}
        confirmLabel={`Confirmar ${nextStatus}`}
        pending={payment.pending}
        error={payment.error}
        onClose={() => {
          setConfirmPayment(false);
          payment.reset();
        }}
        onConfirm={async () => {
          if (await payment.run(isPaid ? 'PENDING' : 'PAID')) {
            toast.success('Estado informativo actualizado');
            onSaved();
          }
        }}
      >
        <p>
          Vas a marcar como {nextStatus} la factura <b>{order.invoiceNumber}</b>,
          vinculada a <b>OC-{order.number}</b>, proveedor <b>{order.supplier.name}</b>
          {invoiceAmount ? <>, por <b>{formatMoney(invoiceAmount, invoiceCurrency)}</b>.</> : '. Esta factura no tiene importe informado.'}
          {' '}Esta acción registra un estado informativo y no realiza un pago real.
        </p>
      </Confirm>
    </Card>
  );
}
