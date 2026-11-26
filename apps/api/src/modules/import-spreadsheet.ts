import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../core/errors";

export const spreadsheetFileSchema = z
  .object({
    name: z.string().min(1).max(200),
    base64: z.string().max(1_400_000),
  })
  .strict();

export const xlsxMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type SpreadsheetSheet = {
  name: string;
  columns: string[];
  rows: string[][];
  rowNumbers: number[];
  formulaRows: number[];
};

const invalidXlsx = () =>
  new ApiError(422, "INVALID_XLSX", "El archivo Excel está vacío, dañado o tiene un formato incompatible.");
const activeContent = () =>
  new ApiError(422, "ACTIVE_CONTENT", "Quitá las macros y los enlaces activos antes de importar.");
const expandedLimit = () =>
  new ApiError(413, "FILE_EXPANDED_LIMIT", "El contenido expandido del archivo supera el límite de 20 MB.");
const maxExpanded = 20_000_000;

export function decodeSpreadsheet(base64: string) {
  if (base64 && (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)))
    throw new ApiError(422, "INVALID_FILE", "No se pudo leer el archivo enviado. Volvé a seleccionarlo.");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length)
    throw new ApiError(422, "EMPTY_FILE", "El archivo está vacío.");
  if (bytes.length > 1_000_000)
    throw new ApiError(413, "FILE_TOO_LARGE", "El archivo supera 1 MB. Dividí la carga.");
  return bytes;
}

export function inspectXlsx(bytes: Buffer) {
  if (bytes.length > 1_000_000)
    throw new ApiError(413, "FILE_TOO_LARGE", "El archivo supera 1 MB. Dividí la carga.");
  if (bytes.length < 22 || bytes.readUInt32LE(0) !== 0x04034b50)
    throw invalidXlsx();

  // Locate the actual ZIP directory and verify the decompressed lengths before ExcelJS loads it.
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65_557) &&
    (bytes.readUInt32LE(end) !== 0x06054b50 ||
      end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length)
  ) end--;
  if (end < Math.max(0, bytes.length - 65_557) ||
      bytes.readUInt32LE(end + 4) !== 0 ||
      bytes.readUInt16LE(end + 8) !== bytes.readUInt16LE(end + 10))
    throw invalidXlsx();

  const entries = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  if (!entries || offset + bytes.readUInt32LE(end + 12) !== end)
    throw invalidXlsx();
  if (entries > 3000) throw expandedLimit();
  const directory = offset;
  const names = new Set<string>();
  let expanded = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw invalidXlsx();
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20);
    const length = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const local = bytes.readUInt32LE(offset + 42);
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    const name = nameBytes.toString("utf8");
    const extraStart = offset + 46 + nameLength;
    const extraEnd = extraStart + extraLength;
    offset = extraEnd + commentLength;
    if (offset > end || names.has(name) || local + 30 > directory ||
        bytes.readUInt32LE(local) !== 0x04034b50 || (flags & 1) ||
        ![0, 8].includes(method) || method !== bytes.readUInt16LE(local + 8))
      throw invalidXlsx();
    const localNameEnd = local + 30 + bytes.readUInt16LE(local + 26);
    const start = localNameEnd + bytes.readUInt16LE(local + 28);
    if (start + compressed > directory ||
        !nameBytes.equals(bytes.subarray(local + 30, localNameEnd)))
      throw invalidXlsx();
    // ZIP Unicode path extras can replace the local name before ExcelJS sees it.
    for (let field = extraStart; field < extraEnd;) {
      if (field + 4 > extraEnd) throw invalidXlsx();
      const tag = bytes.readUInt16LE(field);
      const end = field + 4 + bytes.readUInt16LE(field + 2);
      if (end > extraEnd ||
          (tag === 0x7075 && !nameBytes.equals(bytes.subarray(field + 9, end))))
        throw invalidXlsx();
      field = end;
    }
    names.add(name);
    if (/vbaProject|externalLinks|macroSheets|activeX|embeddings/i.test(name))
      throw activeContent();

    if (expanded + length > maxExpanded) throw expandedLimit();
    const packed = bytes.subarray(start, start + compressed);
    let content: Buffer;
    try {
      content = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: Math.max(1, length) });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") throw expandedLimit();
      if (String((error as NodeJS.ErrnoException).code).startsWith("Z_")) throw invalidXlsx();
      throw error;
    }
    if (content.length !== length) throw invalidXlsx();
    expanded += content.length;
    if (/\.rels$|\[Content_Types\]\.xml$/i.test(name) &&
        /TargetMode\s*=\s*["']External["']|macroEnabled|vbaProject|\/hyperlink["']/i.test(content.toString()))
      throw activeContent();
    if (/^xl\/worksheets\/[^/]+\.xml$/i.test(name) &&
        /<(?:[\w.-]+:)?hyperlink\b/i.test(content.toString()))
      throw activeContent();
  }
  if (offset !== end || !names.has("[Content_Types].xml") || !names.has("xl/workbook.xml"))
    throw invalidXlsx();
}

