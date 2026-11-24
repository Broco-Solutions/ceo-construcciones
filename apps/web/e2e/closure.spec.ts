import { chooseOption } from './helpers';
import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import {
  apiAs,
  byCode,
  unitBySymbol,
  login,
  SUFFIX,
  toast,
  confirmModal,
  pickMaterial,
  creds,
} from './helpers';
import type { Schemas } from '../lib/api';

const EVID = 'docs/evidencia/cierre';

for (const width of [1280, 390]) {
  test(`cómputo al editor comercial · ${width}px`, async ({ page }) => {
    const suffix = SUFFIX();
    const api = await apiAs('GERENCIA');
    try {
      const [category, meter, squareMeter, kilogram] = await Promise.all([
        byCode<Schemas['Category']>(api, '/categories', 'REV'),
        unitBySymbol<Schemas['Unit']>(api, 'm'),
        unitBySymbol<Schemas['Unit']>(api, 'm²'),
        unitBySymbol<Schemas['Unit']>(api, 'kg'),
      ]);
      const client = await api.send<Schemas['Client']>('POST', '/clients', {
        code: `COMP-CLI-${suffix}`, name: `Cliente de cómputo ${suffix}`,
      });
      const [work, otherWork] = await Promise.all(['Principal', 'Alternativa'].map((name) =>
        api.send<Schemas['Work']>('POST', '/works', {
          code: `COMP-${name}-${suffix}`, name: `${name} ${suffix}`, clientId: client.id,
        }),
      ));
      const material = await api.send<Schemas['Material']>('POST', '/materials', {
        code: `COMP-MAT-${suffix}`, name: `Malla sintética ${suffix}`, unitId: kilogram.id,
      });
      await api.send('POST', '/prices', {
        materialId: material.id, price: '10', baseQuantity: '1', currency: 'ARS',
        taxBasis: 'EXCLUDED', effectiveAt: '2020-01-01T00:00:00Z',
      });
      const cerco = await api.send<Schemas['ApuDetail']>('POST', '/apu-items', {
        name: 'Cerco de obra', categoryId: category.id, unitId: meter.id,
        laborCost: '20', laborCurrency: 'ARS', laborTaxBasis: 'EXCLUDED',
        components: [{ materialId: material.id, coefficient: '2' }],
      });
      const revoque = await api.send<Schemas['ApuDetail']>('POST', '/apu-items', {
        name: 'Revoque', categoryId: category.id, unitId: squareMeter.id,
        laborCost: '30', laborCurrency: 'ARS', laborTaxBasis: 'EXCLUDED', components: [],
      });
      const [computation, otherComputation] = await Promise.all([work, otherWork].map((w) =>
        api.send<Schemas['ComputationWriteResult']>('POST', '/computations', {
          workId: w.id, name: `Medición ${w.name}`,
          lines: [{ itemId: cerco.id, quantity: '30' }, { itemId: revoque.id, quantity: '120' }],
        }),
      ));
      const original = await api.get<Schemas['ComputationDetail']>(`/computations/${computation.id}`);
      await page.setViewportSize({ width, height: 900 });
      await login(page, 'GERENCIA');
      await page.goto(`/computos/${computation.id}`);
      await expect(page.getByRole('link', { name: 'Nuevo presupuesto comercial' })).toHaveCount(0);
      await page.getByRole('link', { name: 'Presupuestar', exact: true }).click();
      await expect(page).toHaveURL(/\/presupuestos\/nuevo\?/);
      const workField = page.getByLabel('Obra', { exact: true });
      const origin = page.getByLabel('Empezar desde');
      const source = page.getByLabel('Cómputo de origen');
      await expect(workField).toHaveAttribute('data-selected-id', work.id);
      await expect(origin).toHaveValue('computation');
      await expect(page.getByText(/Se copiarán las actividades y cantidades del cómputo seleccionado/)).toBeVisible();
      await expect(source).toHaveValue(computation.id);
      await expect(page.getByText(`${computation.name} · 2 actividades`, { exact: true })).toBeVisible();
      await expect(source.locator(`option[value="${otherComputation.id}"]`)).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('origen.png') });
      await page.getByLabel('Nombre', { exact: true }).fill(`Presupuesto desde cómputo ${suffix}`);
      let posts = 0;
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().endsWith('/budget-editor')) posts++;
      });
      await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).evaluate((button: HTMLButtonElement) => {
        button.form!.requestSubmit();
        button.form!.requestSubmit();
      });
      await page.waitForURL(/\/presupuestos\/editor\//);
      expect(posts).toBe(1);
      const budgetId = page.url().split('/').pop()!;
      const fenceQty = page.getByLabel('Cantidad · Cerco de obra');
      await expect(page.getByText(/Este presupuesto tiene sus propias cantidades/)).toBeVisible();
      await expect(fenceQty).toHaveValue('30');
      await expect(page.getByLabel('Cantidad · Revoque', { exact: true })).toHaveValue('120');
      const group = page.locator('details.budget-category');
      const summary = group.locator('summary');
      await expect(summary.locator('svg')).toBeVisible();
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(group).not.toHaveAttribute('open', '');
      await expect(fenceQty).toBeHidden();
      await summary.click();
      await fenceQty.fill('35');
      await expect(page.locator('.budget-summary')).toContainText('5.000,00');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('editor.png') });
      await page.getByRole('tab', { name: 'Precio de venta', exact: true }).click();
      await page.getByLabel('Rentabilidad (%)', { exact: true }).fill('50');
      await expect(page.locator('.budget-summary')).toContainText('7.500,00');
      await page.getByRole('tab', { name: 'Presentación y PDF' }).click();
      await page.getByRole('button', { name: 'Previsualizar', exact: true }).click();
      await expect(page.getByRole('dialog').getByTitle('PDF comercial del presupuesto')).toBeVisible();
      await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Emitir y descargar', exact: true }).click();
      await (await download).saveAs(test.info().outputPath('computo-R1.pdf'));
      await toast(page, 'Revisión R1 emitida');
      await page.getByRole('tab', { name: 'Materiales previstos' }).click();
      await expect(page.locator('.row').filter({ has: page.getByText(material.name, { exact: true }) }))
        .toContainText('70 kg');
      await expect(page.getByText(/la referencia de este presupuesto es R1/)).toBeVisible();
      await page.getByRole('button', { name: 'Ver historial de revisiones' }).click();
      await expect(page.getByText('Revisión R1', { exact: true })).toBeVisible();
      expect(await api.get<Schemas['ComputationDetail']>(`/computations/${computation.id}`)).toEqual(original);
      const issued = await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budgetId}`);
      expect(issued.versions[0].issue?.commercialTotal).toBe('7500');

      if (width === 1280) {
        await page.getByRole('link', { name: 'Copiar a nuevo presupuesto' }).click();
        await expect(origin).toHaveValue('revision');
        await chooseOption(workField, work.id);
        await page.getByLabel('Nombre', { exact: true }).fill(`Desde R1 ${suffix}`);
        await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).click();
        await page.waitForURL(/\/presupuestos\/editor\//);
        await expect(fenceQty).toHaveValue('35');
        expect((await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budgetId}`)).versions).toEqual(issued.versions);

        await page.goto('/presupuestos');
        await page.getByRole('link', { name: 'Nuevo presupuesto', exact: true }).click();
        await expect(origin).toHaveValue('blank');
        await expect(origin.locator('option')).toHaveText([
          'Empezar en blanco',
          'Usar cómputo existente',
        ]);
        await expect(page.getByText('Plantilla BASE de CEO', { exact: false })).toHaveCount(0);
        await chooseOption(workField, work.id);
        await page.getByLabel('Nombre', { exact: true }).fill(`En blanco ${suffix}`);
        await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).click();
        await page.waitForURL(/\/presupuestos\/editor\//);
        await expect(page.getByRole('button', { name: 'Revisar costos de referencia' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Guardar como plantilla' })).toHaveCount(0);
        await expect(page.getByText(/guardar esta estructura como plantilla/)).toHaveCount(0);
        const blank = await api.get<Schemas['BudgetEditor']>(`/budget-editor/${page.url().split('/').pop()}`);
        expect(blank.draft?.content.lines).toEqual([]);

        await page.goto('/presupuestos');
        await page.getByRole('link', { name: 'Nuevo presupuesto', exact: true }).click();
        await origin.selectOption('computation');
        await chooseOption(workField, work.id);
        await source.selectOption(computation.id);
        await page.getByRole('button', { name: 'Quitar selección' }).click();
        await expect(source).toHaveValue('');
        await source.selectOption(computation.id);
        await chooseOption(workField, otherWork.id);
        await expect(source).toHaveValue('');
        await expect(source.locator(`option[value="${computation.id}"]`)).toHaveCount(0);
        await source.selectOption(otherComputation.id);
        await expect(page.getByText(`${otherComputation.name} · 2 actividades`, { exact: true })).toBeVisible();
        await page.getByLabel('Nombre', { exact: true }).fill(`Desde Presupuestos ${suffix}`);
        await page.getByRole('button', { name: 'Crear presupuesto', exact: true }).click();
        await page.waitForURL(/\/presupuestos\/editor\//);
        await expect(fenceQty).toHaveValue('30');
      }
    } finally {
      await api.dispose();
    }
  });
}
test('M07: filtro de obras admite cliente inactivo y conserva sus obras', async ({ page }) => {
  const suffix = SUFFIX(), api = await apiAs('GERENCIA');
  try {
    const client = await api.send<Schemas['Client']>('POST', '/clients', {
      code: `M07-CLI-${suffix}`, name: `Cliente histórico M07 ${suffix}`,
    });
    const works: Schemas['Work'][] = [];
    for (const letter of ['A', 'B']) works.push(await api.send<Schemas['Work']>('POST', '/works', {
      code: `M07-OBR-${letter}-${suffix}`, name: `Obra histórica ${letter} M07 ${suffix}`, clientId: client.id,
    }));
    await api.send('PATCH', `/clients/${client.id}`, { active: false });
    await login(page, 'GERENCIA');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/obras');
      if (width === 390) await page.getByRole('button', { name: 'Filtros', exact: true }).click();
      await chooseOption(page.getByLabel('Cliente', { exact: true }), client.id);
      await expect(page.getByLabel('Cliente', { exact: true })).toHaveAttribute('data-selected-id', client.id);
      for (const work of works) await expect(page.locator('b:visible').filter({ hasText: work.name })).toBeVisible();
      const result = await api.list<Schemas['WorkList']>(`/works?clientId=${client.id}`);
      expect(new Set(result.data.map(w => w.id))).toEqual(new Set(works.map(w => w.id)));
      expect(result.total).toBe(2);
    }
  } finally {
    await api.dispose();
  }
});

