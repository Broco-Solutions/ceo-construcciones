"use client";
import { useEffect, useId, useRef, useState, useCallback } from "react";
import { ChevronDown, Search, X } from "lucide-react";
export type ComboOption<T = unknown> = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  data?: T;
};
export const normalizeSearch = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim()
    .replace(/\s+/g, " ");
type Props<T> = {
  label: string;
  resource?: string;
  value?: string | null;
  onChange: (option: ComboOption<T> | null) => void;
  options?: ComboOption<T>[];
  loadOptions?: (
    search: string,
    page: number,
    signal: AbortSignal,
  ) => Promise<{ options: ComboOption<T>[]; total: number }>;
  resolveOption?: (id: string, signal: AbortSignal) => Promise<ComboOption<T>>;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  clearable?: boolean;
  error?: string;
  hint?: string;
  id?: string;
  /** Free-text list search is separate from the selected entity ID. */
  query?: string;
  onQueryChange?: (query: string) => void;
};
export function Combobox<T>({
  label,
  resource,
  value,
  onChange,
  options = [],
  loadOptions,
  resolveOption,
  placeholder = "Buscar o elegir…",
  disabled,
  required,
  clearable = true,
  error,
  hint,
  id,
  query,
  onQueryChange,
}: Props<T>) {
  const auto = useId(),
    iid = id ?? auto,
    listId = iid + "-options";
  const root = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    generation = useRef(0),
    focusingSelection = useRef(false);
  const [open, setOpen] = useState(false),
    [text, setText] = useState(query ?? ""),
    [debounced, setDebounced] = useState(""),
    [page, setPage] = useState(1);
  const [rows, setRows] = useState<ComboOption<T>[]>([]),
    [total, setTotal] = useState(0),
    [active, setActive] = useState(-1),
    [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState<ComboOption<T> | null>(null),
    [position, setPosition] = useState<React.CSSProperties>({});
  const load = useRef(loadOptions),
    resolve = useRef(resolveOption);
  load.current = loadOptions;
  resolve.current = resolveOption;
  const localKey = JSON.stringify(options);
  useEffect(() => {
    if (query !== undefined) setText(query);
  }, [query]);
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    const local = options.find((o) => o.value === value);
    if (local) {
      setSelected(local);
      return;
    }
    if (selected?.value === value) return;
    const ctrl = new AbortController();
    resolve
      .current?.(value, ctrl.signal)
      .then((o) => {
        if (!ctrl.signal.aborted) setSelected(o);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [value, localKey]);
  useEffect(() => {
    input.current?.setCustomValidity(
      required && !value ? "Seleccioná una opción de la lista." : "",
    );
  }, [required, value]);
  useEffect(() => {
    const next = text.trim();
    if (next === debounced) return;
    const t = setTimeout(() => {
      setDebounced(next);
      setPage(1);
      setActive(-1);
    }, 220);
    return () => clearTimeout(t);
  }, [text, debounced]);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController(),
      current = ++generation.current;
    setLoading(true);
    setFailed(false);
    const request = load.current
      ? load.current(debounced, page, ctrl.signal)
      : Promise.resolve({
          options: options.filter((o) =>
            normalizeSearch(o.label + " " + (o.description ?? "")).includes(
              normalizeSearch(debounced),
            ),
          ),
          total: 0,
        });
    request
      .then((result) => {
        if (ctrl.signal.aborted || current !== generation.current) return;
        setLoadedQuery(debounced);
        const next = result.options;
        setRows((old) =>
          page === 1
            ? next
            : [
                ...old,
                ...next.filter((o) => !old.some((x) => x.value === o.value)),
              ],
        );
        setTotal(load.current ? result.total : next.length);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted && e?.name !== "AbortError") setFailed(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted && current === generation.current)
          setLoading(false);
      });
    return () => ctrl.abort();
  }, [open, debounced, page, retry, localKey]);
  const close = useCallback(() => {
    setOpen(false);
    setPage(1);
    setActive(-1);
    if (onQueryChange === undefined) setText("");
  }, [onQueryChange]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.visualViewport?.height ?? innerHeight,
        below = vh - r.bottom - 12,
        above = r.top - 12,
        upwards = below < 160 && above > below;
      const height = Math.min(300, Math.max(96, upwards ? above : below));
      setPosition({
        position: "fixed",
        left: Math.max(
          8,
          Math.min(
            r.left,
            innerWidth - Math.min(Math.max(r.width, 280), innerWidth - 16) - 8,
          ),
        ),
        top: upwards ? undefined : r.bottom + 4,
        bottom: upwards ? innerHeight - r.top + 4 : undefined,
        width: Math.min(Math.max(r.width, 280), innerWidth - 16),
        maxHeight: height,
      });
    };
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    place();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [open, close]);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${listId}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);
  const focusInput = () => {
    focusingSelection.current = true;
    input.current?.focus();
    focusingSelection.current = false;
  };
  const choose = (o: ComboOption<T>) => {
    if (o.disabled) return;
    setSelected(o);
    onChange(o);
    close();
    focusInput();
  };
  const update = (s: string) => {
    setText(s);
    onQueryChange?.(s);
    setOpen(true);
    setPage(1);
  };
  const more = rows.length < total;
  return (
    <div className="field combobox" ref={root}>
      <label htmlFor={iid}>{label}</label>
      <div className="combo-control">
        <Search size={17} aria-hidden />
        <input
          ref={input}
          id={iid}
          data-resource={resource}
          data-selected-id={value ?? ""}
          className="input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && active >= 0 ? `${listId}-${active}` : undefined
          }
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={hint || error ? iid + "-hint" : undefined}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          value={
            onQueryChange
              ? text
              : open
                ? text
                : selected?.value === value
                  ? (selected?.label ?? "")
                  : value
                    ? "Referencia vinculada"
                    : ""
          }
          onFocus={() => {
            if (!focusingSelection.current) setOpen(true);
          }}
          onClick={() => setOpen(true)}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && open) {
              e.preventDefault();
              e.stopPropagation();
              close();
              return;
            }
            if (e.key === "Tab") {
              close();
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
                return;
              }
              const direction = e.key === "ArrowDown" ? 1 : -1;
              let next = active + direction;
              while (next >= 0 && next < rows.length && rows[next].disabled)
                next += direction;
              if (next >= rows.length && more && !loading)
                setPage((p) => p + 1);
              setActive(Math.max(0, Math.min(rows.length - 1, next)));
              return;
            }
            if (e.key === "Enter" && open && active >= 0 && rows[active]) {
              e.preventDefault();
              choose(rows[active]);
            }
          }}
        />
        {clearable && (value || text) && !disabled && (
          <button
            type="button"
            className="combo-clear"
            aria-label="Limpiar campo"
            title={`Limpiar ${label}`}
            onClick={() => {
              onChange(null);
              update("");
              focusInput();
            }}
          >
            <X size={16} />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          className="combo-toggle"
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Desplegar opciones"
          title={`Opciones de ${label}`}
          disabled={disabled}
          onClick={() => {
            setOpen(!open);
            focusInput();
          }}
        >
          <ChevronDown size={17} />
        </button>
      </div>
      {!open &&
        selected &&
        selected.value === value &&
        selected.description && (
          <small className="combo-selected muted">{selected.description}</small>
        )}
      {(hint || error) && (
        <small id={iid + "-hint"} className={error ? "field-error" : "muted"}>
          {error ?? hint}
        </small>
      )}
      {open && (
        <div className="combo-popup" style={position}>
          <div
            id={listId}
            role="listbox"
            aria-label="Opciones disponibles"
            aria-busy={loading || (!failed && loadedQuery !== text.trim())}
          >
            {!failed &&
              rows.map((o, n) => (
                <div
                  key={o.value}
                  id={`${listId}-${n}`}
                  role="option"
                  data-value={o.value}
                  aria-selected={o.value === value}
                  aria-disabled={o.disabled || undefined}
                  className={`combo-option ${n === active ? "focused" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(n)}
                  onClick={() => choose(o)}
                >
                  <span>{o.label}</span>
                  {o.description && <small>{o.description}</small>}
                </div>
              ))}
          </div>
          <div className="combo-status" role="status">
            {failed ? (
              <>
                No se pudo consultar.{" "}
                <button type="button" onClick={() => setRetry((x) => x + 1)}>
                  Reintentar
                </button>
              </>
            ) : loading ? (
              "Buscando…"
            ) : !rows.length ? (
              "No coinciden opciones con la búsqueda"
            ) : (
              `${rows.length} de ${total} opciones`
            )}
          </div>
          {more && !failed && (
            <button
              type="button"
              className="combo-more"
              disabled={loading}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setPage((p) => p + 1)}
            >
              Cargar más opciones
            </button>
          )}
        </div>
      )}
    </div>
  );
}
