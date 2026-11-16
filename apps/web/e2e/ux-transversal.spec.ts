import { test, expect } from "@playwright/test";
import ExcelJS from "../../api/node_modules/exceljs";
import { readFile } from "node:fs/promises";
import { apiAs, login, chooseOption, uid, type Api } from "./helpers";
const tag = "UX-" + Date.now().toString(36) + "-" + uid();
let api: Api,
  clients: any[] = [],
  materials: any[] = [],
  warehouse: any,
  emptyLocation: any,
  work: any,
  destination: any;
test.beforeAll(async () => {
  api = await apiAs("GERENCIA");
  const units = await api.list("/units"),
    unit = units.data.find((u: any) => u.symbol === "kg") ?? units.data[0];
  for (let i = 0; i < 115; i++)
    clients.push(
      await api.send("POST", "/clients", {
        code: "AUTO",
        name: `${tag} · ${i === 114 ? "Árbol Ñandú" : String(i).padStart(2, "0")}`,
      }),
    );
  for (let i = 0; i < 3; i++)
    materials.push(
      await api.send("POST", "/materials", {
        code: "AUTO",
        name: `${tag} · Material ${i + 1}`,
        unitId: unit.id,
        minimum: "4",
      }),
    );
  warehouse = await api.send("POST", "/locations", {
    code: "AUTO",
    name: tag + " · Origen",
    kind: "WAREHOUSE",
  });
  emptyLocation = await api.send("POST", "/locations", {
    code: "AUTO",
    name: tag + " · Sin saldo",
    kind: "YARD",
  });
  work = await api.send("POST", "/works", {
    code: "AUTO",
    name: tag + " · Obra",
    clientId: clients[0].id,
  });
  destination = (await api.get("/works/" + work.id)).location;
});
test.afterAll(async () => api?.dispose());

