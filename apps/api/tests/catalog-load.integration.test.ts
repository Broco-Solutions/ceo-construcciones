import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { closureFixture } from "./closure-fixture";
import { db } from "../src/core/db";
import { applyCatalogInventory } from "../src/modules/catalog-load";
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "carga de catálogo transaccional",
  () => {
    let f: Awaited<ReturnType<typeof closureFixture>>;
    beforeAll(async () => {
      f = await closureFixture();
    });
    afterAll(async () => {
      // This synthetic loader fixture must not impersonate the real BASE for
      // other integration files sharing the isolated runner database.
      await db.catalogOrigin.deleteMany({
        where: {
          source: "BASE-CEO",
          kind: "template",
          sourceKey: "BASE-CEO-2026-10",
          evidence: { path: ["sourceSha256"], equals: "a".repeat(64) },
        },
      });
      await db.$disconnect();
    });
    it("CI-12–16: dos aplicaciones concurrentes, reejecución y modificación manual preservadas", async () => {
      const user = await db.user.findFirstOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        }),
        actor = { id: user.id, role: user.role };
      const input = {
        format: "ceo-catalog-inventory-v1",
        extractorVersion: 1,
        sourceSha256: "a".repeat(64),
        categories: [{ key: "test-" + f.tag, name: "Rubro importado" }],
        prices: [
          {
            key: "price-" + f.tag,
            name: "Material comprobado " + f.tag,
            unit: "kg",
            presentationQuantity: "25",
            net: "10000",
            gross: "12500",
            date: "2026-05",
            datePrecision: "MONTH",
            source: "Fuente de prueba",
            status: "HISTORICAL",
            issues: [],
            evidence: "PRECIOS!A5:G5",
          },
        ],
        labor: [],
        activities: [
          {
            key: "activity-" + f.tag,
            name: "Actividad importada",
            categoryKey: "test-" + f.tag,
            unit: "gl",
            labor: "10",
            direct: "20",
            laborComposition: {
              reconciled: false,
              components: [],
              evidence: [],
              issue: null,
            },
            materialComposition: { materials: [], warnings: [] },
          },
        ],
      };
      const before = {
        orders: await db.purchaseOrder.count(),
        works: await db.work.count(),
        stock: await db.stockMovement.count(),
      };
      const runs = await Promise.all([
        applyCatalogInventory(input, input.sourceSha256, actor),
        applyCatalogInventory(input, input.sourceSha256, actor),
      ]);
      expect(runs).toHaveLength(2);
      const importedPrices = await db.materialPrice.findMany({
        where: {
          material: {
            code: { startsWith: "CEO-M-" },
            name: "Material comprobado " + f.tag,
          },
        },
      });
      expect(
        importedPrices
          .map((p) => [p.taxBasis, p.price.toFixed(), p.baseQuantity.toFixed()])
          .sort(),
      ).toEqual([
        ["EXCLUDED", "10000", "25"],
        ["INCLUDED", "12500", "25"],
      ]);
      const mapping = await db.catalogOrigin.findUniqueOrThrow({
        where: {
          source_kind_sourceKey: {
            source: "BASE-CEO",
            kind: "activity",
            sourceKey: input.activities[0].key,
          },
        },
      });
      expect(
        await db.catalogOrigin.count({
          where: { kind: "activity", sourceKey: input.activities[0].key },
        }),
      ).toBe(1);
      await db.apuItem.update({
        where: { id: mapping.entityId },
        data: { name: "Editada por CEO" },
      });
      const repeated = await applyCatalogInventory(
        input,
        input.sourceSha256,
        actor,
      );
      expect(repeated.conflicts.some((c) => c.kind === "activity")).toBe(true);
      expect(
        (
          await db.apuItem.findUniqueOrThrow({
            where: { id: mapping.entityId },
          })
        ).name,
      ).toBe("Editada por CEO");
      expect({
        orders: await db.purchaseOrder.count(),
        works: await db.work.count(),
        stock: await db.stockMovement.count(),
      }).toEqual(before);
      const invalid = structuredClone(input);
      invalid.activities[0].categoryKey = "missing";
      invalid.activities[0].key = "rollback-" + f.tag;
      invalid.categories[0].key = "rollback-category-" + f.tag;
      await expect(
        applyCatalogInventory(invalid, input.sourceSha256, actor),
      ).rejects.toThrow();
      expect(
        await db.catalogOrigin.count({
          where: { sourceKey: "rollback-category-" + f.tag },
        }),
      ).toBe(0);
    });
    it("CI-13: reutiliza rubro anterior sólo con evidencia de instalación BASE, sin modificar la plantilla anterior", async () => {
      const user = await db.user.findFirstOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        }),
        actor = { id: user.id, role: user.role };
      const category = await db.category.create({
          data: { code: "legacy-cat-" + f.tag, name: "Rubro legado " + f.tag },
        }),
        unit = await db.unit.findFirstOrThrow({ where: { symbol: "kg" } });
      const content = {
        currency: "ARS",
        taxBasis: "UNSPECIFIED",
        markup: "50",
        conditions: "",
        exclusions: "",
        observations: "",
        deadline: "",
        lines: [
          {
            key: "legacy",
            itemId: null,
            code: "COSTO:999",
            name: "Actividad legado",
            categoryId: category.id,
            category: category.name,
            unitId: unit.id,
            unit: "kg",
            quantity: "0",
            laborUnitCost: "10",
            directUnitCost: "20",
            status: "ACTIVE",
            materials: [],
          },
        ],
      };
      const template = await db.budgetTemplate.create({
        data: { name: "BASE anterior comprobada", content },
      });
      await db.auditLog.create({
        data: {
          actorId: user.id,
          action: "INSTALL_BASE",
          entityType: "BudgetTemplate",
          entityId: template.id,
          after: { sourceSha256: "b".repeat(64) },
        },
      });
      const before = await db.category.count();
      const input = {
        format: "ceo-catalog-inventory-v1",
        extractorVersion: 1,
        sourceSha256: "b".repeat(64),
        categories: [{ key: "legacy-category-" + f.tag, name: category.name }],
        prices: [],
        labor: [],
        activities: [
          {
            key: "COSTO!B999",
            name: "Actividad legado",
            categoryKey: "legacy-category-" + f.tag,
            unit: "kg",
            labor: "10",
            direct: "20",
            laborComposition: {
              reconciled: false,
              components: [],
              evidence: [],
              issue: null,
            },
            materialComposition: { materials: [], warnings: [] },
          },
        ],
      };
      await applyCatalogInventory(input, input.sourceSha256, actor);
      const mapping = await db.catalogOrigin.findUniqueOrThrow({
        where: {
          source_kind_sourceKey: {
            source: "BASE-CEO",
            kind: "category",
            sourceKey: input.categories[0].key,
          },
        },
      });
      expect(mapping.entityId).toBe(category.id);
      expect(await db.category.count()).toBe(before);
      expect(
        (
          await db.budgetTemplate.findUniqueOrThrow({
            where: { id: template.id },
          })
        ).content,
      ).toEqual(content);
    });
    it("CI-10/12: complemento DG incorpora historia en categorías BASE sin duplicar conceptos ni reemplazar octubre", async () => {
      const user = await db.user.findFirstOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        }),
        actor = { id: user.id, role: user.role };
      const key = "dg-labor-" + f.tag;
      const base = {
        format: "ceo-catalog-inventory-v1",
        extractorVersion: 1,
        sourceSha256: "c".repeat(64),
        categories: [],
        activities: [],
        prices: [],
        labor: [
          {
            key,
            name: "Oficial histórico " + f.tag,
            unit: "h",
            kind: "CATEGORY",
            value: "9485",
            date: "2026-10",
            datePrecision: "MONTH",
            source: "BASE octubre",
            evidence: "MO real !D11",
          },
        ],
      };
      await applyCatalogInventory(base, base.sourceSha256, actor);
      const before = await db.laborResource.count();
      const dg = {
        ...base,
        sourceLogical: "DG-CEO",
        sourceSha256: "d".repeat(64),
        labor: [
          {
            ...base.labor[0],
            canonicalSourceKey: key,
            value: "9031.25",
            date: "2026-07",
            source: "DG julio",
          },
        ],
      };
      const first = await applyCatalogInventory(dg, dg.sourceSha256, actor),
        repeated = await applyCatalogInventory(dg, dg.sourceSha256, actor);
      expect(first.created["labor-rate"]).toBe(1);
      expect(repeated.created).toEqual({});
      expect(repeated.conflicts).toEqual([]);
      expect(await db.laborResource.count()).toBe(before);
      const mappings = await db.catalogOrigin.findMany({
        where: { kind: "labor-resource", sourceKey: key },
      });
      expect(new Set(mappings.map((m) => m.entityId)).size).toBe(1);
      const rates = await db.laborRate.findMany({
        where: { resourceId: mappings[0].entityId },
        orderBy: { effectiveAt: "desc" },
      });
      expect(rates.map((r) => r.value.toFixed())).toEqual(["9485", "9031.25"]);
    });
    it("CI-23: referencia de servicio recuperada corrige sólo composición propia sin editar históricos", async () => {
      const user = await db.user.findFirstOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        }),
        actor = { id: user.id, role: user.role };
      const key = "service-" + f.tag;
      const input = {
        format: "ceo-catalog-inventory-v1",
        extractorVersion: 1,
        sourceSha256: "e".repeat(64),
        categories: [{ key, name: "Rubro servicio" }],
        prices: [
          {
            key,
            name: "BAÑO QUIMICO",
            unit: "un",
            presentationQuantity: "1",
            net: "100",
            gross: "121",
            date: "2026-05",
            datePrecision: "MONTH",
            source: "Fuente",
            status: "HISTORICAL",
            issues: [],
            evidence: "PRECIOS!A189:G189",
          },
        ],
        labor: [],
        activities: [
          {
            key,
            name: "BAÑO QUIMICO",
            categoryKey: key,
            unit: "un",
            labor: "0",
            direct: "121",
            laborComposition: {
              reconciled: false,
              components: [],
              evidence: [],
              issue: null,
            },
            materialComposition: {
              materials: [
                {
                  name: "BAÑO QUIMICO",
                  unit: "un",
                  coefficient: "1",
                  unitPrice: "121",
                  cells: [key],
                  priceSourceKey: null as string | null,
                },
              ],
              warnings: [],
            },
          },
        ],
      };
      await applyCatalogInventory(input, input.sourceSha256, actor);
      const mapping = await db.catalogOrigin.findUniqueOrThrow({
        where: {
          source_kind_sourceKey: {
            source: "BASE-CEO",
            kind: "activity",
            sourceKey: key,
          },
        },
      });
      expect(
        await db.apuMaterial.count({ where: { itemId: mapping.entityId } }),
      ).toBe(1);
      const historical = await db.budgetTemplate.findMany({
        orderBy: { id: "asc" },
      });
      const changed = structuredClone(input);
      changed.activities[0].materialComposition.materials[0].priceSourceKey =
        key;
      const result = await applyCatalogInventory(
        changed,
        changed.sourceSha256,
        actor,
      );
      expect(result.correctedSourceLinks).toEqual([key]);
      expect(
        (
          await db.activityCosting.findUniqueOrThrow({
            where: { itemId: mapping.entityId },
          })
        ).revision,
      ).toBe(2);
      expect(result.conflicts.filter((c) => c.key === key)).toEqual([]);
      expect(
        await db.apuMaterial.count({ where: { itemId: mapping.entityId } }),
      ).toBe(0);
      expect(
        await db.budgetTemplate.findMany({ orderBy: { id: "asc" } }),
      ).toEqual(historical);
      const repeated = await applyCatalogInventory(
        changed,
        changed.sourceSha256,
        actor,
      );
      expect(repeated.correctedSourceLinks).toEqual([]);
      expect(repeated.conflicts.filter((c) => c.key === key)).toEqual([]);
    });
    it("CI-07/13: corrige procedencia provisional por nuevas referencias, preservando importes y sin ofrecer fechas supuestas", async () => {
      const user = await db.user.findFirstOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        }),
        actor = { id: user.id, role: user.role };
      const key = "date-" + f.tag;
      const input = {
        format: "ceo-catalog-inventory-v1",
        extractorVersion: 1,
        sourceSha256: "f".repeat(64),
        categories: [],
        activities: [],
        labor: [],
        prices: [
          {
            key,
            name: "Material fechado " + f.tag,
            unit: "kg",
            presentationQuantity: "25",
            net: "10000",
            gross: "12500",
            date: "2026-05" as string | null,
            datePrecision: "MONTH",
            source: "Encabezado provisional",
            status: "HISTORICAL",
            issues: [],
            evidence: "PRECIOS!A204:G204",
          },
        ],
      };
      await applyCatalogInventory(input, input.sourceSha256, actor);
      const mapping = await db.catalogOrigin.findUniqueOrThrow({
        where: {
          source_kind_sourceKey: {
            source: "BASE-CEO",
            kind: "material",
            sourceKey: key,
          },
        },
      });
      const original = await db.materialPrice.findMany({
        where: { materialId: mapping.entityId },
        orderBy: { id: "asc" },
      });
      const corrected = structuredClone(input);
      corrected.prices[0].date = "2025-06-12";
      corrected.prices[0].datePrecision = "DAY";
      corrected.prices[0].source = "Mini losas huecas 12-06-25";
      const result = await applyCatalogInventory(
        corrected,
        corrected.sourceSha256,
        actor,
      );
      expect(result.retiredPriceReferences).toHaveLength(2);
      expect(result.conflicts).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: "price" })]),
      );
      expect(
        await db.materialPrice.findMany({
          where: { id: { in: original.map((p) => p.id) } },
          orderBy: { id: "asc" },
        }),
      ).toEqual(original);
      const available = await f.data("prices?materialId=" + mapping.entityId);
      expect(available).toHaveLength(2);
      expect(
        available.every(
          (p: { referenceDate: string }) => p.referenceDate === "2025-06-12",
        ),
      ).toBe(true);
      expect((await f.data("prices/" + original[0].id)).referenceState).toBe(
        "REVIEW_REQUIRED",
      );
      corrected.prices[0].date = null;
      corrected.prices[0].datePrecision = "UNKNOWN";
      await applyCatalogInventory(corrected, corrected.sourceSha256, actor);
      expect(await f.data("prices?materialId=" + mapping.entityId)).toEqual([]);
      expect(
        await db.materialPrice.count({
          where: { materialId: mapping.entityId },
        }),
      ).toBe(4);
    });
  },
);
