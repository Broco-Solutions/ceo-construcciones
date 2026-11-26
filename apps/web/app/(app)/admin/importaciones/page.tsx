'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import {
  Button,
  Card,
  Confirm,
  ErrorBox,
  Pill,
  Tabs,
  useToast,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { readFileBase64 } from '@/components/admin/csv';
import { PriceImport } from '@/components/catalogo/PriceImport';
import type { operations } from '@/lib/openapi';
import { exportFilename, templateFilename } from '@/lib/download-names';

type Kind =
  | 'clients'
  | 'works'
  | 'suppliers'
  | 'materials'
  | 'prices'
  | 'purchase-orders'
  | 'initial-stock';
const KINDS: { key: Kind; label: string; dep: string }[] = [
  {
    key: 'clients',
    label: 'Clientes',
    dep: 'Identidad recuperada de la fuente; no se inventa CUIT.',
  },
  {
    key: 'works',
    label: 'Obras históricas',
    dep: 'El código de cliente es opcional. Cada obra crea su propia ubicación.',
  },
  { key: 'suppliers', label: 'Proveedores', dep: 'Sin dependencias.' },
  {
    key: 'materials',
    label: 'Materiales',
    dep: 'Requiere una unidad del catálogo. El rubro es opcional.',
  },
  {
    key: 'prices',
    label: 'Precios',
    dep: 'Requiere materiales y proveedores.',
  },
  {
    key: 'purchase-orders',
    label: 'OC abiertas',
    dep: 'Requiere proveedor, destino y materiales. La obra es opcional.',
  },
  {
    key: 'initial-stock',
    label: 'Stock inicial',
    dep: 'Requiere materiales y ubicaciones (galpones/patios en Administración > Ubicaciones).',
  },
];
const EXPORTS: { path: string; label: string }[] = [
  { path: '/exports/works', label: 'Obras' },
  { path: '/exports/suppliers', label: 'Proveedores' },
  { path: '/exports/materials', label: 'Materiales' },
  { path: '/exports/prices', label: 'Precios' },
  { path: '/exports/stock', label: 'Stock' },
  { path: '/exports/purchase-orders', label: 'Órdenes de compra' },
];

type Preview =
  operations['post__imports_materials_preview']['responses'][200]['content']['application/json']['data'];
type ImportFile = { csv: string } | { file: { name: string; base64: string } };
type Result =
  operations['post__imports_materials_commit']['responses'][201]['content']['application/json']['data'];

export default function ImportacionesPage() {
  const { can } = useSession();
  return (
    <RequirePerm ok={can('adjustStock')}>
      <Importaciones />
    </RequirePerm>
  );
}

