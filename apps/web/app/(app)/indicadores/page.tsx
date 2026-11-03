'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  DataTable,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  SelectField,
  TextField,
} from '@/components/ui';
import { useAll, useApi } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { api, type Schemas } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
export default function Indicators() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('readEconomic')}>
      <Reports />
    </RequirePerm>
  );
}
const groups = (values: Schemas['MoneyGroup'][]) =>
  values.length ? (
    values.map((g) => (
      <div key={`${g.currency}:${g.taxBasis}`}>
        <b>{formatMoney(g.amount, g.currency)}</b>
        <span className="small muted">
          {' '}
          ·{' '}
          {g.taxBasis === 'EXCLUDED'
            ? '+ IVA'
            : g.taxBasis === 'INCLUDED'
              ? 'IVA incluido'
              : 'IVA sin especificar'}
        </span>
      </div>
    ))
  ) : (
    <span className="small muted">Sin importe comercial disponible</span>
  );
function Reports() {
  const { user } = useSession(),
    [kind, setKind] = useState<'clients' | 'purchases'>(
      user?.role === 'GERENCIA' ? 'clients' : 'purchases',
    ),
    [clientId, setClient] = useState(''),
    [workId, setWork] = useState(''),
    [supplierId, setSupplier] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [downloadError, setDownloadError] = useState<unknown>();
  const clients = useAll<Schemas['Client']>('/clients'),
    works = useAll<Schemas['WorkList']>(
      '/works',
      clientId ? { clientId } : undefined,
    ),
    suppliers = useAll<Schemas['Supplier']>('/suppliers');
  const filters = {
    clientId: clientId || undefined,
    workId: workId || undefined,
    supplierId: supplierId || undefined,
    from: from || undefined,
    to: to || undefined,
    status: status || undefined,
  };
  const q = useApi<{
    data: Schemas['ClientIndicators'] | Schemas['PurchasesReport'];
    pagination: Schemas['Pagination'];
  }>(`/reports/${kind}`, { ...filters, page, pageSize: 25 });
  function change(fn: () => void) {
    fn();
    setPage(1);
  }
  return (
    <Page
      title="Clientes, obras y compras"
      actions={
        <Button
          variant="sec"
          onClick={async () => {
            try {
              await api.download(
                `/reports/${kind}/export`,
                filters,
                `${kind === 'clients' ? 'indicadores-clientes' : 'compras-obra-proveedor'}.xlsx`,
              );
            } catch (e) {
              setDownloadError(e);
            }
          }}
        >
          Exportar Excel
        </Button>
      }
    >
      <Card>
        <div className="formgrid">
          <SelectField
            label="Informe"
            value={kind}
            options={[
              ...(user?.role === 'GERENCIA'
                ? [{ value: 'clients', label: 'Indicadores por cliente' }]
                : []),
              { value: 'purchases', label: 'Compras por obra y proveedor' },
            ]}
            onChange={(e) =>
              change(() => setKind(e.target.value as typeof kind))
            }
          />
          <SelectField
            label="Cliente"
            value={clientId}
            placeholder="Todos"
            options={clients.rows.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(e) =>
              change(() => {
                setClient(e.target.value);
                setWork('');
              })
            }
          />
          <SelectField
            label="Obra"
            value={workId}
            placeholder="Todas / compras generales"
            options={works.rows.map((w) => ({ value: w.id, label: w.name }))}
            onChange={(e) => change(() => setWork(e.target.value))}
          />
          <SelectField
            label="Proveedor"
            value={supplierId}
            placeholder="Todos"
            options={suppliers.rows.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            onChange={(e) => change(() => setSupplier(e.target.value))}
          />
          <TextField
            label="Desde (Argentina)"
            type="date"
            value={from}
            onChange={(e) => change(() => setFrom(e.target.value))}
          />
          <TextField
            label="Hasta inclusive (Argentina)"
            type="date"
            value={to}
            onChange={(e) => change(() => setTo(e.target.value))}
          />
          <SelectField
            label="Estado de compra"
            value={status}
            placeholder="Emitidas / parciales / recibidas"
            options={[
              'DRAFT',
              'ISSUED',
              'PARTIALLY_RECEIVED',
              'RECEIVED',
              'CANCELLED',
            ].map((v, i) => ({
              value: v,
              label: [
                'Borrador',
                'Emitida',
                'Recepción parcial',
                'Recibida',
                'Cancelada',
              ][i],
            }))}
            onChange={(e) => change(() => setStatus(e.target.value))}
          />
        </div>
      </Card>
      <Card title="Totales del filtro completo">
        {!!q.data?.data.totals.unvaluedPurchases && (
          <p className="note">
            {q.data.data.totals.unvaluedPurchases} OC históricas sin importe
            comparable: no se suman como cero. Revisá la política de importes en
            sus documentos.
          </p>
        )}
        <div className="grid2">
          <div>
            <p>Presupuestado vigente</p>
            {groups(q.data?.data.totals.budgeted ?? [])}
          </div>
          <div>
            <p>Compras registradas</p>
            {groups(q.data?.data.totals.purchases ?? [])}
          </div>
        </div>
        <p className="small muted">
          Se conservan separadas monedas y bases impositivas. No se suman
          revisiones anteriores ni se calcula beneficio realizado.
        </p>
      </Card>
      <ErrorBox
        error={
          q.error ??
          downloadError ??
          clients.error ??
          works.error ??
          suppliers.error
        }
      />
      {q.loading ? (
        <Loading />
      ) : (
        <Card bodyClass="">
          {kind === 'clients' ? (
            <DataTable
              rows={
                (q.data?.data as Schemas['ClientIndicators'] | undefined)
                  ?.rows ?? []
              }
              rowKey={(r) => r.clientId ?? 'legacy'}
              columns={[
                {
                  key: 'n',
                  header: 'Cliente',
                  render: (r) =>
                    r.clientId ? (
                      <Link href={`/clientes/${r.clientId}`}>{r.name}</Link>
                    ) : (
                      r.name
                    ),
                },
                {
                  key: 'w',
                  header: 'Obras',
                  render: (r) =>
                    `${r.activeWorks} activas · ${r.completedWorks} finalizadas`,
                },
                {
                  key: 'b',
                  header: 'Presupuestado vigente',
                  render: (r) => groups(r.budgeted),
                },
                {
                  key: 'p',
                  header: 'Compras asociadas',
                  render: (r) => groups(r.purchases),
                },
              ]}
              mobile={(r) => (
                <div>
                  <b>{r.name}</b>
                  <p>
                    {r.activeWorks} activas · {r.completedWorks} finalizadas
                  </p>
                  {groups(r.budgeted)}
                  {groups(r.purchases)}
                </div>
              )}
              empty={<Empty title="Sin clientes para este filtro" />}
            />
          ) : (
            <DataTable
              rows={
                (q.data?.data as Schemas['PurchasesReport'] | undefined)
                  ?.rows ?? []
              }
              rowKey={(r) => r.id}
              columns={[
                {
                  key: 'n',
                  header: 'OC',
                  render: (r) => (
                    <Link href={`/ordenes/${r.id}`}>OC-{r.number}</Link>
                  ),
                },
                {
                  key: 'w',
                  header: 'Obra / proveedor',
                  render: (r) => (
                    <>
                      <b>{r.workName}</b>
                      <div>{r.supplierName}</div>
                    </>
                  ),
                },
                {
                  key: 'd',
                  header: 'Fecha',
                  render: (r) => formatDate(r.createdAt),
                },
                {
                  key: 'a',
                  header: 'Importe',
                  render: (r) => (
                    <>
                      {formatMoney(r.totalAmount, r.currency)} · {r.taxBasis}
                    </>
                  ),
                },
              ]}
              mobile={(r) => (
                <div>
                  <Link href={`/ordenes/${r.id}`}>OC-{r.number}</Link>
                  <p>
                    {r.workName} · {r.supplierName}
                  </p>
                  <b>{formatMoney(r.totalAmount, r.currency)}</b>
                </div>
              )}
              empty={<Empty title="Sin compras para este filtro" />}
            />
          )}
          <PagerBar
            pagination={q.data?.pagination}
            page={page}
            setPage={setPage}
          />
        </Card>
      )}
    </Page>
  );
}
