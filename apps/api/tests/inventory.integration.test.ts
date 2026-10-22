import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import type { Actor } from "../src/core/auth";
import { handlerInventory } from "../src/modules/inventory";

const suffix = randomUUID();
let admin: Actor,
  chief: Actor,
  unitId: string,
  workId: string,
  foreignWorkId: string,
  warehouseId: string,
  workLocationId: string,
  foreignLocationId: string;
const materialIds: string[] = [];
async function material() {
  const row = await db.material.create({
    data: { code: `mat-${randomUUID()}`, name: "Material de prueba", unitId },
  });
  materialIds.push(row.id);
  return row.id;
}
async function call(
  data: unknown,
  key = randomUUID(),
  actor = admin,
  route = ["movements"],
  method = "POST",
) {
  const response = await handlerInventory(
    new Request(`http://localhost/api/v1/${route.join("/")}`, {
      method,
      headers: { "idempotency-key": key },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    }),
    actor,
    route,
  );
  return (await response!.json()).data;
}
async function stock(materialId: string, locationId: string) {
  return db.stockBalance.findUniqueOrThrow({
    where: { materialId_locationId: { materialId, locationId } },
  });
}
async function initial(materialId: string, quantity = "120") {
  return call({
    type: "INITIAL",
    materialId,
    quantity,
    destinationId: warehouseId,
  });
}

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "inventario PostgreSQL aislado",
  () => {
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL!);
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        !/test/i.test(url.pathname)
      )
        throw new Error("Solo PostgreSQL local aislado de pruebas");
      admin = await db.user.create({
        data: {
          email: `inv-admin-${suffix}@example.test`,
          name: "Admin prueba",
          role: Role.GERENCIA,
          passwordHash: "unused",
        },
      });
      chief = await db.user.create({
        data: {
          email: `inv-chief-${suffix}@example.test`,
          name: "Jefe prueba",
          role: Role.JEFE_OBRA,
          passwordHash: "unused",
        },
      });
      unitId = (
        await db.unit.create({ data: { code: `u-${suffix}`, name: "Unidad" } })
      ).id;
      workId = (
        await db.work.create({
          data: { code: `w-${suffix}`, name: "Obra asignada" },
        })
      ).id;
      foreignWorkId = (
        await db.work.create({
          data: { code: `f-${suffix}`, name: "Obra ajena" },
        })
      ).id;
      warehouseId = (
        await db.location.create({
          data: { code: `wh-${suffix}`, name: "Galpón", kind: "WAREHOUSE" },
        })
      ).id;
      workLocationId = (
        await db.location.create({
          data: { code: `wl-${suffix}`, name: "Obra", kind: "WORK", workId },
        })
      ).id;
      foreignLocationId = (
        await db.location.create({
          data: {
            code: `fl-${suffix}`,
            name: "Ajena",
            kind: "WORK",
            workId: foreignWorkId,
          },
        })
      ).id;
      await db.workAssignment.create({ data: { userId: chief.id, workId } });
    });
    afterAll(async () => {
      if (!admin) return;
      await db.auditLog.deleteMany({
        where: { actorId: { in: [admin.id, chief.id] } },
      });
      await db.idempotencyRecord.deleteMany({
        where: { actorId: { in: [admin.id, chief.id] } },
      });
      await db.stockMovement.deleteMany({
        where: { materialId: { in: materialIds } },
      });
      await db.reservation.deleteMany({
        where: { materialId: { in: materialIds } },
      });
      await db.stockBalance.deleteMany({
        where: { materialId: { in: materialIds } },
      });
      await db.material.deleteMany({ where: { id: { in: materialIds } } });
      await db.location.deleteMany({
        where: { id: { in: [warehouseId, workLocationId, foreignLocationId] } },
      });
      await db.workAssignment.deleteMany({ where: { userId: chief.id } });
      await db.work.deleteMany({
        where: { id: { in: [workId, foreignWorkId] } },
      });
      await db.unit.delete({ where: { id: unitId } });
      await db.user.deleteMany({ where: { id: { in: [admin.id, chief.id] } } });
      await db.$disconnect();
    });
    it("reserva reduce disponible, transferencia satisface reserva y consumo descuenta una vez", async () => {
      const materialId = await material();
      await initial(materialId);
      const r = await call(
        { materialId, sourceId: warehouseId, workId, quantity: "60" },
        randomUUID(),
        admin,
        ["reservations"],
      );
      let origin = await stock(materialId, warehouseId);
      expect(origin.physical.toString()).toBe("120");
      expect(origin.reserved.toString()).toBe("60");
      const payload = {
        type: "TRANSFER",
        materialId,
        sourceId: warehouseId,
        destinationId: workLocationId,
        reservationId: r.id,
        quantity: "60",
      };
      const key = randomUUID();
      const moved = await call(payload, key);
      expect((await call(payload, key)).id).toBe(moved.id);
      origin = await stock(materialId, warehouseId);
      expect(origin.physical.toString()).toBe("60");
      expect(origin.reserved.toString()).toBe("0");
      expect(
        (await db.reservation.findUniqueOrThrow({ where: { id: r.id } }))
          .status,
      ).toBe("FULFILLED");
      const consume = {
        type: "CONSUMPTION",
        materialId,
        sourceId: workLocationId,
        quantity: "10",
      };
      const consumeKey = randomUUID();
      await Promise.all([
        call(consume, consumeKey, chief),
        call(consume, consumeKey, chief),
      ]);
      expect(
        (await stock(materialId, workLocationId)).physical.toString(),
      ).toBe("50");
      expect(
        await db.auditLog.count({
          where: { actorId: chief.id, action: "CONSUMPTION" },
        }),
      ).toBe(1);
    });
    it("reservas simultáneas no sobrepasan disponibilidad y cancelación libera solo pendiente", async () => {
      const materialId = await material();
      await initial(materialId, "100");
      const attempts = await Promise.allSettled(
        [1, 2].map(() =>
          call(
            { materialId, sourceId: warehouseId, workId, quantity: "70" },
            randomUUID(),
            admin,
            ["reservations"],
          ),
        ),
      );
      expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      const failed = attempts.find(
        (x) => x.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failed.reason.status).toBe(409);
      const r = (
        attempts.find(
          (x) => x.status === "fulfilled",
        ) as PromiseFulfilledResult<{ id: string }>
      ).value;
      await call({
        type: "TRANSFER",
        materialId,
        sourceId: warehouseId,
        destinationId: workLocationId,
        reservationId: r.id,
        quantity: "20",
      });
      await call({}, randomUUID(), admin, ["reservations", r.id, "cancel"]);
      await call({}, randomUUID(), admin, ["reservations", r.id, "cancel"]);
      const b = await stock(materialId, warehouseId);
      expect(b.physical.toString()).toBe("80");
      expect(b.reserved.toString()).toBe("0");
    });
    it("reintentos concurrentes idénticos producen un solo movimiento y claves cambiadas rechazan", async () => {
      const materialId = await material(),
        key = randomUUID(),
        payload = {
          type: "INITIAL",
          materialId,
          destinationId: warehouseId,
          quantity: "25",
        };
      const results = await Promise.all([
        call(payload, key),
        call(payload, key),
        call(payload, key),
      ]);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect((await stock(materialId, warehouseId)).physical.toString()).toBe(
        "25",
      );
      await expect(
        call({ ...payload, quantity: "30" }, key),
      ).rejects.toMatchObject({ status: 409 });
      await expect(call(payload)).rejects.toMatchObject({ status: 409 });
    });
    it("no admite stock negativo y exige motivo en ajuste; recuentos posteriores son ajustes", async () => {
      const materialId = await material();
      await initial(materialId, "10");
      await expect(
        call({
          type: "ADJUSTMENT",
          materialId,
          sourceId: warehouseId,
          quantity: "11",
          direction: "OUT",
          reason: "Corrección",
        }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        call({
          type: "ADJUSTMENT",
          materialId,
          destinationId: warehouseId,
          quantity: "3",
          direction: "IN",
        }),
      ).rejects.toMatchObject({ status: 409 });
      await call({
        type: "ADJUSTMENT",
        materialId,
        destinationId: warehouseId,
        quantity: "3",
        direction: "IN",
        reason: "Recuento verificado",
      });
      expect((await stock(materialId, warehouseId)).physical.toString()).toBe(
        "13",
      );
    });
    it("jefe no modifica stock ajeno, no ajusta y no falsea obra de consumo", async () => {
      const materialId = await material();
      await call({
        type: "INITIAL",
        materialId,
        destinationId: foreignLocationId,
        quantity: "10",
      });
      await expect(
        call(
          {
            type: "CONSUMPTION",
            materialId,
            sourceId: foreignLocationId,
            quantity: "1",
          },
          randomUUID(),
          chief,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        call(
          {
            type: "ADJUSTMENT",
            materialId,
            destinationId: workLocationId,
            quantity: "1",
            direction: "IN",
            reason: "Prueba",
          },
          randomUUID(),
          chief,
        ),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        call({
          type: "CONSUMPTION",
          materialId,
          sourceId: foreignLocationId,
          workId,
          quantity: "1",
        }),
      ).rejects.toMatchObject({ status: 409 });
      const rows = await call(undefined, randomUUID(), chief, ["stock"], "GET");
      expect(
        rows.every(
          (r: { locationId: string }) => r.locationId === workLocationId,
        ),
      ).toBe(true);
    });
    it("consumos distintos concurrentes no descuentan más del físico", async () => {
      const materialId = await material();
      await call({
        type: "INITIAL",
        materialId,
        destinationId: workLocationId,
        quantity: "10",
      });
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          call(
            {
              type: "CONSUMPTION",
              materialId,
              sourceId: workLocationId,
              quantity: "7",
            },
            randomUUID(),
            chief,
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(
        (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
          .reason.status,
      ).toBe(409);
      expect(
        (await stock(materialId, workLocationId)).physical.toString(),
      ).toBe("3");
    });
    it.each(["CONSUMPTION", "RETURN"] as const)(
      "revalida asignación de obra al repetir %s idempotente",
      async (type) => {
        const materialId = await material();
        await call({
          type: "INITIAL",
          materialId,
          destinationId: workLocationId,
          quantity: "10",
        });
        const key = randomUUID();
        const payload = {
          type,
          materialId,
          sourceId: workLocationId,
          ...(type === "RETURN" ? { destinationId: warehouseId } : {}),
          quantity: "2",
        };
        const first = await call(payload, key, chief);
        expect((await call(payload, key, chief)).id).toBe(first.id);
        await db.workAssignment.delete({
          where: { userId_workId: { userId: chief.id, workId } },
        });
        try {
          await expect(call(payload, key, chief)).rejects.toMatchObject({
            status: 403,
          });
          expect(
            (await stock(materialId, workLocationId)).physical.toString(),
          ).toBe("8");
        } finally {
          await db.workAssignment.create({ data: { userId: chief.id, workId } });
        }
        await db.location.update({
          where: { id: workLocationId },
          data: { active: false },
        });
        await db.material.update({ where: { id: materialId }, data: { active: false } });
        try {
          // Restored access permits the original response even if operational
          // conditions changed after the successful movement.
          expect((await call(payload, key, chief)).id).toBe(first.id);
        } finally {
          await db.location.update({
            where: { id: workLocationId },
            data: { active: true },
          });
          await db.material.update({ where: { id: materialId }, data: { active: true } });
        }
      },
    );
    it("devolución preserva trazabilidad de obra y mínimo alerta sobre disponible", async () => {
      const materialId = await material();
      await call({
        type: "INITIAL",
        materialId,
        destinationId: workLocationId,
        quantity: "10",
      });
      await call(
        { materialId, minimum: "8" },
        randomUUID(),
        admin,
        ["stock", workLocationId, "minimum"],
        "PUT",
      );
      const result = await call(
        {
          type: "RETURN",
          materialId,
          sourceId: workLocationId,
          destinationId: warehouseId,
          quantity: "4",
        },
        randomUUID(),
        chief,
      );
      expect(result.workId).toBe(workId);
      expect(
        (await stock(materialId, workLocationId)).physical.toString(),
      ).toBe("6");
      expect((await stock(materialId, warehouseId)).physical.toString()).toBe(
        "4",
      );
      const rows = await call(undefined, randomUUID(), chief, ["stock"], "GET");
      const row = rows.find(
        (r: { materialId: string }) => r.materialId === materialId,
      );
      expect(row.belowMinimum).toBe(true);
      expect(row.available).toBe("6");
    });
  },
);
