import { expect, test, type Page } from '@playwright/test';
import ExcelJS from '../../api/node_modules/exceljs';
import { apiAs, login, uid } from './helpers';

const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function downloadTemplate(page: Page, kind: string) {
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar plantilla Excel' }).click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(new RegExp(`^plantilla-${kind}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
  const path = await download.path();
  expect(path).toBeTruthy();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path!);
  return workbook;
}

async function uploadXlsx(page: Page, book: ExcelJS.Workbook, name: string) {
  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const event = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importar archivo' }).click();
  await (await event).setFiles({ name, buffer, mimeType: mime });
}

async function uploadCsv(page: Page, label: string, csv: string, name: string) {
  await page.getByLabel(label).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(csv) });
}

test('Administración carga XLSX directo, cancela, conserva la última revisión y confirma los materiales', async ({ page }) => {
  await login(page, 'GERENCIA');
  await page.goto('/admin/importaciones');
  await page.getByRole('tab', { name: 'Materiales' }).click();
  const label = 'Archivo de importación';
  const book = await downloadTemplate(page, 'materiales');
  const sheet = book.getWorksheet('Datos')!;
  const tag = uid();
  const material = `Material nuevo ${tag}`;
  sheet.addRow(['', material, 'kg', '', 5]);
  const confirm = page.getByRole('button', { name: 'Confirmar importación', exact: true });
  await uploadXlsx(page, book, 'materiales-nuevos.xlsx');
  const summary = page.getByTestId('import-preview-summary');
  await expect(summary).toContainText('1 filas · 1 válidas · 0 con errores');
  await expect(page.getByRole('cell', { name: 'kg', exact: true })).toBeVisible();
  await expect(page.getByText('El código se generará al confirmar.')).toBeVisible();

  for (const width of [1440, 1280, 390]) {
    await page.setViewportSize({ width, height: 850 });
    await confirm.scrollIntoViewIfNeeded();
    await expect(confirm).toBeVisible();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth,
    )).toBeLessThanOrEqual(1);
    await page.screenshot({ path: test.info().outputPath(`materiales-${width}.png`) });
  }
  const admin = await apiAs('GERENCIA');
  try {
    await confirm.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    expect((await admin.list(`/materials?search=${encodeURIComponent(material)}`)).total).toBe(0);

    let waitForOld: () => void = () => {};
    const oldStarted = new Promise<void>((resolve) => { waitForOld = resolve; });
    let releaseOld: () => void = () => {};
    const hold = new Promise<void>((resolve) => { releaseOld = resolve; });
    await page.route('**/api/v1/imports/materials/preview', async (route) => {
      if (route.request().postDataJSON().file?.name !== 'lento.xlsx') return route.continue();
      waitForOld();
      const response = await route.fetch();
      await hold;
      await route.fulfill({ response });
    });
    await uploadXlsx(page, book, 'lento.xlsx');
    await oldStarted;
    await expect(confirm).toHaveCount(0);
    await uploadCsv(page, label, 'Código;Material;Unidad;Rubro;Stock mínimo\n;Inválido;No existe;;', 'con-error.csv');
    await expect(summary).toContainText('0 válidas · 1 con errores');
    await expect(confirm).toBeDisabled();
    const oldResponse = page.waitForResponse((response) =>
      response.url().endsWith('/imports/materials/preview') &&
      response.request().postDataJSON().file?.name === 'lento.xlsx');
    releaseOld();
    await oldResponse;
    await expect(page.getByText('La unidad indicada no existe en el catálogo.', { exact: true })).toBeVisible();
    await expect(confirm).toBeDisabled();

    await uploadXlsx(page, book, 'materiales-nuevos.xlsx');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    const importButton = page.getByRole('dialog').getByRole('button', { name: 'Importar', exact: true });
    await importButton.evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
    await expect(page.getByTestId('import-commit-result')).toContainText(/1 filas? importadas?/);
    expect((await admin.list(`/materials?search=${encodeURIComponent(material)}`)).total).toBe(1);
  } finally {
    await admin.dispose();
  }
});

