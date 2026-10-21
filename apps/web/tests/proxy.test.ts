// Prueba aislada del proxy (upstream simulado). La verificación contra la API real está en e2e/.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { proxyRequest } from '@/lib/proxy';

describe('proxy same-origin', () => {
  beforeEach(() => {
    process.env.API_BASE_URL = 'http://api.internal:3001/';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('preserva dos Set-Cookie separados, Retry-After y no cachea', async () => {
    const upstreamHeaders = new Headers({ 'content-type': 'application/json', 'retry-after': '30' });
    upstreamHeaders.append('set-cookie', 'ceo_session=a; HttpOnly; Path=/');
    upstreamHeaders.append('set-cookie', 'ceo_login_client=b; HttpOnly; Path=/');
    const fetchMock = vi.fn(async () => new Response('{"error":{"code":"RATE_LIMITED","message":"x"}}', { status: 429, headers: upstreamHeaders }));
    vi.stubGlobal('fetch', fetchMock);
    const req = new Request('http://localhost:3000/api/v1/auth/login?x=1', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', cookie: 'ceo_login_client=b', 'content-type': 'application/json', host: 'evil.example', 'x-forwarded-host': 'evil.example' },
      body: '{}',
    });
    const res = await proxyRequest(req, ['auth', 'login']);
    expect(res.status).toBe(429);
    expect(res.headers.getSetCookie()).toEqual(['ceo_session=a; HttpOnly; Path=/', 'ceo_login_client=b; HttpOnly; Path=/']);
    expect(res.headers.get('retry-after')).toBe('30');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.internal:3001/api/v1/auth/login?x=1');
    const sent = init.headers as Headers;
    expect(sent.get('origin')).toBe('http://localhost:3000');
    expect(sent.get('cookie')).toBe('ceo_login_client=b');
    expect(sent.get('host')).toBeNull();
    expect(sent.get('x-forwarded-host')).toBeNull();
  });

  it('propaga Content-Disposition de binarios', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('PDF', { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="OC-1.pdf"' } })));
    const res = await proxyRequest(new Request('http://localhost:3000/api/v1/purchase-orders/1/pdf'), ['purchase-orders', '1', 'pdf']);
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="OC-1.pdf"');
  });

  it('responde 502 controlado si la API no está disponible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const res = await proxyRequest(new Request('http://localhost:3000/api/v1/auth/me'), ['auth', 'me']);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('API_UNAVAILABLE');
  });
});
