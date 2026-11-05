import { chooseOption } from './helpers';
// Casos puntuales del cierre de integración (issue #3) POR LA UI contra la API real.
// Cada corrida crea su propia obra/APU/cómputo/presupuesto con sufijo único (re-ejecutable sobre base nueva con sólo el seed).
// La API directa (apiAs) se usa SÓLO para PREPARACIÓN y para verificar conteos/ids; está marcada así.
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  apiAs,
  assignJefe,
  byCode,
  confirmModal,
  unitBySymbol,
  isoDays,
  login,
  pickMaterial,
  SUFFIX,
  toast,
  type Api,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const SUF = SUFFIX();
const EVID = 'docs/evidencia';
type Ref = { id: string; code: string; name: string };
const st: {
  work?: Ref;
  cem?: Ref;
  are?: Ref;
  computationId?: string;
  budgetId?: string;
  versions: string[];
  requestId?: string;
} = { versions: [] };

async function pick(select: Locator, text: string) {
  await chooseOption(select,{label:text});
}

let admin: Api;
test.beforeAll(async () => {
  // PREPARACIÓN: obra propia de la corrida, asignada al Jefe, con APU/cómputo/presupuesto.
  admin = await apiAs('GERENCIA');
  const rev = await byCode<Ref>(admin, '/categories', 'REV');
  const m2 = await unitBySymbol<Ref>(admin, 'm²');
  st.cem = await byCode<Ref>(admin, '/materials', 'CEM-001');
  st.are = await byCode<Ref>(admin, '/materials', 'ARE-001');
  const w = await admin.send<Ref>('POST', '/works', {
    code: `FEA-${SUF}`,
    name: `Obra Casos ${SUF}`,
    status: 'ACTIVE',
  });
  st.work = w;
  await assignJefe(admin, w.id);
  const apu = await admin.send<Ref>('POST', '/apu-items', {
    name: `Revoque casos ${SUF}`,
    categoryId: rev.id,
    unitId: m2.id,
    laborCost: '100',
    laborCurrency: 'ARS',
    laborTaxBasis: 'INCLUDED',
    components: [
      { materialId: st.cem.id, coefficient: '2' },
      { materialId: st.are.id, coefficient: '0.05' },
    ],
  });
  const apu2 = await admin.send<Ref>('POST', '/apu-items', {
    name: `MO casos ${SUF}`,
    categoryId: rev.id,
    unitId: m2.id,
    laborCost: '0',
    laborCurrency: 'ARS',
    laborTaxBasis: 'INCLUDED',
    components: [],
  });
  const comp = await admin.send<{ id: string }>('POST', '/computations', {
    workId: w.id,
    name: `Cómputo casos ${SUF}`,
    lines: [
      { itemId: apu.id, quantity: '10' },
      { itemId: apu2.id, quantity: '5' },
    ],
  });
  st.computationId = comp.id;
  const b = await admin.send<{ id: string }>('POST', '/budgets', {
    workId: w.id,
    name: `Presupuesto casos ${SUF}`,
  });
  st.budgetId = b.id;
});
test.afterAll(async () => admin?.dispose());

/** Completa el modal de nueva versión con precios manuales explícitos. */
async function fillVersion(page: Page, prices: [string, string]) {
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await pick(dlg.getByLabel('Cómputo de origen'), `Cómputo casos ${SUF}`);
  await dlg.getByLabel('Moneda').fill('ARS');
  await chooseOption(dlg.getByLabel('Base impositiva'), { index: 1 });
  await chooseOption(dlg.getByLabel('Decimales (precisión)'), { index: 1 });
  await chooseOption(dlg.getByLabel('Modo de redondeo'), { index: 1 });
  const modes = dlg.locator('select:has(option[value="manual"])');
  await expect(modes).toHaveCount(2);
  for (let i = 0; i < 2; i++) await chooseOption(modes.nth(i), 'manual');
  const p = dlg.getByLabel(/^Precio por/);
  await p.nth(0).fill(prices[0]);
  await p.nth(1).fill(prices[1]);
  return dlg;
}
const versionCount = async () =>
  (await admin.get<{ versions: unknown[] }>(`/budgets/${st.budgetId}`)).versions
    .length;

