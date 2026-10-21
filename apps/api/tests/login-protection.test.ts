import { describe, expect, it } from "vitest";
import {
  createLoginGate,
  loginClientCookie,
  loginClientKey,
  LOGIN_VERIFICATIONS_PER_SECOND,
  createLoginCleanup,
} from "../src/core/login-protection";

describe("admisión de verificaciones de login", () => {
  it("purga como máximo una vez cada 30 segundos incluso con llamadas simultáneas", async () => {
    let now = 0,
      calls = 0;
    let release!: () => void;
    const pending = new Promise<number>((resolve) => {
      release = () => resolve(1);
    });
    const cleanup = createLoginCleanup(
      async () => {
        calls++;
        return pending;
      },
      () => now,
    );
    const first = cleanup();
    await cleanup();
    expect(calls).toBe(1);
    release();
    await first;
    now = 29999;
    await cleanup();
    expect(calls).toBe(1);
    now = 30000;
    await cleanup();
    expect(calls).toBe(2);
  });
  it("limita concurrencia sin cola y libera capacidad incluso al fallar", async () => {
    const gate = createLoginGate(() => 0);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = gate(() => blocked);
    const second = gate(() =>
      blocked.then(() => {
        throw new Error("fixture");
      }),
    );
    const secondHandled = second.catch((e) => e);
    await expect(gate(async () => true)).rejects.toMatchObject({
      status: 429,
      code: "AUTH_BUSY",
    });
    release();
    await first;
    await secondHandled;
    await expect(gate(async () => true)).resolves.toBe(true);
  });
  it("limita también clientes rotativos y repone cupo con tiempo monotónico", async () => {
    let now = 0;
    const gate = createLoginGate(() => now);
    for (let i = 0; i < LOGIN_VERIFICATIONS_PER_SECOND; i++)
      await gate(async () => i);
    await expect(gate(async () => true)).rejects.toMatchObject({
      status: 429,
      headers: { "Retry-After": "1" },
    });
    now = 50;
    await expect(gate(async () => true)).resolves.toBe(true);
    await expect(gate(async () => true)).rejects.toMatchObject({ status: 429 });
    now = 2000;
    for (let i = 0; i < LOGIN_VERIFICATIONS_PER_SECOND; i++)
      await gate(async () => i);
    await expect(gate(async () => true)).rejects.toMatchObject({ status: 429 });
  });
  it("cookie HttpOnly de cliente no usa cuenta ni credenciales como identificador", () => {
    const token = "a".repeat(64);
    const cookie = loginClientCookie(token);
    expect(cookie).toContain("ceo_login_client=");
    expect(cookie).toContain("HttpOnly; SameSite=Lax; Path=/; Max-Age=900");
    expect(cookie).not.toContain("Domain=");
    expect(loginClientKey(token)).not.toContain(token);
    expect(loginClientKey(token)).toMatch(/^login-client:[a-f0-9]{64}$/);
  });
});
