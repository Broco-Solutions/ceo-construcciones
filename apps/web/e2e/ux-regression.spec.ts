import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('escribir en un campo posterior no devuelve el foco al primer input del modal', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();

  const dialog = page.getByRole('dialog', { name: 'Nuevo usuario' });
  const email = dialog.getByLabel('Email');
  const name = dialog.getByLabel('Nombre');
  await expect(email).toBeFocused();

  await name.click();
  await name.pressSequentially('Usuario de prueba', { delay: 8 });
  await expect(name).toHaveValue('Usuario de prueba');
  await expect(name).toBeFocused();
  await expect(email).toHaveValue('');

  // Todos los formularios reutilizan Modal, no sólo Administración.
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await page.goto('/materiales');
  await page.getByRole('button', { name: 'Nuevo material' }).click();
  const material = page.getByRole('dialog', { name: 'Nuevo material' });
  const materialName = material.getByLabel('Nombre');
  await materialName.click();
  await materialName.pressSequentially('Material de prueba', { delay: 8 });
  await expect(materialName).toHaveValue('Material de prueba');
  await expect(materialName).toBeFocused();
});

test('los formularios se muestran centrados, no como drawer a la derecha', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/admin/usuarios');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo usuario' });
  await expect(dialog).toHaveClass(/modal/);
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs(bounds!.x + bounds!.width / 2 - viewport!.width / 2)).toBeLessThan(4);
});

test('la sidebar permite expandir y colapsar grupos y marca la ruta activa', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/admin/usuarios');
  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  const catalogo = nav.getByRole('button', { name: 'Catálogo', exact: true });
  const admin = nav.getByRole('button', { name: 'Administración', exact: true });

  await expect(admin).toHaveAttribute('aria-expanded', 'true');
  await catalogo.click();
  await expect(catalogo).toHaveAttribute('aria-expanded', 'true');
  await expect(admin).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Materiales', exact: true })).toBeVisible();

  await catalogo.click();
  await expect(catalogo).toHaveAttribute('aria-expanded', 'false');
  await expect(nav.getByRole('link', { name: 'Materiales', exact: true })).toHaveCount(0);
  await catalogo.click();
  await nav.getByRole('link', { name: 'Materiales', exact: true }).click();
  await page.waitForURL('/materiales');
  await expect(nav.getByRole('link', { name: 'Materiales', exact: true })).toHaveAttribute('aria-current', 'page');
});

for (const width of [1440, 360]) {
  test(`Compras conserva la barra activa con Catálogo abierto (${width}px)`, async ({ page }, testInfo) => {
    await login(page, 'GERENCIA');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/pedidos');
    if (width < 820) {
      await page.getByRole('button', { name: 'Abrir menú' }).click();
    }

    const nav = page.getByRole('navigation', {
      name: width < 820 ? 'Menú completo' : 'Navegación principal',
    });
    const compras = nav.getByRole('button', { name: 'Compras', exact: true });
    const catalogo = nav.getByRole('button', { name: 'Catálogo', exact: true });
    await expect(compras).toHaveClass(/active-group/);
    await catalogo.click();
    await expect(catalogo).toHaveAttribute('aria-expanded', 'true');
    await expect(compras).toHaveAttribute('aria-expanded', 'false');
    await expect(compras).toHaveClass(/active-group/);
    const bar = await compras.evaluate((button) => {
      const style = getComputedStyle(button, '::before');
      return { width: style.width, color: style.backgroundColor };
    });
    expect(bar).toEqual({ width: '3px', color: 'rgb(255, 255, 255)' });
    await page.screenshot({ path: testInfo.outputPath(`pedidos-${width}.png`) });
  });
}

test('la exportación Excel usa nombre traducido y fecha sin hora, aun con Content-Disposition del backend', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/admin/importaciones');
  const card = page.locator('section.card').filter({ has: page.getByRole('heading', { name: 'Exportaciones' }) });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    card.getByRole('button', { name: 'Proveedores', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^proveedores-\d{4}-\d{2}-\d{2}\.xlsx$/);
});
