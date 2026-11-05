'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useTableSelection, type Collection } from '@/lib/table-selection';
import { Combobox } from './Combobox';
import { EntityPicker, type EntityResource } from './EntityPicker';
import { X, AlertTriangle, Inbox, RefreshCw } from 'lucide-react';
import { ApiError, fieldErrors, fieldLabel, friendlyError, issueMessage, type Pagination } from '@/lib/api';

/* ---------- botones ---------- */
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'sec' | 'ok' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};
export function Button({ variant = 'primary', size = 'md', loading, className = '', children, disabled, type = 'button', ...rest }: BtnProps) {
  const cls = ['btn', variant !== 'primary' && variant, size !== 'md' && size, className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spin" style={{ width: 14, height: 14 }} aria-hidden />}
      {children}
    </button>
  );
}

/* ---------- formulario ---------- */
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; suffix?: React.ReactNode };
export function TextField({ label, error, hint, id, className = '', suffix, ...rest }: InputProps) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid}>
      {suffix != null ? (
        <div className="input-with-suffix">
          <input id={iid} className={`input ${className}`} aria-invalid={error ? true : undefined} {...rest} />
          <span className="input-suffix">{suffix}</span>
        </div>
      ) : (
        <input id={iid} className={`input ${className}`} aria-invalid={error ? true : undefined} {...rest} />
      )}
    </Field>
  );
}

/** Input decimal: acepta coma decimal; valida formato con hasta 8 decimales. */
export function DecimalField(props: Omit<InputProps, 'type' | 'inputMode'>) {
  return <TextField inputMode="decimal" autoComplete="off" pattern="^-?[0-9.]*([,.][0-9]{1,8})?$" {...props} />;
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  entity?: EntityResource;
  entityQuery?: Record<string, string | number | boolean | null | undefined>;
  searchable?: boolean;
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string; disabled?: boolean; description?: string }[];
  placeholder?: string;
};
export function SelectField({ label, error, hint, options, placeholder, id, entity, entityQuery, searchable, ...rest }: SelectProps) {
  const auto = useId();
  const iid = id ?? auto;
  const onPick = (value: string) => rest.onChange?.({target:{value},currentTarget:{value}} as React.ChangeEvent<HTMLSelectElement>);
  if (entity) return <EntityPicker resource={entity} query={entityQuery} label={label} value={String(rest.value ?? '')} onChange={row=>onPick(row?.id??'')} id={iid} error={error} hint={hint} placeholder={placeholder} disabled={rest.disabled} required={rest.required} clearable={placeholder !== undefined}/>;
  if (searchable) return <Combobox label={label} value={String(rest.value ?? '')} options={options} onChange={row=>onPick(row?.value??'')} id={iid} error={error} hint={hint} placeholder={placeholder} disabled={rest.disabled} required={rest.required} clearable={placeholder !== undefined}/>;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid}>
      <select id={iid} className="input" aria-invalid={error ? true : undefined} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function TextArea({ label, error, hint, id, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }) {
  const auto = useId();
  const iid = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={iid}>
      <textarea id={iid} className="input" aria-invalid={error ? true : undefined} {...rest} />
    </Field>
  );
}

/* ---------- estados ---------- */
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spin" aria-hidden /> {label}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={28} aria-hidden style={{ marginBottom: 6, opacity: 0.6 }} />
      <b>{title}</b>
      {children && <div className="small">{children}</div>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  const e = error instanceof ApiError ? error : null;
  const msg = e ? e.message : friendlyError(error);
  const rows = e && e.details && !Array.isArray(e.details) && typeof e.details === 'object' ? (e.details as Record<string, unknown>) : null;
  type Issue = { path?: unknown[]; message?: string; row?: number; errors?: string[] };
  let issues: Issue[] | null = e && Array.isArray(e.details) ? (e.details as Issue[]) : null;
  const flat = rows as { fieldErrors?: Record<string, string[]>; formErrors?: string[] } | null;
  if (flat && (flat.fieldErrors || flat.formErrors)) {
    issues = [
      ...(flat.formErrors ?? []).map((m) => ({ message: m })),
      ...Object.entries(flat.fieldErrors ?? {}).map(([k, v]) => ({ path: [k], message: v.join('; ') })),
    ];
  }
  return (
    <div className={`alert ${e?.status === 409 || e?.status === 429 ? 'warn' : 'bad'}`} role="alert">
      <div className="row" style={{ gap: 8 }}>
        <AlertTriangle size={16} aria-hidden />
        <b style={{ flex: 1 }}>{msg}</b>
        {e?.retryAfter ? <span className="small">Reintentá en {e.retryAfter} s.</span> : null}
        {onRetry && (
          <Button size="sm" variant="sec" onClick={onRetry}>
            <RefreshCw /> Reintentar
          </Button>
        )}
      </div>
      {issues && issues.length > 0 && (
        <ul>
          {issues.slice(0, 20).map((i, n) => (
            <li key={n}>
              {i.row !== undefined ? `Fila ${i.row}: ` : i.path?.length && fieldLabel(i.path) ? `${fieldLabel(i.path)}: ` : ''}
              {i.message ? issueMessage(i.message) : (i.errors?.join('; ') ?? 'Dato no válido')}
            </li>
          ))}
        </ul>
      )}
      {rows && !issues && typeof rows.message === 'string' && <div className="small">{rows.message}</div>}
    </div>
  );
}

