'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Plus } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, Confirm, DefList, Empty, ErrorBox, Loading, Modal, SelectField, TextArea, TextField, useToast } from '@/components/ui';
import { api, fieldErrors, type Schemas } from '@/lib/api';
import { useApi, useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { formatDate, formatDateTime, formatMoney, formatQty } from '@/lib/format';
import { LookupGate, QUOTATION_STATUS, REQUEST_STATUS, StatusPill, TAX_BASIS, useLookups, useUserName, type RequestDetail, type TaxBasis } from '@/components/compras/common';
import { CommercialLines, emptyLine, toCommercial, type LineDraft } from '@/components/compras/CommercialLines';

type Comparison = Schemas['Comparison'];
type Compared = Comparison['quotations'][number];

function Detalle() {
  const { requestId } = useParams<{ requestId: string }>();
  const { can } = useSession();
  const toast = useToast();
  const lk = useLookups({ suppliers: true });
  const userName = useUserName();
  const req = useApi<{ data: RequestDetail }>(`/requests/${requestId}`);
  const cmp = useApi<{ data: Comparison }>(`/quotations/${requestId}/comparison`);
  const [form, setForm] = useState(false);
  const [sel, setSel] = useState<Compared | null>(null);
  const select = useMutation((_k: string, id: string) => api.post(`/quotations/${id}/select`));
  const manage = can('processPurchases');

  const crumb = <Link href="/cotizaciones">Cotizaciones</Link>;
  if (req.error) return <Page title="Cotizaciones" crumb={crumb}><ErrorBox error={req.error} onRetry={req.reload} /></Page>;
  if (!req.data) return <Page title="Cotizaciones" crumb={crumb}><Loading /></Page>;
  const r = req.data.data;
  const quotes = cmp.data?.data.quotations ?? [];
  const selected = quotes.find((q) => q.status === 'SELECTED');
  const open = r.status === 'SUBMITTED' || r.status === 'PROCESSING';

  const doSelect = async () => {
    if (!sel) return;
    const ok = await select.run(sel.id);
    if (ok !== undefined) {
      toast(`Cotización de ${sel.supplier.name} seleccionada`);
      setSel(null);
    }
    cmp.reload();
  };

  return (
    <Page
      title={`Cotizaciones · ${lk.categoryName(r.categoryId)}`}
      crumb={crumb}
      actions={
        <>
          {manage && open && (
            <Button onClick={() => setForm(true)}>
              <Plus size={16} /> Cargar cotización
            </Button>
          )}
          {manage && selected && open && (
            <Link className="btn ok" href={`/ordenes/nueva?requestId=${r.id}&quotationId=${selected.id}`}>
              <FileText size={16} /> Generar OC con la seleccionada
            </Link>
          )}
        </>
      }
    >
      <LookupGate lk={lk}>
        <Card title="Pedido" actions={<StatusPill map={REQUEST_STATUS} value={r.status} />}>
          <DefList
            items={[
              ['Obra', lk.workName(r.workId)],
              ['Requerido para', formatDate(r.requiredAt)],
              ['Materiales', r.lines.map((l) => `${lk.material(l.materialId)?.name ?? 'Material'}: ${formatQty(l.quantity, lk.unitOf(l.materialId))}`).join(' · ')],
              ['Detalle', <Link key="d" href={`/pedidos/${r.id}`}>Ver pedido</Link>],
            ]}
          />
        </Card>

        <Card title="Comparación de ofertas">
          {cmp.error ? (
            <ErrorBox error={cmp.error} onRetry={cmp.reload} />
          ) : cmp.loading && !cmp.data ? (
            <Loading />
          ) : quotes.length === 0 ? (
            <Empty title="Todavía no hay cotizaciones">Cargá las ofertas recibidas de cada proveedor para compararlas.</Empty>
          ) : (
            <div className="stack">
              {!cmp.data!.data.comparable && (
                <div className="alert warn" role="alert">
                  <div className="row" style={{ gap: 8 }}>
                    <AlertTriangle size={16} aria-hidden />
                    <b>Ofertas no comparables directamente.</b>
                  </div>
                  <div className="small">{cmp.data!.data.reason ?? 'Monedas o bases impositivas distintas.'}</div>
                  <div className="small">Compará con criterio propio: no se ordena ni se destaca ninguna oferta por precio.</div>
                </div>
              )}
              <div className="small muted">Las ofertas se muestran en el orden recibido, sin ranking. “Precio por unidad base” lo informa el sistema (precio ÷ cantidad base).</div>
              <div className="grid2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 14 }}>
                {quotes.map((q) => (
                  <div key={q.id} className="card" style={{ padding: 14 }}>
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="row">
                        <b style={{ flex: 1, fontSize: 15 }}>{q.supplier.name}</b>
                        <StatusPill map={QUOTATION_STATUS} value={q.status} />
                      </div>
                      <div className="small">
                        Moneda <b>{q.currency}</b> · {TAX_BASIS[q.taxBasis]}
                        {q.validUntil ? ` · válida hasta ${formatDate(q.validUntil)}` : ''}
                      </div>
                      {q.deliveryTerms && <div className="small">Entrega: {q.deliveryTerms}</div>}
                      {q.notes && <div className="small muted">{q.notes}</div>}
                      <table className="t">
                        <thead>
                          <tr>
                            <th scope="col">Material</th>
                            <th scope="col" className="r">Cant.</th>
                            <th scope="col" className="r">Precio</th>
                            <th scope="col" className="r">Por unidad base</th>
                          </tr>
                        </thead>
                        <tbody>
                          {q.lines.map((l) => {
                            const u = lk.unitOf(l.materialId);
                            return (
                              <tr key={l.id}>
                                <td>{lk.material(l.materialId)?.name ?? 'Material'}</td>
                                <td className="r">{formatQty(l.quantity, u)}</td>
                                <td className="r">
                                  {formatMoney(l.unitPrice, q.currency)}
                                  <div className="small muted">por {formatQty(l.baseQuantity, u)}</div>
                                </td>
                                <td className="r">{formatMoney(l.baseUnitPrice, q.currency)}/{u}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {r.lines.some((rl) => !q.lines.some((l) => l.materialId === rl.materialId)) && <div className="small" style={{ color: 'var(--warn)' }}>No cotiza todos los materiales del pedido.</div>}
                      {q.status === 'SELECTED' ? (
                        <div className="small" style={{ color: 'var(--ok)' }}>
                          <CheckCircle2 size={14} aria-hidden /> Seleccionada por {userName(q.selectedById)} el {formatDateTime(q.selectedAt)}
                        </div>
                      ) : (
                        manage &&
                        open &&
                        q.status === 'RECEIVED' && (
                          <Button variant="sec" onClick={() => setSel(q)}>
                            Seleccionar esta oferta
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {form && (
          <QuotationForm
            request={r}
            lk={lk}
            onClose={() => setForm(false)}
            onSaved={() => {
              setForm(false);
              cmp.reload();
            }}
          />
        )}
        <Confirm
          open={!!sel}
          title="Seleccionar cotización"
          pending={select.pending}
          error={select.error}
          onClose={() => {
            setSel(null);
            select.reset();
          }}
          onConfirm={doSelect}
        >
          Vas a seleccionar la oferta de <b>{sel?.supplier.name}</b> ({sel?.currency}, {sel ? TAX_BASIS[sel.taxBasis] : ''}). {selected ? 'La selección anterior vuelve a quedar como recibida.' : ''} La decisión queda registrada con tu usuario.
        </Confirm>
      </LookupGate>
    </Page>
  );
}

function QuotationForm({ request, lk, onClose, onSaved }: { request: RequestDetail; lk: ReturnType<typeof useLookups>; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [currency, setCurrency] = useState('ARS');
  const [taxBasis, setTaxBasis] = useState<TaxBasis>('UNSPECIFIED');
  const [validUntil, setValidUntil] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>(request.lines.map((l) => emptyLine(l.materialId, l.quantity)));
  const [lineErr, setLineErr] = useState<Record<number, string>>({});
  const save = useMutation((_k: string, body: Schemas['QuotationInput']) => api.post('/quotations', body));
  const errs = fieldErrors(save.error);

  const submit = async () => {
    const v = toCommercial(lines);
    setLineErr(v.errors);
    if (!v.ok || !supplierId || !/^[A-Z]{3}$/.test(currency)) return;
    const ok = await save.run({
      supplierId,
      requestId: request.id,
      currency,
      taxBasis,
      validUntil: validUntil ? new Date(`${validUntil}T23:59:59-03:00`).toISOString() : undefined,
      deliveryTerms: deliveryTerms.trim() || undefined,
      notes: notes.trim() || undefined,
      lines: v.out,
    });
    if (ok !== undefined) {
      toast('Cotización cargada');
      onSaved();
    }
  };

  return (
    <Modal
      open
      side
      title="Cargar cotización"
      onClose={save.pending ? () => {} : onClose}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={save.pending}>Cancelar</Button>
          <Button onClick={submit} loading={save.pending} disabled={!supplierId}>Guardar cotización</Button>
        </>
      }
    >
      <SelectField label="Proveedor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Elegí proveedor" options={lk.suppliers.rows.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} error={errs.supplierId} />
      <div className="formgrid">
        <TextField label="Moneda (ISO)" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} error={errs.currency ?? (!/^[A-Z]{3}$/.test(currency) ? 'Código de 3 letras, p. ej. ARS o USD' : undefined)} />
        <SelectField label="Base impositiva" value={taxBasis} onChange={(e) => setTaxBasis(e.target.value as TaxBasis)} options={Object.entries(TAX_BASIS).map(([k, l]) => ({ value: k, label: l }))} hint={taxBasis === 'UNSPECIFIED' ? 'Sin base declarada la comparación no es directa.' : undefined} />
        <TextField label="Válida hasta" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} error={errs.validUntil} />
      </div>
      <TextField label="Condiciones de entrega" value={deliveryTerms} onChange={(e) => setDeliveryTerms(e.target.value)} />
      <TextArea label="Observaciones" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <CommercialLines lines={lines} onChange={setLines} supplierId={supplierId} lk={lk} lockMaterials errors={lineErr} currency={currency} />
      <ErrorBox error={save.error} />
    </Modal>
  );
}

export default function CotizacionDetallePage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Detalle />
    </RequirePerm>
  );
}
