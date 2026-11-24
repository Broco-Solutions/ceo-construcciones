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

for (const width of [1280, 390]) {
  test(`partidas repetidas, corrección de PDF y cómputo independiente · ${width}px`, async ({ page }) => {
    const api = await apiAs('GERENCIA');
    const suffix = SUFFIX();
    try {
      const [category, unit, kg, work] = await Promise.all([
        byCode<Schemas['Category']>(api, '/categories', 'REV'),
        unitBySymbol<Schemas['Unit']>(api, 'm²'),
        unitBySymbol<Schemas['Unit']>(api, 'kg'),
        api.send<Schemas['Work']>('POST', '/works', { code: `OB-PINT-${suffix}`, name: `Obra partidas ${suffix}` }),
      ]);
      const material = await api.send<Schemas['Material']>('POST', '/materials', {
        code: `MAT-PINT-${suffix}`, name: `Pintura de prueba ${suffix}`, unitId: kg.id,
      });
      const name = `Pintura interior ${suffix}`;
      const activity = { name, categoryId: category.id, unitId: unit.id, laborCurrency: 'ARS', laborTaxBasis: 'EXCLUDED' };
      const first = await api.send<Schemas['ApuDetail']>('POST', '/apu-items', {
        ...activity, code: `PINT-A-${suffix}`, laborCost: '10', components: [],
      });
      const second = await api.send<Schemas['ApuDetail']>('POST', '/apu-items', {
        ...activity, code: `PINT-B-${suffix}`, laborCost: '20',
        components: [{ materialId: material.id, coefficient: '2' }],
      });
      const computation = await api.send<Schemas['ComputationWriteResult']>('POST', '/computations', {
        workId: work.id, name: `Cómputo partidas ${suffix}`,
        lines: [{ itemId: first.id, quantity: '2' }, { itemId: second.id, quantity: '3' }],
      });
      const computationPath = `/computations/${computation.id}`;
      const original = await api.get<Schemas['ComputationDetail']>(computationPath);
      const budget = await api.send<Schemas['Budget']>('POST', '/budget-editor', {
        workId: work.id, computationId: computation.id, name: `Presupuesto partidas ${suffix}`,
      }, `partidas-${suffix}`);
      const path = `/budget-editor/${budget.id}`;
      const { draft } = await api.get<Schemas['BudgetEditor']>(path);
      const firstKey = draft!.content.lines.find((line) => line.itemId === first.id)!.key;
      const secondKey = draft!.content.lines.find((line) => line.itemId === second.id)!.key;
      const content = {
        ...draft!.content,
        lines: draft!.content.lines.map((line) => ({
          ...line,
          quantity: line.key === firstKey ? null : line.quantity,
          laborUnitCost: line.key === secondKey ? null : line.laborUnitCost,
          code: width === 390 ? null : line.code,
        })),
      };
      await api.send('PUT', path, { revision: draft!.revision, content });
      await page.setViewportSize({ width, height: 900 });
      await login(page, 'GERENCIA');

      if (width === 390) {
        await page.goto(`/computos/${computation.id}`);
        await page.getByRole('button', { name: 'Editar', exact: true }).click();
        const removeItem = page.getByRole('button', { name: 'Quitar ítem', exact: true });
        await expect(removeItem).toHaveCount(2);
        await expect(removeItem.first()).toHaveText('Quitar');
        await removeItem.first().scrollIntoViewIfNeeded();
        await expect(removeItem.first()).toBeInViewport();
        await expect(removeItem.first()).toBeEnabled();
      }

      await page.goto(`/presupuestos/editor/${budget.id}`);
      const firstRow = page.locator(`[data-budget-line="${firstKey}"]`);
      const secondRow = page.locator(`[data-budget-line="${secondKey}"]`);
      const quantity = firstRow.getByRole('textbox', { name: `Cantidad · ${name}` });
      if (width === 390) {
        const position = (key: string) => content.lines.findIndex((line) => line.key === key) + 1;
        await expect(firstRow).toContainText(`Partida ${position(firstKey)} del rubro`);
        await expect(secondRow).toContainText(`Partida ${position(secondKey)} del rubro`);
      } else {
        await expect(firstRow).toContainText(first.code!);
        await expect(secondRow).toContainText(second.code!);
      }
      const composition = page.getByRole('dialog', { name: 'Composición del costo' });
      await secondRow.getByRole('button', { name: 'Editar partida' }).click();
      await expect(composition.getByLabel('Cantidad', { exact: true })).toHaveValue('3');
      await expect(composition.getByLabel(`${material.name} · precio por kg`)).toBeVisible();
      await composition.getByRole('button', { name: 'Listo' }).click();

      await page.getByLabel('Buscar partida').fill('filtro sin coincidencia');
      await page.locator('.budget-category summary').click();
      const pdfTab = page.getByRole('tab', { name: 'Presentación y PDF' });
      const pdfIssues = page.getByRole('region', { name: 'Todavía no se puede generar el PDF' });
      const preview = page.getByRole('button', { name: 'Previsualizar' });
      const issue = page.getByRole('button', { name: 'Emitir y descargar' });
      await pdfTab.click();
      await expect(pdfIssues.getByRole('listitem')).toHaveCount(2);
      await expect(pdfIssues).toContainText('Cantidad pendiente');
      await expect(pdfIssues).toContainText('Mano de obra');
      await expect(pdfIssues).toContainText(`${material.name}: precio`);
      await expect(issue).toBeDisabled();
      let previewRequests = 0;
      page.on('request', (request) => {
        if (request.url().endsWith(`${path}/preview`)) previewRequests++;
      });
      await preview.click();
      await expect(pdfIssues).toBeFocused();
      expect(previewRequests).toBe(0);

      await pdfIssues.getByRole('listitem').filter({ hasText: 'Cantidad pendiente' })
        .getByRole('button', { name: 'Ir a corregir' }).click();
      await expect(page.getByLabel('Buscar partida')).toHaveValue('');
      await expect(quantity).toBeFocused();
      await quantity.fill('2');
      await pdfTab.click();
      await expect(pdfIssues.getByRole('listitem')).toHaveCount(1);
      await expect(pdfIssues).not.toContainText('Cantidad pendiente');
      await pdfIssues.getByRole('button', { name: 'Ir a corregir' }).click();
      await expect(composition.getByLabel('Cantidad', { exact: true })).toHaveValue('3');
      await composition.getByLabel('Mano de obra por unidad', { exact: true }).fill('20');
      await composition.getByLabel(`${material.name} · precio por kg`).fill('5');
      await composition.getByRole('button', { name: 'Listo' }).click();
      await pdfTab.click();
      await expect(issue).toBeEnabled();
      await expect(pdfIssues).toHaveCount(0);
      if (width === 1280) {
        // Provoca un rechazo real de la API aunque el último cálculo de la pantalla esté completo.
        await page.route(`**/api/v1${path}/preview`, async (route) => {
          const submitted: Schemas['EditorContent'] = route.request().postDataJSON();
          await route.continue({
            postData: {
              ...submitted,
              lines: submitted.lines.map((line) => line.key === firstKey
                ? { ...line, quantity: '1000000000000000', laborUnitCost: '1000000' }
                : { ...line, materials: line.materials.map((entry) => ({ ...entry, unitPrice: null })) }),
            },
          });
        }, { times: 1 });
        await preview.click();
        const totalIssue = pdfIssues.getByRole('listitem').filter({ hasText: 'El total comercial excede la precisión admitida.' });
        await expect(totalIssue).toBeVisible();
        await expect(totalIssue.getByText(name, { exact: false })).toHaveCount(0);
        await expect(pdfIssues).toContainText(`${material.name}: precio`);
        await expect(issue).toBeDisabled();
        await totalIssue.getByRole('button', { name: 'Ir a corregir' }).click();
        await expect(firstRow).toBeVisible();
        await expect(composition).toHaveCount(0);
        await secondRow.getByRole('button', { name: 'Editar partida' }).click();
        await composition.getByLabel(`${material.name} · precio por kg`).fill('5.0');
        await composition.getByRole('button', { name: 'Listo' }).click();
        await pdfTab.click();
        await expect(issue).toBeEnabled();
      }
      await preview.click();
      const pdf = page.getByRole('dialog', { name: 'Vista previa comercial' });
      await expect(pdf.getByTitle('PDF comercial del presupuesto')).toBeVisible();
      await pdf.getByRole('button', { name: 'Cerrar' }).click();
      const [downloadR1] = await Promise.all([page.waitForEvent('download'), issue.click()]);
      expect(downloadR1.suggestedFilename()).toMatch(/\.pdf$/);
      const firstVersion = (await api.get<Schemas['BudgetEditor']>(path)).versions[0];
      expect(firstVersion.number).toBe(1);
      const pdfPath = `/api/v1/budget-issues/${firstVersion.id}/pdf`;
      const originalPdf = await (await page.request.get(pdfPath)).body();
      expect(originalPdf.subarray(0, 4).toString()).toBe('%PDF');

      await page.getByRole('tab', { name: 'Cómputo y costos' }).click();
      await expect(page.getByText('ARS 110,00', { exact: true }).first()).toBeVisible();
      const confirm = page.getByRole('dialog', { name: 'Quitar partida del presupuesto' });
      const nativeDialogs: string[] = [];
      page.on('dialog', async (dialog) => {
        nativeDialogs.push(dialog.type());
        await dialog.dismiss();
      });
      await secondRow.getByRole('button', { name: 'Quitar', exact: true }).click();
      await expect(confirm).toContainText(name);
      if (width === 1280) await expect(confirm).toContainText(second.code!);
      await expect(confirm).toContainText(category.name);
      await expect(confirm).toContainText('3 m²');
      await expect(confirm).toContainText('ARS 30,00');
      await expect(confirm).toContainText('ARS 90,00');
      await confirm.getByRole('button', { name: 'Cancelar' }).click();
      await expect(secondRow).toBeVisible();
      expect((await api.get<Schemas['BudgetEditor']>(path)).draft?.content.lines).toHaveLength(2);
      await expect(page.getByText('ARS 110,00', { exact: true }).first()).toBeVisible();

      await secondRow.getByRole('button', { name: 'Editar partida' }).click();
      await composition.getByRole('button', { name: 'Quitar del presupuesto' }).click();
      await expect(confirm).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(1);
      if (width === 1280) {
        await page.route(`**/api/v1${path}`, (route) => route.abort(), { times: 1 });
        await confirm.getByRole('button', { name: 'Quitar partida', exact: true }).click();
        await expect(confirm.getByRole('alert')).toContainText('Sin conexión con el servidor');
        await expect(secondRow).toBeVisible();
      }
      await confirm.getByRole('button', { name: 'Quitar partida', exact: true }).click();
      await expect(confirm).toHaveCount(0);
      await expect(secondRow).toHaveCount(0);
      await expect(firstRow).toContainText('ARS 20,00');
      await expect(page.getByText('ARS 110,00', { exact: true })).toHaveCount(0);
      expect(nativeDialogs).toEqual([]);
      const saved = await api.get<Schemas['BudgetEditor']>(path);
      expect(saved.draft?.content.lines.map((line) => line.key)).toEqual([firstKey]);
      expect(await api.get<Schemas['ComputationDetail']>(computationPath)).toEqual(original);

      await pdfTab.click();
      await Promise.all([page.waitForEvent('download'), issue.click()]);
      const versions = (await api.get<Schemas['BudgetEditor']>(path)).versions;
      expect(versions.map((version) => version.number)).toEqual([2, 1]);
      expect(await (await page.request.get(pdfPath)).body()).toEqual(originalPdf);
      if (width === 390) {
        await page.getByRole('tab', { name: 'Cómputo y costos' }).click();
        await firstRow.getByRole('button', { name: 'Quitar', exact: true }).click();
        await confirm.getByRole('button', { name: 'Quitar partida', exact: true }).click();
        await expect(firstRow).toHaveCount(0);
        await pdfTab.click();
        await expect(pdfIssues).toContainText('Agregá al menos una actividad con cantidad y costos completos para generar el PDF');
        await expect(pdfIssues.getByRole('button', { name: 'Ir a corregir' })).toHaveCount(0);
        await expect(issue).toBeDisabled();
      }
    } finally {
      await api.dispose();
    }
  });
}