export { fieldErrors };

/* ---------- etiquetas ---------- */
export function Pill({ tone = 'plain', children, ...rest }: { tone?: 'ok' | 'warn' | 'bad' | 'blue' | 'plain'; children: React.ReactNode } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`pill ${tone}`} {...rest}>
      {children}
    </span>
  );
}

export function Mono({ children }: { children: React.ReactNode }) {
  return <span className="mono">{children}</span>;
}

/* ---------- tarjetas / página ---------- */
export function Card({ title, actions, children, bodyClass = 'bd', id }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; bodyClass?: string; id?: string }) {
  return (
    <section className="card" id={id}>
      {(title || actions) && (
        <div className="hd">
          {title && <h3>{title}</h3>}
          <span className="sp" />
          {actions}
        </div>
      )}
      {bodyClass ? <div className={bodyClass}>{children}</div> : children}
    </section>
  );
}

export function PagerBar({ pagination, page, setPage }: { pagination?: Pagination; page: number; setPage: (p: number) => void }) {
  if (!pagination || pagination.total <= pagination.pageSize) return null;
  const pages = Math.ceil(pagination.total / pagination.pageSize);
  return (
    <nav className="pager" aria-label="Paginación">
      <span>
        Página {page} de {pages} · {pagination.total} registros
      </span>
      <Button size="sm" variant="sec" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Anterior
      </Button>
      <Button size="sm" variant="sec" disabled={page >= pages} onClick={() => setPage(page + 1)}>
        Siguiente
      </Button>
    </nav>
  );
}

