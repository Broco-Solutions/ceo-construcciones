import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db } from "../core/db";
import type { Actor } from "../core/auth";
import { ApiError } from "../core/errors";
import { id, ok, parse } from "./shared";
import { xlsxResponse } from "./exports";
const resources = [
  "clients",
  "works",
  "suppliers",
  "materials",
  "apu-items",
  "stock",
  "stock/alerts",
  "movements",
  "audit",
  "budgets",
  "requests",
  "purchase-orders",
  "receipts",
  "prices",
  "order-administration",
] as const;
export const selectionSchema = z
  .object({
    resource: z.enum(resources),
    filters: z
      .record(z.union([z.string(), z.boolean(), z.number()]))
      .default({}),
    ids: z.array(id).max(2000).optional(),
    previousToken: id.optional(),
    expectedTotal: z.number().int().min(0).optional(),
  })
  .strict();
export const selectionExportSchema = z
  .object({
    token: id.optional(),
    ids: z.array(id).max(2000).optional(),
    resource: z.enum(resources).optional(),
    filters: z
      .record(z.union([z.string(), z.boolean(), z.number()]))
      .optional(),
  })
  .strict();
type Row = Record<string, any>;
type Snapshot = {
  resource: string;
  filters: Record<string, string | number | boolean>;
  rows: Row[];
  versions: Record<string, string>;
};
export const selectionKey = (r: Row) =>
  r.id ?? `${r.materialId}:${r.locationId}`;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
/** Uses the actual list route: identical predicate, pagination, DTO and authorization.
 * Bounded snapshots are actor-owned, short-lived and never execute business jobs. */
