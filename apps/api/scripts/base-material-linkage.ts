import type ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { cached } from "./inspect-ceo-catalog";
import { linearCost } from "./source-linear-cost";

const D = Prisma.Decimal.clone({ precision: 80 });
type Material = {
  name: string;
  unit: string;
  coefficient: string;
  unitPrice: string | null;
  cells: string[];
  priceSourceKey: string | null;
};
export type MaterialLinkage = ReturnType<typeof inspectMaterialLinkage>;
/** Economic and physical proofs are independent. Cached totals are evidence,
 * never a balancing target. This reader evaluates no macros or external links. */
export function inspectMaterialLinkage(
  book: ExcelJS.Workbook,
  activity: {
    key: string;
    name: string;
    direct: string | null;
    materialComposition: { materials: Material[]; warnings: string[] };
  },
  prices: Record<string, unknown>[],
) {
  const physical = activity.materialComposition;
  const issues = [...physical.warnings];
  const leaves = new Map(
    physical.materials.map((m) => [m.cells[0], m.cells[0]]),
  );
  const economic = linearCost(
    book,
    "COSTO",
    `E${activity.key.match(/\d+$/)![0]}`,
    leaves,
    { sumBlanks: true, cachedDimensions: true },
  );
  const expected = new Map<string, Prisma.Decimal>();
  for (const m of physical.materials)
    expected.set(
      m.cells[0],
      (expected.get(m.cells[0]) ?? new D(0)).add(m.coefficient),
    );
  if (
    physical.materials.length &&
    (economic.issue ||
      economic.constant !== "0" ||
      economic.components.length !== expected.size ||
      economic.components.some(
        (c) => !expected.get(c.sourceKey)?.eq(c.coefficient),
      ))
  ) {
    issues.push(
      economic.issue ??
        "El alcance económico no coincide con el consumo físico: factor, amortización o constante independiente sin desglose.",
    );
  }
  const priceLeaves = new Map(
    prices.flatMap((p) =>
      ["E", "F", "G"].map((c) => [
        `PRECIOS!${c}${String(p.key).match(/\d+$/)![0]}`,
        `${p.key}:${c}`,
      ]),
    ),
  );
  const materials = physical.materials.map((m) => {
    const at = m.cells[0].lastIndexOf("!");
    const sheet = m.cells[0].slice(0, at),
      address = m.cells[0].slice(at + 1);
    const chain = linearCost(book, sheet, address, priceLeaves, {
      sumBlanks: true,
      exact: true,
    });
    const term =
      !chain.issue && chain.constant === "0" && chain.components.length === 1
        ? chain.components[0]
        : null;
    const identity = term
      ? term.sourceKey.replace(/:[EFG]$/, "")
      : m.priceSourceKey;
    const column = term?.sourceKey.slice(-1) ?? "G";
    const p = prices.find((p) => p.key === identity);
    const evidence = [...chain.evidence];
    let quote: null | {
      key: string;
      value: string;
      baseQuantity: string;
      factor: string;
      taxBasis: "INCLUDED" | "EXCLUDED" | "UNSPECIFIED";
      source: string;
      date: string | null;
      datePrecision: string;
      evidence: string[];
    } = null;
    if (p) {
      const row = String(p.key).match(/\d+$/)![0];
      const priceCell = book.getWorksheet("PRECIOS")!.getCell(`G${row}`);
      const formula = (priceCell.formula ?? "")
        .replace(/^\+/, "")
        .replaceAll("$", "");
      const quantity = p.presentationQuantity as string | null;
      const unit = String(p.unit);
      const name = String(p.name);
      const sand =
        unit === "BOLSON" &&
        m.unit === "m³" &&
        /1 BOLSON\s*=\s*1m3/i.test(name) &&
        quantity === "1";
      const panel =
        unit === "un" &&
        m.unit === "m²" &&
        /1000X1000X\d+MM/i.test(name) &&
        quantity === "1";
      const service =
        /^(?:VOLQUETE\b|BAÑO QUIMICO\b|BOMBEO\b)|ALQUILER|MONTAJE|LIMPIEZA|TRANSPORTE|BOMBA|MANO DE OBRA/i.test(
          name,
        ) || /ALQUILERES DE HERRAMIENTAS/i.test(String(p.source));
      if (service) issues.push(`${p.key}: servicio, no insumo de stock.`);
      else if (unit !== m.unit && !sand && !panel)
        issues.push(
          `${m.cells[0]}: unidad ${m.unit} distinta de ${p.key} (${unit}); equivalencia ausente.`,
        );
      else if (
        !quantity ||
        new D(quantity).lte(0) ||
        (column === "E" ? p.net : p.gross) === null
      )
        issues.push(
          `${p.key}: importe ${column === "E" ? "E" : "F"} o presentación B ausente; el valor conocido de receta se conserva como histórico.`,
        );
      else if (
        column === "G" &&
        formula !== `F${row}/B${row}` &&
        !(quantity === "1" && formula === `F${row}`)
      )
        issues.push(
          `${p.key}: G no demuestra normalización F/B; fórmula ${formula || "sin fórmula"}.`,
        );
      else if (!term || new D(term.coefficient).lte(0))
        issues.push(
          `${m.cells[0]}: referencia de receta no equivale a un precio unitario de PRECIOS.`,
        );
      else {
        if (sand || panel)
          evidence.push(
            `${p.key}: ${sand ? "1 bolsón = 1 m³" : "placa 1000×1000 mm = 1 m²"} explícito`,
          );
        const factor = new D(term.coefficient)
          .mul(column === "G" ? "1" : quantity)
          .toDecimalPlaces(8)
          .toFixed();
        // A presentation division must be exactly the documented B. An
        // additional scalar in G is an economic factor, never physical yield
        // and never inferred to be a tax rate.
        quote = {
          key: String(p.key) + (column === "E" ? ":EXCLUDED" : ""),
          value: String(column === "E" ? p.net : p.gross),
          baseQuantity: quantity,
          factor,
          taxBasis: column === "E" ? "EXCLUDED" : "INCLUDED",
          source: String(p.source),
          date: p.date as string | null,
          datePrecision: String(p.datePrecision),
          evidence: [
            ...evidence,
            `PRECIOS!B${row}:${column}${row}`,
            ...(factor !== "1"
              ? [
                  `${m.cells[0]}: factor económico explícito ${factor}; no modifica consumos ni se clasifica como IVA`,
                ]
              : []),
          ],
        };
      }
    } else {
      const cell = book.getWorksheet(sheet)!.getCell(address);
      const value = cached(cell.value);
      if (
        !chain.issue &&
        chain.components.length === 0 &&
        chain.constant !== null &&
        new D(chain.constant).gte(0) &&
        typeof value === "number"
      ) {
        quote = {
          key: m.cells[0],
          value: new D(chain.constant).toDecimalPlaces(8).toFixed(),
          baseQuantity: "1",
          factor: "1",
          taxBasis: "UNSPECIFIED",
          source: `Receta BASE · ${m.cells[0]}`,
          date: null,
          datePrecision: "UNKNOWN",
          evidence: [...chain.evidence],
        };
      } else
        issues.push(
          `${m.cells[0]}: ${chain.issue ?? "identidad de precio no recuperada"}; importe histórico ${m.unitPrice === null ? "ausente" : "conocido"}, sin inventar referencia.`,
        );
    }
    return { ...m, priceSourceKey: identity, quote };
  });
  const reconstructed = materials.every((m) => m.quote)
    ? materials
        .reduce(
          (s, m) =>
            s.add(
              new D(m.coefficient).mul(
                new D(m.quote!.value)
                  .div(m.quote!.baseQuantity)
                  .mul(m.quote!.factor)
                  .toDecimalPlaces(8),
              ),
            ),
          new D(0),
        )
        .toDecimalPlaces(8)
        .toFixed()
    : null;
  if (physical.materials.length && activity.direct === null)
    issues.push(
      `${activity.key}: agregado original ausente; no se inventa un costo completo.`,
    );
  const direct =
    activity.direct !== null &&
    (materials.length === 0 ||
      materials.every(
        (m) => m.priceSourceKey && /servicio, no insumo/.test(issues.join(";")),
      )) &&
    (/BAÑO|OBRADOR|MOVILIDAD|SEGURO|HIGIENE|SEGURIDAD|COLOCACION DE MENSULAS/i.test(
      activity.name,
    ) ||
      new D(activity.direct).isZero());
  const unique = [...new Set(issues)];
  const eligible =
    physical.materials.length > 0 &&
    !unique.length &&
    reconstructed !== null &&
    activity.direct !== null;
  return {
    version: 1 as const,
    classification: eligible
      ? ("B" as const)
      : direct
        ? ("A" as const)
        : ("C" as const),
    physicalComplete:
      !physical.warnings.length && physical.materials.length > 0,
    economicComplete: eligible,
    originalAggregate: activity.direct,
    reconstructed,
    difference:
      reconstructed !== null && activity.direct !== null
        ? new D(reconstructed).sub(activity.direct).toFixed()
        : null,
    reconciliation: eligible
      ? "Misma expresión lineal y consumos; normalización F/B una sola vez a 8 decimales. Diferencia de cachés conservada, sin residuo ni tolerancia."
      : null,
    evidence: economic.evidence,
    issues:
      eligible || direct
        ? []
        : unique.length
          ? unique
          : [
              `${activity.key}: suministro sin composición verificable; importe ${activity.direct === null ? "ausente" : "histórico conocido"}.`,
            ],
    materials,
  };
}
