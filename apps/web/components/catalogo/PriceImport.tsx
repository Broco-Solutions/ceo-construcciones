'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, FileUp } from 'lucide-react';
import {
  Button,
  Card,
  ErrorBox,
  Pill,
  SelectField,
  TextField,
  useToast,
} from '@/components/ui';
import { api, type Schemas } from '@/lib/api';
import type { operations } from '@/lib/openapi';
import { useAll, useMutation } from '@/lib/hooks';
import { parseCsv, readFileBase64 } from '@/components/admin/csv';
import { templateFilename } from '@/lib/download-names';

type Preview =
  operations['post__imports_prices_preview']['responses'][200]['content']['application/json']['data'];
type Result =
  operations['post__imports_prices_commit']['responses'][201]['content']['application/json']['data'];
type Sheet = Schemas['PriceFileSheets']['sheets'][number];
type Issue = Preview['errors'][number];
type Payload = { rows: Schemas['Import_prices_Row'][] } | { csv: string };

const FIELDS = [
  ['materialCode', 'Código material'],
  ['unit', 'Unidad'],
  ['presentationId', 'Presentación'],
  ['price', 'Precio'],
  ['currency', 'Moneda'],
  ['taxBasis', 'Base impositiva'],
  ['effectiveAt', 'Vigencia'],
] as const;
const TECHNICAL_COLUMNS = [
  'externalCode', 'materialCode', 'supplierCode', 'price', 'currency',
  'taxBasis', 'effectiveAt', 'presentationId', 'baseQuantity',
];
const OFFICIAL_FIELDS = FIELDS.slice(0, 4);
const officialMapping = (columns: string[]) =>
  columns.length === OFFICIAL_FIELDS.length &&
  OFFICIAL_FIELDS.every(([, label]) => columns.includes(label))
    ? Object.fromEntries(OFFICIAL_FIELDS.map(([field, label]) => [field, columns.indexOf(label)]))
    : undefined;

type Source = {
  sheets: Sheet[];
  digest: string;
  csv?: string;
};

