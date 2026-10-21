import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(".next/standalone");
const nested = resolve(root, "apps/api");
if (existsSync(resolve(nested, "server.js"))) {
  await writeFile(
    resolve(root, "server.js"),
    "// Stable Railway entrypoint for the pnpm monorepo output.\nrequire('./apps/api/server.js');\n",
  );
  await mkdir(resolve(nested, ".next"), { recursive: true });
  await cp(resolve(".next/static"), resolve(nested, ".next/static"), {
    recursive: true,
  });
  if (existsSync("public"))
    await cp(resolve("public"), resolve(nested, "public"), { recursive: true });
} else if (!existsSync(resolve(root, "server.js"))) {
  throw new Error("No standalone server generated");
}
console.info("Standalone listo: node .next/standalone/server.js");
