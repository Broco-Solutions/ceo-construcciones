'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, Confirm, DefList, ErrorBox, Loading, SelectField, TextArea, TextField, useToast } from '@/components/ui';
import { api, fieldErrors, type Schemas } from '@/lib/api';
import { useApi, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatMoney, formatQty } from '@/lib/format';
import { ExistingOrdersWarning, LOCATION_KIND, LookupGate, TAX_BASIS, useExistingOrders, useLookups, type RequestDetail, type TaxBasis } from '@/components/compras/common';
import { CommercialLines, emptyLine, lineFrom, toCommercial, type LineDraft } from '@/components/compras/CommercialLines';

function NuevaOC() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const requestId = sp.get('requestId');
  const quotationId = sp.get('quotationId');
  const lk = useLookups({ suppliers: true });
  const req = useApi<{ data: RequestDetail }>(requestId ? `/requests/${requestId}` : null);
  const quo = useApi<{ data: Schemas['QuotationDetail'] }>(quotationId ? `/quotations/${quotationId}` : null);
  const mode: 'quotation' | 'request' | 'general' = quotationId ? 'quotation' : requestId ? 'request' : 'general';

  const [supplierId, setSupplierId] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [taxBasis, setTaxBasis] = useState<TaxBasis>('UNSPECIFIED');
  const [destinationId, setDestinationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [lineErr, setLineErr] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState(false);
  // Advertencia (no bloqueo) de OC no anuladas ya creadas para el mismo pedido o cotización.
  const existing = useExistingOrders(requestId, quotationId);
  const [ackExisting, setAckExisting] = useState(false);
  const needsAck = existing.rows.length > 0 && !ackExisting;

  const workId = req.data?.data.workId ?? null;
  useEffect(() => {
    if (req.data && mode === 'request') setLines(req.data.data.lines.map((l) => emptyLine(l.materialId, l.quantity)));
  }, [req.data, mode]);
  useEffect(() => {
    const q = quo.data?.data;
    if (!q) return;
    setSupplierId(q.supplierId);
    setCurrency(q.currency);
    setTaxBasis(q.taxBasis);
    setLines(q.lines.map(lineFrom));
  }, [quo.data]);
  const destOptions = lk.locations.rows.filter((l) => l.active && (workId ? l.workId === workId || !l.workId : !l.workId));
  useEffect(() => {
    if (destinationId || !lk.locations.rows.length) return;
    const def = workId ? lk.locations.rows.find((l) => l.workId === workId) : undefined;
    if (def) setDestinationId(def.id);
  }, [lk.locations.rows, workId, destinationId]);

  // Un replay idempotente con clave del contrato anterior devuelve LegacyOrderDetail (sin createdByName/pendingQuantity/importes):
  // sólo se usan id/number, y el detalle se consulta con GET /purchase-orders/{id} al navegar, sin repetir el POST.
  const create = useMutation((key: string, body: Schemas['OrderInput']) => api.post<{ data: Schemas['OrderWriteResult'] }>('/purchase-orders', body, { idempotencyKey: key }));
  const errs = fieldErrors(create.error);
  const v = toCommercial(lines);

  const review = () => {
    setLineErr(v.errors);
    if (v.ok && supplierId && destinationId && (currency === 'ARS' || currency === 'USD') && !needsAck) setConfirm(true);
  };
  const submit = async () => {
    const r = await create.run({
      supplierId,
      workId: workId ?? undefined,
      requestId: requestId ?? undefined,
      quotationId: quotationId ?? undefined,
      destinationId,
      currency,
      taxBasis,
      notes: notes.trim() || undefined,
      lines: v.out,
    });
    if (r) {
      toast(`OC-${r.data.number} creada en borrador`);
      router.push(`/ordenes/${r.data.id}`);
    }
  };

  const loading = (requestId && !req.data && !req.error) || (quotationId && !quo.data && !quo.error);
  const title = mode === 'general' ? 'Nueva OC general (sin obra)' : mode === 'quotation' ? 'Nueva OC desde cotización' : 'Nueva OC desde pedido';

  return (
    <Page title={title} crumb={<Link href="/ordenes">Órdenes de compra</Link>}>
      <LookupGate lk={lk}>
        <ErrorBox error={req.error ?? quo.error} />
        {loading ? (
          <Loading />
        ) : (
          <>
            <Card title="Datos de la orden">
              <div className="stack">
                <DefList
                  items={[
                    ['Obra', mode === 'general' ? 'Sin obra: destino galpón o patio' : lk.workName(workId)],
                    ['Pedido', requestId ? <Link key="p" href={`/pedidos/${requestId}`}>Ver pedido</Link> : '—'],
                    ['Cotización', quotationId ? 'Seleccionada (precios y proveedor fijos)' : '—'],
                  ]}
                />
                <div className="formgrid">
                  <SelectField label="Proveedor" value={supplierId} disabled={mode === 'quotation'} onChange={(e) => setSupplierId(e.target.value)} placeholder="Elegí proveedor" options={lk.suppliers.rows.filter((s) => s.active || s.id === supplierId).map((s) => ({ value: s.id, label: s.name }))} error={errs.supplierId} />
                  <SelectField
                    label="Destino de entrega"
                    value={destinationId}
                    onChange={(e) => setDestinationId(e.target.value)}
                    placeholder="Elegí destino"
                    options={destOptions.map((l) => ({ value: l.id, label: `${l.name} (${LOCATION_KIND[l.kind]})` }))}
                    hint={mode === 'general' ? 'Obligatorio: galpón o patio.' : undefined}
                    error={errs.destinationId}
                  />
                  <SelectField label="Moneda" value={currency} disabled={mode === 'quotation'} onChange={(e) => setCurrency(e.target.value)} options={[{ value: 'ARS', label: 'ARS — Peso argentino' }, { value: 'USD', label: 'USD — Dólar estadounidense' }]} error={errs.currency} />
                  <SelectField label="Base impositiva" value={taxBasis} disabled={mode === 'quotation'} onChange={(e) => setTaxBasis(e.target.value as TaxBasis)} options={Object.entries(TAX_BASIS).map(([k, l]) => ({ value: k, label: l }))} />
                </div>
                {currency !== 'ARS' && currency !== 'USD' && (
                  <div className="alert bad" role="alert">
                    La cotización usa la moneda {currency}, que todavía no se admite para crear órdenes de compra. Sólo se permiten ARS y USD.
                  </div>
                )}
                <TextArea label="Observaciones" value={notes} maxLength={4000} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </Card>
            <Card title="Renglones">
              {mode === 'quotation' ? (
                <div>
                  {lines.map((l) => (
                    <div key={l.materialId} className="cmp-line">
                      <div className="nm">
                        <b>{lk.materialLabel(l.materialId)}</b>
                        <span>
                          {formatMoney(v.out.find((x) => x.materialId === l.materialId)?.unitPrice, currency)} por {formatQty(v.out.find((x) => x.materialId === l.materialId)?.baseQuantity, lk.unitOf(l.materialId))}
                        </span>
                      </div>
                      <b>{formatQty(v.out.find((x) => x.materialId === l.materialId)?.quantity, lk.unitOf(l.materialId))}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <CommercialLines lines={lines} onChange={setLines} supplierId={supplierId} lk={lk} lockMaterials={mode === 'request'} errors={lineErr} currency={currency} />
              )}
            </Card>
            {(requestId || quotationId) && <ExistingOrdersWarning existing={existing} ack={ackExisting} onAck={setAckExisting} />}
            <ErrorBox error={create.error} />
            <div className="cmp-bar">
              <Link className="btn sec lg" href="/ordenes">Cancelar</Link>
              <Button size="lg" onClick={review} disabled={!supplierId || !destinationId || existing.loading || needsAck || (currency !== 'ARS' && currency !== 'USD')}>Revisar y crear</Button>
            </div>
          </>
        )}
        <Confirm
          open={confirm}
          title="Crear orden de compra"
          pending={create.pending}
          error={create.error}
          onClose={() => setConfirm(false)}
          onConfirm={submit}
        >
          Se creará una OC en <b>borrador</b> para {lk.supplierName(supplierId)} con {v.out.length} renglones ({currency}, {TAX_BASIS[taxBasis]}), destino {lk.locationName(destinationId)}. Podrás revisarla antes de emitirla.
          {existing.rows.length > 0 && (
            <div className="small" style={{ color: 'var(--warn)', marginTop: 8 }} data-testid="oc-duplicate-confirm-note">
              Atención: ya hay {existing.rows.length} OC no anulada{existing.rows.length === 1 ? '' : 's'} para este {quotationId ? 'pedido/cotización' : 'pedido'} ({existing.rows.map((o) => `OC-${o.number}`).join(', ')}).
            </div>
          )}
        </Confirm>
      </LookupGate>
    </Page>
  );
}

export default function NuevaOCPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('processPurchases')}>
      <Suspense fallback={<Loading />}>
        <NuevaOC />
      </Suspense>
    </RequirePerm>
  );
}
