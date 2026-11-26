import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { type Actor, requireRoles } from "../core/auth";
import { db, schemaCapabilities, type Tx } from "../core/db";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { addPhysical, idempotent } from "./inventory";
import { reserveAutoCode } from "./automatic-codes";
import { localPrice } from "./reference-prices";
import {
  decodeSpreadsheet, readXlsx, spreadsheetFileSchema, spreadsheetTemplate,
  type SpreadsheetSheet,
} from "./import-spreadsheet";
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
// The technical CSV contract stays independent from the official Spanish workbook.
type OfficialColumn = [label: string, field: string, required?: boolean];
export const officialImportColumns: Record<ImportKind, readonly OfficialColumn[]> = {
  clients: [
    ["Código", "externalCode", true], ["Nombre o razón social", "name", true],
    ["CUIT", "taxId"], ["Contacto", "contact"], ["Teléfono", "phone"],
    ["Email", "email"], ["Dirección", "address"], ["Observaciones", "notes"],
  ],
  works: [
    ["Código", "externalCode", true], ["Nombre de obra", "name", true],
    ["Código de cliente", "clientCode"], ["Dirección", "address"],
  ],
  suppliers: [
    ["Código", "externalCode", true], ["Nombre o razón social", "name", true],
    ["CUIT", "taxId"], ["Email", "email"], ["Teléfono", "phone"], ["Dirección", "address"],
  ],
  materials: [
    ["Código", "externalCode"], ["Material", "name", true], ["Unidad", "unitCode", true],
    ["Rubro", "categoryCode"], ["Stock mínimo", "minimum"],
  ],
  prices: [
    ["Código material", "materialCode", true], ["Unidad", "unit", true],
    ["Presentación", "presentationId"], ["Precio", "price", true],
  ],
  "purchase-orders": [
    ["Código de OC", "externalCode", true], ["Código de proveedor", "supplierCode", true],
    ["Código de obra", "workCode"], ["Código de destino", "destinationCode", true],
    ["Código material", "materialCode", true], ["Cantidad", "quantity", true],
    ["Precio unitario", "unitPrice", true], ["Moneda", "currency", true],
    ["Base impositiva", "taxBasis", true], ["Observaciones", "notes"],
  ],
  "initial-stock": [
    ["Código de registro", "externalCode", true], ["Código material", "materialCode", true],
    ["Código de ubicación", "locationCode", true], ["Cantidad", "quantity", true],
    ["Motivo", "reason", true],
  ],
};

const templateContext: Record<ImportKind, { filename: string; purpose: string; references: string; examples: string[] }> = {
  clients: {
    filename: "clientes", purpose: "Dar de alta clientes.",
    references: "Usá un código propio de la fuente. Completá el CUIT únicamente si lo conocés.",
    examples: ["CLI-EJ-01 | Estudio Ejemplo"],
  },
  works: {
    filename: "obras", purpose: "Dar de alta obras históricas con su ubicación de stock.",
    references: "Indicá el código exacto de un cliente activo o dejalo vacío para crear la obra sin cliente.",
    examples: ["OBR-EJ-01 | Reforma ilustrativa | CLI-EJ-01"],
  },
  suppliers: {
    filename: "proveedores", purpose: "Dar de alta proveedores.",
    references: "Usá un código propio de la fuente y los datos fiscales disponibles.",
    examples: ["PRV-EJ-01 | Corralón Ejemplo"],
  },
  materials: {
    filename: "materiales", purpose: "Dar de alta materiales del catálogo.",
    references: "Unidad existente por código, símbolo exacto o nombre. Rubro existente por código o nombre. Si omitís el código, se genera al confirmar. Si omitís el mínimo, se usa cero.",
    examples: [
      "Sin código | Cemento Portland | kg | Albañilería | 100",
      "Sin código | Cal hidratada | kg | Albañilería | 50",
      "Sin código | Arena fina | m³ | Albañilería | 5",
      "Sin código | Ladrillo hueco | un | Albañilería | 200",
    ],
  },
  prices: {
    filename: "precios", purpose: "Agregar referencias de precio al historial.",
    references: "Usá códigos exactos de materiales. Indicá el código o símbolo de la unidad base. Con una presentación compatible existente, el precio corresponde a esa presentación. Si está vacía, corresponde a una unidad base.",
    examples: ["MAT-DEMO-01 | kg | Bolsa 25 kg | 7210", "MAT-DEMO-02 | kg | Bolsa 25 kg | 6629,93"],
  },
  "purchase-orders": {
    filename: "ordenes-de-compra", purpose: "Importar órdenes de compra abiertas.",
    references: "Una fila por material. Repetí los mismos datos de cabecera para un código de OC. Usá códigos existentes de proveedor, destino, material y obra, si corresponde. Cantidad y precio en unidad base. Bases admitidas: Sin IVA, + IVA, IVA incluido y No especificado.",
    examples: ["OC-EJ-01 | PRV-EJ-01 | Sin obra | UBI-EJ-01 | MAT-EJ-01 | 25 | 1200 | ARS | Sin IVA"],
  },
  "initial-stock": {
    filename: "stock-inicial", purpose: "Registrar la apertura de inventario.",
    references: "Usá los códigos existentes del material y de la ubicación. La cantidad se expresa en unidad base. Sólo se admite una apertura por material y ubicación.",
    examples: ["INI-EJ-01 | MAT-EJ-01 | UBI-EJ-01 | 25 | Recuento inicial"],
  },
};

