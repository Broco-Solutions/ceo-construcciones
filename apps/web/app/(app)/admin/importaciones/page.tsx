'use client';
import { useMemo, useRef, useState } from 'react';
import { Download, FileUp, Upload } from 'lucide-react';
import { Page, RequirePerm } from '@/components/shell';
import { Button, Card, Confirm, ErrorBox, Pill, Tabs, useToast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { parseCsv } from '@/components/admin/csv';

type Kind = 'works' | 'suppliers' | 'materials' | 'prices' | 'purchase-orders' | 'initial-stock';
const KINDS: { key: Kind; label: string; dep: string }[] = [
  { key: 'works', label: 'Obras', dep: 'Sin dependencias. Crea también la ubicación de cada obra.' },
  { key: 'suppliers', label: 'Proveedores', dep: 'Sin dependencias.' },
  { key: 'materials', label: 'Materiales', dep: 'Requiere unidades y rubros cargados (Catálogo).' },
  { key: 'prices', label: 'Precios', dep: 'Requiere materiales y proveedores.' },
  { key: 'purchase-orders', label: 'OC abiertas', dep: 'Requiere proveedores, obras, ubicaciones y materiales.' },
  { key: 'initial-stock', label: 'Stock inicial', dep: 'Requiere materiales y ubicaciones (galpones/patios en Administración > Ubicaciones).' },
];
const EXPORTS: { path: string; label: string }[] = [
  { path: '/exports/works', label: 'Obras' },
  { path: '/exports/suppliers', label: 'Proveedores' },
  { path: '/exports/materials', label: 'Materiales' },
  { path: '/exports/prices', label: 'Precios' },
  { path: '/exports/stock', label: 'Stock' },
  { path: '/exports/purchase-orders', label: 'Órdenes de compra' },
];

type Preview = { valid: boolean; rowCount: number; errors: { row: number; message: string }[]; confirmationHash: string };

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
  const download = async (path: string, name: string) => {
    setBusy(path);
    setDlErr(null);
    try {
      await api.download(path, undefined, name);
    } catch (e) {
      setDlErr(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Importaciones y exportaciones" crumb="Administración">
      <Card title="Orden recomendado de carga">
        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
          {KINDS.map((k) => (
            <li key={k.key}><b>{k.label}</b>: {k.dep}</li>
          ))}
        </ol>
      </Card>
      <Card bodyClass="">
        <Tabs tabs={KINDS.map((k) => ({ key: k.key, label: k.label }))} value={kind} onChange={setKind} />
        <div className="bd">
          <ImportKind key={kind} kind={kind} onTemplate={() => download(`/imports/${kind}/template`, `plantilla-${kind}.csv`)} templateBusy={busy === `/imports/${kind}/template`} onDone={(n) => toast(`${n} filas importadas`)} />
        </div>
      </Card>
      <Card title="Exportaciones">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          {EXPORTS.map((e) => (
            <Button key={e.path} variant="sec" loading={busy === e.path} disabled={!!busy && busy !== e.path} onClick={() => download(e.path, `${e.path.split('/').pop()}.xlsx`)}>
              <Download /> {e.label}
            </Button>
          ))}
        </div>
        <ErrorBox error={dlErr} />
      </Card>
    </Page>
  );
}

function ImportKind({ kind, onTemplate, templateBusy, onDone }: { kind: Kind; onTemplate: () => void; templateBusy: boolean; onDone: (n: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<{ importedRows: number; createdIds: string[]; confirmationHash?: string } | null>(null);
  const [readErr, setReadErr] = useState<string | null>(null);
  const prev = useMutation(async (_k: string, csv: string) => (await api.post<{ data: Preview }>(`/imports/${kind}/preview`, { csv })).data);
  const commit = useMutation(async (key: string, csv: string, hash: string) =>
    (await api.post<{ data: { importedRows: number; createdIds: string[]; confirmationHash: string } }>(`/imports/${kind}/commit`, { csv, confirmationHash: hash }, { idempotencyKey: key })).data,
  );
  const table = useMemo(() => (file ? parseCsv(file.text) : []), [file]);
  const errByRow = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const e of preview?.errors ?? []) m.set(e.row, [...(m.get(e.row) ?? []), e.message]);
    return m;
  }, [preview]);
  const general = (preview?.errors ?? []).filter((e) => e.row < 1 || e.row > table.length - 1);

  const onFile = (f: File | undefined) => {
    setPreview(null);
    setResult(null);
    setReadErr(null);
    prev.reset();
    commit.reset();
    if (!f) return setFile(null);
    if (f.size > 1_500_000) return setReadErr('El archivo supera 1,5 MB.');
    const r = new FileReader();
    r.onload = () => {
      const text = String(r.result ?? '');
      setFile({ name: f.name, text });
      prev.run(text).then((p) => p && setPreview(p));
    };
    r.onerror = () => setReadErr('No se pudo leer el archivo.');
    r.readAsText(f, 'utf-8');
  };

  const doCommit = async () => {
    if (!file || !preview) return;
    const r = await commit.run(file.text, preview.confirmationHash);
    if (r) {
      setConfirm(false);
      setResult(r);
      setPreview(null);
      onDone(r.importedRows);
    }
  };
  const stale = commit.error instanceof ApiError && commit.error.status === 409;

  return (
    <div className="stack">
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Button variant="sec" onClick={onTemplate} loading={templateBusy}><Download /> Descargar plantilla CSV</Button>
        <Button onClick={() => input.current?.click()} loading={prev.pending}><FileUp /> Cargar CSV</Button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => (onFile(e.target.files?.[0]), (e.target.value = ''))} />
        {file && <span className="small muted">{file.name}</span>}
      </div>
      {readErr && <div className="alert bad">{readErr}</div>}
      <ErrorBox error={prev.error} />
      <div className="note small" data-testid="import-preview-note">
        La vista previa muestra el contenido de tu CSV tal como se leyó en este navegador. El servidor sólo valida el archivo
        (cantidad de filas, errores y huella de confirmación); no devuelve datos normalizados. La fila 1 es la primera fila de datos, sin contar el encabezado.
      </div>
      {commit.pending && <div className="note" role="status" data-testid="import-commit-status">Importando… no cierres la página.</div>}
      {commit.error && !confirm && <ErrorBox error={commit.error} />}
      {result && (
        <div className="alert ok" role="status" data-testid="import-commit-result">
          <b>Importación confirmada:</b> {result.importedRows} filas importadas · {result.createdIds.length} registros creados.
          {result.confirmationHash && <div className="small mono">Huella: {result.confirmationHash.slice(0, 16)}…</div>}
        </div>
      )}
      {preview && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {preview.valid ? <Pill tone="ok">Archivo válido</Pill> : <Pill tone="bad">Con errores</Pill>}
            <span className="small" data-testid="import-preview-summary">Validación del servidor: {preview.rowCount} filas · {preview.rowCount - errByRow.size} válidas · {errByRow.size} con errores</span>
            <span className="small muted mono">Huella {preview.confirmationHash.slice(0, 12)}…</span>
            <span style={{ flex: 1 }} />
            <Button variant="ok" disabled={!preview.valid} onClick={() => setConfirm(true)}><Upload /> Confirmar importación</Button>
          </div>
          {!preview.valid && <div className="note">Corregí el archivo y volvé a cargarlo. No se importa nada mientras haya errores.</div>}
          {general.length > 0 && (
            <div className="alert bad"><ul>{general.map((e, i) => <li key={i}>{e.row ? `Fila ${e.row}: ` : ''}{e.message}</li>)}</ul></div>
          )}
          {table.length > 1 && (
            <div className="tblwrap" style={{ maxHeight: '55vh', overflow: 'auto' }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Fila</th>
                    {table[0].map((h, i) => <th key={i}>{h}</th>)}
                    <th>Validación</th>
                  </tr>
                </thead>
                <tbody>
                  {table.slice(1, 501).map((r, i) => {
                    const errs = errByRow.get(i + 1);
                    return (
                      <tr key={i}>
                        <td className="mono">{i + 1}</td>
                        {table[0].map((_, j) => <td key={j}>{r[j] ?? ''}</td>)}
                        <td>{errs ? <span style={{ color: 'var(--bad)' }}>{errs.join('; ')}</span> : <Pill tone="ok">OK</Pill>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {table.length > 501 && <div className="small muted bd">Se muestran las primeras 500 filas.</div>}
            </div>
          )}
        </>
      )}
      <Confirm
        open={confirm}
        title="Confirmar importación"
        confirmLabel="Importar"
        tone="ok"
        pending={commit.pending}
        error={commit.error}
        onClose={() => setConfirm(false)}
        onConfirm={doCommit}
      >
        Se van a importar {preview?.rowCount} filas de <b>{file?.name}</b>. La operación queda registrada en auditoría.
        {stale && <div className="note">Los datos cambiaron desde la validación: volvé a cargar el archivo.</div>}
      </Confirm>
    </div>
  );
}
