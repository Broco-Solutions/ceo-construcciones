import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Schemas } from '../lib/api';
import { apiAs, byCode, login, SUFFIX, toast, unitBySymbol } from './helpers';

const EVID = 'docs/evidencia/pulido';

test('capturas de pulido con páginas y datos reales en escritorio y móvil', async ({ page }) => {
  test.setTimeout(180_000);
  await mkdir(EVID, { recursive: true });
  const api = await apiAs('GERENCIA');
  try {
    const suffix = SUFFIX();
    const category = await byCode<Schemas['Category']>(api, '/categories', 'REV');
    const unit = await unitBySymbol<Schemas['Unit']>(api, 'gl');
    const material = await byCode<Schemas['Material']>(api, '/materials', 'CEM-001');
    const work = await api.send<Schemas['Work']>('POST', '/works', {
      code: `VIS-${suffix}`,
      name: `Obra sin usuarios ${suffix}`,
    });
    const template = await api.send<Schemas['BudgetTemplate']>(
      'POST',
      '/budget-templates',
      {
        name: `Plantilla visual ${suffix}`,
        content: {
          currency: 'ARS',
          taxBasis: 'EXCLUDED',
          markup: '20',
          conditions: '',
          exclusions: '',
          observations: '',
          deadline: '',
          lines: [{
            key: crypto.randomUUID(),
            itemId: null,
            code: null,
            name: 'Actividad de muestra',
            categoryId: category.id,
            category: category.name,
            unitId: unit.id,
            unit: 'gl',
            quantity: '1',
            laborUnitCost: '10',
            directUnitCost: '20',
            status: 'ACTIVE',
            materials: [{
              materialId: material.id,
              name: material.name,
              unitId: material.unitId,
              unit: 'kg',
              coefficient: '2',
              unitPrice: '30',
              sourcePriceId: null,
            }],
          }],
        },
      },
    );
    const budget = await api.send<Schemas['Budget']>(
      'POST',
      '/budget-editor',
      { workId: work.id, name: `Presupuesto visual ${suffix}`, templateId: template.id },
      `visual-${suffix}`,
    );

    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/ruta-inexistente-pulido');
      await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Volver al inicio' })).toBeVisible();
      await page.screenshot({ path: `${EVID}/no-encontrado-${width}.png` });
    }

    await login(page, 'GERENCIA');
    for (const width of [1440, 360]) {
      await page.setViewportSize({ width, height: 900 });

      await page.goto(`/presupuestos/editor/${budget.id}`);
      const tabs = page.getByRole('tablist', { name: 'Secciones del presupuesto' });
      const history = tabs.getByRole('tab', { name: 'Historial' });
      await history.click();
      await expect(history).toHaveAttribute('aria-selected', 'true');
      await expect(page).toHaveTitle(/· CEO Construcciones$/);
      if (width === 360) {
        const bar = (await tabs.boundingBox())!;
        const active = (await history.boundingBox())!;
        expect(active.x).toBeGreaterThanOrEqual(bar.x);
        expect(active.x + active.width).toBeLessThanOrEqual(bar.x + bar.width + 1);
      }
      await page.screenshot({ path: `${EVID}/editor-historial-${width}.png` });

      await page.goto(`/obras/${work.id}`);
      const empty = page.getByText('Sin usuarios asignados', { exact: true });
      await expect(empty).toBeVisible();
      await expect(page.getByRole('link', { name: 'Gestionar asignaciones' })).toBeVisible();
      await empty.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${EVID}/obra-sin-usuarios-${width}.png` });

      await page.goto('/pedidos');
      if (width === 360) {
        await page.getByRole('button', { name: 'Abrir menú' }).click();
      }
      const sidebar = page.getByRole('navigation', {
        name: width === 360 ? 'Menú completo' : 'Navegación principal',
      });
      const logo = width === 360
        ? sidebar.getByRole('img', { name: 'CEO Construcciones' })
        : page.locator('aside.side').getByRole('img', { name: 'CEO Construcciones' });
      await expect(logo).toBeVisible();
      await page.screenshot({ path: `${EVID}/sidebar-isotipo-${width}.png` });

      await page.goto('/catalogo');
      await page.getByRole('tab', { name: 'Unidades' }).click();
      await page.getByRole('button', { name: 'Nueva unidad' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Nombre', { exact: true }).fill(`Unidad visual ${width} ${suffix}`);
      await dialog.getByLabel('Símbolo (opcional)').fill('vis');
      await dialog.getByRole('button', { name: 'Guardar' }).click();
      await toast(page, 'Unidad creada correctamente');
      await page.screenshot({ path: `${EVID}/toast-exito-${width}.png` });
    }
  } finally {
    await api.dispose();
  }
});
