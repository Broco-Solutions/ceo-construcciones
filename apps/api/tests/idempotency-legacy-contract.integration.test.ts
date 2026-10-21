import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";

type Json = Record<string, any>;
const contract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../docs/api/openapi.json"),
    "utf8",
  ),
);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
const tag = randomUUID();
const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
const users: string[] = [];
let admin = "",
  chief = "",
  adminId = "",
  chiefId = "",
  workId = "",
  locationId = "",
  unitId = "",
  supplierId = "";
function validate(
  pattern: string,
  method: string,
  status: number,
  payload: unknown,
) {
  const key = `${method}:${pattern}:${status}`;
  let validator = validators.get(key);
  if (!validator) {
    const schema =
      contract.paths[pattern][method].responses[status].content[
        "application/json"
      ].schema;
    validator = ajv.compile({ ...schema, components: contract.components });
    validators.set(key, validator);
  }
  expect(
    validator(payload),
    `${key}: ${ajv.errorsText(validator.errors)}\n${JSON.stringify(payload)}`,
  ).toBe(true);
}
async function call(
  path: string,
  method: string,
  pattern: string,
  body?: unknown,
  token = admin,
  key?: string,
) {
  const response = await dispatch(
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
  const payload = await response.json();
  expect(response.status, JSON.stringify(payload)).toBe(
    method === "POST" && !path.endsWith("/status") ? 201 : 200,
  );
  validate(pattern, method.toLowerCase(), response.status, payload);
  return payload.data as Json;
}
async function legacySnapshot(
  eventOwner: string,
  scope: string,
  key: string,
  response: Json,
) {
  const storedKey = createHash("sha256")
    .update(`${eventOwner}:${scope}:${key}`)
    .digest("hex");
  await db.idempotencyRecord.update({
    where: { key: storedKey },
    data: { response },
  });
}
async function material() {
  return (
    await db.material.create({
      data: {
        code: `legacy-m-${randomUUID()}`,
        name: "Material legado",
        unitId,
      },
    })
  ).id;
}
async function order(materialId: string) {
  const body = {
    supplierId,
    workId,
    destinationId: locationId,
    currency: "ARS",
    taxBasis: "EXCLUDED",
    lines: [{ materialId, quantity: "5", unitPrice: "10", baseQuantity: "1" }],
  };
  const key = randomUUID();
  const data = await call(
    "purchase-orders",
    "POST",
    "/purchase-orders",
    body,
    admin,
    key,
  );
  return { body, key, data };
}

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "compatibilidad OpenAPI de respuestas idempotentes anteriores al enriquecimiento",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["localhost", "127.0.0.1"].includes(target.hostname) ||
        !target.pathname.includes("test")
      )
        throw new Error("Sólo PostgreSQL local aislado test");
      for (const role of ["GERENCIA", "JEFE_OBRA"] as const) {
        const user = await db.user.create({
          data: {
            email: `legacy-${role}-${tag}@example.test`,
            name: `Actor legado ${role}`,
            role,
            passwordHash: "unused",
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
        if (role === "GERENCIA") {
          admin = token;
          adminId = user.id;
        } else {
          chief = token;
          chiefId = user.id;
        }
      }
      workId = (
        await db.work.create({
          data: { code: `legacy-w-${tag}`, name: "Obra legado" },
        })
      ).id;
      locationId = (
        await db.location.create({
          data: {
            code: `legacy-l-${tag}`,
            name: "Ubicación legado",
            kind: "WORK",
            workId,
          },
        })
      ).id;
      await db.workAssignment.create({ data: { workId, userId: chiefId } });
      unitId = (
        await db.unit.create({
          data: { code: `legacy-u-${tag}`, name: "Unidad legado" },
        })
      ).id;
      supplierId = (
        await db.supplier.create({
          data: { code: `legacy-s-${tag}`, name: "Proveedor legado" },
        })
      ).id;
    });
    afterAll(async () => {
      // UUID-scoped fixtures remain in this disposable database; no truncation of
      // tables shared with concurrent integration suites.
      await db.session.deleteMany({ where: { userId: { in: users } } });
      await db.$disconnect();
    });
    it("repite una OC económica antigua sin duplicarla y GET devuelve el detalle enriquecido", async () => {
      const materialId = await material();
      const { body, key, data } = await order(materialId);
      const legacy = structuredClone(data);
      for (const field of [
        "supplier",
        "destination",
        "work",
        "createdByName",
        "invoiceLoadedByName",
        "totalAmount",
        "amountWarning",
      ])
        delete legacy[field];
      for (const line of legacy.lines) {
        delete line.pendingQuantity;
        delete line.lineAmount;
      }
      await legacySnapshot(adminId, "purchase-order", key, legacy);
      const beforeAudit = await db.auditLog.count({
        where: { entityType: "PurchaseOrder", entityId: data.id },
      });
      expect(
        await call(
          "purchase-orders",
          "POST",
          "/purchase-orders",
          body,
          admin,
          key,
        ),
      ).toEqual(legacy);
      expect(
        await db.purchaseOrder.count({
          where: { lines: { some: { materialId } } },
        }),
      ).toBe(1);
      expect(
        await db.auditLog.count({
          where: { entityType: "PurchaseOrder", entityId: data.id },
        }),
      ).toBe(beforeAudit);
      const detail = await call(
        `purchase-orders/${data.id}`,
        "GET",
        "/purchase-orders/{id}",
      );
      expect(detail).toMatchObject({
        createdByName: "Actor legado GERENCIA",
        totalAmount: "50",
        destination: { id: locationId },
        lines: [{ pendingQuantity: "5", lineAmount: "50" }],
      });
      expect(detail).not.toHaveProperty("createdBy");
    });
    it("repite una recepción antigua del Jefe sin alterar cantidades ni repetir stock y GET la enriquece", async () => {
      const materialId = await material();
      const { data: purchase } = await order(materialId);
      await call(
        `purchase-orders/${purchase.id}/status`,
        "POST",
        "/purchase-orders/{id}/status",
        { status: "ISSUED" },
      );
      const path = `purchase-orders/${purchase.id}/receipts`,
        pattern = "/purchase-orders/{id}/receipts";
      const body = {
        locationId,
        deliveryNote: "Remito legado",
        lines: [{ orderLineId: purchase.lines[0].id, quantity: "2" }],
      };
      const key = randomUUID();
      const receipt = await call(path, "POST", pattern, body, chief, key);
      const legacy = structuredClone(receipt);
      delete legacy.actorName;
      delete legacy.location;
      await legacySnapshot(
        `order:${purchase.id}`,
        `receipt:${purchase.id}`,
        key,
        legacy,
      );
      expect(await call(path, "POST", pattern, body, chief, key)).toEqual(
        legacy,
      );
      expect(await db.receipt.count({ where: { orderId: purchase.id } })).toBe(
        1,
      );
      expect(await db.stockMovement.count({ where: { materialId } })).toBe(1);
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: { materialId_locationId: { materialId, locationId } },
          })
        ).physical.toString(),
      ).toBe("2");
      expect(
        (
          await db.purchaseOrderLine.findUniqueOrThrow({
            where: { id: purchase.lines[0].id },
          })
        ).receivedQuantity.toString(),
      ).toBe("2");
      const rows = await call(path, "GET", pattern, undefined, chief);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        actorName: "Actor legado JEFE_OBRA",
        location: { id: locationId },
      });
      expect(JSON.stringify(rows)).not.toMatch(
        /unitPrice|lineAmount|totalAmount|@example\.test|passwordHash/,
      );
    });
    it("repite un consumo antiguo del Jefe sin duplicar el egreso y GET conserva DTO estricto", async () => {
      const materialId = await material();
      await call(
        "movements",
        "POST",
        "/movements",
        {
          type: "INITIAL",
          materialId,
          destinationId: locationId,
          quantity: "5",
        },
        admin,
        randomUUID(),
      );
      const body = {
          type: "CONSUMPTION",
          materialId,
          sourceId: locationId,
          quantity: "2",
        },
        key = randomUUID();
      const movement = await call(
        "movements",
        "POST",
        "/movements",
        body,
        chief,
        key,
      );
      const legacy = structuredClone(movement);
      delete legacy.source;
      delete legacy.destination;
      delete legacy.actorName;
      await legacySnapshot(chiefId, "movement", key, legacy);
      expect(
        await call("movements", "POST", "/movements", body, chief, key),
      ).toEqual(legacy);
      expect(
        await db.stockMovement.count({
          where: { materialId, type: "CONSUMPTION" },
        }),
      ).toBe(1);
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: { materialId_locationId: { materialId, locationId } },
          })
        ).physical.toString(),
      ).toBe("3");
      const rows = await call(
        `movements?materialId=${materialId}`,
        "GET",
        "/movements",
        undefined,
        chief,
      );
      expect(rows).toHaveLength(2);
      expect(
        rows.find((row: Json) => row.type === "CONSUMPTION"),
      ).toMatchObject({
        source: { id: locationId },
        destination: null,
        actorName: "Actor legado JEFE_OBRA",
      });
      expect(JSON.stringify(rows)).not.toMatch(
        /unitPrice|lineAmount|totalAmount|@example\.test|passwordHash/,
      );
    });
  },
);
