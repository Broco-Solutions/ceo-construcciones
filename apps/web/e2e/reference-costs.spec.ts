import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import {
  apiAs,
  byCode,
  unitBySymbol,
  login,
  SUFFIX,
  pickMaterial,
} from './helpers';
import type { Schemas } from '../lib/api';
import { formatDateTime } from '../lib/format';
test('costos de referencia: tarifa central, actividad, borrador explícito y R1 inmutable', async ({
  page,
}) => {
  test.setTimeout(180000);
  const api = await apiAs('GERENCIA'),
    suffix = SUFFIX();
  const evidence = test.info().outputDir;
  try {
    const unit = await unitBySymbol<Schemas['Unit']>(api, 'kg'),
      category = await byCode<Schemas['Category']>(api, '/categories', 'REV');
    const material = await api.send<Schemas['Material']>('POST', '/materials', {
      code: `RC-${suffix}`,
      name: `Material costos ${suffix}`,
      unitId: unit.id,
      categoryId: category.id,
    });
    const presentation = await api.send<Schemas['Presentation']>(
      'POST',
      '/presentations',
      { materialId: material.id, name: 'Bolsa 25 kg', baseQuantity: '25' },
    );
    const price = await api.send<Schemas['MaterialPrice']>('POST', '/prices', {
      materialId: material.id,
      presentationId: presentation.id,
      price: '12500',
      baseQuantity: '25',
      currency: 'ARS',
      taxBasis: 'EXCLUDED',
      source: 'Serie sintética',
      effectiveAt: '2020-01-01T12:00:00Z',
    });
    const resources: Schemas['LaborResource'][] = [],
      rates: Schemas['LaborRateCreated'][] = [];
    for (const [name, value] of [
      ['Oficial', '10000'],
      ['Ayudante', '8000'],
    ]) {
      const resource = await api.send<Schemas['LaborResource']>(
        'POST',
        '/labor-resources',
        {
          code: `${name}-${suffix}`,
          name: `${name} ${suffix}`,
          unit: 'h',
          kind: 'CATEGORY',
        },
      );
      resources.push(resource);
      rates.push(
        await api.send<Schemas['LaborRateCreated']>('POST', '/labor-rates', {
          resourceId: resource.id,
          value,
          currency: 'ARS',
          taxBasis: 'EXCLUDED',
          source: 'Tarifa sintética',
          series: 'serie',
          effectiveAt: '2020-01-01T12:00:00Z',
          dateLabel: '2020-01-01',
          datePrecision: 'DAY',
        }),
      );
    }
    const item = await api.send<Schemas['ApuDetail']>('POST', '/apu-items', {
      name: `Actividad conectada ${suffix}`,
      categoryId: category.id,
      unitId: unit.id,
      laborCost: '3600',
      directCost: '500',
      laborCurrency: 'ARS',
      laborTaxBasis: 'EXCLUDED',
      components: [{ materialId: material.id, coefficient: '4' }],
    });
    await api.send('PUT', `/activity-costing/${item.id}`, {
      revision: 0,
      content: {
        currency: 'ARS',
        taxBasis: 'EXCLUDED',
        laborMode: 'CALCULATED',
        labor: resources.map((r, i) => ({
          resourceId: r.id,
          rateId: rates[i].id,
          coefficient: '0.2',
        })),
        materials: [{ materialId: material.id, priceId: price.id }],
      },
    });
    const client = await api.send<Schemas['Client']>('POST', '/clients', {
      code: `RC-${suffix}`,
      name: 'Cliente sintético costos',
    });
    const work = await api.send<Schemas['Work']>('POST', '/works', {
      code: `RC-${suffix}`,
      name: 'Obra sintética costos',
      clientId: client.id,
    });
    const template = await api.send<Schemas['BudgetTemplate']>(
      'POST',
      '/budget-templates',
      {
        name: 'Plantilla costos',
        content: {
          currency: 'ARS',
          taxBasis: 'EXCLUDED',
          markup: '50',
          conditions: 'Datos sintéticos',
          exclusions: '',
          observations: '',
          deadline: '',
          lines: [
            {
              key: crypto.randomUUID(),
              itemId: item.id,
              code: null,
              name: item.name,
              categoryId: category.id,
              category: category.name,
              unitId: unit.id,
              unit: 'kg',
              quantity: '10',
              laborUnitCost: '3600',
              laborReferences: resources.map((r, i) => ({
                resourceId: r.id,
                rateId: rates[i].id,
                name: r.name,
                unit: r.unit,
                coefficient: '0.2',
                value: rates[i].value,
                source: rates[i].source,
                dateLabel: rates[i].dateLabel,
                datePrecision: rates[i].datePrecision,
              })),
              directUnitCost: '500',
              status: 'ACTIVE',
              materials: [
                {
                  materialId: material.id,
                  name: material.name,
                  unitId: unit.id,
                  unit: 'kg',
                  coefficient: '4',
                  unitPrice: '500',
                  sourcePriceId: price.id,
                },
              ],
            },
          ],
        },
      },
    );
    const budget = await api.send<Schemas['Budget']>(
      'POST',
      '/budget-editor',
      {
        name: `Presupuesto costos ${suffix}`,
        workId: work.id,
        templateId: template.id,
      },
      `budget-${suffix}`,
    );
    const r1 = await api.send<Schemas['IssuedVersion']>(
      'POST',
      `/budget-editor/${budget.id}/issue`,
      { revision: 1 },
      `issue1-${suffix}`,
    );
    expect(r1.snapshot.commercialTotal).toBe('91500.00');
    await login(page, 'GERENCIA');
    const r1pdf = await page.request.get(`/api/v1/budget-issues/${r1.id}/pdf`);
    expect(r1pdf.ok()).toBeTruthy();
    const r1bytes = await r1pdf.body();
    await writeFile(test.info().outputPath('R1-costos.pdf'), r1bytes);
    await page.goto('/costos');
    await page.getByRole('tab', { name: 'Mano de obra', exact: true }).click();
    await page.getByLabel('Buscar concepto').fill(`Oficial ${suffix}`);
    await page
      .getByRole('row')
      .filter({ hasText: `Oficial ${suffix}` })
      .getByRole('button', { name: 'Registrar tarifa', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Tarifa por h').fill('12000');
    await dialog
      .getByRole('button', { name: 'Registrar tarifa', exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await api.send('POST', '/prices', {
      materialId: material.id,
      presentationId: presentation.id,
      price: '15000',
      baseQuantity: '25',
      currency: 'ARS',
      taxBasis: 'EXCLUDED',
      source: 'Serie sintética',
      effectiveAt: '2021-01-01T12:00:00Z',
    });
    for (const width of [1440, 1280, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/costos');
      await pickMaterial(page, `RC-${suffix}`, 'Filtrar por material');
      await expect(
        page.getByLabel('Filtrar por material',{exact:true}),
      ).toHaveValue(`Material costos ${suffix}`);
      await expect(page.getByLabel('Filtrar por material',{exact:true})).toHaveAttribute('data-selected-id',material.id);
      await page.screenshot({ path: `${evidence}/materiales-${width}.png` });
      await page
        .getByRole('tab', { name: 'Mano de obra', exact: true })
        .click();
      await page.getByLabel('Buscar concepto').fill(suffix);
      await expect(
        page.getByText(`Oficial ${suffix}`, { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: `${evidence}/mano-obra-${width}.png` });
      await page.goto(`/apu/${item.id}`);
      await expect(page.getByText(/6\.900/).first()).toBeVisible();
      await page.screenshot({ path: `${evidence}/actividad-${width}.png` });
    }
    const untouchedDraft = (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`)).draft;
    await page.goto(`/presupuestos/editor/${budget.id}`);
    await page
      .getByRole('tab', { name: 'Presentación y PDF', exact: true })
      .click();
    await page
      .getByLabel('Observaciones comerciales', { exact: true })
      .fill('Prueba de respuesta tardía, sin cambios de cantidades.');
    await page
      .getByRole('tab', { name: 'Cómputo y costos', exact: true })
      .click();
    let releasePreview!: () => void, previewReceived!: () => void;
    const previewGate = new Promise<void>(
        (resolve) => (releasePreview = resolve),
      ),
      previewReady = new Promise<void>(
        (resolve) => (previewReceived = resolve),
      );
    await page.route('**/cost-review', async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      previewReceived();
      await previewGate;
      await route.fulfill({ response });
    });
    await page
      .getByRole('button', {
        name: 'Revisar costos de referencia',
        exact: true,
      })
      .click();
    await previewReady;
    await page
      .locator('header.top')
      .getByRole('link', { name: 'Presupuestos', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Seguir editando', exact: true }),
    ).toBeVisible();
    const delivered = page.waitForResponse((r) =>
      r.url().endsWith('/cost-review'),
    );
    releasePreview();
    await delivered;
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
    await page.screenshot({path:`${evidence}/revision-navegacion-360.png`});
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    await page.unroute('**/cost-review');
    expect((await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`)).draft).toEqual(untouchedDraft);
    expect(
      (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
        .draft!.revision,
    ).toBe(1);
    await page
      .getByRole('button', {
        name: 'Revisar costos de referencia',
        exact: true,
      })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toContainText('103.500');
    const laborChange = page.getByRole('dialog').getByRole('checkbox').first();
    await laborChange.uncheck();
    await expect(page.getByRole('dialog')).toContainText('97.500');
    await expect(laborChange).toBeEnabled();
    await laborChange.check();
    await expect(page.getByRole('dialog')).toContainText('103.500');
    await expect(laborChange).toBeEnabled();
    await page.screenshot({ path: `${evidence}/revision-360.png` });
    await page
      .getByRole('button', { name: 'Aplicar selección al borrador' })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const after = await api.get<Schemas['BudgetEditor']>(
      `/budget-editor/${budget.id}`,
    );
    expect(after.versions).toHaveLength(1);
    expect(after.draft?.content.lines[0].quantity).toBe('10');
    expect(after.draft?.content.observations).toBe('Prueba de respuesta tardía, sin cambios de cantidades.');
    const next = await api.send<Schemas['IssuedVersion']>(
      'POST',
      `/budget-editor/${budget.id}/issue`,
      { revision: after.draft!.revision },
      `issue2-${suffix}`,
    );
    expect(next.snapshot.commercialTotal).toBe('103500.00');
    expect(next.snapshot.materials[0].quantity).toBe('40');
    const old = await api.get<Schemas['BudgetVersion']>(
      `/budget-versions/${r1.id}`,
    );
    expect(old.snapshot).toEqual(r1.snapshot);
    const originalPdf = await page.request.get(
      `/api/v1/budget-issues/${r1.id}/pdf`,
    );
    expect(await originalPdf.body()).toEqual(r1bytes);
    const r2pdf = await page.request.get(
      `/api/v1/budget-issues/${next.id}/pdf`,
    );
    expect(r2pdf.ok()).toBeTruthy();
    await writeFile(
      test.info().outputPath('R2-costos.pdf'),
      await r2pdf.body(),
    );
  } finally {
    await api.dispose();
  }
});

test('precio por unidad base en referencias históricas, en escritorio y móvil', async ({ page }) => {
  const api = await apiAs('GERENCIA');
  const suffix = SUFFIX();
  try {
    const supplier = await api.send<Schemas['Supplier']>('POST', '/suppliers', {
      code: `BASE-PROV-${suffix}`,
      name: `Materiales del Centro ${suffix}`,
    });
    const references = [
      { symbol: 'kg', presentation: 'Bolsa de 50 kg', quantity: '50', price: '15000', formatted: 'ARS 15.000,00', normalized: 'ARS 300,00/kg' },
      { symbol: 'L', presentation: 'Balde de 20 L', quantity: '20', price: '57800', formatted: 'ARS 57.800,00', normalized: 'ARS 2.890,00/L' },
    ];
    const records = await Promise.all(references.map(async (reference, index) => {
      const unit = await unitBySymbol<Schemas['Unit']>(api, reference.symbol);
      const material = await api.send<Schemas['Material']>('POST', '/materials', {
        code: `BASE-${index}-${suffix}`, name: `Unidad base ${reference.symbol} ${suffix}`, unitId: unit.id,
      });
      const pack = await api.send<Schemas['Presentation']>('POST', '/presentations', {
        materialId: material.id, name: reference.presentation, baseQuantity: reference.quantity,
      });
      const price = await api.send<Schemas['MaterialPrice']>('POST', '/prices', {
        materialId: material.id, supplierId: supplier.id, presentationId: pack.id, baseQuantity: reference.quantity,
        price: reference.price, currency: 'ARS', taxBasis: 'EXCLUDED', source: `Historial sintético ${reference.symbol} ${suffix}`,
        effectiveAt: '2020-01-01T12:00:00Z',
      });
      return { ...reference, material, pack, record: price };
    }));

    // El alta manual no genera procedencia de importación. Simular sólo esa
    // metadata en las dos filas sintéticas, conservando el resto de la respuesta real.
    await page.route((url) => url.pathname === '/api/v1/prices', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      if (!response.ok()) return route.fulfill({ response });
      const body = await response.json();
      await route.fulfill({
        response,
        json: {
          ...body,
          data: body.data.map((price: Schemas['MaterialPrice']) =>
            records.some(({ record }) => record.id === price.id)
              ? { ...price, referenceDate: '2019-12-01', referenceDatePrecision: 'MONTH', referenceState: 'HISTORICAL' }
              : price,
          ),
        },
      });
    });

    await login(page, 'GERENCIA');
    const table = page.locator('.price-table');
    const headers = table.getByRole('columnheader');
    const compactHeaders = [
      '', 'Material', 'Proveedor', 'Precio', 'Presentación',
      'Precio por unidad base', 'Base impositiva', 'Fecha de vigencia', 'Acción',
    ];
    const expectPageToFit = async () => {
      await expect.poll(() => page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBeLessThanOrEqual(1);
    };
    const expectTableToFit = async () => {
      await expect.poll(() => table.locator('.tblwrap').evaluate(
        (wrap) => wrap.scrollWidth - wrap.clientWidth,
      )).toBeLessThanOrEqual(1);
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/costos');
    const sidebar = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(sidebar.getByRole('button', { name: 'Catálogo', exact: true })).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar.getByRole('link', { name: 'Costos', exact: true })).toHaveAttribute('href', '/costos');
    await expect(page.getByRole('heading', { level: 1, name: 'Costos', exact: true })).toBeVisible();
    const tabs = page.getByRole('tablist', { name: 'Costos', exact: true });
    await expect(tabs.getByRole('tab')).toHaveText(['Materiales', 'Mano de obra']);
    await tabs.getByRole('tab', { name: 'Mano de obra' }).click();
    await expect(tabs.getByRole('tab', { name: 'Mano de obra' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Buscar concepto')).toBeVisible();
    await tabs.getByRole('tab', { name: 'Materiales' }).click();
    await expect(tabs.getByRole('tab', { name: 'Materiales' })).toHaveAttribute('aria-selected', 'true');
    await expect(headers).toHaveText(compactHeaders);
    await expect(table.getByRole('checkbox', { name: 'Seleccionar página visible' })).toBeVisible();
    await expectTableToFit();

    const supplierFilter = page.getByLabel('Filtrar por proveedor');
    await supplierFilter.selectOption(supplier.id);
    await expect(headers).toHaveText(compactHeaders.filter((name) => name !== 'Proveedor'));
    await expect(table.getByRole('cell', { name: '1 Bolsa de 50 kg (50 kg)', exact: true })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'ARS 300,00/kg', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('proveedor-1440.png') });
    await supplierFilter.selectOption('');

    for (const width of [1440, 1280, 900, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/costos');
      const desktop = width > 820;
      await expect(table).toHaveClass('price-table price-table--costs');
      if (desktop) {
        await expect(headers).toHaveText(compactHeaders);
        if (width >= 1280) await expectTableToFit();
      } else {
        const visibleCard = table.locator('.pcard').filter({ hasText: records[0].material.name });
        await expect(visibleCard.getByText(`Proveedor · ${supplier.name}`, { exact: true })).toBeVisible();
      }
      await expectPageToFit();
      await page.screenshot({ path: test.info().outputPath(`costos-${width}.png`) });
      for (const { material, pack, record, presentation, quantity, symbol, formatted, normalized } of records) {
        await pickMaterial(page, material.code, 'Filtrar por material');
        const equivalence = `1 ${presentation} (${quantity} ${symbol})`;
        const row = desktop
          ? table.getByRole('row').filter({ hasText: presentation })
          : table.locator('.pcard').filter({ hasText: presentation });
        if (desktop) {
          await expect(headers).toHaveText(compactHeaders.filter((name) => name !== 'Material'));
          const price = row.getByRole('cell', { name: normalized, exact: true });
          await expect(row.getByRole('cell', { name: equivalence, exact: true })).toBeVisible();
          await expect(price).toBeVisible();
          await expect(price).toHaveCSS('white-space', 'nowrap');
          await expect(price).toHaveCSS('text-align', 'right');
          await expect(row.getByText('diciembre de 2019', { exact: true })).toBeVisible();
        } else {
          await expect(row.getByText(`Precio por unidad base · ${normalized}`, { exact: true })).toBeVisible();
          await expect(row.getByText(`Presentación · ${equivalence}`, { exact: true })).toBeVisible();
          await expect(row.getByText('Fecha de vigencia · diciembre de 2019', { exact: true })).toBeVisible();
        }
        await expect(row.getByText(formatted, { exact: true })).toBeVisible();
        await expect(row.getByText('Sin IVA (neto)', { exact: true })).toBeVisible();
        await expect(row.getByText('Referencia histórica · día no informado', { exact: true })).toBeVisible();

        const details = row.locator('details');
        const summary = details.getByText('Ver detalle', { exact: true });
        const detailFields = details.locator('div');
        await expect(details).toHaveJSProperty('open', false);
        await expect(detailFields.first()).toBeHidden();
        await summary.click();
        await expect(details).toHaveJSProperty('open', true);
        await expect(detailFields).toHaveText([
          `Fuente: ${record.source}`,
          `Fecha de registro: ${formatDateTime(record.createdAt)}`,
        ]);
        await expect(detailFields.first()).toBeVisible();
        await expect(detailFields.last()).toBeVisible();
        await expectPageToFit();
        await page.screenshot({ path: test.info().outputPath(`material-${symbol}-${width}.png`) });
        await summary.click();
        await expect(details).toHaveJSProperty('open', false);
        await expect(detailFields.first()).toBeHidden();
        await expect(detailFields.last()).toBeHidden();

        if ([1280, 390].includes(width)) {
          await row.getByRole('button', { name: 'Actualizar costo', exact: true }).click();
          const dialog = page.getByRole('dialog', { name: 'Registrar precio', exact: true });
          await expect(dialog.getByLabel('Fuente', { exact: true })).toHaveValue(record.source!);
          await expect(dialog.getByLabel('Presentación', { exact: true })).toHaveAttribute('data-selected-id', pack.id);
          await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
          await expect(dialog).toHaveCount(0);
          const { data } = await api.list<Schemas['MaterialPrice']>(`/prices?materialId=${material.id}`);
          expect(data.map((price) => price.id)).toEqual([record.id]);
        }
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    const { material, record } = records[0];
    const commonHeaders = ['Precio', 'Presentación', 'Precio por unidad base', 'Base impositiva', 'Fuente', 'Registrado'];
    for (const { path, columns, hasUpdateAction } of [
      { path: '/proveedores/precios', columns: ['', '', 'Fecha de referencia', 'Material', 'Proveedor'], hasUpdateAction: true },
      { path: `/materiales/${material.id}`, columns: ['', 'Fecha de referencia', 'Proveedor'], hasUpdateAction: false },
      { path: `/proveedores/${supplier.id}`, columns: ['', 'Fecha de referencia', 'Material'], hasUpdateAction: false },
    ]) {
      await page.goto(path);
      await expect(table).toHaveClass('price-table');
      await expect(headers).toHaveText([...columns, ...commonHeaders]);
      const row = table.getByRole('row').filter({ hasText: record.source! });
      await expect(row.getByRole('cell', { name: record.source!, exact: true })).toBeVisible();
      await expect(row.getByRole('cell', { name: formatDateTime(record.createdAt), exact: true })).toBeVisible();
      await expect(row.getByText('Ver detalle', { exact: true })).toHaveCount(0);
      await expect(row.getByRole('button', { name: 'Actualizar esta referencia', exact: true })).toHaveCount(hasUpdateAction ? 1 : 0);

      await page.setViewportSize({ width: 390, height: 900 });
      const cards = table.locator('.pcard').filter({ hasText: records[0].presentation });
      const card = path === '/proveedores/precios'
        ? cards.filter({ hasText: material.name })
        : cards;
      await expect(card.getByText(/Presentación · 1 Bolsa de 50 kg \(50 kg\) · desde diciembre de 2019/)).toBeVisible();
      await expect(card.getByText('Precio por unidad base · ARS 300,00/kg', { exact: true })).toBeVisible();
      await expect(card.getByText('Ver detalle', { exact: true })).toHaveCount(0);
      await expect(card.getByRole('button', { name: 'Actualizar esta referencia', exact: true })).toHaveCount(hasUpdateAction ? 1 : 0);
      await page.setViewportSize({ width: 1440, height: 900 });
    }
  } finally {
    await api.dispose();
  }
});
