// Reads the imported private catalog and preserves prior drafts. One new MAN
// draft is created once; this smoke never registers a test price in that catalog.
import { chromium, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const state = join(homedir(), '.local/state/ceo-construcciones-codex');
const output = join(state, 'base-link-manual');
await mkdir(output, { recursive: true, mode: 0o700 });
const c = JSON.parse(await readFile(join(state, 'manual/credenciales.json'), 'utf8')).GERENCIA;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(c.email);
  await page.getByLabel('Contraseña').fill(c.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL(u => !u.pathname.startsWith('/login'));
  async function call(path, method = 'GET', data) {
    const r = await context.request.fetch('/api/v1/' + path, { method, data, headers: { Origin: 'http://localhost:3100', 'Idempotency-Key': randomUUID() } });
    expect(r.ok(), path + ': ' + r.status()).toBeTruthy(); return (await r.json()).data;
  }
  const code = 'CEO-A-' + createHash('sha256').update(JSON.stringify('COSTO!B35')).digest('hex').slice(0, 16);
  const items = [];
  for (let n = 1; n <= 20; n++) { const rows = await call(`apu-items?pageSize=100&page=${n}`); items.push(...rows); if (rows.length < 100) break; }
  const item = items.find(i => i.code === code); expect(item).toBeTruthy();
  const resolved = await call('activity-costing/' + item.id);
  expect(resolved.content.materialsIncludedInDirect).toBe(false);
  expect(resolved.materials).toHaveLength(3); expect(resolved.directCost).toBe('0');
  const templates = await call('budget-templates?pageSize=100');
  const base = templates.find(t => t.name === 'BASE CEO — Octubre 2026');
  expect(base.content.lines.filter(l => l.materials.length && !l.materialsIncludedInDirect)).toHaveLength(67);
  let marker;
  try { marker = JSON.parse(await readFile(join(output, 'draft.json'), 'utf8')); } catch {}
  if (!marker) {
    const work = (await call('works?pageSize=100')).find(w => w.code === 'MAN-OBR-1');
    const b = await call('budget-editor', 'POST', { name: 'MAN — BASE materiales vinculados', workId: work.id, templateId: base.id });
    marker = { id: b.id }; await writeFile(join(output, 'draft.json'), JSON.stringify(marker), { mode: 0o600 });
  }
  const before = await call('budget-editor/' + marker.id);
  const line = before.draft.content.lines.find(l => l.itemId === item.id);
  expect(line.materials.every(m => m.sourcePriceId && m.sourcePriceBasis)).toBe(true);
  const previous = JSON.parse(await readFile(join(state, 'catalog-final/draft.json'), 'utf8'));
  const old = await call('budget-editor/' + previous.id);
  const review = await call(`budget-editor/${previous.id}/cost-review`, 'POST', { revision: old.draft.revision, content: old.draft.content });
  const proposals = review.changes.filter(c => c.kind === 'COMPOSITION');
  expect(proposals.length).toBeGreaterThan(0); expect(proposals.every(c => c.manual)).toBe(true);
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/apu/' + item.id);
    await expect(page.getByText('Materiales calculados', { exact: true })).toBeVisible();
    await page.screenshot({ path: join(output, `actividad-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Editar referencias y mano de obra', exact: true }).click();
    await expect(page.getByLabel('Referencia de', { exact: false }).first()).toBeVisible();
    await expect(page.getByLabel('Referencia de', { exact: false }).first()).not.toHaveValue('');
    await page.screenshot({ path: join(output, `referencias-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.goto('/presupuestos/' + marker.id);
    await expect(page.getByRole('button', { name: 'Revisar costos de referencia', exact: true })).toBeVisible();
    await page.screenshot({ path: join(output, `base-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/presupuestos/' + previous.id);
    await page.getByRole('button', { name: 'Revisar costos de referencia', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog).toHaveCount(1);
    await expect(dialog.getByText(/Sustituir suministro histórico por composición BASE/).first()).toBeVisible();
    const labels = dialog.locator('label').filter({ hasText: 'Sustituir suministro histórico' });
    for (const label of await labels.all()) await expect(label.getByRole('checkbox')).not.toBeChecked();
    await page.screenshot({ path: join(output, `revision-separada-${width}.png`) });
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  }
  expect(await call('budget-editor/' + marker.id)).toEqual(before);
  expect(await call('budget-editor/' + previous.id)).toEqual(old);
  await writeFile(join(output, 'result.json'), JSON.stringify({ activityId: item.id, code, newBudget: marker.id, previousBudget: previous.id, compositions: proposals.length, widths: [1440, 1280, 768, 390, 360], draftUnchanged: true }, null, 2), { mode: 0o600 });
  console.log('PASS: BASE vinculada, referencias visibles, propuesta separada, cinco anchos y borradores intactos.');
} finally { await browser.close(); }
