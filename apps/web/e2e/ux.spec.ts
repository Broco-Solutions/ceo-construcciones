// Notificaciones, unidades predeterminadas y textos de ayuda. La interceptación de red se usa SÓLO
// para simular un rechazo del servidor sin depender de datos inválidos reales.
import { expect, test, type Page } from '@playwright/test';
import { login, SUFFIX, toast } from './helpers';

const EVID = 'docs/evidencia';

async function openUnits(page: Page) {
  await login(page, 'GERENCIA');
  await page.goto('/catalogo');
  await page.getByRole('tab', { name: 'Unidades' }).click();
}

test('unidades predeterminadas listas y alta de una unidad propia con notificación', async ({ page }) => {
  await openUnits(page);
  for (const [name, symbol] of [['Metro cuadrado', 'm²'], ['Metro cúbico', 'm³'], ['Kilogramo', 'kg'], ['Jornal', 'jornal'], ['Global', 'gl']]) {
    const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name, exact: true }) });
    await expect(row.first()).toContainText(symbol);
    await expect(row.first()).toContainText(/UNI-\d{3,}/);
  }

  const name = `Viaje de camión ${SUFFIX()}`;
  await page.getByRole('button', { name: 'Nueva unidad' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nombre', { exact: true }).fill(name);
  await dlg.getByLabel('Símbolo (opcional)').fill('viaje');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await toast(page, 'Unidad creada correctamente');

  // Esquina inferior derecha: no tapa el encabezado y el título queda en una sola línea.
  const n = page.locator('.toast').filter({ hasText: 'Unidad creada correctamente' });
  const box = (await n.boundingBox())!;
  const vp = page.viewportSize()!;
  const header = (await page.locator('header.top').boundingBox())!;
  expect(box.x + box.width).toBeGreaterThan(vp.width - 40);
  expect(box.y).toBeGreaterThan(header.y + header.height);
  expect(box.y + box.height).toBeGreaterThan(vp.height - 40);
  expect((await n.locator('.toast-title').boundingBox())!.height).toBeLessThan(26);
  await expect(page.getByRole('status')).toContainText('Unidad creada correctamente');
  await page.screenshot({ path: `${EVID}/22-notificacion-unidad-creada.png` });

  await n.getByRole('button', { name: 'Cerrar notificación' }).click();
  await expect(n).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toContainText(/UNI-\d{3,}/);
  await expect(row).toContainText('viaje');
});

test('si el servidor rechaza el alta no hay aviso de éxito y el error queda junto al campo', async ({ page }) => {
  await openUnits(page);
  await page.route('**/api/v1/units', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos', details: [{ path: ['name'], message: 'Required' }] } }),
        })
      : route.continue(),
  );
  await page.getByRole('button', { name: 'Nueva unidad' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Nombre', { exact: true }).fill('Unidad rechazada');
  await dlg.getByRole('button', { name: 'Guardar' }).click();
  await expect(dlg.getByText('Completá este campo')).toBeVisible();
  await expect(dlg).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('un error de descarga queda visible hasta cerrarlo y no muestra detalles técnicos', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/stock');
  await page.route('**/api/v1/exports/stock', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'API_UNAVAILABLE', message: 'upstream connect error' } }) }),
  );
  await page.getByRole('button', { name: 'Exportar Excel' }).click();
  const n = page.getByRole('alert').locator('.toast');
  await expect(n).toContainText('No se pudo descargar la planilla de stock');
  await expect(n).toContainText('No hay conexión con el servidor');
  await expect(n).not.toContainText('upstream');
  await page.waitForTimeout(6_000);
  await expect(n).toBeVisible();
  await page.screenshot({ path: `${EVID}/23-notificacion-error.png` });
  await n.getByRole('button', { name: 'Cerrar notificación' }).click();
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('los selectores de unidad muestran nombre y símbolo', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/materiales');
  await page.getByRole('button', { name: 'Nuevo material' }).click();
  const unit = page.getByRole('dialog').getByLabel('Unidad base');
  await expect(unit.locator('option', { hasText: 'Metro cuadrado (m²)' })).toHaveCount(1);
  await expect(unit.locator('option', { hasText: 'Kilogramo (kg)' })).toHaveCount(1);
  await expect(unit.locator('option', { hasText: /UNI-\d/ })).toHaveCount(0);
  await page.goto('/apu/nuevo');
  await expect(page.getByLabel('Unidad de trabajo').locator('option', { hasText: 'Metro cúbico (m³)' })).toHaveCount(1);
});

test('la ayuda de precios explica cómo actualizarlos sin jerga técnica', async ({ page }) => {
  await login(page, 'COMPRAS');
  await page.goto('/proveedores/precios');
  const note = page.getByRole('note');
  await expect(note).toContainText('¿Cómo se actualizan los precios?');
  await expect(note).toContainText('registrá uno nuevo');
  await expect(note).toContainText('se conservan en el historial');
  await expect(page.getByText(/append-only/i)).toHaveCount(0);
});
