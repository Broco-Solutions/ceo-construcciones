/** Private evidence only. Never prints source prices or credentials. */
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { db, transaction } from "../src/core/db";
import { applyCatalogInventory } from "../src/modules/catalog-load";
import { inspectCeoCatalog } from "./inspect-ceo-catalog";
import { resolveActivityCosts } from "../src/modules/cost-references";

async function main() {
  const [mode, output] = process.argv.slice(2);
  const url = new URL(process.env.DATABASE_URL!);
  if (url.hostname !== "127.0.0.1" || !url.pathname.includes("test"))
    throw Error("Sólo destino aislado local");
  if (!output || !["apply", "read"].includes(mode))
    throw Error("Uso: check-base-linkage.ts apply|read SALIDA_PRIVADA");
  let run;
  if (mode === "apply") {
    if (!url.pathname.startsWith("/ceo_base_link_test_"))
      throw Error("La reproducción escribe sólo en base nueva propia");
    const source = await inspectCeoCatalog(
      join(
        homedir(),
        ".local/state/ceo-construcciones-codex/sources/base.xlsx",
      ),
    );
    const actor = await db.user.create({
      data: {
        email: `base-link-${Date.now()}@test.invalid`,
        name: "Reproducción aislada BASE",
        role: "GERENCIA",
        passwordHash: "disabled",
      },
    });
    run = await applyCatalogInventory(source, source.sourceSha256, actor);
  }
  const origins = await db.catalogOrigin.findMany({
    where: { source: "BASE-CEO", kind: "activity" },
  });
  const costs = await transaction((tx) =>
    resolveActivityCosts(
      tx,
      origins.map((o) => o.entityId),
    ),
  );
  const definitions = [...costs].map(([id, value]) => ({
    key: origins.find((o) => o.entityId === id)!.sourceKey,
    id,
    ...value,
  }));
  const templates = await db.budgetTemplate.findMany({
    where: {
      id: {
        in: (
          await db.catalogOrigin.findMany({
            where: { source: "BASE-CEO", kind: "template" },
          })
        ).map((o) => o.entityId),
      },
    },
  });
  const result = {
    mode,
    database: url.pathname,
    run,
    activities: definitions.length,
    linked: definitions.filter(
      (d) => !d.content.materialsIncludedInDirect && d.content.materials.length,
    ).length,
    selectedReferences: definitions.reduce(
      (n, d) => n + d.content.materials.length,
      0,
    ),
    definitions,
    templates,
  };
  await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(
    JSON.stringify({
      mode,
      activities: result.activities,
      linked: result.linked,
      selectedReferences: result.selectedReferences,
      output,
    }),
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
