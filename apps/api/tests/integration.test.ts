import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/core/db";
import { hashPassword, sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
const enabled = process.env.RUN_INTEGRATION === "1";
const tag = randomUUID();
const origin = "http://localhost:3001";
let admin: string,
  chief: string,
  buyer: string,
  work: string,
  otherWork: string,
  loc: string,
  warehouse: string,
  material: string,
  unit: string,
  category: string,
  supplier: string,
  order: string,
  line: string,
  requestId: string;
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  cookie = admin,
  key?: string,
) {
  return dispatch(
    new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        origin,
        cookie: `ceo_session=${cookie}`,
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0].split("/"),
  );
}
async function data(response: Response) {
  const body = await response.json();
  expect(response.status, JSON.stringify(body)).toBeLessThan(300);
  return body.data;
}
describe.skipIf(!enabled)(
  "backend integrado PostgreSQL: compras, recepción y HTTP",
  () => {
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL || "");
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        !url.pathname.includes("test")
      )
        throw new Error("Solo PostgreSQL local test");
      const hash = await hashPassword(`Test-pass-${tag}`);
      const management = await db.user.create({
        data: {
          email: `admin-${tag}@test.invalid`,
          name: "Gerencia",
          role: "GERENCIA",
          passwordHash: hash,
        },
      });
      const site = await db.user.create({
        data: {
          email: `chief-${tag}@test.invalid`,
          name: "Jefe",
          role: "JEFE_OBRA",
          passwordHash: hash,
        },
      });
      const purchasing = await db.user.create({
        data: {
          email: `buyer-${tag}@test.invalid`,
          name: "Compras",
          role: "COMPRAS",
          passwordHash: hash,
        },
      });
      const tokens = [
        randomUUID().replaceAll("-", "").repeat(2),
        randomUUID().replaceAll("-", "").repeat(2),
        randomUUID().replaceAll("-", "").repeat(2),
      ];
      for (const [i, user] of [management, site, purchasing].entries())
        await db.session.create({
          data: {
            tokenHash: sessionHash(tokens[i]),
            userId: user.id,
            expiresAt: new Date(Date.now() + 3600000),
          },
        });
      [admin, chief, buyer] = tokens;
      const w = await data(
        await call("works", "POST", { code: `w-${tag}`, name: "Obra piloto" }),
      );
      work = w.id;
      loc = (await db.location.findUniqueOrThrow({ where: { workId: work } }))
        .id;
      const w2 = await data(
        await call("works", "POST", { code: `w2-${tag}`, name: "Otra obra" }),
      );
      otherWork = w2.id;
      await data(
        await call(`users/${site.id}/assignments`, "PUT", { workIds: [work] }),
      );
      warehouse = (
        await data(
          await call("locations", "POST", {
            code: `gal-${tag}`,
            name: "Galpón",
            kind: "WAREHOUSE",
          }),
        )
      ).id;
      unit = (
        await data(
          await call("units", "POST", { code: `u-${tag}`, name: "Unidad" }),
        )
      ).id;
      category = (
        await data(
          await call("categories", "POST", { code: `r-${tag}`, name: "Rubro" }),
        )
      ).id;
      material = (
        await data(
          await call("materials", "POST", {
            code: `m-${tag}`,
            name: "Cemento",
            unitId: unit,
            categoryId: category,
            minimum: "5",
          }),
        )
      ).id;
      supplier = (
        await data(
          await call("suppliers", "POST", {
            code: `s-${tag}`,
            name: "Proveedor",
          }),
        )
      ).id;
    }, 30000);
    afterAll(async () => {
      await db.$disconnect();
    });
    it("autenticación, aislamiento, permisos y ausencia de campos económicos", async () => {
      expect((await call("works", "GET", undefined, "")).status).toBe(401);
      expect(
        (await call(`works/${otherWork}`, "GET", undefined, chief)).status,
      ).toBe(403);
      expect((await call("users", "GET", undefined, chief)).status).toBe(403);
      expect((await call("prices", "GET", undefined, chief)).status).toBe(403);
      expect((await call("budgets", "GET", undefined, chief)).status).toBe(403);
      const works = await data(await call("works", "GET", undefined, chief));
      expect(works.map((w: { id: string }) => w.id)).toEqual([work]);
      const badOrigin = await dispatch(
        new Request(`${origin}/api/v1/materials`, {
          method: "POST",
          headers: {
            cookie: `ceo_session=${admin}`,
            origin: "https://evil.invalid",
          },
          body: "{}",
        }),
        ["materials"],
      );
      expect(badOrigin.status).toBe(403);
      expect((await call("materials?pageSize=oops")).status).toBe(422);
    });
    it("pedido no modifica stock; cotización seleccionada manualmente", async () => {
      const r = await data(
        await call(
          "requests",
          "POST",
          {
            workId: work,
            categoryId: category,
            requiredAt: "2026-12-01T00:00:00.000Z",
            lines: [{ materialId: material, quantity: "10" }],
          },
          chief,
        ),
      );
      requestId = r.id;
      expect(
        await db.stockBalance.count({ where: { materialId: material } }),
      ).toBe(0);
      const q = await data(
        await call(
          "quotations",
          "POST",
          {
            supplierId: supplier,
            requestId: r.id,
            currency: "ARS",
            taxBasis: "EXCLUDED",
            lines: [
              {
                materialId: material,
                quantity: "10",
                unitPrice: "2.50",
                baseQuantity: "1",
              },
            ],
          },
          buyer,
        ),
      );
      await data(await call(`quotations/${q.id}/select`, "POST", {}, buyer));
      const compare = await data(await call(`quotations/${r.id}/comparison`));
      expect(compare.comparable).toBe(true);
      expect(compare.quotations[0].selectedById).toBeTruthy();
      const po = await data(
        await call(
          "purchase-orders",
          "POST",
          {
            supplierId: supplier,
            workId: work,
            requestId: r.id,
            quotationId: q.id,
            destinationId: loc,
            currency: "ARS",
            taxBasis: "EXCLUDED",
            lines: [
              {
                materialId: material,
                quantity: "10",
                unitPrice: "2.50",
                baseQuantity: "1",
              },
            ],
          },
          buyer,
          `po-${tag}`,
        ),
      );
      order = po.id;
      line = po.lines[0].id;
      await data(
        await call(
          `purchase-orders/${order}/status`,
          "POST",
          { status: "ISSUED" },
          buyer,
        ),
      );
      const safe = await data(
        await call(`purchase-orders/${order}`, "GET", undefined, chief),
      );
      const raw = JSON.stringify(safe);
      for (const field of [
        "unitPrice",
        "currency",
        "invoice",
        "cost",
        "taxBasis",
      ])
        expect(raw).not.toContain(field);
    });
    it("recepción parcial concurrente idempotente, no excede ni duplica existencias", async () => {
      const body = {
        locationId: loc,
        deliveryNote: "R-01",
        lines: [{ orderLineId: line, quantity: "4" }],
      };
      const responses = await Promise.all(
        Array.from({ length: 3 }, () =>
          call(
            `purchase-orders/${order}/receipts`,
            "POST",
            body,
            chief,
            `receive-${tag}`,
          ),
        ),
      );
      const receipts = await Promise.all(responses.map(data));
      expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: {
              materialId_locationId: { materialId: material, locationId: loc },
            },
          })
        ).physical.toString(),
      ).toBe("4");
      expect(
        (await db.purchaseOrder.findUniqueOrThrow({ where: { id: order } }))
          .status,
      ).toBe("PARTIALLY_RECEIVED");
      const retryOtherActor = await data(
        await call(
          `purchase-orders/${order}/receipts`,
          "POST",
          body,
          buyer,
          `receive-${tag}`,
        ),
      );
      expect(retryOtherActor.id).toBe(receipts[0].id);
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: {
              materialId_locationId: { materialId: material, locationId: loc },
            },
          })
        ).physical.toString(),
      ).toBe("4");
      const over = await call(
        `purchase-orders/${order}/receipts`,
        "POST",
        { ...body, lines: [{ orderLineId: line, quantity: "7" }] },
        buyer,
        `over-${tag}`,
      );
      expect(over.status).toBe(409);
      const reuse = await call(
        `purchase-orders/${order}/receipts`,
        "POST",
        { ...body, deliveryNote: "changed" },
        chief,
        `receive-${tag}`,
      );
      expect(reuse.status).toBe(409);
      await data(
        await call(
          `purchase-orders/${order}/receipts`,
          "POST",
          {
            locationId: loc,
            deliveryNote: "R-02",
            lines: [{ orderLineId: line, quantity: "6" }],
          },
          chief,
          `finish-${tag}`,
        ),
      );
      expect(
        (await db.purchaseOrder.findUniqueOrThrow({ where: { id: order } }))
          .status,
      ).toBe("RECEIVED");
    });
    it("factura referencia con timestamp automático y auditoría no altera stock", async () => {
      const before = (
        await db.stockBalance.findUniqueOrThrow({
          where: {
            materialId_locationId: { materialId: material, locationId: loc },
          },
        })
      ).physical.toString();
      const o = await data(
        await call(
          `purchase-orders/${order}/invoice-reference`,
          "PUT",
          { invoiceNumber: "A-0001" },
          buyer,
        ),
      );
      expect(o.invoiceLoadedById).toBeTruthy();
      expect(o.invoiceLoadedAt).toBeTruthy();
      await data(
        await call(
          `purchase-orders/${order}/invoice-reference`,
          "PUT",
          { invoiceNumber: "A-0002" },
          buyer,
        ),
      );
      expect(
        await db.auditLog.count({
          where: {
            entityType: "PurchaseOrder",
            entityId: order,
            action: "INVOICE_REFERENCE",
          },
        }),
      ).toBe(2);
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: {
              materialId_locationId: { materialId: material, locationId: loc },
            },
          })
        ).physical.toString(),
      ).toBe(before);
      expect(
        (
          await call(
            `purchase-orders/${order}/invoice-reference`,
            "PUT",
            { invoiceNumber: "x" },
            chief,
          )
        ).status,
      ).toBe(403);
    });
    it("OC generales numeradas en concurrencia y destinos verificados", async () => {
      const body = {
        supplierId: supplier,
        destinationId: warehouse,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [
          {
            materialId: material,
            quantity: "1",
            unitPrice: "2",
            baseQuantity: "1",
          },
        ],
      };
      const orders = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          call("purchase-orders", "POST", body, buyer, `num-${tag}-${i}`).then(
            data,
          ),
        ),
      );
      expect(new Set(orders.map((o) => o.number)).size).toBe(8);
      expect(orders.every((o) => o.workId === null)).toBe(true);
      expect(
        (await call(`purchase-orders/${orders[0].id}`, "GET", undefined, chief))
          .status,
      ).toBe(403);
      expect(
        (
          await call(
            "purchase-orders",
            "POST",
            { ...body, destinationId: loc },
            buyer,
            `bad-${tag}`,
          )
        ).status,
      ).toBe(409);
    });
    it("revalida catálogo al emitir y conserva borrador ante material desactivado", async () => {
      const body = {
        supplierId: supplier,
        destinationId: warehouse,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [
          {
            materialId: material,
            quantity: "1",
            unitPrice: "2",
            baseQuantity: "1",
          },
        ],
      };
      const po = await data(
        await call("purchase-orders", "POST", body, buyer, `inactive-${tag}`),
      );
      await data(
        await call(`materials/${material}`, "PATCH", { active: false }),
      );
      expect(
        (
          await call(
            `purchase-orders/${po.id}/status`,
            "POST",
            { status: "ISSUED" },
            buyer,
          )
        ).status,
      ).toBe(409);
      expect(
        (await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } }))
          .status,
      ).toBe("DRAFT");
      await data(
        await call(`materials/${material}`, "PATCH", { active: true }),
      );
    });
    it("PDF de OC y exportación Excel son archivos legibles; jefe no PDF", async () => {
      const pdf = await call(`purchase-orders/${order}/pdf`);
      expect(pdf.status).toBe(200);
      const doc = await PDFDocument.load(await pdf.arrayBuffer());
      expect(doc.getPageCount()).toBeGreaterThan(0);
      expect(
        (await call(`purchase-orders/${order}/pdf`, "GET", undefined, chief))
          .status,
      ).toBe(403);
      const xlsx = await call("exports/materials");
      expect(xlsx.status).toBe(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(Buffer.from(await xlsx.arrayBuffer()) as never);
      expect(wb.worksheets[0].rowCount).toBeGreaterThan(1);
    });
  },
);