export async function readXlsx(bytes: Buffer): Promise<SpreadsheetSheet[]> {
  inspectXlsx(bytes);
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
  } catch (error) {
    // ExcelJS uses plain errors for malformed archives and TypeErrors when a
    // damaged workbook points to missing sheet or shared-string records.
    if (error instanceof Error && !("code" in error)) {
      if (error.name === "Error" || error.name === "SyntaxError" ||
          (error instanceof TypeError && /reading '(sheets|richText)'/.test(error.message)))
        throw invalidXlsx();
    }
    throw error;
  }
  return book.worksheets.map((sheet) => {
    // Formatted but empty rows and columns do not count as data.
    if (sheet.actualRowCount > 1001 || sheet.actualColumnCount > 100)
      throw new ApiError(422, "ROW_LIMIT", "Cada hoja admite hasta 1000 filas de datos y 100 columnas.");
    const formulaRows = new Set<number>();
    const cellText = (value: ExcelJS.CellValue, row: number): string => {
      if (value == null) return "";
      if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) throw invalidXlsx();
        return value.toISOString();
      }
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw invalidXlsx();
        const text = String(value);
        return text.includes("e") ? new Prisma.Decimal(text).toFixed() : text;
      }
      if (typeof value !== "object") return String(value);
      if ("formula" in value || "sharedFormula" in value) {
        formulaRows.add(row);
        return "=FÓRMULA: revisar valor";
      }
      if ("hyperlink" in value) throw activeContent();
      if ("richText" in value) return value.richText.map((t) => t.text).join("");
      return "error" in value ? value.error : "";
    };
    let width = 0;
    const populated = new Map<number, string[]>();
    sheet.eachRow((row, number) => {
      const values: string[] = [];
      row.eachCell((cell, column) => {
        if (column > 100)
          throw new ApiError(422, "ROW_LIMIT", "Cada hoja admite hasta 100 columnas.");
        values[column - 1] = cellText(cell.value, number - 1);
      });
      if (values.some((v) => v.trim() !== "")) {
        width = Math.max(width, values.length);
        populated.set(number, values);
      }
    });
    const pad = (row: string[] = []) => Array.from({ length: width }, (_, i) => row[i] ?? "");
    const columns = pad(populated.get(1));
    populated.delete(1);
    return {
      name: sheet.name,
      columns,
      rows: [...populated.values()].map(pad),
      rowNumbers: [...populated.keys()].map((number) => number - 1),
      formulaRows: [...formulaRows],
    };
  });
}

export async function spreadsheetTemplate(
  filename: string,
  columns: { label: string; text?: boolean }[],
  context: string[][],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CEO Construcciones";
  const sheet = workbook.addWorksheet("Datos");
  sheet.columns = columns.map(({ label, text }) => ({
    header: label,
    width: Math.max(20, label.length + 6),
    ...(text ? { style: { numFmt: "@" } } : {}),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const notes = workbook.addWorksheet("Contexto");
  notes.addRows(context);
  notes.getRow(1).font = { bold: true };
  notes.getColumn(1).width = 25;
  notes.getColumn(2).width = 106;
  notes.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  notes.eachRow((row) => { row.height = 34; });
  return new Response(Buffer.from(await workbook.xlsx.writeBuffer()), {
    headers: {
      "content-type": xlsxMime,
      "content-disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
