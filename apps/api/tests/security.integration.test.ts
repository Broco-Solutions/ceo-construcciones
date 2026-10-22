import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import {
  authenticate,
  hashPassword,
  requireWork,
  sessionHash,
} from "../src/core/auth";
import { identity } from "../src/modules/identity";

const enabled = process.env.RUN_INTEGRATION === "1";
const suffix = randomUUID();
const password = "Prueba-individual-no-productiva";
let adminId: string,
  chiefId: string,
  assignedId: string,
  foreignId: string,
  cookie: string;

describe.skipIf(!enabled)("seguridad contra PostgreSQL aislado", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
      !/test/i.test(target.pathname)
    )
      throw new Error("Use PostgreSQL local y nombre de base con test.");
    const passwordHash = await hashPassword(password);
    adminId = (
      await db.user.create({
        data: {
          email: `admin-${suffix}@example.test`,
          name: "Gerencia prueba",
          role: Role.GERENCIA,
          passwordHash,
        },
      })
    ).id;
    chiefId = (
      await db.user.create({
        data: {
          email: `jefe-${suffix}@example.test`,
          name: "Jefe prueba",
          role: Role.JEFE_OBRA,
          passwordHash,
        },
      })
    ).id;
    assignedId = (
      await db.work.create({
        data: { code: `assigned-${suffix}`, name: "Asignada" },
      })
    ).id;
    foreignId = (
      await db.work.create({
        data: { code: `foreign-${suffix}`, name: "Ajena" },
      })
    ).id;
    await db.workAssignment.create({
      data: { userId: chiefId, workId: assignedId },
    });
  });
  afterAll(async () => {
    if (adminId && chiefId) {
      await db.auditLog.deleteMany({
        where: { actorId: { in: [adminId, chiefId] } },
      });
      await db.user.deleteMany({ where: { id: { in: [adminId, chiefId] } } });
      await db.work.deleteMany({
        where: { id: { in: [assignedId, foreignId] } },
      });
      await db.authAttempt.deleteMany({
        where: {
          key: {
            in: [
              sessionHash(`login:admin-${suffix}@example.test`),
              sessionHash(`login:jefe-${suffix}@example.test`),
            ],
          },
        },
      });
    }
    await db.$disconnect();
  });
  const request = (path: string, data?: unknown, session?: string) =>
    new Request(`http://localhost/api/v1/${path}`, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        origin: process.env.APP_ORIGIN ?? "http://localhost",
        ...(session ? { cookie: session } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  it("rechaza login inválido y autentica sesión opaca correcta con auditoría", async () => {
    await expect(
      identity(
        request("auth/login", {
          email: `admin-${suffix}@example.test`,
          password: "equivocada",
        }),
        ["auth", "login"],
      ),
    ).rejects.toMatchObject({ status: 401 });
    const response = await identity(
      request("auth/login", {
        email: `admin-${suffix}@example.test`,
        password,
      }),
      ["auth", "login"],
    );
    cookie = response!.headers.get("set-cookie")!.split(";")[0];
    expect(await authenticate(request("auth/me", undefined, cookie))).toEqual({
      id: adminId,
      role: Role.GERENCIA,
    });
    expect(
      await db.auditLog.count({ where: { actorId: adminId, action: "LOGIN" } }),
    ).toBe(1);
    expect(
      await db.session.findFirst({ where: { userId: adminId } }),
    ).not.toHaveProperty("token");
  });
  it("limita jefe a obras asignadas y prohíbe administración de usuarios", async () => {
    const actor = { id: chiefId, role: Role.JEFE_OBRA };
    await expect(requireWork(actor, assignedId)).resolves.toBeUndefined();
    await expect(requireWork(actor, foreignId)).rejects.toMatchObject({
      status: 403,
    });
    const response = await identity(
      request("auth/login", { email: `jefe-${suffix}@example.test`, password }),
      ["auth", "login"],
    );
    const chiefCookie = response!.headers.get("set-cookie")!.split(";")[0];
    await expect(
      identity(request("users", undefined, chiefCookie), ["users"]),
    ).rejects.toMatchObject({ status: 403 });
    const me = await identity(request("auth/me", undefined, chiefCookie), [
      "auth",
      "me",
    ]);
    expect(JSON.stringify(await me!.json())).not.toContain("passwordHash");
  });
  it("logout revoca sesión y usuario inactivo no puede iniciar sesión", async () => {
    await identity(request("auth/logout", {}, cookie), ["auth", "logout"]);
    await expect(
      authenticate(request("auth/me", undefined, cookie)),
    ).rejects.toMatchObject({ status: 401 });
    await db.user.update({ where: { id: adminId }, data: { active: false } });
    await expect(
      identity(
        request("auth/login", {
          email: `admin-${suffix}@example.test`,
          password,
        }),
        ["auth", "login"],
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});
