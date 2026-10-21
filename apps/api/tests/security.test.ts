import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  assertOrigin,
  cookieToken,
  hashPassword,
  requireRoles,
  sessionCookie,
  sessionHash,
  verifyPassword,
} from "../src/core/auth";

describe("seguridad de credenciales y cookies", () => {
  it("hashes salted independently and verifies valid/invalid passwords", async () => {
    const first = await hashPassword("una-clave-segura-de-prueba");
    const second = await hashPassword("una-clave-segura-de-prueba");
    expect(first).not.toBe(second);
    expect(await verifyPassword("una-clave-segura-de-prueba", first)).toBe(
      true,
    );
    expect(await verifyPassword("clave-equivocada", first)).toBe(false);
    expect(await verifyPassword("clave-equivocada", "invalid")).toBe(false);
    await expect(hashPassword("corta")).rejects.toMatchObject({ status: 400 });
  });
  it("rejects forbidden roles and admits explicitly listed roles", () => {
    expect(() =>
      requireRoles(
        { id: "u", role: Role.JEFE_OBRA },
        Role.GERENCIA,
        Role.COMPRAS,
      ),
    ).toThrow();
    expect(() =>
      requireRoles(
        { id: "u", role: Role.COMPRAS },
        Role.GERENCIA,
        Role.COMPRAS,
      ),
    ).not.toThrow();
  });
  it("protects cookie from script access and stores only token digest", () => {
    expect(sessionCookie("a".repeat(64))).toContain(
      "HttpOnly; SameSite=Lax; Path=/",
    );
    expect(sessionHash("a".repeat(64))).toHaveLength(64);
    expect(sessionHash("a".repeat(64))).not.toBe("a".repeat(64));
    expect(
      cookieToken(
        new Request("http://localhost", {
          headers: { cookie: "ceo_session=bad" },
        }),
      ),
    ).toBeUndefined();
  });
  it("requires exact Origin on mutations without trusting host forwarding", () => {
    const origin = process.env.APP_ORIGIN ?? "http://localhost";
    expect(() =>
      assertOrigin(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: { origin },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertOrigin(
        new Request("http://localhost/api/v1/auth/login", {
          method: "POST",
          headers: { origin: "https://attacker.invalid" },
        }),
      ),
    ).toThrow();
    expect(() =>
      assertOrigin(
        new Request("http://localhost/api/v1/auth/login", { method: "POST" }),
      ),
    ).toThrow();
  });
});
