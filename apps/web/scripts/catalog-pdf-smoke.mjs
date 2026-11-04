// One explicit synthetic manual document, retained for repeatable PDF review.
import { chromium, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const state = join(homedir(), '.local/state/ceo-construcciones-codex'),
  output = join(state, 'catalog-pdf');
await mkdir(output, { recursive: true, mode: 0o700 });
const c = JSON.parse(
  await readFile(join(state, 'manual/credenciales.json'), 'utf8'),
).GERENCIA;
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
      baseURL: 'http://localhost:3100',
    }),
    page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Correo electrónico').fill(c.email);
  await page.getByLabel('Contraseña').fill(c.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const call = async (path, method = 'GET', data, key) => {
    const r = await context.request.fetch('/api/v1/' + path, {
      method,
      data,
      headers: {
        Origin: 'http://localhost:3100',
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
    });
    if (!r.ok()) throw Error(path + ' ' + r.status() + ' ' + (await r.text()));
    return (await r.json()).data;
  };
  let marker;
  try {
    marker = JSON.parse(
      await readFile(join(output, 'manual-document.json'), 'utf8'),
    );
  } catch {}
  if (!marker) {
    const categories = await call('categories?pageSize=100'),
      category = categories.find((c) => c.code === 'MAN-VARIOS');
    const units = await call('units?pageSize=100'),
      works = await call('works?pageSize=100'),
      work = works.find((w) => w.code === 'MAN-OBR-1');
    const template = await call(
      'budget-templates',
      'POST',
      {
        name: 'MAN — PDF multipágina',
        content: {
          currency: 'ARS',
          taxBasis: 'EXCLUDED',
          markup: '50',
          conditions:
            'Condiciones comerciales sintéticas. Validez de la propuesta: treinta días. '.repeat(
              12,
            ),
          exclusions:
            'Sólo las partidas indicadas expresamente como excluidas.',
          observations:
            'Documento de prueba manual. No es una cotización real.',
          deadline: 'Noventa días',
          lines: Array.from({ length: 65 }, (_, i) => {
            const unit = units.find((u) => u.symbol === (i % 2 ? 'm²' : 'm³'));
            return {
              key: 'manual-pdf-' + i,
              itemId: null,
              code: 'MAN-PDF-' + i,
              name:
                'Actividad sintética de nombre extenso para verificar saltos de línea, unidades y continuidad de página número ' +
                (i + 1),
              categoryId: category.id,
              category: category.name,
              unitId: unit.id,
              unit: unit.symbol,
              quantity: '2',
              laborUnitCost: '0',
              directUnitCost: '25',
              status:
                i % 15 === 0
                  ? 'EXCLUDED'
                  : i % 10 === 0
                    ? 'INCLUDED'
                    : 'ACTIVE',
              materials: [],
              materialReview: {
                status: 'DIRECT',
                detail: 'Servicio sintético sin materiales',
                evidence: 'Caso técnico sintético; importe directo explícito',
              },
            };
          }),
        },
      },
      'catalog-manual-pdf-template-v1',
    );
    const budget = await call(
      'budget-editor',
      'POST',
      {
        name: 'MAN — PDF multipágina',
        workId: work.id,
        templateId: template.id,
      },
      'catalog-manual-pdf-budget-v1',
    );
    const issue = await call(
      'budget-editor/' + budget.id + '/issue',
      'POST',
      { revision: 1 },
      'catalog-manual-pdf-issue-v1',
    );
    marker = { budgetId: budget.id, versionId: issue.id };
    await writeFile(
      join(output, 'manual-document.json'),
      JSON.stringify(marker),
      { mode: 0o600 },
    );
  }
  const response = await context.request.get(
    '/api/v1/budget-issues/' + marker.versionId + '/pdf',
  );
  expect(response.ok()).toBeTruthy();
  const bytes = await response.body(),
    path = join(output, 'manual-multipagina.pdf');
  try {
    expect(bytes).toEqual(await readFile(path));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await writeFile(path, bytes, { mode: 0o600 });
  console.log('PDF sintético persistido y descargado: ' + path);
} finally {
  await browser.close();
}
