import { chooseOption } from './helpers';
import { test, expect, type Page } from '@playwright/test';
import {
  apiAs,
  byCode,
  unitBySymbol,
  login,
  SUFFIX,
  type Api,
} from './helpers';
import type { Schemas } from '../lib/api';

async function editor(page: Page, aggregate = false) {
  const api = await apiAs('GERENCIA'),
    suffix = SUFFIX();
  const cat = await byCode<Schemas['Category']>(api, '/categories', 'REV');
  const unit = await unitBySymbol<Schemas['Unit']>(api, 'gl');
  const material = await byCode<Schemas['Material']>(
    api,
    '/materials',
    'CEM-001',
  );
  const work = await api.send<Schemas['Work']>('POST', '/works', {
    code: `H-${suffix}`,
    name: `Obra revisión ${suffix}`,
  });
  const template = await api.send<Schemas['BudgetTemplate']>(
    'POST',
    '/budget-templates',
    {
      name: `Revisión ${suffix}`,
      content: {
        currency: 'ARS',
        taxBasis: 'EXCLUDED',
        markup: '50',
        conditions: 'Condiciones originales',
        exclusions: '',
        observations: '',
        deadline: '',
        lines: [
          {
            key: crypto.randomUUID(),
            itemId: null,
            code: null,
            name: 'Actividad de revisión',
            categoryId: cat.id,
            category: cat.name,
            unitId: unit.id,
            unit: 'gl',
            quantity: '0',
            laborUnitCost: '10',
            directUnitCost: aggregate ? '80' : '20',
            materialsIncludedInDirect: aggregate,
            status: 'ACTIVE',
            materials: [
              {
                materialId: material.id,
                name: material.name,
                unitId: material.unitId,
                unit: 'kg',
                coefficient: '2',
                unitPrice: '30',
                sourcePriceId: null,
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
      workId: work.id,
      name: `Presupuesto revisión ${suffix}`,
      templateId: template.id,
    },
    `editor-${suffix}`,
  );
  await login(page, 'GERENCIA');
  await page.goto(`/presupuestos/editor/${budget.id}`);
  await expect(page.locator('.budget-line')).toHaveCount(1);
  return { api, budget, material };
}
test('H01: breadcrumb conserva destino y no pierde cambios al cancelar', async ({
  page,
}) => {
  const { api } = await editor(page);
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('2');
  await page
    .getByRole('link', { name: 'Presupuestos', exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog', { name: 'Cambios sin guardar' });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click();
  await expect(
    page.getByLabel('Cantidad · Actividad de revisión', { exact: true }),
  ).toHaveValue('2');
  await api.dispose();
});
test('H02: costo por unidad visible con cantidad cero y vacía', async ({
  page,
}) => {
  const { api } = await editor(page);
  await expect(page.locator('.budget-line')).toContainText('90,00', {
    timeout: 3000,
  });
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('');
  await expect(page.locator('.budget-line')).toContainText('90,00');
  await expect(page.locator('.budget-line')).toContainText(
    'Cantidad pendiente',
  );
  await api.dispose();
});
test('H03: cancelar cambio de valoración no altera costos', async ({
  page,
}) => {
  const { api } = await editor(page);
  await page
    .getByRole('tab', { name: 'Presentación y PDF', exact: true })
    .click();
  await chooseOption(page.getByLabel('Moneda', { exact: true }), 'USD');
  const dialog = page.getByRole('dialog', { name: 'Cambiar moneda o IVA' });
  await expect(dialog).toBeVisible({ timeout: 3000 });
  await dialog
    .getByRole('button', { name: 'Conservar valoración', exact: true })
    .click();
  await expect(page.getByLabel('Moneda', { exact: true })).toHaveValue('ARS');
  await page
    .getByRole('tab', { name: 'Cómputo y costos', exact: true })
    .click();
  await page.locator('.budget-line-name').click();
  await expect(
    page.getByLabel('Mano de obra por unidad', { exact: true }),
  ).toHaveValue('10');
  await api.dispose();
});
test('H04: composición permite agregar y quitar materiales del catálogo', async ({
  page,
}) => {
  const { api } = await editor(page);
  await page.locator('.budget-line-name').click();
  await expect(
    page.getByRole('button', { name: 'Agregar material', exact: true }),
  ).toBeVisible({ timeout: 3000 });
  await expect(
    page.getByRole('button', { name: /Quitar material/ }),
  ).toHaveCount(1);
  await api.dispose();
});
test('H05: comparar corralones mantiene una única capa modal', async ({
  page,
}) => {
  const { api } = await editor(page);
  await page.locator('.budget-line-name').click();
  await page.getByRole('button', { name: /Comparar corralones/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1, { timeout: 3000 });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Composición del costo' }),
  ).toBeVisible();
  await api.dispose();
});

test('H01: guardar y salir persiste el último borrador una sola vez, sin emitir', async ({
  page,
}) => {
  const { api, budget } = await editor(page);
  const qty = page.getByLabel('Cantidad · Actividad de revisión', {
    exact: true,
  });
  await qty.fill('2');
  await page
    .getByRole('link', { name: 'Presupuestos', exact: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Guardar y salir', exact: true })
    .click();
  await page.waitForURL(/\/presupuestos$/);
  const stored = await api.get<Schemas['BudgetEditor']>(
    `/budget-editor/${budget.id}`,
  );
  expect(stored.draft!.content.lines[0].quantity).toBe('2');
  expect(stored.draft!.revision).toBe(2);
  expect(stored.versions).toHaveLength(0);
  await api.dispose();
});

test('H01: conflicto real de guardado impide navegar y conserva lo escrito', async ({
  page,
}) => {
  const { api, budget } = await editor(page);
  const current = await api.get<Schemas['BudgetEditor']>(
    `/budget-editor/${budget.id}`,
  );
  await api.send('PUT', `/budget-editor/${budget.id}`, {
    revision: current.draft!.revision,
    content: { ...current.draft!.content, conditions: 'Cambio en otra sesión' },
  });
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('7');
  await page
    .getByRole('link', { name: 'Presupuestos', exact: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Guardar y salir', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('No se salió');
  await page
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click();
  await expect(
    page.getByLabel('Cantidad · Actividad de revisión', { exact: true }),
  ).toHaveValue('7');
  expect(
    (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
      .draft!.content.conditions,
  ).toBe('Cambio en otra sesión');
  await api.dispose();
});

test('H01: una respuesta real demorada no declara guardadas ediciones posteriores', async ({
  page,
}) => {
  const { api, budget } = await editor(page);
  let release!: () => void, fetched!: () => void;
  const gate = new Promise<void>((r) => (release = r)),
    sent = new Promise<void>((r) => (fetched = r));
  await page.route(`**/api/v1/budget-editor/${budget.id}`, async (route) => {
    if (route.request().method() !== 'PUT') return route.continue();
    const response = await route.fetch();
    fetched();
    await gate;
    await route.fulfill({ response });
  });
  const qty = page.getByLabel('Cantidad · Actividad de revisión', {
    exact: true,
  });
  await qty.fill('2');
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await sent;
  await qty.fill('3');
  release();
  await expect(
    page.getByText('Cambios sin guardar', { exact: true }),
  ).toBeVisible();
  await page.unroute(`**/api/v1/budget-editor/${budget.id}`);
  await page
    .getByRole('link', { name: 'Presupuestos', exact: true })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Guardar y salir', exact: true })
    .click();
  await page.waitForURL(/\/presupuestos$/);
  expect(
    (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
      .draft!.content.lines[0].quantity,
  ).toBe('3');
  await api.dispose();
});

test('H01: Atrás y Adelante conservan historial, destino y ediciones canceladas', async ({
  page,
}) => {
  const { api, budget } = await editor(page);
  const url = page.url();
  await page
    .getByRole('link', { name: 'Presupuestos', exact: true })
    .first()
    .click();
  await page.waitForURL(/\/presupuestos$/);
  await page.evaluate(() => history.back());
  await page.waitForURL(url);
  const qty = page.getByLabel('Cantidad · Actividad de revisión', {
    exact: true,
  });
  await qty.fill('8');
  await page.evaluate(() => history.forward());
  await expect(
    page.getByRole('dialog', { name: 'Cambios sin guardar' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click();
  await expect(qty).toHaveValue('8');
  await expect(page).toHaveURL(url);
  await page.evaluate(() => history.forward());
  await page
    .getByRole('button', { name: 'Salir sin guardar', exact: true })
    .click();
  await page.waitForURL(/\/presupuestos$/);
  await page
    .getByRole('row')
    .filter({ has: page.getByText(budget.name, { exact: true }) })
    .click();
  await page.waitForURL(new RegExp(`/presupuestos/(editor/)?${budget.id}`));
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('9');
  await page.evaluate(() => history.back());
  await expect(
    page.getByRole('dialog', { name: 'Cambios sin guardar' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Guardar y salir', exact: true })
    .click();
  await page.waitForURL(/\/presupuestos$/);
  expect(
    (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
      .draft!.content.lines[0].quantity,
  ).toBe('9');
  await api.dispose();
});

for (const width of [1440, 360])
  test(`H01: menú y logout cancelados no ejecutan salida (${width})`, async ({
    page,
  }) => {
    const { api } = await editor(page);
    await page.setViewportSize({ width, height: 900 });
    const qty = page.getByLabel('Cantidad · Actividad de revisión', {
      exact: true,
    });
    await qty.fill('6');
    let logout = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/auth/logout')) logout++;
    });
    if (width < 600)
      await page
        .getByRole('button', { name: 'Abrir menú', exact: true })
        .click();
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Seguir editando', exact: true })
      .click();
    expect(logout).toBe(0);
    await expect(qty).toHaveValue('6');
    if (width < 600)
      await page
        .getByRole('button', { name: 'Abrir menú', exact: true })
        .click();
    const nav = page.getByRole('navigation', {
      name: width < 600 ? 'Menú completo' : 'Navegación principal',
      exact: true,
    });
    await nav.getByRole('button', { name: 'General', exact: true }).click();
    await nav.getByRole('link', { name: 'Clientes', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(qty).toHaveValue('6');
    if (width < 600)
      await page
        .getByRole('button', { name: 'Abrir menú', exact: true })
        .click();
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'Salir sin guardar', exact: true })
      .click();
    await page.waitForURL(/\/login$/);
    expect(logout).toBe(1);
    await api.dispose();
  });

test('H01: recarga usa beforeunload nativo y cancelarla conserva el texto', async ({
  page,
}) => {
  const { api } = await editor(page);
  const qty = page.getByLabel('Cantidad · Actividad de revisión', {
    exact: true,
  });
  await qty.fill('4');
  let native = false;
  page.once('dialog', async (d) => {
    expect(d.type()).toBe('beforeunload');
    native = true;
    await d.dismiss();
  });
  await page.reload({ timeout: 4000 }).catch(() => undefined);
  expect(native).toBe(true);
  await expect(qty).toHaveValue('4');
  let closing = false;
  page.once('dialog', async (d) => {
    expect(d.type()).toBe('beforeunload');
    closing = true;
    await d.dismiss();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => closing).toBe(true);
  expect(page.isClosed()).toBe(false);
  await api.dispose();
});

test('H03: cambio confirmado se revisa y puede restaurar el borrador completo', async ({
  page,
}) => {
  const { api, budget } = await editor(page);
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('2');
  await chooseOption(page.getByLabel('Moneda', { exact: true }), 'USD');
  await page
    .getByRole('button', { name: 'Cambiar y revisar costos', exact: true })
    .click();
  await page.locator('.budget-line-name').click();
  await expect(
    page.getByLabel('Mano de obra por unidad', { exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByLabel('Otros costos directos por unidad', { exact: true }),
  ).toHaveValue('');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Restaurar borrador previo al cambio',
      exact: true,
    })
    .click();
  await expect(page.getByLabel('Moneda', { exact: true })).toHaveValue('ARS');
  await expect(page.locator('.budget-summary')).toContainText('180,00');
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
          .draft!.content.lines[0].quantity,
    )
    .toBe('2');
  await api.dispose();
});

test('H04/H05: catálogo, equivalencias, precio manual y teclado en una sola capa', async ({
  page,
}) => {
  const { api, budget, material } = await editor(page),
    suffix = SUFFIX();
  const replacement = await api.send<Schemas['Material']>(
    'POST',
    '/materials',
    {
      code: `H-M-${suffix}`,
      name: `Material alternativo ${suffix}`,
      unitId: material.unitId,
    },
  );
  const supplier = await api.send<Schemas['Supplier']>('POST', '/suppliers', {
    code: `H-P-${suffix}`,
    name: `Corralón ${suffix}`,
  });
  const presentation = await api.send<Schemas['Presentation']>(
    'POST',
    '/presentations',
    {
      materialId: replacement.id,
      supplierId: supplier.id,
      name: 'Bolsa de 10 kg',
      baseQuantity: '10',
    },
  );
  const price = await api.send<Schemas['MaterialPrice']>('POST', '/prices', {
    materialId: replacement.id,
    supplierId: supplier.id,
    presentationId: presentation.id,
    price: '100',
    baseQuantity: '10',
    currency: 'ARS',
    taxBasis: 'EXCLUDED',
    effectiveAt: '2020-01-01T00:00:00Z',
  });
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('2');
  await page.locator('.budget-line-name').click();
  await page
    .getByRole('button', { name: 'Agregar material', exact: true })
    .click();
  await page
    .getByLabel('Material a agregar', { exact: true })
    .fill(replacement.code);
  await page.getByRole('option').filter({ hasText: replacement.code }).click();
  await page
    .getByLabel(`${replacement.name} · consumo por unidad (kg)`, {
      exact: true,
    })
    .fill('3');
  await page
    .getByRole('button', {
      name: `Comparar corralones · ${replacement.name}`,
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await chooseOption(page
    .getByLabel('Proveedor 1', { exact: true }), supplier.id);
  await page
    .getByRole('button', { name: 'Usar este precio', exact: true })
    .click();
  await expect(
    page.getByRole('dialog', { name: 'Composición del costo' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: `Comparar corralones · ${replacement.name}`,
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    page.getByLabel(`${replacement.name} · precio por kg`, { exact: true }),
  ).toHaveValue('10');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`)
        ).draft!.content.lines[0].materials.find(
          (m) => m.materialId === replacement.id,
        )?.sourcePriceId,
    )
    .toBe(price.id);
  await page.locator('.budget-line-name').click();
  await page
    .getByRole('button', {
      name: `Reemplazar material · ${material.name}`,
      exact: true,
    })
    .click();
  await page
    .getByLabel('Material de reemplazo', { exact: true })
    .fill(replacement.code);
  await page.getByRole('option').filter({ hasText: replacement.code }).click();
  await expect(
    page.getByText('Este material ya está en la composición.', {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Cancelar selección de material',
      exact: true,
    })
    .click();
  const other = await byCode<Schemas['Material']>(api, '/materials', 'ARE-001');
  await page
    .getByRole('button', {
      name: `Reemplazar material · ${material.name}`,
      exact: true,
    })
    .click();
  await page
    .getByLabel('Material de reemplazo', { exact: true })
    .fill(other.code);
  await page.getByRole('option').filter({ hasText: other.code }).click();
  await expect(
    page.getByLabel(`${other.name} · consumo por unidad (m³)`, { exact: true }),
  ).toHaveValue('');
  await expect(
    page.getByLabel(`${other.name} · precio por m³`, { exact: true }),
  ).toHaveValue('');
  await page
    .getByRole('button', {
      name: `Quitar material · ${other.name}`,
      exact: true,
    })
    .click();
  await page
    .getByLabel(`${replacement.name} · precio por kg`, { exact: true })
    .fill('11');
  await page
    .getByRole('button', {
      name: `Comparar corralones · ${replacement.name}`,
      exact: true,
    })
    .click();
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('dialog', { name: 'Composición del costo' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
          .draft!.content.lines[0].materials.length,
    )
    .toBe(1);
  const saved = (
    await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`)
  ).draft!.content.lines[0].materials[0];
  expect(saved).toMatchObject({
    materialId: replacement.id,
    unitPrice: '11',
    coefficient: '3',
    sourcePriceId: null,
  });
  await api.dispose();
});

test('H04: sustituir un agregado por composición comprobada evita doble suma y conserva cantidades', async ({
  page,
}) => {
  const { api, budget } = await editor(page, true);
  await page
    .getByLabel('Cantidad · Actividad de revisión', { exact: true })
    .fill('2');
  await expect(page.locator('.budget-summary')).toContainText('180,00');
  await page.locator('.budget-line-name').click();
  await page
    .getByText('Evidencia de composición y costos directos', { exact: true })
    .click();
  await page
    .getByLabel('Detalle de revisión de materiales', { exact: true })
    .fill('Receta sintética con consumo 2 y precio 30');
  await page
    .getByLabel('Fuente o evidencia de composición', { exact: true })
    .fill('Documento de prueba, renglón 1');
  await page
    .getByRole('button', {
      name: 'Sustituir agregado directo por esta composición',
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel('Otros costos directos por unidad', { exact: true }),
  ).toHaveValue('0');
  await expect(
    page.getByLabel('Materiales valorizados dentro del agregado directo', {
      exact: true,
    }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Listo', exact: true }).click();
  await expect(page.locator('.budget-summary')).toContainText('140,00');
  await page
    .getByRole('button', { name: 'Guardar borrador', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api.get<Schemas['BudgetEditor']>(`/budget-editor/${budget.id}`))
          .draft!.content.lines[0].directUnitCost,
    )
    .toBe('0');
  const stored = await api.get<Schemas['BudgetEditor']>(
    `/budget-editor/${budget.id}`,
  );
  expect(stored.draft!.content.lines[0].materialReview?.detail).toContain(
    '80 ARS',
  );
  await api.dispose();
});
