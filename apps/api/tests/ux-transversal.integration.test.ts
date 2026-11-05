import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { pdfFixture } from "./helpers/pdf-fixture";
import {
  calculateCommercial,
  editorContentSchema,
} from "../src/modules/commercial-domain";
import { commercialPdfV1 } from "../src/modules/commercial-pdf-v1";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "UX transversal: búsqueda, selección y lotes reales",
  () => {
    let f: Awaited<ReturnType<typeof closureFixture>>,
      unit: any,
      warehouse: any,
      work: any,
      dest: any,
      mats: any[],
      clientIds: string[] = [];
    beforeAll(async () => {
      f = await closureFixture();
      unit = await f.data("units", "POST", {
        code: "UX-" + f.tag,
        name: "Unidad de prueba",
      });
      warehouse = await f.data("locations", "POST", {
        code: "UX-L-" + f.tag,
        name: "Origen UX",
        kind: "WAREHOUSE",
      });
      const client = await f.data("clients", "POST", {
        name: "Cliente UX",
        code: "UX-CL-" + f.tag,
      });
      work = await f.data("works", "POST", {
        clientId: client.id,
        code: "UX-W-" + f.tag,
        name: "Obra UX",
      });
      dest = await db.location.findFirstOrThrow({ where: { workId: work.id } });
      mats = [];
      for (let i = 0; i < 3; i++)
        mats.push(
          await f.data("materials", "POST", {
            code: "UX-M-" + f.tag + "-" + i,
            name: "Material " + i,
            unitId: unit.id,
            minimum: "4",
          }),
        );
      await db.client.createMany({
        data: Array.from({ length: 65 }, (_, i) => ({
          code: "UX-C-" + f.tag + "-" + String(i).padStart(3, "0"),
          name:
            "Grupo " +
            f.tag +
            " " +
            (i === 64 ? "Árbol   Ñandú" : "Cliente " + i),
        })),
      });
      clientIds = (
        await db.client.findMany({
          where: { code: { startsWith: "UX-C-" + f.tag } },
          orderBy: { code: "asc" },
        })
      ).map((r) => r.id);
    });
    afterAll(() => db.$disconnect());
    it("busca tildes y espacios antes de paginar, y conserva ID explícito", async () => {
      const r = await f.call(
        "clients?search=" +
          encodeURIComponent("arbol nandu " + f.tag) +
          "&pageSize=20",
      );
      expect(r.status).toBe(200);
      const j = await r.json();
      expect(j.pagination.total).toBe(1);
      expect(j.data[0].id).toBe(clientIds[64]);
      const exact = await f.data("clients?id=" + clientIds[64]);
      expect(exact).toHaveLength(1);
      expect((await f.call('selections','POST',{resource:'clients',filters:{ids:clientIds[0]},ids:[clientIds[1]]})).status).toBe(409);
      expect(
        (
          await f.call(
            "clients?search=arbol",
            "GET",
            undefined,
            undefined,
            "JEFE_OBRA",
          )
        ).status,
      ).toBe(403);
    });
    it("congela tres páginas, excluye y exporta identidades; nuevas no se incorporan y cambios conflictúan", async () => {
      const filters = { search: "Grupo " + f.tag };
      const snap = await f.data("selections", "POST", {
        resource: "clients",
        filters,
      });
      expect(snap.rows).toHaveLength(65);
      await db.client.create({
        data: {
          code: "UX-C-" + f.tag + "-new",
          name: "Grupo " + f.tag + " posterior",
        },
      });
      const selected = clientIds.slice(1),
        res = await f.call("selections/export", "POST", {
          token: snap.token,
          ids: selected,
        });
      expect(res.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
      expect(workbook.worksheets[0].rowCount).toBe(65);
      expect(workbook.getWorksheet("Contexto")).toBeDefined();
      expect(workbook.worksheets[0].getColumn(1).values).not.toContain(
        "UX-C-" + f.tag + "-new",
      );
      await db.client.update({
        where: { id: selected[0] },
        data: { name: "Modificado" },
      });
      expect(
        (
          await f.call("selections/export", "POST", {
            token: snap.token,
            ids: selected,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await f.call("selections/export", "POST", {
            token: snap.token,
            ids: [warehouse.id],
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await f.call(
            "selections/export",
            "POST",
            { token: snap.token },
            undefined,
            "COMPRAS",
          )
        ).status,
      ).toBe(409);
    });
    it("mínimos sin saldo: valor propio, cero y herencia; preview no escribe; replay no duplica", async () => {
      const count = await db.stockMovement.count(),
        rows = mats.map((m, i) => ({
          materialId: m.id,
          locationId: warehouse.id,
          minimum: i === 0 ? "6" : i === 1 ? "0" : null,
        }));
      const plan = await f.data("stock-minimum-batches/preview", "POST", {
        rows,
      });
      expect(plan.created).toBe(2);
      expect(plan.unchanged).toBe(1);
      expect(
        await db.stockBalance.count({
          where: { materialId: { in: mats.map((m) => m.id) } },
        }),
      ).toBe(0);
      const key = randomUUID(),
        body = { rows, planHash: plan.planHash };
      const results = await Promise.all([
        f.data("stock-minimum-batches", "POST", body, key),
        f.data("stock-minimum-batches", "POST", body, key),
      ]);
      expect(results[0].batchId).toBe(results[1].batchId);
      const balances = await db.stockBalance.findMany({
        where: { materialId: { in: mats.map((m) => m.id) } },
      });
      expect(balances).toHaveLength(2);
      expect(
        balances.every((b) => b.physical.isZero() && b.reserved.isZero()),
      ).toBe(true);
      expect(await db.stockMovement.count()).toBe(count);
      const inherit = [
          { materialId: mats[0].id, locationId: warehouse.id, minimum: null },
        ],
        p = await f.data("stock-minimum-batches/preview", "POST", {
          rows: inherit,
        });
      await f.data("stock-minimum-batches", "POST", {
        rows: inherit,
        planHash: p.planHash,
      });
      expect(
        (
          await db.stockBalance.findFirstOrThrow({
            where: { materialId: mats[0].id },
          })
        ).minimum,
      ).toBeNull();
      const bad = [...rows, { ...rows[0], materialId: "missing" }];
      expect(
        (await f.call("stock-minimum-batches/preview", "POST", { rows: bad }))
          .status,
      ).toBe(404);
      const next = await f.data("stock-minimum-batches/preview", "POST", {
        rows,
      });
      await db.material.update({
        where: { id: mats[0].id },
        data: { minimum: "9" },
      });
      expect(
        (
          await f.call("stock-minimum-batches", "POST", {
            rows,
            planHash: next.planHash,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await f.call(
            "stock-minimum-batches/preview",
            "POST",
            { rows },
            undefined,
            "COMPUTO",
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await f.call(
            "stock-minimum-batches/preview",
            "POST",
            { rows },
            undefined,
            "ADMINISTRACION",
          )
        ).status,
      ).toBe(403);
    });
    it("movimientos: lote atómico compartido, reservas, reintento y consumo distintos de transferencia", async () => {
      for (const m of mats)
        await f.data("movements", "POST", {
          type: "INITIAL",
          materialId: m.id,
          destinationId: warehouse.id,
          quantity: "10",
        });
      const reservation = await f.data("reservations", "POST", {
        materialId: mats[0].id,
        sourceId: warehouse.id,
        workId: work.id,
        quantity: "4",
      });
      const input = {
        header: {
          type: "TRANSFER",
          sourceId: warehouse.id,
          destinationId: dest.id,
        },
        rows: [
          {
            materialId: mats[0].id,
            quantity: "4",
            reservationId: reservation.id,
          },
          { materialId: mats[1].id, quantity: "3" },
        ],
      };
      const preview = await f.data("movement-batches/preview", "POST", input),
        key = randomUUID(),
        body = { ...input, planHash: preview.planHash };
      const a = await f.data("movement-batches", "POST", body, key),
        b = await f.data("movement-batches", "POST", body, key);
      expect(a.batchId).toBe(b.batchId);
      expect(a.count).toBe(2);
      expect(
        (
          await db.stockBalance.findFirstOrThrow({
            where: { materialId: mats[0].id, locationId: warehouse.id },
          })
        ).physical.toFixed(),
      ).toBe("6");
      expect(
        (
          await db.reservation.findUniqueOrThrow({
            where: { id: reservation.id },
          })
        ).status,
      ).toBe("FULFILLED");
      const consume = {
        header: { type: "CONSUMPTION", sourceId: dest.id },
        rows: [
          { materialId: mats[0].id, quantity: "1" },
          { materialId: mats[1].id, quantity: "1" },
        ],
      };
      const cp = await f.data("movement-batches/preview", "POST", consume);
      await f.data("movement-batches", "POST", {
        ...consume,
        planHash: cp.planHash,
      });
      const returns = {
        header: {
          type: "RETURN",
          sourceId: dest.id,
          destinationId: warehouse.id,
        },
        rows: [
          { materialId: mats[0].id, quantity: "1" },
          { materialId: mats[1].id, quantity: "1" },
        ],
      };
      const rp = await f.data("movement-batches/preview", "POST", returns);
      await f.data("movement-batches", "POST", {
        ...returns,
        planHash: rp.planHash,
      });
      expect(
        (
          await db.stockBalance.findFirstOrThrow({
            where: { materialId: mats[0].id, locationId: dest.id },
          })
        ).physical.toFixed(),
      ).toBe("2");
      const fail = {
          header: {
            type: "TRANSFER",
            sourceId: warehouse.id,
            destinationId: dest.id,
          },
          rows: [
            { materialId: mats[0].id, quantity: "1" },
            { materialId: mats[1].id, quantity: "999" },
          ],
        },
        before = await db.stockMovement.count();
      expect(
        (await f.call("movement-batches/preview", "POST", fail)).status,
      ).toBe(409);
      expect(await db.stockMovement.count()).toBe(before);
      expect(
        (
          await f.call("movement-batches/preview", "POST", {
            ...input,
            rows: [input.rows[0], input.rows[0]],
          })
        ).status,
      ).toBe(422);
      const p = await f.data("movement-batches/preview", "POST", consume);
      await f.data("movements", "POST", {
        type: "CONSUMPTION",
        sourceId: dest.id,
        materialId: mats[0].id,
        quantity: "1",
      });
      expect(
        (
          await f.call("movement-batches", "POST", {
            ...consume,
            planHash: p.planHash,
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await f.call(
            "movement-batches/preview",
            "POST",
            consume,
            undefined,
            "JEFE_OBRA",
          )
        ).status,
      ).toBe(403);
    });
    it("R1 V1 previa es idéntica; cambiar sólo plantilla no emite R2; cambios reales emiten V2", async () => {
      const category = await f.data("categories", "POST", {
          name: "PDF UX",
          code: "UX-PDF-" + f.tag,
        }),
        fixture = pdfFixture();
      const content = {
        ...fixture.content,
        lines: fixture.content.lines.map((l) => ({
          ...l,
          categoryId: category.id,
          category: category.name,
          unitId: unit.id,
        })),
      };
      const budget = await f.data("budget-editor", "POST", {
        workId: work.id,
        name: "Histórico PDF UX",
      });
      await f.data(`budget-editor/${budget.id}`, "PUT", {
        revision: 1,
        content,
      });
      const savedContent = editorContentSchema.parse(
          (
            await db.budgetDraft.findUniqueOrThrow({
              where: { budgetId: budget.id },
            })
          ).content,
        ),
        calculation = calculateCommercial(savedContent);
      const w = await db.work.findUniqueOrThrow({
          where: { id: work.id },
          include: { client: true },
        }),
        actor = await db.user.findUniqueOrThrow({
          where: { email: `${f.tag}-GERENCIA@test.invalid` },
        });
      const commercial = {
        client: {
          name: w.client!.name,
          taxId: w.client!.taxId,
          address: w.client!.address,
        },
        work: { name: w.name, address: w.address },
        name: budget.name,
        conditions: savedContent.conditions,
        exclusions: savedContent.exclusions,
        observations: savedContent.observations,
        deadline: savedContent.deadline,
        pdfTemplateVersion: 1,
        nonPricedLines: [],
      };
      const date = new Date("2026-10-01T12:00:00Z"),
        snapshot = {
          ...calculation,
          editorContent: savedContent,
          commercial: { ...commercial, issuedAt: date.toISOString() },
          computationId: budget.id,
          computationName: budget.name,
          overrides: [],
        };
      // Insert a historical fixture once; the immutability trigger stays enabled.
      const r1 = await db.budgetVersion.create({
        data: {
          budgetId: budget.id,
          number: 1,
          status: "DRAFT",
          currency: savedContent.currency,
          taxBasis: savedContent.taxBasis,
          precision: 2,
          roundingMode: "HALF_UP",
          createdById: actor.id,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          issue: {
            create: {
              issuedAt: date,
              commercialTotal: calculation.commercialTotal,
              contentHash: createHash("sha256")
                .update(JSON.stringify({ content: savedContent, commercial }))
                .digest("hex"),
            },
          },
        },
      });
      const before = Buffer.from(
        await (await f.call(`budget-issues/${r1.id}/pdf`)).arrayBuffer(),
      );
      expect(before).toEqual(
        Buffer.from(await commercialPdfV1(snapshot, snapshot.commercial, "R1")),
      );
      const same = await f.data(`budget-editor/${budget.id}/issue`, "POST", {
        revision: 2,
      });
      expect(same.id).toBe(r1.id);
      const next = { ...content, conditions: "Nueva condición expresa" };
      await f.data(`budget-editor/${budget.id}`, "PUT", {
        revision: 2,
        content: next,
      });
      const r2 = await f.data(`budget-editor/${budget.id}/issue`, "POST", {
        revision: 3,
      });
      expect(r2.number).toBe(2);
      expect((r2.snapshot as any).commercial.pdfTemplateVersion).toBe(2);
      expect(
        Buffer.from(
          await (await f.call(`budget-issues/${r1.id}/pdf`)).arrayBuffer(),
        ),
      ).toEqual(before);
    });
    it("OC emitida V2 conserva el snapshot público ante cambios de maestros; notas privadas quedan fuera", async () => {
      const supplier = await f.data("suppliers", "POST", {
          code: "UX-S-" + f.tag,
          name: "Proveedor original UX",
        }),
        order = await f.data("purchase-orders", "POST", {
          supplierId: supplier.id,
          destinationId: warehouse.id,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          notes: "Nota interna privada UX",
          lines: [
            {
              materialId: mats[0].id,
              quantity: "1",
              unitPrice: "50",
              baseQuantity: "1",
            },
          ],
        });
      await f.data(`purchase-orders/${order.id}/status`, "POST", {
        status: "ISSUED",
      });
      const bytes = Buffer.from(
        await (await f.call(`purchase-orders/${order.id}/pdf`)).arrayBuffer(),
      );
      const event = await db.auditLog.findFirstOrThrow({
        where: { entityId: order.id, action: "PDF_PRESENTATION" },
      });
      expect((event.after as any).notes).toBe("");
      await db.supplier.update({
        where: { id: supplier.id },
        data: { name: "Proveedor cambiado UX" },
      });
      await db.material.update({
        where: { id: mats[0].id },
        data: { name: "Material maestro cambiado UX" },
      });
      expect(
        Buffer.from(
          await (await f.call(`purchase-orders/${order.id}/pdf`)).arrayBuffer(),
        ),
      ).toEqual(bytes);
    });

    it("dos intenciones concurrentes no gastan el mismo stock ni aplican medio lote", async () => {
      const material = await f.data("materials", "POST", {
        name: "Concurrencia " + f.tag,
        code: "UX-CON-" + f.tag,
        unitId: unit.id,
      });
      await f.data("movements", "POST", {
        type: "INITIAL",
        materialId: material.id,
        destinationId: warehouse.id,
        quantity: "10",
      });
      const input = {
          header: {
            type: "TRANSFER",
            sourceId: warehouse.id,
            destinationId: dest.id,
          },
          rows: [{ materialId: material.id, quantity: "8" }],
        },
        plan = await f.data("movement-batches/preview", "POST", input);
      const responses = await Promise.all([
        f.call("movement-batches", "POST", {
          ...input,
          planHash: plan.planHash,
        }),
        f.call("movement-batches", "POST", {
          ...input,
          planHash: plan.planHash,
        }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(
        (
          await db.stockBalance.findFirstOrThrow({
            where: { materialId: material.id, locationId: warehouse.id },
          })
        ).physical.toFixed(),
      ).toBe("2");
      expect(
        await db.stockMovement.count({
          where: { materialId: material.id, type: "TRANSFER" },
        }),
      ).toBe(1);
      const rows = [
          { materialId: material.id, locationId: warehouse.id, minimum: "3" },
        ],
        p = await f.data("stock-minimum-batches/preview", "POST", { rows });
      const results = await Promise.all([
        f.call("stock-minimum-batches", "POST", { rows, planHash: p.planHash }),
        f.call("stock-minimum-batches", "POST", { rows, planHash: p.planHash }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });
    it("Jefe opera sólo consumo en obra asignada; revocar asignación invalida confirmación sin cambiar saldos", async () => {
      const chief = await db.user.findUniqueOrThrow({
        where: { email: `${f.tag}-JEFE_OBRA@test.invalid` },
      });
      await db.workAssignment.create({
        data: { workId: work.id, userId: chief.id },
      });
      const input = {
          header: { type: "CONSUMPTION", sourceId: dest.id },
          rows: [{ materialId: mats[1].id, quantity: "1" }],
        },
        plan = await f.data(
          "movement-batches/preview",
          "POST",
          input,
          undefined,
          "JEFE_OBRA",
        );
      const before = await db.stockMovement.count();
      await db.workAssignment.delete({
        where: { userId_workId: { workId: work.id, userId: chief.id } },
      });
      expect(
        (
          await f.call(
            "movement-batches",
            "POST",
            { ...input, planHash: plan.planHash },
            undefined,
            "JEFE_OBRA",
          )
        ).status,
      ).toBe(403);
      expect(await db.stockMovement.count()).toBe(before);
    });
    it("exportación legacy respeta exactamente ubicación/material; no incluye otro saldo", async () => {
      const response = await f.call(
          `exports/stock?locationId=${warehouse.id}&materialId=${mats[1].id}`,
        ),
        book = new ExcelJS.Workbook();
      expect(response.status).toBe(200);
      await book.xlsx.load(Buffer.from(await response.arrayBuffer()) as any);
      expect(book.worksheets[0].rowCount).toBe(2);
      expect(book.getWorksheet("Contexto")).toBeDefined();
    });
  it("selección de página funciona sobre más de 2.000 resultados; todos exige acotar y detecta cambio de alcance",async()=>{
    const prefix='UX-LIMIT-'+f.tag;
    await db.client.createMany({data:Array.from({length:2001},(_,i)=>({code:prefix+'-'+i,name:'Límite '+f.tag+' '+i}))});
    const subset=(await db.client.findMany({where:{code:{startsWith:prefix}},take:50,orderBy:{code:'asc'}})).map(r=>r.id),filters={search:'limite '+f.tag};
    const selected=await f.data('selections','POST',{resource:'clients',filters,ids:subset});expect(selected.rows).toHaveLength(50);
    expect((await f.call('selections/export','POST',{token:selected.token,ids:subset})).status).toBe(200);
    expect((await f.call('selections','POST',{resource:'clients',filters})).status).toBe(422);
    expect((await f.call('selections','POST',{resource:'clients',filters:{id:subset[0]},expectedTotal:2})).status).toBe(409);
    const empty=await f.data('locations','POST',{code:prefix,name:'Sin saldo para selección',kind:'YARD'});
    const stockBefore=await db.stockBalance.count(),key=mats[2].id+':'+empty.id;
    const alert=await f.data('selections','POST',{resource:'stock/alerts',filters:{locationId:empty.id,materialId:mats[2].id},ids:[key]});expect(alert.rows).toHaveLength(1);expect(await db.stockBalance.count()).toBe(stockBefore);
  });


  },
);