test("búsqueda remota por tildes, homónimos, teclado y selector fuera de primera página", async ({
  page,
}) => {
  await login(page, "GERENCIA");
  await page.goto("/obras");
  await page.getByRole("button", { name: "Nueva obra" }).click();
  const dialog = page.getByRole("dialog"),
    client = dialog.getByLabel("Cliente principal");
  await client.fill("arbol nandu " + tag);
  const option = page
    .getByRole("option")
    .filter({ hasText: clients[114].name });
  await expect(option).toBeVisible();
  await client.press("ArrowDown");
  await client.press("Enter");
  await expect(client).toHaveAttribute("data-selected-id", clients[114].id);
  await expect(client).toHaveValue(clients[114].name);
  await client.click();
  await client.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(client).toBeFocused();
  await dialog
    .getByLabel("Nombre", { exact: true })
    .fill(tag + " · Obra desde selector");
  await dialog.getByRole("button", { name: "Crear obra" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    tag + " · Obra desde selector",
  );
  const id = page.url().split("/").pop();
  expect((await api.get("/works/" + id)).clientId).toBe(clients[114].id);
  await page.goto("/clientes");
  const search = page.getByLabel("Buscar", { exact: true });
  await search.fill("arbol nandu " + tag);
  await page.getByRole("option").filter({ hasText: clients[114].name }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clientes");
  await expect(page.locator(".t tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Limpiar campo", exact: true })
    .click();
  await expect(page.locator(".t tbody tr").first()).toBeVisible();
});

test("tres páginas: página/todos/exclusión/exportación/invalidez del filtro con IDs congelados", async ({
  page,
}) => {
  await login(page, "GERENCIA");
  await page.goto("/clientes");
  await page.getByLabel("Buscar", { exact: true }).fill(tag);
  await page.keyboard.press("Escape");
  await expect(page.locator(".selection-bar")).toContainText("115 resultados");
  const filteredDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar filtrados", exact: true }).click();
  const filteredBook = new ExcelJS.Workbook();
  await filteredBook.xlsx.load(await readFile((await (await filteredDownload).path())!) as any);
  expect(filteredBook.worksheets[0].rowCount).toBe(116);
  expect(filteredBook.worksheets[0].getColumn(2).values.slice(2).sort()).toEqual(clients.map(c => c.name).sort());
  await page.getByLabel("Seleccionar página visible").check();
  await expect(page.locator(".selection-bar")).toContainText(
    "50 seleccionados",
  );
  await page
    .getByRole("button", {
      name: "Seleccionar los 115 resultados de este filtro",
    })
    .click();
  await expect(page.locator(".selection-bar")).toContainText(
    "115 seleccionados",
  );
  await page
    .getByRole("navigation", { name: "Paginación" })
    .getByRole("button", { name: "Siguiente" })
    .click();
  await expect(page.locator(".pager")).toContainText("Página 2");
  await page
    .getByRole("navigation", { name: "Paginación" })
    .getByRole("button", { name: "Siguiente" })
    .click();
  await expect(page.locator(".pager")).toContainText("Página 3");
  const excluded = clients[114];
  await page
    .getByRole("checkbox", {
      name: "Seleccionar fila " + excluded.name,
      exact: true,
    })
    .uncheck();
  await expect(page.locator(".selection-bar")).toContainText(
    "114 seleccionados",
  );
  await api.send("POST", "/clients", {
    code: "AUTO",
    name: tag + " · Alta posterior",
  });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar seleccionados" }).click();
  const file = await downloadPromise,
    book = new ExcelJS.Workbook();
  await book.xlsx.load((await readFile((await file.path())!)) as any);
  expect(book.worksheets[0].rowCount).toBe(115);
  expect(book.worksheets[0].getColumn(2).values).not.toContain(excluded.name);
  expect(book.worksheets[0].getColumn(2).values).not.toContain(
    tag + " · Alta posterior",
  );
  await page
    .getByLabel("Buscar", { exact: true })
    .fill(tag + " cero coincidencias");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText(/La selección se limpió porque cambiaron/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exportar seleccionados" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("No hay clientes con esos filtros"),
  ).toBeVisible();
});

test("mínimos por lote: sin saldo, propio/0/herencia y conflicto conserva filas", async ({
  page,
}) => {
  await login(page, "GERENCIA");
  await page.goto("/stock?locationId=" + emptyLocation.id);
  await page
    .getByRole("button", { name: "Configurar mínimos", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await chooseOption(
    dialog.getByLabel("Ubicación para agregar materiales"),
    emptyLocation.id,
  );
  for (const m of materials)
    await chooseOption(
      dialog.getByLabel("Agregar material", { exact: true }),
      m.id,
    );
  await dialog.getByLabel(/^Nuevo mínimo fila 1/).fill("6");
  await dialog.getByLabel(/^Nuevo mínimo fila 2/).fill("0");
  await dialog
    .getByLabel("Heredar del material", { exact: true })
    .nth(2)
    .check();
  await dialog
    .getByRole("button", { name: "Revisar lote", exact: true })
    .click();
  await expect(
    dialog.getByText("2 altas · 0 cambios · 1 sin cambios"),
  ).toBeVisible();
  await api.send("PUT", `/stock/${emptyLocation.id}/minimum`, {
    materialId: materials[0].id,
    minimum: "7",
  });
  await dialog.getByRole("button", { name: "Confirmar 3 filas" }).click();
  await expect(dialog.getByRole("alert")).toContainText("cambió");
  await expect(dialog.getByLabel(/^Nuevo mínimo fila 1/)).toHaveValue("6");
  const before = await api.list("/stock?locationId=" + emptyLocation.id);
  expect(before.data).toHaveLength(1);
  expect(before.data[0].minimum).toBe("7");
  await dialog.getByRole("button", { name: "Revisar nuevamente" }).click();
  await dialog.getByRole("button", { name: "Confirmar 3 filas" }).click();
  await expect(dialog).toHaveCount(0);
  const after = await api.list("/stock?locationId=" + emptyLocation.id);
  expect(after.data).toHaveLength(2);
  expect(
    after.data.find((r: any) => r.materialId === materials[1].id).minimum,
  ).toBe("0");
  expect(
    after.data.every((r: any) => r.physical === "0" && r.reserved === "0"),
  ).toBe(true);
  expect(
    (await api.list("/movements?locationId=" + emptyLocation.id)).data,
  ).toHaveLength(0);
});

test("saldos seleccionados → transferencia multilínea con reserva; doble clic aplica una vez", async ({
  page,
}) => {
  for (const m of materials.slice(0, 2))
    await api.send(
      "POST",
      "/movements",
      {
        type: "INITIAL",
        materialId: m.id,
        destinationId: warehouse.id,
        quantity: "10",
      },
      "ux-initial-" + tag + "-" + m.id,
    );
  const reservation = await api.send(
    "POST",
    "/reservations",
    {
      materialId: materials[0].id,
      sourceId: warehouse.id,
      workId: work.id,
      quantity: "2",
    },
    "ux-reservation-" + tag,
  );
  await login(page, "GERENCIA");
  await page.goto("/stock?locationId=" + warehouse.id);
  await page
    .getByRole("checkbox", { name: "Seleccionar página visible" })
    .check();
  await expect(page.locator(".selection-bar")).toContainText("2 seleccionados");
  await page
    .getByRole("button", { name: "Movimiento multilínea", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await chooseOption(
    dialog.getByLabel("Destino", { exact: true }),
    destination.id,
  );
  await dialog.getByLabel(/^Cantidad fila 1/).fill("2");
  await dialog.getByLabel(/^Cantidad fila 2/).fill("3");
  await chooseOption(
    dialog.getByLabel("Reserva (opcional)", { exact: true }).first(),
    reservation.id,
  );
  await dialog
    .getByRole("button", { name: "Revisar lote", exact: true })
    .click();
  await expect(dialog.getByText("Revisión: 2 filas")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar 2 filas" }).dblclick();
  await expect(dialog).toHaveCount(0);
  const balances = await api.list("/stock?locationId=" + warehouse.id);
  expect(balances.data.map((r: any) => r.physical).sort()).toEqual(["7", "8"]);
  expect(balances.data.every((r: any) => r.reserved === "0")).toBe(true);
  const transfers = (
    await api.list("/movements?locationId=" + warehouse.id)
  ).data.filter((r: any) => r.type === "TRANSFER");
  expect(transfers).toHaveLength(2);
  expect(transfers[0].batchId).toBe(transfers[1].batchId);
  expect((await api.get("/reservations/" + reservation.id)).status).toBe(
    "FULFILLED",
  );
  await page.goto("/stock/movimientos?batchId=" + transfers[0].batchId);
  await expect(page.locator(".t tbody tr")).toHaveCount(2);
});

test("actividades múltiples: revisar antes de incorporar, mantener líneas trabajadas y repetición expresa", async ({
  page,
}) => {
  const categories = await api.list("/categories"),
    units = await api.list("/units");
  const category = categories.data[0],
    unit = units.data[0];
  const activities = [];
  for (const n of [1, 2])
    activities.push(
      await api.send("POST", "/apu-items", {
        name: tag + " · Actividad múltiple " + n,
        categoryId: category.id,
        unitId: unit.id,
        laborCost: "10",
        directCost: "5",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [],
      }),
    );
  const line = {
    key: crypto.randomUUID(),
    itemId: activities[0].id,
    code: activities[0].code,
    name: "Línea particular trabajada",
    categoryId: category.id,
    category: category.name,
    unitId: unit.id,
    unit: unit.symbol ?? unit.name,
    quantity: "3",
    laborUnitCost: "12",
    directUnitCost: "17",
    status: "ACTIVE",
    materials: [],
  };
  const template = await api.send("POST", "/budget-templates", {
    name: tag + " · Multiselección",
    content: {
      currency: "ARS",
      taxBasis: "EXCLUDED",
      markup: "37",
      conditions: "Condición propia",
      exclusions: "",
      observations: "",
      deadline: "",
      lines: [line],
    },
  });
  const budget = await api.send(
    "POST",
    "/budget-editor",
    {
      workId: work.id,
      name: tag + " · Presupuesto múltiple",
      templateId: template.id,
    },
    "multi-" + tag,
  );
  const before = await api.get("/budget-editor/" + budget.id);
  await login(page, "GERENCIA");
  await page.goto("/presupuestos/editor/" + budget.id);
  await page
    .getByRole("button", { name: "Agregar actividad", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Agregar actividad de obra",
  });
  for (const activity of activities)
    await chooseOption(
      dialog.getByLabel("Buscar actividad por ítem, descripción o código"),
      { label: activity.name },
    );
  await expect(page.locator(".budget-line")).toHaveCount(1);
  const add = dialog.getByRole("button", { name: "Incorporar 2 actividades" });
  await expect(add).toBeDisabled();
  await dialog
    .getByRole("checkbox", { name: /Incorporar expresamente otra línea/ })
    .check();
  await add.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".budget-line")).toHaveCount(3);
  await expect(
    page.getByLabel("Cantidad · Línea particular trabajada", { exact: true }),
  ).toHaveValue("3");
  await page
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await api.get("/budget-editor/" + budget.id)).draft.content.lines
          .length,
    )
    .toBe(3);
  const after = await api.get("/budget-editor/" + budget.id);
  expect(after.draft.content.lines[0]).toEqual(before.draft.content.lines[0]);
  expect(after.draft.content.markup).toBe("37");
  expect(after.draft.content.conditions).toBe("Condición propia");
});

test("mínimos comunes respetan la identidad de la unidad aun con el mismo símbolo", async ({
  page,
}) => {
  const unit = await api.send("POST", "/units", {
    code: "AUTO",
    name: tag + " · Unidad diferente",
    symbol: "kg",
  });
  const material = await api.send("POST", "/materials", {
    code: "AUTO",
    name: tag + " · Otra unidad",
    unitId: unit.id,
  });
  await login(page, "GERENCIA");
  await page.goto("/stock?locationId=" + emptyLocation.id);
  await page
    .getByRole("button", { name: "Configurar mínimos", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await chooseOption(
    dialog.getByLabel("Ubicación para agregar materiales"),
    emptyLocation.id,
  );
  for (const m of [materials[0], material])
    await chooseOption(
      dialog.getByLabel("Agregar material", { exact: true }),
      m.id,
    );
  const common = dialog.getByLabel(/^Valor común/);
  await expect(common).toHaveCount(2);
  await common.nth(0).fill("5");
  await common.nth(1).fill("9");
  await dialog
    .getByRole("button", { name: /Aplicar a filas de/ })
    .nth(0)
    .click();
  await expect(dialog.getByLabel(/^Nuevo mínimo fila 1/)).toHaveValue("5");
  await expect(dialog.getByLabel(/^Nuevo mínimo fila 2/)).toHaveValue("");
  await dialog
    .getByRole("button", { name: /Aplicar a filas de/ })
    .nth(1)
    .click();
  await expect(dialog.getByLabel(/^Nuevo mínimo fila 2/)).toHaveValue("9");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Seguir editando", exact: true })
    .click();
  await expect(dialog.getByLabel(/^Nuevo mínimo fila 2/)).toHaveValue("9");
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Salir sin guardar", exact: true })
    .click();
  expect(
    (await api.list("/stock?materialId=" + material.id)).data,
  ).toHaveLength(0);
});


test("filtros y Excel representativos: obras, materiales, proveedores, pedidos, OC y stock en escritorio/móvil", async ({ page }) => {
  test.setTimeout(240_000);
  const supplier = await api.send("POST", "/suppliers", { code: "AUTO", name: tag + " · Proveedor Álamo" });
  const category = (await api.list("/categories")).data[0];
  await api.send("POST", "/requests", { workId: work.id, categoryId: category.id, requiredAt: new Date(Date.now() + 86400000).toISOString(), lines: [{ materialId: materials[0].id, quantity: "1" }] });
  await api.send("POST", "/purchase-orders", { workId: work.id, supplierId: supplier.id, destinationId: destination.id, currency: "ARS", taxBasis: "UNSPECIFIED", lines: [{ materialId: materials[0].id, quantity: "1", unitPrice: "1", baseQuantity: "1" }] }, "m02-order-" + tag);
  const cases = [
    { path: "/obras", label: "Buscar", text: work.code, resource: "works", filters: { id: work.id } },
    { path: "/materiales", label: "Buscar materiales", text: materials[0].code, resource: "materials", filters: { id: materials[0].id, active: true } },
    { path: "/proveedores", label: "Buscar proveedores", text: supplier.code, resource: "suppliers", filters: { id: supplier.id, active: true } },
    { path: "/pedidos", label: "Obra", id: work.id, resource: "requests", filters: { workId: work.id } },
    { path: "/ordenes", label: "Proveedor", id: supplier.id, resource: "purchase-orders", filters: { supplierId: supplier.id } },
    { path: "/stock?locationId=" + warehouse.id, label: "Material", id: materials[0].id, resource: "stock", filters: { locationId: warehouse.id, materialId: materials[0].id } },
  ];
  await login(page, "GERENCIA");
  for (const width of [1280, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const c of cases) {
      await page.goto(c.path);
      const input = page.getByLabel(c.label, { exact: true });
      if (c.text) {
        await input.fill("  " + c.text + "  ");
        await page.getByRole("option").filter({ hasText: c.text }).first().click();
      } else await chooseOption(input, c.id!);
      await expect(page.locator(".selection-bar")).toContainText("1 resultados");
      const expected = await api.list("/" + c.resource + "?" + new URLSearchParams(Object.entries(c.filters).map(([k,v]) => [k,String(v)])));
      expect(expected.total).toBe(1);
      const scope = width < 820 ? page.locator(".mcards:visible") : page.locator(".t:visible");
      await scope.getByRole("checkbox").first().check();
      expect(new URL(page.url()).pathname).toBe(c.path.split("?")[0]);
      await expect(page.locator(".selection-bar")).toContainText("1 seleccionados");
      for (const action of ["Exportar filtrados", "Exportar seleccionados"]) {
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: action, exact: true }).click();
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(await readFile((await (await download).path())!) as any);
        expect(book.worksheets[0].rowCount).toBe(2);
        // Identidad pública de la fila: código o relaciones visibles del DTO.
        const cells = JSON.stringify(book.worksheets[0].getRow(2).values);
        expect(cells).toContain(expected.data[0].code ?? expected.data[0].supplier?.name ?? expected.data[0].material?.code ?? expected.data[0].lines?.[0]?.materialId);
      }
      await expect(page.locator(".selection-bar")).toHaveAttribute("aria-busy", "false");
      const selectedRow = scope.getByRole("checkbox", { name: /^Seleccionar fila/ }).first();
      await expect(selectedRow).toBeChecked();
      await selectedRow.uncheck();
      await expect(page.getByRole("button", { name: "Exportar seleccionados", exact: true })).toHaveCount(0);
      if (c.resource === "materials" || c.resource === "suppliers") {
        if (width < 820) await page.getByRole("button", { name: /^Filtros/ }).click();
        await page.getByLabel("Estado", { exact: true }).selectOption("no");
        await expect(page.locator(".selection-bar")).toContainText("0 resultados");
        await page.getByRole("button", { name: "Limpiar filtros", exact: true }).click();
        await expect(page.locator(".selection-bar")).toContainText("1 resultados");
      }
    }
    await page.goto("/reportes");
    await chooseOption(page.getByLabel("Obra", { exact: true }), work.id);
    await chooseOption(page.getByLabel("Material", { exact: true }), materials[0].id);
    const reportRows = page.locator(width < 820 ? ".mcards:visible .pcard" : ".t:visible tbody tr");
    await expect(reportRows).toHaveCount(1);
    await expect(reportRows).toContainText(materials[0].name);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar Excel", exact: true }).click();
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await readFile((await (await download).path())!) as any);
    expect(book.getWorksheet("Materiales")!.rowCount).toBe(2);
    expect(book.getWorksheet("Materiales")!.getRow(2).getCell(1).value).toBe(materials[0].code);
    expect(book.getWorksheet("Criterios")!.getRow(1).getCell(2).value).toBe(work.id);
  }
});

for (const [path, resource, label] of [
  ['/clientes', 'clients', 'Buscar'],
  ['/obras', 'works', 'Buscar'],
  ['/materiales', 'materials', 'Buscar materiales'],
  ['/proveedores', 'suppliers', 'Buscar proveedores'],
  ['/apu', 'apu-items', 'Buscar actividad por ítem, descripción o código'],
]) {
  test(`elegir por código y seleccionar conserva la fila tras actualizar el texto: ${resource}`, async ({ page }) => {
    const entity = (await api.list('/' + resource)).data[0];
    await login(page, 'GERENCIA');
    await page.goto(path);
    const search = page.getByLabel(label, { exact: true });
    await search.fill(entity.code);
    await page.getByRole('option').filter({ hasText: entity.code }).first().click();
    await expect(search).toHaveAttribute('data-selected-id', entity.id);
    await expect(page.locator('.selection-bar')).toContainText('1 resultados');
    const row = page.locator('.t:visible').getByRole('checkbox', { name: /^Seleccionar fila/ }).first();
    await row.check();
    await expect(page.locator('.selection-bar')).toContainText('1 seleccionados');
    await page.waitForLoadState('networkidle');
    await expect(row).toBeChecked();
    await expect(page.getByText(/La selección se limpió porque cambiaron/)).toHaveCount(0);
  });
}
