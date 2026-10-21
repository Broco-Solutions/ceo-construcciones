// Proxy same-origin hacia la API. Server-side únicamente: API_BASE_URL nunca llega al navegador.
const FORWARD_REQUEST = ['accept', 'content-type', 'cookie', 'idempotency-key', 'origin', 'sec-fetch-site', 'user-agent'];
const FORWARD_RESPONSE = ['content-type', 'content-disposition', 'retry-after', 'content-length'];

export function apiBaseUrl(): string {
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error('API_BASE_URL requerida');
  return base.replace(/\/+$/, '');
}

export async function proxyRequest(request: Request, path: string[]): Promise<Response> {
  let base: string;
  try {
    base = apiBaseUrl();
  } catch {
    return Response.json({ error: { code: 'PROXY_NOT_CONFIGURED', message: 'La API no está configurada en este entorno.' } }, { status: 503 });
  }
  const incoming = new URL(request.url);
  const target = `${base}/api/v1/${path.map(encodeURIComponent).join('/')}${incoming.search}`;
  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  const method = request.method.toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer();
  let upstream: Response;
  try {
    upstream = await fetch(target, { method, headers, body, redirect: 'manual', cache: 'no-store' });
  } catch {
    return Response.json({ error: { code: 'API_UNAVAILABLE', message: 'No se pudo conectar con la API. Intentá nuevamente.' } }, { status: 502 });
  }
  const out = new Headers();
  for (const name of FORWARD_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value !== null) out.set(name, value);
  }
  // Cada Set-Cookie se propaga por separado (ceo_session y ceo_login_client); nunca unirlos con comas.
  for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
  out.set('cache-control', 'no-store, private');
  out.set('vary', 'Cookie');
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
