import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import { editorContentSchema } from "../src/modules/commercial-domain";
async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !target.pathname.startsWith("/ceo_historical_test_")
  )
    throw Error("Sólo fixture histórica aislada nueva");
  const [inputFile, sourceFile, output] = process.argv.slice(2),
    input = editorContentSchema.parse(
      JSON.parse(await readFile(inputFile, "utf8")),
    ),
    source = JSON.parse(await readFile(sourceFile, "utf8"));
  const sheet = source.sheets.find(
    (s: { name: string }) => s.name === "PRESUPUESTO REV C",
  );
  assert.ok(sheet);
  const label = (row: number) =>
    String(sheet.rows[row][0]).split(":").slice(1).join(":").trim();
  await mkdir(output, { recursive: false });
  const actor = await db.user.create({
      data: {
        email: "historical@test.invalid",
        name: "Verificador sintético de fuente real",
        role: "GERENCIA",
        passwordHash: "disabled",
      },
    }),
    token = randomBytes(32).toString("hex"),
    origin = process.env.APP_ORIGIN!;
  await db.session.create({
    data: {
      userId: actor.id,
      tokenHash: sessionHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  async function call(
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
          cookie: `ceo_session=${token}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("?")[0].split("/"),
    );
  }
  async function data(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
  ) {
    const r = await call(path, method, body, key),
      j = await r.json();
    assert.ok(r.status < 300, `${path}: ${j.error?.message ?? r.status}`);
    return j.data;
  }
  const units = new Map<string, string>(),
    categories = new Map<string, string>(),
    materials = new Map<string, string>();
  async function unit(symbol: string) {
    let id = units.get(symbol);
    if (!id) {
      const u =
        (await db.unit.findFirst({ where: { symbol } })) ??
        (await db.unit.create({
          data: {
            code: `DG-U-${units.size + 1}`,
            name: `Unidad de fuente DG: ${symbol}`,
            symbol,
          },
        }));
      id = u.id;
      units.set(symbol, id);
    }
    return id;
  }
  const content = structuredClone(input);
  for (const l of content.lines) {
    let category = categories.get(l.categoryId);
    if (!category) {
      category = (
        await data("categories", "POST", {
          code: `DG-R-${categories.size + 1}`,
          name: l.category,
        })
      ).id;
      categories.set(l.categoryId, category!);
    }
    l.categoryId = category!;
    l.unitId = await unit(l.unit);
    for (const m of l.materials) {
      const old = m.materialId;
      let mid = materials.get(old);
      m.unitId = await unit(m.unit);
      if (!mid) {
        mid = (
          await data("materials", "POST", {
            code: `DG-M-${materials.size + 1}`,
            name: m.name,
            unitId: m.unitId,
            categoryId: l.categoryId,
          })
        ).id;
        materials.set(old, mid!);
      }
      m.materialId = mid!;
    }
  }
  const client = await data("clients", "POST", {
      code: "DG-COMITENTE",
      name: label(2),
    }),
    work = await data("works", "POST", {
      code: "DG-1153",
      name: label(3),
      address: label(4),
      clientId: client.id,
    });
  const template = await data("budget-templates", "POST", {
      name: "DG 1153 · Fuente REV C normalizada",
      content,
    }),
    budget = await data("budget-editor", "POST", {
      name: "Reconstrucción aislada DG 1153 · REV C",
      workId: work.id,
      templateId: template.id,
    }),
    calculation = await data(
      `budget-editor/${budget.id}/calculate`,
      "POST",
      content,
    );
  assert.ok(calculation.complete);
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      action: "LOAD_HISTORICAL_SOURCE",
      entityType: "BudgetTemplate",
      entityId: template.id,
      after: {
        sourceSha256: source.sha256,
        worksheet: sheet.name,
        sourceDocumentDate: label(5),
        priceReferenceMonth: "2026-06",
        normalizedHash: createHash("sha256")
          .update(JSON.stringify(input))
          .digest("hex"),
        materialDemandIncomplete: input.materialDemandIncomplete === true,
      },
    },
  });
  const key = randomUUID(),
    first = await data(
      `budget-editor/${budget.id}/issue`,
      "POST",
      { revision: 1 },
      key,
    ),
    retry = await data(
      `budget-editor/${budget.id}/issue`,
      "POST",
      { revision: 1 },
      key,
    );
  assert.equal(first.id, retry.id);
  assert.equal(first.snapshot.commercialTotal, calculation.commercialTotal);
  const pdf = Buffer.from(
    await (await call(`budget-issues/${first.id}/pdf`)).arrayBuffer(),
  );
  await writeFile(resolve(output, "DG-R1.pdf"), pdf, { flag: "wx" });
  const alternative = {
    ...content,
    markup: "50",
    lines: content.lines.map((l) => ({
      ...l,
      markup: undefined,
      materialMarkup: undefined,
      laborMarkup: undefined,
      directMarkup: undefined,
    })),
  };
  const secondCalculation = await data(
    `budget-editor/${budget.id}/calculate`,
    "POST",
    alternative,
  );
  assert.deepEqual(secondCalculation.materials, calculation.materials);
  await data(`budget-editor/${budget.id}`, "PUT", {
    revision: 1,
    content: alternative,
  });
  const second = await data(`budget-editor/${budget.id}/issue`, "POST", {
    revision: 2,
  });
  assert.equal(second.number, 2);
  await db.client.update({
    where: { id: client.id },
    data: { name: "Nombre modificado sólo para probar inmutabilidad" },
  });
  assert.deepEqual(
    Buffer.from(
      await (await call(`budget-issues/${first.id}/pdf`)).arrayBuffer(),
    ),
    pdf,
  );
  const needs = await data(`net-needs?workId=${work.id}`);
  assert.equal(
    needs.materialDemandIncomplete,
    input.materialDemandIncomplete === true,
  );
  for (const m of calculation.materials) {
    const row = needs.rows.find(
      (r: { materialId: string }) => r.materialId === m.materialId,
    );
    assert.equal(row.planned, m.quantity);
    assert.equal(row.remaining, m.quantity);
    if (input.materialDemandIncomplete) assert.equal(row.exact, false);
  }
  const report = {
    sourceSha256: source.sha256,
    revision: sheet.name,
    workId: work.id,
    budgetId: budget.id,
    issuedVersionId: first.id,
    activities: content.lines.length,
    cost: calculation.totalCost,
    commercialTotal: calculation.commercialTotal,
    verifiedMaterialRows: calculation.materials.length,
    templateCopied: true,
    retryIdempotent: true,
    materialsUnaffectedByMarkup: true,
    historicalPdfImmutable: true,
    netNeedsMatchReference: true,
    materialDemandIncomplete: needs.materialDemandIncomplete,
    scope:
      "Composiciones verificables de la fuente; suministros agregados sin desglose conservados como directos. Ver reconciliation.json para diferencias y límites.",
  };
  await writeFile(
    resolve(output, "verification.json"),
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(JSON.stringify(report));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Error histórico");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
