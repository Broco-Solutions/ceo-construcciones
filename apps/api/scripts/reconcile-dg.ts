/** Source-led reconciliation, no DB access and no expected-total literal. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  calculateCommercial,
  editorContentSchema,
  type EditorContent,
} from "../src/modules/commercial-domain";
import { extractComposition } from "./historical-composition";
import { commercialPdf } from "../src/modules/commercial-pdf";

type Sheet = {
  name: string;
  rows: unknown[][];
  formulas?: { row: number; column: number; text: string | null }[];
};
const D = Prisma.Decimal.clone({ precision: 80 });
const numeric = (v: unknown): string | null =>
  typeof v === "number" && Number.isFinite(v)
    ? new D(v).toDecimalPlaces(8, D.ROUND_HALF_UP).toFixed()
    : null;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const canonical = (v: string) => v.trim().toUpperCase().replace(/\s+/g, " ");
const unit = (v: string) =>
  ({
    ML: "m",
    M2: "m²",
    M3: "m³",
    U: "un",
    UN: "un",
    GL: "gl",
    KG: "kg",
    LTS: "L",
  })[canonical(v).replace(/^\//, "")] ?? v.trim();
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output)
    throw Error("Uso: reconcile-dg.ts dg-normalized.json directorio-nuevo");
  const bytes = await readFile(input);
  if (bytes.length > 5_000_000) throw Error("JSON de fuente excesivo");
  const source = JSON.parse(bytes.toString()) as {
    format: string;
    sha256: string;
    sheets: Sheet[];
  };
  if (
    source.format !== "cached-biff-v1" ||
    !/^[a-f0-9]{64}$/.test(source.sha256)
  )
    throw Error("Fuente BIFF normalizada inválida");
  const sheet = source.sheets.find((s) => s.name === "PRESUPUESTO REV C");
  if (!sheet) throw Error("Falta revisión C");
  const content: EditorContent = {
    currency: "ARS",
    taxBasis: "EXCLUDED",
    markup: "0",
    conditions:
      "Referencia de precios: JUNIO 2026. Condiciones históricas a cotejar con PDF REV C.",
    exclusions:
      "Las partidas sin cantidad no se incorporan al precio. Ver exclusiones del PDF fuente.",
    observations:
      "Reconciliación de la revisión C; no sustituye el documento comercial original.",
    deadline: "16 meses",
    lines: [],
  };
  let category = "",
    categoryNo = 0,
    sourceCost = new D(0),
    sourceSale = new D(0),
    sourceCategoryTotal = new D(0);
  const details: Record<string, unknown>[] = [],
    unresolved: Record<string, unknown>[] = [],
    classifications: Record<string, unknown>[] = [];
  const percent = (cost: string, sale: string) =>
    new D(cost).isZero()
      ? "0"
      : new D(sale)
          .div(cost)
          .sub(1)
          .mul(100)
          .toDecimalPlaces(8, D.ROUND_HALF_UP)
          .toFixed();
  const sourceMarkup = (
    row: number,
    column: number,
    cost: string,
    sale: string,
  ) => {
    if (new D(cost).isZero()) return "0";
    const expression = sheet.formulas?.find(
      (f) => f.row === row && f.column === column,
    )?.text;
    const literal = expression?.match(/^(\d+(?:\.\d+)?)\*[EF]\d+$/);
    const reference = expression?.match(/^\$([A-Z])\$(\d+)\*[EF]\d+$/);
    const factor =
      literal?.[1] ??
      (reference
        ? numeric(
            sheet.rows[Number(reference[2]) - 1]?.[
              reference[1].charCodeAt(0) - 65
            ],
          )
        : null);
    return factor
      ? new D(factor).sub(1).mul(100).toFixed()
      : percent(cost, sale);
  };
  for (let index = 10; index < sheet.rows.length; index++) {
    const r = sheet.rows[index];
    if (typeof r[0] === "number" && text(r[1])) {
      category = text(r[1]);
      categoryNo = Number(r[0]);
      if (numeric(r[16]) !== null)
        sourceCategoryTotal = sourceCategoryTotal.add(numeric(r[16])!);
      continue;
    }
    const quantity = numeric(r[3]);
    if (
      category &&
      quantity === null &&
      text(r[2]) &&
      /\bINCLUID[OA]\b/i.test(text(r[1]))
    ) {
      const u = unit(text(r[2]));
      content.lines.push({
        key: `DG:C:${index + 1}`,
        itemId: null,
        code: `C:${index + 1}`,
        name: text(r[1]),
        categoryId: `category:${categoryNo}`,
        category,
        unitId: `unit:${u}`,
        unit: u,
        quantity: null,
        laborUnitCost: "0",
        directUnitCost: "0",
        status: "INCLUDED",
        materials: [],
      });
      details.push({
        sourceRow: index + 1,
        name: text(r[1]),
        status: "INCLUDED",
        quantity: null,
      });
      continue;
    }
    if (
      !category ||
      !quantity ||
      new D(quantity).lte(0) ||
      !text(r[2]) ||
      !text(r[1])
    )
      continue;
    const materialCost = numeric(r[4]) ?? "0",
      laborCost = numeric(r[5]) ?? "0",
      materialSale = numeric(r[11]) ?? "0",
      laborSale = numeric(r[12]) ?? "0",
      name = text(r[1]),
      u = unit(text(r[2]));
    sourceCost = sourceCost.add(
      new D(materialCost).add(laborCost).mul(quantity),
    );
    sourceSale = sourceSale.add(
      new D(materialSale).add(laborSale).mul(quantity),
    );
    const formula =
      sheet.formulas?.find((f) => f.row === index + 1 && f.column === 5)
        ?.text ?? null;
    const extracted = extractComposition(source.sheets, sheet.name, index + 1);
    // Explicit rental/transport services are direct costs, not guessed supplies.
    const legitimateDirect = /^(OBRADOR Y MOVILIDAD|BAÑO QUIMICO)$/.test(
      canonical(name),
    );
    const physicalWarnings = extracted.warnings;
    const classification = legitimateDirect
      ? "A"
      : extracted.materials.length && !physicalWarnings.length
        ? "B"
        : "C";
    const grouped: EditorContent["lines"][number]["materials"] =
      legitimateDirect
        ? []
        : extracted.materials.map((m) => ({
            materialId: `source:${createHash("sha256")
              .update(JSON.stringify([m.name, m.unit]))
              .digest("hex")}`,
            name: m.name,
            unitId: `unit:${m.unit}`,
            unit: m.unit,
            coefficient: m.coefficient,
            unitPrice: m.unitPrice,
            sourcePriceId: null,
          }));
    if (new D(materialCost).gt(0))
      classifications.push({
        row: index + 1,
        name,
        classification,
        sourceCell: `${sheet.name}!E${index + 1}`,
        formula,
        materials: legitimateDirect ? [] : extracted.materials,
        warnings: legitimateDirect ? [] : physicalWarnings,
        missingPrices: legitimateDirect ? [] : extracted.missingPrices,
        cells: extracted.cells,
        reason: legitimateDirect
          ? "Servicio de alquiler/limpieza o movilidad explícito; sin cantidades de suministro que deducir"
          : classification === "B"
            ? "Composición física recuperada de referencias y consumos explícitos, sin depender de importe agregado"
            : physicalWarnings.join("; ") ||
              "Importe agregado sin cantidades/unidades verificables",
      });
    const direct =
      categoryNo === 16
        ? new D(materialCost).add(laborCost).toFixed()
        : materialCost;
    const line: EditorContent["lines"][number] = {
      key: `DG:C:${index + 1}`,
      itemId: null,
      code: `C:${index + 1}`,
      name,
      categoryId: `category:${categoryNo}`,
      category,
      unitId: `unit:${u}`,
      unit: u,
      quantity,
      laborUnitCost: categoryNo === 16 ? "0" : laborCost,
      directUnitCost: direct,
      status: "ACTIVE",
      materials: grouped,
      materialsIncludedInDirect: grouped.length > 0,
      materialReview: {
        status:
          classification === "A" || new D(materialCost).isZero()
            ? "DIRECT"
            : classification === "B"
              ? "VERIFIED"
              : "UNRESOLVED",
        detail:
          classification === "C"
            ? physicalWarnings.join("; ") ||
              "Importe agregado sin composición física verificable"
            : classification === "A"
              ? "Servicio directo sin materiales previstos"
              : "Consumos físicos recuperados; costo histórico agregado independiente de sus precios de referencia",
        evidence: `${sheet.name}!E${index + 1}; ${extracted.cells.slice(0, 15).join(", ")}`,
      },
    };
    if (categoryNo === 16)
      line.directMarkup = sourceMarkup(
        index + 1,
        13,
        direct,
        new D(materialSale).add(laborSale).toFixed(),
      );
    else {
      line.laborMarkup = sourceMarkup(index + 1, 13, laborCost, laborSale);
      line.directMarkup = sourceMarkup(
        index + 1,
        12,
        materialCost,
        materialSale,
      );
    }
    if (
      new D(materialCost).isZero() &&
      new D(laborCost).isZero() &&
      new D(materialSale).isZero() &&
      new D(laborSale).isZero()
    ) {
      line.status = "INCLUDED";
      unresolved.push({
        row: index + 1,
        name,
        message:
          "Cantidad sin costo/precio independiente en la fuente; tratada como incluida, no como precio cero inventado.",
      });
    }
    if (classification === "C" && new D(materialCost).gt(0))
      unresolved.push({
        row: index + 1,
        name,
        message: line.materialReview!.detail,
      });
    content.lines.push(line);
    details.push({
      sourceRow: index + 1,
      name,
      quantity,
      materialCost,
      laborCost,
      materialSale,
      laborSale,
      physicalComposition: classification,
      sourceCells: extracted.cells,
      missingPrices: extracted.missingPrices,
    });
  }
  content.materialDemandIncomplete = unresolved.length > 0;
  const parsed = editorContentSchema.parse(content),
    calculation = calculateCommercial(parsed);
  if (!calculation.complete) throw Error(JSON.stringify(calculation.issues));
  const totalRow = sheet.rows.find((r) => text(r[3]) === "TOTAL");
  if (!totalRow) throw Error("Falta fila TOTAL de la fuente");
  const sourcePublished = numeric(totalRow[15]) ?? numeric(totalRow[16]);
  const rowDifferences = calculation.lines.map((l) => {
    const row = Number(l.sourceLineId.split(":").pop()),
      r = sheet.rows[row - 1];
    const sourceUnit = new D(numeric(r[11]) ?? "0").add(numeric(r[12]) ?? "0"),
      unroundedApplication = new D(l.sellingUnitPrice).mul(l.quantity);
    return {
      row,
      sourceCell: `${sheet.name}!L${row}:M${row}`,
      quantity: l.quantity,
      sourceUnit: sourceUnit.toFixed(),
      applicationUnit: l.sellingUnitPrice,
      sourceExtended: sourceUnit.mul(l.quantity).toFixed(),
      applicationExtended: l.sellingAmount,
      unitPolicyDifference: new D(l.sellingUnitPrice)
        .sub(sourceUnit)
        .mul(l.quantity)
        .toFixed(),
      lineRoundingDifference: new D(l.sellingAmount)
        .sub(unroundedApplication)
        .toFixed(),
    };
  });
  const report = {
    sourceSha256: source.sha256,
    revision: sheet.name,
    sourcePriceDate: "JUNIO 2026 (PDF fuente)",
    activities: parsed.lines.length,
    sourceCost: sourceCost.toFixed(8),
    sourceSaleFromUnitInputs: sourceSale.toFixed(8),
    sourceCategoryTotal: sourceCategoryTotal.toFixed(2),
    sourcePublished,
    applicationCost: calculation.totalCost,
    applicationSale: calculation.commercialTotal,
    costDifference: new D(calculation.totalCost).sub(sourceCost).toFixed(8),
    saleDifference: new D(calculation.commercialTotal)
      .sub(sourceSale)
      .toFixed(8),
    identifiedMaterialRows: calculation.materials.length,
    verifiedCompositions: parsed.lines.filter(
      (l) => l.materialReview?.status === "VERIFIED",
    ).length,
    unresolved,
    classifications,
    rowDifferences,
    classificationCounts: Object.fromEntries(
      ["A", "B", "C"].map((c) => [
        c,
        classifications.filter((x) => x.classification === c).length,
      ]),
    ),
    previousReview: process.argv[4]
      ? await (async () => {
          const previous = JSON.parse(await readFile(process.argv[4], "utf8"));
          const rows = new Set(
            previous.unresolved.map((x: { row: number }) => x.row),
          );
          const reviewed = classifications.filter((x) => rows.has(x.row));
          return {
            cases: reviewed,
            counts: Object.fromEntries(
              ["A", "B", "C"].map((c) => [
                c,
                reviewed.filter((x) => x.classification === c).length,
              ]),
            ),
          };
        })()
      : null,
    explanation:
      "Se conservan costos agregados históricos E/F de REV C y factores comerciales recuperados de las fórmulas BIFF, sin ejecutarlas. La composición física se recupera mediante referencias explícitas, sumas y conversiones documentadas; la ausencia de código en encabezados o marcador x no descarta un material. Reutilización de encofrado y factores de subtotal sin regla física se señalan como ambiguos, no se inventan rendimientos. Los materiales quedan expresamente incluidos en el costo directo agregado, sin doble suma ni precios cero ficticios. No se usa tolerancia de coincidencia ni ajuste para forzar totales.",
  };
  const withoutMarkup = calculateCommercial({
    ...parsed,
    markup: "50",
    lines: parsed.lines.map((l) => ({
      ...l,
      markup: undefined,
      materialMarkup: undefined,
      laborMarkup: undefined,
      directMarkup: undefined,
    })),
  });
  if (
    JSON.stringify(calculation.materials) !==
    JSON.stringify(withoutMarkup.materials)
  )
    throw Error("El recargo modificó la demanda");
  await mkdir(output, { recursive: false });
  for (const [name, value] of [
    ["normalized-input.json", parsed],
    ["reconciliation.json", report],
    ["source-lines.json", details],
    ["calculation.json", calculation],
  ] as const)
    await writeFile(
      resolve(output, name),
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx" },
    );
  const label = (row: number) =>
    text(sheet.rows[row]?.[0]).split(":").slice(1).join(":").trim();
  const date = label(5).match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (!date)
    throw Error("Fecha de fuente no reconocida; no se inventa una emisión.");
  const header = {
    name: "DG 1153 · Reconciliación REV C",
    client: { name: label(2), taxId: null, address: null },
    work: { name: label(3), address: label(4) },
    conditions: parsed.conditions,
    exclusions: parsed.exclusions,
    observations: parsed.observations,
    deadline: parsed.deadline,
    issuedAt: `20${date[3]}-${date[2]}-${date[1]}T12:00:00.000Z`,
    nonPricedLines: parsed.lines
      .filter((l) => l.status !== "ACTIVE")
      .map((l) => ({
        category: l.category,
        name: l.name,
        status: l.status as "INCLUDED" | "EXCLUDED",
      })),
  };
  await writeFile(
    resolve(output, "presupuesto-reconciliado.pdf"),
    await commercialPdf(calculation, header, "REV C · verificación histórica"),
    { flag: "wx" },
  );
  console.log(JSON.stringify({ ...report, unresolved: unresolved.length }));
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
