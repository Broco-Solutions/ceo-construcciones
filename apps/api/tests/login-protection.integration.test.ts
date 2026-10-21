import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { hashPassword, sessionHash } from "../src/core/auth";
import {
  LOGIN_CLIENT_COOKIE,
  LOGIN_ATTEMPT_LIMIT,
  loginClientKey,
  purgeExpiredLoginAttempts,
  LOGIN_CLEANUP_BATCH,
} from "../src/core/login-protection";
import { dispatch } from "../src/router";
const suffix = randomUUID(),
  address = `login-audit-${suffix}@example.test`,
  password = `audit-password-${suffix}`;
const clients = new Set<string>();
let userId: string;
function cookie(response: Response) {
  const value = response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${LOGIN_CLIENT_COOKIE}=`));
  expect(value).toBeTruthy();
  const token = value!.slice(LOGIN_CLIENT_COOKIE.length + 1).split(";")[0];
  clients.add(token);
  return `${LOGIN_CLIENT_COOKIE}=${token}`;
}
async function attempt(
  email = address,
  guess = "invalid-password",
  client = "",
  headers: Record<string, string> = {},
) {
  return dispatch(
    new Request("https://api.example.test/api/v1/auth/login", {
      method: "POST",
      headers: {
        origin: process.env.APP_ORIGIN || "https://api.example.test",
        "content-type": "application/json",
        cookie: client,
        ...headers,
      },
      body: JSON.stringify({ email, password: guess }),
    }),
    ["auth", "login"],
  );
}
async function seed(failures = 0, expired = false) {
  const token = randomBytes(32).toString("hex");
  clients.add(token);
  await db.authAttempt.create({
    data: {
      key: loginClientKey(token),
      failures,
      resetAt: new Date(Date.now() + (expired ? -1000 : 900000)),
    },
  });
  return `${LOGIN_CLIENT_COOKIE}=${token}`;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "login sin bloqueo dirigido por cuenta",
  () => {
    beforeAll(async () => {
      const u = new URL(process.env.DATABASE_URL || "");
      if (
        !["127.0.0.1", "localhost"].includes(u.hostname) ||
        !u.pathname.includes("test")
      )
        throw new Error("Solo PG local test");
      userId = (
        await db.user.create({
          data: {
            email: address,
            name: "Login audit",
            role: "GERENCIA",
            passwordHash: await hashPassword(password),
          },
        })
      ).id;
    });
    afterAll(async () => {
      if (userId) {
        await db.session.deleteMany({ where: { userId } });
        await db.auditLog.deleteMany({ where: { actorId: userId } });
        await db.user.delete({ where: { id: userId } });
      }
      await db.authAttempt.deleteMany({
        where: {
          key: {
            in: [...clients]
              .map(loginClientKey)
              .concat(sessionHash(`login:${address}`)),
          },
        },
      });
      await db.$disconnect();
    });
    it("emite cookie también en 401; almacena hash sin datos de cuenta/contraseña", async () => {
      const r = await attempt();
      expect(r.status).toBe(401);
      const c = cookie(r);
      expect(r.headers.get("cache-control")).toBe("no-store");
      const token = c.split("=")[1];
      const row = await db.authAttempt.findUniqueOrThrow({
        where: { key: loginClientKey(token) },
      });
      expect(row.failures).toBe(1);
      expect(JSON.stringify(row)).not.toContain(address);
      expect(JSON.stringify(row)).not.toContain(password);
      expect(row.key).not.toContain(token);
    });
    it("purga lotes acotados de buckets antiguos y preserva activos y recién vencidos", async () => {
      // Historical test clock isolates this check from buckets in other test files.
      const now = new Date("2001-01-01T00:00:00Z");
      const keys: string[] = [];
      for (let i = 0; i < LOGIN_CLEANUP_BATCH + 5; i++) {
        const token = randomBytes(32).toString("hex");
        clients.add(token);
        keys.push(loginClientKey(token));
      }
      const protectedKeys = [
        randomBytes(32).toString("hex"),
        randomBytes(32).toString("hex"),
      ];
      protectedKeys.forEach((token) => clients.add(token));
      // Uncommitted fixtures are invisible to opportunistic purges in other suites.
      await db.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'Pacific/Auckland'`;
        await tx.authAttempt.createMany({
          data: [
            ...keys.map((key) => ({
              key,
              failures: 10,
              resetAt: new Date("2000-01-01T00:00:00Z"),
            })),
            {
              key: loginClientKey(protectedKeys[0]),
              failures: 10,
              resetAt: new Date(now.getTime() - 1000),
            },
            {
              key: loginClientKey(protectedKeys[1]),
              failures: 5,
              resetAt: new Date(now.getTime() + 900000),
            },
          ],
        });
        expect(await purgeExpiredLoginAttempts(now, tx)).toBe(
          LOGIN_CLEANUP_BATCH,
        );
        expect(
          await tx.authAttempt.count({ where: { key: { in: keys } } }),
        ).toBe(5);
        expect(
          await tx.authAttempt.count({
            where: { key: { in: protectedKeys.map(loginClientKey) } },
          }),
        ).toBe(2);
        expect(await purgeExpiredLoginAttempts(now, tx)).toBe(5);
        expect(await purgeExpiredLoginAttempts(now, tx)).toBe(0);
      });
    });
    it("omite buckets bloqueados y preserva la renovación concurrente", async () => {
      const token = randomBytes(32).toString("hex");
      clients.add(token);
      const key = loginClientKey(token);
      const now = new Date("1901-01-01T00:00:00Z");
      await db.authAttempt.create({
        data: { key, failures: 10, resetAt: new Date("1900-01-01T00:00:00Z") },
      });
      await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<
          { key: string }[]
        >`SELECT "key" FROM "AuthAttempt" WHERE "key" = ${key} FOR UPDATE`;
        expect(locked).toHaveLength(1);
        // A second connection must skip this locked, committed expired row.
        expect(await purgeExpiredLoginAttempts(now)).toBe(0);
        await tx.authAttempt.update({
          where: { key },
          data: { failures: 1, resetAt: new Date(Date.now() + 900000) },
        });
      });
      expect(await purgeExpiredLoginAttempts(now)).toBe(0);
      expect(
        (await db.authAttempt.findUniqueOrThrow({ where: { key } })).failures,
      ).toBe(1);
    });
    it("fallos contra víctima agotan solo cliente atacante; otra sesión puede entrar", async () => {
      let c = "";
      for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) {
        const r = await attempt(address, "invalid-password", c);
        expect(r.status).toBe(401);
        c = cookie(r);
      }
      const denied = await attempt(address, password, c);
      expect(denied.status).toBe(429);
      expect(Number(denied.headers.get("retry-after"))).toBeGreaterThan(0);
      expect(Number(denied.headers.get("retry-after"))).toBeLessThanOrEqual(
        900,
      );
      const victim = await attempt(address, password);
      expect(victim.status).toBe(200);
      cookie(victim);
      expect(
        victim.headers.getSetCookie().some((c) => c.startsWith("ceo_session=")),
      ).toBe(true);
      expect(victim.headers.getSetCookie()).toHaveLength(2);
      const stillBlocked = await attempt(address, password, c);
      expect(stillBlocked.status).toBe(429);
    });
    it("no permite eludir cupo cambiando email o encabezados de IP", async () => {
      const c = await seed(9);
      expect(
        (
          await attempt("other@example.test", "invalid-password", c, {
            "x-forwarded-for": "1.2.3.4",
            "x-real-ip": "1.2.3.4",
            forwarded: "for=1.2.3.4",
          })
        ).status,
      ).toBe(401);
      const r = await attempt(address, password, c, {
        "x-forwarded-for": "5.6.7.8",
        "x-real-ip": "5.6.7.8",
        forwarded: "for=5.6.7.8",
      });
      expect(r.status).toBe(429);
      expect((await r.json()).error.code).toBe("RATE_LIMITED");
    });
    it("cupo concurrente es atómico y rechaza exceso sin iniciar sesión", async () => {
      const c = await seed(9);
      const before = await db.session.count({ where: { userId } });
      const results = await Promise.all(
        [1, 2, 3].map(() => attempt(address, "invalid-password", c)),
      );
      expect(results.filter((r) => r.status === 401)).toHaveLength(1);
      expect(results.filter((r) => r.status === 429)).toHaveLength(2);
      expect(
        (
          await db.authAttempt.findUniqueOrThrow({
            where: { key: loginClientKey(c.split("=")[1]) },
          })
        ).failures,
      ).toBe(10);
      expect(await db.session.count({ where: { userId } })).toBe(before);
    });
    it("un bucket vencido se renueva y las cuentas legado bloqueadas no se usan", async () => {
      await db.authAttempt.create({
        data: {
          key: sessionHash(`login:${address}`),
          failures: 100,
          resetAt: new Date(Date.now() + 900000),
        },
      });
      const c = await seed(10, true);
      const r = await attempt(address, password, c);
      expect(r.status).toBe(200);
      const token = cookie(r).split("=")[1];
      expect(
        (
          await db.authAttempt.findUniqueOrThrow({
            where: { key: loginClientKey(token) },
          })
        ).failures,
      ).toBe(1);
    });
    it("rechaza elegir un bucket arbitrario y conserva error genérico para cuentas inexistentes/inactivas", async () => {
      const chosen = randomBytes(32).toString("hex");
      const missing = await attempt(
        "missing@example.test",
        "invalid-password",
        `${LOGIN_CLIENT_COOKIE}=${chosen}`,
      );
      expect(missing.status).toBe(401);
      expect(cookie(missing)).not.toContain(chosen);
      await db.user.update({ where: { id: userId }, data: { active: false } });
      try {
        const inactive = await attempt(address, password);
        expect(inactive.status).toBe(401);
        cookie(inactive);
        expect(await inactive.json()).toEqual(await missing.json());
      } finally {
        await db.user.update({ where: { id: userId }, data: { active: true } });
      }
    });
  },
);
