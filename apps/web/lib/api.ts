// Cliente HTTP same-origin para /api/v1. Decimales viajan como string; nunca se convierten a Number.
import type { components } from './openapi';

export type Schemas = components['schemas'];
export type Role = Schemas['Role'];
export type Pagination = Schemas['Pagination'];
export type Page<T> = { data: T[]; pagination: Pagination };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public retryAfter?: number,
  ) {
    super(message);
  }
  get isNetwork() {
    return this.status === 0 || this.code === 'API_UNAVAILABLE';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;
export type RequestOptions = { query?: Query; body?: unknown; idempotencyKey?: string; signal?: AbortSignal };

const unauthorizedListeners = new Set<() => void>();
export function onUnauthorized(fn: () => void) {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
}

export function buildUrl(path: string, query?: Query) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  const s = qs.toString();
  return `/api/v1${path}${s ? `?${s}` : ''}`;
}

const MESSAGES: Record<number, string> = {
  401: 'Tu sesión venció. Ingresá nuevamente.',
  403: 'No tenés permisos para esta operación.',
  404: 'El recurso no existe o no está disponible para tu usuario.',
  409: 'La operación entra en conflicto con el estado actual. Actualizá los datos.',
  422: 'Revisá los datos ingresados.',
  429: 'Demasiados intentos. Esperá antes de volver a intentar.',
};

async function toError(res: Response): Promise<ApiError> {
  const retry = res.headers.get('retry-after');
  let code = `HTTP_${res.status}`;
  let message = MESSAGES[res.status] ?? 'Ocurrió un error inesperado en el servidor.';
  let details: unknown;
  try {
    const body = await res.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    }
  } catch {
    /* cuerpo no JSON */
  }
  return new ApiError(res.status, code, message, details, retry ? Number(retry) : undefined);
}

async function send(method: string, path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Sin conexión con el servidor. Revisá tu red y reintentá.');
  }
  if (!res.ok) {
    const err = await toError(res);
    if (res.status === 401 && path !== '/auth/login') unauthorizedListeners.forEach((fn) => fn());
    throw err;
  }
  return res;
}

async function json<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
  const res = await send(method, path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => json<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => json<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => json<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'body'>) => json<T>('PATCH', path, { ...opts, body }),
  /** Descarga binaria (PDF/XLSX/CSV) respetando Content-Disposition. */
  async download(path: string, query?: Query, fallbackName = 'descarga', forceFilename = false) {
    const res = await send('GET', path, { query });
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    // Los reportes exportados desde la UI pueden imponer un nombre en español; otros respetan el servidor.
    const name = forceFilename ? fallbackName : m ? decodeURIComponent(m[1]) : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return name;
  },
};

/** Clave estable por intención confirmada: reutilizar en reintentos tras timeout. */
export function newIdempotencyKey() {
  return crypto.randomUUID();
}

/** Errores de campo a partir de details (issues Zod o filas). */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!(err instanceof ApiError) || !err.details) return out;
  const flat = err.details as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
  if (!Array.isArray(err.details) && flat.fieldErrors) {
    for (const [k, v] of Object.entries(flat.fieldErrors)) if (v?.length) out[k] = v.join('; ');
    return out;
  }
  if (!Array.isArray(err.details)) return out;
  for (const issue of err.details as { path?: (string | number)[]; message?: string }[]) {
    if (issue?.path && issue.message) out[issue.path.join('.')] = issue.message;
  }
  return out;
}
