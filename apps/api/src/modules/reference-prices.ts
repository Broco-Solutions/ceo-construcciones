import { retiredPriceIds } from "./price-provenance";
import { undatedPriceIds } from './source-price-basis';
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { type Actor, requireRoles } from "../core/auth";
import { db, transaction } from "../core/db";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { id, ok } from "./shared";
import { officialImportColumns, parseImportRequest, readCsv, spanishTaxBasis } from "./imports";
import { decodeSpreadsheet, readXlsx, spreadsheetFileSchema } from "./import-spreadsheet";
export { inspectXlsx } from "./import-spreadsheet";

export const priceFileSchema = spreadsheetFileSchema;
export const priceMappingSchema = z
  .object({
    supplierId: id,
    source: z.string().min(1).max(100),
    columns: z.record(z.number().int().min(0).max(100)),
    rows: z
      .array(z.array(z.string().max(2000)).max(100))
      .min(1)
      .max(1000),
    currency: z.enum(["ARS", "USD"]),
    taxBasis: z.enum(["INCLUDED", "EXCLUDED", "UNSPECIFIED"]),
    effectiveAt: z.string().datetime(),
    rowNumbers: z.array(z.number().int().positive()).max(1000).optional(),
    official: z.boolean().optional(),
  })
  .strict();
