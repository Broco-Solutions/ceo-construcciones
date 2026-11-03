import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { db, schemaCapabilities } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !target.pathname.startsWith("/ceo_release_test_")
  )
    throw Error("Sólo fixture aislado de release.");
  const mode = process.argv[2],
    origin = process.env.APP_ORIGIN!,
    token = randomBytes(32).toString("hex");
  let user = await db.user.findUnique({
    where: { email: "release@test.invalid" },
  });
  if (!user)
    user = await db.user.create({
      data: {
        name: "Release sintético",
        email: "release@test.invalid",
        role: "GERENCIA",
        passwordHash: "disabled",
      },
    });
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: sessionHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  async function call(path: string, method = "GET", body?: unknown) {
    return dispatch(
      new Request(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          origin,
          cookie: `ceo_session=${token}`,
          "content-type": "application/json",
          "idempotency-key": randomBytes(16).toString("hex"),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("/"),
    );
  }
  async function data(path: string, method = "GET", body?: unknown) {
    const r = await call(path, method, body),
      j = await r.json();
    assert.ok(r.status < 300, `${path}: ${JSON.stringify(j)}`);
    return j.data;
  }
  if (mode === "legacy") {
    assert.equal((await schemaCapabilities()).clients, false);
    const w = await data("works", "POST", {
      code: "RELEASE-WORK",
      name: "Histórica sin cliente",
    });
    assert.ok((await data("works")).some((x: { id: string }) => x.id === w.id));
    assert.equal((await data(`works/${w.id}`)).clientId, null);
    const nested = await db.user.findUnique({
      where: { id: user.id },
      include: { managedWorks: true, assignments: { include: { work: true } } },
    });
    assert.ok(nested);
    assert.equal((await call("clients")).status, 503);
    assert.equal((await call("budget-editor", "POST", {})).status, 503);
    const u = await data("units", "POST", {
        code: "REL-U",
        name: "Unidad de release",
      }),
      m = await data("materials", "POST", {
        code: "REL-M",
        name: "Material histórico",
        unitId: u.id,
      }),
      c = await data("categories", "POST", {
        code: "REL-C",
        name: "Rubro histórico",
      }),
      supplier = await data("suppliers", "POST", {
        code: "REL-S",
        name: "Proveedor histórico",
      });
    const item = await data("apu-items", "POST", {
      name: "Actividad histórica",
      categoryId: c.id,
      unitId: u.id,
      laborCost: "10",
      laborCurrency: "ARS",
      laborTaxBasis: "EXCLUDED",
      components: [{ materialId: m.id, coefficient: "2" }],
    });
    const computation = await data("computations", "POST", {
      workId: w.id,
      name: "Cómputo histórico",
      lines: [{ itemId: item.id, quantity: "10" }],
    });
    const budget = await data("budgets", "POST", {
      workId: w.id,
      name: "Presupuesto histórico",
    });
    await data(`budgets/${budget.id}/versions`, "POST", {
      computationId: computation.id,
      currency: "ARS",
      taxBasis: "EXCLUDED",
      precision: 2,
      roundingMode: "HALF_UP",
      roundingBoundary: "EXTENDED_LINE_COMPONENTS",
      prices: [{ materialId: m.id, unitPrice: "5" }],
    });
    const loc = await db.location.findUniqueOrThrow({
      where: { workId: w.id },
    });
    const order = await data("purchase-orders", "POST", {
      workId: w.id,
      supplierId: supplier.id,
      destinationId: loc.id,
      currency: "ARS",
      taxBasis: "EXCLUDED",
      lines: [
        { materialId: m.id, quantity: "10", unitPrice: "5", baseQuantity: "1" },
      ],
    });
    await data(`purchase-orders/${order.id}/status`, "POST", {
      status: "ISSUED",
    });
    await data(`purchase-orders/${order.id}/receipts`, "POST", {
      locationId: loc.id,
      deliveryNote: "REL-R",
      lines: [{ orderLineId: order.lines[0].id, quantity: "4" }],
    });
    console.log(
      "Código nuevo sobre esquema V1: obras, catálogo, versión de costos, OC y recepción reales aprobados.",
    );
  } else {
    assert.equal((await schemaCapabilities()).clients, true);
    const w = await db.work.findUniqueOrThrow({
      where: { code: "RELEASE-WORK" },
      include: {
        budgets: { include: { versions: true } },
        purchaseOrders: { include: { lines: true } },
        location: { include: { balances: true } },
      },
    });
    assert.equal(w.clientId, null);
    assert.equal(w.budgets.length, 1);
    assert.equal(w.budgets[0].versions.length, 1);
    const snapshot = w.budgets[0].versions[0].snapshot as Record<
      string,
      unknown
    >;
    assert.equal(snapshot.totalCost, "200.00");
    assert.equal(snapshot.commercialTotal, undefined);
    assert.equal(w.purchaseOrders[0].status, "PARTIALLY_RECEIVED");
    assert.equal(w.purchaseOrders[0].lines[0].receivedQuantity.toFixed(), "4");
    assert.equal(w.location!.balances[0].physical.toFixed(), "4");
    const client = await data("clients", "POST", {
      code: "REL-CLIENT",
      name: "Cliente real de fixture",
    });
    await data(`works/${w.id}`, "PATCH", { clientId: client.id });
    assert.equal((await data(`works/${w.id}`)).clientId, client.id);
    console.log(
      "Migración sobre V1 poblada: snapshots, OC parcial, stock y obra intactos; nuevos clientes habilitados.",
    );
  }
  await db.$disconnect();
}
main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exitCode = 1;
});
