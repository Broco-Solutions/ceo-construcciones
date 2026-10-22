// Notificaciones en móvil: no tapan el título, las acciones ni la barra inferior.
import { expect, test } from '@playwright/test';
import { login, SUFFIX, toast } from './helpers';

test('en móvil la notificación aparece sobre la barra inferior, a todo el ancho y sin cortar el texto', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/catalogo');
  await page.getByRole('tab', { name: 'Unidades' }).click();
  await page.getByRole('button', { name: 'Nueva unidad' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nombre', { exact: true }).fill(`Pallet ${SUFFIX()}`);
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await toast(page, 'Unidad creada correctamente');
  const n = page.locator('.toast').filter({ hasText: 'Unidad creada correctamente' });
  const box = (await n.boundingBox())!;
  const vp = page.viewportSize()!;
  const nav = (await page.locator('.bottomnav').boundingBox())!;
  const header = (await page.locator('header.top').boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(nav.y);
  expect(box.y).toBeGreaterThan(header.y + header.height);
  expect(box.width).toBeGreaterThan(vp.width - 24);
  expect((await n.locator('.toast-title').boundingBox())!.height).toBeLessThan(26);
  await page.screenshot({ path: 'docs/evidencia/24-movil-notificacion.png' });
  await n.getByRole('button', { name: 'Cerrar notificación' }).click();
  await expect(n).toHaveCount(0);
});
