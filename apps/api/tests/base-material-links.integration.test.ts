import { beforeAll, afterAll, describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closureFixture } from "./closure-fixture";
import { db } from "../src/core/db";
import { inspectCeoCatalog } from "../scripts/inspect-ceo-catalog";
import { applyCatalogInventory } from "../src/modules/catalog-load";

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "BASE: extracción y complemento de materiales con PostgreSQL",
  () => {
    let f: Awaited<ReturnType<typeof closureFixture>>, hash: string;
    beforeAll(async () => {
      f = await closureFixture();
    });
    afterAll(async () => {
      if (hash)
        await db.catalogOrigin.deleteMany({
          where: {
            source: "BASE-CEO",
            kind: "template",
            evidence: { path: ["sourceSha256"], equals: hash },
          },
        });
      await db.$disconnect();
    });
    it("recupera la carga agregada, convierte sólo lo comprobado, conserva edición y ofrece composición separada al borrador", async () => {
      const dir = await mkdtemp(join(tmpdir(), "ceo-base-links-"));
      try {
        // Sanitized workbook faithfully uses the original sheet layout and
        // formula paths. It is extracted, never inserted as a prelinked recipe.
        const book = new ExcelJS.Workbook(),
          cost = book.addWorksheet("COSTO"),
          p = book.addWorksheet("PRECIOS"),
          recipe = book.addWorksheet("RECETA");
        book.addWorksheet("MO real ");
        p.getCell("A3").value = "FUENTE MAYO 2026";
        for (const [row, name, qty, gross, unit] of [
          [5, "Producto distinto A", 25, 12500, "KG"],
          [6, "Producto distinto B", 1, 100, "M2"],
        ] as const) {
          p.getCell(`A${row}`).value = name;
          p.getCell(`B${row}`).value = qty;
          p.getCell(`C${row}`).value = unit;
          p.getCell(`E${row}`).value = gross / 2;
          p.getCell(`F${row}`).value = gross;
          p.getCell(`G${row}`).value = {
            formula: `F${row}/B${row}`,
            result: gross / qty,
          };
        }
        cost.getCell("A11").value = 14;
        cost.getCell("B11").value = "Rubro sin fusionar por número";
        for (const row of [12, 13, 14, 15, 16]) {
          cost.getCell(`B${row}`).value =
            row === 14 ? "OBRADOR Y MOVILIDAD" : "Actividad " + row;
          cost.getCell(`C${row}`).value = "M2";
          cost.getCell(`F${row}`).value = 100;
        }
        const materialRow = (
          row: number,
          price: string,
          value: number,
          coefficient: number,
          unit = "KG",
        ) => {
          recipe.getCell(`B${row}`).value = "Insumo " + row;
          recipe.getCell(`D${row}`).value = coefficient;
          recipe.getCell(`E${row}`).value = unit;
          recipe.getCell(`G${row}`).value = { formula: price, result: value };
          recipe.getCell(`I${row}`).value = {
            formula: `G${row}*D${row}`,
            result: value * coefficient,
          };
        };
        materialRow(10, "PRECIOS!G5", 500, 4);
        materialRow(11, "PRECIOS!G6", 100, 2, "M2");
        recipe.getCell("J12").value = { formula: "SUM(I9:I11)", result: 2200 }; // I9 empty is zero in SUM only.
        cost.getCell("E12").value = { formula: "RECETA!I10", result: 2000 };
        cost.getCell("E13").value = { formula: "RECETA!J12", result: 2200 };
        cost.getCell("E14").value = 300;
        materialRow(20, "PRECIOS!G7", 200, 1);
        cost.getCell("E15").value = { formula: "RECETA!I20", result: 200 };
        materialRow(30, "PRECIOS!E5/25", 250, 1);
        cost.getCell("E16").value = { formula: "RECETA!I30", result: 250 };
        const path = join(dir, "source.xlsx");
        await book.xlsx.writeFile(path);
        const source = await inspectCeoCatalog(path);
        hash = source.sourceSha256;
        expect(
          source.activities.map((a: any) => a.materialLinkage.classification),
        ).toEqual(["B", "B", "A", "C", "B"]);
        const old = structuredClone(source);
        for (const a of old.activities) delete a.materialLinkage;
        const user = await db.user.findFirstOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        });
        await applyCatalogInventory(old, hash, user);
        const origins = await db.catalogOrigin.findMany({
          where: { kind: "activity", source: "BASE-CEO" },
        });
        const id = (key: string) =>
          origins.find((o) => o.sourceKey === key)!.entityId;
        expect(
          (await f.data(`activity-costing/${id("COSTO!B12")}`)).content,
        ).toMatchObject({ materials: [], materialsIncludedInDirect: true });
        const templateOrigin = await db.catalogOrigin.findFirstOrThrow({
          where: { kind: "template", source: "BASE-CEO" },
        });
        const template = await db.budgetTemplate.findUniqueOrThrow({
          where: { id: templateOrigin.entityId },
        });
        const frozen = await f.data("budget-templates", "POST", {
          name: "Receta particular congelada",
          content: template.content,
        });
        const client = await f.data("clients", "POST", {
          code: f.tag,
          name: "Cliente sintético",
        });
        const work = await f.data("works", "POST", {
          code: f.tag,
          name: "Obra sintética",
          clientId: client.id,
        });
        const budget = await f.data("budget-editor", "POST", {
          workId: work.id,
          name: "Previo al complemento",
          templateId: template.id,
        });
        const prior = await f.data(`budget-editor/${budget.id}`);
        await db.apuItem.update({
          where: { id: id("COSTO!B16") },
          data: { name: "Edición propia protegida" },
        });
        const runs = await Promise.all([
          applyCatalogInventory(source, hash, user),
          applyCatalogInventory(source, hash, user),
        ]);
        expect(
          runs.reduce((n, r) => n + r.materialLinks.linked.length, 0),
        ).toBe(2);
        expect(
          runs.every((r) => r.conflicts.some((c) => c.key === "COSTO!B16")),
        ).toBe(true);
      expect(runs.every(r => r.conflicts.every(c => c.key === 'COSTO!B16'))).toBe(true);
        expect(await f.data(`budget-editor/${budget.id}`)).toEqual(prior);
        expect(
          (
            await db.budgetTemplate.findUniqueOrThrow({
              where: { id: frozen.id },
            })
          ).content,
        ).toEqual(template.content);
        const activity = await f.data(`activity-costing/${id("COSTO!B12")}`);
        expect(activity).toMatchObject({
          materialCost: "2000",
          directCost: "0",
          totalUnitCost: "2100",
          content: {
            materialsIncludedInDirect: false,
            taxBasis: "UNSPECIFIED",
          },
        });
        expect(activity.materials[0]).toMatchObject({
          unitPrice: "500",
          coefficient: "4",
          sourcePriceBasis: expect.any(String),
        });
        const invalid = structuredClone(activity.content);
        invalid.materials[0].sourcePriceFactor = "1.21";
        expect(
          (
            await f.call(`activity-costing/${id("COSTO!B12")}`, "PUT", {
              revision: activity.revision,
              content: invalid,
            })
          ).status,
        ).toBe(422);
        delete invalid.materials[0].sourcePriceFactor;
        delete invalid.materials[0].sourcePriceBasis;
        expect(
          (
            await f.call(`activity-costing/${id("COSTO!B12")}`, "PUT", {
              revision: activity.revision,
              content: invalid,
            })
          ).status,
        ).toBe(422);
        const review = await f.data(
          `budget-editor/${budget.id}/cost-review`,
          "POST",
          { revision: prior.draft.revision, content: prior.draft.content },
        );
        const change = review.changes.find(
          (c: any) =>
            c.kind === "COMPOSITION" && c.sourceId === id("COSTO!B12"),
        );
        expect(change).toMatchObject({
          manual: true,
          previous: "2000",
          next: "2000",
        });
        expect(review.before.totalCost).toBe(review.after.totalCost); // no opt-in
        const applied = await f.data(
          `budget-editor/${budget.id}/apply-cost-review`,
          "POST",
          {
            revision: prior.draft.revision,
            content: prior.draft.content,
            planHash: review.planHash,
            selected: [change.key],
          },
        );
        expect(
          applied.content.lines.find((l: any) => l.itemId === id("COSTO!B12")),
        ).toMatchObject({
          directUnitCost: "0",
          materialsIncludedInDirect: false,
        });
        expect(
          applied.content.lines.find((l: any) => l.itemId === id("COSTO!B13"))
            .materialsIncludedInDirect,
        ).toBe(true);
        const particular = await f.data("budget-editor", "POST", {
          workId: work.id,
          name: "Desde copia congelada",
          templateId: frozen.id,
        });
        expect(
          (await f.data(`budget-editor/${particular.id}`)).draft.content
            .lines[0].materialsIncludedInDirect,
        ).toBe(true);
      } finally {
        await rm(dir, { recursive: true });
      }
    }, 60000);
  },
);
