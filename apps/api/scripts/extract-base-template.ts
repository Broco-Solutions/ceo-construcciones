/** Controlled BASE source adapter. No DB access, no formula evaluation. */
import ExcelJS from "exceljs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
  const ref = (v: ExcelJS.CellValue) => {
    if (!v || typeof v !== "object" || !("formula" in v) || !v.formula)
      return null;
    const m = v.formula.match(/^\+?'([^']+)'!\$?J\$?(\d+)$/);
    return m ? { sheet: m[1], row: Number(m[2]) } : null;
  };
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
    const materialRef = ref(r.getCell(5).value),
      materials: Record<string, unknown>[] = [],
      materialCost = num(value(r.getCell(5).value)),
      labor = num(value(r.getCell(6).value));
    let direct: string | null = materialCost ?? "0";
    if (materialRef) {
      const recipe = book.getWorksheet(materialRef.sheet);
      if (recipe) {
        let start = materialRef.row - 1;
        while (start > 1 && !value(recipe.getRow(start).getCell(1).value))
          start--;
        for (let n = start + 1; n < materialRef.row; n++) {
          const rr = recipe.getRow(n);
          if (
            String(value(rr.getCell(6).value) ?? "")
              .trim()
              .toLowerCase() !== "x"
          )
            continue;
          const label = String(value(rr.getCell(2).value) ?? "").trim(),
            coefficient = num(value(rr.getCell(4).value)),
            mu = String(value(rr.getCell(5).value) ?? "").trim();
          if (!label || !mu || coefficient === null) {
            issues.push({
              row,
              message: `Composición ${materialRef.sheet}:${n} sin consumo verificable`,
            });
            continue;
          }
          if (coefficient !== "0")
            materials.push({
              sourceKey: `${materialRef.sheet}:${n}`,
              name: label,
              unit: mu,
              coefficient,
              unitPrice: num(value(rr.getCell(7).value)),
            });
        }
        if (materials.length) direct = "0";
      }
    }
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
      materials,
    });
  }
  await writeFile(
    output,
    JSON.stringify(
      {
        format: "base-template-v1",
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
