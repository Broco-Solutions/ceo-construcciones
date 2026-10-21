import { Prisma } from "@prisma/client";
import { ApiError } from "./errors";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "VALIDATION_ERROR", "Se requiere un objeto JSON.");
  return value as Record<string, unknown>;
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (Buffer.byteLength(text) > 1024 * 1024)
    throw new ApiError(413, "BODY_TOO_LARGE", "El cuerpo excede 1 MB.");
  try {
    return object(JSON.parse(text));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "JSON inválido.");
  }
}
export function string(value: unknown, name = "valor", max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `${name}: texto requerido de hasta ${max} caracteres.`,
    );
  return value.trim();
}
export function optionalString(
  value: unknown,
  name = "valor",
  max = 200,
): string | undefined {
  return value === undefined || value === null
    ? undefined
    : string(value, name, max);
}
export function decimal(
  value: unknown,
  name = "cantidad",
  allowZero = false,
): Prisma.Decimal {
  if (typeof value !== "string" || !/^\d{1,14}(\.\d{1,6})?$/.test(value))
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `${name}: decimal positivo como texto, hasta 14 enteros y 6 decimales.`,
    );
  const result = new Prisma.Decimal(value);
  if (allowZero ? result.lt(0) : result.lte(0))
    throw new ApiError(400, "VALIDATION_ERROR", `${name}: debe ser positivo.`);
  return result;
}
export function list(value: unknown, name = "líneas", max = 500): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      `${name}: entre 1 y ${max} elementos.`,
    );
  return value;
}
export function page(request: Request) {
  const query = new URL(request.url).searchParams;
  const page = Number(query.get("page") ?? 1),
    pageSize = Number(query.get("pageSize") ?? 50);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    throw new ApiError(400, "VALIDATION_ERROR", "Paginación inválida.");
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
export function date(value: unknown, name = "fecha"): Date {
  const text = string(value, name, 40);
  const result = new Date(text);
  if (!/^\d{4}-\d{2}-\d{2}/.test(text) || !Number.isFinite(result.getTime()))
    throw new ApiError(400, "VALIDATION_ERROR", `${name}: fecha ISO inválida.`);
  return result;
}
export function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  name = "estado",
): T {
  if (typeof value !== "string" || !values.includes(value as T))
    throw new ApiError(400, "VALIDATION_ERROR", `${name}: valor inválido.`);
  return value as T;
}
export function boolean(value: unknown, name = "activo"): boolean {
  if (typeof value !== "boolean")
    throw new ApiError(400, "VALIDATION_ERROR", `${name}: booleano requerido.`);
  return value;
}
export function json(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}