const fieldLabels: Record<string, string> = {
  ...Object.fromEntries(Object.values(officialImportColumns).flat().map(([label, field]) => [field, label])),
  externalCode: "Código del registro", materialCode: "Código del material", unitCode: "Unidad de medida", supplierCode: "Código de proveedor",
  effectiveAt: "Fecha de vigencia", baseQuantity: "Cantidad equivalente en unidad base",
};

export function importIssueMessage(issue: z.ZodIssue, kind?: ImportKind) {
  if (issue.code === "unrecognized_keys")
    return "El archivo contiene columnas que no corresponden a la plantilla.";
  const field = String(issue.path.at(-1) ?? "");
  const contextualLabel = field === "name" && kind
    ? officialImportColumns[kind].find(([, key]) => key === field)?.[0]
    : undefined;
  const label = contextualLabel ?? fieldLabels[field] ?? "Dato de la fila";
  if ((issue.code === "invalid_type" && issue.received === "undefined") ||
      (issue.code === "too_small" && issue.type === "string" && issue.minimum === 1)) {
    const article = ["unitCode", "currency", "taxBasis", "effectiveAt", "quantity"].includes(field) ? "la" : "el";
    return `Falta indicar ${article} ${label.toLowerCase()}.`;
  }
  if (field === "email") return "Indicá un email válido.";
  if (field === "effectiveAt") return "Indicá una fecha de vigencia válida.";
  if (["price", "unitPrice", "quantity", "minimum", "baseQuantity"].includes(field))
    return `${label}: ingresá un número válido de hasta 8 decimales.`;
  if (issue.code === "too_big" && issue.type === "string")
    return `${label}: admite hasta ${issue.maximum} caracteres.`;
  return `${label}: el valor no es válido.`;
}

export async function parseImportRequest<T extends z.ZodTypeAny>(request: Request, schema: T) {
  try {
    return await parse(request, schema);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR" || !Array.isArray(error.details))
      throw error;
    const issues = error.details as z.ZodIssue[];
    const first = issues[0];
    const field = first.path[0];
    if (first.code === "too_big" && field === "csv")
      throw new ApiError(413, "FILE_TOO_LARGE", "El CSV supera 1,5 MB.");
    if (first.code === "too_big" && first.path.at(-1) === "base64")
      throw new ApiError(413, "FILE_TOO_LARGE", "El archivo supera 1 MB.");
    const message = field === "effectiveAt" ? importIssueMessage(first)
      : first.code === "custom" ? first.message
      : first.code === "unrecognized_keys" ? importIssueMessage(first)
      : field === "supplierId" ? "Seleccioná un proveedor activo."
      : field === "currency" || field === "taxBasis" ? importIssueMessage(first)
      : "Revisá el formato del archivo y los datos enviados para importar.";
    throw new ApiError(422, error.code, message);
  }
}

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
    file: spreadsheetFileSchema.optional(),
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
    (b) => [b.rows, b.csv, b.file].filter((value) => value !== undefined).length === 1,
    "Enviá una sola opción: archivo Excel, contenido CSV o filas.",
  );
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type ImportIssue = { row: number; message: string };
type Row = Record<string, string>;
type TabularInput = Pick<SpreadsheetSheet, "columns" | "rows" | "rowNumbers">;
const columnsError = () => new ApiError(
  422, "INVALID_HEADERS", "El archivo contiene columnas que no corresponden a la plantilla.",
);

