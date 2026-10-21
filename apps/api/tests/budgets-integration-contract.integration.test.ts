import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { type Actor } from "../src/core/auth";
import { db } from "../src/core/db";
import { handlerBudgets } from "../src/modules/budgets";

const enabled = process.env.RUN_INTEGRATION === "1";
const suffix = randomUUID();
let actor: Actor;
let chief: Actor;
let workId: string;
let itemId: string;
let materialId: string;
let unitId: string;
let categoryId: string;
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
  key?: string,
  user = actor,
) {
  return handlerBudgets(
    new Request(`http://localhost/api/v1/${path}`, {
      method,
      headers: key ? { "Idempotency-Key": key } : {},
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    user,
    path.split("/"),
  );
}
async function fixture(quantity = "2") {
  const computation = await db.computation.create({
    data: { workId, name: "Cómputo", lines: { create: { itemId, quantity } } },
    include: { lines: true },
  });
  const budget = await db.budget.create({
    data: { workId, name: "Presupuesto" },
  });
  return {
    computation,
    budget,
    input: {
      ...valuation,
      computationId: computation.id,
      prices: [{ materialId, unitPrice: "10" }],
    },
  };
}

describe.skipIf(!enabled)(
  "contratos integrados de presupuestos y cómputos",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
        !/test/i.test(target.pathname)
      )
        throw new Error("Use PostgreSQL local de prueba");
      const user = await db.user.create({
        data: {
          email: `budget-contract-${suffix}@example.test`,
          name: "Cómputo",
          role: Role.COMPUTO,
          passwordHash: "unused",
        },
      });
      actor = { id: user.id, role: user.role };
      const chiefUser = await db.user.create({
        data: {
          email: `budget-chief-contract-${suffix}@example.test`,
          name: "Jefe",
          role: Role.JEFE_OBRA,
          passwordHash: "unused",
        },
      });
      chief = { id: chiefUser.id, role: chiefUser.role };
      workId = (
        await db.work.create({ data: { code: `bc-${suffix}`, name: "Obra" } })
      ).id;
      await db.workAssignment.create({ data: { workId, userId: chief.id } });
      unitId = (
        await db.unit.create({ data: { code: `bc-${suffix}`, name: "Unidad" } })
      ).id;
      categoryId = (
        await db.category.create({
          data: { code: `bc-${suffix}`, name: "Rubro" },
        })
      ).id;
      materialId = (
        await db.material.create({
          data: { code: `bc-${suffix}`, name: "Material", unitId, categoryId },
        })
      ).id;
      itemId = (
        await db.apuItem.create({
          data: {
            name: "APU",
            categoryId,
            unitId,
            laborCost: "5",
            laborCurrency: "ARS",
            laborTaxBasis: "EXCLUDED",
            components: { create: { materialId, coefficient: "3" } },
          },
        })
      ).id;
    });
    afterAll(async () => {
      await db.$disconnect();
    });

    it("exige clave y reproduce una sola versión sin recalcular un cómputo posteriormente modificado", async () => {
      const { computation, budget, input } = await fixture();
      const path = `budgets/${budget.id}/versions`;
      await expect(call(path, "POST", input)).rejects.toMatchObject({
        status: 422,
        code: "IDEMPOTENCY_REQUIRED",
      });
      expect(
        await db.budgetVersion.count({ where: { budgetId: budget.id } }),
      ).toBe(0);
      const key = randomUUID();
      const firstResponse = await call(path, "POST", input, key);
      expect(firstResponse!.status).toBe(201);
      const first = await firstResponse!.json();
      await db.computationLine.update({
        where: { id: computation.lines[0].id },
        data: { quantity: "7" },
      });
      const replay = await call(path, "POST", input, key);
      expect(replay!.status).toBe(201);
      expect(await replay!.json()).toEqual(first);
      await expect(
        call(path, "POST", { ...input, precision: 3 }, key),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        await db.budgetVersion.count({ where: { budgetId: budget.id } }),
      ).toBe(1);
      expect(
        await db.auditLog.count({
          where: { entityId: first.data.id, action: "CREATE_VERSION" },
        }),
      ).toBe(1);
      // A different intention deliberately snapshots the new computation.
      const next = await (await call(
        path,
        "POST",
        input,
        randomUUID(),
      ))!.json();
      expect(next.data.number).toBe(2);
      expect(next.data.snapshot.lines[0].quantity).toBe("7");
      expect(
        (
          await db.budgetVersion.findUniqueOrThrow({
            where: { id: first.data.id },
          })
        ).snapshot,
      ).toEqual(first.data.snapshot);
    });
    it("serializa reintentos concurrentes idénticos y numera intenciones nuevas sin duplicar", async () => {
      const { budget, input } = await fixture();
      const path = `budgets/${budget.id}/versions`;
      const key = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 3 }, () => call(path, "POST", input, key)),
      );
      const data = await Promise.all(
        responses.map((response) => response!.json()),
      );
      expect(data[1]).toEqual(data[0]);
      expect(data[2]).toEqual(data[0]);
      await Promise.all(
        Array.from({ length: 2 }, () =>
          call(path, "POST", input, randomUUID()),
        ),
      );
      expect(
        (
          await db.budgetVersion.findMany({
            where: { budgetId: budget.id },
            orderBy: { number: "asc" },
          })
        ).map((version) => version.number),
      ).toEqual([1, 2, 3]);
    });
    it("conserva IDs de APU único y overrides previos al editar cantidades", async () => {
      const { computation, budget, input } = await fixture();
      const sourceLineId = computation.lines[0].id;
      const payload = {
        ...input,
        overrides: [{ lineId: sourceLineId, laborUnitCost: "9" }],
      };
      const before = await (await call(
        `budgets/${budget.id}/versions`,
        "POST",
        payload,
        randomUUID(),
      ))!.json();
      const updated = await (await call(
        `computations/${computation.id}`,
        "PATCH",
        { workId, name: "Editado", lines: [{ itemId, quantity: "8" }] },
      ))!.json();
      expect(updated.data.lines[0].id).toBe(sourceLineId);
      const after = await (await call(
        `budgets/${budget.id}/versions`,
        "POST",
        payload,
        randomUUID(),
      ))!.json();
      expect(after.data.snapshot.lines[0]).toMatchObject({
        sourceLineId,
        quantity: "8",
        laborUnitCost: "9",
      });
      expect(
        (
          await db.budgetVersion.findUniqueOrThrow({
            where: { id: before.data.id },
          })
        ).snapshot,
      ).toEqual(before.data.snapshot);
    });
    it("preserva renglones repetidos mediante ID explícito y rechaza IDs ajenos o repetidos atómicamente", async () => {
      const { computation } = await fixture();
      const second = await db.computationLine.create({
        data: { computationId: computation.id, itemId, quantity: "4" },
      });
      const path = `computations/${computation.id}`;
      const lines = [
        { id: second.id, itemId, quantity: "9" },
        { id: computation.lines[0].id, itemId, quantity: "6" },
      ];
      const updated = await (await call(path, "PATCH", {
        workId,
        name: "Duplicados",
        lines,
      }))!.json();
      expect(
        Object.fromEntries(
          updated.data.lines.map((line: { id: string; quantity: string }) => [
            line.id,
            line.quantity,
          ]),
        ),
      ).toEqual({ [second.id]: "9", [computation.lines[0].id]: "6" });
      const foreign = await fixture();
      await expect(
        call(path, "PATCH", {
          workId,
          name: "No persiste",
          lines: [{ ...lines[0], id: foreign.computation.lines[0].id }],
        }),
      ).rejects.toMatchObject({ status: 422, code: "INVALID_LINE" });
      await expect(
        call(path, "PATCH", {
          workId,
          name: "No persiste",
          lines: [lines[0], lines[0]],
        }),
      ).rejects.toMatchObject({ status: 422, code: "VALIDATION_ERROR" });
      const unchanged = await db.computation.findUniqueOrThrow({
        where: { id: computation.id },
        include: { lines: true },
      });
      expect(unchanged.name).toBe("Duplicados");
      expect(unchanged.lines).toHaveLength(2);
    });
    it("enriquece materiales necesarios sin filtrar economía y conserva autorización actual de obra", async () => {
      const { budget, input } = await fixture();
      const version = await (await call(
        `budgets/${budget.id}/versions`,
        "POST",
        input,
        randomUUID(),
      ))!.json();
      const path = `budget-versions/${version.data.id}/materials`;
      const result = await (await call(
        path,
        "GET",
        undefined,
        undefined,
        chief,
      ))!.json();
      expect(result.data.materials[0]).toMatchObject({
        materialId,
        unitId,
        quantity: "6",
        material: { id: materialId, code: `bc-${suffix}`, name: "Material" },
        unit: { id: unitId, code: `bc-${suffix}`, name: "Unidad" },
      });
      expect(result.data.materialsByCategory[0]).toMatchObject({
        categoryId,
        category: { id: categoryId, code: `bc-${suffix}`, name: "Rubro" },
      });
      expect(JSON.stringify(result)).not.toMatch(
        /snapshot|unitPrice|laborCost|materialCost|totalCost|passwordHash/,
      );
      await db.workAssignment.delete({
        where: { userId_workId: { workId, userId: chief.id } },
      });
      await expect(
        call(path, "GET", undefined, undefined, chief),
      ).rejects.toMatchObject({ status: 403 });
    });
  },
);
