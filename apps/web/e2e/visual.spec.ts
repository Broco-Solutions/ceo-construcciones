// Revisión visual/accesibilidad básica por rol (desktop 1280): cada pantalla del menú carga sin error,
// sin scroll horizontal, con controles etiquetados y botones con nombre accesible.
import { expect, test, type Page } from '@playwright/test';
import { login, type RoleKey } from './helpers';

const OUT = process.env.E2E_VISUAL_DIR; // opcional: carpeta para capturas de revisión (fuera del repo)

async function audit(page: Page, path: string, role: RoleKey) {
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#contenido .loading')).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(
    page.getByText('Tu rol no tiene acceso a esta sección.'),
  ).toHaveCount(0);
  const r = await page.evaluate(() => {
    const vis = (el: Element) => {
      const s = getComputedStyle(el);
      const b = (el as HTMLElement).getBoundingClientRect();
      return (
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        b.width > 0 &&
        b.height > 0
      );
    };
    const name = (el: Element) => {
      const h = el as HTMLInputElement;
      if (
        h.getAttribute('aria-label') ||
        h.getAttribute('aria-labelledby') ||
        h.title
      )
        return true;
      if (h.labels && h.labels.length) return true;
      return (
        !!el.textContent?.trim() ||
        !!el.querySelector('img[alt]')?.getAttribute('alt')?.trim()
      );
    };
    const unlabeled = [
      ...document.querySelectorAll(
        '#contenido input:not([type=hidden]), #contenido select, #contenido textarea',
      ),
    ]
      .filter(vis)
      .filter(
        (el) =>
          !name(el) ||
          (el.tagName !== 'SELECT' &&
            el.tagName !== 'TEXTAREA' &&
            !(
              (el as HTMLInputElement).labels?.length ||
              el.getAttribute('aria-label') ||
              el.getAttribute('aria-labelledby') ||
              (el as HTMLElement).title
            )),
      )
      .map((el) => el.outerHTML.slice(0, 120));
    const nameless = [...document.querySelectorAll('button, a[href]')]
      .filter(vis)
      .filter((el) => !name(el))
      .map((el) => el.outerHTML.slice(0, 120));
    return {
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      unlabeled,
      nameless,
    };
  });
  expect(r.sw, `scroll horizontal en ${path}`).toBeLessThanOrEqual(r.iw);
  expect(r.unlabeled, `controles sin etiqueta en ${path}`).toEqual([]);
  expect(r.nameless, `botones/enlaces sin nombre en ${path}`).toEqual([]);
  if (OUT)
    await page.screenshot({
      path: `${OUT}/${role}-${page.viewportSize()!.width}-${path.replace(/\W+/g, '_')}.png`,
      fullPage: true,
    });
}

const SCREENS: Record<RoleKey, string[]> = {
  ADMINISTRACION: ['/administracion', '/recepcion-delegada'],
  JEFE_OBRA: ['/', '/pedidos', '/pedidos/nuevo', '/recepciones', '/stock', '/stock/movimientos/nuevo'],
  GERENCIA: [
    '/',
    '/clientes',
    '/obras',
    '/materiales',
    '/catalogo',
    '/proveedores',
    '/proveedores/precios',
    '/apu',
    '/computos',
    '/presupuestos',
    '/pedidos',
    '/cotizaciones',
    '/ordenes',
    '/recepciones',
    '/stock',
    '/stock/movimientos',
    '/stock/reservas',
    '/stock/alertas',
    '/reportes',
    '/admin/usuarios',
    '/admin/ubicaciones',
    '/admin/importaciones',
    '/admin/auditoria',
    '/ordenes/nueva',
    '/stock/movimientos/nuevo',
  ],
  COMPRAS: [
    '/',
    '/obras',
    '/materiales',
    '/proveedores',
    '/pedidos',
    '/cotizaciones',
    '/ordenes',
    '/ordenes/nueva',
    '/recepciones',
    '/stock',
    '/stock/movimientos',
    '/stock/movimientos/nuevo',
    '/stock/reservas',
    '/reportes',
  ],
  COMPUTO: [
    '/',
    '/obras',
    '/materiales',
    '/apu',
    '/apu/nuevo',
    '/computos',
    '/presupuestos',
    '/reportes',
  ],
};

for (const [role, paths] of Object.entries(SCREENS) as [RoleKey, string[]][]) {
  test(`revisión visual desktop: ${role}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await login(page, role);
    for (const p of paths) await audit(page, p, role);
  });
}

// Misión 02: los mismos controles y rutas, en los dos anchos mínimos autorizados.
const MOBILE_SCREENS: Record<RoleKey, string[]> = {
  GERENCIA: ['/', '/clientes', '/obras', '/presupuestos', '/ordenes', '/stock', '/reportes'],
  COMPUTO: ['/apu', '/computos', '/presupuestos'],
  COMPRAS: ['/pedidos', '/cotizaciones', '/ordenes', '/recepciones', '/stock'],
  JEFE_OBRA: SCREENS.JEFE_OBRA,
  ADMINISTRACION: SCREENS.ADMINISTRACION,
};
for (const width of [360, 390]) {
  for (const [role, paths] of Object.entries(MOBILE_SCREENS) as [RoleKey, string[]][]) {
    test(`revisión móvil ${width}px: ${role}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      try {
        const page = await context.newPage();
        await login(page, role);
        const identity = await (await page.request.get('/api/v1/auth/me')).json();
        for (const path of paths) {
          await audit(page, path, role);
          expect(await (await page.request.get('/api/v1/auth/me')).json()).toEqual(identity);
        }
      } finally {
        await context.close();
      }
    });
  }
}
