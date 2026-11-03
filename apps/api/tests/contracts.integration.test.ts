import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { hashPassword, sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import { workClientBody } from "./work-client-fixture";

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
const tag = randomUUID(),
  prefix = `contract-${tag}`;
const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
const userIds: string[] = [],
  materialIds: string[] = [],
  workIds: string[] = [],
  locationIds: string[] = [],
  unitIds: string[] = [],
  categoryIds: string[] = [],
  supplierIds: string[] = [];
let admin = "",
  chief = "",
  chiefId = "",
  work = "",
  location = "",
  warehouse = "",
  unit = "",
  category = "",
  material = "",
  supplier = "";
const observed = new Set<string>();
function operation(path: string, method: string) {
  const pathname = path.split("?")[0];
  const match = Object.entries(contract.paths).find(([pattern]) =>
    new RegExp(`^${pattern.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(
      "/" + pathname,
    ),
  );
  if (!match) throw new Error(`Ruta no documentada: ${method} ${pathname}`);
  const op = (match[1] as Json)[method.toLowerCase()];
  if (!op) throw new Error(`Método no documentado: ${method} ${match[0]}`);
  return { op, label: `${method} ${match[0]}` };
}
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = admin,
  key?: string,
  expectedStatus?: number,
) {
  body = await workClientBody(path, method, body);
  const { op, label } = operation(path, method);
  if (!key && method === "POST" && /^budgets\/[^/]+\/versions$/.test(path))
    key = randomUUID();
  const response = await dispatch(
    new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        origin,
        cookie: `ceo_session=${cookie}`,
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    path.split("?")[0].split("/"),
  );
  const payload = await response.json();
  const schema =
    op.responses[response.status]?.content?.["application/json"]?.schema;
  expect(
    schema,
    `${label} devolvió ${response.status} sin contrato: ${JSON.stringify(payload)}`,
  ).toBeDefined();
  const validatorKey = `${label}:${response.status}:${cookie === chief ? "JEFE_OBRA" : "GERENCIA"}`;
  let validate = validators.get(validatorKey);
  if (!validate) {
    const components = structuredClone(contract.components);
    // Enforce the documented role projection, not merely either union branch.
    if (cookie === chief)
      components.schemas.VisibleOrder = {
        $ref: "#/components/schemas/ChiefOrder",
      };
    validate = ajv.compile({ ...schema, components });
    validators.set(validatorKey, validate);
  }
  expect(
    validate(payload),
    `${label} ${response.status}: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(payload)}`,
  ).toBe(true);
  observed.add(validatorKey);
  if (expectedStatus !== undefined)
    expect(response.status, JSON.stringify(payload)).toBe(expectedStatus);
  else
    expect(
      response.status,
      `${label}: ${JSON.stringify(payload)}`,
    ).toBeLessThan(300);
  return payload.data;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "respuestas HTTP reales cumplen OpenAPI 3.1",
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
            email: `${role.toLowerCase()}-${tag}@example.test`,
            name: `Contrato ${role}`,
            role,
            passwordHash,
          },
        });
        userIds.push(user.id);
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
    });
    afterAll(async () => {
      // Immutable budget snapshots deliberately prohibit cleanup deletes. Keep
      // UUID-scoped fixtures in this disposable test database and revoke sessions;
      // never disable integrity triggers or truncate tables shared by other suites.
      if (userIds.length)
        await db.session.deleteMany({ where: { userId: { in: userIds } } });
      await db.$disconnect();
    });
    it("valida catálogo, identidad, compras, inventario y presupuestos de punta a punta", async () => {
      work = (
        await call("works", "POST", { code: prefix, name: "Obra contrato" })
      ).id;
      workIds.push(work);
      location = (
        await db.location.findUniqueOrThrow({ where: { workId: work } })
      ).id;
      locationIds.push(location);
      warehouse = (
        await call("locations", "POST", {
          code: `${prefix}-wh`,
          name: "Galpón contrato",
          kind: "WAREHOUSE",
        })
      ).id;
      locationIds.push(warehouse);
      unit = (
        await call("units", "POST", { code: prefix, name: "Unidad contrato" })
      ).id;
      unitIds.push(unit);
      category = (
        await call("categories", "POST", {
          code: prefix,
          name: "Rubro contrato",
        })
      ).id;
      categoryIds.push(category);
      supplier = (
        await call("suppliers", "POST", {
          code: prefix,
          name: "Proveedor contrato",
        })
      ).id;
      supplierIds.push(supplier);
      material = (
        await call("materials", "POST", {
          code: prefix,
          name: "Material contrato",
          unitId: unit,
          categoryId: category,
          minimum: "5",
        })
      ).id;
      materialIds.push(material);
      const presentation = await call("presentations", "POST", {
        materialId: material,
        supplierId: supplier,
        name: "Bolsa contrato",
        baseQuantity: "10",
      });
      const price = await call("prices", "POST", {
        materialId: material,
        supplierId: supplier,
        presentationId: presentation.id,
        price: "100",
        baseQuantity: "10",
        currency: "ARS",
        taxBasis: "EXCLUDED",
      });
      for (const [resource, id] of [
        ["works", work],
        ["locations", warehouse],
        ["units", unit],
        ["categories", category],
        ["suppliers", supplier],
        ["materials", material],
        ["presentations", presentation.id],
        ["prices", price.id],
      ]) {
        await call(resource);
        await call(`${resource}/${id}`);
      }
      for (const [resource, id] of [
        ["works", work],
        ["locations", warehouse],
        ["units", unit],
        ["categories", category],
        ["suppliers", supplier],
        ["materials", material],
      ])
        await call(`${resource}/${id}`, "PATCH", { name: "Nombre corregido" });
      await call(`presentations/${presentation.id}`, "PATCH", { active: true });
      await call("auth/me");
      await call("users");
      await call("auth/login", "POST", {
        email: `gerencia-${tag}@example.test`,
        password: `Test-password-${tag}`,
      });
      const user = await call("users", "POST", {
        name: "Usuario contrato",
        email: `extra-${tag}@example.test`,
        password: `Password-${tag}`,
        role: "COMPUTO",
      });
      userIds.push(user.id);
      await call(`users/${user.id}`, "PATCH", { active: false });
      await call(`users/${chiefId}/assignments`, "PUT", { workIds: [work] });
      await call(`users/${chiefId}/assignments`);
      const request = await call(
        "requests",
        "POST",
        {
          workId: work,
          categoryId: category,
          requiredAt: "2026-12-01T00:00:00.000Z",
          lines: [{ materialId: material, quantity: "10" }],
        },
        chief,
      );
      await call("requests");
      await call(`requests/${request.id}`);
      await call(`requests/${request.id}/history`);
      await call(`requests/${request.id}/needs`);
      await call(`requests/${request.id}/status`, "POST", {
        status: "PROCESSING",
      });
      const commercialLine = {
        materialId: material,
        quantity: "10",
        unitPrice: "10",
        baseQuantity: "1",
      };
      const quote = await call("quotations", "POST", {
        supplierId: supplier,
        requestId: request.id,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [commercialLine],
      });
      await call("quotations");
      await call(`quotations/${quote.id}`);
      await call(`quotations/${request.id}/comparison`);
      await call(`quotations/${quote.id}/select`, "POST");
      const order = await call(
        "purchase-orders",
        "POST",
        {
          supplierId: supplier,
          workId: work,
          requestId: request.id,
          quotationId: quote.id,
          destinationId: location,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          lines: [commercialLine],
        },
        admin,
        randomUUID(),
      );
      await call("purchase-orders");
      await call(`purchase-orders/${order.id}`);
      await call(`purchase-orders/${order.id}/history`);
      await call(`purchase-orders/${order.id}`, "PATCH", {
        notes: "Nota contrato",
      });
      await call(`purchase-orders/${order.id}/status`, "POST", {
        status: "ISSUED",
      });
      await call(`purchase-orders/${order.id}/invoice-reference`, "PUT", {
        invoiceNumber: "REF-CONTRATO",
      });
      await call("purchase-orders", "GET", undefined, chief);
      await call(`purchase-orders/${order.id}`, "GET", undefined, chief);
      await call(
        `purchase-orders/${order.id}/receipts`,
        "POST",
        {
          locationId: location,
          deliveryNote: "Remito contrato",
          lines: [{ orderLineId: order.lines[0].id, quantity: "4" }],
        },
        chief,
        randomUUID(),
      );
      await call(
        `purchase-orders/${order.id}/receipts`,
        "GET",
        undefined,
        chief,
      );
      await call(`purchase-orders/${order.id}/receipts`, "GET");
      await call(`stock?materialId=${material}`);
      await call(`stock/alerts?materialId=${material}`);
      await call(`stock/${location}/minimum`, "PUT", {
        materialId: material,
        minimum: "8",
      });
      await call(
        "movements",
        "POST",
        {
          type: "INITIAL",
          materialId: material,
          destinationId: warehouse,
          quantity: "20",
        },
        admin,
        randomUUID(),
      );
      const reservation = await call(
        "reservations",
        "POST",
        {
          materialId: material,
          sourceId: warehouse,
          workId: work,
          quantity: "5",
        },
        admin,
        randomUUID(),
      );
      await call("reservations");
      await call(`reservations/${reservation.id}`);
      await call(`reservations/${reservation.id}/cancel`, "POST");
      await call(
        "movements",
        "POST",
        {
          type: "CONSUMPTION",
          materialId: material,
          sourceId: location,
          quantity: "1",
          categoryId: category,
        },
        chief,
        randomUUID(),
      );
      await call("movements");
      const apuBody = {
        name: `${prefix}-apu`,
        categoryId: category,
        unitId: unit,
        laborCost: "2",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [{ materialId: material, coefficient: "1.5" }],
      };
      const apu = await call("apu-items", "POST", apuBody);
      await call("apu-items");
      await call(`apu-items/${apu.id}`);
      await call(`apu-items/${apu.id}`, "PATCH", apuBody);
      const valuation = {
        currency: "ARS",
        taxBasis: "EXCLUDED",
        roundingBoundary: "EXTENDED_LINE_COMPONENTS",
        precision: 2,
        roundingMode: "HALF_UP",
        prices: [{ materialId: material, unitPrice: "10" }],
      };
      await call(`apu-items/${apu.id}/calculate`, "POST", valuation);
      const computationBody = {
        workId: work,
        name: "Cómputo contrato",
        lines: [{ itemId: apu.id, quantity: "100" }],
      };
      const computation = await call("computations", "POST", computationBody);
      await call("computations");
      await call(`computations/${computation.id}`);
      await call(`computations/${computation.id}`, "PATCH", computationBody);
      const budget = await call("budgets", "POST", {
        workId: work,
        name: "Presupuesto contrato",
      });
      await call("budgets");
      const version = await call(`budgets/${budget.id}/versions`, "POST", {
        ...valuation,
        computationId: computation.id,
      });
      await call(`budgets/${budget.id}`);
      await call(`budget-versions/${version.id}`);
      await call(
        `budget-versions/${version.id}/materials`,
        "GET",
        undefined,
        chief,
      );
      await call(`budget-versions/${version.id}/reference`, "POST");
      await call(`reports/materials?workId=${work}`);
      await call(
        `reports/materials?workId=${work}&categoryId=${category}`,
        "GET",
        undefined,
        chief,
      );
      await call("audit?entity=PurchaseOrder");
      const imported = {
        rows: [
          {
            externalCode: `${prefix}-imported`,
            name: "Material importado contrato",
            unitCode: prefix,
          },
        ],
      };
      const preview = await call("imports/materials/preview", "POST", imported);
      expect(preview.valid).toBe(true);
      await call(
        "imports/materials/commit",
        "POST",
        { ...imported, confirmationHash: preview.confirmationHash },
        admin,
        randomUUID(),
      );
      await call("prices", "GET", undefined, chief, undefined, 403);
      await call(
        "materials?pageSize=bad",
        "GET",
        undefined,
        admin,
        undefined,
        422,
      );
      await call("auth/me", "GET", undefined, "", undefined, 401);
      await call("auth/logout", "POST", undefined, chief);
      expect(observed.size).toBeGreaterThanOrEqual(65);
    }, 30000);
  },
);