async function collect(
  request: Request,
  resource: string,
  filters: Snapshot["filters"],
  ids?: string[],
) {
  const { dispatch } = await import("../router");
  const target =
    resource === "receipts"
      ? "purchase-orders/" + id.parse(filters.orderId) + "/receipts"
      : resource;
  const constrainedIds = ids
    ? typeof filters.ids === "string"
      ? ids.filter((id) => filters.ids.toString().split(",").includes(id))
      : ids
    : undefined;
  if (constrainedIds?.length === 0) return [];
  const rows: Row[] = [];
  let total: number | undefined;
  for (let page = 1; page <= 20; page++) {
    const url = new URL("/api/v1/" + target, request.url);
    for (const [k, v] of Object.entries(filters))
      if (!["page", "pageSize"].includes(k)) url.searchParams.set(k, String(v));
    if (constrainedIds) url.searchParams.set("ids", constrainedIds.join(","));
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "100");
    const response = await dispatch(
      new Request(url, { headers: request.headers }),
      target.split("/"),
    );
    const result = await response.json();
    if (!response.ok)
      throw new ApiError(
        response.status,
        result.error?.code ?? "SELECTION_ERROR",
        result.error?.message ?? "No se pudo consultar el conjunto autorizado.",
      );
    if (!Array.isArray(result.data) || !result.pagination)
      throw new ApiError(
        422,
        "SELECTION_UNSUPPORTED",
        "Esta vista no ofrece selección de registros.",
      );
    if (result.pagination.total > 2000)
      throw new ApiError(
        422,
        "SELECTION_LIMIT",
        "El conjunto supera 2.000 registros. Acotá los filtros antes de seleccionar o exportar.",
      );
    total ??= result.pagination.total;
    if (total !== result.pagination.total)
      throw new ApiError(
        409,
        "SELECTION_CONFLICT",
        "El conjunto cambió durante la consulta. Revisá los resultados.",
      );
    rows.push(...result.data);
    if (Buffer.byteLength(JSON.stringify(rows)) > 8_000_000)
      throw new ApiError(
        422,
        "SELECTION_LIMIT",
        "El conjunto supera el tamaño de revisión. Acotá los filtros; no se recortó la selección.",
      );
    if (rows.length >= (total ?? 0)) break;
  }
  if (
    rows.length !== total ||
    new Set(rows.map(selectionKey)).size !== rows.length
  )
    throw new ApiError(
      409,
      "SELECTION_CONFLICT",
      "El conjunto cambió durante la consulta. Revisá los resultados.",
    );
  return rows;
}
async function snapshot(token: string, actor: Actor): Promise<Snapshot> {
  const record = await db.idempotencyRecord.findUnique({
    where: { key: "selection:" + token },
  });
  if (
    !record ||
    record.scope !== "selection" ||
    record.actorId !== actor.id ||
    Date.now() - record.createdAt.getTime() > 30 * 60 * 1000
  )
    throw new ApiError(
      409,
      "SELECTION_EXPIRED",
      "La selección venció. Revisá y seleccioná de nuevo.",
    );
  return record.response as unknown as Snapshot;
}
async function current(request: Request, saved: Snapshot, ids: string[]) {
  const rows = await collect(request, saved.resource, saved.filters, ids),
    byId = new Map(rows.map((r) => [selectionKey(r), r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row || saved.versions[id] !== hash(row))
      throw new ApiError(
        409,
        "SELECTION_CONFLICT",
        "Un registro seleccionado cambió o ya no está autorizado. Revisá la selección.",
      );
    return row;
  });
}
// Public list DTOs only. Economic fields can never reappear after server redaction.
const fields: [string, string][] = [
  ["code", "Código"],
  ["name", "Nombre"],
  ["taxId", "CUIT"],
  ["client.name", "Cliente"],
  ["work.name", "Obra"],
  ["supplier.name", "Proveedor"],
  ["material.code", "Código material"],
  ["material.name", "Material"],
  ["location.name", "Ubicación"],
  ["source.name", "Origen"],
  ["destination.name", "Destino"],
  ["unit.symbol", "Unidad"],
  ["unit.code", "Unidad base"],
  ["material.unit.symbol", "Unidad del material"],
  ["material.unit.code", "Unidad base del material"],
  ["category.name", "Rubro"],
  ["deliveryNote", "Remito"],
  ["actorName", "Registrado por"],
  ["lines", "Renglones"],
  ["status", "Estado"],
  ["active", "Activo"],
  ["type", "Tipo"],
  ["baseQuantity", "Cantidad base del precio"],
  ["presentation.name", "Presentación"],
  ["referenceDate", "Fecha de referencia"],
  ["referenceDatePrecision", "Precisión de fecha"],
  ["referenceState", "Estado de referencia"],
  ["source", "Fuente"],
  ["quantity", "Cantidad"],
  ["physical", "Físico"],
  ["reserved", "Reservado"],
  ["available", "Disponible"],
  ["minimum", "Mínimo efectivo"],
  ["minimumSource", "Origen mínimo"],
  ["currency", "Moneda"],
  ["taxBasis", "IVA"],
  ["price", "Precio"],
  ["totalAmount", "Importe registrado"],
  ["referenceCost.totalUnitCost", "Costo por unidad"],
  ["total", "Total"],
  ["createdAt", "Fecha de creación"],
  ["issuedAt", "Fecha de emisión"],
  ["action", "Acción"],
  ["entityType", "Entidad"],
  ["entityId", "Registro"],
];
const labels: Record<string, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
  DRAFT: "Borrador",
  ISSUED: "Emitida",
  CANCELLED: "Cancelada",
  PARTIAL: "Parcial",
  RECEIVED: "Recibida",
  TRANSFER: "Transferencia",
  CONSUMPTION: "Consumo",
  RETURN: "Devolución",
  INITIAL: "Stock inicial",
  ADJUSTMENT: "Ajuste",
  RECEIPT: "Recepción",
  UNSPECIFIED: "No especificado",
  INCLUDED: "Incluido",
  EXCLUDED: "No incluido",
  LOCATION: "Propio de ubicación",
  MATERIAL: "Heredado del material",
  NONE: "Sin mínimo",
};
const get = (r: Row, key: string): unknown =>
  key.split(".").reduce((o, k) => o?.[k], r as any);
