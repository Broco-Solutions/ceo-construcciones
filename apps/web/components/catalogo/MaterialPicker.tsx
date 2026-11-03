'use client';
// Selector reutilizable de material (sin precios). Apto móvil: lista táctil con unidad base visible.
import { unitSymbol } from '@/lib/units';
import { useEffect, useId, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api, type Page, type Schemas } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useUnits } from './common';

export type PickedMaterial = Omit<Schemas['Material'], 'unit'> & { unit: Schemas['Unit'] | null };

export function MaterialPicker({
  value,
  onChange,
  categoryId,
  label = 'Material',
  error,
  disabled,
  includeInactive = false,
}: {
  /** id del material seleccionado (o null). */
  value: string | null | undefined;
  onChange: (material: PickedMaterial | null) => void;
  categoryId?: string | null;
  label?: string;
  error?: string;
  disabled?: boolean;
  includeInactive?: boolean;
}) {
  const id = useId();
  const units = useUnits();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useApi<Page<Schemas['Material']>>(open ? '/materials' : null, {
    search: debounced || undefined,
    categoryId: categoryId || undefined,
    active: includeInactive ? undefined : true,
    pageSize: 20,
  });
  const [selected, setSelected] = useState<Schemas['Material'] | null>(null);
  useEffect(() => {
    if (!value) return setSelected(null);
    if (selected?.id === value) return;
    let off = false;
    api
      .get<{ data: Schemas['Material'] }>(`/materials/${value}`)
      .then((r) => !off && setSelected(r.data))
      .catch(() => !off && setSelected(null));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const unitOf = (m: Schemas['Material']) =>
    m.unit ?? units.map.get(m.unitId) ?? null;
  const unitCode = (m: Schemas['Material']) => unitSymbol(unitOf(m)) || '…';
  const rows = list.data?.data ?? [];

  const pick = (m: Schemas['Material']) => {
    setSelected(m);
    setOpen(false);
    setQ('');
    onChange({ ...m, unit: unitOf(m) });
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {selected && !open ? (
        <div className="row input" style={{ gap: 8, minHeight: 44 }}>
          <span style={{ flex: 1 }}>
            <span className="mono small">{selected.code}</span> {selected.name}{' '}
            <span className="pill plain">
              unidad base: {unitCode(selected)}
            </span>
          </span>
          {!disabled && (
            <>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setOpen(true)}
              >
                Cambiar
              </button>
              <button
                type="button"
                className="x"
                aria-label="Quitar material"
                onClick={() => {
                  setSelected(null);
                  onChange(null);
                }}
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div className="row" style={{ gap: 6 }}>
            <Search size={16} aria-hidden className="muted" />
            <input
              id={id}
              className="input"
              style={{ flex: 1, minHeight: 44 }}
              placeholder="Buscar por código o nombre…"
              value={q}
              disabled={disabled}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              onFocus={() => setOpen(true)}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && open) {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
            />
            {selected && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
            )}
          </div>
          {open && (
            <div
              className="card"
              role="listbox"
              aria-label="Materiales"
              style={{ marginTop: 6, maxHeight: 320, overflowY: 'auto' }}
            >
              {list.loading ? (
                <div className="loading small" role="status">
                  <span className="spin" aria-hidden /> Buscando…
                </div>
              ) : list.error ? (
                <div className="alert bad small">
                  {list.error.message}{' '}
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={list.reload}
                  >
                    Reintentar
                  </button>
                </div>
              ) : rows.length === 0 ? (
                <div className="empty small">Sin materiales que coincidan.</div>
              ) : (
                rows.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === value}
                    className="btn ghost"
                    style={{
                      width: '100%',
                      justifyContent: 'flex-start',
                      minHeight: 44,
                      textAlign: 'left',
                    }}
                    onClick={() => pick(m)}
                  >
                    <span className="mono small">{m.code}</span>
                    <span style={{ flex: 1 }}>{m.name}</span>
                    <span className="pill plain">{unitCode(m)}</span>
                    {!m.active && <span className="pill warn">inactivo</span>}
                  </button>
                ))
              )}
              {(list.data?.pagination.total ?? 0) > 20 && (
                <div className="small muted" style={{ padding: 8 }}>
                  Mostrando 20 resultados; refiná la búsqueda.
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {error && (
        <span className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export default MaterialPicker;
