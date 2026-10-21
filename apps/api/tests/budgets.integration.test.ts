import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma, Role } from "@prisma/client";
import { Actor } from "../src/core/auth";
import { db } from "../src/core/db";
import { handlerBudgets } from "../src/modules/budgets";

const enabled = process.env.RUN_INTEGRATION === "1";
const suffix = randomUUID();
let actor: Actor;
let chief: Actor;
let workId: string;
let unitId: string;
let categoryId: string;
let itemId: string;
let computationId: string;
let computationLineId: string;
let budgetId: string;
let versionId: string;
let firstSnapshot: Prisma.JsonValue;
let materialIds: string[];
let priceIds: string[];

const valuation = {
  currency: "ARS",
  taxBasis: "EXCLUDED",
  precision: 2,
  roundingMode: "HALF_UP",
  roundingBoundary: "EXTENDED_LINE_COMPONENTS",
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  user = actor,
) {
  return handlerBudgets(
    new Request(`http://localhost/api/v1/${path}`, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    user,
    path.split("/"),
  );
}

describe.skipIf(!enabled)("presupuestos contra PostgreSQL aislado", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
      !/test/i.test(target.pathname)
    )
      throw new Error("Use PostgreSQL local con nombre de base test");
    actor = {
      id: (
        await db.user.create({
          data: {
            email: `budget-${suffix}@example.test`,
            name: "Cómputo de prueba",
            role: Role.GERENCIA,
            passwordHash: "not-a-real-login-hash",
          },
        })
      ).id,
      role: Role.GERENCIA,
    };
    chief = {
      id: (
        await db.user.create({
          data: {
            email: `chief-budget-${suffix}@example.test`,
            name: "Jefe de prueba",
            role: Role.JEFE_OBRA,
            passwordHash: "not-a-real-login-hash",
          },
        })
      ).id,
      role: Role.JEFE_OBRA,
    };
    workId = (
      await db.work.create({
        data: { code: `budget-${suffix}`, name: "Obra presupuesto de prueba" },
      })
    ).id;
    unitId = (
      await db.unit.create({
        data: { code: `budget-unit-${suffix}`, name: "Unidad prueba" },
      })
    ).id;
    categoryId = (
      await db.category.create({
        data: { code: `budget-cat-${suffix}`, name: "Cielorrasos" },
      })
    ).id;
    materialIds = [];
    priceIds = [];
    for (const [index, name] of ["Cemento", "Cal", "Arena"].entries()) {
      const material = await db.material.create({
        data: { code: `budget-${index}-${suffix}`, name, unitId },
      });
      materialIds.push(material.id);
      priceIds.push(
        (
          await db.materialPrice.create({
            data: {
              materialId: material.id,
              price: ["100", "3", "10"][index],
              baseQuantity: index === 0 ? "50" : "1",
              currency: "ARS",
              taxBasis: "EXCLUDED",
            },
          })
        ).id,
      );
    }
  });
  // Immutable records intentionally survive until the isolated test database is dropped.
  afterAll(async () => {
    await db.$disconnect();
  });

  it("crea APU, cómputo y versión con conversiones de presentación explícitas", async () => {
    const item = await (await call("apu-items", "POST", {
      name: "Aplicado a la cal completo",
      categoryId,
      unitId,
      laborCost: "12.5",
      laborCurrency: "ARS",
      laborTaxBasis: "EXCLUDED",
      components: materialIds.map((materialId, index) => ({
        materialId,
        coefficient: ["4.5", "6.6", "0.07"][index],
      })),
    }))!.json();
    itemId = item.data.id;
    const computation = await (await call("computations", "POST", {
      workId,
      name: "Cómputo original",
      lines: [{ itemId, quantity: "100" }],
    }))!.json();
    computationId = computation.data.id;
    computationLineId = computation.data.lines[0].id;
    const budget = await (await call("budgets", "POST", {
      workId,
      name: "Presupuesto original",
    }))!.json();
    budgetId = budget.data.id;
    const response = await call(`budgets/${budgetId}/versions`, "POST", {
      ...valuation,
      computationId,
      prices: materialIds.map((materialId, index) => ({
        materialId,
        priceId: priceIds[index],
      })),
    });
    expect(response!.status).toBe(201);
    const version = await response!.json();
    versionId = version.data.id;
    firstSnapshot = version.data.snapshot;
    expect(
      version.data.snapshot.materials.map(
        (row: { quantity: string }) => row.quantity,
      ),
    ).toEqual(["450", "660", "7"]);
    expect(version.data.snapshot.totalCost).toBe("4200.00");
    expect(version.data.snapshot.lines[0].materials[0].unitPrice).toBe("2");
  });
  it("cambios de catálogo y overrides en versión nueva no modifican histórico ni precio maestro", async () => {
    await db.materialPrice.update({
      where: { id: priceIds[0] },
      data: { price: "500" },
    });
    await db.apuMaterial.updateMany({
      where: { itemId, materialId: materialIds[0] },
      data: { coefficient: "8" },
    });
    await db.apuItem.update({
      where: { id: itemId },
      data: { laborCost: "20" },
    });
    const response = await call(`budgets/${budgetId}/versions`, "POST", {
      ...valuation,
      computationId,
      prices: materialIds.map((materialId, index) => ({
        materialId,
        priceId: priceIds[index],
      })),
      overrides: [
        {
          lineId: computationLineId,
          quantity: "50",
          laborUnitCost: "15",
          materials: [
            { materialId: materialIds[0], coefficient: "5", unitPrice: "4" },
          ],
        },
      ],
    });
    const second = await response!.json();
    expect(second.data.number).toBe(2);
    expect(second.data.snapshot.lines[0].quantity).toBe("50");
    expect(second.data.snapshot.lines[0].materials[0].quantity).toBe("250");
    expect(second.data.snapshot.lines[0].materials[0].unitPrice).toBe("4");
    expect(
      (
        await db.materialPrice.findUniqueOrThrow({ where: { id: priceIds[0] } })
      ).price.toString(),
    ).toBe("500");
    expect(
      (
        await db.apuItem.findUniqueOrThrow({ where: { id: itemId } })
      ).laborCost!.toString(),
    ).toBe("20");
    expect(
      (await db.budgetVersion.findUniqueOrThrow({ where: { id: versionId } }))
        .snapshot,
    ).toEqual(firstSnapshot);
  });
  it("rechaza precios faltantes, monedas y bases impositivas incompatibles", async () => {
    await expect(
      call(`budgets/${budgetId}/versions`, "POST", {
        ...valuation,
        computationId,
        prices: [],
      }),
    ).rejects.toMatchObject({ code: "MISSING_PRICE", status: 422 });
    await expect(
      call(`budgets/${budgetId}/versions`, "POST", {
        ...valuation,
        currency: "USD",
        computationId,
        prices: [{ materialId: materialIds[0], priceId: priceIds[0] }],
      }),
    ).rejects.toMatchObject({ code: "INCOMPARABLE_PRICE", status: 422 });
    await expect(
      call(`budgets/${budgetId}/versions`, "POST", {
        ...valuation,
        taxBasis: "INCLUDED",
        computationId,
        prices: [{ materialId: materialIds[0], priceId: priceIds[0] }],
      }),
    ).rejects.toMatchObject({ code: "INCOMPARABLE_PRICE", status: 422 });
  });
  it("rechaza conversión con redondeo implícito y acepta precio unitario explícito", async () => {
    const repeating = await db.materialPrice.create({
      data: {
        materialId: materialIds[0],
        price: "1",
        baseQuantity: "3",
        currency: "ARS",
        taxBasis: "EXCLUDED",
      },
    });
    await expect(
      call(`budgets/${budgetId}/versions`, "POST", {
        ...valuation,
        computationId,
        prices: [{ materialId: materialIds[0], priceId: repeating.id }],
      }),
    ).rejects.toMatchObject({ code: "EXPLICIT_NORMALIZED_PRICE_REQUIRED" });
    const response = await call(`apu-items/${itemId}/calculate`, "POST", {
      ...valuation,
      prices: materialIds.map((materialId, index) => ({
        materialId,
        unitPrice: index === 0 ? "0.33333333" : "1",
      })),
    });
    expect(response!.status).toBe(200);
  });
  it("protege snapshots en PostgreSQL aun ante actualización directa", async () => {
    await expect(
      db.budgetVersion.update({
        where: { id: versionId },
        data: { snapshot: {} },
      }),
    ).rejects.toThrow();
    const row = await db.budgetMaterial.findFirstOrThrow({
      where: { versionId },
    });
    await expect(
      db.budgetMaterial.update({
        where: { id: row.id },
        data: { quantity: "1" },
      }),
    ).rejects.toThrow();
    expect(
      (await db.budgetVersion.findUniqueOrThrow({ where: { id: versionId } }))
        .snapshot,
    ).toEqual(firstSnapshot);
  });
  it("jefe ve sólo cantidades de su obra y nunca snapshot económico", async () => {
    await expect(
      call(`budget-versions/${versionId}/materials`, "GET", undefined, chief),
    ).rejects.toMatchObject({ status: 403 });
    await db.workAssignment.create({ data: { workId, userId: chief.id } });
    const quantities = await (await call(
      `budget-versions/${versionId}/materials`,
      "GET",
      undefined,
      chief,
    ))!.json();
    expect(quantities.data.materials).toHaveLength(3);
    expect(JSON.stringify(quantities)).not.toMatch(
      /price|cost|snapshot|currency|taxBasis/i,
    );
    await expect(
      call(`budget-versions/${versionId}`, "GET", undefined, chief),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      call("apu-items", "GET", undefined, chief),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("selecciona referencia con auditoría y conserva snapshots", async () => {
    const response = await call(
      `budget-versions/${versionId}/reference`,
      "POST",
      {},
    );
    const result = await response!.json();
    expect(result.data.status).toBe("REFERENCE");
    expect(result.data.snapshot).toEqual(firstSnapshot);
    expect(
      await db.auditLog.count({
        where: {
          entityId: versionId,
          action: "SELECT_REFERENCE",
          actorId: actor.id,
        },
      }),
    ).toBe(1);
  });
  it("numera versiones concurrentes sin sobrescribir snapshots", async () => {
    const versions = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const response = await call(`budgets/${budgetId}/versions`, "POST", {
          ...valuation,
          computationId,
          prices: materialIds.map((materialId, index) => ({
            materialId,
            priceId: priceIds[index],
          })),
        });
        return (await response!.json()).data;
      }),
    );
    expect(new Set(versions.map((version) => version.number)).size).toBe(6);
    expect(new Set(versions.map((version) => version.id)).size).toBe(6);
    expect(
      (await db.budgetVersion.findUniqueOrThrow({ where: { id: versionId } }))
        .snapshot,
    ).toEqual(firstSnapshot);
  });
  it("persiste el producto de dos cantidades de ocho decimales sin truncar sus dieciséis decimales", async () => {
    const response = await call(`budgets/${budgetId}/versions`, "POST", {
      ...valuation,
      computationId,
      prices: materialIds.map((materialId, index) => ({
        materialId,
        priceId: priceIds[index],
      })),
      overrides: [
        {
          lineId: computationLineId,
          quantity: "0.12345678",
          materials: [
            { materialId: materialIds[0], coefficient: "0.12345678" },
          ],
        },
      ],
    });
    const version = (await response!.json()).data;
    const expected = "0.0152415765279684";
    expect(
      version.snapshot.materials.find(
        (row: { materialId: string }) => row.materialId === materialIds[0],
      ).quantity,
    ).toBe(expected);
    const stored = await db.budgetMaterial.findFirstOrThrow({
      where: { versionId: version.id, materialId: materialIds[0] },
    });
    expect(stored.quantity.toFixed()).toBe(expected);
    const historical = await db.budgetVersion.findUniqueOrThrow({
      where: { id: version.id },
    });
    const snapshot = historical.snapshot as {
      materials: { materialId: string; quantity: string }[];
    };
    expect(
      snapshot.materials.find((row) => row.materialId === materialIds[0])!
        .quantity,
    ).toBe(expected);
  });
});
