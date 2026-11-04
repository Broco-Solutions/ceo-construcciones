/** Private source inventory. Reads cached XML values and formulas; executes no Excel code. */
import ExcelJS from "exceljs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  sourceUnit,
  extractComposition,
  type SourceSheet,
} from "./historical-composition";
import { linearCost } from "./source-linear-cost";
import { inspectMaterialLinkage } from './base-material-linkage';

export function cached(value: ExcelJS.CellValue): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object") {
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("result" in value) return cached(value.result as ExcelJS.CellValue);
  }
  return null;
}
const decimal = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0
    ? new Prisma.Decimal(String(v)).toDecimalPlaces(8).toFixed()
    : null;

export async function inspectCeoCatalog(path: string) {
  const bytes = await readFile(path);
  if (bytes.length > 3_000_000) throw Error("Fuente fuera del límite de 3 MB");
  const sourceSha256 = createHash("sha256").update(bytes).digest("hex");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    bytes as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  for (const name of ["COSTO", "PRECIOS", "MO real "])
    if (!book.getWorksheet(name)) throw Error(`Falta hoja exacta ${name}`);
  const inventory = book.worksheets.flatMap((sheet) => {
    if (sheet.rowCount > 2000 || sheet.columnCount > 100)
      throw Error("Hoja fuera de límites");
    const records: {
      sheet: string;
      row: number;
      cells: {
        address: string;
        value: string | number | null;
        formula: string | null;
        original: unknown;
      }[];
    }[] = [];
    sheet.eachRow((row) => {
      const cells: (typeof records)[number]["cells"] = [];
      row.eachCell((cell) => {
        if (cell.value !== null)
          cells.push({
            address: cell.address,
            value: cached(cell.value),
            formula: cell.formula ?? null,
            original: cell.value,
          });
      });
      if (cells.length)
        records.push({ sheet: sheet.name, row: row.number, cells });
    });
    return records;
  });
  const prices: Record<string, unknown>[] = [],
    labor: Record<string, unknown>[] = [],
    activities: Record<string, unknown>[] = [],
    excluded: Record<string, unknown>[] = [];
  const sheet = book.getWorksheet("PRECIOS")!;
  let source = "",
    category = "",
    sourceScope: "SUPPLIER" | "CATEGORY" = "SUPPLIER";
  sheet.eachRow((row) => {
    const name = String(cached(row.getCell(1).value) ?? "").trim();
    if (!name) {
      excluded.push({
        key: `PRECIOS!${row.number}`,
        reason: "Fila sin descripción de producto",
        cells: row.values,
      });
      return;
    }
    const unitRaw =
      cached(row.getCell(3).value) ?? cached(row.getCell(4).value);
    if (typeof unitRaw !== "string" || !unitRaw.trim()) {
      if (/\d{4}/.test(name)) {
        source = name;
        sourceScope = "SUPPLIER";
      } else {
        category = name;
        if (/\d{2}-\d{2}-\d{2}/.test(name)) {
          source = name;
          sourceScope = "CATEGORY";
        } else if (sourceScope === "CATEGORY") source = name;
      }
      excluded.push({
        key: `PRECIOS!A${row.number}`,
        reason: "Encabezado/fuente, no producto",
        value: name,
      });
      return;
    }
    const quantity = decimal(cached(row.getCell(2).value));
    const gross = decimal(cached(row.getCell(6).value));
    const net = decimal(cached(row.getCell(5).value));
    const normalized = decimal(cached(row.getCell(7).value));
    const issues: string[] = [];
    const observations: string[] = [];
    if (!quantity || new Prisma.Decimal(quantity).isZero())
      issues.push(`PRECIOS!B${row.number}: presentación sin cantidad positiva`);
    if (gross === null && net === null)
      issues.push(
        `PRECIOS!E${row.number}:F${row.number}: precio ausente o error`,
      );
    if (
      gross !== null &&
      quantity &&
      normalized !== null &&
      !new Prisma.Decimal(gross)
        .div(quantity)
        .toDecimalPlaces(8)
        .eq(new Prisma.Decimal(normalized))
    ) {
      const formula = row.getCell(7).formula ?? "";
      // The formula is evidence of the presentation, the cached rounded result
      // is not a second authoritative quote. Never infer a conversion otherwise.
      const presentationFormula = new RegExp(
        `^\\+?F\\$?${row.number}/B\\$?${row.number}$`,
      );
      (presentationFormula.test(formula) ? observations : issues).push(
        presentationFormula.test(formula)
          ? `PRECIOS!G${row.number}: caché redondeada; normalización exacta de la presentación por fórmula ${formula}`
          : `PRECIOS!G${row.number}: normalización cacheada difiere de F/B; requiere revisión`,
      );
    }
    const date = source.match(
      /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/i,
    );
    const months = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];
    const day = source.match(/\b(\d{2})-(\d{2})-(\d{2})\b/);
    prices.push({
      key: `PRECIOS!A${row.number}`,
      name,
      category,
      source,
      unit: sourceUnit(unitRaw),
      presentationQuantity: quantity,
      net,
      gross,
      normalized,
      date: date
        ? `${date[2]}-${String(months.indexOf(date[1].toUpperCase()) + 1).padStart(2, "0")}`
        : day
          ? `20${day[3]}-${day[2]}-${day[1]}`
          : null,
      datePrecision: date ? "MONTH" : day ? "DAY" : "UNKNOWN",
      status: issues.length ? "INCOMPLETE" : "HISTORICAL",
      issues,
      observations,
      evidence: `PRECIOS!A${row.number}:G${row.number}`,
    });
  });
  const mo = book.getWorksheet("MO real ")!;
  const categoryHeader = mo.getRow(6).values.toString();
  const categoryDate = categoryHeader.match(
    /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/i,
  );
  const categoryMonth = categoryDate
    ? `${categoryDate[2]}-${String(["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"].indexOf(categoryDate[1].toUpperCase()) + 1).padStart(2, "0")}`
    : null;
  const categoryLabel = categoryDate
    ? categoryDate[1][0].toUpperCase() +
      categoryDate[1].slice(1).toLowerCase() +
      " " +
      categoryDate[2]
    : "fecha no informada";
  for (let row = 9; row <= 13; row++)
    for (const [column, unit] of [
      [3, "día"],
      [4, "h"],
    ] as const)
      labor.push({
        key: `MO real !${column === 3 ? "C" : "D"}${row}`,
        name: String(cached(mo.getCell(row, 1).value)).trim(),
        unit,
        kind: "CATEGORY",
        value: decimal(cached(mo.getCell(row, column).value)),
        source: `MO real · ${categoryLabel}; valor calculado de origen, sin liquidación de aportes`,
        date: categoryMonth,
        datePrecision: categoryMonth ? "MONTH" : "UNKNOWN",
        taxBasis: "UNSPECIFIED",
        evidence: `MO real !A${row}:${column === 3 ? "C" : "D"}${row}`,
      });
  let block = "",
    origin = "";
  mo.eachRow((row) => {
    const h = cached(row.getCell(8).value),
      u = cached(row.getCell(9).value),
      g = cached(row.getCell(7).value);
    if (typeof g === "string" && g !== "ITEM") block = g;
    if (
      typeof h !== "string" ||
      typeof u !== "string" ||
      h === "DESCRIPCION" ||
      h === "TOTAL"
    )
      return;
    if (h === u) {
      origin = h;
      return;
    }
    if (!h.trim() || !u.trim()) return;
    const combined =
      /MATERIAL Y MO/.test(
        String(cached(mo.getCell(row.number - 3, 11).value)),
      ) ||
      row.number === 113 ||
      row.number === 114;
    labor.push({
      key: `MO real !K${row.number}`,
      name: h.trim(),
      unit: sourceUnit(u),
      kind: combined ? "COMBINED_SERVICE" : "SERVICE",
      value: combined ? null : decimal(cached(row.getCell(11).value)),
      materialValue: decimal(cached(row.getCell(10).value)),
      source: `${block} · ${origin}`,
      date: null,
      datePrecision: "UNKNOWN",
      taxBasis: "UNSPECIFIED",
      evidence: `MO real !H${row.number}:K${row.number}`,
      status: combined
        ? "INCOMPLETE"
        : decimal(cached(row.getCell(11).value)) === null
          ? "INCOMPLETE"
          : "HISTORICAL",
    });
  });
  const cost = book.getWorksheet("COSTO")!;
  let group = "";
  let categoryKey = "";
  const categories: { key: string; name: string }[] = [];
  cost.eachRow((row) => {
    const name = cached(row.getCell(2).value),
      unit = cached(row.getCell(3).value);
    if (typeof name !== "string" || !name.trim()) return;
    if (typeof cached(row.getCell(1).value) === "number") {
      group = name.trim();
      categoryKey = `COSTO!A${row.number}`;
      categories.push({ key: categoryKey, name: group });
      return;
    }
    if (!group || typeof unit !== "string" || !unit.trim()) return;
    activities.push({
      key: `COSTO!B${row.number}`,
      name: name.trim(),
      categoryKey,
      category: group,
      unit: sourceUnit(unit),
      quantity: decimal(cached(row.getCell(4).value)),
      direct: decimal(cached(row.getCell(5).value)),
      labor: decimal(cached(row.getCell(6).value)),
      evidence: `COSTO!B${row.number}:F${row.number}`,
      directFormula: row.getCell(5).formula ?? null,
      laborFormula: row.getCell(6).formula ?? null,
    });
  });
  for (const entry of labor) {
    if (entry.date) continue;
    const months = [
      "ENERO",
      "FEBRERO",
      "MARZO",
      "ABRIL",
      "MAYO",
      "JUNIO",
      "JULIO",
      "AGOSTO",
      "SEPTIEMBRE",
      "OCTUBRE",
      "NOVIEMBRE",
      "DICIEMBRE",
    ];
    const match = String(entry.source)
      .toUpperCase()
      .match(
        /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)[ -]+(\d{4})/,
      );
    if (match) {
      entry.date =
        match[2] + "-" + String(months.indexOf(match[1]) + 1).padStart(2, "0");
      entry.datePrecision = "MONTH";
    }
  }
  const leaves = new Map(
    labor
      .filter((l) => l.kind !== "COMBINED_SERVICE")
      .map((l) => [String(l.key), String(l.key)]),
  );
  for (let i = 0; i < 5; i++) {
    leaves.set(`MO real !I${i + 4}`, `MO real !C${i + 9}`);
    leaves.set(`MO real !K${i + 4}`, `MO real !D${i + 9}`);
  }
  const sourceSheets: SourceSheet[] = book.worksheets.map((w) => ({
    name: w.name,
    rows: Array.from({ length: w.rowCount }, (_, i) =>
      Array.from(
        { length: w.columnCount },
        (_, j) => cached(w.getCell(i + 1, j + 1).value) ?? "",
      ),
    ),
    formulas: inventory
      .filter((r) => r.sheet === w.name)
      .flatMap((r) =>
        r.cells
          .filter((c) => c.formula)
          .map((c) => ({
            row: r.row,
            column: Number(w.getCell(c.address).col),
            text: c.formula,
          })),
      ),
  }));
  for (const activity of activities) {
    const row = Number(String(activity.key).match(/\d+$/)![0]);
    const mo = linearCost(book, "COSTO", `F${row}`, leaves);
    const recovered = mo.components.reduce((total, c) => {
      const rate = labor.find((l) => l.key === c.sourceKey)?.value;
      return rate === null || rate === undefined
        ? total
        : total.add(new Prisma.Decimal(String(rate)).mul(c.coefficient));
    }, new Prisma.Decimal(0));
    const reconciled =
      !mo.issue &&
      mo.constant === "0" &&
      mo.components.length > 0 &&
      activity.labor !== null &&
      recovered.toDecimalPlaces(8).eq(String(activity.labor));
    activity.laborComposition = {
      ...mo,
      reconciled,
      mode: reconciled ? "CALCULATED" : "DIRECT",
    };
    const composition = extractComposition(sourceSheets, "COSTO", row);
    activity.materialComposition = {
      ...composition,
      materials: composition.materials.map((m) => {
        const ref = m.cells.flatMap((key) => {
          const direct = key.match(/^PRECIOS!\$?G\$?(\d+)$/);
          if (direct) return [`PRECIOS!A${direct[1]}`];
          const split = key.lastIndexOf("!"),
            s = book.getWorksheet(key.slice(0, split));
          const formula = s?.getCell(key.slice(split + 1)).formula;
          const price = formula?.match(/^\+?PRECIOS!\$?G\$?(\d+)$/);
          return price ? [`PRECIOS!A${price[1]}`] : [];
        });
        const unique = [...new Set(ref)];
        return { ...m, priceSourceKey: unique.length === 1 ? unique[0] : null };
      }),
    };
    const exact = extractComposition(sourceSheets, 'COSTO', row, 5, true);
    activity.materialLinkage = inspectMaterialLinkage(book, { key: String(activity.key), name: String(activity.name), direct: activity.direct as string | null, materialComposition: {
      ...exact, materials: exact.materials.map(m => ({ ...m, coefficient: new Prisma.Decimal(m.coefficient).toDecimalPlaces(8).toFixed(), priceSourceKey: null }))
    } }, prices);
  }
  return {
    format: "ceo-catalog-inventory-v1",
    extractorVersion: 1,
    sourceSha256,
    categories,
    activities,
    prices,
    labor,
    excluded,
    inventory,
  };
}
if (process.argv[1]?.endsWith("inspect-ceo-catalog.ts")) {
  const [path, output] = process.argv.slice(2);
  if (!path || !output)
    throw Error(
      "Uso: inspect-ceo-catalog.ts BASE.xlsx manifiesto-privado.json",
    );
  inspectCeoCatalog(path)
    .then(async (result) => {
      await writeFile(output, JSON.stringify(result, null, 2), { mode: 0o600 });
      console.log(
        JSON.stringify({
          hash: result.sourceSha256,
          categories: result.categories.length,
          activities: result.activities.length,
          prices: result.prices.length,
          labor: result.labor.length,
          excluded: result.excluded.length,
        }),
      );
    })
    .catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
}
