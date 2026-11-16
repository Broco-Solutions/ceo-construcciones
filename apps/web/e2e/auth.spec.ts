import { expect, test } from '@playwright/test';
import { creds, login } from './helpers';

test('login emite ceo_session y ceo_login_client por separado, sesión persiste y logout la revoca', async ({
  page,
  context,
}) => {
  const { email, password } = creds('GERENCIA');
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  const [resp] = await Promise.all([
    page.waitForResponse('**/api/v1/auth/login'),
    page.getByRole('button', { name: 'Ingresar' }).click(),
  ]);
  expect(resp.status()).toBe(200);
  const setCookies = (await resp.headersArray())
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value);
  expect(setCookies.some((c) => c.startsWith('ceo_session='))).toBe(true);
  expect(setCookies.some((c) => c.startsWith('ceo_login_client='))).toBe(true);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'ceo_session')?.httpOnly).toBe(true);
  expect(cookies.find((c) => c.name === 'ceo_login_client')?.httpOnly).toBe(
    true,
  );
  for (const name of ['ceo_session', 'ceo_login_client']) {
    const cookie = cookies.find((c) => c.name === name)!;
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
    expect(cookie.path).toBe('/');
    expect(cookie.domain).toBe('localhost');
  }
  await page.waitForURL('/');
  // Persistencia: recarga mantiene la sesión.
  await page.reload();
  await expect(
    page.getByRole('navigation', { name: 'Navegación principal' }),
  ).toBeVisible();
  // JS no puede leer la cookie de sesión.
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    'ceo_session',
  );
  const forbiddenLogout = await page.request.post('/api/v1/auth/logout', {
    headers: { Origin: 'https://origen-ajeno.example.test' },
  });
  expect(forbiddenLogout.status()).toBe(403);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL(/\/login/);
  const me = await page.request.get('/api/v1/auth/me');
  expect(me.status()).toBe(401);
});

test('credenciales inválidas muestran error y conservan la cookie de cliente', async ({
  page,
  context,
}) => {
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill('noexiste@demo.local');
  await page.getByLabel('Contraseña').fill('contraseña-incorrecta-123');
  const [resp] = await Promise.all([
    page.waitForResponse('**/api/v1/auth/login'),
    page.getByRole('button', { name: 'Ingresar' }).click(),
  ]);
  expect(resp.status()).toBe(401);
  // Next dev agrega su propio role=alert (route announcer); filtramos por texto.
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Correo o contraseña incorrectos' }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((c) => c.name === 'ceo_login_client'),
  ).toBe(true);
});

test('sin sesión, rutas protegidas redirigen a login (401)', async ({
  page,
}) => {
  await page.goto('/obras');
  await page.waitForURL(/\/login\?next=%2Fobras/);
});

test('403: sin permisos el backend rechaza y la UI no expone la sección', async ({
  page,
}) => {
  await login(page, 'JEFE_OBRA');
  const r = await page.request.get('/api/v1/users');
  expect(r.status()).toBe(403);
  await page.goto('/admin/usuarios');
  await expect(
    page.getByText('Tu rol no tiene acceso a esta sección.'),
  ).toBeVisible();
});

test('429: se respeta Retry-After y se bloquea el botón', async ({ page }) => {
  // Se agota la cuota de este cliente opaco (10 intentos / 15 min) en un contexto descartable.
  await page.goto('/login');
  let last = 0;
  for (let i = 0; i < 12 && last !== 429; i++) {
    const r = await page.request.post('/api/v1/auth/login', {
      data: { email: 'rate@demo.local', password: 'x'.repeat(12) },
      headers: { Origin: 'http://localhost:3000' },
    });
    last = r.status();
    if (last === 429)
      expect(Number(r.headers()['retry-after'])).toBeGreaterThan(0);
  }
  expect(last).toBe(429);
  await page.getByLabel('Correo electrónico').fill('rate@demo.local');
  await page.getByLabel('Contraseña').fill('x'.repeat(12));
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(
    page.getByRole('button', { name: /Esperá \d+ s/ }),
  ).toBeDisabled();
});

