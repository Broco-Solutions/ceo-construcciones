import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Role } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertOrigin, sessionCookie, sessionHash } from "../src/core/auth";
import { db } from "../src/core/db";
import { dispatch } from "../src/router";

type Operation = {
  security?: unknown[];
  "x-roles": string[];
  requestBody?: { content: { "application/json": { example?: unknown } } };
};
const contract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../docs/api/openapi.json"),
    "utf8",
  ),
) as { paths: Record<string, Record<string, Operation>> };
const users: string[] = [];
const tokens = new Map<Role, string>();
const restrictedRoles = Object.values(Role).filter(
  (role) => role !== Role.GERENCIA,
);

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "matriz de acceso del contrato contra rutas reales",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL ?? "");
      if (
        !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
        !/test/i.test(target.pathname)
      )
        throw new Error(
          "Use PostgreSQL local aislado con nombre de base test.",
        );
      const tag = randomUUID();
      for (const role of restrictedRoles) {
        // These users authenticate only through opaque sessions; no test password exists.
        const user = await db.user.create({
          data: {
            email: `matrix-${role}-${tag}@example.test`,
            name: role,
            role,
            passwordHash: "disabled-test-login",
          },
        });
        users.push(user.id);
        const token = randomBytes(32).toString("hex");
        tokens.set(role, token);
        await db.session.create({
          data: {
            userId: user.id,
            tokenHash: sessionHash(token),
            expiresAt: new Date(Date.now() + 60000),
          },
        });
      }
    });
    afterAll(async () => {
      if (users.length)
        await db.user.deleteMany({ where: { id: { in: users } } });
      await db.$disconnect();
    });

    for (const role of restrictedRoles) {
      it(`rechaza todas las operaciones que OpenAPI excluye para ${role}`, async () => {
        let checked = 0;
        const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
        for (const [pattern, methods] of Object.entries(contract.paths)) {
          for (const [method, operation] of Object.entries(methods)) {
            if (
              !operation.security?.length ||
              operation["x-roles"].includes(role)
            )
              continue;
            const path = pattern.replace(/\{[^}]+\}/g, "unavailable-resource");
            const input =
              operation.requestBody?.content["application/json"].example ?? {};
            const response = await dispatch(
              new Request(`${origin}/api/v1${path}`, {
                method: method.toUpperCase(),
                headers: {
                  origin,
                  cookie: `ceo_session=${tokens.get(role)}`,
                  "content-type": "application/json",
                  "idempotency-key": randomUUID(),
                },
                ...(["get", "head"].includes(method)
                  ? {}
                  : { body: JSON.stringify(input) }),
              }),
              path.slice(1).split("/"),
            );
            expect(
              response.status,
              `${role} ${method.toUpperCase()} ${pattern}: ${await response.text()}`,
            ).toBe(403);
            expect(response.headers.get("cache-control")).toBe("no-store");
            checked++;
          }
        }
        expect(checked).toBeGreaterThan(10);
      });
    }
  },
);

describe("sesión por proxy con origen público de Vercel", () => {
  afterAll(() => vi.unstubAllEnvs());
  it("acepta Origin público aunque la URL del backend sea distinta y rechaza origen/host falsificados", () => {
    const publicOrigin = "https://ceo-web.example.test";
    vi.stubEnv("APP_ORIGIN", publicOrigin);
    vi.stubEnv("NODE_ENV", "production");
    const request = (headers: Record<string, string>) =>
      new Request("https://ceo-api.example.test/api/v1/auth/logout", {
        method: "POST",
        headers,
      });
    expect(() =>
      assertOrigin(
        request({ origin: publicOrigin, "sec-fetch-site": "same-origin" }),
      ),
    ).not.toThrow();
    expect(sessionCookie("a".repeat(64))).toContain("; Secure");
    expect(sessionCookie("a".repeat(64))).not.toMatch(/Domain=/i);
    expect(() =>
      assertOrigin(
        request({ origin: publicOrigin, "sec-fetch-site": "cross-site" }),
      ),
    ).toThrow();
    expect(() =>
      assertOrigin(
        request({
          origin: "https://attacker.example.test",
          "x-forwarded-host": "ceo-web.example.test",
          host: "ceo-web.example.test",
        }),
      ),
    ).toThrow();
    expect(() =>
      assertOrigin(request({ "x-forwarded-host": "ceo-web.example.test" })),
    ).toThrow();
    vi.unstubAllEnvs();
  });
});
