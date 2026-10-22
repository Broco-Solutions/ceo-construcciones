import { expect, test } from '@playwright/test';
import { login } from './helpers';

async function sameInputTop(a: import('@playwright/test').Locator, b: import('@playwright/test').Locator) {
  const [x, y] = await Promise.all([a.boundingBox(), b.boundingBox()]);
  expect(x).not.toBeNull();
  expect(y).not.toBeNull();
  expect(Math.abs(x!.y - y!.y)).toBeLessThan(3);
}

test('las ayudas no desplazan las filas de inputs en APU y órdenes de compra', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/apu/nuevo');
  await sameInputTop(page.getByLabel('Importe de mano de obra'), page.getByLabel('Moneda'));
  await sameInputTop(page.getByLabel('Importe de mano de obra'), page.getByLabel('Base impositiva'));
  await page.goto('/ordenes/nueva');
  await sameInputTop(page.getByLabel('Proveedor'), page.getByLabel('Destino de entrega'));
  await sameInputTop(page.getByLabel('Destino de entrega'), page.getByLabel('Moneda'));
  await sameInputTop(page.getByLabel('Moneda'), page.getByLabel('Base impositiva'));
});

test('en la nueva orden sólo se selecciona ARS o USD; actualiza precio en el detalle', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/ordenes/nueva');
  const moneda = page.getByLabel('Moneda', { exact: true });
  await expect(moneda).toHaveValue('ARS');
  await expect(moneda.locator('option')).toHaveCount(2);
  await moneda.selectOption('USD');
  await expect(moneda).toHaveValue('USD');
  await expect(page.getByText('Precio (USD)', { exact: true }).first()).toBeVisible();
});

test('obra creada sin código manual recibe un identificador OBR correlativo', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/obras');
  await page.getByRole('button', { name: 'Nueva obra' }).click();
  const modal = page.getByRole('dialog', { name: 'Nueva obra' });
  await expect(modal.getByLabel('Código asignado')).toContainText('Automático');
  const name = 'Obra auto ' + Date.now().toString(36);
  await modal.getByLabel('Nombre').fill(name);
  await modal.getByRole('button', { name: 'Crear obra' }).click();
  await page.waitForURL(/\/obras\/[^/]+$/);
  const response = await page.request.get('/api/v1/works/' + page.url().split('/').pop());
  expect(response.ok()).toBe(true);
  const row = (await response.json()).data;
  expect(row.code).toMatch(/^OBR-\d{3,}$/);
  expect(row.name).toBe(name);
});

test('rubros se crean sin pedir código y muestran RUB generado', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Nuevo rubro' }).click();
  const modal = page.getByRole('dialog', { name: 'Nuevo rubro' });
  await expect(modal.getByLabel('Código asignado')).toContainText('Automático');
  const name = 'Rubro auto ' + Date.now().toString(36);
  await modal.getByLabel('Nombre').fill(name);
  await modal.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
});
