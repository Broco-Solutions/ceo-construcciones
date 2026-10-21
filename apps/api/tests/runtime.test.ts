import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { db } from "../src/core/db";
import { hashPassword } from "../src/core/auth";
const enabled = process.env.RUN_RUNTIME === "1";
let child: ChildProcess,
  output = "";
const port = 31987;
const origin = `http://127.0.0.1:${port}`;
const email = `runtime-${randomUUID()}@example.test`;
const password = `Runtime-test-${randomUUID()}`;
describe.skipIf(!enabled)("artefacto standalone en proceso real Node", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL || "");
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      !url.pathname.includes("test")
    )
      throw new Error("Solo DB local test");
    await db.user.create({
      data: {
        email,
        name: "Runtime",
        role: "GERENCIA",
        passwordHash: await hashPassword(password),
      },
    });
    child = spawn(process.execPath, [".next/standalone/server.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        APP_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (b) => {
      output += b.toString();
    });
    child.stderr?.on("data", (b) => {
      output += b.toString();
    });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw new Error(`Standalone exited ${child.exitCode}: ${output}`);
      try {
        const r = await fetch(`${origin}/api/health`);
        if (r.ok) return;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Standalone no inició en 10 segundos");
  }, 20000);
  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        once(child, "exit"),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await db.$disconnect();
  });
  it("health comprueba PostgreSQL y API rechaza sesión ausente", async () => {
    const health = await fetch(`${origin}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({
      status: "ok",
      service: "ceo-api",
      database: "connected",
    });
    const auth = await fetch(`${origin}/api/v1/works`);
    expect(auth.status).toBe(401);
    expect(auth.headers.get("cache-control")).toBe("no-store");
  });
  it("login HTTP crea cookie segura y sesión permite flujo real sin pnpm runtime", async () => {
    const login = await fetch(`${origin}/api/v1/auth/login`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    const works = await fetch(`${origin}/api/v1/works`, {
      headers: { cookie: cookie.split(";")[0] },
    });
    expect(works.status).toBe(200);
    expect((await works.json()).data).toBeInstanceOf(Array);
    const logout = await fetch(`${origin}/api/v1/auth/logout`, {
      method: "POST",
      headers: { origin, cookie: cookie.split(";")[0] },
    });
    expect(logout.status).toBe(200);
    expect(
      (
        await fetch(`${origin}/api/v1/auth/me`, {
          headers: { cookie: cookie.split(";")[0] },
        })
      ).status,
    ).toBe(401);
  });
});
