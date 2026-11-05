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
  await chooseOption(page.getByLabel('Empezar desde'), template.id);
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
  await expect(page.getByLabel('Número de factura')).toBeDisabled();
  await expect(page.getByLabel('Importe de factura')).toBeDisabled();
  await page
    .getByRole('button', { name: 'Marcar Pagado', exact: true })
    .click();
  await toast(page, 'Estado informativo actualizado');
  expect(
    (
      await api.get<Schemas['AdministrativeOrder']>(
        `/order-administration/${order.id}`,
      )
    ).invoiceInfo!.paymentStatus,
  ).toBe('PAID');
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
