// Recorrido completo encadenado POR LA UI sobre una obra propia de la corrida:
// Obra → APU → Cómputo → Presupuesto (versión + referencia) → Pedido (Jefe) → Cotización → OC (emisión)
// → Recepción (Jefe) → Reserva → Transferencia → Consumo (Jefe) → Devolución (Jefe) → Reporte.
// El reporte se verifica contra las cantidades realizadas, leyendo valores de la UI y de la API (sin recalcular economía).
// La API directa se usa SÓLO para PREPARACIÓN (asignación del Jefe y stock inicial de galpón) y lectura.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { apiAs, assignJefe, byCode, confirmModal, login, pickMaterial, SUFFIX, toast, type Api, type RoleKey } from './helpers';

test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const SUF = SUFFIX();
const W = { code: `JRN-${SUF}`, name: `Obra Recorrido ${SUF}` };
const APU = `Revoque recorrido ${SUF}`;
const COMP = `Cómputo recorrido ${SUF}`;
const day = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
const st: { workId?: string; locId?: string; whId?: string; requestId?: string; orderId?: string; orderNumber?: string } = {};

async function pick(select: Locator, text: string) {
  const opt = select.locator('option').filter({ hasText: text }).first();
  await expect(opt).toBeAttached();
  await select.selectOption((await opt.getAttribute('value'))!);
}
async function as(browser: Browser, role: RoleKey, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  try {
    await login(p, role);
    await fn(p);
  } finally {
    await ctx.close();
  }
}

let admin: Api;
test.beforeAll(async () => {
  admin = await apiAs('GERENCIA');
});
test.afterAll(async () => admin?.dispose());

