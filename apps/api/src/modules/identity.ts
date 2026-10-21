import { randomBytes } from "node:crypto";
import { Prisma, Role } from "@prisma/client";
import { db, transaction } from "../core/db";
import { ApiError } from "../core/errors";
import {
  Actor,
  assertOrigin,
  authenticate,
  cookieToken,
  hashPassword,
  requireRoles,
  sessionCookie,
  sessionHash,
  verifyPassword,
} from "../core/auth";
import { audit } from "../core/audit";
import { body, boolean, enumValue, json, page, string } from "../core/input";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
function passwordInput(value: unknown): string {
  if (typeof value !== "string" || !value.length || value.length > 128)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "Contraseña requerida, hasta 128 caracteres.",
    );
  return value;
}
const email = (value: unknown) => {
  const result = string(value, "email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))
    throw new ApiError(400, "VALIDATION_ERROR", "Email inválido.");
  return result;
};

async function login(request: Request): Promise<Response> {
  const input = await body(request);
  const address = email(input.email),
    password = passwordInput(input.password);
  const key = sessionHash(`login:${address}`);
  // Account-keyed limiter works across replicas and does not trust spoofable forwarded IPs.
  await transaction(async (tx) => {
    const now = new Date();
    let bucket = await tx.authAttempt.findUnique({ where: { key } });
    if (!bucket || bucket.resetAt <= now) {
      bucket = await tx.authAttempt.upsert({
        where: { key },
        create: {
          key,
          failures: 1,
          resetAt: new Date(Date.now() + 15 * 60 * 1000),
        },
        update: { failures: 1, resetAt: new Date(Date.now() + 15 * 60 * 1000) },
      });
    } else {
      if (bucket.failures >= 10)
        throw new ApiError(
          429,
          "RATE_LIMITED",
          "Demasiados intentos. Espere 15 minutos.",
        );
      await tx.authAttempt.update({
        where: { key },
        data: { failures: { increment: 1 } },
      });
    }
  });
  const user = await db.user.findUnique({ where: { email: address } });
  // Equal-cost password verification for unknown accounts avoids a cheap enumeration path.
  const encoded =
    user?.passwordHash ??
    `scrypt$00000000000000000000000000000000$${"0".repeat(128)}`;
  const valid = await verifyPassword(password, encoded);
  if (!user || !user.active || !valid)
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Email o contraseña incorrectos.",
    );
  const token = randomBytes(32).toString("hex");
  await transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!current.active || current.passwordHash !== user.passwordHash)
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "Email o contraseña incorrectos.",
      );
    await tx.session.create({
      data: {
        tokenHash: sessionHash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      },
    });
    await tx.authAttempt.deleteMany({ where: { key } });
    await audit(tx, user, "LOGIN", "User", user.id);
  });
  return Response.json(
    { data: { id: user.id, name: user.name, role: user.role } },
    {
      headers: {
        "Set-Cookie": sessionCookie(token),
        "Cache-Control": "no-store",
      },
    },
  );
}

async function updateUser(
  actor: Actor,
  id: string,
  input: Record<string, unknown>,
) {
  return transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id } });
    if (!existing)
      throw new ApiError(404, "NOT_FOUND", "Usuario no encontrado.");
    const role =
      input.role === undefined
        ? existing.role
        : enumValue(input.role, Object.values(Role), "rol");
    const active =
      input.active === undefined ? existing.active : boolean(input.active);
    if (
      existing.role === Role.GERENCIA &&
      existing.active &&
      (!active || role !== Role.GERENCIA)
    ) {
      const count = await tx.user.count({
        where: { role: Role.GERENCIA, active: true },
      });
      if (count <= 1)
        throw new ApiError(
          409,
          "LAST_ADMIN",
          "Debe conservar al menos una Gerencia activa.",
        );
    }
    const updated = await tx.user.update({
      where: { id },
      data: {
        ...(input.name === undefined
          ? {}
          : { name: string(input.name, "nombre") }),
        ...(input.email === undefined ? {} : { email: email(input.email) }),
        ...(input.password === undefined
          ? {}
          : {
              passwordHash: await hashPassword(passwordInput(input.password)),
            }),
        role,
        active,
      },
      select: userSelect,
    });
    if (input.password !== undefined || role !== existing.role || !active)
      await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, actor, "UPDATE", "User", id, {
      role,
      active,
      name: updated.name,
      email: updated.email,
    });
    return updated;
  });
}

export async function identity(
  request: Request,
  segments: string[],
): Promise<Response | null> {
  const [resource, id, operation] = segments;
  if (resource !== "auth" && resource !== "users") return null;
  assertOrigin(request);
  if (
    resource === "auth" &&
    id === "login" &&
    segments.length === 2 &&
    request.method === "POST"
  )
    return login(request);
  const actor = await authenticate(request);
  if (resource === "auth") {
    if (id === "me" && segments.length === 2 && request.method === "GET")
      return json(
        await db.user.findUnique({
          where: { id: actor.id },
          select: userSelect,
        }),
      );
    if (id === "logout" && segments.length === 2 && request.method === "POST") {
      const token = cookieToken(request)!;
      await transaction(async (tx) => {
        await tx.session.deleteMany({
          where: { tokenHash: sessionHash(token) },
        });
        await audit(tx, actor, "LOGOUT", "User", actor.id);
      });
      return Response.json(
        { data: { loggedOut: true } },
        { headers: { "Set-Cookie": sessionCookie("", 0) } },
      );
    }
    return null;
  }
  requireRoles(actor, Role.GERENCIA);
  if (!id && request.method === "GET") {
    const pagination = page(request);
    const [items, total] = await Promise.all([
      db.user.findMany({
        select: userSelect,
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.user.count(),
    ]);
    return Response.json({
      data: items,
      pagination: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
      },
    });
  }
  if (!id && request.method === "POST") {
    const input = await body(request),
      passwordHash = await hashPassword(passwordInput(input.password));
    const result = await transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: email(input.email),
          name: string(input.name, "nombre"),
          role: enumValue(input.role, Object.values(Role), "rol"),
          passwordHash,
        },
        select: userSelect,
      });
      await audit(tx, actor, "CREATE", "User", user.id, {
        email: user.email,
        role: user.role,
      });
      return user;
    });
    return json(result, 201);
  }
  if (id && segments.length === 2 && request.method === "PATCH")
    return json(await updateUser(actor, id, await body(request)));
  if (id && operation === "assignments" && segments.length === 3) {
    if (request.method === "GET")
      return json(
        await db.workAssignment.findMany({
          where: { userId: id },
          select: { workId: true },
        }),
      );
    if (request.method === "PUT") {
      const input = await body(request);
      if (!Array.isArray(input.workIds) || input.workIds.length > 1000)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "workIds debe ser una lista de hasta 1000 obras.",
        );
      const ids = [
        ...new Set(input.workIds.map((value) => string(value, "workId"))),
      ];
      const result = await transaction(async (tx) => {
        if (!(await tx.user.findUnique({ where: { id } })))
          throw new ApiError(404, "NOT_FOUND", "Usuario no encontrado.");
        if (
          (await tx.work.count({ where: { id: { in: ids } } })) !== ids.length
        )
          throw new ApiError(400, "VALIDATION_ERROR", "Obra inexistente.");
        await tx.workAssignment.deleteMany({ where: { userId: id } });
        await tx.workAssignment.createMany({
          data: ids.map((workId) => ({ userId: id, workId })),
        });
        await audit(tx, actor, "ASSIGN_WORKS", "User", id, { workIds: ids });
        return { workIds: ids };
      });
      return json(result);
    }
  }
  return null;
}
