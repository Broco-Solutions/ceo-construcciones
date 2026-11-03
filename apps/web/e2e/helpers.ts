import { expect, type Page } from '@playwright/test';

export type RoleKey =
  | 'GERENCIA'
  | 'COMPRAS'
  | 'COMPUTO'
  | 'JEFE_OBRA'
  | 'ADMINISTRACION';
export function creds(role: RoleKey) {
  const email = process.env[`E2E_${role}_EMAIL`];
  const password = process.env[`E2E_${role}_PASSWORD`];
  if (!email || !password)
    throw new Error(
      `Faltan E2E_${role}_EMAIL / E2E_${role}_PASSWORD (usuarios sintéticos locales)`,
    );
  return { email, password };
}

export async function login(page: Page, role: RoleKey) {
  const { email, password } = creds(role);
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(
    'Ingresar',
    { timeout: 20_000 },
  );
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

export const ORIGIN = {
  Origin: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
};
export const uid = () => Math.random().toString(36).slice(2, 8);

/** Selector de material con búsqueda (MaterialPicker): escribe el código y toca la opción. */
export async function pickMaterial(
  scope: Page | import('@playwright/test').Locator,
  code: string,
  label = 'Material',
) {
  const input = scope.getByLabel(label, { exact: true });
  const change = scope.getByRole('button', { name: 'Cambiar' });
  if (!(await input.isVisible()) && (await change.count()))
    await change.first().click();
  await input.fill(code);
  const opt = scope.getByRole('option').filter({ hasText: code }).first();
  await expect(opt).toBeVisible({ timeout: 15_000 });
  await opt.click();
  await expect(scope.getByText(code).first()).toBeVisible();
}

/** Cliente API autenticado SÓLO para PREPARACIÓN/verificación (no es el objeto de los casos de UI). */
export type Api = {
  get: <T = any>(path: string) => Promise<T>;
  list: <T = any>(path: string) => Promise<{ data: T[]; total: number }>;
  send: <T = any>(
    method: 'POST' | 'PUT' | 'PATCH',
    path: string,
    data: unknown,
    key?: string,
  ) => Promise<T>;
  dispose: () => Promise<void>;
};
export async function apiAs(role: RoleKey): Promise<Api> {
  const { request } = await import('@playwright/test');
  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: ORIGIN });
  const r = await ctx.post('/api/v1/auth/login', { data: creds(role) });
  if (!r.ok()) throw new Error(`login API ${role}: ${r.status()}`);
  const get = async (path: string) => {
    const res = await ctx.get(`/api/v1${path}`);
    if (!res.ok())
      throw new Error(`GET ${path} -> ${res.status()} ${await res.text()}`);
    return (await res.json()).data;
  };
  return {
    get,
    list: async (path: string) => {
      const res = await ctx.get(`/api/v1${path}`);
      if (!res.ok())
        throw new Error(`GET ${path} -> ${res.status()} ${await res.text()}`);
      const j = await res.json();
      return { data: j.data, total: j.pagination.total };
    },
    send: async (method, path, data, key) => {
      if (
        method === 'POST' &&
        path === '/works' &&
        data &&
        typeof data === 'object' &&
        !('clientId' in data)
      ) {
        const clients = await ctx.get('/api/v1/clients?pageSize=100');
        const client = (await clients.json()).data.find(
          (c: { active: boolean }) => c.active,
        );
        if (!client) throw new Error('Falta cliente sintético de preparación');
        data = { ...data, clientId: client.id };
      }
      const res = await ctx.fetch(`/api/v1${path}`, {
        method,
        data,
        headers: key ? { 'Idempotency-Key': key } : {},
      });
      if (!res.ok())
        throw new Error(
          `${method} ${path} -> ${res.status()} ${await res.text()}`,
        );
      const t = await res.text();
      return t ? JSON.parse(t).data : undefined;
    },
    dispose: () => ctx.dispose(),
  };
}

/** Busca por código en un listado paginado completo. */
/** Unidad predeterminada por símbolo (m², kg, un): sus códigos UNI-### dependen de la base. */
export async function unitBySymbol<T extends { id: string }>(
  api: Api,
  symbol: string,
): Promise<T> {
  const { data } = await api.list<T & { symbol: string | null }>(
    '/units?page=1&pageSize=100',
  );
  const f = data.find((u) => u.symbol === symbol);
  if (!f) throw new Error(`Unidad ${symbol} no encontrada`);
  return f;
}
export async function byCode<T extends { code: string }>(
  api: Api,
  path: string,
  code: string,
): Promise<T> {
  for (let page = 1; ; page++) {
    const { data, total } = await api.list<T>(
      `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`,
    );
    const f = data.find((x) => x.code === code);
    if (f) return f;
    if (page * 100 >= total)
      throw new Error(`${code} no encontrado en ${path}`);
  }
}

/** PREPARACIÓN: asigna una obra extra al Jefe conservando TODAS sus obras actuales. */
export async function assignJefe(admin: Api, workId: string) {
  const users = await admin.list<{ id: string; email: string; role: string }>(
    '/users?pageSize=100',
  );
  const jefe = users.data.find((u) => u.email === creds('JEFE_OBRA').email)!;
  const cur = await admin
    .get<any>(`/users/${jefe.id}/assignments`)
    .catch(() => null);
  const ids: string[] = Array.isArray(cur)
    ? cur.map((a: any) => a.workId ?? a.id ?? a)
    : (cur?.workIds ?? []);
  await admin.send('PUT', `/users/${jefe.id}/assignments`, {
    workIds: [...new Set([...ids, workId])],
  });
}

/** Notificación visible con ese texto (título o detalle). Varios textos deben estar en la misma notificación. */
export const toast = (page: Page, ...texts: (string | RegExp)[]) => {
  let loc = page.locator('.toast');
  for (const t of texts) loc = loc.filter({ hasText: t });
  return expect(loc.first()).toBeVisible({ timeout: 15_000 });
};
export async function confirmModal(page: Page, label: string | RegExp) {
  await page.getByRole('dialog').getByRole('button', { name: label }).click();
}
export const SUFFIX = () =>
  `${Date.now().toString(36).slice(-4)}${uid().slice(0, 3)}`.toUpperCase();
export const isoDays = (d: number) =>
  new Date(Date.now() + d * 86_400_000).toISOString();
