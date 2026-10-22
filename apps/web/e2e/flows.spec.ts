// Flujos V1 de punta a punta POR LA UI contra la API real (sin mocks).
// Cada caso crea datos con sufijo único. La API directa (page.request + Origin) se usa SÓLO para
// preparar datos que no son el objeto del caso y está marcada con "PREPARACIÓN".
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { login, ORIGIN, pickMaterial, uid, type RoleKey } from './helpers';

test.describe.configure({ mode: 'serial' });

const SUF = `${Date.now().toString(36).slice(-4)}${uid().slice(0, 3)}`.toUpperCase();
const EVID = 'docs/evidencia';
const JEFE_WORK = 'OBR-DEMO-01';
const MAT = { cemento: 'CEM-001', arena: 'ARE-001' };

type Ref = { id: string; code: string; name: string };
const st: {
  work?: Ref;
  apuMat?: string;
  apuLabor?: string;
  requestId?: string;
  orderId?: string;
  orderNumber?: string;
  jefeLoc?: Ref;
  warehouse?: Ref;
} = {};

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `${EVID}/${name}.png`, fullPage: true });
}
function today(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}
/** Elige la opción cuyo texto contiene `text` (las etiquetas incluyen unidades/códigos). */
async function pick(select: Locator, text: string) {
  const opt = select.locator('option').filter({ hasText: text }).first();
  await expect(opt).toBeAttached();
  await select.selectOption((await opt.getAttribute('value'))!);
}
async function apiList<T>(page: Page, path: string): Promise<T[]> {
  const r = await page.request.get(`/api/v1${path}${path.includes('?') ? '&' : '?'}pageSize=100`);
  expect(r.ok()).toBe(true);
  return (await r.json()).data as T[];
}
async function asRole<T>(browser: Browser, role: RoleKey, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await login(p, role);
    return await fn(p);
  } finally {
    await ctx.close();
  }
}
async function confirmModal(page: Page, label: string | RegExp) {
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: label }).click();
}
const toast = (page: Page, text: string | RegExp) => expect(page.getByText(text).locator('visible=true').first()).toBeVisible({ timeout: 15_000 });

test('(a) Gerencia da de alta una obra y la consulta', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/obras');
  await page.getByRole('button', { name: 'Nueva obra' }).click();
  const name = `Obra E2E ${SUF}`;
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nombre').fill(name);
  await pick(dlg.getByLabel('Responsable'), 'jefe@demo.local');
  await dlg.getByRole('button', { name: 'Crear obra' }).click();
  await toast(page, 'Obra creada');
  await page.waitForURL(/\/obras\/[^/]+$/);
  const id = page.url().split('/').pop()!;
  const workRes = await page.request.get(`/api/v1/works/${id}`);
  expect(workRes.ok()).toBe(true);
  const code: string = (await workRes.json()).data.code;
  expect(code).toMatch(/^OBR-\d{3,}$/);
  // Consulta desde el listado con búsqueda.
  await page.goto('/obras');
  await page.getByLabel('Buscar').fill(code);
  await page.getByText(name).locator('visible=true').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  await expect(page.getByText(code).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ubicación de stock' })).toBeVisible();
  st.work = { id, code, name };
  await snap(page, '01-obra-detalle-gerencia');
});

