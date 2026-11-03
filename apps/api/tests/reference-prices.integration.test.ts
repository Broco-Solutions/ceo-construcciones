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
