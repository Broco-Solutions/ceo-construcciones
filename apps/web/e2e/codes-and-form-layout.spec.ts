import { chooseOption } from './helpers';
import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('APU mantiene inputs del mismo renglón alineados aunque otros tengan ayuda', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/apu/nuevo');
  const rubro = page.getByLabel('Rubro', { exact: true });
  const code = page.getByLabel('Código (automático)');
  const name = page.getByLabel('Nombre del ítem');
  const unit = page.getByLabel('Unidad de trabajo');
  await expect(rubro).toBeVisible();
  await expect(code).toBeVisible();
  await expect(code).toHaveAttribute('readonly', '');
  const controls = [rubro, code, name, unit];
  const y = await Promise.all(controls.map(async (e) => (await e.boundingBox())!.y));
  expect(Math.max(...y) - Math.min(...y)).toBeLessThanOrEqual(2);

  const labor = page.getByLabel('Importe de mano de obra');
  const currency = page.getByLabel('Moneda');
  const tax = page.getByLabel('Base impositiva');
  const laborY = await Promise.all([labor, currency, tax].map(async (e) => (await e.boundingBox())!.y));
  expect(Math.max(...laborY) - Math.min(...laborY)).toBeLessThanOrEqual(2);
});

test('la OC acepta solamente ARS y USD desde el dropdown', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/ordenes/nueva');
  const currency = page.getByLabel('Moneda', { exact: true });
  await expect(currency).toBeVisible();
  await expect(currency).toHaveValue('ARS');
  expect(await currency.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value))).toEqual(['ARS', 'USD']);
  await chooseOption(currency, 'USD');
  await expect(currency).toHaveValue('USD');

  const supplier = page.getByLabel('Proveedor', { exact: true });
  const destination = page.getByLabel('Destino de entrega');
  const tax = page.getByLabel('Base impositiva');
  const y = await Promise.all([supplier, destination, currency, tax].map(async (e) => (await e.boundingBox())!.y));
  expect(Math.max(...y) - Math.min(...y)).toBeLessThanOrEqual(2);
});

test('crear rubro genera un código RUB automáticamente sin pedir código manual', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Nuevo rubro' }).click();
  const modal = page.getByRole('dialog', { name: 'Nuevo rubro' });
  await expect(modal.getByLabel('Código (automático)')).toHaveAttribute('readonly', '');
  await expect(modal.getByLabel('Código (automático)')).toHaveValue('RUB-...');
  const name = 'Rubro autonumerado ' + Math.random().toString(36).slice(2, 9);
  await modal.getByLabel('Nombre').fill(name);
  await modal.getByRole('button', { name: 'Guardar' }).click();
  await expect(modal).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toBeVisible();
  await expect(row.locator('td').first()).toHaveText(/^RUB-\d{3,}$/);
});