test('T01/T09/T13/T15–21/T48–50: cliente con dos obras, plantilla, cantidades, R1/PDF y R2 reales', async ({
  page,
}) => {
  test.setTimeout(180000);
  const suffix = SUFFIX(),
    api = await apiAs('GERENCIA');
  const cat = await byCode<Schemas['Category']>(api, '/categories', 'REV'),
    unit = await unitBySymbol<Schemas['Unit']>(api, 'gl'),
    material = await byCode<Schemas['Material']>(api, '/materials', 'CEM-001');
  const template = await api.send<Schemas['BudgetTemplate']>(
    'POST',
    '/budget-templates',
    {
      name: `Plantilla comercial ${suffix}`,
      content: {
        currency: 'ARS',
        taxBasis: 'EXCLUDED',
        markup: '0',
        conditions: '',
        exclusions: '',
        observations: '',
        deadline: '',
        lines: [
          {
            key: crypto.randomUUID(),
            itemId: null,
            code: null,
            name: `Actividad con descripción extensa, terminación y protección de superficies m² ${suffix}`,
            categoryId: cat.id,
            category: cat.name,
            unitId: unit.id,
            unit: 'gl',
            quantity: '0',
            laborUnitCost: '100000',
            directUnitCost: '899000',
            status: 'ACTIVE',
            materials: [
              {
                materialId: material.id,
                name: material.name,
                unitId: material.unitId,
                unit: 'kg',
                coefficient: '1',
                unitPrice: '1000',
                sourcePriceId: null,
              },
            ],
          },
        ],
      },
    },
  );
  await login(page, 'GERENCIA');
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  await page
    .getByLabel('Nombre o razón social')
    .fill(`Cliente comercial ${suffix}`);
  await page.getByLabel('CUIT (opcional)').fill(`30-${suffix}`);
  await page
    .getByRole('button', { name: 'Crear cliente', exact: true })
    .click();
  await toast(page, 'Cliente creado');
  const client = (
    await api.list<Schemas['Client']>(`/clients?q=${suffix}&pageSize=100`)
  ).data.find((c) => c.name === `Cliente comercial ${suffix}`)!;
  expect(client).toBeTruthy();
  await page.goto(`/clientes/${client.id}`);
  for (const name of [
    `Obra comercial A ${suffix}`,
    `Obra comercial B ${suffix}`,
  ]) {
    await page.getByRole('button', { name: 'Nueva obra', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre', { exact: true }).fill(name);
    await expect(dialog.getByLabel('Cliente principal')).toHaveAttribute('data-selected-id',client.id);
    await dialog
      .getByLabel('Dirección de la obra')
      .fill('Dirección sintética de aceptación 123');
    await dialog
      .getByRole('button', { name: 'Crear obra', exact: true })
      .click();
    await toast(page, 'Obra creada correctamente');
  }
  await expect(page.getByText('Obras (2)', { exact: true })).toBeVisible();
  const works = (
    await api.list<Schemas['WorkList']>(`/works?clientId=${client.id}`)
  ).data;
  expect(works).toHaveLength(2);
  const work = works.find((w) => w.name.includes(' A '))!;
  await page.goto(`/presupuestos/nuevo?workId=${work.id}`);
  await page
    .getByLabel('Nombre', { exact: true })
    .fill(`Presupuesto comercial ${suffix}`);
  await page.getByLabel('Empezar desde').selectOption('template');
  await chooseOption(page.getByLabel('Plantilla', { exact: true }), template.id);
  await page
    .getByRole('button', { name: 'Crear presupuesto', exact: true })
    .click();
  await page.waitForURL(/presupuestos\/editor\//);
  const budgetId = page.url().split('/').pop()!;
  const qty = page.getByLabel(/Cantidad · Actividad con descripción/);
  await qty.fill('3');
  await expect(qty).toBeFocused();
  await expect(page.locator('.budget-summary')).toContainText('3.000.000,00');
  await expect(qty).toBeFocused();
  await page.locator('.budget-line-name').click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByText('Ayuda para calcular cantidad', { exact: true })
    .click();
  await dialog
    .getByLabel('Operación aritmética', { exact: true })
    .fill('(1 + 2) * 1');
  await dialog
    .getByRole('button', { name: 'Usar resultado como cantidad' })
    .click();
  await dialog.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(qty).toHaveValue('3');
  await mkdir(EVID, { recursive: true });
  for (const width of [1440, 1280, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: `${EVID}/presupuesto-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('tab', { name: 'Precio de venta', exact: true }).click();
  await page.getByLabel('Rentabilidad (%)', { exact: true }).fill('50');
  await expect(page.locator('.budget-summary')).toContainText('4.500.000,00');
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await toast(page, 'Borrador guardado');
  await page
    .getByRole('tab', { name: 'Presentación y PDF', exact: true })
    .click();
  await page
    .getByLabel('Condiciones', { exact: true })
    .fill('Condiciones comerciales sintéticas. Validez: 30 días.');
  await page.getByLabel('Plazo', { exact: true }).fill('90 días');
  await page
    .getByRole('button', { name: 'Previsualizar', exact: true })
    .click();
  await expect(
    page.getByRole('dialog').getByTitle('PDF comercial del presupuesto'),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  let download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Emitir y descargar', exact: true })
    .click();
  await (await download).saveAs(test.info().outputPath('R1.pdf'));
  await toast(page, 'Revisión R1 emitida');
  let editor = await api.get<Schemas['BudgetEditor']>(
    `/budget-editor/${budgetId}`,
  );
  expect(editor.versions.filter((v) => v.issue)).toHaveLength(1);
  expect(editor.versions[0].issue!.commercialTotal).toBe('4500000');
  await page.getByRole('tab', { name: 'Precio de venta', exact: true }).click();
  await page.getByLabel('Rentabilidad (%)', { exact: true }).fill('20');
  await expect(page.locator('.budget-summary')).toContainText('3.600.000,00');
  await page
    .getByRole('tab', { name: 'Presentación y PDF', exact: true })
    .click();
  download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Emitir y descargar', exact: true })
    .click();
  await (await download).saveAs(test.info().outputPath('R2.pdf'));
  await toast(page, 'Revisión R2 emitida');
  editor = await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budgetId}`);
  expect(editor.versions.filter((v) => v.issue)).toHaveLength(2);
  expect(
    (await api.get<Schemas['BudgetTemplate'][]>(`/budget-templates`)).find(
      (t) => t.id === template.id,
    )!.content.lines[0].quantity,
  ).toBe('0');
  await page.goto('/pedidos/nuevo');
  await page.getByRole('button', { name: new RegExp(work.name) }).click();
  await page.getByRole('button', { name: /Revoques/ }).click();
  await page.getByRole('button', { name: 'Usar faltantes sugeridos' }).click();
  await expect(page.getByLabel(/^Cantidad de Cemento portland/)).toHaveValue(
    '3',
  );
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByLabel('Fecha requerida').fill('2027-01-01');
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'Enviar pedido' }).click();
  await confirmModal(page, 'Enviar');
  await toast(page, 'Pedido enviado a Compras');
  await page.waitForURL(/\/pedidos\/(?!nuevo)[^/]+$/);
  const requestId = page.url().split('/').pop()!;
  const supplier = await byCode<Schemas['Supplier']>(
      api,
      '/suppliers',
      'PROV-DEMO-1',
    ),
    location = (
      await api.list<Schemas['Location']>(`/locations?workId=${work.id}`)
    ).data.find((l) => l.workId === work.id)!;
  // Issuing and receiving use the same UI as the pre-existing full journey.
  await page.goto(`/ordenes/nueva?requestId=${requestId}&workId=${work.id}`);
  await chooseOption(page.getByLabel('Proveedor', { exact: true }), supplier.id);
  await chooseOption(page.getByLabel('Destino de entrega'), location.id);
  await chooseOption(page.getByLabel('Moneda', { exact: true }), 'ARS');
  await chooseOption(page
    .getByLabel(/Base impositiva|Tratamiento.*IVA/), 'EXCLUDED');
  await page.getByLabel('Precio (ARS)', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Revisar y crear' }).click();
  await confirmModal(page, /Confirmar|Crear/);
  await page.waitForURL(/\/ordenes\/(?!nueva)[^/]+$/);
  const orderId = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Emitir', exact: true }).click();
  await confirmModal(page, 'Emitir');
  await toast(page, /emitida/);
  await page.goto(`/recepciones/${orderId}`);
  await page.getByLabel('N.º de remito').fill(`R-COM-${suffix}`);
  await chooseOption(page.getByLabel('Ubicación que recibe'), location.id);
  await page.getByLabel(/^Cantidad recibida de Cemento portland/).fill('3');
  await page.getByRole('button', { name: 'Revisar recepción' }).click();
  await confirmModal(page, 'Confirmar recepción');
  await toast(page, 'Recepción registrada correctamente');
  await page.goto('/stock/movimientos/nuevo');
  await page.getByRole('button', { name: 'Consumo en obra' }).click();
  await pickMaterial(page, material.code);
  await chooseOption(page.getByLabel('Obra (origen)'), location.id);
  await page.getByLabel(/^Cantidad/).fill('1');
  await chooseOption(page.getByLabel('Rubro (opcional)'), cat.id);
  await page.getByRole('button', { name: 'Revisar y confirmar' }).click();
  await confirmModal(page, 'Confirmar movimiento');
  await toast(page, 'Movimiento registrado correctamente');
  const net = await api.get<Schemas['NetNeeds']>(
    `/net-needs?workId=${work.id}`,
  );
  expect(net.rows.find((r) => r.materialId === material.id)).toMatchObject({
    planned: '3',
    consumed: '1',
    workAvailable: '2',
    pendingCoverage: '0',
    remaining: '0',
  });
  await page.goto(`/indicadores?clientId=${client.id}`);
  await chooseOption(page.getByLabel('Cliente', { exact: true }), client.id);
  await expect(
    page.getByText('3.600.000,00', { exact: false }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: `${EVID}/indicadores-cliente.png`,
    fullPage: true,
  });
  await api.dispose();
});

test('T04/T05/T36/T39: Administración usa escritorio informativo sin permisos generales', async ({
  page,
}) => {
  const api = await apiAs('GERENCIA'),
    suffix = SUFFIX(),
    location = await api.send<Schemas['Location']>('POST', '/locations', {
      code: `DEL-${suffix}`,
      name: `Galpón delegado ${suffix}`,
      kind: 'WAREHOUSE',
    }),
    material = await byCode<Schemas['Material']>(api, '/materials', 'CEM-001'),
    supplier = await byCode<Schemas['Supplier']>(
      api,
      '/suppliers',
      'PROV-DEMO-1',
    );
  const order = await api.send<Schemas['OrderDetail']>(
    'POST',
    '/purchase-orders',
    {
      supplierId: supplier.id,
      destinationId: location.id,
      currency: 'ARS',
      taxBasis: 'EXCLUDED',
      lines: [
        {
          materialId: material.id,
          quantity: '3',
          unitPrice: '100',
          baseQuantity: '1',
        },
      ],
    },
    `del-${suffix}`,
  );
  await api.send('POST', `/purchase-orders/${order.id}/status`, {
    status: 'ISSUED',
  });
  await api.send('PUT', `/order-administration/${order.id}/invoice`, {
    invoiceNumber: `F-${suffix}`,
    amount: '363',
    currency: 'ARS',
  });
  const user = (
    await api.list<Schemas['User']>('/users?pageSize=100')
  ).data.find((u) => u.email === creds('ADMINISTRACION').email)!;
  await api.send('PUT', `/reception-delegations/${user.id}`, {
    locationIds: [location.id],
  });
  await login(page, 'ADMINISTRACION');
  await page.goto('/administracion');
  await page.getByText(`F-${suffix}`, { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Datos de la compra' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Referencia de factura' })).toBeVisible();
  await expect(page.getByText(`${material.name} · 3 kg`)).toBeVisible();
  await expect(page.getByLabel('Importe de factura')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guardar referencia' })).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Marcar Pagado', exact: true })
    .click();
  const confirm = page.getByRole('dialog');
  for (const label of [`F-${suffix}`, `OC-${order.number}`, supplier.name, 'ARS 363,00', 'no realiza un pago real'])
    await expect(confirm).toContainText(label);
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  expect((await api.get<Schemas['AdministrativeOrder']>(`/order-administration/${order.id}`)).invoiceInfo?.paymentStatus).toBe('PENDING');
  await page.getByRole('button', { name: 'Marcar Pagado', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirmar Pagado' }).click();
  await toast(page, 'Estado informativo actualizado');
  expect(
    (
      await api.get<Schemas['AdministrativeOrder']>(
        `/order-administration/${order.id}`,
      )
    ).invoiceInfo!.paymentStatus,
  ).toBe('PAID');
  await page.getByText(`F-${suffix}`, { exact: true }).click();
  await page.getByRole('button', { name: 'Marcar Pendiente', exact: true }).click();
  await confirm.getByRole('button', { name: 'Confirmar Pendiente' }).click();
  await toast(page, 'Estado informativo actualizado');
  expect((await api.get<Schemas['AdministrativeOrder']>(`/order-administration/${order.id}`)).invoiceInfo?.paymentStatus).toBe('PENDING');
  await page.goto('/clientes');
  await expect(
    page.getByText(/No tenés permiso|Acceso restringido|No autorizado/).first(),
  ).toBeVisible();
  await page.goto('/recepcion-delegada');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page
    .getByLabel(`Remito de OC-${order.number}`, { exact: true })
    .fill(`R-${suffix}`);
  await page.getByLabel(/^Cemento portland · pendiente 3/).fill('2');
  await page
    .getByRole('button', { name: 'Confirmar recepción', exact: true })
    .click();
  await toast(page, 'Recepción registrada');
  expect(
    (await api.get<Schemas['OrderDetail']>(`/purchase-orders/${order.id}`))
      .lines[0].receivedQuantity,
  ).toBe('2');
  await page.setViewportSize({ width: 360, height: 800 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: `${EVID}/administracion-delegada-360.png`,
    fullPage: true,
  });
  await api.dispose();
});

test('Capacitación: disponibilidad al reservar, filtro de stock y auditoría en español', async ({ page }) => {
  const api = await apiAs('GERENCIA');
  const suffix = SUFFIX();
  const unit = await unitBySymbol<Schemas['Unit']>(api, 'kg');
  const material = await api.send<Schemas['Material']>('POST', '/materials', {
    code: `RES-${suffix}`, name: `Material reserva ${suffix}`, unitId: unit.id, minimum: '25',
  });
  const work = await api.send<Schemas['Work']>('POST', '/works', {
    code: `RES-${suffix}`, name: `Obra reserva ${suffix}`, status: 'ACTIVE',
  });
  const warehouse = await api.send<Schemas['Location']>('POST', '/locations', {
    code: `GAL-${suffix}`, name: `Galpón ${suffix}`, kind: 'WAREHOUSE',
  });
  const yard = await api.send<Schemas['Location']>('POST', '/locations', {
    code: `PAT-${suffix}`, name: `Patio ${suffix}`, kind: 'YARD',
  });
  for (const [location, quantity] of [[warehouse, '100'], [yard, '20']] as const) {
    await api.send('POST', '/movements', {
      type: 'INITIAL', materialId: material.id, destinationId: location.id, quantity,
    }, `initial-${location.id}`);
  }
  await login(page, 'COMPRAS');
  await page.goto('/stock/reservas');
  await page.getByRole('button', { name: 'Nueva reserva' }).click();
  const dialog = page.getByRole('dialog');
  const origin = dialog.getByLabel('Origen (galpón o patio)');
  await expect(origin).toBeDisabled();
  await pickMaterial(dialog, material.code);
  await expect(origin.locator('option', { hasText: `${warehouse.name} — Disponible: 100 kg` })).toBeAttached();
  await expect(origin.locator('option', { hasText: `${yard.name} — Disponible: 20 kg` })).toBeAttached();
  await expect(origin.locator('option', { hasText: 'Sin stock registrado' }).first()).toBeAttached();
  await expect(origin.locator('option', { hasText: work.name })).toHaveCount(0);
  await origin.selectOption(warehouse.id);
  await expect(dialog.getByText(/físico 100 kg, reservado 0 kg/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Limpiar campo' }).click();
  await expect(origin).toHaveValue('');
  await pickMaterial(dialog, material.code);
  await origin.selectOption(warehouse.id);
  await chooseOption(dialog.getByLabel('Obra destino'), work.id);
  await dialog.getByLabel(/^Cantidad/).fill('101');
  await dialog.getByRole('button', { name: 'Reservar', exact: true }).click();
  await expect(dialog.getByText(/Stock disponible insuficiente/)).toBeVisible();
  await dialog.getByLabel(/^Cantidad/).fill('30');
  await dialog.getByRole('button', { name: 'Reservar', exact: true }).click();
  await toast(page, 'Reserva creada correctamente');
  const balance = (await api.list<Schemas['Stock']>(`/stock?materialId=${material.id}&locationId=${warehouse.id}`)).data[0];
  expect(balance).toMatchObject({ physical: '100', reserved: '30', available: '70' });

  await page.goto(`/stock?materialId=${material.id}&locationId=${warehouse.id}`);
  const situation = page.getByLabel('Situación del stock');
  const rows = page.locator('table tbody tr').locator('visible=true');
  await situation.selectOption({ label: 'Con cantidades reservadas' });
  await expect(rows.filter({ hasText: material.name })).toContainText('70 kg');
  await expect(page).toHaveURL(new RegExp(`materialId=${material.id}.*locationId=${warehouse.id}.*situation=RESERVED`));
  await situation.selectOption({ label: 'Sin disponibilidad' });
  await expect(page.getByText('No hay resultados para el filtro elegido.')).toBeVisible();
  await page.goto(`/stock?materialId=${material.id}&locationId=${yard.id}`);
  await situation.selectOption({ label: 'Bajo mínimo' });
  await expect(rows.filter({ hasText: material.name })).toContainText('Bajo mínimo');

  await page.context().clearCookies();
  await login(page, 'GERENCIA');
  await page.goto('/admin/auditoria');
  await page.getByLabel('Tipo de registro').selectOption({ label: 'Reserva de stock' });
  await page.getByLabel('Operación').selectOption({ label: 'Reserva' });
  const auditRequest = page.waitForRequest((req) => {
    const url = new URL(req.url());
    return url.pathname.endsWith('/audit') && url.searchParams.get('action') === 'RESERVE'
      && url.searchParams.get('entity') === 'Reservation';
  });
  await page.getByRole('button', { name: 'Filtrar', exact: true }).click();
  await auditRequest;
  const auditRow = rows.filter({ hasText: 'Reserva de stock' }).first();
  await expect(auditRow).toBeVisible();
  await auditRow.click();
  await dialog.getByText('Detalle técnico', { exact: true }).click();
  await expect(dialog.getByText('RESERVE', { exact: true })).toBeVisible();
  await api.dispose();
});

test('Capacitación: cotizaciones muestran precio base e importe en la moneda de cada oferta', async ({ page }) => {
  const api = await apiAs('GERENCIA');
  const suffix = SUFFIX();
  const material = await byCode<Schemas['Material']>(api, '/materials', 'CEM-001');
  const supplier = await byCode<Schemas['Supplier']>(api, '/suppliers', 'PROV-DEMO-1');
  const work = await api.send<Schemas['Work']>('POST', '/works', {
    code: `COT-${suffix}`, name: `Obra cotización ${suffix}`, status: 'ACTIVE',
  });
  const request = await api.send<Schemas['RequestDetail']>('POST', '/requests', {
    workId: work.id, categoryId: material.categoryId, requiredAt: '2027-01-01T00:00:00.000Z',
    lines: [{ materialId: material.id, quantity: '100' }],
  }, `req-${suffix}`);
  for (const [currency, taxBasis, unitPrice, baseQuantity] of [
    ['ARS', 'EXCLUDED', '10000', '50'],
    ['USD', 'INCLUDED', '1', '3'],
  ]) {
    const presentation = await api.send<Schemas['Presentation']>('POST', '/presentations', {
      materialId: material.id, supplierId: supplier.id, name: `Presentación ${currency} ${suffix}`, baseQuantity,
    });
    await api.send('POST', '/quotations', {
      requestId: request.id, supplierId: supplier.id, currency, taxBasis,
      lines: [{ materialId: material.id, presentationId: presentation.id, quantity: '100', unitPrice, baseQuantity }],
    });
  }
  await login(page, 'COMPRAS');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`/cotizaciones/${request.id}`);
  await expect(page.getByText('Ofertas no comparables directamente.')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Precio por unidad base' }).first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Importe total del renglón' }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'ARS 200,00/kg', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'ARS 20.000,00', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Importe no calculado', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await page.getByRole('button', { name: 'Cargar cotización' }).click();
  const currency = page.getByRole('dialog').getByLabel('Moneda', { exact: true });
  await expect(currency.locator('option')).toHaveText(['ARS — Pesos argentinos', 'USD — Dólares estadounidenses']);
  await api.dispose();
});
