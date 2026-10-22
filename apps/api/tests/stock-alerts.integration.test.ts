import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import { Actor } from "../src/core/auth";
import { handlerInventory } from "../src/modules/inventory";

const suffix = randomUUID();
let admin: Actor, chief: Actor, unitId: string;
let materialId: string,
  zeroMinimumId: string,
  precisionId: string,
  inactiveMaterialId: string;
let warehouseId: string,
  assignedLocationId: string,
  foreignLocationId: string,
  inactiveLocationId: string;
const workIds: string[] = [];
const materialIds: string[] = [];
const locationIds: string[] = [];
async function alerts(query: string, actor = admin) {
  const response = await handlerInventory(
    new Request(`http://localhost/api/v1/stock/alerts?${query}`),
    actor,
    ["stock", "alerts"],
  );
  expect(response!.status).toBe(200);
  return response!.json();
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "alertas de mínimo incluyendo existencias todavía no registradas",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
        !/test/i.test(target.pathname)
      )
        throw new Error("Sólo PostgreSQL local aislado de pruebas");
      admin = await db.user.create({
        data: {
          email: `alerts-admin-${suffix}@example.test`,
          name: "Gerencia alertas",
          role: Role.GERENCIA,
          passwordHash: "unused",
        },
      });
      chief = await db.user.create({
        data: {
          email: `alerts-chief-${suffix}@example.test`,
          name: "Jefe alertas",
          role: Role.JEFE_OBRA,
          passwordHash: "unused",
        },
      });
      unitId = (
        await db.unit.create({
          data: { code: `alerts-unit-${suffix}`, name: "Unidad" },
        })
      ).id;
      for (const [index, minimum, active] of [
        [0, "10", true],
        [1, "0", true],
        [2, "9999999999999999.12345678", true],
        [3, "10", false],
      ] as const) {
        materialIds.push(
          (
            await db.material.create({
              data: {
                code: `alerts-mat-${index}-${suffix}`,
                name: "Material alerta",
                unitId,
                minimum,
                active,
              },
            })
          ).id,
        );
      }
      [materialId, zeroMinimumId, precisionId, inactiveMaterialId] =
        materialIds;
      for (const index of [0, 1])
        workIds.push(
          (
            await db.work.create({
              data: {
                code: `alerts-work-${index}-${suffix}`,
                name: "Obra alerta",
              },
            })
          ).id,
        );
      locationIds.push(
        (
          await db.location.create({
            data: {
              code: `alerts-warehouse-${suffix}`,
              name: "Galpón alerta",
              kind: "WAREHOUSE",
            },
          })
        ).id,
      );
      for (const [index, workId] of workIds.entries())
        locationIds.push(
          (
            await db.location.create({
              data: {
                code: `alerts-location-${index}-${suffix}`,
                name: "Obra alerta",
                kind: "WORK",
                workId,
              },
            })
          ).id,
        );
      locationIds.push(
        (
          await db.location.create({
            data: {
              code: `alerts-inactive-${suffix}`,
              name: "Inactiva",
              kind: "YARD",
              active: false,
            },
          })
        ).id,
      );
      [warehouseId, assignedLocationId, foreignLocationId, inactiveLocationId] =
        locationIds;
      await db.workAssignment.create({
        data: { userId: chief.id, workId: workIds[0] },
      });
    });
    afterAll(async () => {
      if (!admin) return;
      await db.stockBalance.deleteMany({
        where: { materialId: { in: materialIds } },
      });
      await db.material.deleteMany({ where: { id: { in: materialIds } } });
      await db.location.deleteMany({ where: { id: { in: locationIds } } });
      await db.workAssignment.deleteMany({ where: { userId: chief.id } });
      await db.work.deleteMany({ where: { id: { in: workIds } } });
      await db.unit.delete({ where: { id: unitId } });
      await db.user.deleteMany({ where: { id: { in: [admin.id, chief.id] } } });
      await db.$disconnect();
    });
    it("incluye material sin saldo con físico y disponible cero sin crear registros", async () => {
      expect(await db.stockBalance.count({ where: { materialId } })).toBe(0);
      const result = await alerts(
        `materialId=${materialId}&locationId=${warehouseId}`,
      );
      expect(result.pagination.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        balanceId: null,
        materialId,
        locationId: warehouseId,
        physical: "0",
        reserved: "0",
        available: "0",
        minimum: "10",
        belowMinimum: true,
      });
      expect(await db.stockBalance.count({ where: { materialId } })).toBe(0);
      expect(JSON.stringify(result)).not.toMatch(
        /price|cost|currency|taxBasis/i,
      );
    });
    it("usa overrides locales incluyendo mínimo cero y disponible físico menos reservado", async () => {
      const balance = await db.stockBalance.create({
        data: {
          materialId,
          locationId: warehouseId,
          physical: "12",
          reserved: "3",
          minimum: "0",
        },
      });
      expect(
        (await alerts(`materialId=${materialId}&locationId=${warehouseId}`))
          .data,
      ).toEqual([]);
      await db.stockBalance.update({
        where: { id: balance.id },
        data: { minimum: null },
      });
      const result = await alerts(
        `materialId=${materialId}&locationId=${warehouseId}`,
      );
      expect(result.data[0]).toMatchObject({
        balanceId: balance.id,
        physical: "12",
        reserved: "3",
        available: "9",
        minimum: "10",
      });
      await db.stockBalance.update({
        where: { id: balance.id },
        data: { reserved: "2" },
      });
      expect(
        (await alerts(`materialId=${materialId}&locationId=${warehouseId}`))
          .data,
      ).toEqual([]);
    });
    it("respeta mínimo local positivo aunque mínimo global sea cero", async () => {
      expect(
        (await alerts(`materialId=${zeroMinimumId}&locationId=${warehouseId}`))
          .data,
      ).toEqual([]);
      await db.stockBalance.create({
        data: {
          materialId: zeroMinimumId,
          locationId: warehouseId,
          physical: "1",
          minimum: "2",
        },
      });
      expect(
        (await alerts(`materialId=${zeroMinimumId}&locationId=${warehouseId}`))
          .data[0],
      ).toMatchObject({ minimum: "2", physical: "1", available: "1" });
    });
    it("mantiene comparación y salida decimal exacta al límite de Decimal(24,8)", async () => {
      await db.stockBalance.create({
        data: {
          materialId: precisionId,
          locationId: warehouseId,
          physical: "9999999999999999.12345677",
        },
      });
      expect(
        (await alerts(`materialId=${precisionId}&locationId=${warehouseId}`))
          .data[0],
      ).toMatchObject({
        physical: "9999999999999999.12345677",
        available: "9999999999999999.12345677",
        minimum: "9999999999999999.12345678",
      });
    });
    it("aísla jefe de obra incluso con filtros explícitos de galpón u obra ajena", async () => {
      const result = await alerts(`materialId=${materialId}`, chief);
      expect(result.pagination.total).toBe(1);
      expect(result.data[0].locationId).toBe(assignedLocationId);
      expect(
        (
          await alerts(
            `materialId=${materialId}&locationId=${warehouseId}`,
            chief,
          )
        ).data,
      ).toEqual([]);
      expect(
        (
          await alerts(
            `materialId=${materialId}&locationId=${foreignLocationId}`,
            chief,
          )
        ).data,
      ).toEqual([]);
    });
    it("excluye inactivos y pagina las ubicaciones asignadas del fixture", async () => {
      expect(
        (
          await alerts(
            `materialId=${inactiveMaterialId}&locationId=${warehouseId}`,
          )
        ).data,
      ).toEqual([]);
      expect(
        (
          await alerts(
            `materialId=${materialId}&locationId=${inactiveLocationId}`,
          )
        ).data,
      ).toEqual([]);
      // Other suites may create global locations between requests. This
      // fixture owns exactly two assigned locations and can assert their total.
      await db.workAssignment.create({
        data: { userId: chief.id, workId: workIds[1] },
      });
      const first = await alerts(`materialId=${materialId}&pageSize=1`, chief);
      const second = await alerts(
        `materialId=${materialId}&pageSize=1&page=2`,
        chief,
      );
      expect(first.pagination.total).toBe(2);
      expect(first.pagination.total).toBe(second.pagination.total);
      expect(first.data).toHaveLength(1);
      expect(second.data).toHaveLength(1);
      expect(first.data[0].locationId).not.toBe(second.data[0].locationId);
      const beyond = await alerts(
        `materialId=${materialId}&pageSize=100&page=100000`,
        chief,
      );
      expect(beyond.data).toEqual([]);
      expect(beyond.pagination.total).toBe(first.pagination.total);
    });
  },
);
