// Jefe de Obra en celular (Pixel 7) contra la API real: accesos rápidos, pedido táctil, recepción y consumo.
// La API directa se usa SÓLO para PREPARACIÓN (OC emitida por Compras para poder recibir).
import { expect, test, type Page } from '@playwright/test';
import { apiAs, byCode, login, ORIGIN, pickMaterial, uid } from './helpers';

test.describe.configure({ mode: 'serial' });

const SUF = `${Date.now().toString(36).slice(-4)}${uid().slice(0, 3)}`.toUpperCase();
const EVID = 'docs/evidencia';
const st: { requestId?: string; orderId?: string; orderNumber?: string } = {};

async function noHorizontalScroll(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `scroll horizontal en ${label}`).toBeLessThanOrEqual(iw);
}
const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).locator('visible=true').first()).toBeVisible({ timeout: 15_000 });
async function selectByText(sel: import('@playwright/test').Locator, text: string) {
  const o = sel.locator('option').filter({ hasText: text }).first();
  await sel.selectOption((await o.getAttribute('value'))!);
}
const tomorrow = (d = 7) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

test('inicio con accesos rápidos y pantallas principales sin scroll horizontal', async ({ page }) => {
  await login(page, 'JEFE_OBRA');
  for (const name of ['Nuevo pedido', 'Recepciones', 'Stock de mi obra', /Consumo/]) {
    await expect(page.locator('#contenido').getByRole('link', { name }).first()).toBeVisible();
  }
  await expect(page.getByRole('navigation', { name: 'Navegación móvil' })).toBeVisible();
  await noHorizontalScroll(page, '/');
  await page.screenshot({ path: `${EVID}/12-movil-inicio-jefe.png` });
  for (const path of ['/pedidos', '/pedidos/nuevo', '/recepciones', '/stock', '/stock/movimientos/nuevo', '/ordenes']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await noHorizontalScroll(page, path);
  }
});

