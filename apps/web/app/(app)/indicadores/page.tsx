'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppRouter } from '@/lib/navigation';
import { BarChart } from '@/components/reportes/BarChart';

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
      <Suspense fallback={<Loading/>}><Reports /></Suspense>
    </RequirePerm>
  );
}
const taxLabel=(tax:string)=>({EXCLUDED:'IVA no incluido',INCLUDED:'IVA incluido',UNSPECIFIED:'IVA no especificado'}[tax]??tax);
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
  const {user}=useSession(),router=useAppRouter(),sp=useSearchParams();
  const kind=sp.get('kind')==='purchases'||user?.role!=='GERENCIA'?'purchases':'clients';
  const clientId=sp.get('clientId')??'',workId=sp.get('workId')??'',supplierId=sp.get('supplierId')??'',from=sp.get('from')??'',to=sp.get('to')??'',status=sp.get('status')??'',general=sp.get('general')??'';
  const [page,setPage]=useState(1),[downloadError,setDownloadError]=useState<unknown>();
  const clients={rows:[] as Schemas['Client'][],error:null},works={rows:[] as Schemas['WorkList'][],error:null},suppliers={rows:[] as Schemas['Supplier'][],error:null};
  const filters={general:general||undefined,clientId:clientId||undefined,workId:workId||undefined,supplierId:supplierId||undefined,from:from||undefined,to:to||undefined,status:status||undefined};
  function update(patch:Record<string,string>){const next=new URLSearchParams(sp.toString());for(const [key,value] of Object.entries(patch))value?next.set(key,value):next.delete(key);setPage(1);router.replace('/indicadores'+(next.size?'?'+next.toString():''));}
  const setKind=(kind:string)=>update({kind}),setClient=(clientId:string)=>update({clientId,workId:'',general:''}),setWork=(workId:string)=>update({workId,general:''}),setSupplier=(supplierId:string)=>update({supplierId}),setFrom=(from:string)=>update({from}),setTo=(to:string)=>update({to}),setStatus=(status:string)=>update({status});
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
      crumb={<Link href="/reportes">Seguimiento físico y stock</Link>}
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
        <Button size="sm" variant="ghost" onClick={()=>router.replace('/indicadores')}>Restablecer filtros</Button>
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
            entity="clients" label="Cliente"
            value={clientId}
            placeholder="Todos"
            options={clients.rows.map((c) => ({ value: c.id, label: c.name }))}
            onChange={(e) =>
              change(() => {
                setClient(e.target.value);
              })
            }
          />
          <SelectField
            entity="works" entityQuery={{clientId:clientId||undefined}} label="Obra"
            value={workId}
            placeholder="Todas / compras generales"
            options={works.rows.map((w) => ({ value: w.id, label: w.name }))}
            onChange={(e) => change(() => setWork(e.target.value))}
          />
          <SelectField
            entity="suppliers" label="Proveedor"
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
      {q.loading?<Loading/>:!q.error&&q.data&&<>
      <div className="report-kpis">
       {q.data.data.executive&&<><Card title="Obras activas"><b className="kpi-number">{q.data.data.executive.activeWorks}</b><small>Estado actual · cliente/obra seleccionados</small></Card><Card title="OC pendientes de recepción"><b className="kpi-number">{q.data.data.executive.pendingOrders}</b><small>Órdenes emitidas o parciales del filtro</small></Card></>}
       {kind==='clients'&&<Card title="Presupuestado comercial vigente">{groups(q.data.data.totals.budgeted)}</Card>}
       <Card title="Compras registradas">{groups(q.data.data.totals.purchases)}</Card>
      </div>
      <p className="small muted">Compras por fecha de creación de OC y estado actual. Presupuestado: última revisión emitida de cada presupuesto, por fecha de emisión. Proveedor y estado sólo limitan compras; obras activas no usa período. Monedas/IVA separados, sin cálculo de beneficio realizado.</p>
      {!!q.data.data.totals.unvaluedPurchases&&<p className="alert warn">{q.data.data.totals.unvaluedPurchases} OC sin importe comparable: no se suman como cero.</p>}
      {q.data.data.executive&&<ExecutiveCharts kind={kind} data={q.data.data.executive} filters={filters} onDrill={update}/>}
      </>}
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
      ) : q.error ? null : (
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
                      {formatMoney(r.totalAmount, r.currency)} · {taxLabel(r.taxBasis)}
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

function ExecutiveCharts({kind,data,filters,onDrill}:{kind:string;data:Schemas['ExecutiveSummary'];filters:Record<string,string|undefined>;onDrill:(patch:Record<string,string>)=>void}){
 const [selected,setSelected]=useState('');
 const options=[...new Set([...data.purchasesByMonth,...data.budgetedByClient].map(p=>p.currency+':'+p.taxBasis))];
 const group=options.includes(selected)?selected:options[0]??'',currency=group.split(':')[0];
 const points=(rows:Schemas['ExecutivePoint'][])=>rows.filter(p=>p.currency+':'+p.taxBasis===group).map(p=>({key:p.key,label:p.label,value:p.amount}));
 const money=(value:string)=>formatMoney(value,currency);
 const labels:Record<string,string>={DRAFT:'Borrador',ISSUED:'Emitida',PARTIALLY_RECEIVED:'Recepción parcial',RECEIVED:'Recibida',CANCELLED:'Cancelada'};
 const chart=<BarChart title={kind==='clients'?'Presupuestado vigente por cliente':'Compras por mes'} description={kind==='clients'?'Una revisión emitida por presupuesto, dentro del período.':'Importes comparables de todas las OC del filtro, por mes de creación en Argentina.'} rows={points(kind==='clients'?data.budgetedByClient:data.purchasesByMonth)} format={money} onSelect={key=>{if(kind==='clients')onDrill({clientId:key==='legacy'?'':key,workId:''});else{const [y,m]=key.split('-').map(Number);onDrill({from:key+'-01',to:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)});}}}/>;
 return <><div className="filter-toolbar"><SelectField label="Grupo monetario de los gráficos" value={group} options={options.map(k=>({value:k,label:k.split(':')[0]+' · '+taxLabel(k.split(':')[1])}))} onChange={e=>setSelected(e.target.value)}/><p className="small muted">Los demás grupos se muestran separados en los indicadores y en Excel.</p></div><div className="report-charts">{chart}<BarChart title={kind==='clients'?'Compras por obra':'Compras por proveedor'} description="Todo el filtro autorizado; las compras generales conservan su grupo propio." rows={points(kind==='clients'?data.purchasesByWork:data.purchasesBySupplier)} format={money} onSelect={key=>kind==='clients'?onDrill({workId:key==='general'?'':key,...(key==='general'?{general:'true',clientId:''}:{general:''})}):onDrill({supplierId:key})}/><BarChart title="Estado de órdenes de compra" description="Cantidad de órdenes, según su estado actual. No son cantidades de materiales ni importes." rows={data.orderStates.map(s=>({key:s.status,label:labels[s.status]??s.status,value:String(s.count)}))} format={s=>s+' OC'} onSelect={status=>onDrill({status})}/></div></>;
}
