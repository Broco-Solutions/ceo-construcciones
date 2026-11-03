'use client';
import { useState } from 'react';
import {
  Button,
  Card,
  ErrorBox,
  SelectField,
  TextField,
  useToast,
} from '@/components/ui';
import { api, type Schemas } from '@/lib/api';
import type { operations } from '@/lib/openapi';
import { useAll, useMutation } from '@/lib/hooks';
type Preview =
  operations['post__imports_prices_preview']['responses'][200]['content']['application/json']['data'];
type Sheet = Schemas['PriceFileSheets']['sheets'][number];
const FIELDS = [
  ['materialCode', 'Material / código'],
  ['unit', 'Unidad base'],
  ['price', 'Precio'],
  ['presentationId', 'Presentación (opcional)'],
  ['currency', 'Moneda (opcional)'],
  ['taxBasis', 'IVA (opcional)'],
  ['effectiveAt', 'Vigencia (opcional)'],
] as const;
export function PriceImport() {
  const suppliers = useAll<Schemas['Supplier']>('/suppliers', { active: true }),
    toast = useToast();
  const [supplierId, setSupplier] = useState(''),
    [sheets, setSheets] = useState<Sheet[]>([]),
    [sheetIndex, setSheetIndex] = useState(0),
    [mapping, setMapping] = useState<Record<string, number>>({}),
    [fileSource, setFileSource] = useState(''),
    [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS'),
    [taxBasis, setTax] = useState<Schemas['TaxBasis']>('EXCLUDED'),
    [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [preview, setPreview] = useState<Preview>(),
    [rows, setRows] = useState<Schemas['Import_prices_Row'][]>([]),
    [localError, setLocalError] = useState<unknown>(),
    [busy, setBusy] = useState(false);
  const commit = useMutation((key: string) =>
    api.post(
      '/imports/prices/commit',
      {
        rows,
        reviewPrices: true,
        baselineHash: preview?.baselineHash,
        confirmationHash: preview?.confirmationHash,
      },
      { idempotencyKey: key },
    ),
  );
  const sheet = sheets[sheetIndex];
  function invalidate() {
    setPreview(undefined);
    setRows([]);
    setLocalError(undefined);
    commit.reset();
  }
  async function read(file: File) {
    invalidate();
    setBusy(true);
    try {
      if (file.size > 1_000_000) throw Error('La lista admite hasta 1 MB.');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const r = await api.post<{ data: Schemas['PriceFileSheets'] }>(
        '/price-files',
        { name: file.name, base64 },
      );
      setSheets(r.data.sheets);
      setSheetIndex(0);
      setMapping({});
      const bytes = new Uint8Array(
        await crypto.subtle.digest('SHA-256', await file.arrayBuffer()),
      );
      setFileSource(
        [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(''),
      );
    } catch (e) {
      setLocalError(e);
    } finally {
      setBusy(false);
    }
  }
  async function review() {
    invalidate();
    setBusy(true);
    try {
      if (!sheet) throw Error('Elegí un archivo.');
      const normalized = await api.post<{
        data: {
          rows: Schemas['Import_prices_Row'][];
          errors: { row: number; message: string }[];
        };
      }>('/price-mapping', {
        supplierId,
        source: fileSource,
        columns: mapping,
        rows: sheet.rows,
        currency,
        taxBasis,
        effectiveAt: `${date}T03:00:00.000Z`,
      });
      if (normalized.data.errors.length)
        throw Error(
          normalized.data.errors
            .map((e) => `Fila ${e.row}: ${e.message}`)
            .join('\n'),
        );
      setRows(normalized.data.rows);
      const response = await api.post<{ data: Preview }>(
        '/imports/prices/preview',
        { rows: normalized.data.rows, reviewPrices: true },
      );
      setPreview(response.data);
    } catch (e) {
      setLocalError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="Importar lista Excel / CSV">
      <div className="stack">
        <p className="small muted">
          Hasta 1 MB y 1000 filas por hoja. Se admiten XLSX y CSV; no se
          ejecutan fórmulas, macros ni enlaces. Los materiales se resuelven por
          código exacto.
        </p>
        <div className="formgrid">
          <SelectField
            label="Proveedor de la lista"
            value={supplierId}
            placeholder="Elegir…"
            options={suppliers.rows.map((s) => ({
              value: s.id,
              label: s.name,
            }))}
            onChange={(e) => {
              invalidate();
              setSupplier(e.target.value);
            }}
          />
          <div className="field">
            <label htmlFor="price-file">
              Archivo de precios (.xlsx / .csv)
            </label>
            <input
              id="price-file"
              className="input"
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                if (e.target.files?.[0]) read(e.target.files[0]);
              }}
            />
          </div>
        </div>
        {sheets.length > 0 && (
          <>
            <SelectField
              label="Hoja de datos"
              value={String(sheetIndex)}
              options={sheets.map((s, i) => ({
                value: String(i),
                label: s.name,
              }))}
              onChange={(e) => {
                invalidate();
                setSheetIndex(Number(e.target.value));
                setMapping({});
              }}
            />
            <div className="formgrid">
              {FIELDS.map(([field, label]) => (
                <SelectField
                  key={field}
                  label={label}
                  value={
                    mapping[field] === undefined ? '' : String(mapping[field])
                  }
                  placeholder="Sin mapear"
                  options={sheet.columns.map((c, i) => ({
                    value: String(i),
                    label: `${i + 1}. ${c || 'Sin encabezado'}`,
                  }))}
                  onChange={(e) => {
                    invalidate();
                    setMapping((old) => {
                      const next = { ...old };
                      if (e.target.value === '') delete next[field];
                      else next[field] = Number(e.target.value);
                      return next;
                    });
                  }}
                />
              ))}
            </div>
            <div className="formgrid">
              <SelectField
                label="Moneda por defecto"
                value={currency}
                options={[
                  { value: 'ARS', label: 'ARS' },
                  { value: 'USD', label: 'USD' },
                ]}
                onChange={(e) => {
                  invalidate();
                  setCurrency(e.target.value as 'ARS' | 'USD');
                }}
              />
              <SelectField
                label="IVA por defecto"
                value={taxBasis}
                options={[
                  { value: 'EXCLUDED', label: '+ IVA' },
                  { value: 'INCLUDED', label: 'IVA incluido' },
                  { value: 'UNSPECIFIED', label: 'No especificado' },
                ]}
                onChange={(e) => {
                  invalidate();
                  setTax(e.target.value as Schemas['TaxBasis']);
                }}
              />
              <TextField
                label="Fecha de vigencia por defecto"
                type="date"
                value={date}
                onChange={(e) => {
                  invalidate();
                  setDate(e.target.value);
                }}
              />
            </div>
            <Button
              loading={busy}
              disabled={
                !supplierId ||
                !date ||
                ['materialCode', 'unit', 'price'].some(
                  (f) => mapping[f] === undefined,
                )
              }
              onClick={review}
            >
              Revisar diferencias
            </Button>
          </>
        )}
        {preview && (
          <>
            <p>
              {preview.rowCount} filas ·{' '}
              {preview.valid ? 'Lote validado' : 'Revisá las filas indicadas'}
            </p>
            {preview.errors.map((e) => (
              <p className="err" key={`${e.row}-${e.message}`}>
                Fila {e.row}: {e.message}
              </p>
            ))}
            <div className="tblwrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Material</th>
                    <th>Anterior</th>
                    <th>Nuevo</th>
                    <th>Unidad / vigencia</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.differences?.map((d) => (
                    <tr key={d.row}>
                      <td>{d.row}</td>
                      <td>{d.materialCode}</td>
                      <td>{d.previous?.price ?? 'Sin referencia'}</td>
                      <td>
                        {d.newPrice} {d.currency} · {d.taxBasis}
                      </td>
                      <td>
                        Por {d.baseQuantity} · {d.effectiveAt}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              loading={commit.pending}
              disabled={!preview.valid}
              onClick={async () => {
                if (await commit.run()) {
                  toast.success('Lista de precios importada');
                  setPreview(undefined);
                  setRows([]);
                }
              }}
            >
              Confirmar importación validada
            </Button>
          </>
        )}
        <ErrorBox error={localError ?? commit.error ?? suppliers.error} />
      </div>
    </Card>
  );
}