test('recorrido completo de una obra', async ({ browser }) => {
  // 1. Obra (Gerencia)
  await as(browser, 'GERENCIA', async (p) => {
    await p.goto('/obras');
    await p.getByRole('button', { name: 'Nueva obra' }).click();
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel('Código').fill(W.code);
    await dlg.getByLabel('Nombre').fill(W.name);
    await pick(dlg.getByLabel('Responsable'), 'jefe@demo.local');
    await dlg.getByRole('button', { name: 'Crear obra' }).click();
    await toast(p, 'Obra creada');
    await p.waitForURL(/\/obras\/[^/]+$/);
    st.workId = p.url().split('/').pop()!;
  });
  // PREPARACIÓN: asignar la obra al Jefe (conserva sus obras actuales) y leer ubicaciones.
  await assignJefe(admin, st.workId!);
  st.locId = (await byCode<{ id: string; code: string }>(admin, '/locations', `OBRA-${W.code}`)).id;
  st.whId = (await byCode<{ id: string; code: string }>(admin, '/locations', 'GAL-01')).id;

  // 2. APU (Cómputo): 2 kg de cemento por m², mano de obra explícita.
  await as(browser, 'COMPUTO', async (p) => {
    await p.goto('/apu/nuevo');
    await pick(p.getByLabel('Rubro'), 'Revoques');
    await p.getByLabel('Nombre del ítem').fill(APU);
    await pick(p.getByLabel('Unidad de trabajo'), 'M2');
    await p.getByRole('button', { name: 'Agregar material' }).click();
    await pick(p.getByLabel('Material 1', { exact: true }), 'CEM-001');
    await p.getByLabel(/^Consumo/).first().fill('2');
    await p.getByLabel('Importe de mano de obra').fill('150');
    await p.getByLabel('Moneda').fill('ARS');
    await p.getByLabel('Base impositiva').selectOption({ index: 1 });
    await p.getByRole('button', { name: 'Crear APU' }).click();
    await toast(p, 'APU creado.');
    await p.waitForURL(/\/apu\/(?!nuevo)[^/]+$/);

    // 3. Cómputo: 10 m² → 20 kg previstos.
    await p.goto(`/computos/nuevo?workId=${st.workId}`);
    await p.getByLabel('Nombre').fill(COMP);
    await p.getByRole('button', { name: 'Agregar ítem' }).click();
    await pick(p.getByLabel('Ítem APU').first(), APU);
    await p.getByLabel(/^Cantidad/).first().fill('10');
    await p.getByRole('button', { name: 'Crear cómputo' }).click();
    await toast(p, 'Cómputo creado.');
    await p.waitForURL(/\/computos\/(?!nuevo)[^/]+$/);
  });

  // 4. Presupuesto con versión y referencia (Gerencia).
  await as(browser, 'GERENCIA', async (p) => {
    await p.goto(`/presupuestos/nuevo?workId=${st.workId}`);
    await p.getByLabel('Nombre').fill(`Presupuesto recorrido ${SUF}`);
    await p.getByRole('button', { name: 'Crear presupuesto' }).click();
    await p.waitForURL(/\/presupuestos\/(?!nuevo)[^/?]+\?/);
    const dlg = p.getByRole('dialog');
    await pick(dlg.getByLabel('Cómputo de origen'), COMP);
    await dlg.getByLabel('Moneda').fill('ARS');
    await dlg.getByLabel('Base impositiva').selectOption({ index: 1 });
    await dlg.getByLabel('Decimales (precisión)').selectOption({ index: 1 });
    await dlg.getByLabel('Modo de redondeo').selectOption({ index: 1 });
    await dlg.locator('select:has(option[value="manual"])').first().selectOption('manual');
    await dlg.getByLabel(/^Precio por/).first().fill('1000');
    await dlg.getByTestId('crear-version').click();
    await toast(p, 'Versión 1 creada.');
    await p.waitForURL(/\/presupuestos\/versiones\//);
    await p.getByRole('button', { name: 'Marcar como referencia' }).click();
    await confirmModal(p, 'Marcar como referencia');
    await toast(p, 'Versión 1 marcada como referencia.');
  });

  // 5. Pedido (Jefe): 20 kg de cemento, con lo previsto de la referencia a la vista.
  await as(browser, 'JEFE_OBRA', async (p) => {
    await p.goto('/pedidos/nuevo');
    await p.getByRole('button', { name: new RegExp(W.code) }).click();
    await p.getByRole('button', { name: /Revoques/ }).click();
    await expect(p.getByTestId('planned-summary')).toBeVisible();
    await p.getByLabel(/^Cantidad de Cemento portland/).fill('20');
    await p.getByRole('button', { name: 'Siguiente' }).click();
    await p.getByLabel('Fecha requerida').fill(day(10));
    await p.getByRole('button', { name: 'Siguiente' }).click();
    await p.getByRole('button', { name: 'Enviar pedido' }).click();
    await confirmModal(p, 'Enviar');
    await toast(p, 'Pedido enviado a Compras');
    await p.waitForURL(/\/pedidos\/(?!nuevo)[^/]+$/);
    st.requestId = p.url().split('/').pop()!;
  });

  // 6-7. Cotización y OC emitida (Compras).
  await as(browser, 'COMPRAS', async (p) => {
    await p.goto(`/pedidos/${st.requestId}`);
    await p.getByRole('button', { name: 'Tomar en proceso' }).click();
    await confirmModal(p, /Confirmar|Tomar en proceso/);
    await toast(p, /Pedido: En proceso/);
    await p.goto(`/cotizaciones/${st.requestId}`);
    await p.getByRole('button', { name: 'Cargar cotización' }).click();
    const dlg = p.getByRole('dialog');
    await dlg.getByLabel('Proveedor').selectOption({ label: 'Corralón Demo Sur' });
    await dlg.getByLabel('Válida hasta').fill(day(30));
    await dlg.getByLabel(/^Precio \(ARS\)/).first().fill('1000');
    await dlg.getByRole('button', { name: 'Guardar cotización' }).click();
    await toast(p, 'Cotización cargada');
    await p.getByRole('button', { name: 'Seleccionar esta oferta' }).first().click();
    await confirmModal(p, 'Confirmar');
    await toast(p, 'Cotización de Corralón Demo Sur seleccionada');
    await p.getByRole('link', { name: 'Generar OC con la seleccionada' }).click();
    await p.waitForURL(/\/ordenes\/nueva/);
    await p.getByLabel('Destino de entrega').selectOption(st.locId!);
    await p.getByRole('button', { name: 'Revisar y crear' }).click();
    await confirmModal(p, /Confirmar|Crear/);
    await toast(p, /OC-\d+ creada en borrador/);
    await p.waitForURL(/\/ordenes\/(?!nueva)[^/]+$/);
    st.orderId = p.url().split('/').pop()!;
    await expect(p.getByRole('heading', { level: 1 })).toHaveText(/^OC-\d+$/);
    st.orderNumber = (await p.getByRole('heading', { level: 1 }).innerText()).trim();
    await p.getByRole('button', { name: 'Emitir' }).click();
    await confirmModal(p, 'Emitir');
    await toast(p, `${st.orderNumber} emitida`);
    await expect(p.getByTestId('oc-total-amount')).toHaveText(/ARS 20\.000,00/);
  });

  // 8. Recepción total (Jefe) con historial nominal.
  await as(browser, 'JEFE_OBRA', async (p) => {
    await p.goto(`/recepciones/${st.orderId}`);
    await p.getByLabel('N.º de remito').fill(`RJ-${SUF}`);
    const loc = p.getByLabel('Ubicación que recibe');
    if (!(await loc.inputValue())) await loc.selectOption(st.locId!);
    await p.getByTestId('receive-all-pending').click();
    await expect(p.getByLabel(/^Cantidad recibida de Cemento portland/)).toHaveValue('20');
    await p.getByRole('button', { name: 'Revisar recepción' }).click();
    await confirmModal(p, 'Confirmar recepción');
    await toast(p, 'Recepción registrada');
    await expect(p.getByTestId('receipt-history')).toContainText('Jefe Demo');
    await expect(p.getByTestId('receipt-history')).toContainText(`RJ-${SUF}`);
  });

  // PREPARACIÓN: stock en galpón para reservar y transferir.
  await admin.send('POST', '/movements', { type: 'ADJUSTMENT', direction: 'IN', reason: `Preparación recorrido ${SUF}`, materialId: (await byCode<{ id: string; code: string }>(admin, '/materials', 'CEM-001')).id, destinationId: st.whId, quantity: '10' }, `e2e-jrn-${SUF}`);

  // 9-10. Reserva y transferencia (Compras): 5 kg galpón → obra.
  await as(browser, 'COMPRAS', async (p) => {
    await p.goto('/stock/reservas');
    await p.getByRole('button', { name: /Nueva reserva/ }).click();
    const dlg = p.getByRole('dialog');
    await pick(dlg.getByLabel('Material', { exact: true }), 'CEM-001');
    await dlg.getByLabel('Origen (galpón o patio)').selectOption(st.whId!);
    await pick(dlg.getByLabel('Obra destino'), W.code);
    await dlg.getByLabel(/^Cantidad/).fill('5');
    await dlg.getByRole('button', { name: 'Reservar' }).click();
    await toast(p, 'Reserva creada.');
    await p.goto('/stock/movimientos/nuevo?type=TRANSFER');
    await pickMaterial(p, 'CEM-001');
    await p.getByLabel('Origen', { exact: true }).selectOption(st.whId!);
    await p.getByLabel('Destino', { exact: true }).selectOption(st.locId!);
    await p.getByLabel(/^Cantidad/).fill('5');
    await pick(p.getByLabel('Satisfacer reserva (opcional)'), 'Reservado 5');
    await p.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await confirmModal(p, 'Confirmar movimiento');
    await toast(p, 'Transferencia: movimiento registrado.');
  });

  // 11-12. Consumo 8 kg y devolución 3 kg (Jefe).
  await as(browser, 'JEFE_OBRA', async (p) => {
    await p.goto('/stock/movimientos/nuevo');
    await p.getByRole('button', { name: 'Consumo en obra' }).click();
    await pickMaterial(p, 'CEM-001');
    await p.getByLabel('Obra (origen)').selectOption(st.locId!);
    await expect(p.getByText(/Saldo actual en/)).toContainText('25');
    await p.getByLabel(/^Cantidad/).fill('8');
    await p.getByLabel('Rubro (opcional)').selectOption({ label: 'Revoques' });
    await p.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await confirmModal(p, 'Confirmar movimiento');
    await toast(p, 'Consumo en obra: movimiento registrado.');
    await p.getByRole('button', { name: 'Devolución' }).click();
    await pickMaterial(p, 'CEM-001');
    await p.getByLabel('Obra (origen)').selectOption(st.locId!);
    await p.getByLabel('Devolver a (galpón o patio)').selectOption(st.whId!);
    await p.getByLabel(/^Cantidad/).fill('3');
    await p.getByRole('button', { name: 'Revisar y confirmar' }).click();
    await confirmModal(p, 'Confirmar movimiento');
    await toast(p, 'Devolución: movimiento registrado.');
    await expect(p.getByTestId('movement-created-actor')).toHaveText('Jefe Demo');
    await expect(p.getByTestId('movement-created-source')).toContainText(W.name);
  });

  // 13. Reporte (Gerencia): coherente con lo realizado.
  const rep = await admin.get<{ version: { number: number } | null; rows: Record<string, string | null>[] }>(`/reports/materials?workId=${st.workId}`);
  const row = rep.rows.find((r) => r.code === 'CEM-001')!;
  expect(rep.version?.number).toBe(1);
  const n = (v: string | null) => (v === null ? null : v.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1'));
  expect(n(row.planned)).toBe('20');
  expect(n(row.requested)).toBe('20');
  expect(n(row.purchased)).toBe('20');
  expect(n(row.received)).toBe('20');
  expect(n(row.consumed)).toBe('8');
  expect(n(row.physical)).toBe('14'); // 20 recibidos + 5 transferidos − 8 consumidos − 3 devueltos
  await as(browser, 'GERENCIA', async (p) => {
    await p.goto(`/reportes?workId=${st.workId}`);
    await expect(p.getByTestId('report-reference-version')).toContainText('versión 1');
    const tr = p.locator('#contenido table tbody tr').filter({ hasText: 'CEM-001' }).locator('visible=true');
    await expect(tr).toHaveCount(1);
    const cells = await tr.locator('td').allInnerTexts();
    // Previsto, Pedido, Comprado, Recibido, Consumido, Físico obra
    expect(cells.slice(1, 7)).toEqual(['20 KG', '20 KG', '20 KG', '20 KG', '8 KG', '14 KG']);
    await p.screenshot({ path: 'docs/evidencia/10-reporte-seguimiento.png', fullPage: true });
  });
});
