import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import type { Actor } from "../src/core/auth";
import { handlerCatalog } from "../src/modules/catalog";
import { handlerInventory } from "../src/modules/inventory";

const suffix = randomUUID();
let admin: Actor, chief: Actor, unitId: string;
const works: string[] = [],
  locations: string[] = [],
  materials: string[] = [];
async function get(route: string, actor = chief) {
  const resource = route.split("?")[0].split("/");
  const handler =
    resource[0] === "locations" ? handlerCatalog : handlerInventory;
  const response = await handler(
    new Request(`http://localhost/api/v1/${route}`),
    actor,
    resource,
  );
  return response!.json();
}
async function move(payload: unknown, actor = chief, key = randomUUID()) {
  const response = await handlerInventory(
    new Request("http://localhost/api/v1/movements", {
      method: "POST",
      headers: { "idempotency-key": key },
      body: JSON.stringify(payload),
    }),
    actor,
    ["movements"],
  );
  return (await response!.json()).data;
}
async function material(minimum = "0") {
  const row = await db.material.create({
    data: {
      code: `gap-m-${randomUUID()}`,
      name: "Material sin costo",
      unitId,
      minimum,
    },
  });
  materials.push(row.id);
  return row.id;
}
async function opening(
  materialId: string,
  locationId: string,
  quantity = "12",
) {
  return move(
    { type: "INITIAL", materialId, quantity, destinationId: locationId },
    admin,
  );
}

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "desacoples de inventario: devoluciones y DTO seguro",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(target.hostname) ||
        !/test/i.test(target.pathname)
      )
        throw new Error("Sólo PostgreSQL local aislado de pruebas");
      admin = await db.user.create({
        data: {
          email: `gap-admin-${suffix}@example.test`,
          name: "Administración inventario",
          role: "GERENCIA",
          passwordHash: "secret-should-not-appear",
        },
      });
      chief = await db.user.create({
        data: {
          email: `gap-chief-${suffix}@example.test`,
          name: "Jefe autorizado",
          role: "JEFE_OBRA",
          passwordHash: "secret-should-not-appear",
        },
      });
      unitId = (
        await db.unit.create({
          data: { code: `gap-u-${suffix}`, name: "Unidad" },
        })
      ).id;
      for (let i = 0; i < 2; i++) {
        const work = await db.work.create({
          data: {
            code: `gap-w-${i}-${suffix}`,
            name: i === 0 ? "Propia" : "Ajena",
          },
        });
        works.push(work.id);
        locations.push(
          (
            await db.location.create({
              data: {
                code: `gap-l-${i}-${suffix}`,
                name: work.name,
                kind: "WORK",
                workId: work.id,
              },
            })
          ).id,
        );
      }
      await db.workAssignment.create({
        data: { userId: chief.id, workId: works[0] },
      });
      for (const kind of ["WAREHOUSE", "YARD"] as const)
        locations.push(
          (
            await db.location.create({
              data: {
                code: `gap-${kind}-${suffix}`,
                name: kind === "WAREHOUSE" ? "Galpón" : "Patio",
                kind,
              },
            })
          ).id,
        );
      locations.push(
        (
          await db.location.create({
            data: {
              code: `gap-inactive-${suffix}`,
              name: "Depósito inactivo",
              kind: "WAREHOUSE",
              active: false,
            },
          })
        ).id,
      );
    });
    afterAll(async () => {
      const users = [admin.id, chief.id];
      await db.auditLog.deleteMany({ where: { actorId: { in: users } } });
      await db.idempotencyRecord.deleteMany({
        where: { actorId: { in: users } },
      });
      await db.stockMovement.deleteMany({
        where: { materialId: { in: materials } },
      });
      await db.stockBalance.deleteMany({
        where: { materialId: { in: materials } },
      });
      await db.material.deleteMany({ where: { id: { in: materials } } });
      await db.location.deleteMany({ where: { id: { in: locations } } });
      await db.workAssignment.deleteMany({ where: { userId: chief.id } });
      await db.work.deleteMany({ where: { id: { in: works } } });
      await db.unit.delete({ where: { id: unitId } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });
    it("el Jefe descubre destinos mínimos activos sin acceder a obra ajena ni stocks globales", async () => {
      const rows = (await get("locations?pageSize=100")).data;
      for (const id of locations.slice(2, 4)) {
        const row = rows.find((entry: { id: string }) => entry.id === id);
        expect(row).toBeDefined();
        expect(Object.keys(row).sort()).toEqual(
          ["id", "code", "name", "kind", "active"].sort(),
        );
        expect((await get(`locations/${id}`)).data).toEqual(row);
      }
      expect(
        rows.some(
          (row: { id: string }) =>
            row.id === locations[1] || row.id === locations[4],
        ),
      ).toBe(false);
      await expect(get(`locations/${locations[1]}`)).rejects.toMatchObject({
        status: 403,
      });
      await expect(get(`locations/${locations[4]}`)).rejects.toMatchObject({
        status: 403,
      });
      const materialId = await material();
      await opening(materialId, locations[2]);
      await opening(materialId, locations[1]);
      expect(
        (await get(`stock?materialId=${materialId}&locationId=${locations[2]}`))
          .data,
      ).toEqual([]);
      expect(
        (await get(`stock?materialId=${materialId}&locationId=${locations[1]}`))
          .data,
      ).toEqual([]);
    });
    it("devuelve a galpón/patio una sola vez y describe ubicaciones y actor sin datos privados", async () => {
      const materialId = await material();
      await opening(materialId, locations[0]);
      for (const destinationId of locations.slice(2, 4)) {
        const payload = {
          type: "RETURN",
          materialId,
          quantity: "2",
          sourceId: locations[0],
          destinationId,
        };
        const key = randomUUID();
        const first = await move(payload, chief, key);
        expect(await move(payload, chief, key)).toEqual(first);
        expect(first.source).toMatchObject({
          id: locations[0],
          kind: "WORK",
          name: "Propia",
        });
        expect(first.destination).toMatchObject({ id: destinationId });
        expect(first.actorName).toBe("Jefe autorizado");
        expect(first).not.toHaveProperty("createdBy");
        expect(Object.keys(first.source).sort()).toEqual(
          ["id", "code", "name", "kind"].sort(),
        );
        const destination = await db.stockBalance.findUniqueOrThrow({
          where: {
            materialId_locationId: { materialId, locationId: destinationId },
          },
        });
        expect(destination.physical.toString()).toBe("2");
      }
      const source = await db.stockBalance.findUniqueOrThrow({
        where: {
          materialId_locationId: { materialId, locationId: locations[0] },
        },
      });
      expect(source.physical.toString()).toBe("8");
      const history = (
        await get(`movements?materialId=${materialId}&workId=${works[0]}`)
      ).data;
      expect(history).toHaveLength(3);
      expect(
        history.find((row: { type: string }) => row.type === "INITIAL"),
      ).toMatchObject({
        source: null,
        destination: { id: locations[0] },
        actorName: "Administración inventario",
      });
      expect(
        history.filter((row: { type: string }) => row.type === "RETURN"),
      ).toHaveLength(2);
      const serialized = JSON.stringify(history);
      expect(serialized).not.toContain("@example.test");
      expect(serialized).not.toContain("secret-should-not-appear");
      expect(serialized).not.toContain("passwordHash");
      expect(serialized).not.toContain("unitPrice");
    });
    it("muestra transferencias recibidas sin revelar nombres de una obra de origen ajena", async () => {
      const materialId = await material();
      await opening(materialId, locations[1]);
      const transfer = await move(
        {
          type: "TRANSFER",
          materialId,
          sourceId: locations[1],
          destinationId: locations[0],
          quantity: "3",
        },
        admin,
      );
      expect(transfer.source).toMatchObject({
        id: locations[1],
        name: "Ajena",
      });
      expect(transfer.source).not.toHaveProperty("workId");
      const chiefRows = (await get(`movements?materialId=${materialId}`)).data;
      expect(chiefRows).toHaveLength(1);
      expect(chiefRows[0]).toMatchObject({
        id: transfer.id,
        sourceId: locations[1],
        source: null,
        destination: { id: locations[0], name: "Propia" },
      });
      expect(chiefRows[0].destination).not.toHaveProperty("workId");
      const chiefJson = JSON.stringify(chiefRows);
      expect(chiefJson).not.toContain("Ajena");
      expect(chiefJson).not.toContain(`gap-l-1-${suffix}`);
      expect(chiefJson).not.toContain(works[1]);
      const adminRows = (await get(`movements?materialId=${materialId}`, admin))
        .data;
      expect(
        adminRows.find((row: { id: string }) => row.id === transfer.id),
      ).toMatchObject({
        source: { id: locations[1], name: "Ajena", kind: "WORK" },
      });
      // Granting/revoking the source assignment changes only the descriptive
      // projection; the legitimate incoming event remains visible throughout.
      await db.workAssignment.create({
        data: { userId: chief.id, workId: works[1] },
      });
      expect(
        (await get(`movements?materialId=${materialId}`)).data.find(
          (row: { id: string }) => row.id === transfer.id,
        ).source,
      ).toMatchObject({ id: locations[1], name: "Ajena" });
      await db.workAssignment.delete({
        where: { userId_workId: { userId: chief.id, workId: works[1] } },
      });
      expect(
        (await get(`movements?materialId=${materialId}`)).data[0].source,
      ).toBeNull();
    });
    it("no permite al Jefe egresos globales, devoluciones ajenas ni transferencias", async () => {
      const materialId = await material();
      await opening(materialId, locations[1]);
      await opening(materialId, locations[2]);
      const cases = [
        { type: "RETURN", sourceId: locations[1], destinationId: locations[2] },
        { type: "RETURN", sourceId: locations[2], destinationId: locations[3] },
        { type: "CONSUMPTION", sourceId: locations[2] },
        {
          type: "TRANSFER",
          sourceId: locations[2],
          destinationId: locations[0],
        },
        { type: "RETURN", sourceId: locations[0], destinationId: locations[1] },
      ];
      for (const operation of cases)
        await expect(
          move({ ...operation, materialId, quantity: "1" }),
        ).rejects.toMatchObject({ status: 403 });
      expect(await db.stockMovement.count({ where: { materialId } })).toBe(2);
      expect((await get(`movements?materialId=${materialId}`)).data).toEqual(
        [],
      );
    });
    it("identifica mínimo heredado, override cero y ausencia sin inventar balances", async () => {
      const inherited = await material("10"),
        none = await material();
      await opening(inherited, locations[0], "2");
      await opening(none, locations[0], "2");
      const own = (await get(`stock?materialId=${inherited}`)).data[0];
      expect(own).toMatchObject({
        minimum: "10",
        minimumSource: "MATERIAL",
        belowMinimum: true,
      });
      expect((await get(`stock?materialId=${none}`)).data[0]).toMatchObject({
        minimum: "0",
        minimumSource: "NONE",
        belowMinimum: false,
      });
      const missing = (
        await get(
          `stock/alerts?materialId=${inherited}&locationId=${locations[2]}`,
          admin,
        )
      ).data[0];
      expect(missing).toMatchObject({
        balanceId: null,
        minimum: "10",
        minimumSource: "MATERIAL",
      });
      expect(
        await db.stockBalance.count({
          where: { materialId: inherited, locationId: locations[2] },
        }),
      ).toBe(0);
      await db.stockBalance.update({
        where: {
          materialId_locationId: {
            materialId: inherited,
            locationId: locations[0],
          },
        },
        data: { minimum: "0" },
      });
      expect(
        (await get(`stock?materialId=${inherited}`)).data[0],
      ).toMatchObject({
        minimum: "0",
        minimumSource: "LOCATION",
        belowMinimum: false,
      });
      expect(
        (
          await get(
            `stock/alerts?materialId=${inherited}&locationId=${locations[0]}`,
          )
        ).data,
      ).toEqual([]);
      await db.stockBalance.update({
        where: {
          materialId_locationId: {
            materialId: inherited,
            locationId: locations[0],
          },
        },
        data: { minimum: "5" },
      });
      expect(
        (
          await get(
            `stock/alerts?materialId=${inherited}&locationId=${locations[0]}`,
          )
        ).data[0],
      ).toMatchObject({ minimum: "5", minimumSource: "LOCATION" });
    });
  },
);
