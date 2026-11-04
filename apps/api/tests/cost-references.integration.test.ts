import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "costos vinculados con PostgreSQL real",
  () => {
    let f: Awaited<ReturnType<typeof closureFixture>>;
    beforeAll(async () => {
      f = await closureFixture();
    });
    afterAll(() => db.$disconnect());
    it("CI-17–22: 6100 → 6500 → 6900 sin cambiar consumos ni una actividad directa", async () => {
      const unit = await db.unit.create({
        data: {
          code: "cost-u-" + f.tag,
          name: "Kilogramo sintético " + f.tag,
          symbol: "kg",
        },
      });
      const cat = await db.category.create({
        data: { code: "cost-r-" + f.tag, name: "Rubro sintético" },
      });
      const m = await f.data("materials", "POST", {
        code: "cost-m-" + f.tag,
        name: "Material de prueba",
        unitId: unit.id,
      });
      const presentation = await f.data("presentations", "POST", {
        materialId: m.id,
        name: "Bolsa 25 kg",
        baseQuantity: "25",
      });
      const price = await f.data("prices", "POST", {
        materialId: m.id,
        presentationId: presentation.id,
        price: "12500",
        baseQuantity: "25",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        source: "Serie elegida",
        effectiveAt: "2020-01-01T00:00:00Z",
      });
      const resources: { id: string }[] = [];
      const rates: { id: string }[] = [];
      for (const [name, value] of [
        ["Oficial", "10000"],
        ["Ayudante", "8000"],
      ]) {
        const resource = await f.data("labor-resources", "POST", {
          code: name + "-" + f.tag,
          name,
          unit: "h",
          kind: "CATEGORY",
        });
        resources.push(resource);
        rates.push(
          await f.data("labor-rates", "POST", {
            resourceId: resource.id,
            value,
            currency: "ARS",
            taxBasis: "EXCLUDED",
            source: "Tarifa sintética",
            series: "serie",
            effectiveAt: "2020-01-01T00:00:00Z",
            dateLabel: "2020-01-01",
            datePrecision: "DAY",
          }),
        );
      }
      const item = await f.data("apu-items", "POST", {
        name: "Actividad vinculada",
        categoryId: cat.id,
        unitId: unit.id,
        laborCost: "3600",
        directCost: "500",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [{ materialId: m.id, coefficient: "4" }],
      });
      await f.data("activity-costing/" + item.id, "PUT", {
        revision: 0,
        content: {
          currency: "ARS",
          taxBasis: "EXCLUDED",
          laborMode: "CALCULATED",
          labor: resources.map((r, i) => ({
            resourceId: r.id,
            rateId: rates[i].id,
            coefficient: "0.2",
          })),
          materials: [{ materialId: m.id, priceId: price.id }],
        },
      });
      let resolved = await f.data("activity-costing/" + item.id);
      expect(resolved.totalUnitCost).toBe("6100");
      expect(resolved.laborCost).toBe("3600");
      const directItem = await f.data("apu-items", "POST", {
        name: "MO directa independiente",
        categoryId: cat.id,
        unitId: unit.id,
        laborCost: "3600",
        directCost: "500",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [{ materialId: m.id, coefficient: "4" }],
      });
      await f.data("activity-costing/" + directItem.id, "PUT", {
        revision: 0,
        content: {
          currency: "ARS",
          taxBasis: "EXCLUDED",
          laborMode: "DIRECT",
          labor: [],
          materials: [{ materialId: m.id, priceId: price.id }],
        },
      });
      const client = await f.data("clients", "POST", {
        code: "cost-client-" + f.tag,
        name: "Cliente de referencia",
      });
      const work = await f.data("works", "POST", {
        code: "cost-work-" + f.tag,
        name: "Obra de referencia",
        clientId: client.id,
      });
      const template = await f.data("budget-templates", "POST", {
        name: "Plantilla vinculada",
        content: {
          currency: "ARS",
          taxBasis: "EXCLUDED",
          markup: "50",
          conditions: "",
          exclusions: "",
          observations: "",
          deadline: "",
          lines: [
            {
              key: "line",
              itemId: item.id,
              code: null,
              name: "Actividad vinculada",
              categoryId: cat.id,
              category: cat.name,
              unitId: unit.id,
              unit: "kg",
              quantity: "10",
              laborUnitCost: "3600",
              laborReferences: resolved.labor.map(
                (r: Record<string, unknown>) => ({
                  ...r,
                  source: r.source ?? "",
                }),
              ),
              directUnitCost: "500",
              status: "ACTIVE",
              materials: [
                {
                  materialId: m.id,
                  name: m.name,
                  unitId: unit.id,
                  unit: "kg",
                  coefficient: "4",
                  unitPrice: "500",
                  sourcePriceId: price.id,
                },
              ],
            },
          ],
        },
      });
      const budget = await f.data("budget-editor", "POST", {
        workId: work.id,
        name: "Presupuesto conectado",
        templateId: template.id,
      });
      const r1 = await f.data(`budget-editor/${budget.id}/issue`, "POST", {
        revision: 1,
      });
      expect(r1.snapshot.commercialTotal).toBe("91500.00");
      const pdf = Buffer.from(
        await (await f.call(`budget-issues/${r1.id}/pdf`)).arrayBuffer(),
      );
      await f.data("prices", "POST", {
        materialId: m.id,
        presentationId: presentation.id,
        price: "15000",
        baseQuantity: "25",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        source: "Serie elegida",
        effectiveAt: "2021-01-01T00:00:00Z",
      });
      resolved = await f.data("activity-costing/" + item.id);
      expect(resolved.totalUnitCost).toBe("6500");
      await f.data("labor-rates", "POST", {
        resourceId: resources[0].id,
        value: "12000",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        source: "Tarifa sintética",
        series: "serie",
        effectiveAt: "2021-01-01T00:00:00Z",
        dateLabel: "2021-01-01",
        datePrecision: "DAY",
      });
      resolved = await f.data("activity-costing/" + item.id);
      expect(resolved.totalUnitCost).toBe("6900");
      expect(resolved.laborCost).toBe("4000");
      expect(resolved.materials[0].coefficient).toBe("4");
      expect(
        (await f.data("activity-costing/" + directItem.id)).totalUnitCost,
      ).toBe("6500");
      const calculated = await f.data(
        `apu-items/${item.id}/calculate`,
        "POST",
        {
          currency: "ARS",
          taxBasis: "EXCLUDED",
          precision: 2,
          roundingMode: "HALF_UP",
          roundingBoundary: "EXTENDED_LINE_COMPONENTS",
          prices: [],
        },
      );
      expect(calculated.totalCost).toBe("6900.00");
      const zero = await f.data(`activity-costing/${item.id}/preview`, "POST", {
        ...resolved.content,
        labor: resolved.content.labor.map((r: Record<string, unknown>) => ({
          ...r,
          coefficient: "0",
        })),
      });
      expect(zero.laborCost).toBe("0");
      expect(
        (
          await f.call("activity-costing/" + item.id, "PUT", {
            revision: resolved.revision,
            content: { ...resolved.content, currency: "USD" },
          })
        ).status,
      ).toBe(422);
      const previousDraft = await db.budgetDraft.findUniqueOrThrow({
        where: { budgetId: budget.id },
      });
      const review = await f.data(
        `budget-editor/${budget.id}/cost-review`,
        "POST",
        { revision: previousDraft.revision, content: previousDraft.content },
      );
      expect(review.before.commercialTotal).toBe("91500.00");
      expect(review.after.commercialTotal).toBe("103500.00");
      const catalog = await f.data(`apu-items?categoryId=${cat.id}`);
      expect(
        catalog.find((row: { id: string }) => row.id === item.id).referenceCost
          .totalUnitCost,
      ).toBe("6900");
      const rejected = await f.data(
        `budget-editor/${budget.id}/cost-review`,
        "POST",
        {
          revision: previousDraft.revision,
          content: previousDraft.content,
          selected: [],
        },
      );
      expect(rejected.after.commercialTotal).toBe("91500.00");
      const materialOnly = await f.data(
        `budget-editor/${budget.id}/cost-review`,
        "POST",
        {
          revision: previousDraft.revision,
          content: previousDraft.content,
          selected: review.changes
            .filter((c: { kind: string }) => c.kind === "MATERIAL")
            .map((c: { key: string }) => c.key),
        },
      );
      expect(materialOnly.after.commercialTotal).toBe("97500.00");
      expect(materialOnly.planHash).toBe(review.planHash);
      expect(
        (
          await db.budgetDraft.findUniqueOrThrow({
            where: { budgetId: budget.id },
          })
        ).content,
      ).toEqual(previousDraft.content);
      const updated = await f.data(
        `budget-editor/${budget.id}/apply-cost-review`,
        "POST",
        {
          revision: previousDraft.revision,
          content: previousDraft.content,
          planHash: review.planHash,
          selected: review.changes.map((c: { key: string }) => c.key),
        },
      );
      expect(updated.content.lines[0].quantity).toBe("10");
      expect(updated.content.markup).toBe("50");
      expect(updated.content.lines[0].materials[0].coefficient).toBe("4");
      expect(
        await db.budgetVersion.count({ where: { budgetId: budget.id } }),
      ).toBe(1);
      const r2 = await f.data(`budget-editor/${budget.id}/issue`, "POST", {
        revision: updated.revision,
      });
      expect(r2.number).toBe(2);
      expect(r2.snapshot.commercialTotal).toBe("103500.00");
      expect(r2.snapshot.materials[0].quantity).toBe("40");
      expect(
        Buffer.from(
          await (await f.call(`budget-issues/${r1.id}/pdf`)).arrayBuffer(),
        ),
      ).toEqual(pdf);
      const copy = await f.data("budget-editor", "POST", {
        workId: work.id,
        name: "Copia de R1",
        sourceVersionId: r1.id,
      });
      const copied = await db.budgetDraft.findUniqueOrThrow({
        where: { budgetId: copy.id },
      });
      expect(
        (copied.content as { lines: { laborUnitCost: string }[] }).lines[0]
          .laborUnitCost,
      ).toBe("3600");
      expect(
        (
          await db.apuMaterial.findFirstOrThrow({ where: { itemId: item.id } })
        ).coefficient.toFixed(),
      ).toBe("4");
      expect(
        (
          await db.apuItem.findUniqueOrThrow({ where: { id: item.id } })
        ).laborCost?.toFixed(),
      ).toBe("3600");
      await f.data("labor-rates", "POST", {
        resourceId: resources[0].id,
        value: "1",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        source: "Futura",
        series: "serie",
        effectiveAt: "2099-01-01T00:00:00Z",
        dateLabel: "2099-01-01",
        datePrecision: "DAY",
      });
      const otherSupplier = await f.data("suppliers", "POST", {
        code: "cost-other-" + f.tag,
        name: "Otro canal sintético",
      });
      await f.data("prices", "POST", {
        materialId: m.id,
        supplierId: otherSupplier.id,
        presentationId: presentation.id,
        price: "1",
        baseQuantity: "25",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        source: "Otro canal",
        effectiveAt: "2022-01-01T00:00:00Z",
      });
      expect((await f.data("activity-costing/" + item.id)).totalUnitCost).toBe(
        "6900",
      );
      await f.data("labor-resources/" + resources[0].id, "PATCH", {
        active: false,
      });
      expect(
        (await f.data("activity-costing/" + item.id)).laborCost,
      ).toBeNull();
      expect(
        Buffer.from(
          await (await f.call(`budget-issues/${r1.id}/pdf`)).arrayBuffer(),
        ),
      ).toEqual(pdf);
      await f.data("labor-resources/" + resources[0].id, "PATCH", {
        active: true,
      });
      await expect(
        db.laborRate.update({
          where: { id: rates[0].id },
          data: { value: "1" },
        }),
      ).rejects.toThrow();
      for (const role of ["JEFE_OBRA", "ADMINISTRACION"] as const)
        for (const path of [
          "labor-resources",
          "labor-rates?resourceId=" + resources[0].id,
          "activity-costing/" + item.id,
        ])
          expect(
            (await f.call(path, "GET", undefined, undefined, role)).status,
          ).toBe(403);
      expect(
        (
          await f.call(
            "labor-rates",
            "POST",
            { resourceId: resources[0].id },
            undefined,
            "COMPRAS",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await f.call("activity-costing/" + item.id, "PUT", {
            revision: 0,
            content: resolved.content,
          })
        ).status,
      ).toBe(409);
      const stale = await f.data(
        `budget-editor/${budget.id}/cost-review`,
        "POST",
        { revision: updated.revision, content: updated.content },
      );
      await f.data("labor-rates", "POST", {
        resourceId: resources[0].id,
        value: "13000",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        source: "Cambio concurrente",
        series: "serie",
        effectiveAt: "2022-01-01T00:00:00Z",
        dateLabel: "2022-01-01",
        datePrecision: "DAY",
      });
      expect(
        (
          await f.call(`budget-editor/${budget.id}/apply-cost-review`, "POST", {
            revision: updated.revision,
            content: updated.content,
            planHash: stale.planHash,
            selected: [],
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await db.budgetDraft.findUniqueOrThrow({
            where: { budgetId: budget.id },
          })
        ).content,
      ).toEqual(updated.content);
      const own = structuredClone(
        (await f.data(`budget-editor/${copy.id}`)).draft.content,
      );
      own.lines[0].materials[0].coefficient = "5";
      own.lines[0].materials[0].unitPrice = "999";
      own.lines[0].materials[0].sourcePriceId = null;
      const ownSaved = await f.data(`budget-editor/${copy.id}`, "PUT", {
        revision: 1,
        content: own,
      });
      const ownReview = await f.data(
        `budget-editor/${copy.id}/cost-review`,
        "POST",
        { revision: ownSaved.revision, content: own },
      );
      const ownApplied = await f.data(
        `budget-editor/${copy.id}/apply-cost-review`,
        "POST",
        {
          revision: ownSaved.revision,
          content: own,
          planHash: ownReview.planHash,
          selected: ownReview.changes
            .filter((c: { manual: boolean }) => !c.manual)
            .map((c: { key: string }) => c.key),
        },
      );
      expect(ownApplied.content.lines[0].materials[0].coefficient).toBe("5");
      expect(ownApplied.content.lines[0].materials[0].unitPrice).toBe("999");
      expect(ownApplied.content.markup).toBe("50");
    });
    it("CI-19/23: sustituye agregado completo sólo con evidencia y confirmación, sin doble suma", async () => {
      const unit = await db.unit.create({
          data: {
            code: "aggregate-unit-" + f.tag,
            name: "Unidad de agregado sintético",
            symbol: "ag",
          },
        }),
        category = await db.category.create({
          data: {
            code: "aggregate-cat-" + f.tag,
            name: "Rubro agregado sintético",
          },
        });
      const material = await f.data("materials", "POST", {
        code: "aggregate-material-" + f.tag,
        name: "Material del agregado",
        unitId: unit.id,
      });
      const price = await f.data("prices", "POST", {
        materialId: material.id,
        price: "50",
        baseQuantity: "1",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        effectiveAt: "2020-01-01T00:00:00Z",
        source: "Composición comprobada",
      });
      const item = await f.data("apu-items", "POST", {
        name: "Agregado a sustituir",
        categoryId: category.id,
        unitId: unit.id,
        laborCost: "10",
        directCost: "100",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [{ materialId: material.id, coefficient: "2" }],
      });
      const original = {
        currency: "ARS",
        taxBasis: "EXCLUDED",
        laborMode: "DIRECT",
        labor: [],
        materials: [],
        materialsIncludedInDirect: true,
        notice: "Agregado histórico",
        materialReview: {
          status: "UNRESOLVED",
          detail: "Verificar alcance",
          evidence: "Fuente anterior",
        },
      };
      await f.data(`activity-costing/${item.id}`, "PUT", {
        revision: 0,
        content: original,
      });
      expect((await f.data(`activity-costing/${item.id}`)).totalUnitCost).toBe(
        "110",
      );
      const replacement = {
        ...original,
        materialsIncludedInDirect: false,
        materials: [{ materialId: material.id, priceId: price.id }],
        materialReview: {
          status: "VERIFIED",
          detail: "Composición completa contrastada",
          evidence:
            "Dos unidades explícitas por unidad de actividad; el agregado cubría sólo este material.",
        },
      };
      const preview = await f.data(
        `activity-costing/${item.id}/preview`,
        "POST",
        replacement,
      );
      expect(preview.totalUnitCost).toBe("110");
      expect(preview.directCost).toBe("0");
      expect(
        (
          await db.apuItem.findUniqueOrThrow({ where: { id: item.id } })
        ).directCost?.toFixed(),
      ).toBe("100");
      expect(
        (
          await f.call(`activity-costing/${item.id}`, "PUT", {
            revision: 1,
            content: replacement,
            expectedDirectCost: "99",
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await f.call(`activity-costing/${item.id}/preview`, "POST", {
            ...replacement,
            materialReview: {
              ...replacement.materialReview,
              evidence: "Confirmado",
            },
          })
        ).status,
      ).toBe(422);
      await f.data(`activity-costing/${item.id}`, "PUT", {
        revision: 1,
        content: replacement,
        expectedDirectCost: "100",
      });
      expect((await f.data(`activity-costing/${item.id}`)).totalUnitCost).toBe(
        "110",
      );
      expect(
        (
          await db.apuItem.findUniqueOrThrow({ where: { id: item.id } })
        ).directCost?.toFixed(),
      ).toBe("0");
      expect(
        (
          await db.apuMaterial.findFirstOrThrow({ where: { itemId: item.id } })
        ).coefficient.toFixed(),
      ).toBe("2");
    });
  },
);
