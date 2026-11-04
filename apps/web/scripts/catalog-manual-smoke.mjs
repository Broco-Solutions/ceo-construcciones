// Persistent manual environment only. Reads real catalog; creates one MAN test draft once.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const state = join(homedir(), '.local/state/ceo-construcciones-codex'),
  output = join(state, 'catalog-final');
await mkdir(output, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(
  await readFile(join(state, 'manual/credenciales.json'), 'utf8'),
);
const browser = await chromium.launch();
const checks = [];
try {
  for (const role of [
    'GERENCIA',
    'COMPRAS',
    'COMPUTO',
    'JEFE_OBRA',
    'ADMINISTRACION',
  ]) {
    const context = await browser.newContext({
        baseURL: 'http://localhost:3100',
        viewport: { width: 1440, height: 1000 },
      }),
      page = await context.newPage();
    await page.goto('/login');
    await page.getByLabel('Correo electrónico').fill(credentials[role].email);
    await page.getByLabel('Contraseña').fill(credentials[role].password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'));
    const call = async (path, method = 'GET', data) => {
      const r = await context.request.fetch('/api/v1/' + path, {
        method,
        data,
        headers: {
          Origin: 'http://localhost:3100',
          'Idempotency-Key': 'manual-catalog-' + path.replaceAll('/', '-'),
        },
      });
      expect(r.ok(), path + ' ' + r.status()).toBeTruthy();
      return (await r.json()).data;
    };
    if (['JEFE_OBRA', 'ADMINISTRACION'].includes(role)) {
      for (const path of [
        'labor-resources',
        'labor-rates?resourceId=none',
        'activity-costing/none',
      ])
        expect((await context.request.get('/api/v1/' + path)).status()).toBe(
          403,
        );
      checks.push({ role, referenceApi: '403' });
      await context.close();
      continue;
    }
    const resources = await call('labor-resources?pageSize=100');
    expect(resources.filter((r) => r.code.startsWith('CEO-')).length).toBe(78);
    if (role === 'COMPRAS') {
      expect(
        (
          await context.request.post('/api/v1/labor-resources', {
            headers: { Origin: 'http://localhost:3100' },
            data: {
              code: 'MUST-NOT-CREATE',
              name: 'Prohibido',
              unit: 'h',
              kind: 'CATEGORY',
            },
          })
        ).status(),
      ).toBe(403);
      checks.push({ role, read: true, write: '403' });
      await context.close();
      continue;
    }
    if (role === 'COMPUTO') {
      checks.push({ role, read: true });
      await context.close();
      continue;
    }
    const templates = await call('budget-templates?pageSize=100'),
      base = templates.find((t) => t.name === 'BASE CEO — Octubre 2026');
    expect(base).toBeTruthy();
    expect(base.content.lines).toHaveLength(146);
    expect(
      base.content.lines.every((l) => l.itemId && l.quantity === '0'),
    ).toBe(true);
    const works = await call('works?pageSize=100'),
      work = works.find((w) => w.code === 'MAN-OBR-1');
    expect(work).toBeTruthy();
    let marker;
    try {
      marker = JSON.parse(await readFile(join(output, 'draft.json'), 'utf8'));
    } catch {}
    if (!marker) {
      const budget = await call('budget-editor', 'POST', {
        name: 'MAN — revisión de catálogo inicial',
        workId: work.id,
        templateId: base.id,
        useReferenceCosts: true,
      });
      marker = { id: budget.id };
      await writeFile(join(output, 'draft.json'), JSON.stringify(marker), {
        mode: 0o600,
      });
    }
    const budget = await call('budget-editor/' + marker.id);
    expect(budget.draft.content.lines).toHaveLength(146);
    expect(
      budget.draft.content.lines.filter((l) => l.laborReferences?.length),
    ).toHaveLength(74);
    const linked = budget.draft.content.lines.find(
      (l) => l.laborReferences?.length === 2,
    );
    expect(linked).toBeTruthy();
    const wait = async () => {
      await page.locator('header.top').waitFor();
      await expect(page.getByText('Cargando…', { exact: true })).toHaveCount(0);
    };
    for (const width of [1440, 1280, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto('/costos');
      await wait();
      await expect(
        page.getByRole('button', { name: 'Registrar precio', exact: true }),
      ).toBeVisible();
      await expect(page.locator('.t,.mobile-cards').first()).toBeAttached();
      await page.screenshot({ path: join(output, `materiales-${width}.png`) });
      await page
        .getByRole('tab', { name: 'Mano de obra', exact: true })
        .click();
      await page.getByLabel('Buscar concepto').fill('OFICIAL');
      await expect(
        page
          .getByRole('button', { name: 'Registrar tarifa', exact: true })
          .first(),
      ).toBeVisible();
      await page.screenshot({ path: join(output, `mano-obra-${width}.png`) });
      await page.goto('/apu/' + linked.itemId);
      await wait();
      await expect(
        page.getByRole('heading', {
          name: 'Costos de referencia',
          exact: true,
        }),
      ).toBeVisible();
      await page.screenshot({ path: join(output, `actividad-${width}.png`) });
      await page
        .getByRole('button', {
          name: 'Editar referencias y mano de obra',
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('button', { name: 'Revisar cambio', exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: join(output, `composicion-${width}.png`) });
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      const calculated = page.waitForResponse(
        (r) =>
          r.url().includes(`/budget-editor/${marker.id}/calculate`) &&
          r.request().method() === 'POST',
      );
      await page.goto('/presupuestos/editor/' + marker.id);
      await expect(page.locator('.budget-line')).toHaveCount(146);
      expect((await calculated).ok()).toBe(true);
      await expect(
        page.locator('.budget-line').first().locator('b').first(),
      ).not.toHaveText('—');
      await page.screenshot({ path: join(output, `base-${width}.png`) });
      await page
        .locator('.budget-line-name')
        .first()
        .evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({
        path: join(output, `base-cantidades-${width}.png`),
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    const after = await call('budget-editor/' + marker.id);
    expect(after.draft).toEqual(budget.draft);
    expect(after.versions).toEqual(budget.versions);
    checks.push({
      role,
      baseRows: 146,
      linkedLabor: 74,
      readOnlyVisual: true,
      draftId: marker.id,
    });
    await context.close();
  }
  await writeFile(
    join(output, 'smoke.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2),
    { mode: 0o600 },
  );
  console.log(
    'Catálogo manual y perfiles verificados; evidencia privada: ' + output,
  );
} finally {
  await browser.close();
}
