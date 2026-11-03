/** Controlled BASE source adapter. No DB access, no formula evaluation. */
import ExcelJS from "exceljs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extractComposition, type SourceSheet } from "./historical-composition";
import { Prisma } from "@prisma/client";

async function main() {
  const [source, output] = process.argv.slice(2);
  if (!source || !output)
    throw Error("Uso: extract-base-template.ts BASE.xlsx salida.json");
  const bytes = await readFile(source);
  if (bytes.length > 3_000_000) throw Error("BASE supera 3 MB");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    bytes as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  const sheet = book.getWorksheet("COSTO");
  if (!sheet) throw Error("Falta hoja COSTO");
  const value = (v: ExcelJS.CellValue): string | number | null => {
    if (v === undefined || v === null) return null;
    if (typeof v === "string" || typeof v === "number") return v;
    if (typeof v === "object" && "richText" in v)
      return v.richText.map((t) => t.text).join("");
    if (typeof v === "object" && "result" in v)
      return typeof v.result === "number" || typeof v.result === "string"
        ? v.result
        : null;
    return null;
  };
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0
      ? new Prisma.Decimal(v)
          .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
          .toFixed()
      : null;
  const sources: SourceSheet[] = book.worksheets.map((w) => ({
    name: w.name,
    rows: Array.from({ length: Math.min(w.rowCount, 1000) }, (_, i) =>
      Array.from(
        { length: Math.min(w.columnCount, 40) },
        (_, j) => value(w.getCell(i + 1, j + 1).value) ?? "",
      ),
    ),
    formulas: Array.from({ length: Math.min(w.rowCount, 1000) }, (_, i) =>
      Array.from({ length: Math.min(w.columnCount, 40) }, (_, j) => ({
        row: i + 1,
        column: j + 1,
        text: w.getCell(i + 1, j + 1).formula ?? null,
      })),
    )
      .flat()
      .filter((f) => f.text !== null),
  }));
  const lines: Record<string, unknown>[] = [],
    issues: { row: number; message: string }[] = [];
  let category = "";
  for (let row = 10; row <= Math.min(sheet.rowCount, 1000); row++) {
    const r = sheet.getRow(row),
      name = String(value(r.getCell(2).value) ?? "").trim(),
      unit = String(value(r.getCell(3).value) ?? "").trim();
    if (typeof value(r.getCell(1).value) === "number" && name) {
      category = name;
      continue;
    }
    if (!category || !name || !unit) continue;
    const extracted = extractComposition(sources, "COSTO", row),
      materialCost = num(value(r.getCell(5).value)),
      labor = num(value(r.getCell(6).value));
    const legitimateDirect =
      /BAÑO QUIMICO|OBRADOR|MOVILIDAD|SEGUROS|HIGIENE|SEGURIDAD/i.test(name);
    const materials = legitimateDirect
      ? []
      : extracted.materials.map((m) => ({
          sourceKey: m.cells[0],
          name: m.name,
          unit: m.unit,
          coefficient: m.coefficient,
          unitPrice: m.unitPrice,
        }));
    let direct: string | null = materialCost ?? "0";
    const physicalWarnings = legitimateDirect ? [] : extracted.warnings;
    const materialReview = {
      status:
        legitimateDirect || materialCost === "0"
          ? "DIRECT"
          : materials.length && !physicalWarnings.length
            ? "VERIFIED"
            : "UNRESOLVED",
      detail:
        physicalWarnings.join("; ") ||
        (materials.length
          ? "Consumos físicos de fuente; costo de suministro agregado sin doble suma"
          : "Costo directo; comprobar su alcance físico"),
      evidence: `COSTO!E${row}; ${extracted.cells.slice(0, 10).join(", ")}`,
    };
    for (const warning of physicalWarnings)
      issues.push({ row, message: warning });
    if (
      materialCost === null &&
      r.getCell(5).value !== null &&
      r.getCell(5).value !== undefined
    ) {
      direct = null;
      issues.push({
        row,
        message: "Costo de suministro sin valor numérico verificable",
      });
    }
    if (
      labor === null &&
      r.getCell(6).value !== null &&
      r.getCell(6).value !== undefined
    )
      issues.push({
        row,
        message: "Mano de obra sin valor numérico verificable",
      });
    if (!materials.length && materialCost && materialCost !== "0")
      issues.push({
        row,
        message:
          "Suministro agregado sin composición: conservado como costo directo explícito, no genera materiales previstos",
      });
    let laborValue = labor ?? (r.getCell(6).value == null ? "0" : null);
    if (
      category.trim().toUpperCase() === "VARIOS" &&
      /SEGUROS|SEGURIDAD|HIGIENE/i.test(name)
    ) {
      direct =
        direct === null || laborValue === null
          ? null
          : new Prisma.Decimal(direct).add(laborValue).toFixed();
      laborValue = "0";
      issues.push({
        row,
        message:
          "Seguro/higiene se conserva como servicio directo; no se representa como salario aunque la fuente use la columna de mano de obra.",
      });
    }
    lines.push({
      sourceKey: `COSTO:${row}`,
      category,
      name,
      unit,
      quantity: "0",
      laborUnitCost: laborValue,
      directUnitCost: direct,
      materialsIncludedInDirect: materials.length > 0,
      materialReview,
      materials,
    });
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        format: "base-template-v1",
        extractionVersion: 2,
        sourceSha256: createHash("sha256").update(bytes).digest("hex"),
        currency: "ARS",
        taxBasis: "UNSPECIFIED",
        markup: "50",
        notice:
          "BASE histórica: referencias de IVA contradictorias entre hojas. Moneda/IVA y precios se revisan expresamente; los valores faltantes no se inventan. Cantidad cero deja la partida fuera del presupuesto.",
        lines,
        issues,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    `BASE: ${lines.length} actividades, ${issues.length} observaciones trazadas. No se escribió en bases.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