const NAV_SECTION: Record<string, string> = {
  Usuarios: 'Administración',
  'Actividades de obra': 'Presupuesto',
  Cotizaciones: 'Compras',
  'Proveedores y precios': 'Catálogo',
  Cómputos: 'Presupuesto',
  Presupuestos: 'Presupuesto',
  Pedidos: 'Compras',
  Stock: 'Inventario',
  Recepciones: 'Compras',
};

for (const [role, visible, hidden] of [
  ['GERENCIA', ['Usuarios', 'Actividades de obra', 'Cotizaciones'], []],
  ['COMPRAS', ['Cotizaciones', 'Proveedores y precios'], ['Usuarios']],
  [
    'COMPUTO',
    ['Actividades de obra', 'Cómputos', 'Presupuestos'],
    ['Usuarios', 'Recepciones'],
  ],
  [
    'JEFE_OBRA',
    ['Pedidos', 'Stock', 'Recepciones'],
    [
      'Actividades de obra',
      'Cotizaciones',
      'Proveedores y precios',
      'Usuarios',
      'Presupuestos',
    ],
  ],
] as const) {
  test('navegación por rol: ' + role, async ({ page }) => {
    await login(page, role);
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    for (const label of visible) {
      const section = nav.getByRole('button', {
        name: NAV_SECTION[label],
        exact: true,
      });
      await expect(section).toBeVisible();
      if ((await section.getAttribute('aria-expanded')) !== 'true')
        await section.click();
      await expect(
        nav.getByRole('link', { name: label, exact: true }),
      ).toBeVisible();
    }
    for (const label of hidden) {
      const section = nav.getByRole('button', {
        name: NAV_SECTION[label],
        exact: true,
      });
      if (
        (await section.count()) &&
        (await section.getAttribute('aria-expanded')) !== 'true'
      )
        await section.click();
      await expect(
        nav.getByRole('link', { name: label, exact: true }),
      ).toHaveCount(0);
    }
  });
}

