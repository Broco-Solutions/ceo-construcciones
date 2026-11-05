// Controlled public-domain smoke. Only creates/updates explicitly DEMO records.
// Never run the destructive E2E seed or local runners against this environment.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
const origin = 'https://ceo-construcciones.brocosolutions.com';
if (process.argv[2] !== 'VERIFY_EXISTING_ONLINE_DEMO') throw Error('Explicit demo smoke confirmation required');
const root = join(homedir(), '.local/state/ceo-construcciones-codex/online');
const evidence = join(root, 'smoke'); await mkdir(evidence, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(await readFile(join(root, 'credenciales-online.json'), 'utf8'));
let state = {}; try { state = JSON.parse(await readFile(join(root, 'demo-state.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const save = () => writeFile(join(root, 'demo-state.json'), JSON.stringify(state, null, 2), { mode: 0o600 });
const browser = await chromium.launch(); const results = [];
const hash = b => createHash('sha256').update(b).digest('hex');
let context;
try {
  context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  async function login(ctx, p, role) {
    await p.goto('/login'); await p.getByLabel('Correo electrónico').fill(credentials[role].email);
    await p.getByLabel('Contraseña').fill(credentials[role].password);
    await p.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 45000 });
    const cookies = await ctx.cookies(origin); const c = cookies.find(c => c.name === 'ceo_session');
    expect(c?.httpOnly).toBe(true); expect(c?.secure).toBe(true);
    const me = await ctx.request.get('/api/v1/auth/me'); expect(me.ok()).toBe(true); expect((await me.json()).data.role).toBe(role);
  }
  await login(context, page, 'GERENCIA'); results.push('public login, secure HttpOnly cookie and Gerencia session');
  async function call(path, method = 'GET', data, key = '') {
    const r = await context.request.fetch('/api/v1/' + path, { method, data, headers: { Origin: origin, 'Idempotency-Key': 'online-demo-v1-' + (key || hash(JSON.stringify({ path, method, data })).slice(0, 36)) } });
    if (!r.ok()) throw Error(`${method} ${path}: ${r.status()} ${await r.text()}`);
    return (await r.json()).data;
  }
  async function all(path) { const rows = []; for (let n = 1; n <= 30; n++) { const p = await call(path + (path.includes('?') ? '&' : '?') + `pageSize=100&page=${n}`); rows.push(...p); if (p.length < 100) return rows; } throw Error('Unexpected unbounded listing'); }
  async function ensure(path, code, data) {
    if (!code.startsWith('DEMO-')) throw Error('Only DEMO identities may be created');
    const found = (await all(path)).find(x => x.code === code);
    return found ?? call(path, 'POST', { code, ...data });
  }
  const client = await ensure('clients', 'DEMO-CLI', { name: 'DEMO · Cliente ficticio', contact: 'Datos sintéticos, sin comunicaciones' });
  const works = [];
  for (const n of [1, 2]) works.push(await ensure('works', 'DEMO-OBR-' + n, { name: 'DEMO · Obra ' + n, clientId: client.id, address: 'Dirección ficticia para demostración' }));
  const warehouse = await ensure('locations', 'DEMO-GAL', { name: 'DEMO · Galpón', kind: 'WAREHOUSE' });
  await ensure('locations', 'DEMO-PAT', { name: 'DEMO · Patio', kind: 'YARD' });
  const users = await all('users'); const chief = users.find(x => x.email === credentials.JEFE_OBRA.email);
  const assignments = await call(`users/${chief.id}/assignments`);
  if (!assignments.some(x => x.workId === works[0].id)) await call(`users/${chief.id}/assignments`, 'PUT', { workIds: [...new Set([...assignments.map(x => x.workId), works[0].id])] });
  const category = await ensure('categories', 'DEMO-VARIOS', { name: 'DEMO · VARIOS' });
  const units = await all('units'); const kg = units.find(x => x.symbol === 'kg'); const gl = units.find(x => x.symbol === 'gl'); expect(kg).toBeTruthy(); expect(gl).toBeTruthy();
  const material = await ensure('materials', 'DEMO-MAT', { name: 'DEMO · Material sintético (no cotización CEO)', unitId: kg.id, categoryId: category.id });
  const suppliers = []; for (const n of [1, 2, 3]) suppliers.push(await ensure('suppliers', 'DEMO-PROV-' + n, { name: 'DEMO · Corralón ficticio ' + n }));
  let presentation = (await all('presentations?materialId=' + material.id)).find(x => x.name === 'DEMO · Bolsa 25 kg');
  presentation ??= await call('presentations', 'POST', { materialId: material.id, supplierId: suppliers[0].id, name: 'DEMO · Bolsa 25 kg', baseQuantity: '25' });
  async function price(value, date) {
    const source = 'DEMO · Referencia sintética, no cotización real';
    return (await all('prices?materialId=' + material.id)).find(x => x.source === source && x.price === value && x.effectiveAt.startsWith(date.slice(0, 10))) ?? call('prices', 'POST', { materialId: material.id, supplierId: suppliers[0].id, presentationId: presentation.id, price: value, baseQuantity: '25', currency: 'ARS', taxBasis: 'EXCLUDED', effectiveAt: date, source });
  }
  const firstPrice = await price('12500', '2026-11-01T12:00:00Z');
  const item = await ensure('apu-items', 'DEMO-ACT', { name: 'DEMO · Actividad vinculada para cambiar precios', categoryId: category.id, unitId: gl.id, laborCost: '3600', directCost: '500', laborCurrency: 'ARS', laborTaxBasis: 'EXCLUDED', components: [{ materialId: material.id, coefficient: '4' }] });
  let costing = await call('activity-costing/' + item.id);
  if (!costing?.revision) costing = await call('activity-costing/' + item.id, 'PUT', { revision: 0, content: { currency: 'ARS', taxBasis: 'EXCLUDED', laborMode: 'DIRECT', labor: [], materials: [{ materialId: material.id, priceId: firstPrice.id }] } });
  let template = (await all('budget-templates')).find(x => x.name === 'DEMO · Plantilla sintética de costos');
  template ??= await call('budget-templates', 'POST', { name: 'DEMO · Plantilla sintética de costos', content: { currency: 'ARS', taxBasis: 'EXCLUDED', markup: '50', conditions: 'DEMO. Valores sintéticos. No es una oferta comercial.', exclusions: 'Sin operaciones reales.', observations: '', deadline: 'Plazo de demostración', lines: [{ key: 'demo-line', itemId: item.id, code: item.code, name: item.name, categoryId: category.id, category: category.name, unitId: gl.id, unit: 'gl', quantity: '10', laborUnitCost: '3600', directUnitCost: '500', status: 'ACTIVE', materials: [{ materialId: material.id, name: material.name, unitId: kg.id, unit: 'kg', coefficient: '4', unitPrice: '500', sourcePriceId: firstPrice.id }] }] } });
  if (!state.budgetId) { state.budgetId = (await call('budget-editor', 'POST', { name: 'DEMO · Costos, borrador y revisiones', workId: works[0].id, templateId: template.id }, 'budget-costs')).id; await save(); }
  let budget = await call('budget-editor/' + state.budgetId);
  if (!state.r1Id) { const r1 = await call(`budget-editor/${budget.id}/issue`, 'POST', { revision: budget.draft.revision }, 'issue-r1'); expect(r1.snapshot.commercialTotal).toBe('91500.00'); state.r1Id = r1.id; await save(); }
  const r1Response = await context.request.get('/api/v1/budget-issues/' + state.r1Id + '/pdf'); expect(r1Response.ok()).toBe(true);
  const r1bytes = await r1Response.body(); expect(r1bytes.subarray(0, 4).toString()).toBe('%PDF'); await writeFile(join(evidence, 'DEMO-R1.pdf'), r1bytes, { mode: 0o600 });
  const beforeDraft = budget.draft;
  await price('15000', '2026-11-02T12:00:00Z');
  costing = await call('activity-costing/' + item.id); expect(costing.totalUnitCost).toBe('6500'); expect(costing.materials[0].coefficient).toBe('4');
  expect((await call('budget-editor/' + budget.id)).draft).toEqual(beforeDraft);
  if (!state.r2Id) {
    const review = await call(`budget-editor/${budget.id}/cost-review`, 'POST', { revision: beforeDraft.revision, content: beforeDraft.content });
    expect(review.before.commercialTotal).toBe('91500.00'); expect(review.after.commercialTotal).toBe('97500.00');
    const changes = review.changes.filter(x => x.kind === 'MATERIAL'); expect(changes).toHaveLength(1);
    const updated = await call(`budget-editor/${budget.id}/apply-cost-review`, 'POST', { revision: beforeDraft.revision, content: beforeDraft.content, planHash: review.planHash, selected: changes.map(x => x.key) });
    expect(updated.content.lines[0].quantity).toBe('10'); expect(updated.content.markup).toBe('50'); expect(updated.content.lines[0].materials[0].coefficient).toBe('4');
    const r2 = await call(`budget-editor/${budget.id}/issue`, 'POST', { revision: updated.revision }, 'issue-r2'); expect(r2.snapshot.commercialTotal).toBe('97500.00'); state.r2Id = r2.id; await save();
  }
  expect(hash(await (await context.request.get('/api/v1/budget-issues/' + state.r1Id + '/pdf')).body())).toBe(hash(r1bytes));
  results.push('DEMO price 12500→15000: activity 6100→6500, draft explicit 91500→97500, quantity/consumption/markup and R1/PDF preserved');
  const activityCode = 'CEO-A-' + hash(JSON.stringify('COSTO!B35')).slice(0, 16);
  const baseActivity = (await all('apu-items')).find(x => x.code === activityCode); expect(baseActivity).toBeTruthy();
  const realCost = await call('activity-costing/' + baseActivity.id); expect(realCost.materials).toHaveLength(3); expect(realCost.content.materialsIncludedInDirect).toBe(false); expect(realCost.materials.every(x => x.priceId || x.sourcePriceId || x.price)).toBe(true);
  const base = (await all('budget-templates')).find(x => x.name === 'BASE CEO — Octubre 2026');
  expect(base.content.lines.filter(x => x.materials.length && !x.materialsIncludedInDirect)).toHaveLength(67);
  if (!state.baseBudgetId) { state.baseBudgetId = (await call('budget-editor', 'POST', { name: 'DEMO · Presupuesto desde BASE CEO conectada', workId: works[1].id, templateId: base.id }, 'budget-base')).id; await save(); }
  let baseBudget = await call('budget-editor/' + state.baseBudgetId);
  if (!state.baseIssueId) {
    const content = structuredClone(baseBudget.draft.content);
    content.markup = '50'; content.conditions = 'DEMO. Documento de prueba, no es una propuesta real.';
    content.lines.forEach(l => { l.quantity = l.itemId === baseActivity.id ? '10' : '0'; });
    content.lines.push({ key: 'demo-varios', itemId: null, code: 'DEMO-VARIOS', name: 'DEMO · VARIOS directos', categoryId: category.id, category: category.name, unitId: gl.id, unit: 'gl', quantity: '1', laborUnitCost: '0', directUnitCost: '500', status: 'ACTIVE', materials: [], materialReview: { status: 'DIRECT', detail: 'Costo directo sintético para demo', evidence: 'Definición DEMO, sin demanda material' } });
    const saved = await call('budget-editor/' + baseBudget.id, 'PUT', { revision: baseBudget.draft.revision, content });
    const issued = await call(`budget-editor/${baseBudget.id}/issue`, 'POST', { revision: saved.revision }, 'issue-base'); state.baseIssueId = issued.id; await save();
  }
  const basePdf = await context.request.get('/api/v1/budget-issues/' + state.baseIssueId + '/pdf'); expect(basePdf.ok()).toBe(true); await writeFile(join(evidence, 'BASE-DEMO-R1.pdf'), await basePdf.body(), { mode: 0o600 });
  results.push('Real BASE material references and 67 linked compositions, new BASE budget, quantities/VARIOS/markup/save/R1/public PDF');
  const location = (await all('locations?workId=' + works[0].id)).find(x => x.workId === works[0].id);
  if (!state.requestId) { state.requestId = (await call('requests', 'POST', { workId: works[0].id, categoryId: category.id, requiredAt: '2026-11-15T12:00:00Z', lines: [{ materialId: material.id, quantity: '40' }] }, 'request')).id; await save(); }
  if (!state.orderId) { state.orderId = (await call('purchase-orders', 'POST', { supplierId: suppliers[0].id, requestId: state.requestId, workId: works[0].id, destinationId: location.id, currency: 'ARS', taxBasis: 'EXCLUDED', lines: [{ materialId: material.id, quantity: '40', unitPrice: '600', baseQuantity: '1' }] }, 'order')).id; await save(); }
  let order = await call('purchase-orders/' + state.orderId);
  if (order.status === 'DRAFT') await call(`purchase-orders/${order.id}/status`, 'POST', { status: 'ISSUED' }, 'order-issue');
  if (!state.receiptId) { state.receiptId = (await call(`purchase-orders/${order.id}/receipts`, 'POST', { locationId: location.id, deliveryNote: 'DEMO-REMITO-1', lines: [{ orderLineId: order.lines[0].id, quantity: '20' }] }, 'receipt')).id; await save(); }
  if (!state.consumptionId) { state.consumptionId = (await call('movements', 'POST', { type: 'CONSUMPTION', materialId: material.id, sourceId: location.id, quantity: '5', categoryId: category.id }, 'consumption')).id; await save(); }
  if (!order.invoiceNumber) await call(`order-administration/${order.id}/invoice`, 'PUT', { invoiceNumber: 'DEMO-FACTURA-1', amount: '24000', currency: 'ARS' }, 'invoice');
  const net = await call('net-needs?workId=' + works[0].id); state.net = net.rows.find(x => x.materialId === material.id);
  expect(state.net.consumed).toBe('5'); expect(state.net.workAvailable).toBe('15');
  const laborResource = (await all('labor-resources'))[0];
  for (const path of ['clients','labor-resources','labor-rates?resourceId=' + laborResource.id,'prices','reports/clients?clientId=' + client.id,'reports/purchases?supplierId=' + suppliers[0].id]) await call(path);
  results.push('DEMO client/two works, assigned chief, warehouse/yard, suppliers, request40→order40→receipt20→consumption5, stock15, invoice and indicators');
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ['/costos', '/apu/' + baseActivity.id, '/presupuestos/' + state.baseBudgetId, '/indicadores']) {
      await page.goto(path); await page.waitForLoadState('networkidle');
      await expect(page.locator('body')).not.toContainText('FEATURE_NOT_ENABLED'); await expect(page.getByRole('heading', { name: 'Algo salió mal', exact: true })).toHaveCount(0);
      await page.screenshot({ path: join(evidence, path.replaceAll('/', '-') + '-' + width + '.png'), fullPage: false });
    }
  }
  for (const role of ['COMPUTO','COMPRAS','JEFE_OBRA','ADMINISTRACION']) {
    const ctx = await browser.newContext({ baseURL: origin }); const p = await ctx.newPage(); await login(ctx, p, role);
    const hidden = ['JEFE_OBRA','ADMINISTRACION'].includes(role);
    for (const path of ['prices','labor-rates?resourceId=' + laborResource.id,'activity-costing/' + baseActivity.id]) { const r = await ctx.request.get('/api/v1/' + path); expect(r.status()).toBe(hidden ? 403 : 200); }
    if (role === 'JEFE_OBRA') { const r = await ctx.request.get('/api/v1/works'); const rows = (await r.json()).data; expect(rows.some(x => x.id === works[0].id)).toBe(true); expect(rows.some(x => x.id === works[1].id)).toBe(false); }
    if (role === 'ADMINISTRACION') { expect((await ctx.request.get('/api/v1/clients')).status()).toBe(403); expect((await ctx.request.get('/api/v1/order-administration')).status()).toBe(200); }
    if (role === 'COMPRAS') expect((await ctx.request.post('/api/v1/labor-rates', { data: {}, headers: { Origin: origin } })).status()).toBe(403);
    const logout = await ctx.request.post('/api/v1/auth/logout', { headers: { Origin: origin } }); expect(logout.ok()).toBe(true); expect((await ctx.request.get('/api/v1/auth/me')).status()).toBe(401);
    results.push(role + ': public login, backend permissions, logout and revoked session'); await ctx.close();
  }
  state.baseActivityId = baseActivity.id; state.workIds = works.map(x => x.id); state.clientId = client.id; state.demoActivityId = item.id; state.materialId = material.id; await save();
  const logout = await context.request.post('/api/v1/auth/logout', { headers: { Origin: origin } }); expect(logout.ok()).toBe(true); expect((await context.request.get('/api/v1/auth/me')).status()).toBe(401);
  results.push('GERENCIA: logout and revoked session');
  await writeFile(join(root, 'online-smoke-result.json'), JSON.stringify({ origin, checkedAt: new Date().toISOString(), results, state, pdfR1Sha256: hash(r1bytes) }, null, 2), { mode: 0o600 });
  console.log('PASS: public demo, five profiles, real BASE links, controlled DEMO price/revisions/PDF, procurement/stock and indicators.');
} finally { await context?.close(); await browser.close(); }
