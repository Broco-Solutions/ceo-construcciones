import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import { Actor } from "../src/core/auth";
import { handlerReports } from "../src/modules/reports";
import { handlerBudgets } from "../src/modules/budgets";
import { handlerProcurement } from "../src/modules/procurement";
import { handlerInventory } from "../src/modules/inventory";

const enabled = process.env.RUN_INTEGRATION === "1";
const suffix = randomUUID();
let actor: Actor;
let chief: Actor;
let workId: string;
let otherWorkId: string;
let categoryId: string;
let materialId: string;
let versionId: string;
async function call(query: string, user = actor, path = "reports/materials") {
  return handlerReports(
    new Request(`http://localhost/api/v1/${path}?${query}`),
    user,
    path.split("/"),
  );
}
describe.skipIf(!enabled)(
  "seguimiento de cantidades y Excel contra PostgreSQL aislado",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
        !/test/i.test(target.pathname)
      )
        throw new Error("Use PostgreSQL local con nombre de base test");
      actor = {
        id: (
          await db.user.create({
            data: {
              email: `reports-${suffix}@example.test`,
              name: "Gerencia prueba",
              role: Role.GERENCIA,
              passwordHash: "no-login",
            },
          })
        ).id,
        role: Role.GERENCIA,
      };
      chief = {
        id: (
          await db.user.create({
            data: {
              email: `reports-chief-${suffix}@example.test`,
              name: "Jefe prueba",
              role: Role.JEFE_OBRA,
              passwordHash: "no-login",
            },
          })
        ).id,
        role: Role.JEFE_OBRA,
      };
      workId = (
        await db.work.create({
          data: { code: `reports-${suffix}`, name: "Obra informes" },
        })
      ).id;
      otherWorkId = (
        await db.work.create({
          data: { code: `reports-other-${suffix}`, name: "Obra ajena" },
        })
      ).id;
      await db.workAssignment.create({ data: { workId, userId: chief.id } });
      const unit = await db.unit.create({
        data: { code: `reports-unit-${suffix}`, name: "kg" },
      });
      categoryId = (
        await db.category.create({
          data: { code: `reports-category-${suffix}`, name: "Cielorrasos" },
        })
      ).id;
      materialId = (
        await db.material.create({
          data: {
            code: `reports-mat-${suffix}`,
            name: "Material informe",
            unitId: unit.id,
          },
        })
      ).id;
      const location = await db.location.create({
        data: {
          code: `reports-location-${suffix}`,
          name: "Ubicación obra",
          kind: "WORK",
          workId,
        },
      });
      const supplier = await db.supplier.create({
        data: { code: `reports-supplier-${suffix}`, name: "Proveedor informe" },
      });
      const budget = await db.budget.create({
        data: { workId, name: "Presupuesto informe" },
      });
      versionId = (
        await db.budgetVersion.create({
          data: {
            budgetId: budget.id,
            number: 1,
            status: "REFERENCE",
            currency: "ARS",
            taxBasis: "EXCLUDED",
            precision: 2,
            roundingMode: "HALF_UP",
            snapshot: {},
            createdById: actor.id,
            materials: {
              create: {
                categoryId,
                materialId,
                unitId: unit.id,
                quantity: "10",
              },
            },
          },
        })
      ).id;
      const request = await db.materialRequest.create({
        data: {
          workId,
          categoryId,
          requestedById: actor.id,
          status: "SUBMITTED",
          lines: { create: { materialId, quantity: "12" } },
        },
      });
      await db.materialRequest.create({
        data: {
          workId,
          categoryId,
          requestedById: actor.id,
          status: "DRAFT",
          lines: { create: { materialId, quantity: "100" } },
        },
      });
      await db.materialRequest.create({
        data: {
          workId,
          categoryId,
          requestedById: actor.id,
          status: "CANCELLED",
          lines: { create: { materialId, quantity: "100" } },
        },
      });
      const order = await db.purchaseOrder.create({
        data: {
          workId,
          requestId: request.id,
          supplierId: supplier.id,
          destinationId: location.id,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          status: "PARTIALLY_RECEIVED",
          createdById: actor.id,
          lines: {
            create: {
              materialId,
              quantity: "20",
              receivedQuantity: "5",
              unitPrice: "20",
            },
          },
        },
        include: { lines: true },
      });
      await db.purchaseOrder.create({
        data: {
          workId,
          supplierId: supplier.id,
          destinationId: location.id,
          currency: "ARS",
          status: "DRAFT",
          createdById: actor.id,
          lines: { create: { materialId, quantity: "100", unitPrice: "20" } },
        },
      });
      await db.receipt.create({
        data: {
          orderId: order.id,
          locationId: location.id,
          receivedById: actor.id,
          idempotencyKey: `report-receipt-${suffix}`,
          lines: { create: { orderLineId: order.lines[0].id, quantity: "5" } },
        },
      });
      await db.stockMovement.create({
        data: {
          type: "CONSUMPTION",
          materialId,
          quantity: "1",
          sourceId: location.id,
          workId,
          categoryId,
          createdById: actor.id,
          idempotencyKey: `report-consume-${suffix}`,
        },
      });
      await db.stockBalance.create({
        data: {
          materialId,
          locationId: location.id,
          physical: "4",
          reserved: "1",
        },
      });
    });
    afterAll(async () => {
      await db.$disconnect();
    });

    it("distingue previsto, pedido, comprado, recibido y consumido sin contar borradores", async () => {
      const response = await call(`workId=${workId}`);
      const result = await response!.json();
      expect(result.data.version.id).toBe(versionId);
      expect(result.data.rows[0]).toMatchObject({
        materialId,
        planned: "10",
        requested: "12",
        purchased: "20",
        consumed: "1",
        received: "5",
        physical: "4",
        reserved: "1",
        available: "3",
        remainingToRequest: "-2",
        remainingToPurchase: "-10",
        consumptionVariance: "-9",
      });
      expect(JSON.stringify(result)).not.toMatch(
        /unitPrice|totalCost|laborCost|taxBasis|currency/,
      );
    });
    it("filtra por rubro sin atribuir existencias ni inventar distribución", async () => {
      const result = await (await call(
        `workId=${workId}&categoryId=${categoryId}&materialId=${materialId}`,
      ))!.json();
      expect(result.data.rows[0]).toMatchObject({
        planned: "10",
        requested: "12",
        purchased: "20",
        received: "5",
        consumed: "1",
        available: null,
        physical: null,
        reserved: null,
      });
      expect(result.data.warnings[0]).toContain(
        "STOCK_SIN_DISTRIBUCION_POR_RUBRO",
      );
    });
    it("limita el jefe a sus obras incluso en exportación", async () => {
      expect((await call(`workId=${workId}`, chief))!.status).toBe(200);
      await expect(call(`workId=${otherWorkId}`, chief)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        call(`workId=${otherWorkId}`, chief, "exports/materials-report"),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        call(`workId=${otherWorkId}&versionId=${versionId}`),
      ).rejects.toMatchObject({ status: 422, code: "INVALID_VERSION" });
    });
    it("documenta falta de presupuesto y valida filtros", async () => {
      const result = await (await call(`workId=${otherWorkId}`))!.json();
      expect(result.data.version).toBeNull();
      expect(result.data.warnings[0]).toContain("SIN_VERSION_DE_REFERENCIA");
      await expect(call("page=0")).rejects.toMatchObject({ status: 422 });
      await expect(call(`workId=${workId}&pageSize=101`)).rejects.toMatchObject(
        { status: 422 },
      );
    });
    it("exporta XLSX real con mismos datos y precisión decimal como texto", async () => {
      const response = await call(
        `workId=${workId}`,
        chief,
        "reports/materials/export",
      );
      expect(response!.headers.get("content-type")).toContain("spreadsheetml");
      const bytes = await response!.arrayBuffer();
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(bytes);
      const sheet = book.getWorksheet("Materiales")!;
      expect(sheet.getCell("D2").value).toBe("10");
      expect(sheet.getCell("E2").value).toBe("12");
      expect(sheet.getCell("F2").value).toBe("20");
      expect(sheet.getCell("G2").value).toBe("5");
      expect(sheet.getCell("H2").value).toBe("1");
      expect(book.getWorksheet("Criterios")!.getCell("B4").value).toContain(
        "conservar precisión",
      );
    });

    it("recorre presupuesto→pedido→reserva/compra→recepción→transferencia→consumo→reporte Excel mediante handlers reales", async () => {
      const run = async (path: string, body?: unknown, user = actor) => {
        const request = new Request(`http://localhost/api/v1/${path}`, {
          method: body === undefined ? "GET" : "POST",
          headers: { "idempotency-key": randomUUID() },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const segments = path.split("/");
        const response =
          (await handlerBudgets(request, user, segments)) ??
          (await handlerProcurement(request, user, segments)) ??
          (await handlerInventory(request, user, segments)) ??
          (await handlerReports(request, user, segments));
        expect(response).not.toBeNull();
        return (await response!.json()).data;
      };
      const unique = randomUUID();
      // Only master data is seeded; every budget and physical event uses production handlers.
      const work = await db.work.create({
        data: { code: `flow-work-${unique}`, name: "Obra flujo completo" },
      });
      const warehouse = await db.location.create({
        data: {
          code: `flow-depot-${unique}`,
          name: "Galpón flujo completo",
          kind: "WAREHOUSE",
        },
      });
      const location = await db.location.create({
        data: {
          code: `flow-loc-${unique}`,
          name: "Obra flujo completo",
          kind: "WORK",
          workId: work.id,
        },
      });
      const unit = await db.unit.create({
        data: { code: `flow-kg-${unique}`, name: "kg" },
      });
      const material = await db.material.create({
        data: {
          code: `flow-cement-${unique}`,
          name: "Cemento flujo completo",
          unitId: unit.id,
        },
      });
      const supplier = await db.supplier.create({
        data: {
          code: `flow-supplier-${unique}`,
          name: "Proveedor flujo completo",
        },
      });
      await db.workAssignment.create({
        data: { workId: work.id, userId: chief.id },
      });
      const item = await run("apu-items", {
        name: "Aplicado cal - cemento",
        categoryId,
        unitId: unit.id,
        laborCost: "0",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [{ materialId: material.id, coefficient: "4.5" }],
      });
      const computation = await run("computations", {
        workId: work.id,
        name: "100 m²",
        lines: [{ itemId: item.id, quantity: "100" }],
      });
      const budget = await run("budgets", {
        workId: work.id,
        name: "Referencia flujo completo",
      });
      const version = await run(`budgets/${budget.id}/versions`, {
        computationId: computation.id,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        precision: 2,
        roundingMode: "HALF_UP",
        roundingBoundary: "EXTENDED_LINE_COMPONENTS",
        prices: [{ materialId: material.id, unitPrice: "2" }],
      });
      await run(`budget-versions/${version.id}/reference`, {});
      const request = await run(
        "requests",
        {
          workId: work.id,
          categoryId,
          requiredAt: "2026-12-01T00:00:00.000Z",
          lines: [{ materialId: material.id, quantity: "450" }],
        },
        chief,
      );
      await run("movements", {
        type: "INITIAL",
        materialId: material.id,
        quantity: "100",
        destinationId: warehouse.id,
      });
      const reservation = await run("reservations", {
        materialId: material.id,
        sourceId: warehouse.id,
        workId: work.id,
        requestLineId: request.lines[0].id,
        quantity: "100",
      });
      const quote = await run("quotations", {
        requestId: request.id,
        supplierId: supplier.id,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [
          {
            materialId: material.id,
            quantity: "350",
            unitPrice: "2",
            baseQuantity: "1",
          },
        ],
      });
      await run(`quotations/${quote.id}/select`, {});
      const order = await run("purchase-orders", {
        workId: work.id,
        requestId: request.id,
        quotationId: quote.id,
        supplierId: supplier.id,
        destinationId: warehouse.id,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        lines: [
          {
            materialId: material.id,
            quantity: "350",
            unitPrice: "2",
            baseQuantity: "1",
          },
        ],
      });
      await run(`purchase-orders/${order.id}/status`, { status: "ISSUED" });
      const receipt = await run(`purchase-orders/${order.id}/receipts`, {
        locationId: warehouse.id,
        deliveryNote: "Remito flujo completo",
        lines: [{ orderLineId: order.lines[0].id, quantity: "350" }],
      });
      const receivedCoverage = await db.receiptCoverage.findUniqueOrThrow({
        where: { receiptLineId: receipt.lines[0].id },
      });
      await run("movements", {
        type: "TRANSFER",
        materialId: material.id,
        quantity: "100",
        sourceId: warehouse.id,
        destinationId: location.id,
        reservationId: reservation.id,
      });
      await run("movements", {
        type: "TRANSFER",
        materialId: material.id,
        quantity: "350",
        sourceId: warehouse.id,
        destinationId: location.id,
        reservationId: receivedCoverage.reservationId,
      });
      await run(
        "movements",
        {
          type: "CONSUMPTION",
          materialId: material.id,
          quantity: "120",
          sourceId: location.id,
          categoryId,
        },
        chief,
      );
      const report = await (await call(
        `workId=${work.id}&materialId=${material.id}`,
        chief,
      ))!.json();
      expect(report.data.rows[0]).toMatchObject({
        planned: "450",
        requested: "450",
        purchased: "350",
        received: "350",
        consumed: "120",
        available: "330",
      });
      expect(
        (
          await db.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe("FULFILLED");
      expect(
        (
          await db.stockBalance.findUniqueOrThrow({
            where: {
              materialId_locationId: {
                materialId: material.id,
                locationId: warehouse.id,
              },
            },
          })
        ).physical.toString(),
      ).toBe("0");
      const exportResponse = await call(
        `workId=${work.id}&materialId=${material.id}`,
        chief,
        "reports/materials/export",
      );
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await exportResponse!.arrayBuffer());
      expect(workbook.getWorksheet("Materiales")!.getCell("D2").value).toBe(
        "450",
      );
      expect(workbook.getWorksheet("Materiales")!.getCell("K2").value).toBe(
        "330",
      );
    });
  },
);
