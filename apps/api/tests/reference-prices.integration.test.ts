import { beforeAll, afterAll, describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";
let f: Awaited<ReturnType<typeof closureFixture>>,
  material: string,
  code: string,
  unit: string,
  suppliers: { id: string; code: string }[],
  rows: Record<string, string>[];
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "F5: referencias e importación Excel con PostgreSQL",
  () => {
    beforeAll(async () => {
      f = await closureFixture();
      const u = await db.unit.create({
        data: {
          code: `prices-${f.tag}`,
          name: "Unidad de precios",
          symbol: "kg",
        },
      });
      unit = u.id;
      code = `prices-${f.tag}`;
      material = (
        await db.material.create({
          data: { code, name: "Material sintético", unitId: unit },
        })
      ).id;
      suppliers = await Promise.all(
        [1, 2, 3].map((n) =>
          db.supplier.create({
            data: { code: `s${n}-${f.tag}`, name: `Corralón sintético ${n}` },
          }),
        ),
      );
    });
    afterAll(() => db.$disconnect());
    it("T22–24: historia, futuro, cero, faltantes, presentaciones y empates comparables", async () => {
      for (const s of suppliers.slice(0, 2))
        await f.data("prices", "POST", {
          materialId: material,
          supplierId: s.id,
          price: "10",
          baseQuantity: "1",
          currency: "ARS",
          taxBasis: "EXCLUDED",
          effectiveAt: "2020-01-01T00:00:00Z",
        });
      await f.data("prices", "POST", {
        materialId: material,
        supplierId: suppliers[0].id,
        price: "1",
        baseQuantity: "1",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        effectiveAt: "2099-01-01T00:00:00Z",
      });
      const query = `price-comparison?materialId=${material}&supplierIds=${suppliers.map((s) => s.id).join(",")}`;
      let c = await f.data(query);
      expect(
        c.candidates.filter((x: { lowest: boolean }) => x.lowest),
      ).toHaveLength(2);
      expect(
        c.candidates.find((x: { price: unknown }) => !x.price).normalizedPrice,
      ).toBeNull();
      await f.data("prices", "POST", {
        materialId: material,
        supplierId: suppliers[2].id,
        price: "0",
        baseQuantity: "1",
        currency: "ARS",
        taxBasis: "INCLUDED",
        effectiveAt: "2021-01-01T00:00:00Z",
      });
      c = await f.data(query);
      expect(
        c.candidates.find(
          (x: { supplier: { id: string } }) =>
            x.supplier.id === suppliers[2].id,
        ).normalizedPrice,
      ).toBe("0");
      expect(
        await db.materialPrice.count({ where: { materialId: material } }),
      ).toBe(4);
      await f.data(`price-review/${suppliers[0].id}`, "POST");
      expect(
        await db.materialPrice.count({ where: { materialId: material } }),
      ).toBe(4);
      c = await f.data(query);
      expect(
        c.candidates.find(
          (x: { supplier: { id: string } }) =>
            x.supplier.id === suppliers[0].id,
        ).reviewDue,
      ).toBe(false);
      const p = await db.presentation.create({
        data: {
          materialId: material,
          supplierId: suppliers[0].id,
          name: "Bolsa",
          baseQuantity: "25",
        },
      });
      const mapping = await f.data("price-mapping", "POST", {
        supplierId: suppliers[0].id,
        source: "bolsas",
        columns: { materialCode: 0, unit: 1, price: 2, presentationId: 3 },
        rows: [[code, "Bolsa", "250", p.id]],
        currency: "ARS",
        taxBasis: "EXCLUDED",
        effectiveAt: "2022-01-01T00:00:00Z",
      });
      expect(mapping.errors).toEqual([]);
      expect(mapping.rows[0].baseQuantity).toBe("25");
      expect(mapping.rows[0].presentationId).toBe(p.id);
    });
    it("T25–28: XLSX real, hojas/columnas reordenadas, revisión sin escritura y commit atómico idempotente", async () => {
      const book = new ExcelJS.Workbook();
      book.addWorksheet("Notas").addRow(["No importar"]);
      const sheet = book.addWorksheet("Lista");
      sheet.addRow(["Valor local", "Unidad", "Código"]);
      sheet.addRow(["1.234,56", "kg", code]);
      const file = await f.data(
        "price-files",
        "POST",
        {
          name: "lista.xlsx",
          base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
        },
        undefined,
        "COMPRAS",
      );
      expect(file.sheets.map((s: { name: string }) => s.name)).toEqual([
        "Notas",
        "Lista",
      ]);
      const mapped = await f.data(
        "price-mapping",
        "POST",
        {
          supplierId: suppliers[0].id,
          source: "lista-real-test",
          columns: { price: 0, unit: 1, materialCode: 2 },
          rows: file.sheets[1].rows,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          effectiveAt: "2023-01-01T00:00:00Z",
        },
        undefined,
        "COMPUTO",
      );
      expect(mapped.errors).toEqual([]);
      rows = mapped.rows;
      expect(rows[0].price).toBe("1234.56");
      const before = await db.materialPrice.count({
          where: { materialId: material },
        }),
        preview = await f.data(
          "imports/prices/preview",
          "POST",
          { rows, reviewPrices: true },
          undefined,
          "COMPRAS",
        );
      expect(preview.valid).toBe(true);
      expect(preview.normalizedRows).toEqual(rows);
      expect(preview.differences[0].previous.price).toBe("10");
      expect(
        await db.materialPrice.count({ where: { materialId: material } }),
      ).toBe(before);
      await f.data("prices", "POST", {
        materialId: material,
        supplierId: suppliers[0].id,
        price: "12",
        baseQuantity: "1",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        effectiveAt: "2022-01-01T00:00:00Z",
      });
      expect(
        (
          await f.call("imports/prices/commit", "POST", {
            rows,
            reviewPrices: true,
            confirmationHash: preview.confirmationHash,
            baselineHash: preview.baselineHash,
          })
        ).status,
      ).toBe(409);
      const next = await f.data("imports/prices/preview", "POST", {
          rows,
          reviewPrices: true,
        }),
        body = {
          rows,
          reviewPrices: true,
          confirmationHash: next.confirmationHash,
          baselineHash: next.baselineHash,
        },
        key = randomUUID();
      const results = await Promise.all([
        f.data("imports/prices/commit", "POST", body, key, "COMPUTO"),
        f.data("imports/prices/commit", "POST", body, key, "COMPUTO"),
      ]);
      expect(results[0].createdIds).toEqual(results[1].createdIds);
      expect(
        await db.materialPrice.count({ where: { materialId: material } }),
      ).toBe(before + 2);
      expect(
        (
          await f.call(
            "imports/prices/commit",
            "POST",
            { ...body, rows: [{ ...rows[0], price: "999" }] },
            key,
            "COMPUTO",
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await f.call(
            "imports/works/preview",
            "POST",
            { rows: [{ externalCode: "X", name: "X" }] },
            undefined,
            "COMPRAS",
          )
        ).status,
      ).toBe(403);
    });
    it("T26/T28: duplicados, fórmulas y enlaces no ingresan ni se ejecutan", async () => {
      const duplicated = await f.data("imports/prices/preview", "POST", {
        rows: [
          { ...rows[0], externalCode: "dup1" },
          { ...rows[0], externalCode: "dup2" },
        ],
        reviewPrices: true,
      });
      expect(duplicated.valid).toBe(false);
      expect(duplicated.errors[0].row).toBe(2);
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet("Fórmulas");
      sheet.addRow(["Código", "Unidad", "Precio"]);
      sheet.addRow([code, "kg", { formula: "1+2", result: 3 }]);
      const file = await f.data("price-files", "POST", {
        name: "formula.xlsx",
        base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
      });
      expect(file.sheets[0].rows[0][2]).toMatch(/FÓRMULA/);
      sheet.getCell("A2").value = {
        text: code,
        hyperlink: "https://example.invalid/active",
      };
      expect(
        (
          await f.call("price-files", "POST", {
            name: "link.xlsx",
            base64: Buffer.from(await book.xlsx.writeBuffer()).toString(
              "base64",
            ),
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await f.call("price-files", "POST", {
            name: "old.xls",
            base64: "AA==",
          })
        ).status,
      ).toBe(422);
    });
  },
);

describe.skipIf(process.env.RUN_INTEGRATION !== "1")("lista oficial de precios y CSV técnico", () => {
  let fixture: Awaited<ReturnType<typeof closureFixture>>;
  beforeAll(async () => { fixture = await closureFixture(); });

  it("confirma bolsas de 25 kg históricas, conserva anteriores y admite CSV por unidad base", async () => {
    const supplier = await db.supplier.create({ data: { code: `PRV-${fixture.tag}`, name: "Proveedor sintético" } });
    const otherSupplier = await db.supplier.create({ data: { code: `OTRO-${fixture.tag}`, name: "Otro proveedor sintético" } });
    const unit = await db.unit.findUniqueOrThrow({ where: { code: "UNI-007" } });
    const setup = async (number: number, name: string) => {
      const material = await db.material.create({ data: { code: `MAT-DEMO-${number}-${fixture.tag}`, name, unitId: unit.id } });
      const presentation = await db.presentation.create({ data: {
        name: "Bolsa 25 kg", materialId: material.id, supplierId: supplier.id, baseQuantity: "25",
      } });
      const oldPrice = await db.materialPrice.create({ data: {
        materialId: material.id, presentationId: presentation.id, supplierId: supplier.id,
        price: "5000", baseQuantity: "25", currency: "ARS", taxBasis: "EXCLUDED", effectiveAt: new Date("2019-01-01"),
      } });
      return { material, presentation, oldPrice };
    };
    const cement = await setup(1, "Cemento Portland Loma Negra");
    const lime = await setup(2, "Cal hidratada extra Avellaneda");
    const book = new ExcelJS.Workbook();
    const headers = ["Código material", "Unidad", "Presentación", "Precio"];
    book.addWorksheet("Contexto").addRows([["Ejemplo"], ["Código ilustrativo"]]);
    book.addWorksheet("Datos").addRows([
      headers, [cement.material.code, "kg", "Bolsa 25 kg", 7210],
      [lime.material.code, "kg", "Bolsa 25 kg", "6629,93"],
    ]);
    const excel = await fixture.data("price-files", "POST", {
      name: "lista-oficial.xlsx", base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
    });
    const sheet = excel.sheets.find((item: { name: string }) => item.name === "Datos");
    expect(sheet.columns).toEqual(headers);
    const common = {
      supplierId: supplier.id, source: "oficial-xlsx", official: true,
      columns: { materialCode: 0, unit: 1, presentationId: 2, price: 3 },
      rows: sheet.rows, rowNumbers: sheet.rowNumbers,
      currency: "ARS", taxBasis: "EXCLUDED", effectiveAt: "2020-06-15T03:00:00.000Z",
    };
    const missingDate = await fixture.call("price-mapping", "POST", { ...common, effectiveAt: undefined });
    expect(missingDate.status).toBe(422);
    expect((await missingDate.json()).error.message).toBe("Falta indicar la fecha de vigencia.");
    const incompatible = await fixture.data("price-mapping", "POST", { ...common, supplierId: otherSupplier.id });
    expect(incompatible.errors.map(({ row }: { row: number }) => row)).toEqual([1, 2]);

    const mapped = await fixture.data("price-mapping", "POST", common);
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows.map((r: { presentationId: string }) => r.presentationId)).toEqual([cement.presentation.id, lime.presentation.id]);
    const request = { rows: mapped.rows, reviewPrices: true };
    const reviewed = await fixture.data("imports/prices/preview", "POST", request);
    expect(reviewed.valid).toBe(true);
    expect(reviewed.differences.map((d: { previous: { price: string } }) => d.previous.price)).toEqual(["5000", "5000"]);
    await db.presentation.update({ where: { id: lime.presentation.id }, data: { baseQuantity: "30" } });
    expect((await fixture.call("imports/prices/commit", "POST", {
      ...request, confirmationHash: reviewed.confirmationHash, baselineHash: reviewed.baselineHash,
    })).status).toBe(409);
    expect(await db.materialPrice.count({ where: { materialId: { in: [cement.material.id, lime.material.id] } } })).toBe(2);
    await db.presentation.update({ where: { id: lime.presentation.id }, data: { baseQuantity: "25" } });
    const fresh = await fixture.data("imports/prices/preview", "POST", request);
    await fixture.data("imports/prices/commit", "POST", {
      ...request, confirmationHash: fresh.confirmationHash, baselineHash: fresh.baselineHash,
    });
    for (const [item, value] of [[cement, "288.4"], [lime, "265.1972"]] as const) {
      const comparison = await fixture.data(`price-comparison?materialId=${item.material.id}&supplierIds=${supplier.id}`);
      expect(comparison.candidates[0].normalizedPrice).toBe(value);
      expect(await db.materialPrice.findUnique({ where: { id: item.oldPrice.id } })).toMatchObject({ id: item.oldPrice.id });
    }

    const confirmCsv = async (payload: { rows: unknown } | { csv: string }) => {
      const response = await fixture.data("imports/prices/preview", "POST", { ...payload, reviewPrices: true });
      expect(response.valid).toBe(true);
      return fixture.data("imports/prices/commit", "POST", {
        ...payload, reviewPrices: true, confirmationHash: response.confirmationHash, baselineHash: response.baselineHash,
      });
    };
    for (const delimiter of [",", ";"]) {
      const text = [headers, [cement.material.code, "kg", "", delimiter === "," ? "7210.50" : "7.210,50"]]
        .map((row) => row.join(delimiter)).join("\n");
      const file = await fixture.data("price-files", "POST", { name: "lista-oficial.csv", base64: Buffer.from(text).toString("base64") });
      const { rows, rowNumbers } = file.sheets[0];
      const normalized = await fixture.data("price-mapping", "POST", {
        ...common, rows, rowNumbers, source: `csv-${delimiter}`,
        effectiveAt: delimiter === "," ? "2020-06-16T03:00:00.000Z" : "2020-06-17T03:00:00.000Z",
      });
      expect(normalized.errors).toEqual([]);
      expect(normalized.rows[0]).toMatchObject({ baseQuantity: "1", price: "7210.50" });
      expect((await confirmCsv({ rows: normalized.rows })).importedRows).toBe(1);
    }
    const technical = [
      "externalCode,materialCode,supplierCode,price,currency,taxBasis,effectiveAt,presentationId,baseQuantity",
      `legacy-${fixture.tag},${lime.material.code},${supplier.code},7111,ARS,EXCLUDED,2020-06-18T03:00:00.000Z,,1`,
    ].join("\n");
    expect((await confirmCsv({ csv: technical })).importedRows).toBe(1);
  });
});