test('versión de presupuesto: doble clic crea una sola versión', async ({
  page,
}) => {
  await login(page, 'GERENCIA');
  const posts: string[] = [];
  page.on(
    'request',
    (r) =>
      r.method() === 'POST' &&
      /\/budgets\/[^/]+\/versions$/.test(r.url()) &&
      posts.push(r.headers()['idempotency-key'] ?? ''),
  );
  await page.goto(`/presupuestos/${st.budgetId}?nuevaVersion=1`);
  const dlg = await fillVersion(page, ['950', '42000']);
  await dlg.getByTestId('crear-version').dblclick();
  await toast(page, 'Versión 1 creada correctamente');
  await page.waitForURL(/\/presupuestos\/versiones\//);
  st.versions.push(page.url().split('/').pop()!);
  expect(new Set(posts).size).toBe(1);
  expect(await versionCount()).toBe(1);
});

test('versión de presupuesto: reintento tras timeout reutiliza la clave y no duplica', async ({
  page,
}) => {
  await login(page, 'GERENCIA');
  const keys: string[] = [];
  let first = true;
  // La PRIMERA request llega al servidor (crea la versión) pero la respuesta se pierde: la UI ve un error de red.
  await page.route(/\/api\/v1\/budgets\/[^/]+\/versions$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key'] ?? '');
    if (first) {
      first = false;
      await route.fetch();
      return route.abort('timedout');
    }
    return route.continue();
  });
  await page.goto(`/presupuestos/${st.budgetId}?nuevaVersion=1`);
  const dlg = await fillVersion(page, ['1000', '45000']);
  await dlg.getByTestId('crear-version').click();
  await expect(
    dlg.getByRole('alert').or(dlg.locator('.alert.bad')).first(),
  ).toBeVisible({ timeout: 15_000 });
  expect(await versionCount()).toBe(2); // el servidor ya la creó
  await dlg.getByTestId('crear-version').click(); // reintento del usuario
  await toast(page, 'Versión 2 creada correctamente');
  await page.waitForURL(/\/presupuestos\/versiones\//);
  st.versions.push(page.url().split('/').pop()!);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(await versionCount()).toBe(2);
});

test('selección de versión de referencia y su reflejo en la obra (Gerencia y Jefe)', async ({
  page,
  browser,
}) => {
  test.skip(st.versions.length < 2, 'requiere versiones');
  await login(page, 'GERENCIA');
  await page.goto(`/obras/${st.work!.id}`);
  await expect(page.getByTestId('obra-ref-estado')).toContainText(
    'Sin versión de referencia',
  );
  await page.goto(`/presupuestos/${st.budgetId}`);
  const row = page
    .locator('tr', { hasText: /^\s*2\b/ })
    .or(page.locator('table tbody tr').filter({ hasText: 'Borrador' }))
    .first();
  await expect(row).toBeVisible();
  // Marcar la versión 2 (la más reciente) como referencia.
  await page.goto(`/presupuestos/versiones/${st.versions[1]}`);
  await page.getByRole('button', { name: 'Marcar como referencia' }).click();
  await confirmModal(page, 'Marcar como referencia');
  await toast(page, 'Versión 2 marcada como referencia');
  await expect(page.getByTestId('referencia-obra').first()).toBeVisible();
  await page.screenshot({
    path: `${EVID}/03-presupuesto-version-referencia.png`,
    fullPage: true,
  });
  expect(
    (await admin.get<{ referenceVersionId: string }>(`/works/${st.work!.id}`))
      .referenceVersionId,
  ).toBe(st.versions[1]);
  await page.goto(`/obras/${st.work!.id}`);
  await expect(page.getByTestId('obra-ref-version')).toHaveAttribute(
    'href',
    `/presupuestos/versiones/${st.versions[1]}`,
  );
  await page.goto(`/reportes?workId=${st.work!.id}`);
  await expect(page.getByTestId('report-reference-version')).toContainText(
    'versión 2',
  );

  // Jefe asignado: ve que hay referencia y accede a materiales previstos sin importes.
  const ctx = await browser.newContext();
  const j = await ctx.newPage();
  const econ: string[] = [];
  j.on(
    'request',
    (r) =>
      /\/api\/v1\/(budgets|budget-versions|users|prices|apu-items)/.test(
        r.url(),
      ) && econ.push(r.url()),
  );
  await login(j, 'JEFE_OBRA');
  await j.goto(`/obras/${st.work!.id}`);
  await expect(j.getByTestId('obra-ref-estado')).toContainText(
    'referencia vigente',
  );
  await j.getByTestId('obra-ref-materiales').click();
  await j.waitForURL(/\/reportes\?workId=/);
  await expect(j.getByTestId('report-reference-version')).toContainText(
    'versión 2',
  );
  await j.waitForLoadState('networkidle');
  expect(await j.locator('#contenido').innerText()).not.toMatch(
    /\$|\bARS\b|Precio/,
  );
  expect(econ).toEqual([]);
  await ctx.close();
});

test('editar cómputo conserva los ids de las líneas', async ({ page }) => {
  const before = await admin.get<{
    lines: { id: string; itemId: string; quantity: string }[];
  }>(`/computations/${st.computationId}`);
  await login(page, 'GERENCIA');
  await page.goto(`/computos/${st.computationId}`);
  await page.getByRole('button', { name: 'Editar' }).click();
  await page
    .getByLabel(/^Cantidad/)
    .first()
    .fill('12,5');
  await page.getByRole('button', { name: 'Guardar cómputo' }).click();
  await toast(page, 'Los cambios del cómputo se guardaron');
  const after = await admin.get<{
    lines: { id: string; itemId: string; quantity: string }[];
  }>(`/computations/${st.computationId}`);
  expect(after.lines.map((l) => l.id).sort()).toEqual(
    before.lines.map((l) => l.id).sort(),
  );
  expect(after.lines.some((l) => l.quantity === '12.5')).toBe(true);
});

async function newGeneralOrder(
  page: Page,
  qty: string,
  price: string,
  presentation?: string,
) {
  await page.goto('/ordenes/nueva');
  await chooseOption(page
    .getByLabel('Proveedor', {exact:true}), { label: 'Corralón Demo Sur' });
  await pick(page.getByLabel('Destino de entrega'), 'Galpón Demo Central');
  await pickMaterial(page, 'CEM-001');
  await page.getByLabel(/^Cantidad/).fill(qty);
  if (presentation) await pick(page.getByLabel('Presentación'), presentation);
  else await page.getByLabel(/^Precio por cantidad base/).fill('1');
  await page.getByLabel(/^Precio \(ARS\)/).fill(price);
  await page.getByRole('button', { name: 'Revisar y crear' }).click();
  await confirmModal(page, /Confirmar|Crear/);
  await toast(page, /Orden OC-\d+ creada como borrador/);
  await page.waitForURL(/\/ordenes\/(?!nueva)[^/]+$/);
}

test('OC: importes del servidor y redondeo explícito por renglón', async ({
  page,
}) => {
  // PREPARACIÓN: presentación de base 3 kg para el cemento.
  const pres = `Bolsa 3 kg ${SUF}`;
  await admin.send('POST', '/presentations', {
    materialId: st.cem!.id,
    name: pres,
    baseQuantity: '3',
  });
  await login(page, 'COMPRAS');
  // Exacta: 2 × 10 / 1 = 20.
  await newGeneralOrder(page, '2', '10');
  await expect(
    page.getByTestId('oc-line-amount').locator('visible=true'),
  ).toHaveText(/ARS 20,00/);
  await expect(page.getByTestId('oc-total-amount')).toHaveText(
    /Total: ARS 20,00/,
  );
  await expect(page.getByTestId('oc-rounding-warning')).toHaveCount(0);
  await expect(page.getByTestId('oc-currency-taxbasis')).toBeVisible();
  // Nueva política autorizada: 1 × 10 / 3 → 3,33, sin alterar precio ni equivalencia.
  await newGeneralOrder(page, '1', '10', pres);
  const id = page.url().split('/').pop()!;
  await expect(page.getByTestId('oc-rounding-warning')).toHaveCount(0);
  await expect(
    page.getByTestId('oc-line-amount').locator('visible=true'),
  ).toHaveText(/ARS 3,33/);
  await expect(page.getByTestId('oc-total-amount')).toHaveText(
    /Total: ARS 3,33/,
  );
  const o = await admin.get<{
    amountWarning: string | null;
    totalAmount: string | null;
  }>(`/purchase-orders/${id}`);
  expect(o.amountWarning).toBeNull();
  expect(o.totalAmount).toBe('3.33');
  await page.screenshot({
    path: `${EVID}/16-oc-importes-advertencia-redondeo.png`,
    fullPage: true,
  });
});

test('OC: advertencia de OC existente para el mismo pedido', async ({
  page,
}) => {
  // PREPARACIÓN: pedido del Jefe en la obra de la corrida.
  const jefe = await apiAs('JEFE_OBRA');
  const rev = await byCode<Ref>(jefe, '/categories', 'REV');
  const req = await jefe.send<{ id: string }>(
    'POST',
    '/requests',
    {
      workId: st.work!.id,
      categoryId: rev.id,
      requiredAt: isoDays(10),
      lines: [{ materialId: st.cem!.id, quantity: '30' }],
    },
    `e2e-req-${SUF}`,
  );
  await jefe.dispose();
  st.requestId = req.id;
  await login(page, 'COMPRAS');
  const create = async (expectWarning: boolean) => {
    await page.goto(`/ordenes/nueva?requestId=${req.id}`);
    await expect(page.getByText('Verificando órdenes existentes…')).toHaveCount(
      0,
    );
    await chooseOption(page
      .getByLabel('Proveedor', {exact:true}), { label: 'Proveedor Demo Oeste' });
    for (const inp of await page.getByLabel(/^Precio \(ARS\)/).all())
      await inp.fill('100');
    for (const inp of await page.getByLabel(/^Precio por cantidad base/).all())
      if (!(await inp.inputValue())) await inp.fill('1');
    const btn = page.getByRole('button', { name: 'Revisar y crear' });
    if (expectWarning) {
      await expect(page.getByTestId('oc-duplicate-warning')).toBeVisible();
      await expect(btn).toBeDisabled();
      await page.screenshot({
        path: `${EVID}/17-oc-advertencia-duplicada.png`,
        fullPage: true,
      });
      await page.getByTestId('oc-duplicate-ack').check();
    } else
      await expect(page.getByTestId('oc-duplicate-warning')).toHaveCount(0);
    await btn.click();
    if (expectWarning)
      await expect(page.getByTestId('oc-duplicate-confirm-note')).toBeVisible();
    await confirmModal(page, /Confirmar|Crear/);
    await toast(page, /Orden OC-\d+ creada como borrador/);
    await page.waitForURL(/\/ordenes\/(?!nueva)[^/]+$/);
  };
  await create(false);
  await create(true);
  expect((await admin.list(`/purchase-orders?requestId=${req.id}`)).total).toBe(
    2,
  );
});

test('filtros del servidor y paginación con total coherente', async ({
  page,
}) => {
  // PREPARACIÓN: 51 obras con prefijo propio (una pausada) para superar la página de 50.
  const pre = `PAG-${SUF}`;
  for (let i = 0; i < 51; i++)
    await admin.send('POST', '/works', {
      code: `${pre}-${String(i).padStart(2, '0')}`,
      name: `Paginada ${SUF} ${i}`,
      status: i === 0 ? 'PAUSED' : 'ACTIVE',
    });
  await admin.send('POST', '/materials', {
    code: `MAT-${SUF}`,
    name: `Material filtro ${SUF}`,
    unitId: (await unitBySymbol<Ref>(admin, 'un')).id,
    categoryId: (await byCode<Ref>(admin, '/categories', 'MAMP')).id,
  });
  await login(page, 'GERENCIA');

  // Obras: búsqueda + estado en el servidor, paginación sobre el total filtrado.
  await page.goto('/obras');
  await page.locator('#q-obra').fill(pre);
  const pager = page.getByRole('navigation', { name: 'Paginación' });
  await expect(pager).toContainText('Página 1 de 2 · 51 registros');
  await pager.getByRole('button', { name: 'Siguiente' }).click();
  await expect(pager).toContainText('Página 2 de 2');
  await expect(
    page.locator('#contenido table tbody tr').locator('visible=true'),
  ).toHaveCount(1);
  await chooseOption(page.locator('#f-obra-estado'), 'PAUSED');
  await expect(pager).toHaveCount(0);
  await expect(
    page.getByText(`${pre}-00`).locator('visible=true').first(),
  ).toBeVisible();
  await expect(
    page.locator('#contenido table tbody tr').locator('visible=true'),
  ).toHaveCount(1);
  await page.screenshot({
    path: `${EVID}/18-filtros-obras.png`,
    fullPage: true,
  });

  // Materiales: búsqueda del servidor.
  await page.goto('/materiales');
  await page.locator('#q-material').fill(`MAT-${SUF}`);
  await expect(
    page.locator('#contenido table tbody tr').locator('visible=true'),
  ).toHaveCount(1);
  await expect(
    page.getByText(`Material filtro ${SUF}`).locator('visible=true'),
  ).toBeVisible();

  // Pedidos: obra + estado; el total coincide con el del servidor.
  test.skip(!st.requestId, 'requiere pedido');
  await page.goto('/pedidos');
  await pick(page.getByLabel('Obra'), `FEA-${SUF}`);
  await expect(page.getByTestId('list-total')).toHaveText('1 pedidos');
  await chooseOption(page.getByTestId('request-filter-status'), 'CANCELLED');
  await expect(page.getByTestId('list-total')).toHaveText('0 pedidos');
  await chooseOption(page.getByTestId('request-filter-status'), '');
  // OC: obra + estado.
  await page.goto('/ordenes');
  await pick(page.getByLabel('Obra'), `FEA-${SUF}`);
  const total = (await admin.list(`/purchase-orders?workId=${st.work!.id}`))
    .total;
  expect(total).toBe(2);
  await expect(page.getByTestId('list-total')).toHaveText(`${total} órdenes`);
  await chooseOption(page.getByTestId('oc-filter-status'), 'ISSUED');
  await expect(page.getByTestId('list-total')).toHaveText('0 órdenes');
  await chooseOption(page.getByTestId('oc-filter-status'), 'DRAFT');
  await expect(page.getByTestId('list-total')).toHaveText('2 órdenes');
  await expect(
    page.locator('#contenido table tbody tr').locator('visible=true'),
  ).toHaveCount(2);
  await page.screenshot({ path: `${EVID}/19-filtros-oc.png`, fullPage: true });
});
