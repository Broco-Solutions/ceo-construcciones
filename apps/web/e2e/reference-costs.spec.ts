import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  apiAs,
  byCode,
  unitBySymbol,
  login,
  SUFFIX,
  pickMaterial,
} from './helpers';
import type { Schemas } from '../lib/api';
test('costos de referencia: tarifa central, actividad, borrador explícito y R1 inmutable', async ({
  page,
}) => {
  test.setTimeout(180000);
  const api = await apiAs('GERENCIA'),
    suffix = SUFFIX();
  const evidence = 'docs/evidencia/costos';
  await mkdir(evidence, { recursive: true });
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