export function localPrice(value: string) {
  const trimmed = value.trim();
  if (/^\d{1,3}(\.\d{3})*(,\d{1,8})$/.test(trimmed))
    return trimmed.replaceAll(".", "").replace(",", ".");
  if (/^\d+(,\d{1,8})$/.test(trimmed)) return trimmed.replace(",", ".");
  if (/^\d+(\.\d{1,8})?$/.test(trimmed)) return trimmed;
  return value; // The canonical decimal validator reports the original invalid value.
}
export function monthArgentina(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
  }).format(date);
}
export async function handlerReferencePrices(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  const [resource, key] = s;
  if (
    ![
      "price-comparison",
      "price-review",
      "price-files",
      "price-mapping",
    ].includes(resource)
  )
    return null;
  requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
  if (resource === "price-files" && request.method === "POST") {
    const b = await parseImportRequest(request, priceFileSchema);
    if (!/\.(csv|xlsx)$/i.test(b.name))
      throw new ApiError(422, "UNSUPPORTED_FILE", "Las listas de precios admiten archivos .xlsx y .csv.");
    const bytes = decodeSpreadsheet(b.base64);
    const official = officialImportColumns.prices.map(([label]) => label);
    const sheets = /\.csv$/i.test(b.name)
      ? [{ name: "CSV", ...readCsv(bytes.toString("utf8"), official), formulaRows: [] }]
      : await readXlsx(bytes);
    for (const sheet of sheets) {
      const headers = sheet.columns.filter((column) => column.trim() !== "");
      if (sheet.formulaRows.includes(0))
        throw new ApiError(422, "INVALID_HEADERS", "Los encabezados no pueden contener fórmulas.");
      if (new Set(headers).size !== headers.length ||
          (official.every((label) => headers.includes(label)) && sheet.columns.length !== official.length))
        throw new ApiError(422, "INVALID_HEADERS", "Revisá los encabezados duplicados o las columnas que no corresponden a la plantilla.");
    }
    const data = sheets.find((sheet) => sheet.name === "Datos" &&
        official.every((label) => sheet.columns.includes(label)));
    if (data ? !data.rows.length : !sheets.some((sheet) => sheet.rows.length))
      throw new ApiError(422, "EMPTY_FILE", "La hoja de datos está vacía. Agregá al menos una fila.");
    return ok({ sheets });
  }
  if (resource === "price-mapping" && request.method === "POST") {
    const b = await parseImportRequest(request, priceMappingSchema),
      supplier = await db.supplier.findFirst({
        where: { id: b.supplierId, active: true },
      });
    if (!supplier)
      throw new ApiError(
        422,
        "INVALID_SUPPLIER",
        "Seleccioná un proveedor activo.",
      );
    if (b.rowNumbers && (b.rowNumbers.length !== b.rows.length ||
        b.rowNumbers.some((row, i) => i > 0 && row <= b.rowNumbers![i - 1])))
      throw new ApiError(422, "INVALID_ROWS", "Las filas no coinciden con las del archivo.");
    const materials = await db.material.findMany({
      include: { unit: true, presentations: { where: { active: true } } },
    });
    const errors: { row: number; message: string }[] = [];
    const rows = b.rows.map((r, i) => {
      const number = b.rowNumbers?.[i] ?? i + 1;
      const fail = (message: string) => errors.push({ row: number, message });
      if (r.includes("=FÓRMULA: revisar valor"))
        fail("Reemplazá la fórmula por un valor en la celda.");
      const cell = (field: string) =>
        b.columns[field] === undefined
          ? ""
          : (r[b.columns[field]]?.trim() ?? "");
      const material = materials.find(
        (m) => m.code === cell("materialCode") || (!b.official && m.id === cell("materialCode")),
      );
      if (!cell("materialCode")) fail("Falta indicar el código del material.");
      else if (!material) fail("Material desconocido: indicá el código exacto del catálogo.");
      const presentationCode = cell("presentationId");
      const presentations = presentationCode
        ? material?.presentations.filter(
            (p) =>
              (p.id === presentationCode || p.name === presentationCode) &&
              (!p.supplierId || p.supplierId === supplier.id),
          )
        : [];
      const presentation =
        presentations?.length === 1 ? presentations[0] : undefined;
      if (presentationCode && !presentation)
        fail("Presentación desconocida o no equivalente para este material y proveedor. Usá su identificador exacto.");
      const unit = cell("unit");
      if (!unit) fail("Falta indicar la unidad de medida.");
      else if (material && ![material.unit.code, material.unit.symbol, ...(!b.official ? [presentation?.name] : [])].includes(unit))
        fail("Unidad no equivalente. Usá el código o símbolo exacto del catálogo.");
      const date = cell("effectiveAt") || b.effectiveAt;
      const tax = cell("taxBasis");
      const price = cell("price");
      if (price === "") fail("Falta indicar el precio.");
      const row = {
        materialCode: material?.code ?? cell("materialCode"),
        supplierCode: supplier.code,
        price: localPrice(price),
        currency: cell("currency") || b.currency,
        taxBasis: (Object.hasOwn(spanishTaxBasis, tax) ? spanishTaxBasis[tax] : tax) || b.taxBasis,
        effectiveAt: date,
        baseQuantity: presentation?.baseQuantity.toFixed() ?? "1",
        ...(presentation ? { presentationId: presentation.id } : {}),
      };
      return {
        externalCode: createHash("sha256")
          .update(JSON.stringify({ source: b.source, row, index: i }))
          .digest("hex"),
        ...row,
      };
    });
    return ok({ rows, errors });
  }
  if (resource === "price-review" && key && request.method === "POST") {
    return ok(
      await transaction(async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id: key, active: true },
        });
        if (!supplier)
          throw new ApiError(404, "NOT_FOUND", "Proveedor no disponible.");
        const reviewedAt = new Date();
        await audit(tx, actor, "REVIEW_PRICES", "Supplier", key, {
          reviewedAt: reviewedAt.toISOString(),
        });
        return { reviewedAt };
      }),
    );
  }
  if (resource === "price-comparison" && request.method === "GET") {
    const q = new URL(request.url).searchParams,
      supplierIds = z
        .array(id)
        .min(1)
        .max(3)
        .parse((q.get("supplierIds") ?? "").split(",").filter(Boolean)),
      materialId = id.parse(q.get("materialId"));
    if (new Set(supplierIds).size !== supplierIds.length)
      throw new ApiError(
        422,
        "DUPLICATE_SUPPLIER",
        "Elegí proveedores distintos.",
      );
    const material = await db.material.findUnique({
      where: { id: materialId },
      include: { unit: true },
    });
    if (!material)
      throw new ApiError(404, "NOT_FOUND", "Material no encontrado.");
    const suppliers = await db.supplier.findMany({
      where: { id: { in: supplierIds }, active: true },
      select: { id: true, name: true },
    });
    const prices = await db.materialPrice.findMany({
      where: {
        id: { notIn: [...await retiredPriceIds(), ...await undatedPriceIds(db)] },
        materialId,
        supplierId: { in: suppliers.map((s) => s.id) },
        effectiveAt: { lte: new Date() },
      },
      include: { presentation: true },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    const review = await db.auditLog.findMany({
      where: {
        entityType: "Supplier",
        entityId: { in: supplierIds },
        action: "REVIEW_PRICES",
      },
      orderBy: { createdAt: "desc" },
    });
    type Candidate = {
      supplier: (typeof suppliers)[number];
      price: (typeof prices)[number] | null;
      normalizedPrice: string | null;
      lowest: boolean;
      reviewDue: boolean;
      lastReviewedAt: Date | null;
    };
    const candidates = suppliers.flatMap<Candidate>((supplier) => {
      const latest = new Map<string, (typeof prices)[number]>();
      for (const p of prices.filter((p) => p.supplierId === supplier.id)) {
        const key = `${p.presentationId ?? "base"}:${p.currency}:${p.taxBasis}`;
        if (!latest.has(key)) latest.set(key, p);
      }
      if (!latest.size)
        return [
          {
            supplier,
            price: null,
            normalizedPrice: null,
            lowest: false,
            reviewDue: true,
            lastReviewedAt: null,
          },
        ];
      return [...latest.values()].map((price) => {
        const reviewed = review.find(
          (r) => r.entityId === supplier.id,
        )?.createdAt;
        const last =
          reviewed && reviewed > price.createdAt ? reviewed : price.createdAt;
        const equivalent =
          price.baseQuantity.gt(0) &&
          (price.presentation
            ? price.presentation.active &&
              price.presentation.materialId === materialId &&
              price.presentation.baseQuantity.eq(price.baseQuantity) &&
              (!price.presentation.supplierId ||
                price.presentation.supplierId === supplier.id)
            : price.baseQuantity.eq(1));
        const normalized = price.price
          .div(price.baseQuantity)
          .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
        return {
          supplier,
          price,
          normalizedPrice:
            equivalent && !(price.price.gt(0) && normalized.isZero())
              ? normalized.toFixed()
              : null,
          lowest: false,
          reviewDue: monthArgentina(last) !== monthArgentina(new Date()),
          lastReviewedAt: last,
        };
      });
    });
    const groups = new Map<string, typeof candidates>();
    for (const c of candidates) {
      if (!c.price || !c.normalizedPrice || c.price.taxBasis === "UNSPECIFIED")
        continue;
      const key = `${c.price.currency}:${c.price.taxBasis}`;
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    for (const group of groups.values()) {
      const min = group.reduce((a, c) => {
        const exact = c.price!.price.div(c.price!.baseQuantity);
        return exact.lt(a) ? exact : a;
      }, group[0].price!.price.div(group[0].price!.baseQuantity));
      for (const c of group)
        c.lowest = c.price!.price.div(c.price!.baseQuantity).eq(min);
    }
    return ok({
      material: {
        id: material.id,
        name: material.name,
        unit: material.unit.symbol ?? material.unit.name,
      },
      candidates,
    });
  }
  return null;
}