/* ---------- tabla con vista móvil en tarjetas ---------- */
export type Column<T> = { key: string; header: string; render: (row: T) => React.ReactNode; align?: 'r'; hideMobile?: boolean };
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  mobile,
  empty,
  collection,
  selectionActions,
}: {
  collection?: Collection;
  selectionActions?: (selection: {rows:Record<string,unknown>[];ids:string[];clear:()=>void}) => React.ReactNode;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  mobile?: (row: T) => React.ReactNode;
  empty?: React.ReactNode;
}) {
  const selection=useTableSelection(collection,rows.map(rowKey));
  const header=useRef<HTMLInputElement>(null);
  const all=rows.length>0&&rows.every(r=>selection.ids.has(rowKey(r))),some=rows.some(r=>selection.ids.has(rowKey(r)));
  useEffect(()=>{if(header.current)header.current.indeterminate=some&&!all;},[some,all]);
  const checkbox=(row:T)=><input type="checkbox" className="row-checkbox" aria-label={`Seleccionar fila ${String((row as Record<string,unknown>).name??(row as Record<string,unknown>).code??((row as {material?:{name?:string}}).material?.name)??rowKey(row))}`} checked={selection.ids.has(rowKey(row))} disabled={selection.pending} onClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onChange={()=>selection.toggle(rowKey(row))}/>;
  return (
    <>
      {collection&&<div className="selection-bar" aria-label="Acciones de selección" aria-busy={selection.pending}>
        <span role="status">{selection.ids.size ? `${selection.ids.size} seleccionados · ${selection.scope}` : `${collection.total??rows.length} resultados`}</span>
        <Button size="sm" variant="sec" loading={selection.pending} disabled={(collection.total??rows.length)===0} onClick={()=>selection.exportRows(false)}>Exportar filtrados</Button>
        {selection.ids.size>0&&<>
          <Button size="sm" variant="sec" disabled={selection.pending} onClick={()=>selection.exportRows(true)}>Exportar seleccionados</Button>
          {(collection.total??0)>rows.length&&<Button size="sm" variant="sec" disabled={selection.pending} onClick={selection.selectAll}>Seleccionar los {collection.total} resultados de este filtro</Button>}
          <Button size="sm" variant="ghost" disabled={selection.pending} onClick={selection.clear}>Limpiar selección</Button>
          {!selection.pending&&selectionActions?.({rows:selection.rows,ids:[...selection.ids],clear:selection.clear})}
        </>}
      </div>}
      {selection.message&&<p className="small muted" role="status">{selection.message}</p>}
      <ErrorBox error={selection.error} onRetry={collection?.reload}/>
      {rows.length===0&&(empty??<Empty title="Sin registros"/>)}
      {mobile && (
        <div className="mcards">
          {rows.map((r) => (
            <div
              key={rowKey(r)}
              className="pcard"

            >
              {collection&&<div className="mobile-row-selection" onClick={e=>e.stopPropagation()}>{checkbox(r)}<span>Seleccionar</span></div>}
              <div role={onRowClick ? 'button' : undefined} tabIndex={onRowClick ? 0 : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined} onKeyDown={onRowClick ? e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onRowClick(r);}} : undefined}>{mobile(r)}</div>
            </div>
          ))}
        </div>
      )}
      <div className={`tblwrap${mobile ? ' desk' : ''}`}>
        <table className="t">
          <thead>
            <tr>
              {collection&&<th scope="col"><input ref={header} type="checkbox" aria-label="Seleccionar página visible" title="Seleccionar sólo la página visible" checked={all} disabled={!rows.length||selection.pending} onChange={selection.togglePage}/></th>}
              {columns.map((c) => (
                <th key={c.key} className={[c.align, c.hideMobile && 'hide-m'].filter(Boolean).join(' ')} scope="col">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={rowKey(r)}
                className={onRowClick ? 'click' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(r) : undefined}
              >
                {collection&&<td>{checkbox(r)}</td>}
                {columns.map((c) => (
                  <td key={c.key} className={[c.align, c.hideMobile && 'hide-m'].filter(Boolean).join(' ')}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- modal / drawer ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Propiedad heredada: todos los formularios se presentan como diálogos centrados. */
  side?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tid = useId();
  // El callback del padre cambia al actualizar cada campo. No debe rearmar el focus trap.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>(
      'input,select,textarea,button:not(.x)',
    );
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === 'Tab' && el) {
        const f = Array.from(
          el.querySelectorAll<HTMLElement>(
            'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
          ),
        ).filter(
          (x) => !x.hasAttribute('disabled') && x.getClientRects().length > 0,
        );
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="scrim center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className="modal"
        style={wide ? { width: 'min(1000px,100%)' } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tid}
        tabIndex={-1}
      >
        <div
          className="row"
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--line2)',
          }}
        >
          <h2 id={tid} style={{ fontSize: 17, flex: 1 }}>
            {title}
          </h2>
          <button className="x" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="stack" style={{ padding: 20 }}>
          {children}
        </div>
        {footer && (
          <div
            className="row"
            style={{ justifyContent: 'flex-end', padding: '0 20px 20px' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** Confirmación explícita para operaciones sensibles. */
export function Confirm({
  open,
  title,
  children,
  confirmLabel = 'Confirmar',
  tone = 'primary',
  onConfirm,
  onClose,
  pending,
  error,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger' | 'ok';
  onConfirm: () => void;
  onClose: () => void;
  pending?: boolean;
  error?: unknown;
}) {
  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title={title}
      footer={
        <>
          <Button variant="sec" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div>{children}</div>
      <ErrorBox error={error} />
    </Modal>
  );
}

/* ---------- notificaciones ---------- */
export { ToastProvider, useToast, type Notify, type NoticeTone } from './notifications';

/* ---------- pestañas ---------- */
export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} role="tab" className="tab" aria-selected={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- lista de definición ---------- */
export function DefList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <div className="dl">
      {items.map(([k, v]) => (
        <div key={k}>
          <small>{k}</small>
          <span>{v ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}
