import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
async function main() {
  const [input, source, output] = process.argv.slice(2);
  if (!input || !source || !output)
    throw Error(
      "Uso: verify-historical-db.ts normalized-input.json dg-normalized-v2.json directorio-nuevo",
    );
  const original = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(original.hostname) ||
    !original.pathname.includes("test")
  )
    throw Error("Sólo PostgreSQL loopback test");
  const name = `ceo_historical_test_${randomUUID().replaceAll("-", "")}`,
    admin = new PrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const target = new URL(original);
  target.pathname = "/" + name;
  const env = {
    ...process.env,
    DATABASE_URL: target.toString(),
    APP_ORIGIN: "http://localhost:3000",
  };
  for (const args of [
    ["db:deploy"],
    [
      "exec",
      "tsx",
      "scripts/historical-db-fixture.ts",
      resolve(input),
      resolve(source),
      resolve(output),
    ],
  ]) {
    const r = spawnSync("pnpm", args, {
      cwd: resolve(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    if (r.status !== 0)
      throw Error(
        "Verificación histórica rechazada; se conserva base aislada " + name,
      );
  }
  console.log(
    "Aceptación histórica contra PostgreSQL ejecutada; base aislada conservada: " +
      name,
  );
}
main().catch((e) => {
  console.error(
    e instanceof Error ? e.message : "Error de verificación histórica",
  );
  process.exitCode = 1;
});