test('Precios comparte flujo entre Administración y Catálogo y reconoce la plantilla oficial y el CSV técnico', async ({ page }) => {
  const admin = await apiAs('GERENCIA');
  const tag = uid();
  const materialCode = `MAT-IMPORT-${tag}`;
  const supplierCode = `PRV-IMPORT-${tag}`;
  const { data: units } = await admin.list('/units?pageSize=100');
  const unit = units.find((entry) => entry.symbol === 'kg');
  const material = await admin.send('POST', '/materials', { code: materialCode, name: `Cemento de prueba ${tag}`, unitId: unit.id });
  const supplier = await admin.send('POST', '/suppliers', { code: supplierCode, name: `Corralón de prueba ${tag}` });
  await admin.send('POST', '/presentations', {
    materialId: material.id, supplierId: supplier.id, name: 'Bolsa 25 kg', baseQuantity: '25',
  });

  try {
    await login(page, 'GERENCIA');
    await page.goto('/admin/importaciones');
    await page.getByRole('tab', { name: 'Precios' }).click();
    const fileLabel = 'Archivo de precios (.xlsx / .csv)';
    const book = await downloadTemplate(page, 'precios');
    book.getWorksheet('Datos')!.addRow([materialCode, 'kg', 'Bolsa 25 kg', 7210]);
    await page.getByLabel('Proveedor de la lista').selectOption(supplier.id);
    await uploadXlsx(page, book, 'lista.xlsx');
    await expect(page.getByText('Falta indicar la fecha de vigencia.')).toBeVisible();
    const review = page.getByRole('button', { name: 'Revisar diferencias' });
    const confirm = page.getByRole('button', { name: 'Confirmar importación validada' });
    await expect(review).toBeDisabled();
    await expect(page.getByLabel('Columna: Precio')).toHaveCount(0);
    await page.getByLabel('Fecha de vigencia', { exact: true }).fill('2020-01-01');
    await review.click();
    await expect(page.getByRole('cell', { name: 'Por 25 · 2020-01-01' })).toBeVisible();
    await expect(confirm).toBeEnabled();
    for (const width of [1440, 1280, 390]) {
      await page.setViewportSize({ width, height: 850 });
      await confirm.scrollIntoViewIfNeeded();
      await expect(confirm).toBeVisible();
      await expect.poll(() => page.evaluate(() =>
        document.documentElement.scrollWidth - window.innerWidth,
      )).toBeLessThanOrEqual(1);
      await page.screenshot({ path: test.info().outputPath(`precios-${width}.png`) });
    }
    await page.getByLabel('Moneda', { exact: true }).selectOption('USD');
    await expect(confirm).toHaveCount(0);
    await page.getByLabel('Moneda', { exact: true }).selectOption('ARS');
    await review.click();
    await confirm.click();
    await expect(page.getByTestId('price-import-result')).toContainText(/1 referencias? creadas?/);

    await uploadCsv(page, fileLabel, [
      'externalCode,materialCode,supplierCode,price,currency,taxBasis,effectiveAt,presentationId,baseQuantity',
      `LEG-${tag},${materialCode},${supplierCode},300,ARS,EXCLUDED,2020-02-01T03:00:00.000Z,,1`,
    ].join('\n'), 'tecnica.csv');
    await expect(page.getByText('CSV técnico.', { exact: false })).toBeVisible();
    await review.click();
    await confirm.click();
    await expect(page.getByTestId('price-import-result')).toBeVisible();

    await page.goto('/costos');
    await page.getByRole('link', { name: 'Importar Excel / CSV' }).click();
    await expect(page).toHaveURL(/\/proveedores\/importar-precios$/);
    await page.getByLabel('Proveedor de la lista').selectOption(supplier.id);
    await page.getByLabel('Fecha de vigencia', { exact: true }).fill('2020-03-01');
    await uploadCsv(page, fileLabel, `Artículo,Medida,Importe\n${materialCode},kg,305.50`, 'lista-manual.csv');
    await page.getByLabel('Columna: Código material').selectOption('0');
    await page.getByLabel('Columna: Unidad').selectOption('1');
    await page.getByLabel('Columna: Precio').selectOption('2');
    await review.click();
    await expect(page.getByRole('cell', { name: '300', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Por 1 · 2020-03-01' })).toBeVisible();
    await confirm.click();
    await expect(page.getByTestId('price-import-result')).toBeVisible();
    const comparison = await admin.get(`/price-comparison?materialId=${material.id}&supplierIds=${supplier.id}`);
    expect(comparison.candidates.map((entry: { normalizedPrice: string }) => entry.normalizedPrice))
      .toEqual(expect.arrayContaining(['305.5', '288.4']));
  } finally {
    await admin.dispose();
  }
});
