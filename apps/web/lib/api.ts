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

// Respuestas del servidor que describen la implementación: se reemplazan por indicaciones para el usuario.
const BY_CODE: Record<string, string> = {
  INVALID_JSON: 'No se pudo procesar la solicitud. Actualizá la página e intentá nuevamente.',
  METHOD_NOT_ALLOWED: 'No se pudo procesar la solicitud. Actualizá la página e intentá nuevamente.',
  BODY_TOO_LARGE: 'Los datos enviados superan el tamaño permitido (1 MB). Dividí la carga en partes más chicas.',
  AUTO_CODE_EXHAUSTED: 'No se pudo asignar el código automático. Intentá nuevamente.',
  PROXY_NOT_CONFIGURED: 'El sistema no está disponible en este entorno. Avisá al administrador.',
  API_UNAVAILABLE: 'No hay conexión con el servidor. Intentá nuevamente en unos minutos.',
  UNAUTHENTICATED: 'Tu sesión venció. Ingresá nuevamente.',
};
const BY_MESSAGE: Record<string, string> = {
  'Datos inválidos': 'Revisá los datos marcados e intentá nuevamente.',
  'Datos inválidos.': 'Revisá los datos marcados e intentá nuevamente.',
  'Paginación inválida.': 'No se pudo cargar la lista. Actualizá la página.',
  'Ruta inexistente': 'La sección solicitada no existe.',
  'Se requiere un objeto JSON.': 'No se pudo procesar la solicitud. Actualizá la página e intentá nuevamente.',
  'La clave de idempotencia ya fue utilizada con otros datos': 'Esta operación ya se envió con otros datos. Actualizá la página antes de volver a intentar.',
  'Los datos incumplen una restricción de integridad.': 'Los datos no son compatibles con la información ya registrada. Revisalos e intentá nuevamente.',
  'Referencia inexistente o registro en uso.': 'El registro está en uso o hace referencia a datos que ya no existen.',
  'No se pudo completar la operación.': 'No se pudo completar la operación. Intentá nuevamente.',
  'Saldo reservado inconsistente': 'El saldo reservado no coincide con el stock actual. Actualizá la página e intentá nuevamente.',
};
function userMessage(status: number, code: string, message: string): string {
  if (BY_CODE[code]) return BY_CODE[code];
  if (BY_MESSAGE[message]) return BY_MESSAGE[message];
  if (status >= 500 && !message.trim()) return 'No se pudo completar la operación. Intentá nuevamente en unos minutos.';
  return message;
}
/** Texto para mostrar al usuario a partir de cualquier error. */
export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  // Errores propios de la aplicación ya vienen redactados en español; los del navegador no se muestran.
  if (err instanceof Error && err.name === 'Error' && err.message) return err.message;
  return 'Ocurrió un problema inesperado. Intentá nuevamente.';
}

const MESSAGES: Record<number, string> = {
  401: 'Tu sesión venció. Ingresá nuevamente.',
  403: 'No tenés permisos para esta operación.',
  404: 'El registro no existe o no está disponible para tu usuario.',
  409: 'Los datos cambiaron mientras trabajabas. Actualizá la página e intentá nuevamente.',
  422: 'Revisá los datos marcados e intentá nuevamente.',
  429: 'Demasiados intentos seguidos. Esperá un momento antes de volver a intentar.',
};

async function toError(res: Response): Promise<ApiError> {
  const retry = res.headers.get('retry-after');
  let code = `HTTP_${res.status}`;
  let message = MESSAGES[res.status] ?? 'No se pudo completar la operación. Intentá nuevamente en unos minutos.';
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
  return new ApiError(res.status, code, userMessage(res.status, code, message), details, retry ? Number(retry) : undefined);
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
    for (const [k, v] of Object.entries(flat.fieldErrors)) if (v?.length) out[k] = v.map(issueMessage).join('; ');
    return out;
  }
  if (!Array.isArray(err.details)) return out;
  for (const issue of err.details as { path?: (string | number)[]; message?: string }[]) {
    if (issue?.path && issue.message) out[issue.path.join('.')] = issueMessage(issue.message);
  }
  return out;
}

/** Mensajes estándar de validación (en inglés) traducidos para mostrar junto a cada campo. */
export function issueMessage(message: string): string {
  const m = message.trim();
  let r: RegExpExecArray | null;
  if (m === 'Required' || /^String must contain at least 1 character/.test(m) || /received (null|undefined)$/.test(m)) return 'Completá este campo';
  if ((r = /^String must contain at most (\d+) character/.exec(m))) return `Máximo ${r[1]} caracteres`;
  if ((r = /^String must contain at least (\d+) character/.exec(m))) return `Mínimo ${r[1]} caracteres`;
  if ((r = /^Number must be greater than or equal to (-?[\d.]+)/.exec(m))) return `Debe ser ${r[1]} o más`;
  if ((r = /^Number must be greater than (-?[\d.]+)/.exec(m))) return `Debe ser mayor que ${r[1]}`;
  if ((r = /^Array must contain at least (\d+) element/.exec(m))) return r[1] === '1' ? 'Agregá al menos un renglón' : `Agregá al menos ${r[1]} renglones`;
  if (m === 'Invalid email') return 'Ingresá un email válido';
  if (/^Invalid enum value|^Invalid discriminator value/.test(m)) return 'Elegí una opción válida';
  if (/^Invalid (date|datetime)/.test(m)) return 'Ingresá una fecha válida';
  if (/^Unrecognized key/.test(m)) return 'Dato no admitido';
  if (m === 'Invalid' || m === 'Invalid input' || /^Expected .*, received/.test(m)) return 'Valor no válido';
  return m;
}

const FIELD_LABEL: Record<string, string> = {
  name: 'Nombre', code: 'Código', symbol: 'Símbolo', email: 'Email', password: 'Contraseña', role: 'Rol',
  quantity: 'Cantidad', unitId: 'Unidad', categoryId: 'Rubro', materialId: 'Material', supplierId: 'Proveedor',
  workId: 'Obra', locationId: 'Ubicación', sourceId: 'Origen', destinationId: 'Destino', presentationId: 'Presentación',
  price: 'Precio', unitPrice: 'Precio unitario', currency: 'Moneda', taxBasis: 'Impuestos', validFrom: 'Vigencia',
  baseQuantity: 'Equivalencia', minimum: 'Mínimo', laborCost: 'Mano de obra', reason: 'Motivo', notes: 'Observaciones',
  taxId: 'CUIT', lines: 'Renglón', components: 'Componente', items: 'Renglón', status: 'Estado',
};
/** Ubicación legible de un error de validación, p.ej. «Renglón 2 · Cantidad»; vacío si no se reconoce. */
export function fieldLabel(path: readonly unknown[]): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const k = path[i];
    if (typeof k === 'number') continue;
    const label = FIELD_LABEL[String(k)];
    if (!label) return '';
    const idx = path[i + 1];
    parts.push(typeof idx === 'number' ? `${label} ${idx + 1}` : label);
  }
  return parts.join(' · ');
}
