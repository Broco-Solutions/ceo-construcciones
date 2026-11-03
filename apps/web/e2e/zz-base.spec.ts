import { test, expect } from '@playwright/test';
import { apiAs, login, SUFFIX, toast } from './helpers';
import type { Schemas } from '../lib/api';

test('T08/T48: BASE real con 146 actividades, emisión y demanda orientativa visible', async ({
  page,
}) => {
  test.setTimeout(120000);
  const api = await apiAs('GERENCIA'),
    suffix = SUFFIX(),
    work = await api.send<Schemas['Work']>('POST', '/works', {
      code: `BASE-${suffix}`,
      name: `Obra BASE real ${suffix}`,
    });
  await login(page, 'GERENCIA');
  await page.goto(`/presupuestos/nuevo?workId=${work.id}`);
  await page.getByLabel('Nombre', { exact: true }).fill(`BASE real ${suffix}`);
  await page
    .locator('summary')
    .filter({ hasText: 'Plantilla BASE de CEO' })
    .click();
  await page
    .getByRole('button', { name: 'Incorporar y usar BASE', exact: true })
    .click();
  await toast(page, 'BASE incorporada y seleccionada');
  await expect(page.getByLabel('Empezar desde')).not.toHaveValue('');
  await page
    .getByRole('button', { name: 'Crear presupuesto', exact: true })
    .click();
  await page.waitForURL(/\/presupuestos\/editor\//);
  await expect(page.locator('.budget-line')).toHaveCount(146);
  await expect(page.locator('.budget-category')).toHaveCount(17);
  await page.getByLabel('Cantidad · CERCO DE OBRA', { exact: true }).fill('10');
  await expect(page.locator('.budget-summary')).toContainText('162.884,22');
  await expect(
    page.getByText('La composición de materiales requiere revisión.', {
      exact: false,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: 'docs/evidencia/cierre/base-real-1440.png' });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: 'docs/evidencia/cierre/base-real-360.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole('button', { name: 'Revisar materiales', exact: true })
    .click();
  await expect(
    page.getByLabel('Materiales revisados para abastecimiento'),
  ).not.toBeChecked();
  await page
    .getByRole('tab', { name: 'Presentación y PDF', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Emitir y descargar', exact: true })
    .click();
  await (await download).saveAs(test.info().outputPath('BASE-R1.pdf'));
  await toast(page, 'Revisión R1 emitida');
  const needs = await api.get<Schemas['NetNeeds']>(
    `/net-needs?workId=${work.id}`,
  );
  expect(needs.materialDemandIncomplete).toBe(true);
  expect(
    needs.rows
      .filter((r) => r.planned !== null && r.planned !== '0')
      .every((r) => !r.exact && r.warnings.length > 0),
  ).toBe(true);
  await api.dispose();
});
