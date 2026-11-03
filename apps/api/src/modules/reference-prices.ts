import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { type Actor, requireRoles } from "../core/auth";
import { db, transaction } from "../core/db";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { id, ok, parse } from "./shared";
import { parseCsv } from "./imports";

export const priceFileSchema = z
  .object({ name: z.string().max(200), base64: z.string().max(1400000) })
  .strict();
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
export function inspectXlsx(bytes: Buffer) {
  if (bytes.length > 1_000_000)
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "El archivo supera 1 MB. Dividí la lista.",
    );
  if (bytes.readUInt32LE(0) !== 0x04034b50)
    throw new ApiError(422, "INVALID_XLSX", "El archivo no es un XLSX válido.");
  let expanded = 0,
    entries = 0;
  for (let offset = 0; offset < bytes.length - 46; offset++)
    if (bytes.readUInt32LE(offset) === 0x02014b50) {
      expanded += bytes.readUInt32LE(offset + 24);
      entries++;
      const length = bytes.readUInt16LE(offset + 28),
        name = bytes.subarray(offset + 46, offset + 46 + length).toString();
      if (/vbaProject|externalLinks/i.test(name))
        throw new ApiError(
          422,
          "ACTIVE_CONTENT",
          "No se admiten macros ni enlaces externos.",
        );
    }
  if (!entries || entries > 3000 || expanded > 20_000_000)
    throw new ApiError(
      413,
      "FILE_EXPANDED_LIMIT",
      "El contenido expandido del archivo excede el límite de 20 MB.",
    );
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
    const b = await parse(request, priceFileSchema),
      bytes = Buffer.from(b.base64, "base64");
    if (bytes.length > 1_000_000)
      throw new ApiError(413, "FILE_TOO_LARGE", "La lista admite hasta 1 MB.");
    if (/\.csv$/i.test(b.name)) {
      const rows = parseCsv(bytes.toString("utf8")),
        columns = Object.keys(rows[0]);
      return ok({
        sheets: [
          {
            name: "CSV",
            columns,
            rows: rows.map((r) => columns.map((c) => r[c] ?? "")),
          },
        ],
      });
    }
    if (!/\.xlsx$/i.test(b.name))
      throw new ApiError(
        422,
        "UNSUPPORTED_FILE",
        "Listas de precios: se admiten .xlsx y .csv. El XLS histórico requiere su adaptador de migración.",
      );
    if (bytes.length < 4)
      throw new ApiError(422, "INVALID_XLSX", "Archivo vacío o inválido.");
    inspectXlsx(bytes);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      bytes as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    const sheets = book.worksheets.map((sheet) => {
      if (sheet.rowCount > 1001 || sheet.columnCount > 100)
        throw new ApiError(
          422,
          "ROW_LIMIT",
          "Cada hoja admite hasta 1000 filas de datos y 100 columnas.",
        );
      const cellText = (value: ExcelJS.CellValue): string => {
        if (value === null || value === undefined) return "";
        if (typeof value === "object") {
          if (value instanceof Date) return value.toISOString();
          if ("formula" in value || "sharedFormula" in value)
            return "=FÓRMULA: revisar valor";
          if ("hyperlink" in value)
            throw new ApiError(
              422,
              "ACTIVE_CONTENT",
              "La lista contiene enlaces activos. Quitalos antes de importar.",
            );
          if ("richText" in value)
            return value.richText.map((t) => t.text).join("");
          return String("text" in value ? value.text : "");
        }
        return String(value);
      };
      const columns = Array.from({ length: sheet.columnCount }, (_, i) =>
        cellText(sheet.getRow(1).getCell(i + 1).value),
      );
      const rows = Array.from(
        { length: Math.max(0, sheet.rowCount - 1) },
        (_, n) =>
          columns.map((_, i) =>
            cellText(sheet.getRow(n + 2).getCell(i + 1).value),
          ),
      );
      return { name: sheet.name, columns, rows };
    });
    return ok({ sheets });
  }
  if (resource === "price-mapping" && request.method === "POST") {
    const b = await parse(request, priceMappingSchema),
      supplier = await db.supplier.findFirst({
        where: { id: b.supplierId, active: true },
      });
    if (!supplier)
      throw new ApiError(
        422,
        "INVALID_SUPPLIER",
        "Seleccioná un proveedor activo.",
      );
    const materials = await db.material.findMany({
      include: { unit: true, presentations: { where: { active: true } } },
    });
    const errors: { row: number; message: string }[] = [];
    const rows = b.rows.map((r, i) => {
      const cell = (field: string) =>
        b.columns[field] === undefined
          ? ""
          : (r[b.columns[field]]?.trim() ?? "");
      const material = materials.find(
        (m) => m.code === cell("materialCode") || m.id === cell("materialCode"),
      );
      if (!material)
        errors.push({
          row: i + 1,
          message:
            "Material desconocido: resolvé su código exacto contra el catálogo.",
        });
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
        errors.push({
          row: i + 1,
          message:
            "Presentación desconocida o no equivalente para este material y proveedor. Usá su identificador exacto.",
        });
      const unit = cell("unit");
      if (
        !unit ||
        !material ||
        ![material.unit.code, material.unit.symbol, presentation?.name]
          .filter(Boolean)
          .includes(unit)
      )
        errors.push({
          row: i + 1,
          message:
            "Unidad no equivalente. Usá el código o símbolo exacto del catálogo o el nombre de la presentación seleccionada.",
        });
      const date = cell("effectiveAt") || b.effectiveAt;
      const row = {
        materialCode: material?.code ?? cell("materialCode"),
        supplierCode: supplier.code,
        price: localPrice(cell("price")),
        currency: cell("currency") || b.currency,
        taxBasis: cell("taxBasis") || b.taxBasis,
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
