'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, friendlyError, newIdempotencyKey, type Page } from './api';

type Query = Record<string, string | number | boolean | undefined | null>;

/** GET con estados loading/error/reload. `path` null desactiva la consulta (p. ej. permisos). */
export function useApi<T>(path: string | null, query?: Query) {
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const [tick, setTick] = useState(0);
  const key = path ? `${path}?${JSON.stringify(query ?? {})}` : null;
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api
      .get<T>(path, query, ctrl.signal)
      .then((d) => setData(d))
      .catch((e) => {
        if (e?.name !== 'AbortError') setError(e instanceof ApiError ? e : new ApiError(0, 'NETWORK', String(e)));
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Listado paginado: devuelve filas, paginación y control de página. */
export function usePaged<T>(path: string | null, query?: Query, pageSize = 50) {
  const [page, setPage] = useState(1);
  const qkey = JSON.stringify(query ?? {});
  useEffect(() => setPage(1), [qkey]);
  const res = useApi<Page<T>>(path, { ...query, page, pageSize });
  return { ...res, rows: res.data?.data ?? [], pagination: res.data?.pagination, page, setPage };
}

/** Todas las páginas de un catálogo (para selects). Recorre hasta agotar total. */
export function useAll<T>(path: string | null, query?: Query) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState<ApiError | null>(null);
  const [tick, setTick] = useState(0);
  const key = path ? `${path}?${JSON.stringify(query ?? {})}` : null;
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all: T[] = [];
        for (let page = 1; page < 200; page++) {
          const r = await api.get<Page<T>>(path, { ...query, page, pageSize: 100 });
          all.push(...r.data);
          if (all.length >= r.pagination.total || r.data.length === 0) break;
        }
        if (!cancelled) setRows(all);
      } catch (e) {
        if (!cancelled) setError(e as ApiError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { rows, loading, error, reload: () => setTick((t) => t + 1) };
}

/**
 * Mutación con prevención de doble envío y clave de idempotencia estable por intención:
 * la misma clave se reutiliza en reintentos hasta que la operación tenga éxito o se llame reset().
 */
export function useMutation<A extends unknown[], R>(fn: (key: string, ...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const keyRef = useRef<string | null>(null);
  const argsRef = useRef<string | null>(null);
  const busy = useRef(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      setError(null);
      // Misma intención (mismos argumentos) reutiliza la clave; un cuerpo distinto es una intención nueva.
      const sig = JSON.stringify(args);
      if (keyRef.current && argsRef.current !== sig) keyRef.current = null;
      argsRef.current = sig;
      keyRef.current ??= newIdempotencyKey();
      try {
        const r = await fn(keyRef.current, ...args);
        keyRef.current = null;
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError(0, 'NETWORK', friendlyError(e));
        // Ante error de transporte se conserva la clave para reintentar la misma intención.
        if (!err.isNetwork) keyRef.current = null;
        setError(err);
        return undefined;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [fn],
  );
  const reset = useCallback(() => {
    keyRef.current = null;
    argsRef.current = null;
    setError(null);
  }, []);
  return { run, pending, error, reset, setError };
}
