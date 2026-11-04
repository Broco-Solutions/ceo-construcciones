import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { inspectDgComplement } from "./inspect-dg-complement";
import { inspectCeoCatalog } from "./inspect-ceo-catalog";
import { applyCatalogInventory } from "../src/modules/catalog-load";
import { db } from "../src/core/db";

async function main() {
  const [command, path, original, expected] = process.argv.slice(2);
  if (command === "inspect" || command === "inspect-dg") {
    const manifest = await (command === "inspect-dg"
      ? inspectDgComplement(path)
      : inspectCeoCatalog(path));
    if (!original) throw Error("Falta ruta de salida privada");
    await writeFile(original, JSON.stringify(manifest, null, 2), {
      mode: 0o600,
    });
    console.log(
      JSON.stringify({
        mode: "dry-run",
        sourceHash: manifest.sourceSha256,
        activities: manifest.activities.length,
        categories: manifest.categories.length,
        prices: manifest.prices.length,
        labor: manifest.labor.length,
      }),
    );
    return;
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !/^\/ceo_(manual_test|.*test.*)$/.test(url.pathname)
  )
    throw Error("Solo base CEO local aislada de pruebas; destino rechazado.");
  if (command === "verify") {
    const run = await db.catalogLoadRun.findUniqueOrThrow({
      where: { id: path },
    });
    const mappings = await db.catalogOrigin.groupBy({
      by: ["kind"],
      where: { source: { in: ["BASE-CEO", "DG-CEO"] } },
      _count: true,
    });
    const origins = await db.catalogOrigin.findMany({
      where: { source: { in: ["BASE-CEO", "DG-CEO"] } },
    });
    const ids = (kind: string) =>
      origins.filter((o) => o.kind === kind || (kind === 'material' && o.kind === 'material-equivalence') || (kind === 'price' && ['composition-price', 'composition-expression'].includes(o.kind)) || (kind === 'presentation' && o.kind === 'composition-presentation')).map((o) => o.entityId);
    const groups = await Promise.all([
      db.category.findMany({ where: { id: { in: ids("category") } } }),
      db.material.findMany({
        where: { id: { in: [...ids("material"), ...ids("recipe-material")] } },
      }),
      db.presentation.findMany({ where: { id: { in: ids("presentation") } } }),
      db.materialPrice.findMany({
        where: { id: { in: [...ids("price"), ...ids("price-retired")] } },
      }),
      db.laborResource.findMany({
        where: { id: { in: ids("labor-resource") } },
      }),
      db.laborRate.findMany({ where: { id: { in: ids("labor-rate") } } }),
      db.apuItem.findMany({
        where: { id: { in: ids("activity") } },
        include: { components: true },
      }),
      db.activityCosting.findMany({
        where: { itemId: { in: ids("activity-costing") } },
      }),
      db.budgetTemplate.findMany({ where: { id: { in: ids("template") } } }),
    ]);
    const types = [
      "category",
      "material",
      "presentation",
      "price",
      "labor-resource",
      "labor-rate",
      "activity",
      "activity-costing",
      "template",
    ];
    const current = new Map<string, unknown>();
    groups.forEach((rows, i) =>
      rows.forEach((row) =>
        current.set(types[i] + ":" + ("id" in row ? row.id : row.itemId), row),
      ),
    );
    const discrepancies = origins.flatMap((o) => {
      const row = current.get(
        (o.kind === "recipe-material"
          ? "material"
          : o.kind === 'material-equivalence' ? 'material'
          : o.kind === 'composition-presentation' ? 'presentation'
          : o.kind === 'activity-linkage' ? 'activity'
          : ['composition-price', 'composition-expression'].includes(o.kind) ? 'price'
          : o.kind === "price-retired"
            ? "price"
            : o.kind) +
          ":" +
          o.entityId,
      );
      return !row
        ? [{ kind: o.kind, key: o.sourceKey, reason: "Destino ausente" }]
        : createHash("sha256").update(JSON.stringify(row)).digest("hex") !==
            o.installedHash
          ? [
              {
                kind: o.kind,
                key: o.sourceKey,
                reason: "Destino modificado; conservado para revisión",
              },
            ]
          : [];
    });
    console.log(
      JSON.stringify({
        runId: run.id,
        sourceHash: run.sourceHash,
        summary: run.summary,
        mappings,
        verifiedMappings: origins.length,
        discrepancies,
      }),
    );
    if (discrepancies.length) process.exitCode = 1;
    return;
  }
  if (command !== "apply" || !original || !expected)
    throw Error(
      "Uso: catalogo-ceo.ts inspect BASE.xlsx manifiesto.json | apply manifiesto.json BASE.xlsx HASH | verify RUN",
    );
  const bytes = await readFile(original);
  if (createHash("sha256").update(bytes).digest("hex") !== expected)
    throw Error("Original y hash esperado no coinciden");
  const input = JSON.parse(await readFile(path, "utf8"));
  if (
    JSON.stringify(input) !==
    JSON.stringify(
      await (input.sourceLogical === "DG-CEO"
        ? inspectDgComplement(original)
        : inspectCeoCatalog(original)),
    )
  )
    throw Error(
      "El manifiesto no corresponde a la extracción del original confirmado",
    );
  const credentials = JSON.parse(
    await readFile(
      join(
        homedir(),
        ".local/state/ceo-construcciones-codex/manual/credenciales.json",
      ),
      "utf8",
    ),
  );
  const user = await db.user.findUniqueOrThrow({
    where: { email: credentials.GERENCIA.email },
  });
  const operational = async () => ({
    clients: await db.client.count(),
    suppliers: await db.supplier.count(),
    works: await db.work.count(),
    orders: await db.purchaseOrder.count(),
    requests: await db.materialRequest.count(),
    balances: await db.stockBalance.count(),
    movements: await db.stockMovement.count(),
    receipts: await db.receipt.count(),
    budgets: await db.budget.count(),
  });
  const before = await operational();
  const result = await applyCatalogInventory(input, expected, {
    id: user.id,
    role: user.role,
  });
  const after = await operational();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error(
      "Los conteos operativos cambiaron; verificar antes de continuar.",
    );
  console.log(
    JSON.stringify({
      ...result,
      operationalBefore: before,
      operationalAfter: after,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
