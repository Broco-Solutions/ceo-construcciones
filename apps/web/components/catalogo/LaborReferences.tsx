'use client';
import { useState } from 'react';
import { api, type Schemas } from '@/lib/api';
import { useApi, usePaged, useMutation } from '@/lib/hooks';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import { useNavigation, useNavigationBlocker } from '@/lib/navigation';
import {
  formatMoney,
  formatReferenceDate,
  parseDecimalInput,
  referenceDateInputToIso,
} from '@/lib/format';
import {
  Button,
  Card,
  DataTable,
  DecimalField,
  TextField,
  SelectField,
  Modal,
  Empty,
  ErrorBox,
  Loading,
  PagerBar,
  Pill,
  useToast,
} from '@/components/ui';
type Resource = Schemas['LaborResourceDetail'];
export function LaborReferences() {
  const { can } = useSession(),
    toast = useToast();
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState<Resource | null>(null),
    [history, setHistory] = useState<Resource | null>(null);
  const list = usePaged<Resource>('/labor-resources', { q: search });
  const reference = (r: Resource) =>
    new Set(
      r.rates.map((p) => JSON.stringify([p.series, p.currency, p.taxBasis])),
    ).size > 1
      ? undefined
      : r.rates.find(
          (p) =>
            p.effectiveAt === null || new Date(p.effectiveAt) <= new Date(),
        );
  if (list.error) return <ErrorBox error={list.error} onRetry={list.reload} />;
  return (
    <div className="stack">
      <p className="note">
        Registrar una tarifa agrega una referencia al historial. Las actividades
        vinculadas recalculan su costo; los presupuestos existentes requieren
        revisar y aceptar diferencias.
      </p>
      <Card title="Mano de obra" bodyClass="">
        <div className="bd">
          <TextField
            label="Buscar concepto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {list.loading && !list.data ? (
          <Loading />
        ) : (
          <DataTable
            rows={list.rows}
            rowKey={(r) => r.id}
            empty={<Empty title="Sin conceptos de mano de obra" />}
            columns={[
              {
                key: 'name',
                header: 'Concepto',
                render: (r) => (
                  <>
                    <b>{r.name}</b>
                    <div className="muted small">
                      {r.kind === 'CATEGORY' ? 'Categoría' : 'Servicio'} ·{' '}
                      {r.unit}
                    </div>
                  </>
                ),
              },
              {
                key: 'price',
                header: 'Tarifa de referencia',
                render: (r) => {
                  const p = reference(r);
                  return p ? (
                    <>
                      <b>
                        {formatMoney(p.value, p.currency)} / {r.unit}
                      </b>
                      <div className="muted small">
                        {p.taxBasis === 'UNSPECIFIED'
                          ? 'IVA no informado'
                          : p.taxBasis === 'INCLUDED'
                            ? 'IVA incluido'
                            : 'Sin IVA'}
                      </div>
                    </>
                  ) : (
                    <Pill tone="warn">
                      {r.rates.length ? 'Elegir referencia' : 'Sin tarifa'}
                    </Pill>
                  );
                },
              },
              {
                key: 'source',
                header: 'Fuente y fecha',
                render: (r) => {
                  const p = reference(r);
                  return p ? (
                    <>
                      <span>{p.source}</span>
                      <div className="muted small">
                        {formatReferenceDate(p.dateLabel, p.datePrecision)} ·{' '}
                        {p.referenceState === 'HISTORICAL'
                          ? 'Referencia histórica'
                          : 'Registrada por usuario'}
                      </div>
                    </>
                  ) : (
                    <span className="muted">Datos por revisar</span>
                  );
                },
              },
              {
                key: 'actions',
                header: '',
                render: (r) => (
                  <div className="row">
                    <Button
                      variant="sec"
                      size="sm"
                      onClick={() => setHistory(r)}
                    >
                      Ver historial
                    </Button>
                    {can('editBudget') && (
                      <Button size="sm" onClick={() => setSelected(r)}>
                        Registrar tarifa
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
        <PagerBar
          pagination={list.pagination}
          page={list.page}
          setPage={list.setPage}
        />
      </Card>
      {selected && (
        <RateForm
          resource={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            list.reload();
            toast.success(
              'Tarifa registrada. Los presupuestos conservan sus costos hasta revisarlos.',
            );
          }}
        />
      )}
      <Modal
        open={!!history}
        title={`Historial · ${history?.name ?? ''}`}
        onClose={() => setHistory(null)}
      >
        {history && <LaborHistory resource={history} />}
      </Modal>
    </div>
  );
}
function LaborHistory({ resource }: { resource: Resource }) {
  const history = usePaged<Schemas['LaborRate']>('/labor-rates', {
    resourceId: resource.id,
  });
  if (history.error)
    return <ErrorBox error={history.error} onRetry={history.reload} />;
  return (
    <div className="stack">
      {history.loading && !history.data ? (
        <Loading />
      ) : history.rows.length ? (
        history.rows.map((r) => (
          <div className="note" key={r.id}>
            <b>
              {formatMoney(r.value, r.currency)} / {resource.unit}
            </b>
            <div>
              {formatReferenceDate(r.dateLabel, r.datePrecision)} · {r.source}
            </div>
          </div>
        ))
      ) : (
        <Empty title="Sin tarifas registradas" />
      )}
      <PagerBar
        pagination={history.pagination}
        page={history.page}
        setPage={history.setPage}
      />
    </div>
  );
}
function RateForm({
  resource,
  onClose,
  onSaved,
}: {
  resource: Resource;
  onClose: () => void;
  onSaved: () => void;
}) {
  const impact = useApi<{ data: Resource }>(`/labor-resources/${resource.id}`);
  const available = resource.rates.filter(
    (r) => r.effectiveAt === null || new Date(r.effectiveAt) <= new Date(),
  );
  const seriesOptions = [...new Set(available.map((r) => r.series))];
  const [series, setSeries] = useState(
    seriesOptions.length === 1
      ? seriesOptions[0]
      : seriesOptions.length === 0
        ? resource.code
        : '',
  );
  const previous = available.find((r) => r.series === series);
  const [value, setValue] = useState(''),
    [date, setDate] = useState(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    ),
    [source, setSource] = useState('Actualización de referencia'),
    [currency, setCurrency] = useState(previous?.currency ?? 'ARS'),
    [tax, setTax] = useState(previous?.taxBasis ?? 'UNSPECIFIED');
  const save = useMutation((_key: string, body: Schemas['LaborRateInput']) =>
    api.post('/labor-rates', body),
  );
  const { blocking } = useNavigation();
  async function persist() {
    const parsed = parseDecimalInput(value);
    if (parsed === null || parsed.startsWith('-') || !series) return false;
    const result = await save.run({
      resourceId: resource.id,
      value: parsed,
      currency,
      taxBasis: tax,
      effectiveAt: referenceDateInputToIso(date) ?? null,
      dateLabel: date,
      datePrecision: 'DAY',
      source,
      series,
    });
    if (result) {
      onSaved();
      return true;
    }
    return false;
  }
  useNavigationBlocker({
    dirty: !!value.trim() || source !== 'Actualización de referencia',
    save: persist,
    onPrompt: () => {},
  });
  return (
    <Modal
      open={!blocking}
      title={`Registrar tarifa · ${resource.name}`}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          await persist();
        }}
      >
        <fieldset className="stack form-fields" disabled={save.pending}>
          <p>
            Se agrega una tarifa por {resource.unit}. Las tarifas anteriores y
            los presupuestos se conservan.
          </p>
          <div className="note small">
            {impact.loading ? (
              'Consultando actividades vinculadas…'
            ) : (
              <>
                {impact.data?.data.linkedActivities?.length ?? 0} actividades
                vinculadas.{' '}
                {impact.data?.data.linkedActivities?.slice(0, 5).map((a) => (
                  <div key={a.id}>
                    <Link href={`/apu/${a.id}`}>{a.name}</Link>
                  </div>
                ))}{' '}
                Los presupuestos se actualizan sólo tras revisar y aceptar
                diferencias.
              </>
            )}
          </div>
          {seriesOptions.length > 1 && (
            <SelectField
              label="Serie de referencia"
              value={series}
              placeholder="Elegir referencia"
              options={seriesOptions.map((value) => ({
                value,
                label:
                  available.find((r) => r.series === value)?.source ?? value,
              }))}
              onChange={(e) => setSeries(e.target.value)}
            />
          )}
          <DecimalField
            label={`Tarifa por ${resource.unit}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
          <TextField
            label="Fecha de referencia"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <TextField
            label="Fuente"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
          />
          <SelectField
            label="Moneda"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            options={[
              { value: 'ARS', label: 'ARS' },
              { value: 'USD', label: 'USD' },
            ]}
          />
          <SelectField
            label="Tratamiento de IVA"
            value={tax}
            onChange={(e) => setTax(e.target.value as typeof tax)}
            options={[
              { value: 'UNSPECIFIED', label: 'No informado' },
              { value: 'EXCLUDED', label: 'Sin IVA' },
              { value: 'INCLUDED', label: 'IVA incluido' },
            ]}
          />
          {save.error && <ErrorBox error={save.error} />}
          <div className="row">
            <Button type="submit" disabled={save.pending}>
              Registrar tarifa
            </Button>
            <Button variant="sec" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