function Importaciones() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('works');
  const [busy, setBusy] = useState<string | null>(null);
  const [dlErr, setDlErr] = useState<unknown>(null);
  const download = async (path: string, name: string, format?: "xlsx") => {
    setBusy(path);
    setDlErr(null);
    try {
      await api.download(path, { format }, name, true);
    } catch (e) {
      setDlErr(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Importaciones y exportaciones" crumb="Administración">
      <Card title="¿Cómo preparar tu archivo Excel?" bodyClass="bd small stack">
        <div>Cada tipo de importación tiene su propia plantilla. Utilizá el formato correspondiente para que el sistema pueda reconocer y validar la información.</div>
        <ol style={{ margin: 0, paddingLeft: 18 }}>
          <li>Descargá la plantilla Excel de la información que querés importar.</li>
          <li>Completá la hoja <b>Datos</b> con tu información.</li>
          <li>Consultá la hoja <b>Contexto</b> si tenés dudas sobre los campos.</li>
          <li>Importá el archivo, revisá los resultados y confirmá la carga.</li>
        </ol>
        <div className="note small">
          No modifiques los encabezados de las columnas. Si copiás información de otras planillas, pegala como valores, sin fórmulas.
        </div>
        <div>El sistema revisa los datos antes de importarlos. No se registra ninguna información hasta que confirmás la operación.</div>
      </Card>
      <Card title="Orden recomendado de carga">
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {KINDS.map((k) => (
            <li key={k.key}>
              <b>{k.label}</b>: {k.dep}
            </li>
          ))}
        </ol>
      </Card>
      <Card bodyClass="">
        <Tabs
          tabs={KINDS.map((k) => ({ key: k.key, label: k.label }))}
          value={kind}
          onChange={setKind}
        />
        <div className="bd">
          {kind === 'prices' ? (
            <PriceImport fromAdministration />
          ) : (
            <ImportKind
              key={kind}
              kind={kind}
              onTemplate={(format) =>
                download(
                  `/imports/${kind}/template`,
                  templateFilename(kind, undefined, format),
                  format === 'xlsx' ? format : undefined,
                )
              }
              templateBusy={busy === `/imports/${kind}/template`}
              onDone={(n) =>
                toast.success('Importación completada', {
                  description: n === 1 ? 'Se cargó 1 fila.' : `Se cargaron ${n} filas.`,
                })
              }
            />
          )}
        </div>
      </Card>
      <Card title="Exportaciones">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {EXPORTS.map((e) => (
            <Button
              key={e.path}
              variant="sec"
              loading={busy === e.path}
              disabled={!!busy && busy !== e.path}
              onClick={() => download(e.path, exportFilename(e.path))}
            >
              <Download /> {e.label}
            </Button>
          ))}
        </div>
        <ErrorBox error={dlErr} />
      </Card>
    </Page>
  );
}

function ImportKind({
  kind, onTemplate, templateBusy, onDone,
}: {
  kind: Exclude<Kind, 'prices'>;
  onTemplate: (format: 'csv' | 'xlsx') => void;
  templateBusy: boolean;
  onDone: (n: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const [name, setName] = useState('');
  const [payload, setPayload] = useState<ImportFile>();
  const [preview, setPreview] = useState<Preview>();
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<Result>();
  const [readError, setReadError] = useState<unknown>();
  const [reading, setReading] = useState(false);
  const commit = useMutation(async (key: string, file: ImportFile, confirmationHash: string) =>
    (await api.post<{ data: Result }>(
      `/imports/${kind}/commit`,
      { ...file, confirmationHash },
      { idempotencyKey: key },
    )).data,
  );
  const errors = useMemo(() => {
    const byRow = new Map<number, string[]>();
    for (const e of preview?.errors ?? [])
      byRow.set(e.row, [...(byRow.get(e.row) ?? []), e.message]);
    return byRow;
  }, [preview]);

  async function onFile(file: File) {
    const current = ++generation.current;
    setName(file.name);
    setPreview(undefined);
    setPayload(undefined);
    setResult(undefined);
    setReadError(undefined);
    setConfirm(false);
    commit.reset();
    setReading(true);
    try {
      const excel = /\.xlsx$/i.test(file.name);
      if (!excel && !/\.csv$/i.test(file.name)) throw Error('Elegí un archivo .xlsx o .csv.');
      const limit = excel ? 1_000_000 : 1_500_000;
      if (file.size > limit) throw Error(`El archivo supera ${excel ? '1 MB' : '1,5 MB'}.`);
      const data = excel
        ? { file: { name: file.name, base64: await readFileBase64(file) } }
        : { csv: await file.text() };
      if (current !== generation.current) return;
      const response = await api.post<{ data: Preview }>(`/imports/${kind}/preview`, data);
      if (current !== generation.current) return;
      setPayload(data);
      setPreview(response.data);
    } catch (error) {
      if (current === generation.current) setReadError(error);
    } finally {
      if (current === generation.current) setReading(false);
    }
  }

  async function doCommit() {
    if (!payload || !preview?.valid || reading || !confirm || stale) return;
    const current = generation.current;
    const response = await commit.run(payload, preview.confirmationHash);
    if (!response || current !== generation.current) return;
    setConfirm(false);
    setResult(response);
    setPreview(undefined);
    onDone(response.importedRows);
  }
  const stale = commit.error instanceof ApiError && commit.error.status === 409;

  return (
    <div className="stack">
      <p className="small muted" data-testid="import-preview-note">
        Formatos admitidos: XLSX y CSV.
      </p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Button variant="sec" onClick={() => onTemplate('xlsx')} loading={templateBusy}>
          <Download /> Descargar plantilla Excel
        </Button>
        <Button onClick={() => input.current?.click()} disabled={commit.pending}>
          <FileUp /> Importar archivo
        </Button>
        <Button variant="ghost" onClick={() => onTemplate('csv')} disabled={templateBusy}>
          Descargar plantilla CSV técnica
        </Button>
        <input
          ref={input}
          type="file"
          aria-label="Archivo de importación"
          accept=".xlsx,.csv"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void onFile(file);
          }}
        />
      </div>
      {name && <span className="small muted">{name}</span>}
      {reading && <div className="note" role="status">Revisando el archivo…</div>}
      <ErrorBox error={readError} />
      {commit.pending && (
        <div className="note" role="status" data-testid="import-commit-status">
          Importando… no cierres la página.
        </div>
      )}
      {commit.error && (!confirm || stale) && <ErrorBox error={commit.error} />}
      {result && (
        <div className="alert ok" role="status" data-testid="import-commit-result">
          <b>Importación confirmada:</b>{' '}
          {result.importedRows === 1 ? '1 fila importada' : `${result.importedRows} filas importadas`} ·{' '}
          {result.createdIds.length === 1 ? '1 registro creado' : `${result.createdIds.length} registros creados`}.
        </div>
      )}
      {preview && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Pill tone={preview.valid ? 'ok' : 'bad'}>{preview.valid ? 'Archivo válido' : 'Con errores'}</Pill>
            <span className="small" data-testid="import-preview-summary">
              Resultado de la revisión: {preview.rowCount} filas ·{' '}
              {preview.rowCount - errors.size} válidas · {errors.size} con errores
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="ok" disabled={!preview.valid || reading || commit.pending || stale}
              onClick={() => setConfirm(true)}>
              <Upload /> Confirmar importación
            </Button>
          </div>
          {!preview.valid && <div className="note">Corregí las filas indicadas y volvé a cargar el archivo.</div>}
          {preview.table && (
            <div className="tblwrap" style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Fila</th>
                    {preview.table.columns.map((column, i) => <th key={i}>{column}</th>)}
                    <th>Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.table.rows.map(({ row, values, automaticCode }) => (
                    <tr key={row}>
                      <td className="mono">{row}</td>
                      {values.map((value, i) => <td key={i}>{value}</td>)}
                      <td>
                        {errors.has(row) ? (
                          <span style={{ color: 'var(--bad)' }}>{errors.get(row)?.join(' ')}</span>
                        ) : <Pill tone="ok">OK</Pill>}
                        {automaticCode && <div className="small muted">El código se generará al confirmar.</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <Confirm
        open={confirm && !stale}
        title="Confirmar importación"
        confirmLabel="Importar"
        tone="ok"
        pending={commit.pending}
        error={commit.error}
        onClose={() => setConfirm(false)}
        onConfirm={doCommit}
      >
        Se van a importar {preview?.rowCount} filas de <b>{name}</b>. La operación queda registrada en auditoría.
      </Confirm>
    </div>
  );
}
