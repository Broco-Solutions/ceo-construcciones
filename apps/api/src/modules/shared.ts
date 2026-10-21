import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../core/errors";
import { db, type Tx } from "../core/db";
import { type Actor, requireWork } from "../core/auth";

export const id = z.string().min(1).max(100);
export const text = z.string().trim().min(1).max(500);
export const decimal = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,15})(\.\d{1,8})?$/,
    "Decimal positivo, hasta 8 decimales",
  )
  .refine((v) => new Prisma.Decimal(v).gt(0));
export const nonnegative = z.string().regex(/^(0|[1-9]\d{0,15})(\.\d{1,8})?$/);
export const money = nonnegative;
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const taxBasis = z.enum(["UNSPECIFIED", "INCLUDED", "EXCLUDED"]);
export const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
export function ok(data: unknown, status = 200) {
  return Response.json({ data }, { status });
}
export async function parse<T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2_000_000)
    throw new ApiError(
      413,
      "BODY_TOO_LARGE",
      "El archivo supera el tamaño permitido",
    );
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON inválido");
  }
  if (Buffer.byteLength(raw) > 2_000_000)
    throw new ApiError(
      413,
      "BODY_TOO_LARGE",
      "El archivo supera el tamaño permitido",
    );
  try {
    return schema.parse(JSON.parse(raw));
  } catch (e) {
    if (e instanceof z.ZodError)
      throw new ApiError(422, "VALIDATION_ERROR", "Datos inválidos", e.issues);
    throw new ApiError(400, "INVALID_JSON", "JSON inválido");
  }
}
export function paging(request: Request) {
  const s = new URL(request.url).searchParams;
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .parse(s.get("page") || 1);
  const pageSize = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(s.get("pageSize") || 50);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
export function listed(
  data: unknown[],
  total: number,
  p: ReturnType<typeof paging>,
) {
  return Response.json({
    data,
    pagination: { page: p.page, pageSize: p.pageSize, total },
  });
}
export function found<T>(value: T | null | undefined, name = "Recurso"): T {
  if (!value) throw new ApiError(404, "NOT_FOUND", `${name} no encontrado`);
  return value;
}
export function conflict(message: string): never {
  throw new ApiError(409, "CONFLICT", message);
}
export async function locationAccess(
  actor: Actor,
  locationId: string,
  client: Tx | typeof db = db,
) {
  const location = found(
    await client.location.findUnique({ where: { id: locationId } }),
    "Ubicación",
  );
  if (!location.active) conflict("Ubicación inactiva");
  if (actor.role === "JEFE_OBRA") {
    if (!location.workId)
      throw new ApiError(403, "FORBIDDEN", "Ubicación no autorizada");
    await requireWork(actor, location.workId, client);
  }
  return location;
}
export async function validMaterial(tx: Tx, materialId: string) {
  const m = found(
    await tx.material.findUnique({ where: { id: materialId } }),
    "Material",
  );
  if (!m.active) conflict("Material inactivo");
  return m;
}
export async function presentationCheck(
  tx: Tx,
  line: {
    materialId: string;
    presentationId?: string | null;
    baseQuantity: string;
  },
  supplierId: string,
) {
  await validMaterial(tx, line.materialId);
  if (line.presentationId) {
    const p = found(
      await tx.presentation.findUnique({ where: { id: line.presentationId } }),
      "Presentación",
    );
    if (
      !p.active ||
      p.materialId !== line.materialId ||
      (p.supplierId && p.supplierId !== supplierId) ||
      !p.baseQuantity.eq(line.baseQuantity)
    )
      conflict("Presentación o conversión incompatible");
  } else if (!D(line.baseQuantity).eq(1))
    conflict(
      "Sin presentación, la unidad de cotización debe ser la unidad base",
    );
}
export function uniqueLines(lines: { materialId: string }[]) {
  if (new Set(lines.map((l) => l.materialId)).size !== lines.length)
    conflict("Material repetido");
}