test('pedido nuevo con controles táctiles', async ({ page }) => {
  await login(page, 'JEFE_OBRA');
  await page.locator('#contenido').getByRole('link', { name: 'Nuevo pedido' }).first().tap();
  await page.waitForURL(/\/pedidos\/nuevo/);
  await page.getByRole('button', { name: /OBR-DEMO-01/ }).tap();
  await page.getByRole('button', { name: /Revoques/ }).tap();
  const plus = page.getByRole('button', { name: /^Sumar 1 a Cantidad de Cemento portland/ });
  for (let i = 0; i < 3; i++) await plus.tap();
  await page.getByRole('button', { name: /^Restar 1 a Cantidad de Cemento portland/ }).tap();
  await expect(page.getByLabel(/^Cantidad de Cemento portland/)).toHaveValue('2');
  const box = await plus.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(40); // objetivo táctil
  await noHorizontalScroll(page, 'pedido paso materiales');
  await page.screenshot({ path: `${EVID}/13-movil-pedido-tactil.png` });
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await page.getByLabel('Fecha requerida').fill(tomorrow());
  await page.getByRole('button', { name: 'Siguiente' }).tap();
  await page.getByRole('button', { name: 'Enviar pedido' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).tap();
  await toast(page, 'Pedido enviado a Compras');
  await page.waitForURL(/\/pedidos\/(?!nuevo)[^/]+$/);
  st.requestId = page.url().split('/').pop()!;
});

test('recepción desde el celular', async ({ page, browser }) => {
  test.skip(!st.requestId, 'requiere el pedido');
  // PREPARACIÓN: Compras crea y emite una OC para el pedido (no es el objeto del caso).
  const ctx = await browser.newContext();
  const c = await ctx.newPage();
  await login(c, 'COMPRAS');
  const get = async (p: string) => (await (await c.request.get(`/api/v1${p}`)).json()).data;
  const req = await get(`/requests/${st.requestId}`);
  const locs: { id: string; code: string }[] = await get('/locations?pageSize=100');
  const sups: { id: string; active: boolean }[] = await get('/suppliers?pageSize=100');
  const r = await c.request.post('/api/v1/purchase-orders', {
    headers: { ...ORIGIN, 'Idempotency-Key': `e2e-oc-${SUF}` },
    data: {
      requestId: st.requestId,
      workId: req.workId,
      supplierId: sups.find((s) => s.active)!.id,
      destinationId: locs.find((l) => l.code === 'OBRA-OBR-DEMO-01')!.id,
      currency: 'ARS',
      taxBasis: 'UNSPECIFIED',
      lines: req.lines.map((l: { materialId: string; quantity: string }) => ({ materialId: l.materialId, quantity: l.quantity, unitPrice: '1000', baseQuantity: '1' })),
    },
  });
  expect(r.status(), await r.text()).toBeLessThan(300);
  const order = (await r.json()).data;
  const iss = await c.request.post(`/api/v1/purchase-orders/${order.id}/status`, { headers: { ...ORIGIN, 'Idempotency-Key': `e2e-iss-${SUF}` }, data: { status: 'ISSUED' } });
  expect(iss.status(), await iss.text()).toBeLessThan(300);
  await ctx.close();
  st.orderId = order.id;
  st.orderNumber = `OC-${order.number}`;

  await login(page, 'JEFE_OBRA');
  await page.locator('#contenido').getByRole('link', { name: 'Recepciones' }).first().tap();
  await page.waitForURL(/\/recepciones/);
  await page.getByText(st.orderNumber).locator('visible=true').first().tap();
  await page.waitForURL(`**/recepciones/${st.orderId}`);
  await page.getByLabel('N.º de remito').fill(`RM-${SUF}`);
  const loc = page.getByLabel('Ubicación que recibe');
  if (!(await loc.inputValue())) await selectByText(loc, 'Obra Demo Norte');
  await page.getByRole('button', { name: /^Sumar 1 a Cantidad recibida de Cemento portland/ }).tap();
  await noHorizontalScroll(page, 'recepción');
  await page.screenshot({ path: `${EVID}/14-movil-recepcion.png`, fullPage: true });
  await page.getByRole('button', { name: 'Revisar recepción' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar recepción' }).tap();
  await toast(page, 'Recepción registrada');
});

test('consumo desde el celular', async ({ page }) => {
  await login(page, 'JEFE_OBRA');
  await page.locator('#contenido').getByRole('link', { name: /Consumo/ }).first().tap();
  await page.waitForURL(/\/stock\/movimientos\/nuevo/);
  await page.getByRole('button', { name: 'Consumo en obra' }).tap();
  await pickMaterial(page, 'CEM-001');
  await selectByText(page.getByLabel('Obra (origen)'), 'OBRA-OBR-DEMO-01');
  await expect(page.getByText(/Saldo actual en/)).toBeVisible();
  await page.getByLabel(/^Cantidad/).fill('1');
  await noHorizontalScroll(page, 'consumo');
  await page.screenshot({ path: `${EVID}/15-movil-consumo.png`, fullPage: true });
  await page.getByRole('button', { name: 'Revisar y confirmar' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar movimiento' }).tap();
  await toast(page, 'Consumo en obra: movimiento registrado.');
});

test('devolución desde el celular: obra → material → galpón → cantidad → confirmar', async ({ page }) => {
  // PREPARACIÓN: saldo conocido en la obra del Jefe (ajuste de Gerencia por API).
  const admin = await apiAs('GERENCIA');
  const loc = await byCode<{ id: string; code: string }>(admin, '/locations', 'OBRA-OBR-DEMO-01');
  const cem = await byCode<{ id: string; code: string }>(admin, '/materials', 'CEM-001');
  await admin.send('POST', '/movements', { type: 'ADJUSTMENT', direction: 'IN', reason: `Preparación devolución ${SUF}`, materialId: cem.id, destinationId: loc.id, quantity: '3' }, `e2e-dev-${SUF}`);
  await admin.dispose();
  const econ: string[] = [];
  page.on('request', (r) => /\/api\/v1\/(users|prices|suppliers|budgets|apu-items)/.test(r.url()) && econ.push(r.url()));

  await login(page, 'JEFE_OBRA');
  await page.goto('/stock/movimientos/nuevo');
  await page.getByRole('button', { name: 'Devolución' }).tap();
  await pickMaterial(page, 'CEM-001');
  await page.getByLabel('Obra (origen)').selectOption(loc.id);
  await expect(page.getByText(/Saldo actual en/)).toBeVisible();
  const dest = page.getByLabel('Devolver a (galpón o patio)');
  const opt = dest.locator('option').filter({ hasText: 'GAL-01' });
  await dest.selectOption((await opt.getAttribute('value'))!);
  await page.getByLabel(/^Cantidad/).fill('2');
  await noHorizontalScroll(page, 'devolución');
  await page.screenshot({ path: `${EVID}/20-movil-devolucion-jefe.png`, fullPage: true });
  await page.getByRole('button', { name: 'Revisar y confirmar' }).tap();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar movimiento' }).tap();
  await toast(page, 'Devolución: movimiento registrado.');
  await expect(page.getByTestId('movement-created-source')).toContainText('Obra Demo Norte');
  await expect(page.getByTestId('movement-created-destination')).toContainText('Galpón Demo Central');
  await expect(page.getByTestId('movement-created-actor')).toHaveText('Jefe Demo');
  await page.getByTestId('movement-created').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${EVID}/21-movil-devolucion-registrada.png` });
  // Historial con nombres (sin /users).
  await page.goto('/stock/movimientos');
  await expect(page.getByText('Galpón Demo Central').locator('visible=true').first()).toBeVisible();
  await expect(page.getByText('Jefe Demo').locator('visible=true').first()).toBeVisible();
  await noHorizontalScroll(page, 'movimientos');
  expect(econ).toEqual([]);
});
