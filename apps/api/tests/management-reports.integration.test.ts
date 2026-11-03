import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";
let f: Awaited<ReturnType<typeof closureFixture>>,
  client: string,
  w1: string,
  w2: string,
  unit: string,
  category: string,
  supplier: string,
  materials: string[],
  general: string,
  oc1: string,
  oc2: string;
async function budget(workId: string, cost: string, issue = true) {
  const b = await f.data("budget-editor", "POST", {
    workId,
    name: `Presupuesto ${cost}`,
  });
  const content = {
    currency: "ARS",
    taxBasis: "EXCLUDED",
    markup: "0",
    conditions: "",
    exclusions: "",
    observations: "",
    deadline: "",
    lines: [
      {
        key: randomUUID(),
        itemId: null,
        code: null,
        name: "Costo directo real del fixture",
        categoryId: category,
        category: "VARIOS",
        unitId: unit,
        unit: "gl",
        quantity: "1",
        laborUnitCost: "0",
        directUnitCost: cost,
        status: "ACTIVE",
        materials: [],
      },
    ],
  };
  await f.data(`budget-editor/${b.id}`, "PUT", { revision: 1, content });
  if (issue)
    await f.data(`budget-editor/${b.id}/issue`, "POST", { revision: 2 });
  return { id: b.id, content };
}
async function order(
  workId: string | undefined,
  currency: string,
  lines: {
    materialId: string;
    quantity: string;
    unitPrice: string;
    baseQuantity: string;
    presentationId?: string;
  }[],
) {
  const dest = workId
    ? (await db.location.findUniqueOrThrow({ where: { workId } })).id
    : general;
  const o = await f.data("purchase-orders", "POST", {
    workId,
    destinationId: dest,
    supplierId: supplier,
    currency,
    taxBasis: "EXCLUDED",
    lines,
  });
  await f.data(`purchase-orders/${o.id}/status`, "POST", { status: "ISSUED" });
  return o;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "F7: indicadores y exportaciones conciliadas",
  () => {
    beforeAll(async () => {
      f = await closureFixture();
      unit = (
        await db.unit.create({
          data: { code: f.tag, name: "Unidad de indicadores", symbol: "gl" },
        })
      ).id;
      category = (
        await db.category.create({
          data: { code: f.tag, name: "VARIOS de indicadores" },
        })
      ).id;
      client = (
        await f.data("clients", "POST", {
          code: f.tag,
          name: "=Cliente sintético",
        })
      ).id;
      w1 = (
        await f.data("works", "POST", {
          code: `a-${f.tag}`,
          name: "Primera obra",
          clientId: client,
        })
      ).id;
      w2 = (
        await f.data("works", "POST", {
          code: `b-${f.tag}`,
          name: "Segunda obra",
          clientId: client,
          status: "COMPLETED",
        })
      ).id;
      supplier = (
        await db.supplier.create({
          data: { code: f.tag, name: "Proveedor de indicadores" },
        })
      ).id;
      materials = await Promise.all(
        [1, 2].map(
          async (n) =>
            (
              await db.material.create({
                data: {
                  code: `${n}-${f.tag}`,
                  name: `Material ${n}`,
                  unitId: unit,
                },
              })
            ).id,
        ),
      );
      general = (
        await db.location.create({
          data: { code: f.tag, name: "Galpón general", kind: "WAREHOUSE" },
        })
      ).id;
      const b = await budget(w1, "10");
      await f.data(`budget-editor/${b.id}`, "PUT", {
        revision: 2,
        content: { ...b.content, markup: "50" },
      });
      await f.data(`budget-editor/${b.id}/issue`, "POST", { revision: 3 });
      await budget(w1, "20");
      await budget(w2, "30");
      await budget(w1, "999", false);
      const p = await db.presentation.create({
        data: {
          materialId: materials[0],
          supplierId: supplier,
          name: "Tres unidades",
          baseQuantity: "3",
        },
      });
      oc1 = (
        await order(w1, "ARS", [
          {
            materialId: materials[0],
            quantity: "2",
            unitPrice: "1",
            baseQuantity: "3",
            presentationId: p.id,
          },
          {
            materialId: materials[1],
            quantity: "3",
            unitPrice: "2",
            baseQuantity: "1",
          },
        ])
      ).id;
      oc2 = (
        await order(w2, "USD", [
          {
            materialId: materials[0],
            quantity: "5",
            unitPrice: "2",
            baseQuantity: "1",
          },
        ])
      ).id;
      await order(undefined, "ARS", [
        {
          materialId: materials[0],
          quantity: "100",
          unitPrice: "1",
          baseQuantity: "1",
        },
      ]);
    });
    afterAll(() => db.$disconnect());
    it("T41–43: una emisión vigente por presupuesto, dos obras, sin multiplicar OC ni imputar compra general", async () => {
      const r = await f.data(`reports/clients?clientId=${client}`);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({
        activeWorks: 1,
        completedWorks: 1,
        unissuedBudgets: 1,
        budgeted: [{ currency: "ARS", taxBasis: "EXCLUDED", amount: "65.00" }],
        purchases: [
          { currency: "ARS", taxBasis: "EXCLUDED", amount: "6.67" },
          { currency: "USD", taxBasis: "EXCLUDED", amount: "10.00" },
        ],
      });
      const purchases = await f.data(`reports/purchases?clientId=${client}`);
      expect(purchases.rows).toHaveLength(2);
      expect(
        purchases.rows.find((r: { id: string }) => r.id === oc1).totalAmount,
      ).toBe("6.67");
    });
    it("T44: totales completos coinciden con Excel, filtros antes de paginar y corte de día argentino", async () => {
      await db.purchaseOrder.update({
        where: { id: oc1 },
        data: { createdAt: new Date("2026-11-01T02:59:59Z") },
      });
      await db.purchaseOrder.update({
        where: { id: oc2 },
        data: { createdAt: new Date("2026-11-01T03:00:00Z") },
      });
      const filter = `clientId=${client}&supplierId=${supplier}&from=2026-11-01&to=2026-11-01`,
        r = await f.data(`reports/purchases?${filter}&pageSize=1`);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].id).toBe(oc2);
      expect(r.totals.purchases).toEqual([
        { currency: "USD", taxBasis: "EXCLUDED", amount: "10.00" },
      ]);
      const response = await f.call(`reports/purchases/export?${filter}`),
        book = new ExcelJS.Workbook();
      await book.xlsx.load(await response.arrayBuffer());
      const sheet = book.worksheets[0];
      expect(sheet.rowCount).toBe(2);
      expect(sheet.getRow(2).getCell(8).value).toBe("10.00");
      const all = await f.data(
        `reports/purchases?clientId=${client}&pageSize=1`,
      );
      expect(all.rows).toHaveLength(1);
      expect(all.totals.purchases).toHaveLength(2);
      const invalid = await f.call("reports/purchases?from=2026-02-30");
      expect(invalid.status).toBe(422);
    });
    it("T04/T05/T51: Admin y Jefe no acceden por enlace ni exportación", async () => {
      for (const role of ["ADMINISTRACION", "JEFE_OBRA"] as const)
        for (const path of [
          "reports/clients",
          "reports/purchases",
          "reports/clients/export",
          "reports/purchases/export",
        ])
          expect(
            (await f.call(path, "GET", undefined, undefined, role)).status,
          ).toBe(403);
    });
    it("T43: una OC histórica sin política no fabrica importe ni se suma como cero",async()=>{
      const actor=await db.user.findUniqueOrThrow({where:{email:`${f.tag}-GERENCIA@test.invalid`}}),location=await db.location.findUniqueOrThrow({where:{workId:w1}}),presentation=await db.presentation.create({data:{materialId:materials[0],supplierId:supplier,name:'Presentación histórica de tres unidades',baseQuantity:'3'}});
      const legacy=await db.purchaseOrder.create({data:{supplierId:supplier,workId:w1,destinationId:location.id,currency:'ARS',taxBasis:'EXCLUDED',status:'ISSUED',createdById:actor.id,lines:{create:{materialId:materials[0],presentationId:presentation.id,quantity:'1',unitPrice:'1',baseQuantity:'3'}}}});
      const r=await f.data(`reports/purchases?clientId=${client}`);expect(r.rows.find((o:{id:string})=>o.id===legacy.id).totalAmount).toBeNull();expect(r.totals.unvaluedPurchases).toBe(1);expect(r.totals.purchases).toEqual([{currency:'ARS',taxBasis:'EXCLUDED',amount:'6.67'},{currency:'USD',taxBasis:'EXCLUDED',amount:'10.00'}]);
      const clients=await f.data(`reports/clients?clientId=${client}`);expect(clients.rows[0].unvaluedPurchases).toBe(1);
      const response=await f.call(`reports/purchases/export?clientId=${client}`),book=new ExcelJS.Workbook();await book.xlsx.load(await response.arrayBuffer());expect(book.worksheets[0].getRow(2).getCell(8).value).toMatch(/Sin importe comparable/);
    });
  },
);
