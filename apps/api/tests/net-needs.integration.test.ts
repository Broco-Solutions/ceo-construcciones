import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";
let f: Awaited<ReturnType<typeof closureFixture>>,
  material: string,
  category: string,
  unit: string,
  client: string,
  supplier: string,
  warehouse: string,
  w1: string,
  w2: string,
  loc1: string,
  loc2: string;
async function work(name: string, planned = "100") {
  const w = await f.data("works", "POST", {
    code: `${name}-${randomUUID()}`,
    name,
    clientId: client,
  });
  const loc = await db.location.findUniqueOrThrow({ where: { workId: w.id } });
  if (planned) {
    const b = await f.data("budget-editor", "POST", {
      workId: w.id,
      name: "Referencia",
    });
    await f.data(`budget-editor/${b.id}`, "PUT", {
      revision: 1,
      content: {
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
            name: "Actividad neta",
            categoryId: category,
            category: "Rubro neto",
            unitId: unit,
            unit: "u",
            quantity: planned,
            laborUnitCost: "0",
            directUnitCost: "0",
            status: "ACTIVE",
            materials: [
              {
                materialId: material,
                name: "Material neto",
                unitId: unit,
                unit: "u",
                coefficient: "1",
                unitPrice: "1",
                sourcePriceId: null,
              },
            ],
          },
        ],
      },
    });
    await f.data(`budget-editor/${b.id}/issue`, "POST", { revision: 2 });
  }
  return { id: w.id, location: loc.id };
}
async function need(workId: string) {
  const n = await f.data(`net-needs?workId=${workId}`);
  return {
    ...n,
    row: n.rows.find((r: { materialId: string }) => r.materialId === material),
  };
}
const req = (workId: string, quantity: string, coverageHash?: string) => ({
  workId,
  categoryId: category,
  requiredAt: "2027-01-01T00:00:00Z",
  lines: [{ materialId: material, quantity }],
  ...(coverageHash ? { coverageHash } : {}),
});
async function order(
  workId: string,
  destinationId: string,
  requestId?: string,
) {
  const o = await f.data("purchase-orders", "POST", {
    workId,
    destinationId,
    supplierId: supplier,
    requestId,
    currency: "ARS",
    taxBasis: "EXCLUDED",
    lines: [
      {
        materialId: material,
        quantity: "40",
        unitPrice: "1",
        baseQuantity: "1",
      },
    ],
  });
  await f.data(`purchase-orders/${o.id}/status`, "POST", { status: "ISSUED" });
  return o;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "F6: cobertura neta trazada sin doble conteo",
  () => {
    beforeAll(async () => {
      f = await closureFixture();
      unit = (
        await db.unit.create({
          data: { code: f.tag, name: "Unidad neta", symbol: "u" },
        })
      ).id;
      category = (
        await db.category.create({ data: { code: f.tag, name: "Rubro neto" } })
      ).id;
      material = (
        await db.material.create({
          data: { code: f.tag, name: "Material neto", unitId: unit },
        })
      ).id;
      client = (
        await f.data("clients", "POST", {
          code: f.tag,
          name: "Cliente de cobertura",
        })
      ).id;
      supplier = (
        await db.supplier.create({
          data: { code: f.tag, name: "Proveedor neto" },
        })
      ).id;
      warehouse = (
        await db.location.create({
          data: { code: f.tag, name: "Galpón neto", kind: "WAREHOUSE" },
        })
      ).id;
      const a = await work("Obra neta A"),
        b = await work("Obra neta B");
      w1 = a.id;
      loc1 = a.location;
      w2 = b.id;
      loc2 = b.location;
    });
    afterAll(() => db.$disconnect());
    it("T30/T31: previsto100 → pedido40 → OC40 → recepción20 → consumo5 conserva faltante60", async () => {
      const r = await f.data("requests", "POST", req(w1, "40"));
      expect((await need(w1)).row.remaining).toBe("60");
      const o = await order(w1, loc1, r.id);
      expect((await need(w1)).row.remaining).toBe("60");
      await f.data(`purchase-orders/${o.id}/receipts`, "POST", {
        locationId: loc1,
        deliveryNote: "Neto directo",
        lines: [{ orderLineId: o.lines[0].id, quantity: "20" }],
      });
      let n = await need(w1);
      expect(n.row).toMatchObject({
        workAvailable: "20",
        pendingCoverage: "20",
        remaining: "60",
        exact: true,
      });
      await f.data("movements", "POST", {
        type: "CONSUMPTION",
        materialId: material,
        quantity: "5",
        sourceId: loc1,
        categoryId: category,
      });
      n = await need(w1);
      expect(n.row).toMatchObject({
        consumed: "5",
        workAvailable: "15",
        pendingCoverage: "20",
        remaining: "60",
      });
    });
    it("T31: OC de obra recibida en galpón queda reservada; traslado sustituye cobertura por físico", async () => {
      const o = await order(w2, warehouse);
      const receipt = await f.data(`purchase-orders/${o.id}/receipts`, "POST", {
        locationId: warehouse,
        deliveryNote: "Asignada a B",
        lines: [{ orderLineId: o.lines[0].id, quantity: "20" }],
      });
      expect((await need(w2)).row).toMatchObject({
        workAvailable: "0",
        pendingCoverage: "40",
        remaining: "60",
        generalAvailable: "0",
        exact: true,
      });
      const link = await db.receiptCoverage.findUniqueOrThrow({
        where: { receiptLineId: receipt.lines[0].id },
      });
      await f.data("movements", "POST", {
        type: "TRANSFER",
        materialId: material,
        quantity: "20",
        sourceId: warehouse,
        destinationId: loc2,
        reservationId: link.reservationId,
      });
      expect((await need(w2)).row).toMatchObject({
        workAvailable: "20",
        pendingCoverage: "20",
        remaining: "60",
        exact: true,
      });
    });
    it("T32: stock general no cubre ambas obras; reserva y traslado explícitos conservan cobertura", async () => {
      const general = await db.location.create({
        data: {
          code: `g-${f.tag}`,
          name: "General sin asignar",
          kind: "WAREHOUSE",
        },
      });
      await f.data("movements", "POST", {
        type: "INITIAL",
        materialId: material,
        quantity: "40",
        destinationId: general.id,
      });
      expect((await need(w1)).row.remaining).toBe("60");
      expect((await need(w2)).row.remaining).toBe("60");
      const r = await f.data("reservations", "POST", {
        workId: w1,
        materialId: material,
        sourceId: general.id,
        quantity: "30",
      });
      expect((await need(w1)).row.remaining).toBe("30");
      expect((await need(w2)).row.remaining).toBe("60");
      expect(
        (
          await f.call("reservations", "POST", {
            workId: w2,
            materialId: material,
            sourceId: general.id,
            quantity: "20",
          })
        ).status,
      ).toBe(409);
      await f.data("movements", "POST", {
        type: "TRANSFER",
        materialId: material,
        quantity: "30",
        sourceId: general.id,
        destinationId: loc1,
        reservationId: r.id,
      });
      expect((await need(w1)).row).toMatchObject({
        workAvailable: "45",
        pendingCoverage: "20",
        consumed: "5",
        remaining: "30",
        exact: true,
      });
    });
    it("T33: cancelar pendiente independiente y devolver sobrante recalcula sin borrar historia", async () => {
      const r = await f.data("requests", "POST", req(w1, "20"));
      expect((await need(w1)).row.remaining).toBe("10");
      await f.data(`requests/${r.id}/status`, "POST", { status: "CANCELLED" });
      expect((await need(w1)).row.remaining).toBe("30");
      await f.data("movements", "POST", {
        type: "RETURN",
        materialId: material,
        quantity: "5",
        sourceId: loc1,
        destinationId: warehouse,
      });
      expect((await need(w1)).row.remaining).toBe("35");
      expect(
        await db.materialRequest.count({
          where: { id: r.id, status: "CANCELLED" },
        }),
      ).toBe(1);
    });
    it("T29/T34: manual sin referencia; confirmaciones simultáneas revalidan y repetición no duplica", async () => {
      const manual = await work("Sin referencia", "");
      await f.data("requests", "POST", req(manual.id, "7"));
      expect((await need(manual.id)).row.planned).toBeNull();
      const concurrent = await work("Concurrente"),
        n = await need(concurrent.id),
        body = req(concurrent.id, "40", n.coverageHash),
        keys = [randomUUID(), randomUUID()];
      const responses = await Promise.all(
        keys.map((k) => f.call("requests", "POST", body, k)),
      );
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const winner = responses.findIndex((r) => r.status === 201);
      await f.data("requests", "POST", body, keys[winner]);
      expect(
        await db.materialRequest.count({ where: { workId: concurrent.id } }),
      ).toBe(1);
    });
    it("T33: otra referencia recalcula previsto/exceso sin tocar compras ni movimientos", async () => {
      const previous = await db.budgetVersion.findFirstOrThrow({
          where: { budget: { workId: w1 }, status: "REFERENCE" },
        }),
        before = await db.stockMovement.count({ where: { workId: w1 } });
      const b = await f.data("budget-editor", "POST", {
          workId: w1,
          name: "Referencia menor",
          sourceVersionId: previous.id,
        }),
        editor = await f.data(`budget-editor/${b.id}`);
      editor.draft.content.lines[0].quantity = "20";
      await f.data(`budget-editor/${b.id}`, "PUT", {
        revision: 1,
        content: editor.draft.content,
      });
      const issued = await f.data(`budget-editor/${b.id}/issue`, "POST", {
        revision: 2,
      });
      await f.data(`budget-versions/${issued.id}/reference`, "POST", {});
      expect((await need(w1)).row).toMatchObject({
        planned: "20",
        covered: "65",
        remaining: "0",
        excess: "45",
      });
      expect(await db.stockMovement.count({ where: { workId: w1 } })).toBe(
        before,
      );
    });
  },
);
