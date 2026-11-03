import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import type { EditorContent } from "../src/modules/commercial-domain";
import { assertClosureContract } from "./closure-fixture";
const enabled = process.env.RUN_INTEGRATION === "1",
  tag = randomUUID(),
  origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
const token = randomUUID().replaceAll("-", "").repeat(2);
let workId: string,
  clientId: string,
  unitId: string,
  categoryId: string,
  budgetId: string,
  content: EditorContent;
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  key: string = randomUUID(),
) {
  const r = await dispatch(
    new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        origin,
        cookie: `ceo_session=${token}`,
        "content-type": "application/json",
        "idempotency-key": key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("/"),
  );
  return r;
}
async function data(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
) {
  const r = await call(path, method, body, key);
  const j = await r.json();
  expect(r.status, JSON.stringify(j)).toBeLessThan(300);
  assertClosureContract(path, method, r.status, j);
  return j.data;
}
describe.skipIf(!enabled)("presupuesto comercial real en PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.includes("test")
    )
      throw Error("Sólo base local test");
    const actor = await db.user.create({
      data: {
        email: `commercial-${tag}@test.invalid`,
        name: "Computista sintético",
        passwordHash: "not-a-login-hash",
        role: "COMPUTO",
      },
    });
    await db.session.create({
      data: {
        tokenHash: sessionHash(token),
        userId: actor.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    const client = await db.client.create({
      data: {
        code: `client-${tag}`,
        name: "Comitente sintético con varias obras",
      },
    });
    clientId = client.id;
    const work = await db.work.create({
      data: {
        code: `commercial-${tag}`,
        name: "Obra comercial áéíóú ñ",
        clientId: client.id,
        address: "Calle sintética 123",
      },
    });
    workId = work.id;
    const unit = await db.unit.create({
      data: {
        code: `commercial-${tag}`,
        name: "Unidad comercial sintética",
        symbol: "m²",
      },
    });
    unitId = unit.id;
    const cat = await db.category.create({
      data: { code: `commercial-${tag}`, name: "VARIOS" },
    });
    categoryId = cat.id;
    content = {
      currency: "ARS",
      taxBasis: "EXCLUDED",
      markup: "50",
      conditions: "Validez comercial: 30 días",
      exclusions: "Sin equipamiento",
      observations: "Presentación sintética",
      deadline: "90 días",
      lines: [
        {
          key: randomUUID(),
          itemId: null,
          code: null,
          name: "Concepto directo — terminación m²",
          categoryId: cat.id,
          category: "VARIOS",
          unitId: unit.id,
          unit: "m²",
          quantity: "3",
          laborUnitCost: "100000",
          directUnitCost: "900000",
          status: "ACTIVE",
          materials: [],
        },
      ],
    };
  });
  afterAll(() => db.$disconnect());
  it("T08/T15: copia plantilla, cinco guardados no crean revisiones; conflicto no pisa", async () => {
    const template = await data("budget-templates", "POST", {
      name: `BASE sintética ${tag}`,
      content,
    });
    const b = await data("budget-editor", "POST", {
      workId,
      name: "Presupuesto de prueba",
      templateId: template.id,
    });
    budgetId = b.id;
    let revision = 1;
    for (let i = 0; i < 5; i++) {
      const saved = await data(`budget-editor/${budgetId}`, "PUT", {
        revision,
        content,
      });
      revision = saved.revision;
    }
    expect(await db.budgetVersion.count({ where: { budgetId } })).toBe(0);
    expect(
      (await call(`budget-editor/${budgetId}`, "PUT", { revision: 1, content }))
        .status,
    ).toBe(409);
    expect(
      (await db.budgetDraft.findUniqueOrThrow({ where: { budgetId } }))
        .revision,
    ).toBe(6);
    expect(
      (
        await db.budgetTemplate.findUniqueOrThrow({
          where: { id: template.id },
        })
      ).content,
    ).toEqual(content);
  });
  it("T15–T21: preview sin escritura, R1 idempotente, R2 conserva R1 y PDF", async () => {
    const preview = await call(
      `budget-editor/${budgetId}/preview`,
      "POST",
      content,
    );
    expect(preview.status).toBe(200);
    expect(
      (await PDFDocument.load(await preview.arrayBuffer())).getPageCount(),
    ).toBeGreaterThan(0);
    expect(await db.budgetVersion.count({ where: { budgetId } })).toBe(0);
    const key = randomUUID(),
      [a, b] = await Promise.all([
        data(`budget-editor/${budgetId}/issue`, "POST", { revision: 6 }, key),
        data(`budget-editor/${budgetId}/issue`, "POST", { revision: 6 }, key),
      ]);
    expect(a.id).toBe(b.id);
    expect(a.snapshot.commercialTotal).toBe("4500000.00");
    expect(a.status).toBe("REFERENCE");
    const first = Buffer.from(
      await (await call(`budget-issues/${a.id}/pdf`)).arrayBuffer(),
    );
    expect(first.includes(Buffer.from("900000"))).toBe(false);
    expect(
      (await data(`budget-editor/${budgetId}/issue`, "POST", { revision: 6 }))
        .id,
    ).toBe(a.id);
    await db.client.update({
      where: { id: clientId },
      data: { name: "Nombre maestro cambiado" },
    });
    expect(
      Buffer.from(
        await (await call(`budget-issues/${a.id}/pdf`)).arrayBuffer(),
      ),
    ).toEqual(first);
    content = { ...content, markup: "20" };
    const draft = await data(`budget-editor/${budgetId}`, "PUT", {
      revision: 6,
      content,
    });
    const next = await data(`budget-editor/${budgetId}/issue`, "POST", {
      revision: draft.revision,
    });
    expect(next.id).not.toBe(a.id);
    expect(next.number).toBe(2);
    expect(next.snapshot.commercialTotal).toBe("3600000.00");
    expect(
      Buffer.from(
        await (await call(`budget-issues/${a.id}/pdf`)).arrayBuffer(),
      ),
    ).toEqual(first);
    expect(
      (await db.budgetVersion.findUniqueOrThrow({ where: { id: a.id } }))
        .snapshot,
    ).toEqual(a.snapshot);
    await expect(
      db.budgetIssue.update({
        where: { versionId: a.id },
        data: { commercialTotal: "1" },
      }),
    ).rejects.toThrow();
  });
  it("T18: emitir otra propuesta no reemplaza la referencia existente", async () => {
    const reference = await db.budgetVersion.findFirstOrThrow({
      where: { budget: { workId }, status: "REFERENCE" },
    });
    const b = await data("budget-editor", "POST", {
      workId,
      name: "Alternativa",
      sourceVersionId: reference.id,
    });
    const alternative = await data(`budget-editor/${b.id}/issue`, "POST", {
      revision: 1,
    });
    expect(alternative.status).toBe("DRAFT");
    expect(
      (
        await db.budgetVersion.findFirstOrThrow({
          where: { budget: { workId }, status: "REFERENCE" },
        })
      ).id,
    ).toBe(reference.id);
  });
  it("T08: incorpora BASE real una sola vez y copia su composición sin vínculos vivos", async () => {
    const info = await data("budget-templates/base");
    expect(info.activities).toBe(146);
    expect(info.issues.length).toBeGreaterThan(0);
    const key = randomUUID(),
      base = await data("budget-templates/base", "POST", undefined, key),
      again = await data("budget-templates/base", "POST", undefined, key);
    expect(base.id).toBe(again.id);
    const b = await data("budget-editor", "POST", {
        workId,
        name: "Desde BASE real",
        templateId: base.id,
      }),
      editor = await data(`budget-editor/${b.id}`);
    const source = JSON.stringify(base.content),
      copied = editor.draft.content;
    expect(copied.lines).toHaveLength(146);
    expect(copied.lines[0].materials.length).toBeGreaterThan(0);
    expect(copied.lines[0].quantity).toBe("0");
    copied.lines[0].quantity = "10";
    await data(`budget-editor/${b.id}`, "PUT", {
      revision: 1,
      content: copied,
    });
    const version = await data(`budget-editor/${b.id}/issue`, "POST", {
      revision: 2,
    });
    expect(Number(version.snapshot.totalCost)).toBeGreaterThan(0);
    expect(version.snapshot.materials.length).toBeGreaterThan(0);
    expect(
      JSON.stringify(
        (await db.budgetTemplate.findUniqueOrThrow({ where: { id: base.id } }))
          .content,
      ),
    ).toBe(source);
  });
  it("T07/T11/T53: actividad reutilizable con otros directos; cálculo y versión V1 conservan costo sin materiales ficticios", async () => {
    const item = await data("apu-items", "POST", {
      name: "Actividad con seguro o servicio directo",
      categoryId,
      unitId,
      laborCost: "20",
      directCost: "100",
      laborCurrency: "ARS",
      laborTaxBasis: "EXCLUDED",
      components: [],
    });
    expect(item.directCost).toBe("100");
    const valuation = {
      currency: "ARS",
      taxBasis: "EXCLUDED",
      precision: 2,
      roundingMode: "HALF_UP",
      roundingBoundary: "EXTENDED_LINE_COMPONENTS",
      prices: [],
    };
    const calculation = await data(
      `apu-items/${item.id}/calculate`,
      "POST",
      valuation,
    );
    expect(calculation.totalCost).toBe("120.00");
    expect(calculation.directCost).toBe("100.00");
    expect(calculation.materials).toEqual([]);
    const computation = await data("computations", "POST", {
        workId,
        name: "Directos reutilizados",
        lines: [{ itemId: item.id, quantity: "3" }],
      }),
      budget = await data("budgets", "POST", {
        workId,
        name: "Costos anteriores con directos",
      }),
      version = await data(`budgets/${budget.id}/versions`, "POST", {
        ...valuation,
        computationId: computation.id,
      });
    expect(version.snapshot.totalCost).toBe("360.00");
    expect(version.snapshot.directCost).toBe("300.00");
    await data(`apu-items/${item.id}`, "PATCH", {
      name: item.name,
      categoryId,
      unitId,
      laborCost: "20",
      directCost: "200",
      laborCurrency: "ARS",
      laborTaxBasis: "EXCLUDED",
      components: [],
    });
    expect(
      (await data(`budget-versions/${version.id}`)).snapshot.totalCost,
    ).toBe("360.00");
    const copied = await data("budget-editor", "POST", {
        workId,
        name: "Comercial desde costos anteriores",
        sourceVersionId: version.id,
      }),
      draft = await data(`budget-editor/${copied.id}`);
    expect(draft.draft.content.lines[0].directUnitCost).toBe("100");
    expect(
      (
        await call(`budget-editor/${budget.id}`, "PUT", {
          revision: 0,
          content: draft.draft.content,
        })
      ).status,
    ).toBe(422);
  });
  it("T10/T22: diferencias deliberadas conservan ajustes manuales y no toman futuros/inactivos", async () => {
    const material = await db.material.create({
        data: {
          code: `price-${tag}`,
          name: "Material para actualización",
          unitId,
        },
      }),
      supplier = await db.supplier.create({
        data: { code: `price-${tag}`, name: "Corralón para actualización" },
      });
    const price = await data("prices", "POST", {
      materialId: material.id,
      supplierId: supplier.id,
      price: "10",
      baseQuantity: "1",
      currency: "ARS",
      taxBasis: "EXCLUDED",
      effectiveAt: "2020-01-01T00:00:00Z",
    });
    const next = await data("prices", "POST", {
      materialId: material.id,
      supplierId: supplier.id,
      price: "12",
      baseQuantity: "1",
      currency: "ARS",
      taxBasis: "EXCLUDED",
      effectiveAt: "2021-01-01T00:00:00Z",
    });
    await data("prices", "POST", {
      materialId: material.id,
      supplierId: supplier.id,
      price: "1",
      baseQuantity: "1",
      currency: "ARS",
      taxBasis: "EXCLUDED",
      effectiveAt: "2099-01-01T00:00:00Z",
    });
    const inactive = await db.supplier.create({
      data: {
        code: `inactive-${tag}`,
        name: "Corralón inactivo",
        active: false,
      },
    });
    await db.materialPrice.create({
      data: {
        materialId: material.id,
        supplierId: inactive.id,
        price: "2",
        baseQuantity: "1",
        currency: "ARS",
        taxBasis: "EXCLUDED",
        effectiveAt: new Date("2022-01-01T00:00:00Z"),
      },
    });
    const b = await data("budget-editor", "POST", {
        workId,
        name: "Actualizar referencias",
      }),
      c: EditorContent = {
        ...content,
        lines: [0, 1].map((i) => ({
          key: randomUUID(),
          itemId: null,
          code: null,
          name: `Partida ${i}`,
          categoryId,
          category: "VARIOS",
          unitId,
          unit: "m²",
          quantity: "1",
          laborUnitCost: "0",
          directUnitCost: "0",
          status: "ACTIVE",
          materials: [
            {
              materialId: material.id,
              name: material.name,
              unitId,
              unit: "m²",
              coefficient: "1",
              unitPrice: i ? "99" : "10",
              sourcePriceId: i ? null : price.id,
            },
          ],
        })),
      };
    await data(`budget-editor/${b.id}`, "PUT", { revision: 1, content: c });
    const changes = await data(
      `budget-editor/${b.id}/price-updates`,
      "POST",
      c,
    );
    expect(
      changes.changes.map((r: { next: string; manual: boolean }) => ({
        next: r.next,
        manual: r.manual,
      })),
    ).toEqual([
      { next: "12", manual: false },
      { next: "12", manual: true },
    ]);
    expect((await data(`budget-editor/${b.id}`)).draft.content).toEqual(c);
    c.lines[0].materials[0].unitPrice = "12";
    c.lines[0].materials[0].sourcePriceId = next.id;
    await data(`budget-editor/${b.id}`, "PUT", { revision: 2, content: c });
    const issued = await data(`budget-editor/${b.id}/issue`, "POST", {
      revision: 3,
    });
    expect(issued.snapshot.lines[1].materialUnitCost).toBe("99");
    c.lines[0].materials[0].unitPrice = "13";
    expect(
      (await call(`budget-editor/${b.id}`, "PUT", { revision: 3, content: c }))
        .status,
    ).toBe(422);
  });
});