test('(b) Cómputo crea un APU con materiales y otro sólo de mano de obra', async ({ page }) => {
  await login(page, 'COMPUTO');
  // APU con materiales
  await page.goto('/apu/nuevo');
  await pick(page.getByLabel('Rubro'), 'Revoques');
  await page.getByLabel('Nombre del ítem').fill(`Revoque E2E ${SUF}`);
  await pick(page.getByLabel('Unidad de trabajo'), 'M2');
  await page.getByRole('button', { name: 'Agregar material' }).click();
  await pick(page.getByLabel('Material 1', { exact: true }), MAT.cemento);
  await page.getByLabel(/^Consumo/).nth(0).fill('4,5');
  await page.getByRole('button', { name: 'Agregar material' }).click();
  await pick(page.getByLabel('Material 2', { exact: true }), MAT.arena);
  await page.getByLabel(/^Consumo/).nth(1).fill('0,07');
  await page.getByLabel('Importe de mano de obra').fill('1200,50');
  await page.getByLabel('Moneda').fill('ARS');
  await page.getByLabel('Base impositiva').selectOption({ index: 1 });
  await snap(page, '02-apu-con-materiales');
  await page.getByRole('button', { name: 'Crear APU' }).click();
  await toast(page, 'APU creado.');
  await page.waitForURL(/\/apu\/(?!nuevo)[^/]+$/);
  st.apuMat = page.url().split('/').pop()!;
  await expect(page.getByText('Cemento portland').first()).toBeVisible();

  // APU sólo mano de obra
  await page.goto('/apu/nuevo');
  await pick(page.getByLabel('Rubro'), 'Revoques');
  await page.getByLabel('Nombre del ítem').fill(`Mano de obra E2E ${SUF}`);
  await pick(page.getByLabel('Unidad de trabajo'), 'M2');
  await expect(page.getByText('sólo de mano de obra')).toBeVisible();
  await page.getByLabel('Moneda').fill('ARS');
  await page.getByLabel('Base impositiva').selectOption({ index: 1 });
  // Mano de obra explícita: vacío bloquea (no se envía nada), 0 se acepta.
  let posted = 0;
  page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/v1/apu-items') && posted++);
  await page.getByRole('button', { name: 'Crear APU' }).click();
  await expect(page.getByText('Ingresá el importe de mano de obra (puede ser 0).')).toBeVisible();
  expect(posted).toBe(0);
  await page.getByLabel('Importe de mano de obra').fill('0');
  await page.getByRole('button', { name: 'Crear APU' }).click();
  await toast(page, 'APU creado.');
  await page.waitForURL(/\/apu\/(?!nuevo)[^/]+$/);
  st.apuLabor = page.url().split('/').pop()!;
  expect(st.apuLabor).not.toBe(st.apuMat);
});

test('(c) Gerencia: cómputo, presupuesto con versión, referencia y materiales consolidados', async ({ page }) => {
  test.skip(!st.work || !st.apuMat, 'requiere (a) y (b)');
  await login(page, 'GERENCIA');
  await page.goto(`/computos/nuevo?workId=${st.work!.id}`);
  await page.getByLabel('Nombre').fill(`Cómputo E2E ${SUF}`);
  for (const [i, apu] of [`Revoque E2E ${SUF}`, `Mano de obra E2E ${SUF}`].entries()) {
    await page.getByRole('button', { name: 'Agregar ítem' }).click();
    await pick(page.getByLabel('Ítem APU').nth(i), apu);
    await page.getByLabel(/^Cantidad/).nth(i).fill(i === 0 ? '120,5' : '30');
  }
  await page.getByRole('button', { name: 'Crear cómputo' }).click();
  await toast(page, 'Cómputo creado.');
  await page.waitForURL(/\/computos\/(?!nuevo)[^/]+$/);

  await page.getByRole('link', { name: 'Presupuestar' }).click();
  await page.waitForURL(/\/presupuestos\/nuevo/);
  await page.getByLabel('Nombre').fill(`Presupuesto E2E ${SUF}`);
  await page.getByRole('button', { name: 'Crear presupuesto' }).click();
  await page.waitForURL(/\/presupuestos\/(?!nuevo)[^/?]+\?/);
  const dlg = page.getByRole('dialog');
  // ?nuevaVersion=1 abre el modal automáticamente.
  await expect(dlg).toBeVisible();
  await expect(dlg.getByLabel('Cómputo de origen')).toBeVisible();
  await pick(dlg.getByLabel('Cómputo de origen'), `Cómputo E2E ${SUF}`);
  await dlg.getByLabel('Moneda').fill('ARS');
  await dlg.getByLabel('Base impositiva').selectOption({ index: 1 });
  await dlg.getByLabel('Decimales (precisión)').selectOption({ index: 1 });
  await dlg.getByLabel('Modo de redondeo').selectOption({ index: 1 });
  // Precios manuales explícitos por material (independiente de los precios de referencia cargados).
  const modes = dlg.locator('select:has(option[value="manual"])');
  await expect(modes).toHaveCount(2);
  for (let i = 0; i < 2; i++) await modes.nth(i).selectOption('manual');
  const prices = dlg.getByLabel(/^Precio por/);
  await prices.nth(0).fill('950');
  await prices.nth(1).fill('42000');
  await dlg.getByRole('button', { name: 'Crear versión' }).click();
  await toast(page, /Versión 1 creada/);
  await page.waitForURL(/\/presupuestos\/versiones\//);
  await page.getByRole('button', { name: 'Marcar como referencia' }).click();
  await confirmModal(page, 'Marcar como referencia');
  await toast(page, 'Versión 1 marcada como referencia.');
  await expect(page.getByRole('button', { name: 'Marcar como referencia' })).toHaveCount(0);
  await snap(page, '03-presupuesto-version-referencia');
  await page.getByRole('tab', { name: 'Materiales necesarios' }).or(page.getByRole('button', { name: 'Materiales necesarios' })).click();
  const cons = page.locator('section.card', { has: page.getByRole('heading', { name: 'Materiales necesarios consolidados' }) });
  await expect(cons.getByText('Cemento portland')).toBeVisible();
  await expect(cons.getByText('Arena fina')).toBeVisible();
  await snap(page, '04-materiales-consolidados');
});

test('(d) Jefe de Obra crea un pedido y lo sigue', async ({ page }) => {
  await login(page, 'JEFE_OBRA');
  await page.goto('/pedidos/nuevo');
  await page.getByRole('button', { name: new RegExp(JEFE_WORK) }).click();
  await page.getByRole('button', { name: /Revoques/ }).click();
  const qty = page.getByLabel(/^Cantidad de Cemento portland/);
  await qty.fill('10');
  await page.getByLabel(/^Sumar 1 a Cantidad de Arena fina/).click();
  await page.getByLabel(/^Sumar 1 a Cantidad de Arena fina/).click();
  await expect(page.getByLabel(/^Cantidad de Arena fina/)).toHaveValue('2');
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByLabel('Fecha requerida').fill(today(14));
  await page.getByLabel('Observaciones (opcional)').fill(`Pedido E2E ${SUF}`);
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText(`Pedido E2E ${SUF}`)).toBeVisible();
  await snap(page, '05-pedido-revision-jefe');
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await confirmModal(page, 'Enviar');
  await toast(page, 'Pedido enviado a Compras');
  await page.waitForURL(/\/pedidos\/(?!nuevo)[^/]+$/);
  st.requestId = page.url().split('/').pop()!;
  await expect(page.getByText('Enviado').first()).toBeVisible();
  // Seguimiento desde el listado
  await page.goto('/pedidos');
  // El más reciente aparece primero; al abrirlo se ve el mismo pedido en estado Enviado.
  await page.locator('table tbody tr').locator('visible=true').first().click();
  await page.waitForURL(`**/pedidos/${st.requestId}`);
  await expect(page.getByText('Enviado').first()).toBeVisible();
});

