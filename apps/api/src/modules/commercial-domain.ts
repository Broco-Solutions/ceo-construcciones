import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calculateBudget, type SnapshotLine } from "./budgets";
import { ApiError } from "../core/errors";
import { currency, id, nonnegative, taxBasis } from "./shared";

const D = Prisma.Decimal.clone({ precision: 80 });
const label = z.string().trim().min(1).max(500);
const percent = nonnegative.refine(
  (v) => new D(v).lte(10000),
  "Porcentaje fuera de rango",
);
export const editorMaterialSchema = z
  .object({
    materialId: id,
    name: label,
    unitId: id,
    unit: label,
    coefficient: nonnegative.nullable(),
    unitPrice: nonnegative.nullable(),
    sourcePriceId: id.nullable(),
  })
  .strict();
export const editorLineSchema = z
  .object({
    key: id,
    itemId: id.nullable(),
    code: z.string().max(100).nullable(),
    name: label,
    categoryId: id,
    category: label,
    unitId: id,
    unit: label,
    quantity: nonnegative.nullable(),
    laborUnitCost: nonnegative.nullable(),
    directUnitCost: nonnegative.nullable(),
    status: z.enum(["ACTIVE", "INCLUDED", "EXCLUDED"]),
    materialsIncludedInDirect: z.boolean().optional(),
    materials: z.array(editorMaterialSchema).max(500),
    materialReview: z
      .object({
        status: z.enum(["DIRECT", "VERIFIED", "UNRESOLVED"]),
        detail: z.string().trim().min(1).max(2000),
        evidence: z.string().trim().max(2000),
      })
      .strict()
      .optional(),
    markup: percent.optional(),
    materialMarkup: percent.optional(),
    laborMarkup: percent.optional(),
    directMarkup: percent.optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.materialReview &&
      v.materialReview.status !== "UNRESOLVED" &&
      !v.materialReview.evidence
    )
      c.addIssue({
        code: "custom",
        path: ["materialReview", "evidence"],
        message:
          "Registrá la fuente que sustenta la composición o el costo directo.",
      });
    if (v.materialReview?.status === "DIRECT" && v.materials.length)
      c.addIssue({
        code: "custom",
        path: ["materialReview"],
        message:
          "Un concepto exclusivamente directo no produce materiales; documentá la composición física o retiralos explícitamente.",
      });
    if (
      v.materialReview?.status === "VERIFIED" &&
      (!v.materials.length || v.materials.some((m) => m.coefficient === null))
    )
      c.addIssue({
        code: "custom",
        path: ["materialReview"],
        message:
          "Una composición verificada requiere materiales y consumos explícitos.",
      });
    if (
      v.markup !== undefined &&
      [v.materialMarkup, v.laborMarkup, v.directMarkup].some(
        (x) => x !== undefined,
      )
    )
      c.addIssue({
        code: "custom",
        path: ["markup"],
        message:
          "El ajuste de partida reemplaza los ajustes por componente; elegí uno de los dos modos.",
      });
    if (
      new Set(v.materials.map((m) => m.materialId)).size !== v.materials.length
    )
      c.addIssue({
        code: "custom",
        path: ["materials"],
        message: "Material repetido",
      });
  });
export const editorContentSchema = z
  .object({
    currency,
    taxBasis,
    markup: percent,
    materialDemandIncomplete: z.boolean().optional(),
    conditions: z.string().max(12000),
    exclusions: z.string().max(12000),
    observations: z.string().max(12000),
    deadline: z.string().max(1000),
    lines: z.array(editorLineSchema).max(1000),
  })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.lines.map((l) => l.key)).size !== v.lines.length)
      c.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Renglón repetido",
      });
  });
export type EditorContent = z.infer<typeof editorContentSchema>;
export type EditorLine = EditorContent["lines"][number];

