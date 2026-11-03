import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { runtimeReleaseCheck } from "./release-runtime";

async function main() {
  const original = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(original.hostname) ||
    !original.pathname.includes("test")
  )
    throw Error("Esta prueba sólo admite PostgreSQL loopback con nombre test.");
  const name = `ceo_release_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new PrismaClient();
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();
  const target = new URL(original);
  target.pathname = "/" + name;
  const env = {
    ...process.env,
    DATABASE_URL: target.toString(),
    APP_ORIGIN: "http://localhost:3000",
  };
  function run(command: string, args: string[]) {
    const result = spawnSync(command, args, {
      cwd: resolve(__dirname, ".."),
      env,
      stdio: "inherit",
    });
    if (result.status !== 0)
      throw Error(`${command} ${args[0]} falló (${result.status})`);
  }
  for (const migration of [
    "20261022000100_backend_v1",
    "20261022000200_auth_attempt_expiration_index",
    "20261022000300_code_counters",
    "20261023000100_default_units",
  ]) {
    run("pnpm", [
      "exec",
      "prisma",
      "db",
      "execute",
      "--schema",
      "prisma/schema.prisma",
      "--file",
      `prisma/migrations/${migration}/migration.sql`,
    ]);
    run("pnpm", [
      "exec",
      "prisma",
      "migrate",
      "resolve",
      "--applied",
      migration,
    ]);
  }
  run("pnpm", [
    "exec",
    "tsx",
    "scripts/release-compatibility-fixture.ts",
    "legacy",
  ]);
  if (process.argv.includes("--runtime"))
    await runtimeReleaseCheck(
      target.toString(),
      false,
      process.argv.includes("--browser"),
    );
  run("pnpm", ["db:deploy"]);
  run("pnpm", [
    "exec",
    "tsx",
    "scripts/release-compatibility-fixture.ts",
    "expanded",
  ]);
  if (process.argv.includes("--runtime"))
    await runtimeReleaseCheck(
      target.toString(),
      true,
      process.argv.includes("--browser"),
    );
  run("pnpm", [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-schema-datasource",
    "prisma/schema.prisma",
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--exit-code",
  ]);
  console.log(
    `Compatibilidad V1 poblada → expandida aprobada. Base aislada conservada: ${name}`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