test('(e) Compras carga dos cotizaciones, compara y selecciona', async ({ page }) => {
  test.skip(!st.requestId, 'requiere (d)');
  await login(page, 'COMPRAS');
  await page.goto(`/pedidos/${st.requestId}`);
  await page.getByRole('button', { name: 'Tomar en proceso' }).click();
  await confirmModal(page, /Confirmar|Tomar en proceso/);
  await toast(page, /Pedido: En proceso/);
  await page.locator('#contenido').getByRole('link', { name: 'Cotizaciones' }).click();
  await page.waitForURL(/\/cotizaciones\//);
  for (const [supplier, prices] of [
    ['Corralón Demo Sur', ['1000', '40000']],
    ['Proveedor Demo Oeste', ['900', '38000']],
  ] as const) {
    await page.getByRole('button', { name: 'Cargar cotización' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Proveedor').selectOption({ label: supplier });
    await dlg.getByLabel('Válida hasta').fill(today(30));
    const p = dlg.getByLabel(/^Precio \(ARS\)/);
    await expect(p).toHaveCount(2);
    await p.nth(0).fill(prices[0]);
    await p.nth(1).fill(prices[1]);
    await dlg.getByRole('button', { name: 'Guardar cotización' }).click();
    await toast(page, 'Cotización cargada');
    await expect(dlg).toBeHidden();
  }
  const cmp = page.locator('section.card', { has: page.getByRole('heading', { name: 'Comparación de ofertas' }) });
  await expect(cmp.getByText('Corralón Demo Sur')).toBeVisible();
  await expect(cmp.getByText('Proveedor Demo Oeste')).toBeVisible();
  await snap(page, '06-comparacion-cotizaciones');
  await cmp.getByRole('button', { name: 'Seleccionar esta oferta' }).last().click();
  await confirmModal(page, 'Confirmar');
  await toast(page, 'Cotización de Proveedor Demo Oeste seleccionada');
  await expect(page.getByRole('link', { name: 'Generar OC con la seleccionada' })).toBeVisible();
});

test('(f) Compras crea y emite la OC y descarga el PDF', async ({ page }) => {
  test.skip(!st.requestId, 'requiere (e)');
  await login(page, 'COMPRAS');
  const locs = await apiList<Ref>(page, '/locations');
  st.jefeLoc = locs.find((l) => l.code === `OBRA-${JEFE_WORK}`)!;
  await page.goto(`/cotizaciones/${st.requestId}`);
  await page.getByRole('link', { name: 'Generar OC con la seleccionada' }).click();
  await page.waitForURL(/\/ordenes\/nueva/);
  await expect(page.getByLabel('Proveedor')).toHaveValue(/.+/);
  await page.getByLabel('Destino de entrega').selectOption(st.jefeLoc.id);
  await page.getByRole('button', { name: 'Revisar y crear' }).click();
  await confirmModal(page, /Confirmar|Crear/);
  await toast(page, /OC-\d+ creada en borrador/);
  await page.waitForURL(/\/ordenes\/(?!nueva)[^/]+$/);
  st.orderId = page.url().split('/').pop()!;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^OC-\d+$/);
  st.orderNumber = (await page.getByRole('heading', { level: 1 }).innerText()).trim();
  await page.getByRole('button', { name: 'Emitir' }).click();
  await confirmModal(page, 'Emitir');
  await toast(page, `${st.orderNumber} emitida`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'PDF' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
  const path = await dl.path();
  const fs = await import('node:fs');
  expect(fs.readFileSync(path).subarray(0, 4).toString()).toBe('%PDF');
  await snap(page, '07-oc-emitida');
});

test('(g) Jefe registra una recepción parcial', async ({ page }) => {
  test.skip(!st.orderId, 'requiere (f)');
  await login(page, 'JEFE_OBRA');
  await page.goto('/recepciones');
  await page.getByText(st.orderNumber!).locator('visible=true').first().click();
  await page.waitForURL(`**/recepciones/${st.orderId}`);
  await page.getByLabel('N.º de remito').fill(`R-${SUF}`);
  const loc = page.getByLabel('Ubicación que recibe');
  if (!(await loc.inputValue())) await loc.selectOption(st.jefeLoc!.id);
  await page.getByLabel(/^Cantidad recibida de Cemento portland/).fill('4');
  await snap(page, '08-recepcion-parcial-jefe');
  await page.getByRole('button', { name: 'Revisar recepción' }).click();
  await confirmModal(page, 'Confirmar recepción');
  await toast(page, 'Recepción registrada');
  await expect(page.getByText(/Recibida parcial|Parcial/i).first()).toBeVisible();
});

test('(h) Compras reserva stock de galpón y lo transfiere a la obra', async ({ page, browser }) => {
  // PREPARACIÓN: alta de stock en galpón por ajuste (Gerencia por API); no es el objeto del caso.
  const wh = await asRole(browser, 'GERENCIA', async (g) => {
    const locs = await apiList<Ref>(g, '/locations');
    const mats = await apiList<Ref>(g, '/materials');
    const w = locs.find((l) => l.code === 'GAL-01')!;
    const r = await g.request.post('/api/v1/movements', {
      headers: { ...ORIGIN, 'Idempotency-Key': `e2e-init-${SUF}` },
      data: { type: 'ADJUSTMENT', direction: 'IN', reason: `Preparación E2E ${SUF}`, materialId: mats.find((m) => m.code === MAT.cemento)!.id, destinationId: w.id, quantity: '50' },
    });
    expect(r.status(), await r.text()).toBeLessThan(300);
    return w;
  });
  st.warehouse = wh;
  await login(page, 'COMPRAS');
  await page.goto('/stock/reservas');
  await page.getByRole('button', { name: /Nueva reserva/ }).click();
  const dlg = page.getByRole('dialog');
  await pick(dlg.getByLabel('Material', { exact: true }), MAT.cemento);
  await dlg.getByLabel('Origen (galpón o patio)').selectOption(wh.id);
  await expect(dlg.getByText(/Disponible en origen/)).toBeVisible();
  await pick(dlg.getByLabel('Obra destino'), JEFE_WORK);
  await dlg.getByLabel(/^Cantidad/).fill('5');
  await dlg.getByRole('button', { name: 'Reservar' }).click();
  await toast(page, 'Reserva creada.');

  await page.goto(`/stock/movimientos/nuevo?type=TRANSFER`);
  await page.getByRole('button', { name: 'Transferencia', pressed: true }).waitFor().catch(() => page.getByRole('button', { name: 'Transferencia' }).click());
  await pickMaterial(page, MAT.cemento);
  await page.getByLabel('Origen', { exact: true }).selectOption(wh.id);
  await page.getByLabel('Destino', { exact: true }).selectOption(st.jefeLoc!.id);
  await page.getByLabel(/^Cantidad/).fill('5');
  await pick(page.getByLabel('Satisfacer reserva (opcional)'), 'Reservado 5');
  await snap(page, '09-transferencia-con-reserva');
  await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
  await confirmModal(page, 'Confirmar movimiento');
  await toast(page, 'Transferencia: movimiento registrado.');
});

test('(i) Jefe registra consumo y devolución', async ({ page }) => {
  test.skip(!st.jefeLoc, 'requiere (f)');
  await login(page, 'JEFE_OBRA');
  await page.goto('/stock/movimientos/nuevo');
  await page.getByRole('button', { name: 'Consumo en obra' }).click();
  await pickMaterial(page, MAT.cemento);
  const src = page.getByLabel('Obra (origen)');
  if (!(await src.inputValue())) await src.selectOption(st.jefeLoc!.id);
  await expect(page.getByText(/Saldo actual en/)).toBeVisible();
  await page.getByLabel(/^Cantidad/).fill('2');
  await page.getByLabel('Rubro (opcional)').selectOption({ label: 'Revoques' });
  await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
  await confirmModal(page, 'Confirmar movimiento');
  await toast(page, 'Consumo en obra: movimiento registrado.');
  await expect(page.getByTestId('movement-created-actor')).toHaveText('Jefe Demo');

  // Devolución por el propio Jefe: ve galpones/patios activos (sólo id/código/nombre) como destino.
  await page.getByRole('button', { name: 'Devolución' }).click();
  await pickMaterial(page, MAT.cemento);
  const rsrc = page.getByLabel('Obra (origen)');
  if (!(await rsrc.inputValue())) await rsrc.selectOption(st.jefeLoc!.id);
  await page.getByLabel('Devolver a (galpón o patio)').selectOption(st.warehouse?.id ?? { index: 1 });
  await page.getByLabel(/^Cantidad/).fill('1');
  await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
  await confirmModal(page, 'Confirmar movimiento');
  await toast(page, 'Devolución: movimiento registrado.');
  await expect(page.getByTestId('movement-created-source')).toContainText('Obra Demo Norte');
  await expect(page.getByTestId('movement-created-destination')).toContainText('Galpón Demo Central');
  await expect(page.getByTestId('movement-created-actor')).toHaveText('Jefe Demo');
});

test('(j) Gerencia consulta el seguimiento de materiales y descarga Excel', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/reportes');
  await pick(page.getByLabel('Obra'), JEFE_WORK);
  await expect(page.locator('#contenido table, #contenido .t').getByText('Cemento portland').locator('visible=true').first()).toBeVisible();
  await snap(page, '10-reporte-seguimiento');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar Excel' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  const fs = await import('node:fs');
  expect(fs.readFileSync(await dl.path()).subarray(0, 2).toString()).toBe('PK');
});

test('(k) Jefe de Obra no ve ni solicita información económica', async ({ page }) => {
  const forbidden = [/\/api\/v1\/users/, /\/api\/v1\/prices/, /\/api\/v1\/suppliers/, /\/api\/v1\/quotations/, /\/api\/v1\/apu-items/, /\/api\/v1\/budgets/, /\/api\/v1\/purchase-orders\/[^/]+\/pdf/];
  const hits: string[] = [];
  page.on('request', (r) => {
    if (forbidden.some((f) => f.test(r.url()))) hits.push(r.url());
  });
  await login(page, 'JEFE_OBRA');
  const screens: [string, boolean][] = [
    ['/', false],
    ['/pedidos', true],
    ...(st.requestId ? ([[`/pedidos/${st.requestId}`, true]] as [string, boolean][]) : []),
    ['/ordenes', true],
    ...(st.orderId ? ([[`/ordenes/${st.orderId}`, true]] as [string, boolean][]) : []),
    ['/recepciones', false],
    ['/stock', true],
    ['/stock/movimientos', false],
    ['/stock/movimientos/nuevo', false],
    ['/obras', false],
    ['/materiales', false],
  ];
  for (const [path, check] of screens) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.loading')).toHaveCount(0);
    if (check) {
      const text = await page.locator('#contenido').innerText();
      expect(text, path).not.toContain('$');
      expect(text, path).not.toMatch(/\bARS\b/);
      expect(text, path).not.toMatch(/Precio/i);
    }
    if (st.orderId && path === `/ordenes/${st.orderId}`) {
      await expect(page.getByRole('button', { name: 'PDF' })).toHaveCount(0);
      await snap(page, '11-oc-vista-jefe-sin-precios');
    }
  }
  expect(hits).toEqual([]);
});
