/** Executes the private BASE closure against real dispatch/PostgreSQL. Originals
 * and economic results stay outside Git. No synthetic prelinked recipe. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { db, transaction } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import { inspectCeoCatalog } from "./inspect-ceo-catalog";
import { applyCatalogInventory } from "../src/modules/catalog-load";
import { resolveActivityCosts } from "../src/modules/cost-references";
import {
  calculateCommercial,
  editorContentSchema,
} from "../src/modules/commercial-domain";
import { Prisma } from "@prisma/client";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  if (
    url.hostname !== "127.0.0.1" ||
    !url.pathname.startsWith("/ceo_base_link_test_")
  )
    throw Error("Sólo base propia aislada ceo_base_link_test_*");
  const root = join(homedir(), ".local/state/ceo-construcciones-codex");
  const source = await inspectCeoCatalog(join(root, "sources/base.xlsx"));
  assert.equal(
    source.sourceSha256,
    "5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e",
  );
  const tag = randomUUID();
  const actor = await db.user.create({
    data: {
      email: `${tag}@test.invalid`,
      name: "Verificación privada BASE",
      role: "GERENCIA",
      passwordHash: "disabled",
    },
  });
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      tokenHash: sessionHash(token),
      userId: actor.id,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
  async function call(path: string, method = "GET", body?: unknown) {
    return dispatch(
      new Request(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          origin,
          cookie: `ceo_session=${token}`,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("?")[0].split("/"),
    );
  }
  async function data(path: string, method = "GET", body?: unknown) {
    const response = await call(path, method, body);
    const payload = await response.json();
    assert.ok(
      response.status < 300,
      `${path}: ${response.status} ${JSON.stringify(payload)}`,
    );
    return payload.data;
  }
  const old = structuredClone(source);
  for (const a of old.activities) delete a.materialLinkage;
  const baseline = await applyCatalogInventory(old, source.sourceSha256, actor);
  const mappings = await db.catalogOrigin.findMany({
    where: { source: "BASE-CEO", kind: "activity" },
  });
  const id = (key: string) =>
    mappings.find((o) => o.sourceKey === key)!.entityId;
  assert.equal(
    (
      await transaction((tx) =>
        resolveActivityCosts(
          tx,
          mappings.map((o) => o.entityId),
        ),
      )
    ).size,
    source.activities.length,
  );
  const templateOrigin = await db.catalogOrigin.findFirstOrThrow({
    where: { source: "BASE-CEO", kind: "template" },
  });
  const client = await data("clients", "POST", {
    code: tag,
    name: "Prueba aislada de vínculos",
  });
  const work = await data("works", "POST", {
    code: tag,
    name: "Obra sintética para probar BASE real",
    clientId: client.id,
  });
  const oldBudget = await data("budget-editor", "POST", {
    workId: work.id,
    name: "Borrador previo al complemento",
    templateId: templateOrigin.entityId,
  });
  const oldDraft = await data(`budget-editor/${oldBudget.id}`);
  const run = await applyCatalogInventory(source, source.sourceSha256, actor);
  assert.equal(run.conflicts.length, 0);
  const eligible = source.activities.filter(
    (a: any) => a.materialLinkage.classification === "B",
  );
  assert.equal(run.materialLinks.linked.length, eligible.length);
  assert.equal(
    JSON.stringify(await data(`budget-editor/${oldBudget.id}`)),
    JSON.stringify(oldDraft),
  );
  const resolved = await transaction((tx) =>
    resolveActivityCosts(
      tx,
      mappings.map((o) => o.entityId),
    ),
  );
  for (const a of eligible) {
    const c = resolved.get(id(String(a.key)))!;
    assert.equal(c.content.materialsIncludedInDirect, false);
    assert.equal(c.directCost, "0");
    assert.equal(
      c.materialCost,
      (a.materialLinkage as any).reconstructed,
      String(a.key),
    );
    assert.ok(c.materials.every((m) => m.sourcePriceId));
  }
  for (const key of ["COSTO!B27", "COSTO!B35", "COSTO!B65"])
    assert.ok(resolved.get(id(key))!.content.materials.length);
  assert.equal(resolved.get(id("COSTO!B13"))!.content.materials.length, 0); // legitimate direct
  assert.equal(
    resolved.get(id("COSTO!B170"))!.content.materialsIncludedInDirect,
    true,
  ); // absent cal quote
  const primary = resolved.get(id("COSTO!B35"))!;
  const cementOrigin = await db.catalogOrigin.findFirstOrThrow({
    where: { source: "BASE-CEO", kind: "material", sourceKey: "PRECIOS!A5" },
  });
  const materialId = cementOrigin.entityId;
  const cement = primary.materials.find((m) => m.materialId === materialId)!;
  const quote = await db.materialPrice.findUniqueOrThrow({
    where: { id: cement.sourcePriceId! },
  });
  assert.equal(quote.baseQuantity.toFixed(), "25");
  const budget = await data("budget-editor", "POST", {
    workId: work.id,
    name: "BASE: prueba real de referencia",
    templateId: templateOrigin.entityId,
  });
  let document = await data(`budget-editor/${budget.id}`);
  let content = editorContentSchema.parse(document.draft.content);
  for (const line of content.lines) {
    line.status = line.itemId === id("COSTO!B35") ? "ACTIVE" : "EXCLUDED";
    if (line.status === "ACTIVE") line.quantity = "10";
  }
  content.markup = "37.5";
  const line = content.lines.find((l) => l.itemId === id("COSTO!B35"))!;
  line.materials.find((m) => m.materialId === materialId)!.coefficient = "6"; // own recipe
  const manual = line.materials.find((m) => m.materialId !== materialId)!;
  manual.unitPrice = "999";
  manual.sourcePriceId = null;
  delete manual.sourcePriceBasis;
  delete manual.sourcePriceFactor;
  const saved = await data(`budget-editor/${budget.id}`, "PUT", {
    revision: document.draft.revision,
    content,
  });
  const r1 = await data(`budget-editor/${budget.id}/issue`, "POST", {
    revision: saved.revision,
  });
  const versionId = r1.id;
  assert.ok(versionId, JSON.stringify(r1));
  const pdfPath = `budget-issues/${versionId}/pdf`;
  const pdfResponse = await call(pdfPath);
  assert.equal(pdfResponse.status, 200);
  const pdf = Buffer.from(await pdfResponse.arrayBuffer());
  const snapshot = await db.budgetVersion.findUniqueOrThrow({
    where: { id: versionId },
  });
  const physical = (c: typeof content) =>
    c.lines.map((l) => ({
      key: l.key,
      quantity: l.quantity,
      materials: l.materials.map((m) => [m.materialId, m.coefficient]),
    }));
  const demand = calculateCommercial(content).materials;
  const newer = await data("prices", "POST", {
    materialId,
    presentationId: quote.presentationId,
    supplierId: quote.supplierId,
    price: quote.price.mul("1.1").toDecimalPlaces(8).toFixed(),
    baseQuantity: quote.baseQuantity.toFixed(),
    currency: quote.currency,
    taxBasis: quote.taxBasis,
    source: quote.source,
    effectiveAt: "2026-11-01T03:00:00Z",
  });
  const current = await data(`activity-costing/${id("COSTO!B35")}`);
  assert.equal(
    current.materials.find((m: any) => m.materialId === materialId)
      .sourcePriceId,
    newer.id,
  );
  assert.equal(
    current.materials.find((m: any) => m.materialId === materialId).coefficient,
    cement.coefficient,
  );
  assert.ok(
    new Prisma.Decimal(current.totalUnitCost).gt(primary.totalUnitCost!),
  );
  document = await data(`budget-editor/${budget.id}`);
  assert.deepEqual(document.draft.content, content);
  const nextBudget = await data("budget-editor", "POST", {
    workId: work.id,
    name: "BASE posterior a nuevo precio de prueba",
    templateId: templateOrigin.entityId,
  });
  const nextDoc = await data(`budget-editor/${nextBudget.id}`);
  assert.equal(
    nextDoc.draft.content.lines
      .find((l: any) => l.itemId === id("COSTO!B35"))
      .materials.find((m: any) => m.materialId === materialId).sourcePriceId,
    newer.id,
  );
  const preview = await data(`budget-editor/${budget.id}/cost-review`, "POST", {
    revision: document.draft.revision,
    content,
  });
  const selected = preview.changes.find(
    (c: any) =>
      c.kind === "MATERIAL" &&
      c.lineKey === line.key &&
      c.index === line.materials.findIndex((m) => m.materialId === materialId),
  );
  assert.ok(selected);
  assert.equal(selected.manual, false);
  assert.deepEqual(
    (await data(`budget-editor/${budget.id}`)).draft,
    document.draft,
  );
  const updated = await data(
    `budget-editor/${budget.id}/apply-cost-review`,
    "POST",
    {
      revision: document.draft.revision,
      content,
      planHash: preview.planHash,
      selected: [selected.key],
    },
  );
  assert.deepEqual(physical(updated.content), physical(content));
  assert.equal(updated.content.markup, "37.5");
  assert.equal(
    updated.content.lines
      .find((l: any) => l.key === line.key)
      .materials.find((m: any) => m.materialId === manual.materialId).unitPrice,
    "999",
  );
  assert.deepEqual(calculateCommercial(updated.content).materials, demand);
  assert.deepEqual(
    (await db.budgetVersion.findUniqueOrThrow({ where: { id: versionId } }))
      .snapshot,
    snapshot.snapshot,
  );
  assert.deepEqual(Buffer.from(await (await call(pdfPath)).arrayBuffer()), pdf);
  const r2 = await data(`budget-editor/${budget.id}/issue`, "POST", {
    revision: updated.revision,
  });
  assert.notEqual(r2.id, versionId);
  const oldPreview = await data(
    `budget-editor/${oldBudget.id}/cost-review`,
    "POST",
    { revision: oldDraft.draft.revision, content: oldDraft.draft.content },
  );
  const composition = oldPreview.changes.find(
    (c: any) =>
      c.kind === "COMPOSITION" &&
      c.lineKey ===
        oldDraft.draft.content.lines.find(
          (l: any) => l.itemId === id("COSTO!B35"),
        ).key,
  );
  assert.ok(composition);
  assert.equal(composition.manual, true);
  assert.deepEqual(
    (await data(`budget-editor/${oldBudget.id}`)).draft,
    oldDraft.draft,
  );
  const converted = await data(
    `budget-editor/${oldBudget.id}/apply-cost-review`,
    "POST",
    {
      revision: oldDraft.draft.revision,
      content: oldDraft.draft.content,
      planHash: oldPreview.planHash,
      selected: [composition.key],
    },
  );
  assert.equal(
    converted.content.lines.find((l: any) => l.itemId === id("COSTO!B35"))
      .materialsIncludedInDirect,
    false,
  );
  const repeat = await applyCatalogInventory(
    source,
    source.sourceSha256,
    actor,
  );
  assert.equal(repeat.materialLinks.linked.length, 0);
  assert.equal(repeat.materialLinks.alreadyLinked.length, eligible.length);
  assert.deepEqual(repeat.created, {});
  assert.equal(repeat.conflicts.length, 0);
  assert.equal(
    (await data(`activity-costing/${id("COSTO!B35")}`)).materials.find(
      (m: any) => m.materialId === materialId,
    ).sourcePriceId,
    newer.id,
  );
  // An edited catalog row is preserved on reapplication, while other rows work.
  await db.apuItem.update({
    where: { id: id("COSTO!B27") },
    data: { name: "Edición de usuario preservada" },
  });
  const conflict = await applyCatalogInventory(
    source,
    source.sourceSha256,
    actor,
  );
  assert.ok(conflict.conflicts.some((c) => c.key === "COSTO!B27"));
  assert.equal(
    (await db.apuItem.findUniqueOrThrow({ where: { id: id("COSTO!B27") } }))
      .name,
    "Edición de usuario preservada",
  );
  const result = {
    sourceHash: source.sourceSha256,
    database: url.pathname,
    baselineRun: baseline.runId,
    runId: run.runId,
    linked: eligible.length,
    repeatRun: repeat.runId,
    preservedConflicts: conflict.conflicts,
    primaryActivityId: id("COSTO!B35"),
    materialId,
    referenceBefore: quote.id,
    referenceAfter: newer.id,
    costBefore: primary.totalUnitCost,
    costAfter: current.totalUnitCost,
    r1: versionId,
    r2,
    pdfSha256: createHash("sha256").update(pdf).digest("hex"),
    oldDraftConvertedOnlyAfterAccept: true,
    quantityAndDemandPreserved: true,
    manualCostPreserved: true,
  };
  await writeFile(
    join(root, "base-link-real-verification.json"),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  await writeFile(join(root, "base-link-real-r1.pdf"), pdf, { mode: 0o600 });
  console.log(
    JSON.stringify({
      result: "PASS",
      linked: eligible.length,
      historicalPdfUnchanged: true,
      physicalDemandUnchanged: true,
      priorDraftOptIn: true,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