export const spanishTaxBasis: Readonly<Record<string, string>> = {
  "Sin IVA": "EXCLUDED", "+ IVA": "EXCLUDED", "IVA incluido": "INCLUDED", "No especificado": "UNSPECIFIED",
};

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
  const presentationIds = [...new Set(rows.flatMap((r) => r.presentationId ? [r.presentationId] : []))];
  const presentations = presentationIds.length ? await client.presentation.findMany({
    where: { id: { in: presentationIds } },
    select: { id: true, name: true, active: true, materialId: true, supplierId: true, baseQuantity: true },
  }) : [];
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
      ...(r.presentationId ? { presentation: presentations.find((p) => p.id === r.presentationId) ?? null } : {}),
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

// RFC 4180 subset with quoted multiline fields and doubled quotes.
export function readCsv(source: string, spanishHeaders: readonly string[] = []): TabularInput {
  const input = source.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  const rowNumbers: number[] = [];
  let commas = 0, semicolons = 0, quotedHeader = false;
  if (spanishHeaders.length) {
    const header = input.trimStart();
    for (let i = 0; i < header.length; i++) {
      const c = header[i];
      if (c === '"') quotedHeader = !quotedHeader;
      if (quotedHeader) continue;
      if (c === "\r" || c === "\n") break;
      if (c === ",") commas++;
      if (c === ";") semicolons++;
    }
  }
  if (commas && semicolons) throw columnsError();
  const delimiter = semicolons ? ";" : ",";
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
    if (c === delimiter) {
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
  if (delimiter === ";" && !headers.some((column) => spanishHeaders.includes(column)))
    throw columnsError();
  for (const [index, values] of records.entries()) {
    if (values.length !== headers.length)
      throw new ApiError(
        422, "INVALID_CSV", `Fila ${index + 1}: cantidad de columnas inválida.`,
      );
    rowNumbers.push(index + 1);
  }
  return { columns: headers, rows: records, rowNumbers };
}

function recordRows(table: TabularInput, fields = table.columns) {
  return table.rows.map((values) => Object.fromEntries(
    fields.flatMap((field, i) => values[i] === "" ? [] : [[field, values[i]]]),
  ));
}
export function parseCsv(source: string): Record<string, string>[] {
  return recordRows(readCsv(source));
}

const normalizedName = (name: string) => name.trim().toLocaleLowerCase("es-AR");

function resolveReference<T extends { id: string; code: string; name: string; symbol?: string | null }>(
  entries: T[], value: string, unit: boolean,
) {
  const code = entries.find((entry) => entry.code === value);
  const matches = code ? [code] : entries.filter((entry) =>
    normalizedName(entry.name) === normalizedName(value) || (unit && entry.symbol === value),
  );
  if (matches.length === 1) return { entry: matches[0] };
  const message = matches.length
    ? unit ? "La unidad coincide con varios registros. Indicá su código exacto."
      : "El rubro coincide con varios registros. Indicá su código exacto."
    : unit ? "La unidad indicada no existe en el catálogo." : "El rubro indicado no existe en el catálogo.";
  return { message };
}

async function resolveMaterials(
  tx: Tx | typeof db, raw: Row[], rowNumbers: number[],
) {
  const [units, categories] = await Promise.all([
    tx.unit.findMany({ select: { id: true, code: true, name: true, symbol: true } }),
    tx.category.findMany({ select: { id: true, code: true, name: true } }),
  ]);
  const errors: ImportIssue[] = [];
  const automatic = new Set<number>();
  const identities: (string | null)[][] = [];
  const rows = raw.map((original, index) => {
    const row = { ...original };
    const number = rowNumbers[index];
    const unit = row.unitCode?.trim() ? resolveReference(units, row.unitCode, true) : undefined;
    const category = row.categoryCode?.trim() ? resolveReference(categories, row.categoryCode, false) : undefined;
    if (unit?.message) errors.push({ row: number, message: unit.message });
    if (category?.message) errors.push({ row: number, message: category.message });
    if (unit?.entry) row.unitCode = unit.entry.code;
    if (category?.entry) row.categoryCode = category.entry.code;
    else if (!row.categoryCode?.trim()) delete row.categoryCode;
    if (!row.externalCode?.trim()) {
      automatic.add(number);
      if (row.name?.trim() && unit?.entry)
        row.externalCode = digest([normalizedName(row.name), unit.entry.id]);
      else delete row.externalCode;
    }
    identities.push([unit?.entry?.id ?? null, category?.entry?.id ?? null]);
    return row;
  });
  return { rows, errors, automatic, identities };
}

export function normalizeImport(
  kind: ImportKind,
  raw: Record<string, unknown>[],
  numbers = raw.map((_, i) => i + 1),
  automatic = new Set<number>(),
  officialMaterials = false,
) {
  const errors: ImportIssue[] = [];
  const rows: Row[] = [];
  const sourceRows: number[] = [];
  const seen = new Set<string>();
  const stockPairs = new Set<string>();
  const pricePairs = new Set<string>();
  const taxIds = new Set<string>();
  const materialNames = new Map<string, number[]>();
  for (const [i, value] of raw.entries()) {
    const number = numbers[i];
    if (officialMaterials && typeof value.name === "string" && value.name.trim()) {
      const name = normalizedName(value.name);
      materialNames.set(name, [...(materialNames.get(name) ?? []), number]);
    }
    const result = schemas[kind].safeParse(value);
    if (!result.success) {
      const message = result.error.issues
        .filter((issue) => !automatic.has(number) || issue.path[0] !== "externalCode")
        .map((issue) => importIssueMessage(issue, kind))
        .join(" ");
      if (message) errors.push({ row: number, message });
      continue;
    }
    const row = result.data as Row;
    if (kind === "clients" && row.taxId) row.taxId = canonicalTaxId(row.taxId);
    const unique =
      kind === "purchase-orders"
        ? `${row.externalCode}:${row.materialCode}`
        : JSON.stringify([automatic.has(number), row.externalCode]);
    if (seen.has(unique))
      errors.push({
        row: number,
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
          row: number,
          message:
            "Referencia de precio duplicada para el mismo material, proveedor, presentación y vigencia",
        });
      pricePairs.add(pair);
    }
    if (kind === "initial-stock") {
      const pair = JSON.stringify([row.materialCode, row.locationCode]);
      if (stockPairs.has(pair))
        errors.push({
          row: number,
          message:
            "El mismo material y ubicación sólo admiten una apertura de inventario",
        });
      stockPairs.add(pair);
    }
    if ((kind === "suppliers" || kind === "clients") && row.taxId) {
      if (taxIds.has(row.taxId))
        errors.push({
          row: number,
          message: "Identificación fiscal duplicada dentro del archivo",
        });
      taxIds.add(row.taxId);
    }
    rows.push(row);
    sourceRows.push(number);
  }
  for (const duplicates of materialNames.values()) {
    if (duplicates.length > 1)
      for (const row of duplicates)
        errors.push({ row, message: "Posible material duplicado: el nombre se repite en el archivo." });
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
const importRowKey = (kind: ImportKind, code: string, automatic: boolean) =>
  automatic ? `import-auto:materials:${code}` : `import:${kind}:${code}`;

async function references(
  tx: Tx | typeof db,
  kind: ImportKind,
  rows: Row[],
  sourceRows: number[],
  automatic: Set<number>,
  officialMaterials: boolean,
) {
  const errors: ImportIssue[] = [];
  const materialNames = officialMaterials
    ? new Set((await tx.material.findMany({ select: { name: true } })).map(({ name }) => normalizedName(name)))
    : new Set<string>();
  for (const [i, r] of rows.entries()) {
    const auto = automatic.has(sourceRows[i]);
    const fail = (message: string) =>
      errors.push({ row: sourceRows?.[i] ?? i + 1, message });
    if (
      await tx.idempotencyRecord.findUnique({
        where: { key: importRowKey(kind, r.externalCode, auto) },
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
      if (materialNames?.has(normalizedName(r.name)))
        fail("Posible material duplicado: ya existe un material con ese nombre en el catálogo.");
      if (!auto && await tx.material.findUnique({ where: { code: r.externalCode } }))
        fail("Material ya existente");
      if (!officialMaterials && !(await tx.unit.findUnique({ where: { code: r.unitCode } })))
        fail("La unidad indicada no existe en el catálogo.");
      if (
        !officialMaterials && r.categoryCode &&
        !(await tx.category.findUnique({ where: { code: r.categoryCode } }))
      )
        fail("El rubro indicado no existe en el catálogo.");
    }
    if (
      r.materialCode &&
      !(await tx.material.findFirst({
        where: { code: r.materialCode, active: true },
      }))
    )
      fail("Material desconocido o inactivo.");
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
        fail("Sin presentación, la equivalencia debe ser de una unidad base.");
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
  if (action === "template" && request.method === "GET") {
    const format = new URL(request.url).searchParams.get("format");
    if (format === "xlsx") {
      const columns = officialImportColumns[kind];
      const context = templateContext[kind];
      const date = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      return spreadsheetTemplate(
        `plantilla-${context.filename}-${date}`,
        columns.map(([label, field]) => ({
          label, text: /Code$|^taxId$|^phone$|^unit$|^presentationId$/.test(field),
        })),
        [
          ["Instrucción", "Detalle"],
          ["Finalidad", context.purpose],
          ["Cómo completar", "Completá la hoja Datos debajo de los encabezados y cargá el archivo para revisar las filas antes de confirmar."],
          ["Obligatorios", columns.filter(([, , required]) => required).map(([label]) => label).join(", ")],
          ["Opcionales", columns.filter(([, , required]) => !required).map(([label]) => label).join(", ")],
          ["Referencias", context.references],
          ...(kind === "prices" ? [["En la pantalla", "Seleccioná proveedor, moneda, base impositiva y fecha de vigencia de la lista."]] : []),
          ...context.examples.map((example) => ["Ejemplo ilustrativo", example]),
          ["Hoja Contexto", "Esta hoja no se importa. Los ejemplos y códigos son ilustrativos."],
        ],
      );
    }
    if (format !== null && format !== "csv")
      throw new ApiError(422, "UNSUPPORTED_FORMAT", "Elegí una plantilla Excel o CSV.");
    return new Response(importTemplates[kind].join(",") + "\r\n", {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${kind}.csv"`,
      },
    });
  }
  if (request.method !== "POST" || !["preview", "commit"].includes(action))
    return null;
  const input = await parseImportRequest(request, inputSchema);
  const labels = new Map(officialImportColumns[kind].map(([label, field]) => [label, field]));
  let table: TabularInput | undefined;
  const fileErrors: ImportIssue[] = [];
  if (input.file) {
    if (kind === "prices")
      throw new ApiError(422, "UNSUPPORTED_FILE", "Cargá el archivo mediante la importación de listas de precios.");
    if (!/\.xlsx$/i.test(input.file.name))
      throw new ApiError(422, "UNSUPPORTED_FILE", "Se admite un archivo Excel .xlsx o contenido CSV.");
    const sheets = await readXlsx(decodeSpreadsheet(input.file.base64));
    const populated = sheets.filter((sheet) => sheet.columns.length);
    const sheet = sheets.find(({ name }) => name === "Datos") ??
      (populated.length === 1 ? populated[0] : undefined);
    if (!sheet && populated.length > 1)
      throw new ApiError(422, "INVALID_SHEET", "El archivo tiene varias hojas. Usá la plantilla oficial con una hoja Datos.");
    if (!sheet?.rows.length)
      throw new ApiError(422, "EMPTY_FILE", "La hoja de datos está vacía. Agregá al menos una fila.");
    table = sheet;
    for (const row of sheet.formulaRows) {
      const message = "Reemplazá la fórmula por un valor en la celda.";
      if (row === 0) throw new ApiError(422, "INVALID_HEADERS", message);
      fileErrors.push({ row, message });
    }
  } else if (input.csv !== undefined) {
    if (Buffer.byteLength(input.csv) > 1_500_000)
      throw new ApiError(413, "FILE_TOO_LARGE", "El CSV supera 1,5 MB.");
    table = readCsv(input.csv, kind === "prices" ? [] : [...labels.keys()]);
  }
  const spanish = !!table && (input.file !== undefined ||
    (kind !== "prices" && table.columns.some((column) => labels.has(column))));
  const officialMaterials = spanish && kind === "materials";
  let tabularRows: Row[] = [];
  if (table) {
    const fields = spanish ? table.columns.map((column) => labels.get(column) ?? "") : table.columns;
    if (new Set(fields).size !== fields.length ||
        fields.some((field) => !importTemplates[kind].includes(field)))
      throw columnsError();
    tabularRows = recordRows(table, fields);
    if (spanish) {
      for (const row of tabularRows) {
        for (const field of ["minimum", "quantity", "unitPrice"]) {
          if (row[field] !== undefined) row[field] = localPrice(row[field]);
        }
        if (row.taxBasis !== undefined) {
          const value = row.taxBasis.trim();
          row.taxBasis = Object.hasOwn(spanishTaxBasis, value) ? spanishTaxBasis[value] : "";
        }
      }
    }
  }
  const prepare = async (client: Tx | typeof db) => {
    const resolved = officialMaterials
      ? await resolveMaterials(client, tabularRows, table!.rowNumbers)
      : undefined;
    const automatic = resolved?.automatic ?? new Set<number>();
    const batch = normalizeImport(kind, resolved?.rows ?? input.rows ?? tabularRows, table?.rowNumbers, automatic, officialMaterials);
    return {
      ...batch, automatic, identities: resolved?.identities,
      errors: [...fileErrors, ...(resolved?.errors ?? []), ...batch.errors],
    };
  };
  const normalized = await prepare(db);
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
  const batchHash = (batch: typeof normalized) => digest({
    kind,
    rows: batch.rows,
    ...(officialMaterials ? {
      automatic: batch.sourceRows.map((number) => batch.automatic.has(number)),
      references: batch.identities,
    } : {}),
    ...(review ? { baselineHash } : {}),
  });
  const hash = batchHash(normalized);
  if (action === "preview") {
    const errors = [
      ...normalized.errors,
      ...(await references(db, kind, normalized.rows, normalized.sourceRows, normalized.automatic, officialMaterials)),
    ];
    return ok({
      valid: errors.length === 0,
      rowCount: input.rows?.length ?? tabularRows.length,
      errors,
      confirmationHash: hash,
      ...(table ? {
        table: {
          columns: spanish ? table.columns : table.columns.map((field) =>
            officialImportColumns[kind].find(([, key]) => key === field)?.[0] ?? fieldLabels[field] ?? field,
          ),
          rows: table.rows.map((values, i) => ({
            row: table!.rowNumbers[i], values,
            ...(normalized.automatic.has(table!.rowNumbers[i]) ? { automaticCode: true } : {}),
          })),
        },
      } : {}),
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
  const confirmationHash = input.confirmationHash;
  if (!confirmationHash || (!officialMaterials && confirmationHash !== hash))
    throw new ApiError(
      409,
      "PREVIEW_REQUIRED",
      "La confirmación debe coincidir con el hash de previsualización",
    );
  if (!officialMaterials && normalized.errors.length)
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
    officialMaterials
      ? { hash: confirmationHash, source: digest({ tabularRows, fileErrors }) }
      : { hash },
    async (tx) => {
      // Replays use the same file content even when a catalog alias has since changed.
      const batch = officialMaterials ? await prepare(tx) : normalized;
      const { rows, sourceRows, automatic } = batch;
      if (batchHash(batch) !== confirmationHash)
        throw new ApiError(409, "PREVIEW_REQUIRED", "Las referencias cambiaron. Revisá el archivo nuevamente antes de confirmar.");
      if (batch.errors.length)
        throw new ApiError(422, "IMPORT_INVALID", "Archivo inválido", batch.errors);
      if (
        review &&
        (!baselineHash || (await priceBaseline(tx, rows)).hash !== baselineHash)
      )
        throw new ApiError(
          409,
          "PRICE_PREVIEW_STALE",
          "Los precios o sus referencias cambiaron. Revisá nuevamente las diferencias antes de confirmar.",
        );
      const errors = await references(tx, kind, rows, sourceRows, automatic, officialMaterials);
      if (errors.length)
        throw new ApiError(
          422,
          "IMPORT_INVALID",
          "No se importó ninguna fila",
          errors,
        );
      const created: string[] = [];
      const grouped = new Map<string, { code: string; auto: boolean; group: Row[] }>();
      for (const [index, row] of rows.entries()) {
        const code = row.externalCode;
        const auto = automatic.has(sourceRows[index]);
        const key = importRowKey(kind, code, auto);
        const existing = grouped.get(key);
        if (existing) existing.group.push(row);
        else grouped.set(key, { code, auto, group: [row] });
      }
      // Explicit material codes are visible to the counter's collision check within this transaction.
      const ordered = [...grouped.entries()].sort(([, a], [, b]) => Number(a.auto) - Number(b.auto));
      for (const [rowKey, { code, auto, group }] of ordered) {
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
                code: auto ? await reserveAutoCode(tx, "materials") : code,
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
            key: rowKey,
            scope: `import-row:${kind}`,
            actorId: actor.id,
            requestHash: digest(group),
            response: { entityId },
          },
        });
        created.push(entityId);
      }
      await audit(tx, actor, "IMPORT", kind, confirmationHash, {
        rows: rows.length,
        entities: created.length,
        hash: confirmationHash,
      });
      return {
        importedRows: rows.length,
        createdIds: created,
        confirmationHash,
      };
    },
  );
  return ok(result, 201);
}