export function PriceImport({ fromAdministration = false }: { fromAdministration?: boolean }) {
  const suppliers = useAll<Schemas['Supplier']>('/suppliers', { active: true });
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const [name, setName] = useState('');
  const [source, setSource] = useState<Source>();
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [supplierId, setSupplier] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [taxBasis, setTax] = useState<Schemas['TaxBasis']>('EXCLUDED');
  const [date, setDate] = useState('');
  const [reviewed, setReviewed] = useState<{ preview: Preview; payload: Payload }>();
  const [mappingErrors, setMappingErrors] = useState<Issue[]>([]);
  const [result, setResult] = useState<Result>();
  const [localError, setLocalError] = useState<unknown>();
  const [reading, setReading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<unknown>();
  const commit = useMutation(async (
    key: string, payload: Payload, confirmationHash: string, baselineHash: string,
  ) => (await api.post<{ data: Result }>('/imports/prices/commit', {
    ...payload, reviewPrices: true, baselineHash, confirmationHash,
  }, { idempotencyKey: key })).data);
  const sheet = source?.sheets[sheetIndex];
  const official = !!sheet && !!officialMapping(sheet.columns);
  const legacy = source?.csv !== undefined;
  const canReview = !!source && (legacy || !!(
    sheet?.rows.length && supplierId && date &&
    ['materialCode', 'unit', 'price'].every((f) => mapping[f] !== undefined)
  ));
  const stale = commit.error?.code === 'PRICE_PREVIEW_STALE' || commit.error?.code === 'PREVIEW_REQUIRED';

  function invalidate() {
    const current = ++generation.current;
    setReviewed(undefined);
    setMappingErrors([]);
    setLocalError(undefined);
    setResult(undefined);
    setReviewing(false);
    commit.reset();
    return current;
  }

  async function download(format: 'xlsx' | 'csv') {
    setDownloading(true);
    setDownloadError(undefined);
    try {
      await api.download('/imports/prices/template', { format }, templateFilename('prices', undefined, format), true);
    } catch (error) {
      setDownloadError(error);
    } finally {
      setDownloading(false);
    }
  }

  async function read(file: File) {
    const current = invalidate();
    setSource(undefined);
    setName(file.name);
    setSheetIndex(0);
    setMapping({});
    setReading(true);
    try {
      const csv = /\.csv$/i.test(file.name);
      if (!csv && !/\.xlsx$/i.test(file.name)) throw Error('Elegí un archivo .xlsx o .csv.');
      if (fromAdministration && csv && file.size <= 1_500_000) {
        const text = await file.text();
        const header = parseCsv(text.trimStart().split(/\r\n?|\n/, 1)[0])[0]?.map((column) => column.trim());
        if (header?.length === TECHNICAL_COLUMNS.length && TECHNICAL_COLUMNS.every((key) => header.includes(key))) {
          if (current === generation.current) setSource({ csv: text, sheets: [], digest: '' });
          return;
        }
      }
      if (file.size > 1_000_000) throw Error('La lista de precios admite hasta 1 MB.');
      const base64 = await readFileBase64(file);
      if (current !== generation.current) return;
      const response = await api.post<{ data: Schemas['PriceFileSheets'] }>('/price-files', { name: file.name, base64 });
      const officialData = response.data.sheets.find((item) => item.name === 'Datos' && officialMapping(item.columns));
      const sheets = officialData ? [officialData] : response.data.sheets.filter((item) => item.rows.length);
      if (!sheets.length) throw Error('La hoja de datos está vacía. Agregá al menos una fila.');
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
      if (current !== generation.current) return;
      const digest = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      setSource({ sheets, digest });
      setMapping(officialMapping(sheets[0].columns) ?? {});
    } catch (error) {
      if (current === generation.current) setLocalError(error);
    } finally {
      if (current === generation.current) setReading(false);
    }
  }

  async function review() {
    if (!source || !canReview || reading || commit.pending) return;
    const current = invalidate();
    setReviewing(true);
    try {
      let issues: Issue[] = [];
      let payload: Payload;
      if (source.csv !== undefined) payload = { csv: source.csv };
      else {
        if (!sheet) return;
        const normalized = await api.post<{
          data: { rows: Schemas['Import_prices_Row'][]; errors: Issue[] };
        }>('/price-mapping', {
          supplierId, source: source.digest, columns: mapping, rows: sheet.rows,
          rowNumbers: sheet.rowNumbers, official, currency, taxBasis, effectiveAt: `${date}T03:00:00.000Z`,
        });
        if (current !== generation.current) return;
        issues = normalized.data.errors;
        payload = { rows: normalized.data.rows };
      }
      const response = await api.post<{ data: Preview }>('/imports/prices/preview', { ...payload, reviewPrices: true });
      if (current === generation.current) {
        setMappingErrors(issues);
        setReviewed({
          preview: { ...response.data, valid: response.data.valid && issues.length === 0 },
          payload,
        });
      }
    } catch (error) {
      if (current === generation.current) setLocalError(error);
    } finally {
      if (current === generation.current) setReviewing(false);
    }
  }

  async function confirm() {
    const preview = reviewed?.preview;
    if (!reviewed || !preview?.valid || !preview.baselineHash || reading || reviewing || stale) return;
    const current = generation.current;
    const response = await commit.run(reviewed.payload, preview.confirmationHash, preview.baselineHash);
    if (!response || current !== generation.current) return;
    setResult(response);
    setReviewed(undefined);
    toast.success('Lista de precios importada');
  }

  const preview = reviewed?.preview;
  const table = preview?.table ?? (sheet && {
    columns: sheet.columns,
    rows: sheet.rows.map((values, i) => ({ row: sheet.rowNumbers[i], values })),
  });
  const errors = new Map<number, string[]>();
  for (const { row, message } of preview?.errors ?? []) {
    const number = sheet?.rowNumbers[row - 1] ?? row;
    errors.set(number, [...(errors.get(number) ?? []), message]);
  }
  for (const { row, message } of mappingErrors) {
    errors.set(row, [...(errors.get(row) ?? []), message]);
  }
  const differences = new Map(preview?.differences?.map((d) => [sheet?.rowNumbers[d.row - 1] ?? d.row, d]));
  const locked = reading || commit.pending;

  return (
    <Card title="Importar lista Excel / CSV">
      <div className="stack">
        <p className="small muted">
          {fromAdministration
            ? 'Formatos admitidos: XLSX y CSV. La plantilla oficial de precios reconoce las columnas automáticamente. También podés utilizar otras listas compatibles asignando sus columnas.'
            : 'Descargá la plantilla Excel y completá la hoja Datos sin modificar sus encabezados. Consultá la hoja Contexto para conocer el formato. También podés importar otras listas Excel o CSV compatibles asignando sus columnas.'}
        </p>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button variant="sec" onClick={() => download('xlsx')} loading={downloading}>
            <Download /> Descargar plantilla Excel
          </Button>
          {fromAdministration && (
            <Button variant="ghost" onClick={() => download('csv')} disabled={downloading}>
              Descargar plantilla CSV técnica
            </Button>
          )}
        </div>
        <ErrorBox error={downloadError} />
        {legacy ? (
          <div className="note">CSV técnico. Se usarán el proveedor, la moneda, la base impositiva y la vigencia de cada fila.</div>
        ) : (
          <div className="formgrid">
            <SelectField label="Proveedor de la lista" value={supplierId} placeholder="Elegir…"
              options={suppliers.rows.map((s) => ({ value: s.id, label: s.name })) ?? []}
              disabled={locked} onChange={(e) => { invalidate(); setSupplier(e.target.value); }} />
            <SelectField label="Moneda" value={currency} options={[{ value: 'ARS', label: 'ARS' }, { value: 'USD', label: 'USD' }]}
              disabled={locked} onChange={(e) => { invalidate(); setCurrency(e.target.value as 'ARS' | 'USD'); }} />
            <SelectField label="Base impositiva" value={taxBasis}
              options={[
                { value: 'EXCLUDED', label: '+ IVA' }, { value: 'INCLUDED', label: 'IVA incluido' },
                { value: 'UNSPECIFIED', label: 'No especificado' },
              ]}
              disabled={locked} onChange={(e) => { invalidate(); setTax(e.target.value as Schemas['TaxBasis']); }} />
            <TextField label="Fecha de vigencia" type="date" value={date}
              disabled={locked} onChange={(e) => { invalidate(); setDate(e.target.value); }} />
          </div>
        )}
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button onClick={() => input.current?.click()} disabled={commit.pending}>
            <FileUp /> Importar archivo
          </Button>
          <input ref={input} type="file" aria-label="Archivo de precios (.xlsx / .csv)"
            accept=".xlsx,.csv" hidden disabled={commit.pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void read(file);
            }} />
          {name && <span className="small muted">{name}</span>}
        </div>
        {reading && <div className="note" role="status">Leyendo el archivo…</div>}
        {sheet && !official && (
          <>
            <SelectField label="Hoja de datos" value={String(sheetIndex)}
              options={source?.sheets.map((s, i) => ({ value: String(i), label: s.name })) ?? []}
              disabled={locked} onChange={(e) => {
                invalidate();
                const index = Number(e.target.value);
                setSheetIndex(index);
                setMapping(source ? officialMapping(source.sheets[index].columns) ?? {} : {});
              }} />
            <div className="formgrid">
              {FIELDS.map(([field, label]) => (
                <SelectField key={field} label={`Columna: ${label}`}
                  value={mapping[field] === undefined ? '' : String(mapping[field])} placeholder="Sin mapear"
                  options={sheet.columns.map((c, i) => ({ value: String(i), label: `${i + 1}. ${c || 'Sin encabezado'}` }))}
                  disabled={locked} onChange={(e) => {
                    invalidate();
                    const value = e.target.value;
                    setMapping((old) => {
                      const next = { ...old };
                      if (value === '') delete next[field];
                      else next[field] = Number(value);
                      return next;
                    });
                  }} />
              ))}
            </div>
          </>
        )}
        {source && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Button loading={reviewing} disabled={!canReview || locked} onClick={review}>
              Revisar diferencias
            </Button>
            {!legacy && !date && <span className="small muted">Falta indicar la fecha de vigencia.</span>}
          </div>
        )}
        {table && (preview || mappingErrors.length > 0) && (
          <>
            <p className="small" role="status">
              Resultado de la revisión: {table.rows.length} filas · {table.rows.length - errors.size} válidas · {errors.size} con errores
            </p>
            <div className="tblwrap" style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Fila</th>
                    {table.columns.map((column, i) => <th key={i}>{column || 'Sin encabezado'}</th>)}
                    {preview && <><th>Anterior</th><th>Nuevo</th><th>Equivalencia / vigencia</th></>}
                    <th>Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map(({ row, values }) => {
                    const change = differences.get(row);
                    return (
                      <tr key={row}>
                        <td>{row}</td>
                        {values.map((value, i) => <td key={i}>{value}</td>)}
                        {preview && <>
                          <td>{change?.previous?.price ?? (change ? 'Sin referencia' : '')}</td>
                          <td>{change && `${change.newPrice} ${change.currency} · ${change.taxBasis === 'INCLUDED' ? 'IVA incluido' : change.taxBasis === 'EXCLUDED' ? '+ IVA' : 'No especificado'}`}</td>
                          <td>{change && `Por ${change.baseQuantity} · ${change.effectiveAt.slice(0, 10)}`}</td>
                        </>}
                        <td>{errors.has(row) ? <span className="err">{errors.get(row)?.join(' ')}</span> : <Pill tone="ok">OK</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Button loading={commit.pending}
              disabled={!preview?.valid || locked || reviewing || stale} onClick={confirm}>
              Confirmar importación validada
            </Button>
          </>
        )}
        {result && <div className="alert ok" role="status" data-testid="price-import-result">
          <b>Importación confirmada:</b>{' '}
          {result.importedRows === 1 ? '1 fila importada' : `${result.importedRows} filas importadas`} ·{' '}
          {result.createdIds.length === 1 ? '1 referencia creada' : `${result.createdIds.length} referencias creadas`}.
        </div>}
        <ErrorBox error={localError ?? commit.error ?? suppliers.error} />
      </div>
    </Card>
  );
}
