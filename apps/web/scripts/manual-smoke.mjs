// Read-only smoke on the persistent local manual environment. No runner seed/reset.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const state = join(homedir(), '.local/state/ceo-construcciones-codex/manual');
const credentials = JSON.parse(
  await readFile(join(state, 'credenciales.json'), 'utf8'),
);
const browser = await chromium.launch({ headless: true });
const checks = [];
await mkdir(join(state, 'evidence'), { recursive: true, mode: 0o700 });
try {
  for (const [role, login] of Object.entries(credentials)) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:3100',
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(20000);
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(login.email);
    await page.getByLabel('Contraseña').fill(login.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    const get = async (path) => {
      const r = await context.request.get(`/api/v1/${path}`);
      expect(r.ok(), path).toBeTruthy();
      return (await r.json()).data;
    };
    const works =
      role === 'ADMINISTRACION' ? [] : await get('works?pageSize=100');
    if (role === 'JEFE_OBRA') {
      expect(works.some((w) => w.code === 'MAN-OBR-1')).toBe(true);
      expect(works.some((w) => w.code === 'MAN-OBR-3')).toBe(false);
    }
    if (role === 'ADMINISTRACION') {
      expect(
        (await context.request.get('/api/v1/budget-editor')).status(),
      ).toBe(403);
      expect((await context.request.get('/api/v1/prices')).status()).toBe(403);
    }
    if (role === 'GERENCIA') {
      const clients = await get('clients?pageSize=100');
      const client = clients.find((c) => c.code === 'MAN-CLI');
      expect(client).toBeTruthy();
      expect(works.filter((w) => w.clientId === client.id)).toHaveLength(2);
      const budgets = await get('budgets?pageSize=100');
      const budget = budgets.find(
        (b) => b.name === 'Presupuesto sintético manual',
      );
      expect(budget).toBeTruthy();
      const before = await get(`budget-editor/${budget.id}`);
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            works,
            clients,
            budgets,
            content: before.draft.content,
          }),
        )
        .digest('hex');
      await page.goto(`/presupuestos/editor/${budget.id}`);
      await expect(page.locator('.budget-line')).toHaveCount(1);
      await expect(page.locator('.budget-line')).toContainText('1.524');
      const quantity = page.locator('.budget-line input').first();
      await quantity.fill('2');
      await expect(page.locator('.budget-summary')).toContainText('3.048');
      await page.locator('.budget-line-name').first().click();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await page
        .getByRole('button', { name: /Comparar corralones/ })
        .first()
        .click();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await page.screenshot({
        path: join(state, 'evidence', 'comparacion-1440.png'),
      });
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('dialog', { name: 'Composición del costo' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await page
        .getByRole('link', { name: 'Presupuestos', exact: true })
        .first()
        .click();
      await page
        .getByRole('button', { name: 'Seguir editando', exact: true })
        .click();
      await expect(quantity).toHaveValue('2');
      await page.setViewportSize({ width: 360, height: 900 });
      await page.screenshot({
        path: join(state, 'evidence', 'editor-360.png'),
      });
      await page
        .getByRole('link', { name: 'Presupuestos', exact: true })
        .first()
        .click();
      await page
        .getByRole('button', { name: 'Salir sin guardar', exact: true })
        .click();
      await page.waitForURL(/\/presupuestos$/);
      expect((await get(`budget-editor/${budget.id}`)).draft.content).toEqual(
        before.draft.content,
      );
      const historical = budgets.find(
        (b) => b.name === 'DG privado · demanda orientativa, ver limitaciones',
      );
      if (historical) {
        const historicalBefore = await get(`budget-editor/${historical.id}`);
        await page.goto(`/presupuestos/editor/${historical.id}`);
        await expect(page.locator('.budget-line')).toHaveCount(
          historicalBefore.draft.content.lines.length,
        );
        for (const width of [1440, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          await page
            .getByRole('tab', { name: 'Cómputo y costos', exact: true })
            .click();
          await page.locator('.budget-line-name').first().click();
          await page.screenshot({
            path: join(state, 'evidence', `dg-composicion-${width}.png`),
          });
          await page
            .getByRole('button', { name: /Comparar corralones/ })
            .first()
            .click();
          await expect(page.getByRole('dialog')).toHaveCount(1);
          await page.screenshot({
            path: join(state, 'evidence', `dg-comparacion-${width}.png`),
          });
          await page.keyboard.press('Escape');
          await page.keyboard.press('Escape');
          for (const tab of [
            'Precio de venta',
            'Presentación y PDF',
            'Historial',
          ]) {
            await page.getByRole('tab', { name: tab, exact: true }).click();
            await expect
              .poll(() =>
                page.evaluate(
                  () => document.documentElement.scrollWidth <= innerWidth + 2,
                ),
              )
              .toBe(true);
            await page.screenshot({
              path: join(
                state,
                'evidence',
                `dg-${tab.replaceAll(' ', '-')}-${width}.png`,
              ),
            });
          }
        }
        expect(
          (await get(`budget-editor/${historical.id}`)).draft.content,
        ).toEqual(historicalBefore.draft.content);
      }
      checks.push({
        role,
        clientWorks: 2,
        fingerprint,
        editor:
          'unit cost, quantity, comparison, Escape, cancel/discard; no writes',
      });
    } else checks.push({ role, login: true, permissions: true });
    await context.close();
  }
  const result = {
    time: new Date().toISOString(),
    release: JSON.parse(await readFile(join(state, 'release.json'), 'utf8')),
    checks,
  };
  await writeFile(
    join(state, 'evidence', 'smoke.json'),
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      passed: checks.length,
      checks: checks.map((c) => c.role),
      evidence: join(state, 'evidence', 'smoke.json'),
    }),
  );
} finally {
  await browser.close();
}
