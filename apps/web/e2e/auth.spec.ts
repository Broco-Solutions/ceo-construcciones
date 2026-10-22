import { expect, test } from '@playwright/test';
import { creds, login } from './helpers';

test('login emite ceo_session y ceo_login_client por separado, sesión persiste y logout la revoca', async ({ page, context }) => {
  const { email, password } = creds('GERENCIA');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  const [resp] = await Promise.all([page.waitForResponse('**/api/v1/auth/login'), page.getByRole('button', { name: 'Ingresar' }).click()]);
  expect(resp.status()).toBe(200);
  const setCookies = (await resp.headersArray()).filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value);
  expect(setCookies.some((c) => c.startsWith('ceo_session='))).toBe(true);
  expect(setCookies.some((c) => c.startsWith('ceo_login_client='))).toBe(true);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'ceo_session')?.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name === 'ceo_login_client')?.httpOnly).toBe(true);
  await page.waitForURL('/');
  // Persistencia: recarga mantiene la sesión.
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  // JS no puede leer la cookie de sesión.
  expect(await page.evaluate(() => document.cookie)).not.toContain('ceo_session');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(/\/login/);
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(401);
});

test('credenciales inválidas muestran error y conservan la cookie de cliente', async ({ page, context }) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('noexiste@demo.local');
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta-123');
  const [resp] = await Promise.all([page.waitForResponse('**/api/v1/auth/login'), page.getByRole('button', { name: 'Ingresar' }).click()]);
  expect(resp.status()).toBe(401);
  // Next dev agrega su propio role=alert (route announcer); filtramos por texto.
  await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === 'ceo_login_client')).toBe(true);
});

test('sin sesión, rutas protegidas redirigen a login (401)', async ({ page }) => {
  await page.goto('/obras');
  await page.waitForURL(/\/login\?next=%2Fobras/);
});

test('403: sin permisos el backend rechaza y la UI no expone la sección', async ({ page }) => {
  await login(page, 'JEFE_OBRA');
  const r = await page.request.get('/api/v1/users');
  expect(r.status()).toBe(403);
  await page.goto('/admin/usuarios');
  await expect(page.getByText('Tu rol no tiene acceso a esta sección.')).toBeVisible();
});

test('429: se respeta Retry-After y se bloquea el botón', async ({ page }) => {
  // Se agota la cuota de este cliente opaco (10 intentos / 15 min) en un contexto descartable.
  await page.goto('/login');
  let last = 0;
  for (let i = 0; i < 12 && last !== 429; i++) {
    const r = await page.request.post('/api/v1/auth/login', { data: { email: 'rate@demo.local', password: 'x'.repeat(12) }, headers: { Origin: 'http://localhost:3000' } });
    last = r.status();
    if (last === 429) expect(Number(r.headers()['retry-after'])).toBeGreaterThan(0);
  }
  expect(last).toBe(429);
  await page.getByLabel('Correo electrónico').fill('rate@demo.local');
  await page.getByLabel('Contraseña').fill('x'.repeat(12));
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('button', { name: /Esperá \d+ s/ })).toBeDisabled();
});

const NAV_SECTION: Record<string, string> = {
  'Usuarios': 'Administración',
  'APU': 'Presupuesto',
  'Cotizaciones': 'Compras',
  'Proveedores y precios': 'Catálogo',
  'Cómputos': 'Presupuesto',
  'Presupuestos': 'Presupuesto',
  'Pedidos': 'Compras',
  'Stock': 'Inventario',
  'Recepciones': 'Compras',
};

for (const [role, visible, hidden] of [
  ['GERENCIA', ['Usuarios', 'APU', 'Cotizaciones'], []],
  ['COMPRAS', ['Cotizaciones', 'Proveedores y precios'], ['Usuarios']],
  ['COMPUTO', ['APU', 'Cómputos', 'Presupuestos'], ['Usuarios', 'Recepciones']],
  ['JEFE_OBRA', ['Pedidos', 'Stock', 'Recepciones'], ['APU', 'Cotizaciones', 'Proveedores y precios', 'Usuarios', 'Presupuestos']],
] as const) {
  test('navegación por rol: ' + role, async ({ page }) => {
    await login(page, role);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    for (const label of visible) {
      const section = nav.getByRole('button', { name: NAV_SECTION[label], exact: true });
      await expect(section).toBeVisible();
      if (await section.getAttribute('aria-expanded') !== 'true') await section.click();
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
    for (const label of hidden) {
      const section = nav.getByRole('button', { name: NAV_SECTION[label], exact: true });
      if (await section.count() && await section.getAttribute('aria-expanded') !== 'true') await section.click();
      await expect(nav.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
  });
}
