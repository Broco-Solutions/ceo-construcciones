import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/core/db";
import { hashPassword, sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";

const tag = randomUUID();
const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
let admin = "",
  chief = "",
  chiefId = "",
  work = "",
  otherWork = "",
  location = "",
  otherLocation = "",
  material = "",
  category = "",
  supplier = "",
  requestId = "",
  cancelledRequest = "",
  quoteId = "",
  orderId = "",
  duplicateOrderId = "",
  lineId = "";
const users: string[] = [];
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  token = admin,
  key?: string,
) {
  return dispatch(
    new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        origin,
        cookie: `ceo_session=${token}`,
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    path.split("?")[0].split("/"),
  );
}
async function success(response: Response) {
  const json = await response.json();
  expect(response.status, JSON.stringify(json)).toBeLessThan(300);
  return json;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "compras: DTO, filtros, trazabilidad y límites por obra",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["localhost", "127.0.0.1"].includes(target.hostname) ||
        !target.pathname.includes("test")
      )
        throw new Error("Solo PostgreSQL local aislado test");
      const passwordHash = await hashPassword(`Test-password-${tag}`);
      for (const role of ["GERENCIA", "JEFE_OBRA"] as const) {
        const user = await db.user.create({
          data: {
            email: `${role}-${tag}@example.test`,
            name: `Actor ${role}`,
            role,
            passwordHash,
          },
        });
        users.push(user.id);
        const token = randomBytes(32).toString("hex");
        await db.session.create({
          data: {
            tokenHash: sessionHash(token),
            userId: user.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
        if (role === "GERENCIA") admin = token;
        else {
          chief = token;
          chiefId = user.id;
        }
      }
      const w = await db.work.create({
        data: { code: `proc-${tag}`, name: "Obra compras" },
      });
      work = w.id;
      const w2 = await db.work.create({
        data: { code: `proc2-${tag}`, name: "Obra ajena" },
      });
      otherWork = w2.id;
      location = (
        await db.location.create({
          data: {
            code: `proc-l-${tag}`,
            name: "Ubicación obra",
            kind: "WORK",
            workId: work,
          },
        })
      ).id;
      otherLocation = (
        await db.location.create({
          data: {
            code: `proc-l2-${tag}`,
            name: "Ubicación ajena",
            kind: "WORK",
            workId: otherWork,
          },
        })
      ).id;
      await db.workAssignment.create({
        data: { workId: work, userId: chiefId },
      });
      const unit = await db.unit.create({
        data: { code: `proc-${tag}`, name: "Unidad" },
      });
      category = (
        await db.category.create({
          data: { code: `proc-${tag}`, name: "Rubro" },
        })
      ).id;
      material = (
        await db.material.create({
          data: {
            code: `proc-${tag}`,
            name: "Material",
            unitId: unit.id,
            categoryId: category,
          },
        })
      ).id;
      supplier = (
        await db.supplier.create({
          data: { code: `proc-${tag}`, name: "Proveedor" },
        })
      ).id;
      requestId = (
        await success(
          await call(
            "requests",
            "POST",
            {
              workId: work,
              categoryId: category,
              requiredAt: "2026-12-01T00:00:00Z",
              lines: [{ materialId: material, quantity: "15" }],
            },
            chief,
          ),
        )
      ).data.id;
      cancelledRequest = (
        await db.materialRequest.create({
          data: {
            workId: work,
            categoryId: category,
            requiredAt: new Date(),
            requestedById: users[0],
            status: "CANCELLED",
          },
        })
      ).id;
      await db.materialRequest.create({
        data: {
          workId: otherWork,
          categoryId: category,
          requiredAt: new Date(),
          requestedById: users[0],
          status: "SUBMITTED",
        },
      });
      const presentation = await db.presentation.create({
        data: {
          materialId: material,
          supplierId: supplier,
          name: "Bulto",
          baseQuantity: "10",
        },
      });
      const line = {
        materialId: material,
        presentationId: presentation.id,
        quantity: "15",
        unitPrice: "120",
        baseQuantity: "10",
      };
      quoteId = (
        await success(
          await call("quotations", "POST", {
            supplierId: supplier,
            requestId,
            currency: "ARS",
            taxBasis: "EXCLUDED",
            lines: [line],
          }),
        )
      ).data.id;
      await success(await call(`quotations/${quoteId}/select`, "POST"));
      const order = {
        supplierId: supplier,
        requestId,
        quotationId: quoteId,
        workId: work,
        destinationId: location,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [line],
      };
      const result = (
        await success(
          await call("purchase-orders", "POST", order, admin, randomUUID()),
        )
      ).data;
      orderId = result.id;
      lineId = result.lines[0].id;
      duplicateOrderId = (
        await success(
          await call("purchase-orders", "POST", order, admin, randomUUID()),
        )
      ).data.id;
      await success(
        await call(`purchase-orders/${orderId}/status`, "POST", {
          status: "ISSUED",
        }),
      );
      await success(
        await call(
          "purchase-orders",
          "POST",
          {
            ...order,
            requestId: undefined,
            quotationId: undefined,
            workId: otherWork,
            destinationId: otherLocation,
          },
          admin,
          randomUUID(),
        ),
      );
    }, 30000);
    afterAll(async () => {
      if (users.length)
        await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.$disconnect();
    });
    it("filtra pedidos y OC en servidor antes de paginar y conserva el aislamiento", async () => {
      const page = await success(
        await call(
          `requests?categoryId=${category}&status=SUBMITTED&pageSize=1`,
          "GET",
          undefined,
          chief,
        ),
      );
      expect(page.pagination.total).toBe(1);
      expect(page.data.map((r: { id: string }) => r.id)).toEqual([requestId]);
      const cancelled = await success(
        await call(`requests?workId=${work}&status=CANCELLED`),
      );
      expect(cancelled.data.map((r: { id: string }) => r.id)).toEqual([
        cancelledRequest,
      ]);
      const orders = await success(
        await call(
          `purchase-orders?requestId=${requestId}&quotationId=${quoteId}&destinationId=${location}&status=DRAFT&pageSize=1`,
        ),
      );
      expect(orders.pagination.total).toBe(1);
      expect(orders.data[0].id).toBe(duplicateOrderId);
      const deniedScope = await success(
        await call(
          `purchase-orders?workId=${otherWork}&status=DRAFT`,
          "GET",
          undefined,
          chief,
        ),
      );
      expect(deniedScope.pagination.total).toBe(0);
      for (const resource of ["requests", "purchase-orders", "quotations"])
        expect((await call(`${resource}?status=UNKNOWN`)).status).toBe(422);
    });
    it("calcula importes desde precio/base y expone descripciones seguras sin filtrar economía al Jefe", async () => {
      const order = (await success(await call(`purchase-orders/${orderId}`)))
        .data;
      expect(order.lines[0]).toMatchObject({
        pendingQuantity: "15",
        lineAmount: "180",
      });
      expect(order).toMatchObject({
        totalAmount: "180",
        amountWarning: null,
        createdByName: "Actor GERENCIA",
        invoiceLoadedByName: null,
      });
      expect(order.supplier.name).toBe("Proveedor");
      expect(order.destination.name).toBe("Ubicación obra");
      const safe = (
        await success(
          await call(`purchase-orders/${orderId}`, "GET", undefined, chief),
        )
      ).data;
      expect(safe.destination.id).toBe(location);
      expect(safe.createdByName).toBe("Actor GERENCIA");
      for (const field of [
        "unitPrice",
        "lineAmount",
        "totalAmount",
        "amountWarning",
        "supplier",
        "currency",
        "invoice",
        "taxBasis",
        "email",
        "passwordHash",
      ])
        expect(JSON.stringify(safe)).not.toContain(field);
      expect(JSON.stringify(order)).not.toContain("email");
    });
    it("devuelve null y aviso cuando el importe requiere una política de redondeo no validada", async () => {
      const presentation = await db.presentation.create({
        data: {
          materialId: material,
          supplierId: supplier,
          name: "Tercio",
          baseQuantity: "3",
        },
      });
      const body = {
        supplierId: supplier,
        workId: work,
        destinationId: location,
        currency: "ARS",
        taxBasis: "INCLUDED",
        lines: [
          {
            materialId: material,
            presentationId: presentation.id,
            quantity: "1",
            unitPrice: "1",
            baseQuantity: "3",
          },
        ],
      };
      const order = (
        await success(
          await call("purchase-orders", "POST", body, admin, randomUUID()),
        )
      ).data;
      expect(order.lines[0].lineAmount).toBeNull();
      expect(order.totalAmount).toBeNull();
      expect(order.amountWarning).toBe("ROUNDING_POLICY_REQUIRED");
    });
    it("vincula recepciones en historia de OC e identifica actores sin emails", async () => {
      const receipt = (
        await success(
          await call(
            `purchase-orders/${orderId}/receipts`,
            "POST",
            {
              locationId: location,
              deliveryNote: "PROC-R1",
              lines: [{ orderLineId: lineId, quantity: "4" }],
            },
            chief,
            randomUUID(),
          ),
        )
      ).data;
      expect(receipt).toMatchObject({
        actorName: "Actor JEFE_OBRA",
        location: { id: location, name: "Ubicación obra" },
      });
      const replay = (
        await success(
          await call(
            `purchase-orders/${orderId}/receipts`,
            "POST",
            {
              locationId: location,
              deliveryNote: "PROC-R1",
              lines: [{ orderLineId: lineId, quantity: "4" }],
            },
            chief,
            randomUUID(),
          ),
        )
      ).data;
      // A different intention is a distinct legitimate receipt; history must include both.
      const history = (
        await success(await call(`purchase-orders/${orderId}/history`))
      ).data;
      const events = history.filter(
        (event: { entityType: string }) => event.entityType === "Receipt",
      );
      expect(
        events.map((event: { entityId: string }) => event.entityId).sort(),
      ).toEqual([receipt.id, replay.id].sort());
      expect(
        events.every(
          (event: { actorName: string; after: { orderId: string } }) =>
            event.actorName === "Actor JEFE_OBRA" &&
            event.after.orderId === orderId,
        ),
      ).toBe(true);
      expect(JSON.stringify(history)).not.toContain("email");
      expect(
        (
          await call(
            `purchase-orders/${orderId}/history`,
            "GET",
            undefined,
            chief,
          )
        ).status,
      ).toBe(403);
      const invoice = (
        await success(
          await call(`purchase-orders/${orderId}/invoice-reference`, "PUT", {
            invoiceNumber: "REF-PROC",
          }),
        )
      ).data;
      expect(invoice.invoiceLoadedByName).toBe("Actor GERENCIA");
      const reqHistory = (
        await success(
          await call(`requests/${requestId}/history`, "GET", undefined, chief),
        )
      ).data;
      expect(reqHistory[0].actorName).toBe("Actor JEFE_OBRA");
      const updated = (
        await success(
          await call(`purchase-orders/${orderId}`, "GET", undefined, chief),
        )
      ).data;
      expect(updated.lines[0].pendingQuantity).toBe("7");
    });
    it("declara comparación cronológica determinista y alreadyRequested incluye el pedido actual", async () => {
      const first = await db.quotation.findUniqueOrThrow({
        where: { id: quoteId },
      });
      const second = await db.quotation.create({
        data: {
          supplierId: supplier,
          requestId,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          status: "RECEIVED",
          createdAt: first.createdAt,
        },
      });
      const comparison = (
        await success(await call(`quotations/${requestId}/comparison`))
      ).data;
      expect(
        comparison.quotations.map((quote: { id: string }) => quote.id),
      ).toEqual([first.id, second.id].sort());
      const needs = (
        await success(
          await call(`requests/${requestId}/needs`, "GET", undefined, chief),
        )
      ).data;
      expect(needs.lines[0].alreadyRequested).toBe("15");
    });
  },
);
