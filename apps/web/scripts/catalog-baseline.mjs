// Read-only visual baseline; private credentials and images stay outside Git.
import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const state = join(homedir(), '.local/state/ceo-construcciones-codex');
const output = join(state, 'catalog-baseline');
await mkdir(output, { recursive: true, mode: 0o700 });
const credentials = JSON.parse(
  await readFile(join(state, 'manual/credenciales.json'), 'utf8'),
).GERENCIA;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ baseURL: 'http://localhost:3100' });
  await page.goto('/login');
  await page.screenshot({ path: join(output, 'login-1440.png') });
  await page.getByLabel('Correo electrónico').fill(credentials.email);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  const get = async (p) =>
    (await (await page.request.get('/api/v1/' + p)).json()).data;
  const items = await get('apu-items?pageSize=100');
  const budgets = await get('budgets?pageSize=100');
  const routes = [
    '/materiales',
    '/proveedores/precios',
    '/apu',
    '/admin/importaciones',
    '/pedidos',
    '/stock',
  ];
  if (items[0]) routes.push('/apu/' + items[0].id);
  if (budgets[0]) routes.push('/presupuestos/editor/' + budgets[0].id);
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of routes) {
      await page.goto(path);
      await page.locator('header.top').waitFor();
      await page.screenshot({
        path: join(output, path.replaceAll('/', '_') + '-' + width + '.png'),
      });
    }
    if (width === 360) {
      await page.getByRole('button', { name: 'Abrir menú' }).click();
      await page.screenshot({ path: join(output, 'menu-360.png') });
    }
  }
  console.log('Baseline privado capturado en ' + output);
} finally {
  await browser.close();
}