async function exportRows(
  resource: string,
  filters: Snapshot["filters"],
  rows: Row[],
) {
  if (!rows.length)
    throw new ApiError(
      422,
      "EMPTY_EXPORT",
      "No hay registros en este alcance para exportar.",
    );
  const columns = fields.filter(([key]) =>
    rows.some(
      (r) =>
        get(r, key) !== undefined &&
        (key !== "source" || typeof get(r, key) === "string"),
    ),
  );
  const format = (v: unknown, key: string): unknown =>
    v === true
      ? "Sí"
      : v === false
        ? "No"
        : v === null || v === undefined
          ? "Sin dato"
          : typeof v === "string"
            ? (([
                "status",
                "type",
                "taxBasis",
                "minimumSource",
                "referenceState",
                "referenceDatePrecision",
              ].includes(key)
                ? labels[v]
                : undefined) ??
              (["createdAt", "issuedAt", "effectiveAt"].includes(key) &&
              /^\d{4}-\d{2}-\d{2}T/.test(v)
                ? new Date(v).toLocaleString("es-AR", {
                    timeZone: "America/Argentina/Buenos_Aires",
                  })
                : v))
            : Array.isArray(v)
              ? v
                  .map((l) =>
                    l.materialName
                      ? `${l.materialName}${l.materialCode ? " (" + l.materialCode + ")" : ""}: ${l.quantity ?? ""} ${l.unit ?? ""}`
                      : `${l.orderLineId ?? l.materialId ?? l.id ?? ""}: ${l.quantity ?? ""} ${l.unit ?? ""}`,
                  )
                  .join("; ")
              : typeof v === "object"
                ? JSON.stringify(v)
                : v;
  return xlsxResponse(
    "CEO-" + resource.replace("/", "-"),
    columns.map((c) => c[1]),
    rows.map((r) => columns.map(([k]) => format(get(r, k), k))),
    { vista: resource, filtros: filters, registros: rows.length },
  );
}
export async function handlerSelections(
  request: Request,
  actor: Actor,
  s: string[],
) {
  if (s[0] !== "selections" || request.method !== "POST" || s.length > 2)
    return null;
  if (s[1] === "export") {
    const b = await parse(request, selectionExportSchema);
    if (b.token) {
      const saved = await snapshot(b.token, actor);
      const ids = b.ids ?? saved.rows.map(selectionKey);
      if (ids.some((id) => !saved.versions[id]))
        throw new ApiError(
          422,
          "INVALID_SELECTION",
          "La selección contiene registros ajenos al conjunto revisado.",
        );
      return exportRows(
        saved.resource,
        saved.filters,
        await current(request, saved, [...new Set(ids)]),
      );
    }
    if (!b.resource)
      throw new ApiError(
        422,
        "INVALID_SELECTION",
        "Indicá la vista a exportar.",
      );
    const filters = b.filters ?? {};
    return exportRows(
      b.resource,
      filters,
      await collect(request, b.resource, filters),
    );
  }
  if (s.length !== 1) return null;
  const b = await parse(request, selectionSchema),
    rows = await collect(request, b.resource, b.filters, b.ids),
    byId = new Map(rows.map((r) => [selectionKey(r), r]));
  if (
    !b.ids &&
    b.expectedTotal !== undefined &&
    rows.length !== b.expectedTotal
  )
    throw new ApiError(
      409,
      "SELECTION_CONFLICT",
      "La cantidad de resultados cambió. Actualizá la lista y revisá el alcance antes de seleccionar todos.",
    );
  let selected: Row[] = b.ids
    ? b.ids.map((id) => {
        const row = byId.get(id);
        if (!row)
          throw new ApiError(
            409,
            "SELECTION_CONFLICT",
            "Una fila ya no coincide con el filtro o no está autorizada.",
          );
        return row;
      })
    : rows;
  if (b.previousToken) {
    const saved = await snapshot(b.previousToken, actor);
    if (
      saved.resource !== b.resource ||
      hash(saved.filters) !== hash(b.filters)
    )
      throw new ApiError(
        409,
        "SELECTION_CONFLICT",
        "El contexto de selección cambió.",
      );
    const old = await current(request, saved, saved.rows.map(selectionKey));
    selected = [
      ...new Map(
        [...old, ...selected].map((r) => [selectionKey(r), r]),
      ).values(),
    ];
  }
  const token = randomUUID(),
    saved: Snapshot = {
      resource: b.resource,
      filters: b.filters,
      rows: selected.map((row) => ({
        id: row.id,
        materialId: row.materialId,
        locationId: row.locationId,
        name: row.name,
        code: row.code,
        ...(row.material ? { material: row.material } : {}),
        ...(row.location ? { location: row.location } : {}),
      })),
      versions: Object.fromEntries(
        selected.map((r) => [selectionKey(r), hash(r)]),
      ),
    };
  await db.idempotencyRecord.create({
    data: {
      key: "selection:" + token,
      scope: "selection",
      actorId: actor.id,
      requestHash: hash({ resource: b.resource, filters: b.filters }),
      response: JSON.parse(JSON.stringify(saved)),
    },
  });
  return ok({
    token,
    rows: saved.rows,
    total: rows.length,
    expiresInSeconds: 1800,
  });
}
