import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { db, schemaCapabilities } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/ceo_release_test_")
  )
    throw Error("Solo release test aislado");
  const user = await db.user.findUniqueOrThrow({
      where: { email: "release@test.invalid" },
    }),
    token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sessionHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  const call = (path: string, method = "GET", body?: unknown) =>
    dispatch(
      new Request(`${process.env.APP_ORIGIN}/api/v1/${path}`, {
        method,
        headers: {
          origin: process.env.APP_ORIGIN!,
          cookie: "ceo_session=" + token,
          "content-type": "application/json",
          "idempotency-key": randomBytes(20).toString("hex"),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("/"),
    );
  const data = async (path: string, method = "GET", body?: unknown) => {
    const r = await call(path, method, body),
      j = await r.json();
    assert.ok(r.ok, `${path}: ${JSON.stringify(j)}`);
    return j.data;
  };
  const digest = (v: unknown) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  if (process.argv[2] === "before") {
    assert.equal((await schemaCapabilities()).referenceCosts, false);
    assert.equal((await call("labor-resources")).status, 503);
    const work = await db.work.findUniqueOrThrow({
        where: { code: "RELEASE-WORK" },
      }),
      unit = await db.unit.findUniqueOrThrow({ where: { code: "REL-U" } }),
      category = await db.category.findUniqueOrThrow({
        where: { code: "REL-C" },
      });
    const template = await data("budget-templates", "POST", {
      name: "Referencia PR9",
      content: {
        currency: "ARS",
        taxBasis: "EXCLUDED",
        markup: "50",
        conditions: "Condiciones del presupuesto conservadas",
        exclusions: "",
        observations: "",
        deadline: "",
        lines: [
          {
            key: "release-costs",
            itemId: null,
            code: null,
            name: "Actividad histórica previa a costos de referencia",
            categoryId: category.id,
            category: category.name,
            unitId: unit.id,
            unit: "un",
            quantity: "10",
            laborUnitCost: "3600",
            directUnitCost: "500",
            status: "ACTIVE",
            materials: [],
          },
        ],
      },
    });
    const budget = await data("budget-editor", "POST", {
      name: "Release ampliado poblado",
      workId: work.id,
      templateId: template.id,
    });
    const issue = await data(`budget-editor/${budget.id}/issue`, "POST", {
      revision: 1,
    });
    const bytes = Buffer.from(
      await (await call(`budget-issues/${issue.id}/pdf`)).arrayBuffer(),
    );
    await db.auditLog.create({
      data: {
        actorId: user.id,
        action: "REFERENCE_COMPAT_BASELINE",
        entityType: "BudgetVersion",
        entityId: issue.id,
        after: {
          snapshotHash: digest(issue.snapshot),
          pdfHash: createHash("sha256").update(bytes).digest("hex"),
        },
      },
    });
    console.log(
      "Esquema PR9 poblado: catálogo nuevo no habilitado, presupuesto y PDF congelados.",
    );
  } else {
    assert.equal((await schemaCapabilities()).referenceCosts, true);
    const mark = await db.auditLog.findFirstOrThrow({
        where: { action: "REFERENCE_COMPAT_BASELINE" },
      }),
      expected = mark.after as { snapshotHash: string; pdfHash: string };
    const issue = await db.budgetVersion.findUniqueOrThrow({
      where: { id: mark.entityId },
    });
    assert.equal(digest(issue.snapshot), expected.snapshotHash);
    const bytes = Buffer.from(
      await (await call(`budget-issues/${issue.id}/pdf`)).arrayBuffer(),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expected.pdfHash,
    );
    assert.equal((await call("labor-resources")).status, 200);
    assert.equal(await db.laborResource.count(), 0);
    const order = await db.purchaseOrder.findFirstOrThrow({
      where: { work: { code: "RELEASE-WORK" } },
      include: { lines: true },
    });
    assert.equal(order.lines[0].receivedQuantity.toFixed(), "4");
    console.log(
      "Migración sobre PR9 poblado: snapshot/PDF idénticos, OC parcial conservada, referencias nuevas disponibles sin datos inventados.",
    );
  }
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
