import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { once } from "node:events";
import { access } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done, reject) =>
    server.close((e) => (e ? reject(e) : done())),
  );
  return port;
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise<void>((done) =>
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        done();
      }, 3000),
    ),
  ]);
}
async function ready(url: string, child: ChildProcess, status: number) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw Error("El artefacto terminó antes del healthcheck");
    try {
      if (
        (await fetch(url, { signal: AbortSignal.timeout(1000) })).status ===
        status
      )
        return;
    } catch {}
    await new Promise((done) => setTimeout(done, 200));
  }
  throw Error("El artefacto no quedó disponible");
}

/** Executes the built artifact, with its real HTTP/auth/Prisma boundary. */
export async function runtimeReleaseCheck(
  databaseUrl: string,
  expanded: boolean,
  browserCheck: boolean,
) {
  const apiRoot = resolve(__dirname, ".."),
    webRoot = resolve(apiRoot, "../web");
  await access(resolve(apiRoot, ".next/standalone/server.js"));
  if (browserCheck) await access(resolve(webRoot, ".next/BUILD_ID"));
  const apiPort = await freePort(),
    webPort = await freePort(),
    origin = browserCheck
      ? `http://localhost:${webPort}`
      : "http://localhost:3000",
    base = `http://127.0.0.1:${apiPort}`,
    token = randomBytes(32).toString("hex");
  const client = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const actor = await client.user.findUniqueOrThrow({
      where: { email: "release@test.invalid" },
    });
    await client.session.create({
      data: {
        userId: actor.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  } finally {
    await client.$disconnect();
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    APP_ORIGIN: origin,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const api = spawn(
    process.execPath,
    [resolve(apiRoot, ".next/standalone/server.js")],
    {
      cwd: apiRoot,
      env: { ...env, PORT: String(apiPort), HOSTNAME: "127.0.0.1" },
      stdio: "ignore",
    },
  );
  let web: ChildProcess | undefined;
  try {
    await ready(base + "/api/health", api, 200);
    const call = (path: string, method = "GET", body?: unknown) =>
      fetch(`${base}/api/v1/${path}`, {
        method,
        headers: {
          origin,
          cookie: `ceo_session=${token}`,
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    for (const path of [
      "works",
      "apu-items",
      "budgets",
      "purchase-orders",
      "stock",
    ])
      assert.equal((await call(path)).status, 200, `HTTP ${path} preservado`);
    assert.equal((await call("clients")).status, expanded ? 200 : 503);
    if (expanded) {
      const c = await (
        await call("clients", "POST", {
          code: "RUNTIME-CLIENT",
          name: "Cliente HTTP sintético",
        })
      ).json();
      const work = await call("works", "POST", {
        code: "RUNTIME-EXPANDED",
        name: "Obra HTTP expandida",
        clientId: c.data.id,
      });
      assert.equal(work.status, 201);
    } else
      assert.equal(
        (
          await call("works", "POST", {
            code: "RUNTIME-LEGACY",
            name: "Obra HTTP compatible V1",
          })
        ).status,
        201,
      );
    if (browserCheck) {
      web = spawn(
        process.execPath,
        [
          resolve(webRoot, "node_modules/next/dist/bin/next"),
          "start",
          "-p",
          String(webPort),
          "--hostname",
          "127.0.0.1",
        ],
        { cwd: webRoot, env: { ...env, API_BASE_URL: base }, stdio: "ignore" },
      );
      await ready(origin + "/login", web!, 200);
      const { chromium } = createRequire(resolve(webRoot, "package.json"))(
        "@playwright/test",
      ) as any;
      const browser = await chromium.launch({ headless: true });
      try {
        const context = await browser.newContext();
        await context.addCookies([
          {
            name: "ceo_session",
            value: token,
            domain: "localhost",
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "Strict",
          },
        ]);
        const page = await context.newPage();
        await page.goto(origin + "/obras");
        await page
          .getByRole("button", { name: "Nueva obra", exact: true })
          .click();
        const dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Nombre", { exact: true })
          .fill(`Obra navegador ${expanded ? "ampliada" : "V1"}`);
        if (expanded) {
          await dialog
            .getByLabel("Cliente principal")
            .selectOption({ index: 1 });
        } else {
          await dialog
            .getByText(/Los datos de clientes todavía no están habilitados/)
            .waitFor();
          assert.equal(
            await dialog.getByLabel("Cliente principal").isDisabled(),
            true,
          );
        }
        await dialog
          .getByRole("button", { name: "Crear obra", exact: true })
          .click();
        await page.waitForURL(/\/obras\/[^/]+$/);
        await page
          .getByRole("heading", { level: 1, name: /Obra navegador/ })
          .waitFor({ state: "visible" });
        assert.match(
          await page.getByRole("heading", { level: 1 }).innerText(),
          /Obra navegador/,
        );
        await context.close();
      } finally {
        await browser.close();
      }
    }
    console.log(
      `Artefacto HTTP ${expanded ? "expandido" : "V1"}: catálogo, obras, presupuestos, OC y stock aprobados${browserCheck ? "; alta de obra por navegador real aprobada" : ""}.`,
    );
  } finally {
    if (web) await stop(web);
    await stop(api);
  }
}