/** Optional quantity helper: bounded recursive descent, no JavaScript evaluation. */
export function quantityExpression(input: string): string {
  if (input.length > 200 || !/^[\d.,+*/()\s-]+$/.test(input))
    throw new ApiError(
      422,
      "INVALID_EXPRESSION",
      "Usá sólo números, paréntesis y + − × ÷.",
    );
  const normalized = input.replaceAll(",", ".");
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+*/-]/g) ?? [];
  if (tokens.join("") !== normalized.replace(/\s/g, ""))
    throw new ApiError(
      422,
      "INVALID_EXPRESSION",
      "La operación contiene un número inválido.",
    );
  let pos = 0,
    depth = 0;
  const atom = (): Prisma.Decimal => {
    if (++depth > 20) throw new Error();
    let n: Prisma.Decimal;
    const t = tokens[pos++];
    if (t === "(") {
      n = sum();
      if (tokens[pos++] !== ")") throw new Error();
    } else if (t === "-" || t === "+") n = atom().mul(t === "-" ? -1 : 1);
    else {
      if (!t || !/^\d+(\.\d+)?$/.test(t)) throw new Error();
      n = new D(t);
    }
    depth--;
    return n;
  };
  const product = (): Prisma.Decimal => {
    let n = atom();
    while (["*", "/"].includes(tokens[pos])) {
      const op = tokens[pos++],
        b = atom();
      if (op === "/" && b.isZero()) throw new Error();
      n = op === "*" ? n.mul(b) : n.div(b);
    }
    return n;
  };
  const sum = (): Prisma.Decimal => {
    let n = product();
    while (["+", "-"].includes(tokens[pos])) {
      const op = tokens[pos++],
        b = product();
      n = op === "+" ? n.add(b) : n.sub(b);
    }
    return n;
  };
  try {
    const n = sum();
    if (
      pos !== tokens.length ||
      !n.isFinite() ||
      n.lt(0) ||
      n.gte("10000000000000000")
    )
      throw new Error();
    return n.toDecimalPlaces(8, D.ROUND_HALF_UP).toFixed();
  } catch {
    throw new ApiError(
      422,
      "INVALID_EXPRESSION",
      "La operación no produce una cantidad válida.",
    );
  }
}