test('una sesión inválida redirige a login y permite volver a ingresar', async ({ page, context }) => {
  await login(page, 'GERENCIA');
  // Terminar la carga inicial antes de invalidar la sesión: el 401 debe
  // producirse al navegar, no en una petición de Inicio todavía en curso.
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await context.addCookies([{
    name: 'ceo_session', value: 'f'.repeat(64), url: 'http://localhost:3000',
    httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
  await page.getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Obras', exact: true }).click();
  await page.waitForURL(/\/login\?next=%2Fobras/);
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(401);
  await page.getByLabel('Correo electrónico').fill(creds('GERENCIA').email);
  await page.getByLabel('Contraseña').fill(creds('GERENCIA').password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.waitForURL('/obras');
  expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
});

// Expectativas explícitas: no derivarlas de la matriz que se está verificando.
const allRoutes = [
  '/', '/clientes', '/obras', '/materiales', '/costos', '/catalogo', '/proveedores',
  '/apu', '/computos', '/presupuestos', '/pedidos', '/cotizaciones', '/ordenes',
  '/recepciones', '/recepcion-delegada', '/administracion', '/stock',
  '/stock/movimientos', '/stock/reservas', '/stock/alertas', '/reportes',
  '/indicadores', '/admin/usuarios', '/admin/ubicaciones', '/admin/importaciones',
  '/admin/auditoria',
];
const roleCases = [
  { role: 'GERENCIA', label: 'Gerencia', routes: allRoutes,
    visits: [['Administración', '/admin/usuarios'], ['General', '/obras']] },
  { role: 'COMPRAS', label: 'Compras', routes: allRoutes.filter((p) => !p.startsWith('/admin/')),
    visits: [['Compras', '/cotizaciones'], ['Catálogo', '/proveedores']] },
  { role: 'COMPUTO', label: 'Cómputo y Presupuestos',
    routes: allRoutes.filter((p) => !p.startsWith('/admin/') && !['/recepciones', '/administracion'].includes(p)),
    visits: [['Presupuesto', '/apu'], ['Presupuesto', '/presupuestos']] },
  { role: 'JEFE_OBRA', label: 'Jefe de Obra',
    routes: ['/', '/obras', '/materiales', '/pedidos', '/ordenes', '/recepciones',
      '/recepcion-delegada', '/stock', '/stock/movimientos', '/stock/reservas', '/stock/alertas', '/reportes'],
    visits: [['Compras', '/pedidos'], ['Inventario', '/stock']] },
  { role: 'ADMINISTRACION', label: 'Administración restringida',
    routes: ['/recepcion-delegada', '/administracion'],
    visits: [['Compras', '/administracion'], ['Compras', '/recepcion-delegada']] },
] as const;
const routeTitles: Record<string, string> = {
  '/admin/usuarios': 'Usuarios', '/obras': 'Obras', '/cotizaciones': 'Cotizaciones',
  '/proveedores': 'Proveedores', '/apu': 'Actividades de obra',
  '/presupuestos': 'Presupuestos', '/pedidos': 'Pedidos de materiales', '/stock': 'Stock',
  '/administracion': 'Factura y pago informativo', '/recepcion-delegada': 'Recepciones delegadas',
};

for (const mobile of [false, true]) {
  test.describe(mobile ? 'accesos y menú móvil' : 'accesos y menú escritorio', () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile, hasTouch: mobile });
    for (const scenario of roleCases) {
      test(scenario.role + ': identidad, enlaces, navegación y logout', async ({ page, context }) => {
        await login(page, scenario.role);
        const me = await page.request.get('/api/v1/auth/me');
        expect(me.status()).toBe(200);
        const { data: user } = await me.json();
        expect(user.email).toBe(creds(scenario.role).email);
        expect(user.role).toBe(scenario.role);
        const session = (await context.cookies()).find((c) => c.name === 'ceo_session')!;
        const nav = page.getByRole('navigation', {
          name: mobile ? 'Menú completo' : 'Navegación principal', exact: true,
        });
        const openMenu = async () => {
          if (mobile) await page.getByRole('button', { name: 'Abrir menú' }).click();
          await expect(nav).toBeVisible();
        };
        await openMenu();
        expect(await nav.locator('a').evaluateAll((links) => links
          .filter((a) => a.classList.contains('nav-child'))
          .map((a) => a.getAttribute('href')).sort()))
          .toEqual([...scenario.routes].sort());
        const userPanel = mobile ? nav : page.locator('aside.side');
        await expect(userPanel.locator('.user-details b')).toHaveText(user.name);
        await expect(userPanel.locator('.user-details span')).toHaveText(scenario.label);
        if (mobile) {
          await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
          await expect(nav).toHaveCount(0);
          await openMenu();
        }
        for (let i = 0; i < scenario.visits.length; i++) {
          if (mobile && i > 0) await openMenu();
          const [group, href] = scenario.visits[i];
          const section = nav.getByRole('button', { name: group, exact: true });
          if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click();
          await nav.locator(`a[href="${href}"]`).click();
          await page.waitForURL(href);
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(routeTitles[href]);
          if (mobile) {
            await expect(nav).toHaveCount(0);
            await openMenu();
          }
          await expect(nav.locator(`a[href="${href}"]`)).toHaveAttribute('aria-current', 'page');
          const current = await page.request.get('/api/v1/auth/me');
          expect(current.status()).toBe(200);
          expect((await current.json()).data.id).toBe(user.id);
          if (mobile) await page.getByRole('button', { name: 'Cerrar menú', exact: true }).click();
        }
        if (mobile) await openMenu();
        await (mobile ? nav : page.locator('aside.side')).locator('a.logo').click();
        await page.waitForURL('/');
        if (mobile) await expect(nav).toHaveCount(0);
        else if (scenario.role !== 'ADMINISTRACION')
          await expect(nav.locator('a[href="/"]')).toHaveAttribute('aria-current', 'page');
        expect((await page.request.get('/api/v1/auth/me')).status()).toBe(200);
        if (mobile) await openMenu();
        await userPanel.getByRole('button', { name: 'Cerrar sesión' }).click();
        await page.waitForURL(/\/login/);
        expect((await context.cookies()).some((c) => c.name === 'ceo_session')).toBe(false);
        // Reutilizar el token anterior comprueba revocación en servidor, además del borrado de cookie.
        expect((await page.request.get('/api/v1/auth/me', {
          headers: { Cookie: `ceo_session=${session.value}` },
        })).status()).toBe(401);
      });
    }
  });
}
