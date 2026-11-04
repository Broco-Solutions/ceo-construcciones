// Read-only reproduction: delay a real preview response, never replace persistence.
import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const state = join(homedir(), '.local/state/ceo-construcciones-codex');
const c = JSON.parse(
  await readFile(join(state, 'manual/credenciales.json'), 'utf8'),
).GERENCIA;
const marker = JSON.parse(
  await readFile(join(state, 'catalog-final/draft.json'), 'utf8'),
);
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      baseURL: 'http://localhost:3100',
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(c.email);
  await page.getByLabel('Contraseña').fill(c.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const before = (
    await (
      await context.request.get('/api/v1/budget-editor/' + marker.id)
    ).json()
  ).data.draft;
  await page.goto('/presupuestos/editor/' + marker.id);
  await expect(page.locator('.budget-line')).toHaveCount(146);
  await page.locator('.budget-line input').first().fill('1');
  let ready, release;
  const received = new Promise((r) => (ready = r)),
    gate = new Promise((r) => (release = r));
  await page.route('**/cost-review', async (route) => {
    const response = await route.fetch();
    ready();
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole('button', { name: 'Revisar costos de referencia', exact: true })
    .click();
  await received;
  await page
    .locator('header.top')
    .getByRole('link', { name: 'Presupuestos', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Seguir editando', exact: true }),
  ).toBeVisible();
  const completed = page.waitForResponse((r) =>
    r.url().endsWith('/cost-review'),
  );
  release();
  await completed;
  await expect(
    page.getByRole('button', {
      name: 'Revisar costos de referencia',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(
    page.getByRole('dialog', {
      name: 'Revisar costos de referencia',
      exact: true,
    }),
  ).toHaveCount(0);
  console.log(
    'Respuesta real tardía descartada; una sola capa modal y ningún cambio persistido.',
  );
  const after = (
    await (
      await context.request.get('/api/v1/budget-editor/' + marker.id)
    ).json()
  ).data.draft;
  expect(after).toEqual(before);
} finally {
  await browser.close();
}
