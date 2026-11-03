import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
const tag = randomUUID(),
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000",
  tokens = new Map<Role, string>(),
  ids = new Map<Role, string>();
let client: string,
  work: string,
  location: string,
  material: string,
  order: string,
  line: string;
async function call(
  role: Role,
  path: string,
  method = "GET",
  body?: unknown,
  key: string = randomUUID(),
) {
  return dispatch(
    new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        origin,
        cookie: `ceo_session=${tokens.get(role)}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0].split("/"),
  );
}
async function data(
  role: Role,
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const r = await call(role, path, method, body, key);
  const j = await r.json();
  expect(r.status, JSON.stringify(j)).toBeLessThan(300);
  return j.data;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "clientes, Administración y recepción delegada",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (target.hostname !== "127.0.0.1" || !target.pathname.includes("test"))
        throw Error("Sólo base loopback test");
      for (const role of Object.values(Role)) {
        const u = await db.user.create({
          data: {
            email: `closure-${role}-${tag}@test.invalid`,
            name: `Perfil sintético ${role}`,
            role,
            passwordHash: "disabled",
          },
        });
        ids.set(role, u.id);
        const token = randomBytes(32).toString("hex");
        tokens.set(role, token);
        await db.session.create({
          data: {
            tokenHash: sessionHash(token),
            userId: u.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      }
      client = (
        await data("COMPUTO", "clients", "POST", {
          code: `closure-${tag}`,
          name: "Cliente sintético",
          taxId: `id-${tag}`,
          email: "sensitive@test.invalid",
        })
      ).id;
      work = (
        await data("GERENCIA", "works", "POST", {
          code: `closure-${tag}`,
          name: "Obra uno",
          clientId: client,
        })
      ).id;
      await data("GERENCIA", "works", "POST", {
        code: `closure2-${tag}`,
        name: "Obra dos",
        clientId: client,
      });
      location = (
        await db.location.create({
          data: {
            code: `closure-wh-${tag}`,
            name: "Galpón delegado",
            kind: "WAREHOUSE",
          },
        })
      ).id;
      const unit = await db.unit.create({
        data: { code: `closure-${tag}`, name: "Unidad" },
      });
      material = (
        await db.material.create({
          data: {
            code: `closure-${tag}`,
            name: "Material real del test",
            unitId: unit.id,
          },
        })
      ).id;
      const supplier = await db.supplier.create({
        data: { code: `closure-${tag}`, name: "Proveedor sintético" },
      });
      const created = await data("COMPRAS", "purchase-orders", "POST", {
        supplierId: supplier.id,
        destinationId: location,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [
          {
            materialId: material,
            quantity: "10",
            unitPrice: "100",
            baseQuantity: "1",
          },
        ],
      });
      order = created.id;
      line = created.lines[0].id;
      await data("COMPRAS", `purchase-orders/${order}/status`, "POST", {
        status: "ISSUED",
      });
    });
    afterAll(() => db.$disconnect());
    it("T02: CUIT con separadores y sin separadores identifica el mismo cliente", async () => {
      const digits =
        "99" +
        BigInt("0x" + tag.replaceAll("-", ""))
          .toString()
          .slice(0, 8) +
        "9";
      const formatted = `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
      const c = await data("COMPUTO", "clients", "POST", {
        code: `fiscal-${tag}`,
        name: "Cliente de CUIT sintético",
        taxId: formatted,
      });
      expect(c.taxId).toBe(digits);
      expect(
        (
          await call("COMPUTO", "clients", "POST", {
            code: `fiscal-dup-${tag}`,
            name: "Duplicado sintético",
            taxId: digits,
          })
        ).status,
      ).toBe(409);
    });
    it("T01/T02: dos obras, inactivación preserva vínculo y rechaza altas nuevas sin cliente", async () => {
      const detail = await data("COMPUTO", `clients/${client}`);
      expect(detail.works).toHaveLength(2);
      expect(
        (
          await call("GERENCIA", "works", "POST", {
            code: `bad-${tag}`,
            name: "Sin cliente",
          })
        ).status,
      ).toBe(422);
      await data("COMPUTO", `clients/${client}`, "PATCH", { active: false });
      expect((await data("COMPRAS", `clients/${client}`)).works).toHaveLength(
        2,
      );
      expect(
        (
          await call("GERENCIA", "works", "POST", {
            code: `inactive-${tag}`,
            name: "Cliente inactivo",
            clientId: client,
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await call("COMPUTO", "clients", "POST", {
            code: `dup-${tag}`,
            name: "Duplicado",
            taxId: `id-${tag}`,
          })
        ).status,
      ).toBe(409);
    });
    it("T04/T05: Administración sólo recibe el DTO mínimo y no exporta datos globales", async () => {
      for (const path of [
        "works",
        "clients",
        "materials",
        "prices",
        "stock",
        "exports/stock",
        "exports/purchase-orders",
        "users",
        "budgets",
        "apu-items",
        `purchase-orders/${order}`,
      ])
        expect((await call("ADMINISTRACION", path)).status, path).toBe(403);
      const visible = await data(
        "ADMINISTRACION",
        `order-administration/${order}`,
      );
      expect(visible.supplier.name).toBe("Proveedor sintético");
      expect(JSON.stringify(visible)).not.toMatch(
        /unitPrice|lines|taxBasis|stock|password|sensitive@test/,
      );
    });
    it("T39: carga factura, pago y reversión con auditoría, sin afectar stock", async () => {
      await data("COMPRAS", `order-administration/${order}/invoice`, "PUT", {
        invoiceNumber: "F-sintética",
        amount: "1100.50",
        currency: "ARS",
      });
      expect(
        (
          await call(
            "ADMINISTRACION",
            `order-administration/${order}/invoice`,
            "PUT",
            { invoiceNumber: "X", amount: "1", currency: "ARS" },
          )
        ).status,
      ).toBe(403);
      await data(
        "ADMINISTRACION",
        `order-administration/${order}/payment`,
        "PUT",
        { paymentStatus: "PAID" },
      );
      await data(
        "ADMINISTRACION",
        `order-administration/${order}/payment`,
        "PUT",
        { paymentStatus: "PENDING" },
      );
      expect(
        await db.auditLog.count({
          where: { entityId: order, action: "PAYMENT_INFORMATION" },
        }),
      ).toBe(2);
      expect(
        await db.stockMovement.count({ where: { materialId: material } }),
      ).toBe(0);
    });
    it("T36/T38: delegación sólo para ese destino; repetición no duplica y revocación es inmediata", async () => {
      const body = {
          locationId: location,
          deliveryNote: "R-sintético",
          lines: [{ orderLineId: line, quantity: "4" }],
        },
        key = randomUUID();
      expect(
        (
          await call(
            "ADMINISTRACION",
            `purchase-orders/${order}/receipts`,
            "POST",
            body,
            key,
          )
        ).status,
      ).toBe(403);
      await data(
        "GERENCIA",
        `reception-delegations/${ids.get("ADMINISTRACION")}`,
        "PUT",
        { locationIds: [location] },
      );
      const desk = await data("ADMINISTRACION", "receipt-desk");
      expect(desk.some((o: { id: string }) => o.id === order)).toBe(true);
      const first = await data(
          "ADMINISTRACION",
          `purchase-orders/${order}/receipts`,
          "POST",
          body,
          key,
        ),
        repeat = await data(
          "ADMINISTRACION",
          `purchase-orders/${order}/receipts`,
          "POST",
          body,
          key,
        );
      expect(first.id).toBe(repeat.id);
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: {
              materialId_locationId: {
                materialId: material,
                locationId: location,
              },
            },
          })
        ).physical.toFixed(),
      ).toBe("4");
      await data(
        "GERENCIA",
        `reception-delegations/${ids.get("ADMINISTRACION")}`,
        "PUT",
        { locationIds: [] },
      );
      expect(
        (
          await call(
            "ADMINISTRACION",
            `purchase-orders/${order}/receipts`,
            "POST",
            body,
            key,
          )
        ).status,
      ).toBe(403);
    });
  },
);
