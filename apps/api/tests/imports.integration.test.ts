import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import { handlerImports } from "../src/modules/imports";
const enabled = process.env.RUN_INTEGRATION === "1";
const suffix = randomUUID();
let actor: { id: string; role: typeof Role.GERENCIA };
const request = (kind: string, action: string, body: unknown, key = "") =>
  new Request(`http://localhost/api/v1/imports/${kind}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
async function run(kind: string, action: string, body: unknown, key = "") {
  const response = await handlerImports(
    request(kind, action, body, key),
    actor,
    ["imports", kind, action],
  );
  return (await response!.json()).data;
}

describe.skipIf(!enabled)("importación PostgreSQL aislado", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
      !/test/i.test(target.pathname)
    )
      throw new Error("Requiere PostgreSQL local aislado test");
    actor = {
      id: (
        await db.user.create({
          data: {
            email: `imports-${suffix}@example.test`,
            name: "Importador",
            role: "GERENCIA",
            passwordHash: "no-login-test",
          },
        })
      ).id,
      role: Role.GERENCIA,
    };
  });
  it("previsualiza sin escribir, exige hash, confirma e impide duplicación entre reintentos y actores", async () => {
    const rows = [
      { externalCode: `supplier-${suffix}`, name: "Proveedor de prueba" },
    ];
    const before = await db.supplier.count();
    const preview = await run("suppliers", "preview", { rows });
    expect(preview.valid).toBe(true);
    expect(await db.supplier.count()).toBe(before);
    await expect(
      run(
        "suppliers",
        "commit",
        { rows, confirmationHash: "0".repeat(64) },
        "wrong",
      ),
    ).rejects.toMatchObject({ status: 409 });
    const committed = await run(
      "suppliers",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "same",
    );
    const replay = await run(
      "suppliers",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "same",
    );
    expect(replay).toEqual(committed);
    expect(
      await db.supplier.count({ where: { code: rows[0].externalCode } }),
    ).toBe(1);
    const repeated = await run("suppliers", "preview", { rows });
    expect(repeated.valid).toBe(false);
    expect(
      await db.auditLog.count({
        where: { actorId: actor.id, action: "IMPORT" },
      }),
    ).toBe(1);
  });
  it("archivo inválido completo no importa ninguna fila", async () => {
    const rows = [
      { externalCode: `valid-${suffix}`, name: "Válido" },
      { externalCode: `invalid-${suffix}`, name: "Inválido", email: "bad" },
    ];
    const preview = await run("suppliers", "preview", { rows });
    expect(preview.valid).toBe(false);
    await expect(
      run(
        "suppliers",
        "commit",
        { rows, confirmationHash: preview.confirmationHash },
        "invalid",
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      await db.supplier.findUnique({ where: { code: rows[0].externalCode } }),
    ).toBeNull();
  });
  it("inventario inicial ingresa una única vez y rechaza referencias inexistentes", async () => {
    const unit = await db.unit.create({
      data: { code: `unit-${suffix}`, name: "unidad" },
    });
    const material = await db.material.create({
      data: { code: `mat-${suffix}`, name: "Material", unitId: unit.id },
    });
    const location = await db.location.create({
      data: { code: `loc-${suffix}`, name: "Galpón", kind: "WAREHOUSE" },
    });
    const rows = [
      {
        externalCode: `initial-${suffix}`,
        materialCode: material.code,
        locationCode: location.code,
        quantity: "12.34567890",
        reason: "Recuento validado",
      },
    ];
    const preview = await run("initial-stock", "preview", { rows });
    expect(preview.valid).toBe(true);
    await run(
      "initial-stock",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "initial",
    );
    await run(
      "initial-stock",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "initial",
    );
    const balance = await db.stockBalance.findUniqueOrThrow({
      where: {
        materialId_locationId: {
          materialId: material.id,
          locationId: location.id,
        },
      },
    });
    expect(balance.physical.toString()).toBe("12.3456789");
    expect(
      await db.stockMovement.count({
        where: { materialId: material.id, type: "INITIAL" },
      }),
    ).toBe(1);
    expect(
      (
        await run("initial-stock", "preview", {
          rows: [
            {
              ...rows[0],
              externalCode: `unknown-${suffix}`,
              materialCode: "unknown",
            },
          ],
        })
      ).valid,
    ).toBe(false);
  });
  it("DB rechaza sobrereserva y revierte la transacción completa", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const u = await tx.unit.create({
          data: { code: `badunit-${suffix}`, name: "unidad" },
        });
        const m = await tx.material.create({
          data: { code: `badmat-${suffix}`, name: "Material", unitId: u.id },
        });
        const l = await tx.location.create({
          data: { code: `badloc-${suffix}`, name: "Patio", kind: "YARD" },
        });
        await tx.stockBalance.create({
          data: {
            materialId: m.id,
            locationId: l.id,
            physical: "1",
            reserved: "2",
          },
        });
      }),
    ).rejects.toThrow();
    expect(
      await db.unit.findUnique({ where: { code: `badunit-${suffix}` } }),
    ).toBeNull();
  });
  it("DB rechaza cantidades recibidas mayores que OC", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const u = await tx.unit.create({
          data: { code: `ocunit-${suffix}`, name: "unidad" },
        });
        const m = await tx.material.create({
          data: { code: `ocmat-${suffix}`, name: "Material", unitId: u.id },
        });
        const l = await tx.location.create({
          data: { code: `ocloc-${suffix}`, name: "Patio", kind: "YARD" },
        });
        const supplier = await tx.supplier.create({
          data: { code: `ocsupplier-${suffix}`, name: "Proveedor" },
        });
        await tx.purchaseOrder.create({
          data: {
            supplierId: supplier.id,
            destinationId: l.id,
            currency: "ARS",
            createdById: actor.id,
            lines: {
              create: {
                materialId: m.id,
                quantity: "1",
                receivedQuantity: "2",
                unitPrice: "1",
              },
            },
          },
        });
      }),
    ).rejects.toThrow();
  });
  it("DB preserva snapshot económico aunque se intente modificar directamente", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const work = await tx.work.create({
          data: { code: `snapwork-${suffix}`, name: "Obra" },
        });
        const budget = await tx.budget.create({
          data: { workId: work.id, name: "Presupuesto" },
        });
        const version = await tx.budgetVersion.create({
          data: {
            budgetId: budget.id,
            number: 1,
            currency: "ARS",
            precision: 2,
            roundingMode: "HALF_UP",
            createdById: actor.id,
            snapshot: { unitPrice: "12" },
          },
        });
        await tx.budgetVersion.update({
          where: { id: version.id },
          data: { snapshot: { unitPrice: "99" } },
        });
      }),
    ).rejects.toThrow();
  });

  it("no permite una segunda apertura con otro identificador externo ni repetir el par en un archivo", async () => {
    const row = {
      externalCode: `recount-${suffix}`,
      materialCode: `mat-${suffix}`,
      locationCode: `loc-${suffix}`,
      quantity: "8",
      reason: "Intento de segundo recuento",
    };
    const preview = await run("initial-stock", "preview", { rows: [row] });
    expect(preview.valid).toBe(false);
    expect(
      preview.errors.some((e: { message: string }) =>
        e.message.includes("ajuste"),
      ),
    ).toBe(true);
    await expect(
      run(
        "initial-stock",
        "commit",
        { rows: [row], confirmationHash: preview.confirmationHash },
        "recount",
      ),
    ).rejects.toMatchObject({ status: 422 });
    const duplicated = await run("initial-stock", "preview", {
      rows: [row, { ...row, externalCode: `other-recount-${suffix}` }],
    });
    expect(duplicated.valid).toBe(false);
    expect(
      duplicated.errors.some(
        (e: { row: number; message: string }) =>
          e.row === 2 && e.message.includes("sólo admiten una apertura"),
      ),
    ).toBe(true);
    const material = await db.material.findUniqueOrThrow({
        where: { code: row.materialCode },
      }),
      location = await db.location.findUniqueOrThrow({
        where: { code: row.locationCode },
      });
    expect(
      (
        await db.stockBalance.findUniqueOrThrow({
          where: {
            materialId_locationId: {
              materialId: material.id,
              locationId: location.id,
            },
          },
        })
      ).physical.toString(),
    ).toBe("12.3456789");
  });
  it("protege aperturas concurrentes del mismo par en importaciones diferentes", async () => {
    const unit = await db.unit.findUniqueOrThrow({
        where: { code: `unit-${suffix}` },
      }),
      location = await db.location.findUniqueOrThrow({
        where: { code: `loc-${suffix}` },
      });
    const material = await db.material.create({
      data: {
        code: `concurrent-mat-${suffix}`,
        name: "Material concurrente",
        unitId: unit.id,
      },
    });
    const one = [
      {
        externalCode: `concurrent-a-${suffix}`,
        materialCode: material.code,
        locationCode: location.code,
        quantity: "10",
        reason: "Recuento A",
      },
    ];
    const two = [
      {
        ...one[0],
        externalCode: `concurrent-b-${suffix}`,
        reason: "Recuento B",
      },
    ];
    const a = await run("initial-stock", "preview", { rows: one }),
      b = await run("initial-stock", "preview", { rows: two });
    expect(a.valid && b.valid).toBe(true);
    const outcomes = await Promise.allSettled([
      run(
        "initial-stock",
        "commit",
        { rows: one, confirmationHash: a.confirmationHash },
        "concurrent-a",
      ),
      run(
        "initial-stock",
        "commit",
        { rows: two, confirmationHash: b.confirmationHash },
        "concurrent-b",
      ),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(
      (
        await db.stockBalance.findUniqueOrThrow({
          where: {
            materialId_locationId: {
              materialId: material.id,
              locationId: location.id,
            },
          },
        })
      ).physical.toString(),
    ).toBe("10");
    expect(
      await db.stockMovement.count({ where: { materialId: material.id } }),
    ).toBe(1);
  });
  it("detecta saldo preexistente sin movimientos importados", async () => {
    const unit = await db.unit.findUniqueOrThrow({
        where: { code: `unit-${suffix}` },
      }),
      location = await db.location.findUniqueOrThrow({
        where: { code: `loc-${suffix}` },
      });
    const material = await db.material.create({
      data: {
        code: `existing-mat-${suffix}`,
        name: "Existente",
        unitId: unit.id,
      },
    });
    await db.stockBalance.create({
      data: { materialId: material.id, locationId: location.id, physical: "1" },
    });
    const preview = await run("initial-stock", "preview", {
      rows: [
        {
          externalCode: `existing-open-${suffix}`,
          materialCode: material.code,
          locationCode: location.code,
          quantity: "2",
          reason: "Recuento",
        },
      ],
    });
    expect(preview.valid).toBe(false);
  });
});
