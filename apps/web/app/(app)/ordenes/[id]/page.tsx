'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download, Pencil, PackageCheck, Send, XCircle } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, Confirm, DataTable, DefList, ErrorBox, Loading, Modal, Mono, TextArea, TextField, useToast } from '@/components/ui';
import { api, type Schemas } from '@/lib/api';
import { useApi, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { AmountWarning, HistoryTimeline, LOCATION_KIND, LookupGate, ORDER_STATUS, StatusPill, TAX_BASIS, useLookups, type OrderDetail, type VisibleOrder } from '@/components/compras/common';
import { CommercialLines, lineFrom, toCommercial, type LineDraft } from '@/components/compras/CommercialLines';
import { ReceiptForm, ReceiptHistory, canReceive } from '@/components/compras/Receipts';

const isFull = (o: VisibleOrder): o is OrderDetail => 'supplierId' in o;
/** Renglón visible: ChiefOrder no trae precios ni importes. */
type Line = OrderDetail['lines'][number] | (Schemas['ChiefOrderLine'] & { unitPrice?: undefined; baseQuantity?: undefined; lineAmount?: undefined });

/** Importe del servidor; null = sin política de redondeo (nunca se calcula en JS). */
function LineAmount({ value, currency }: { value: string | null | undefined; currency: string }) {
  if (value === null || value === undefined)
    return (
      <span className="small" style={{ color: 'var(--warn)' }} data-testid="oc-line-amount-missing" title="Importe no calculado: falta definir política de redondeo (validación CEO pendiente)">
        No calculado
      </span>
    );
  return <span data-testid="oc-line-amount">{formatMoney(value, currency)}</span>;
}

function Detalle() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const toast = useToast();
  const lk = useLookups({ suppliers: true });
  const o = useApi<{ data: VisibleOrder }>(`/purchase-orders/${id}`);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<'ISSUED' | 'CANCELLED' | null>(null);
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const changeStatus = useMutation((_k: string, s: 'ISSUED' | 'CANCELLED') => api.post(`/purchase-orders/${id}/status`, { status: s }));
  const refresh = () => {
    o.reload();
    setTick((t) => t + 1);
  };

  const crumb = <Link href="/ordenes">Órdenes de compra</Link>;
  if (o.error) return <Page title="Orden de compra" crumb={crumb}><ErrorBox error={o.error} onRetry={o.reload} /></Page>;
  if (!o.data) return <Page title="Orden de compra" crumb={crumb}><Loading /></Page>;
  const ord = o.data.data;
  const full = isFull(ord) ? ord : null;
  const manage = can('processPurchases') && !!full;

  const doStatus = async () => {
    if (!status) return;
    const r = await changeStatus.run(status);
    if (r !== undefined) {
      toast.success(status === 'ISSUED' ? `Orden OC-${ord.number} emitida` : `Orden OC-${ord.number} anulada`);
      setStatus(null);
    }
    refresh();
  };
  const pdf = async () => {
    setPdfBusy(true);
    try {
      await api.download(`/purchase-orders/${id}/pdf`, undefined, `OC-${ord.number}.pdf`);
      toast.success('PDF de la orden descargado', { description: `OC-${ord.number}.pdf` });
    } catch (e) {
      toast.failure('No se pudo descargar el PDF', e);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Page
      title={`OC-${ord.number}`}
      crumb={crumb}
      actions={
        <>
          {can('readEconomic') && full && (
            <Button variant="sec" onClick={pdf} loading={pdfBusy}>
              <Download size={16} /> PDF
            </Button>
          )}
          {manage && ord.status === 'DRAFT' && (
            <Button variant="sec" onClick={() => setEditing(true)}>
              <Pencil size={16} /> Editar borrador
            </Button>
          )}
          {manage && ord.status === 'DRAFT' && (
            <Button onClick={() => setStatus('ISSUED')}>
              <Send size={16} /> Emitir
            </Button>
          )}
          {manage && (ord.status === 'DRAFT' || ord.status === 'ISSUED') && (
            <Button variant="danger" onClick={() => setStatus('CANCELLED')}>
              <XCircle size={16} /> Anular
            </Button>
          )}
          {can('receive') && canReceive(ord) && !receiving && (
            <Button variant="ok" onClick={() => setReceiving(true)}>
              <PackageCheck size={16} /> Recibir
            </Button>
          )}
        </>
      }
    >
      <LookupGate lk={lk}>
        <Card title="Datos de la orden" actions={<StatusPill map={ORDER_STATUS} value={ord.status} />}>
          <DefList
            items={[
              ['Obra', full?.work ? `${full.work.code} · ${full.work.name}` : lk.workName(ord.workId)],
              ['Destino', ord.destination ? `${ord.destination.name} (${LOCATION_KIND[ord.destination.kind]})` : lk.locationName(ord.destinationId)],
              ...(full
                ? ([
                    ['Proveedor', full.supplier ? `${full.supplier.code} · ${full.supplier.name}` : lk.supplierName(full.supplierId)],
                    ['Moneda / base impositiva', <span key="m" data-testid="oc-currency-taxbasis">{full.currency} · {TAX_BASIS[full.taxBasis]}</span>],
                  ] as [string, React.ReactNode][])
                : []),
              ['Creada por', ord.createdByName ?? '—'],
              ['Pedido', ord.requestId ? <Link key="p" href={`/pedidos/${ord.requestId}`}>Ver pedido</Link> : '—'],
              ['Creada', formatDateTime(ord.createdAt)],
              ...(full ? ([['Observaciones', full.notes || '—']] as [string, React.ReactNode][]) : []),
            ]}
          />
        </Card>

        <Card title="Renglones" bodyClass="">
          <DataTable
            rows={ord.lines as Line[]}
            rowKey={(l) => l.id}
            columns={[
              { key: 'm', header: 'Material', render: (l) => lk.materialLabel(l.materialId) },
              { key: 'q', header: 'Cantidad', align: 'r', render: (l) => formatQty(l.quantity, lk.unitOf(l.materialId)) },
              { key: 'r', header: 'Recibido', align: 'r', render: (l) => formatQty(l.receivedQuantity, lk.unitOf(l.materialId)) },
              { key: 'pe', header: 'Pendiente', align: 'r', render: (l) => <span data-testid="oc-line-pending">{formatQty(l.pendingQuantity, lk.unitOf(l.materialId))}</span> },
              ...(full
                ? [
                    { key: 'p', header: 'Precio', align: 'r' as const, render: (l: Line) => formatMoney(l.unitPrice, full.currency) },
                    { key: 'b', header: 'Por', align: 'r' as const, render: (l: Line) => formatQty(l.baseQuantity, lk.unitOf(l.materialId)) },
                    { key: 'i', header: 'Importe', align: 'r' as const, render: (l: Line) => <LineAmount value={l.lineAmount} currency={full.currency} /> },
                  ]
                : []),
            ]}
            mobile={(l) => (
              <div className="stack" style={{ gap: 4 }}>
                <b>{lk.materialLabel(l.materialId)}</b>
                <span className="small">
                  Cantidad {formatQty(l.quantity, lk.unitOf(l.materialId))} · recibido {formatQty(l.receivedQuantity, lk.unitOf(l.materialId))} · pendiente{' '}
                  {formatQty(l.pendingQuantity, lk.unitOf(l.materialId))}
                </span>
                {full && (
                  <span className="small muted">
                    {formatMoney(l.unitPrice, full.currency)} por {formatQty(l.baseQuantity, lk.unitOf(l.materialId))} · importe <LineAmount value={l.lineAmount} currency={full.currency} />
                  </span>
                )}
              </div>
            )}
          />
          {full && (
            <div className="bd stack" style={{ gap: 8 }}>
              <AmountWarning order={full} />
              <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <span className="small muted">
                  Suma de importes en la base cargada ({full.currency} · {TAX_BASIS[full.taxBasis]}). No agrega ni descuenta IVA.
                </span>
                <b data-testid="oc-total-amount">Total: {full.totalAmount !== null ? formatMoney(full.totalAmount, full.currency) : 'no calculado'}</b>
              </div>
            </div>
          )}
        </Card>

        {receiving && canReceive(ord) && <ReceiptForm order={ord} lk={lk} onDone={() => { setReceiving(false); refresh(); }} />}
        <ReceiptHistory key={`r${tick}`} order={ord} lk={lk} />

        {manage && <InvoiceRef order={full!} onSaved={refresh} />}
        {can('readEconomic') && full && <HistoryTimeline key={`h${tick}`} path={`/purchase-orders/${id}/history`} statusMap={ORDER_STATUS} title="Historial de la OC" locationName={lk.locationName} />}

        {editing && full && <EditDraft order={full} lk={lk} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
        <Confirm
          open={!!status}
          title={status === 'ISSUED' ? `Emitir OC-${ord.number}` : `Anular OC-${ord.number}`}
          tone={status === 'CANCELLED' ? 'danger' : 'primary'}
          confirmLabel={status === 'ISSUED' ? 'Emitir' : 'Anular'}
          pending={changeStatus.pending}
          error={changeStatus.error}
          onClose={() => {
            setStatus(null);
            changeStatus.reset();
          }}
          onConfirm={doStatus}
        >
          {status === 'ISSUED'
            ? 'La OC quedará emitida y ya no podrá editarse. Se habilita la recepción.'
            : 'La OC quedará anulada. No puede anularse si ya tiene recepciones.'}
        </Confirm>
      </LookupGate>
    </Page>
  );
}

function InvoiceRef({ order, onSaved }: { order: OrderDetail; onSaved: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(order.invoiceNumber ?? '');
  const [confirm, setConfirm] = useState(false);
  const save = useMutation((_k: string, invoiceNumber: string) => api.put(`/purchase-orders/${order.id}/invoice-reference`, { invoiceNumber }));
  const submit = async () => {
    const r = await save.run(value.trim());
    if (r !== undefined) {
      toast.success('Número de factura guardado');
      setConfirm(false);
      onSaved();
    }
  };
  return (
    <Card title="Referencia de factura">
      <div className="stack">
        {order.invoiceNumber ? (
          <div className="small">
            Factura <Mono>{order.invoiceNumber}</Mono> · cargada el {formatDateTime(order.invoiceLoadedAt)} por {order.invoiceLoadedByName ?? 'Usuario'}
          </div>
        ) : (
          <div className="small muted">Sin factura referenciada.</div>
        )}
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <TextField label="N.º de factura" value={value} maxLength={500} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button variant="sec" disabled={!value.trim() || value.trim() === order.invoiceNumber} onClick={() => setConfirm(true)}>
            Guardar
          </Button>
        </div>
        <div className="small muted">Sólo se registra el número como referencia; no se cargan pagos ni adjuntos.</div>
      </div>
      <Confirm open={confirm} title="Guardar referencia de factura" pending={save.pending} error={save.error} onClose={() => setConfirm(false)} onConfirm={submit}>
        {order.invoiceNumber ? `Reemplaza la referencia ${order.invoiceNumber} por ${value.trim()}.` : `Se asocia la factura ${value.trim()} a OC-${order.number}.`}
      </Confirm>
    </Card>
  );
}

function EditDraft({ order, lk, onClose, onSaved }: { order: OrderDetail; lk: ReturnType<typeof useLookups>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [notes, setNotes] = useState(order.notes ?? '');
  const [lines, setLines] = useState<LineDraft[]>(order.lines.map(lineFrom));
  const [errs, setErrs] = useState<Record<number, string>>({});
  const locked = !!order.quotationId;
  const save = useMutation((_k: string, body: { notes?: string; lines?: Schemas['CommercialLineInput'][] }) => api.patch(`/purchase-orders/${order.id}`, body));
  const submit = async () => {
    const body: { notes?: string; lines?: Schemas['CommercialLineInput'][] } = { notes };
    if (!locked) {
      const v = toCommercial(lines);
      setErrs(v.errors);
      if (!v.ok) return;
      body.lines = v.out;
    }
    const r = await save.run(body);
    if (r !== undefined) {
      toast.success('Los cambios del borrador se guardaron');
      onSaved();
    }
  };
  return (
    <Modal
      open
      side
      title={`Editar OC-${order.number}`}
      onClose={save.pending ? () => {} : onClose}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={save.pending}>Cancelar</Button>
          <Button onClick={submit} loading={save.pending}>Guardar cambios</Button>
        </>
      }
    >
      <TextArea label="Observaciones" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
      {locked ? (
        <div className="note small">La OC está vinculada a una cotización seleccionada: sus renglones no se pueden modificar.</div>
      ) : (
        <CommercialLines lines={lines} onChange={setLines} supplierId={order.supplierId} lk={lk} lockMaterials={false} errors={errs} currency={order.currency} />
      )}
      <ErrorBox error={save.error} />
    </Modal>
  );
}

export default function OrdenDetallePage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readOrders')}>
      <Detalle />
    </RequirePerm>
  );
}
