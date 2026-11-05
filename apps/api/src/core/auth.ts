import {
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { Role } from "@prisma/client";
import { db, type Tx } from "./db";
import { ApiError } from "./errors";

const scrypt = promisify(nodeScrypt);
export type Actor = { id: string; role: Role };
export const SESSION_COOKIE = "ceo_session";
export const sessionHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8 || password.length > 128)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "La contraseña debe tener entre 8 y 128 caracteres.",
    );
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  if (password.length > 128) return false;
  const [scheme, salt, hash] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !hash || !/^[a-f0-9]{128}$/.test(hash))
    return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}
export function cookieToken(request: Request): string | undefined {
  const raw = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : undefined;
}
export function sessionCookie(token: string, maxAge = 60 * 60 * 12): string {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "true";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
export async function authenticate(request: Request): Promise<Actor> {
  const token = cookieToken(request);
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Inicie sesión.");
  const session = await db.session.findUnique({
    where: { tokenHash: sessionHash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    throw new ApiError(401, "UNAUTHENTICATED", "Sesión vencida o inválida.");
  return { id: session.user.id, role: session.user.role };
}
export function requireRoles(actor: Actor, ...roles: Role[]): void {
  if (!roles.includes(actor.role))
    throw new ApiError(
      403,
      "FORBIDDEN",
      "No tiene permiso para esta operación.",
    );
}
export async function requireWork(
  actor: Actor,
  workId: string,
  client: Tx | typeof db = db,
): Promise<void> {
  const work = await client.work.findUnique({
    where: { id: workId },
    select: { id: true },
  });
  if (!work) throw new ApiError(404, "NOT_FOUND", "Obra no encontrada.");
  if (actor.role === Role.JEFE_OBRA) {
    const assignment = await client.workAssignment.findUnique({
      where: { userId_workId: { userId: actor.id, workId } },
    });
    if (!assignment)
      throw new ApiError(403, "FORBIDDEN", "No tiene acceso a esta obra.");
  }
}
/** Browser mutations require the public frontend Origin, including when forwarded by its server proxy. */
export function assertOrigin(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const configured = process.env.APP_ORIGIN;
  if (!configured && process.env.NODE_ENV === "production")
    throw new ApiError(
      503,
      "ORIGIN_NOT_CONFIGURED",
      "Origen de aplicación sin configurar.",
    );
  const allowed = configured ?? new URL(request.url).origin;
  if (request.headers.get("origin") !== allowed)
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "Origen de solicitud no permitido.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "INVALID_ORIGIN",
      "Solicitud entre sitios no permitida.",
    );
}