export function calculateCommercial(content: EditorContent) {
  const issues: { lineKey: string; message: string }[] = [];
  // Unit valuation is independent from whether a row participates in totals.
  const unitCosts = content.lines.map((l) => {
    const missingCosts: string[] = [];
    if (l.laborUnitCost === null) missingCosts.push("Mano de obra");
    if (l.directUnitCost === null) missingCosts.push("Otros costos directos");
    let materialUnitCost = new D(0);
    for (const m of l.materials) {
      if (m.coefficient === null) missingCosts.push(`${m.name}: consumo`);
      else if (!new D(m.coefficient).isZero()) {
        if (m.unitPrice === null && !l.materialsIncludedInDirect)
          missingCosts.push(`${m.name}: precio`);
        else if (!l.materialsIncludedInDirect)
          materialUnitCost = materialUnitCost.add(
            new D(m.coefficient).mul(m.unitPrice!),
          );
      }
    }
    return {
      lineKey: l.key,
      totalUnitCost: missingCosts.length
        ? null
        : materialUnitCost
            .add(l.laborUnitCost!)
            .add(l.directUnitCost!)
            .toFixed(),
      missingCosts,
      quantityPending: l.quantity === null,
      zeroQuantity: l.quantity !== null && new D(l.quantity).isZero(),
    };
  });
  const ready = content.lines.filter((l, i) => {
    if (l.status !== "ACTIVE") return false;
    if (l.quantity !== null && new D(l.quantity).isZero()) return false;
    if (l.quantity === null || unitCosts[i].missingCosts.length) {
      issues.push({
        lineKey: l.key,
        message: `${l.name}: ${[...(l.quantity === null ? ["Cantidad pendiente"] : []), ...unitCosts[i].missingCosts].join("; ")}. Cero debe ser informado explícitamente.`,
      });
      return false;
    }
    return true;
  });
  const base = calculateBudget({
    currency: content.currency,
    taxBasis: content.taxBasis,
    precision: 2,
    roundingMode: "HALF_UP",
    lines: ready.map((l) => ({
      sourceLineId: l.key,
      itemId: l.itemId ?? l.key,
      code: l.code,
      name: l.name,
      categoryId: l.categoryId,
      category: l.category,
      unitId: l.unitId,
      unit: l.unit,
      quantity: l.quantity!,
      laborUnitCost: l.laborUnitCost!,
      materials: l.materials
        .filter((m) => m.coefficient !== null && !new D(m.coefficient).isZero())
        .map((m) => ({
          ...m,
          unitPrice: l.materialsIncludedInDirect ? "0" : m.unitPrice!,
        })) as SnapshotLine["materials"],
    })),
  });
  const factor = (p: string) => new D(1).add(new D(p).div(100));
  const money = (n: Prisma.Decimal) => n.toFixed(2, D.ROUND_HALF_UP);
  const lines = base.lines.map((l) => {
    const source = ready.find((s) => s.key === l.sourceLineId)!;
    const directCost = new D(
      money(new D(source.directUnitCost!).mul(l.quantity)),
    );
    const totalUnitCost = new D(l.totalUnitCost).add(source.directUnitCost!);
    const sellingUnitPrice =
      source.markup !== undefined
        ? totalUnitCost.mul(factor(source.markup))
        : new D(l.materialUnitCost)
            .mul(factor(source.materialMarkup ?? content.markup))
            .add(
              new D(l.laborUnitCost).mul(
                factor(source.laborMarkup ?? content.markup),
              ),
            )
            .add(
              new D(source.directUnitCost!).mul(
                factor(source.directMarkup ?? content.markup),
              ),
            );
    return {
      ...l,
      materials: source.materials.filter(
        (m) => m.coefficient !== null && !new D(m.coefficient).isZero(),
      ),
      materialsIncludedInDirect: source.materialsIncludedInDirect ?? false,
      directUnitCost: source.directUnitCost!,
      directCost: money(directCost),
      totalUnitCost: totalUnitCost.toFixed(),
      totalCost: money(new D(l.totalCost).add(directCost)),
      sellingUnitPrice: sellingUnitPrice.toFixed(),
      sellingAmount: money(sellingUnitPrice.mul(l.quantity)),
    };
  });
  const total = (field: "directCost" | "totalCost" | "sellingAmount") =>
    money(lines.reduce((a, l) => a.add(l[field]), new D(0)));
  const categories = base.categories.map((c) => ({
    ...c,
    directCost: money(
      lines
        .filter((l) => l.categoryId === c.categoryId)
        .reduce((a, l) => a.add(l.directCost), new D(0)),
    ),
    totalCost: money(
      lines
        .filter((l) => l.categoryId === c.categoryId)
        .reduce((a, l) => a.add(l.totalCost), new D(0)),
    ),
    sellingAmount: money(
      lines
        .filter((l) => l.categoryId === c.categoryId)
        .reduce((a, l) => a.add(l.sellingAmount), new D(0)),
    ),
  }));
  const materialsByCategory = base.materialsByCategory.map((m) => ({
    ...m,
    quantity: new D(m.quantity).toDecimalPlaces(8, D.ROUND_HALF_UP).toFixed(),
  }));
  for (const m of materialsByCategory) {
    if (
      new D(m.quantity).isZero() ||
      new D(m.quantity).gte("10000000000000000")
    )
      issues.push({
        lineKey:
          ready.find((l) =>
            l.materials.some((x) => x.materialId === m.materialId),
          )?.key ?? "materials",
        message: `${m.name}: la demanda no cabe en la precisión de cantidades (16 enteros, 8 decimales). Revisá cantidades o consumos.`,
      });
  }
  const materialTotals = new Map<string, (typeof base.materials)[number]>();
  for (const m of materialsByCategory) {
    const key = `${m.materialId}:${m.unitId}`,
      old = materialTotals.get(key);
    if (old) old.quantity = new D(old.quantity).add(m.quantity).toFixed();
    else
      materialTotals.set(key, {
        materialId: m.materialId,
        name: m.name,
        unitId: m.unitId,
        unit: m.unit,
        quantity: m.quantity,
      });
  }
  if (new D(total("sellingAmount")).gte("100000000000000000000"))
    issues.push({
      lineKey: ready[0]?.key ?? "total",
      message:
        "El total comercial excede la precisión admitida. Revisá las cantidades y los costos.",
    });
  return {
    ...base,
    formatVersion: 2 as const,
    unitCosts,
    lines,
    categories,
    materialsByCategory,
    materials: [...materialTotals.values()],
    materialQuantityPolicy: {
      precision: 8,
      roundingMode: "HALF_UP" as const,
      boundary: "CATEGORY_MATERIAL" as const,
    },
    materialReviewIssues: content.lines
      .filter(
        (l) =>
          l.status === "ACTIVE" &&
          (l.materialReview?.status === "UNRESOLVED" ||
            (content.materialDemandIncomplete && !l.materialReview)),
      )
      .map((l) => ({
        lineKey: l.key,
        name: l.name,
        detail:
          l.materialReview?.detail ??
          "Fuente anterior sin evidencia de composición verificada.",
      })),
    materialDemandIncomplete: content.lines.some(
      (l) =>
        l.status === "ACTIVE" &&
        (l.materialReview?.status === "UNRESOLVED" ||
          (content.materialDemandIncomplete && !l.materialReview)),
    ),
    directCost: total("directCost"),
    totalCost: total("totalCost"),
    commercialTotal: total("sellingAmount"),
    issues,
    complete: issues.length === 0 && ready.length > 0,
  };
}
