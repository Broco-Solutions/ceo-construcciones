import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { type Actor, requireRoles } from "../core/auth";
import { db, schemaCapabilities, type Tx } from "../core/db";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { addPhysical, idempotent } from "./inventory";
import {
  currency,
  decimal,
  nonnegative,
  ok,
  parse,
  taxBasis,
  text,
  canonicalTaxId,
  duplicateClientTaxId,
} from "./shared";

const common = { externalCode: text };
export const schemas = {
  clients: z
    .object({
      ...common,
      name: text,
      taxId: text.optional(),
      contact: text.optional(),
      email: z.string().email().optional(),
      phone: text.optional(),
      address: text.optional(),
      notes: text.optional(),
    })
    .strict(),
  suppliers: z
    .object({
      ...common,
      name: text,
      taxId: text.optional(),
      email: z.string().email().optional(),
      phone: text.optional(),
      address: text.optional(),
    })
    .strict(),
  works: z
    .object({
      ...common,
      name: text,
      clientCode: text.optional(),
      address: text.optional(),
    })
    .strict(),
  materials: z
    .object({
      ...common,
      name: text,
      unitCode: text,
      categoryCode: text.optional(),
      minimum: nonnegative.optional(),
    })
    .strict(),
  prices: z
    .object({
      ...common,
      materialCode: text,
      supplierCode: text.optional(),
      price: nonnegative,
      currency,
      taxBasis,
      effectiveAt: z.string().datetime(),
      presentationId: text.optional(),
      baseQuantity: decimal.default("1"),
    })
    .strict(),
  "purchase-orders": z
    .object({
      ...common,
      supplierCode: text,
      workCode: text.optional(),
      destinationCode: text,
      materialCode: text,
      quantity: decimal,
      unitPrice: nonnegative,
      currency,
      taxBasis,
      notes: text.optional(),
    })
    .strict(),
  "initial-stock": z
    .object({
      ...common,
      materialCode: text,
      locationCode: text,
      quantity: decimal,
      reason: text,
    })
    .strict(),
};
export type ImportKind = keyof typeof schemas;
export const importTemplates: Record<ImportKind, string[]> = {
  clients: [
    "externalCode",
    "name",
    "taxId",
    "contact",
    "email",
    "phone",
    "address",
    "notes",
  ],
  suppliers: ["externalCode", "name", "taxId", "email", "phone", "address"],
  works: ["externalCode", "name", "clientCode", "address"],
  materials: ["externalCode", "name", "unitCode", "categoryCode", "minimum"],
  prices: [
    "externalCode",
    "materialCode",
    "supplierCode",
    "price",
    "currency",
    "taxBasis",
    "effectiveAt",
    "presentationId",
    "baseQuantity",
  ],
  "purchase-orders": [
    "externalCode",
    "supplierCode",
    "workCode",
    "destinationCode",
    "materialCode",
    "quantity",
    "unitPrice",
    "currency",
    "taxBasis",
    "notes",
  ],
  "initial-stock": [
    "externalCode",
    "materialCode",
    "locationCode",
    "quantity",
    "reason",
  ],
};
export const kindSchema = z.enum([
  "clients",
  "suppliers",
  "works",
  "materials",
  "prices",
  "purchase-orders",
  "initial-stock",
]);
export const inputSchema = z
  .object({
    rows: z.array(z.record(z.unknown())).min(1).max(1000).optional(),
    csv: z.string().max(1_500_000).optional(),
    confirmationHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    reviewPrices: z.boolean().optional(),
    baselineHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .refine(
    (b) => Boolean(b.rows) !== (b.csv !== undefined),
    "Indique rows o csv",
  );
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type ImportIssue = { row: number; message: string };
type Row = Record<string, string>;

async function priceBaseline(client: Tx | typeof db, rows: Row[]) {
  const materials = await client.material.findMany({
    where: { code: { in: [...new Set(rows.map((r) => r.materialCode))] } },
    select: { id: true, code: true, unitId: true, active: true },
  });
  const suppliers = await client.supplier.findMany({
    where: {
      code: {
        in: [
          ...new Set(
            rows.flatMap((r) => (r.supplierCode ? [r.supplierCode] : [])),
          ),
        ],
      },
    },
    select: { id: true, code: true, active: true },
  });
  const prices = await client.materialPrice.findMany({
    where: { materialId: { in: materials.map((m) => m.id) } },
    select: {
      id: true,
      materialId: true,
      supplierId: true,
      presentationId: true,
      price: true,
      baseQuantity: true,
      currency: true,
      taxBasis: true,
      effectiveAt: true,
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const baseline = rows.map((r) => {
    const material = materials.find((m) => m.code === r.materialCode),
      supplier = suppliers.find((s) => s.code === r.supplierCode);
    const previous = prices.find(
      (p) =>
        p.materialId === material?.id &&
        p.supplierId === (supplier?.id ?? null) &&
        p.presentationId === (r.presentationId ?? null) &&
        p.currency === r.currency &&
        p.taxBasis === r.taxBasis &&
        p.effectiveAt <= new Date(),
    );
    return {
      material: material ?? null,
      supplier: supplier ?? null,
      previous: previous
        ? {
            ...previous,
            price: previous.price.toFixed(),
            baseQuantity: previous.baseQuantity.toFixed(),
            effectiveAt: previous.effectiveAt.toISOString(),
          }
        : null,
    };
  });
  return { baseline, hash: digest(baseline) };
}

// RFC 4180 subset: comma delimiter, quoted multiline fields and doubled quotes.
export function parseCsv(source: string): Record<string, string>[] {
  const input = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let cells: string[] = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === '"') {
      if (cell || closed)
        throw new ApiError(422, "INVALID_CSV", "Comillas CSV inválidas");
      quoted = true;
      continue;
    }
    if (c === ",") {
      cells.push(cell);
      cell = "";
      closed = false;
      continue;
    }
    if (c === "\r" || c === "\n") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      cells.push(cell);
      if (cells.some((x) => x !== "")) records.push(cells);
      cells = [];
      cell = "";
      closed = false;
      continue;
    }
    if (closed)
      throw new ApiError(
        422,
        "INVALID_CSV",
        "Texto luego del cierre de comillas",
      );
    cell += c;
  }
  if (quoted) throw new ApiError(422, "INVALID_CSV", "Campo CSV sin cierre");
  cells.push(cell);
  if (cells.some((x) => x !== "")) records.push(cells);
  if (records.length < 2 || records.length > 1001)
    throw new ApiError(
      422,
      "INVALID_CSV",
      "Se requieren encabezados y entre 1 y 1000 filas",
    );
  const headers = records.shift()!.map((x) => x.trim());
  if (headers.some((x) => !x) || new Set(headers).size !== headers.length)
    throw new ApiError(422, "INVALID_CSV", "Encabezados vacíos o duplicados");
  return records.map((values, index) => {
    if (values.length !== headers.length)
      throw new ApiError(
        422,
        "INVALID_CSV",
        `Fila ${index + 2}: cantidad de columnas inválida`,
      );
    return Object.fromEntries(
      headers.flatMap((name, i) =>
        values[i] === "" ? [] : [[name, values[i]]],
      ),
    );
  });
}
export function normalizeImport(
  kind: ImportKind,
  raw: Record<string, unknown>[],
) {
  const errors: ImportIssue[] = [];
  const rows: Row[] = [];
  const sourceRows: number[] = [];
  const seen = new Set<string>();
  const stockPairs = new Set<string>();
  const pricePairs = new Set<string>();
  const taxIds = new Set<string>();
  for (const [i, value] of raw.entries()) {
    const result = schemas[kind].safeParse(value);
    if (!result.success) {
      errors.push({
        row: i + 1,
        message: result.error.issues
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("; "),
      });
      continue;
    }
    const row = result.data as Row;
    if (kind === "clients" && row.taxId) row.taxId = canonicalTaxId(row.taxId);
    const unique =
      kind === "purchase-orders"
        ? `${row.externalCode}:${row.materialCode}`
        : row.externalCode;
    if (seen.has(unique))
      errors.push({
        row: i + 1,
        message: "Identificador duplicado dentro del archivo",
      });
    seen.add(unique);
    if (kind === "prices") {
      const pair = JSON.stringify([
        row.materialCode,
        row.supplierCode ?? null,
        row.presentationId ?? null,
        row.currency,
        row.taxBasis,
        row.effectiveAt,
      ]);
      if (pricePairs.has(pair))
        errors.push({
          row: i + 1,
          message:
            "Referencia de precio duplicada para el mismo material, proveedor, presentación y vigencia",
        });
      pricePairs.add(pair);
    }
    if (kind === "initial-stock") {
      const pair = JSON.stringify([row.materialCode, row.locationCode]);
      if (stockPairs.has(pair))
        errors.push({
          row: i + 1,
          message:
            "El mismo material y ubicación sólo admiten una apertura de inventario",
        });
      stockPairs.add(pair);
    }
    if ((kind === "suppliers" || kind === "clients") && row.taxId) {
      if (taxIds.has(row.taxId))
        errors.push({
          row: i + 1,
          message: "Identificación fiscal duplicada dentro del archivo",
        });
      taxIds.add(row.taxId);
    }
    rows.push(row);
    sourceRows.push(i + 1);
  }
  if (kind === "purchase-orders") {
    const groups = new Map<string, string>();
    rows.forEach((r, i) => {
      const header = digest([
        r.supplierCode,
        r.workCode,
        r.destinationCode,
        r.currency,
        r.taxBasis,
        r.notes,
      ]);
      if (groups.has(r.externalCode) && groups.get(r.externalCode) !== header)
        errors.push({
          row: sourceRows[i],
          message: "Cabecera de OC inconsistente entre renglones",
        });
      groups.set(r.externalCode, header);
    });
  }
  return { rows, errors, sourceRows };
}
async function references(
  tx: Tx | typeof db,
  kind: ImportKind,
  rows: Row[],
  sourceRows?: number[],
) {
  const errors: ImportIssue[] = [];
  for (const [i, r] of rows.entries()) {
    const fail = (message: string) =>
      errors.push({ row: sourceRows?.[i] ?? i + 1, message });
    if (
      await tx.idempotencyRecord.findUnique({
        where: { key: `import:${kind}:${r.externalCode}` },
      })
    )
      fail("Identificador externo ya importado");
    if (kind === "suppliers" || kind === "clients") {
      if (
        kind === "clients" &&
        r.taxId &&
        (await duplicateClientTaxId(tx, r.taxId))
      )
        fail("Cliente con CUIT ya existente");
      const existing =
        kind === "suppliers"
          ? await tx.supplier.findFirst({
              where: {
                OR: [
                  { code: r.externalCode },
                  ...(r.taxId ? [{ taxId: r.taxId }] : []),
                ],
              },
            })
          : await tx.client.findFirst({
              where: {
                OR: [
                  { code: r.externalCode },
                  ...(r.taxId ? [{ taxId: r.taxId }] : []),
                ],
              },
            });
      if (existing)
        fail(
          kind === "clients"
            ? "Cliente ya existente"
            : "Proveedor ya existente",
        );
    }
    if (
      kind === "works" &&
      (await tx.work.findUnique({ where: { code: r.externalCode } }))
    )
      fail("Obra ya existente");
    if (
      kind === "works" &&
      r.clientCode &&
      !(await tx.client.findFirst({
        where: { code: r.clientCode, active: true },
      }))
    )
      fail(
        "Cliente desconocido o inactivo: revisá el mapeo exacto de la obra histórica.",
      );
    if (kind === "materials") {
      if (await tx.material.findUnique({ where: { code: r.externalCode } }))
        fail("Material ya existente");
      if (!(await tx.unit.findUnique({ where: { code: r.unitCode } })))
        fail("Unidad desconocida");
      if (
        r.categoryCode &&
        !(await tx.category.findUnique({ where: { code: r.categoryCode } }))
      )
        fail("Rubro desconocido");
    }
    if (
      r.materialCode &&
      !(await tx.material.findFirst({
        where: { code: r.materialCode, active: true },
      }))
    )
      fail("Material desconocido o inactivo");
    if (
      r.supplierCode &&
      !(await tx.supplier.findFirst({
        where: { code: r.supplierCode, active: true },
      }))
    )
      fail("Proveedor desconocido o inactivo");
    if (kind === "prices") {
      if (r.presentationId) {
        const presentation = await tx.presentation.findUnique({
          where: { id: r.presentationId },
          include: { material: true, supplier: true },
        });
        if (
          !presentation ||
          !presentation.active ||
          presentation.material.code !== r.materialCode ||
          (presentation.supplier &&
            presentation.supplier.code !== r.supplierCode) ||
          !presentation.baseQuantity.eq(r.baseQuantity)
        )
          fail("Presentación o equivalencia incompatible");
      } else if (!new Prisma.Decimal(r.baseQuantity).eq(1))
        fail("Sin presentación, baseQuantity debe ser 1");
    }
    if (kind === "initial-stock") {
      const location = await tx.location.findFirst({
        where: { code: r.locationCode, active: true },
      });
      const material = await tx.material.findFirst({
        where: { code: r.materialCode, active: true },
      });
      if (!location) fail("Ubicación desconocida o inactiva");
      if (location && material) {
        const movement = await tx.stockMovement.findFirst({
          where: {
            materialId: material.id,
            OR: [{ sourceId: location.id }, { destinationId: location.id }],
          },
          select: { id: true },
        });
        const balance = await tx.stockBalance.findUnique({
          where: {
            materialId_locationId: {
              materialId: material.id,
              locationId: location.id,
            },
          },
        });
        if (movement || balance?.physical.gt(0) || balance?.reserved.gt(0))
          fail(
            "El material ya tiene movimientos o existencias en esta ubicación; registre un ajuste con motivo",
          );
      }
    }
    if (kind === "purchase-orders") {
      const destination = await tx.location.findFirst({
        where: { code: r.destinationCode, active: true },
      });
      const work = r.workCode
        ? await tx.work.findUnique({ where: { code: r.workCode } })
        : null;
      if (!destination) fail("Ubicación destino desconocida");
      if (r.workCode && !work) fail("Obra desconocida");
      if (destination?.workId && destination.workId !== work?.id)
        fail("Destino incompatible con la obra");
    }
  }
  return errors;
}
export async function handlerImports(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  if (s[0] !== "imports") return null;
  if (s[1] === "prices") requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
  else requireRoles(actor, "GERENCIA");
  if (s.length !== 3) return null;
  const kind = kindSchema.parse(s[1]),
    action = s[2];
  if (kind === "clients" && !(await schemaCapabilities()).clients)
    throw new ApiError(
      503,
      "FEATURE_NOT_ENABLED",
      "Los clientes aún no están habilitados en este entorno.",
    );
  if (action === "template" && request.method === "GET")
    return new Response(importTemplates[kind].join(",") + "\r\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${kind}.csv"`,
      },
    });
  if (request.method !== "POST" || !["preview", "commit"].includes(action))
    return null;
  const input = await parse(request, inputSchema);
  const raw = input.rows ?? parseCsv(input.csv!);
  const normalized = normalizeImport(kind, raw);
  if (
    kind === "prices" &&
    normalized.rows.some((r) => r.price === "0") &&
    !(await schemaCapabilities()).coverage
  )
    throw new ApiError(
      503,
      "FEATURE_NOT_ENABLED",
      "El precio cero explícito requiere la migración de aplicación.",
    );
  const review = kind === "prices" && input.reviewPrices === true;
  const previewBaseline =
    review && action === "preview"
      ? await priceBaseline(db, normalized.rows)
      : null;
  const baselineHash = previewBaseline?.hash ?? input.baselineHash;
  const hash = digest({
    kind,
    rows: normalized.rows,
    ...(review ? { baselineHash } : {}),
  });
  if (action === "preview") {
    const errors = [
      ...normalized.errors,
      ...(await references(db, kind, normalized.rows, normalized.sourceRows)),
    ];
    return ok({
      valid: errors.length === 0,
      rowCount: raw.length,
      errors,
      confirmationHash: hash,
      ...(previewBaseline
        ? {
            baselineHash: previewBaseline.hash,
            normalizedRows: normalized.rows,
            differences: normalized.rows.map((r, i) => ({
              row: normalized.sourceRows[i],
              materialCode: r.materialCode,
              previous: previewBaseline.baseline[i].previous,
              newPrice: r.price,
              baseQuantity: r.baseQuantity,
              currency: r.currency,
              taxBasis: r.taxBasis,
              effectiveAt: r.effectiveAt,
            })),
          }
        : {}),
    });
  }
  if (!input.confirmationHash || input.confirmationHash !== hash)
    throw new ApiError(
      409,
      "PREVIEW_REQUIRED",
      "La confirmación debe coincidir con el hash de previsualización",
    );
  if (normalized.errors.length)
    throw new ApiError(
      422,
      "IMPORT_INVALID",
      "Archivo inválido",
      normalized.errors,
    );
  const result = await idempotent(
    actor,
    `import:${kind}`,
    request.headers.get("idempotency-key") || "",
    { hash },
    async (tx) => {
      const rows = normalized.rows;
      if (
        review &&
        (!baselineHash || (await priceBaseline(tx, rows)).hash !== baselineHash)
      )
        throw new ApiError(
          409,
          "PRICE_PREVIEW_STALE",
          "Los precios o sus referencias cambiaron. Revisá nuevamente las diferencias antes de confirmar.",
        );
      const errors = await references(tx, kind, rows);
      if (errors.length)
        throw new ApiError(
          422,
          "IMPORT_INVALID",
          "No se importó ninguna fila",
          errors,
        );
      const created: string[] = [];
      const grouped = new Map<string, Row[]>();
      for (const r of rows)
        grouped.set(r.externalCode, [
          ...(grouped.get(r.externalCode) ?? []),
          r,
        ]);
      for (const [code, group] of grouped) {
        const r = group[0];
        let entityId = "";
        if (kind === "clients") {
          entityId = (
            await tx.client.create({
              data: {
                code,
                name: r.name,
                taxId: r.taxId,
                contact: r.contact,
                email: r.email,
                phone: r.phone,
                address: r.address,
                notes: r.notes,
              },
            })
          ).id;
        } else if (kind === "suppliers") {
          entityId = (
            await tx.supplier.create({
              data: {
                code,
                name: r.name,
                taxId: r.taxId,
                email: r.email,
                phone: r.phone,
                address: r.address,
              },
            })
          ).id;
        } else if (kind === "works") {
          entityId = (
            await tx.work.create({
              data: {
                code,
                name: r.name,
                ...(r.clientCode
                  ? {
                      clientId: (
                        await tx.client.findUniqueOrThrow({
                          where: { code: r.clientCode },
                        })
                      ).id,
                    }
                  : {}),
                ...(r.address ? { address: r.address } : {}),
                location: {
                  create: { code: `OBRA-${code}`, name: r.name, kind: "WORK" },
                },
              },
            })
          ).id;
        } else if (kind === "materials") {
          const unit = await tx.unit.findUniqueOrThrow({
            where: { code: r.unitCode },
          });
          const category = r.categoryCode
            ? await tx.category.findUniqueOrThrow({
                where: { code: r.categoryCode },
              })
            : null;
          entityId = (
            await tx.material.create({
              data: {
                code,
                name: r.name,
                unitId: unit.id,
                categoryId: category?.id,
                minimum: r.minimum ?? "0",
              },
            })
          ).id;
        } else if (kind === "prices") {
          const material = await tx.material.findUniqueOrThrow({
            where: { code: r.materialCode },
          });
          const supplier = r.supplierCode
            ? await tx.supplier.findUniqueOrThrow({
                where: { code: r.supplierCode },
              })
            : null;
          entityId = (
            await tx.materialPrice.create({
              data: {
                materialId: material.id,
                supplierId: supplier?.id,
                presentationId: r.presentationId,
                price: r.price,
                baseQuantity: r.baseQuantity,
                currency: r.currency,
                taxBasis: r.taxBasis as "UNSPECIFIED" | "INCLUDED" | "EXCLUDED",
                effectiveAt: new Date(r.effectiveAt),
                source: `import:${code}`,
              },
            })
          ).id;
        } else if (kind === "initial-stock") {
          const material = await tx.material.findUniqueOrThrow({
            where: { code: r.materialCode },
          });
          const location = await tx.location.findUniqueOrThrow({
            where: { code: r.locationCode },
          });
          await addPhysical(
            tx,
            material.id,
            location.id,
            new Prisma.Decimal(r.quantity),
          );
          entityId = (
            await tx.stockMovement.create({
              data: {
                type: "INITIAL",
                materialId: material.id,
                destinationId: location.id,
                workId: location.workId,
                quantity: r.quantity,
                reason: r.reason,
                createdById: actor.id,
                idempotencyKey: `import:initial-stock:${digest(code)}`,
              },
            })
          ).id;
        } else if (kind === "purchase-orders") {
          const supplier = await tx.supplier.findUniqueOrThrow({
              where: { code: r.supplierCode },
            }),
            destination = await tx.location.findUniqueOrThrow({
              where: { code: r.destinationCode },
            }),
            work = r.workCode
              ? await tx.work.findUniqueOrThrow({ where: { code: r.workCode } })
              : null;
          const lines = [];
          for (const line of group) {
            const material = await tx.material.findUniqueOrThrow({
              where: { code: line.materialCode },
            });
            lines.push({
              materialId: material.id,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              baseQuantity: "1",
            });
          }
          entityId = (
            await tx.purchaseOrder.create({
              data: {
                supplierId: supplier.id,
                destinationId: destination.id,
                workId: work?.id,
                status: "ISSUED",
                currency: r.currency,
                taxBasis: r.taxBasis as "UNSPECIFIED" | "INCLUDED" | "EXCLUDED",
                createdById: actor.id,
                notes: `CEO Obras ${code}${r.notes ? `: ${r.notes}` : ""}`,
                lines: { create: lines },
              },
            })
          ).id;
        }
        await tx.idempotencyRecord.create({
          data: {
            key: `import:${kind}:${code}`,
            scope: `import-row:${kind}`,
            actorId: actor.id,
            requestHash: digest(group),
            response: { entityId },
          },
        });
        created.push(entityId);
      }
      await audit(tx, actor, "IMPORT", kind, hash, {
        rows: rows.length,
        entities: created.length,
        hash,
      });
      return {
        importedRows: rows.length,
        createdIds: created,
        confirmationHash: hash,
      };
    },
  );
  return ok(result, 201);
}
