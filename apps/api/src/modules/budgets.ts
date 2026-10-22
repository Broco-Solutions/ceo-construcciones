import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, transaction } from "../core/db";
import { sequentialCode } from "./sequential-codes";
import { Actor, requireRoles, requireWork } from "../core/auth";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { idempotent } from "./inventory";

// Keep calculations decimal and exact until the caller's explicitly selected
// rounding boundary. Never inherit decimal.js's default 20 significant digits.
const Decimal = Prisma.Decimal.clone({ precision: 80 });
const amount = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,15})(\.\d{1,8})?$/,
    "Decimal positivo con hasta 8 decimales",
  );
const positive = amount.refine(
  (value) => new Decimal(value).gt(0),
  "Debe ser mayor a cero",
);
const identifier = z.string().min(1).max(100);
const currency = z.string().regex(/^[A-Z]{3}$/);
const taxBasis = z.enum(["INCLUDED", "EXCLUDED", "UNSPECIFIED"]);
const rounding = z.enum(["HALF_UP", "HALF_EVEN", "DOWN"]);
const roundingModes = {
  HALF_UP: Decimal.ROUND_HALF_UP,
  HALF_EVEN: Decimal.ROUND_HALF_EVEN,
  DOWN: Decimal.ROUND_DOWN,
};

export interface SnapshotMaterial {
  materialId: string;
  name: string;
  unitId: string;
  unit: string;
  coefficient: string;
  unitPrice: string;
  sourcePriceId: string | null;
}
export interface SnapshotLine {
  sourceLineId: string;
  itemId: string;
  code: string | null;
  name: string;
  categoryId: string;
  category: string;
  unitId: string;
  unit: string;
  quantity: string;
  laborUnitCost: string;
  materials: SnapshotMaterial[];
}
export interface BudgetSnapshotInput {
  currency: string;
  taxBasis: "INCLUDED" | "EXCLUDED" | "UNSPECIFIED";
  precision: number;
  roundingMode: keyof typeof roundingModes;
  lines: SnapshotLine[];
}

/** Snapshot owns all data, including labels; later catalogue edits never enter it. */
export function calculateBudget(input: BudgetSnapshotInput) {
  const money = (value: Prisma.Decimal) =>
    value.toFixed(input.precision, roundingModes[input.roundingMode]);
  const bom = new Map<
    string,
    {
      materialId: string;
      name: string;
      unitId: string;
      unit: string;
      categoryId: string;
      quantity: Prisma.Decimal;
    }
  >();
  const categories = new Map<
    string,
    {
      categoryId: string;
      name: string;
      materialCost: Prisma.Decimal;
      laborCost: Prisma.Decimal;
    }
  >();
  let materialTotal = new Decimal(0);
  let laborTotal = new Decimal(0);
  const lines = input.lines.map((source) => {
    const line = structuredClone(source);
    const quantity = new Decimal(line.quantity);
    let materialUnitCost = new Decimal(0);
    const materials = line.materials.map((material) => {
      const coefficient = new Decimal(material.coefficient);
      const required = quantity.mul(coefficient);
      const cost = coefficient.mul(material.unitPrice);
      materialUnitCost = materialUnitCost.add(cost);
      const key = `${line.categoryId}:${material.materialId}:${material.unitId}`;
      const existing = bom.get(key);
      if (existing) existing.quantity = existing.quantity.add(required);
      else
        bom.set(key, {
          materialId: material.materialId,
          name: material.name,
          unitId: material.unitId,
          unit: material.unit,
          categoryId: line.categoryId,
          quantity: required,
        });
      return {
        ...material,
        quantity: required.toFixed(),
        unitCost: cost.toFixed(),
      };
    });
    // Round only each extended line; totals are the sum of those displayed lines.
    const materialCost = new Decimal(money(materialUnitCost.mul(quantity)));
    const laborCost = new Decimal(
      money(new Decimal(line.laborUnitCost).mul(quantity)),
    );
    materialTotal = materialTotal.add(materialCost);
    laborTotal = laborTotal.add(laborCost);
    const category = categories.get(line.categoryId) ?? {
      categoryId: line.categoryId,
      name: line.category,
      materialCost: new Decimal(0),
      laborCost: new Decimal(0),
    };
    category.materialCost = category.materialCost.add(materialCost);
    category.laborCost = category.laborCost.add(laborCost);
    categories.set(line.categoryId, category);
    return {
      ...line,
      materials,
      materialUnitCost: materialUnitCost.toFixed(),
      totalUnitCost: materialUnitCost.add(line.laborUnitCost).toFixed(),
      materialCost: money(materialCost),
      laborCost: money(laborCost),
      totalCost: money(materialCost.add(laborCost)),
    };
  });
  const consolidated = new Map<
    string,
    {
      materialId: string;
      name: string;
      unitId: string;
      unit: string;
      quantity: Prisma.Decimal;
    }
  >();
  for (const row of bom.values()) {
    const key = `${row.materialId}:${row.unitId}`;
    const found = consolidated.get(key);
    if (found) found.quantity = found.quantity.add(row.quantity);
    else
      consolidated.set(key, {
        materialId: row.materialId,
        name: row.name,
        unitId: row.unitId,
        unit: row.unit,
        quantity: row.quantity,
      });
  }
  return {
    currency: input.currency,
    taxBasis: input.taxBasis,
    precision: input.precision,
    roundingMode: input.roundingMode,
    roundingBoundary: "EXTENDED_LINE_COMPONENTS" as const,
    lines,
    categories: [...categories.values()].map((group) => ({
      ...group,
      materialCost: money(group.materialCost),
      laborCost: money(group.laborCost),
      totalCost: money(group.materialCost.add(group.laborCost)),
    })),
    materialsByCategory: [...bom.values()].map((material) => ({
      ...material,
      quantity: material.quantity.toFixed(),
    })),
    materials: [...consolidated.values()].map((material) => ({
      ...material,
      quantity: material.quantity.toFixed(),
    })),
    materialCost: money(materialTotal),
    laborCost: money(laborTotal),
    totalCost: money(materialTotal.add(laborTotal)),
  };
}

function parse<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Datos inválidos",
      result.error.flatten(),
    );
  return result.data;
}
function response(value: unknown, status = 200) {
  return Response.json(value, { status });
}
function requireWriter(actor: Actor) {
  requireRoles(actor, "GERENCIA", "COMPUTO");
}
function requireReader(actor: Actor) {
  requireRoles(actor, "GERENCIA", "COMPUTO", "COMPRAS");
}

const componentSchema = z
  .object({ materialId: identifier, coefficient: positive })
  .strict();
export const itemSchema = z
  .object({
    code: z.string().max(100).nullable().optional(),
    name: z.string().trim().min(1).max(300),
    categoryId: identifier,
    unitId: identifier,
    laborCost: amount,
    laborCurrency: currency,
    laborTaxBasis: taxBasis,
    active: z.boolean().optional(),
    // Empty components represent a labor-only APU, with no material demand.
    components: z.array(componentSchema).max(500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.components.map((c) => c.materialId)).size !==
      value.components.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Material repetido en el APU",
        path: ["components"],
      });
  });
export const computationSchema = z
  .object({
    workId: identifier,
    name: z.string().trim().min(1).max(300),
    lines: z
      .array(z.object({ itemId: identifier, quantity: positive }).strict())
      .min(1)
      .max(1000),
  })
  .strict();
// PATCH replaces the line collection, but explicitly identified rows retain identity.
export const computationPatchSchema = computationSchema
  .extend({
    lines: z
      .array(
        z
          .object({
            id: identifier.optional(),
            itemId: identifier,
            quantity: positive,
          })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .superRefine((input, ctx) => {
    const ids = input.lines.flatMap((line) => (line.id ? [line.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Renglón repetido",
      });
  });
export const budgetSchema = z
  .object({ workId: identifier, name: z.string().trim().min(1).max(300) })
  .strict();
const selectedPrice = z
  .object({
    materialId: identifier,
    priceId: identifier.optional(),
    unitPrice: amount.optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.priceId === undefined) !== (value.unitPrice === undefined),
    "Informe priceId o unitPrice, exclusivamente",
  );
const lineOverride = z
  .object({
    lineId: identifier,
    quantity: positive.optional(),
    laborUnitCost: amount.optional(),
    materials: z
      .array(
        z
          .object({
            materialId: identifier,
            coefficient: positive.optional(),
            unitPrice: amount.optional(),
          })
          .strict(),
      )
      .max(500)
      .optional(),
  })
  .strict();
export const valuationSchema = z
  .object({
    currency,
    taxBasis,
    roundingBoundary: z.literal("EXTENDED_LINE_COMPONENTS"),
    precision: z.number().int().min(0).max(6),
    roundingMode: rounding,
    prices: z.array(selectedPrice).max(1000),
  })
  .strict();
export const versionSchema = valuationSchema.extend({
  computationId: identifier,
  overrides: z.array(lineOverride).max(1000).optional(),
});
type Valuation = z.infer<typeof valuationSchema>;
type Override = z.infer<typeof lineOverride>;
const itemInclude = {
  unit: true,
  category: true,
  components: { include: { material: { include: { unit: true } } } },
} satisfies Prisma.ApuItemInclude;
type Item = Prisma.ApuItemGetPayload<{ include: typeof itemInclude }>;

async function snapshotLines(
  tx: Prisma.TransactionClient,
  lines: { id: string; item: Item; quantity: Prisma.Decimal }[],
  valuation: Valuation,
  overrides: Override[] = [],
): Promise<SnapshotLine[]> {
  if (
    new Set(valuation.prices.map((price) => price.materialId)).size !==
    valuation.prices.length
  )
    throw new ApiError(
      422,
      "DUPLICATE_PRICE",
      "Informe un único precio por material",
    );
  if (new Set(overrides.map((line) => line.lineId)).size !== overrides.length)
    throw new ApiError(
      422,
      "DUPLICATE_OVERRIDE",
      "Renglón sobrescrito más de una vez",
    );
  const sourceIds = new Set(lines.map((line) => line.id));
  if (overrides.some((line) => !sourceIds.has(line.lineId)))
    throw new ApiError(422, "INVALID_OVERRIDE", "Renglón ajeno al cómputo");
  const materials = new Set(
    lines.flatMap((line) =>
      line.item.components.map((component) => component.materialId),
    ),
  );
  if (valuation.prices.some((price) => !materials.has(price.materialId)))
    throw new ApiError(
      422,
      "INVALID_PRICE",
      "Precio para material ajeno al cómputo",
    );
  const priceMap = new Map<
    string,
    { unitPrice: string; sourcePriceId: string | null }
  >();
  for (const selected of valuation.prices) {
    if (selected.unitPrice !== undefined) {
      priceMap.set(selected.materialId, {
        unitPrice: selected.unitPrice,
        sourcePriceId: null,
      });
      continue;
    }
    const price = await tx.materialPrice.findUnique({
      where: { id: selected.priceId! },
    });
    if (!price || price.materialId !== selected.materialId)
      throw new ApiError(
        422,
        "INVALID_PRICE",
        "Precio inexistente o de otro material",
      );
    if (
      price.currency !== valuation.currency ||
      price.taxBasis !== valuation.taxBasis
    )
      throw new ApiError(
        422,
        "INCOMPARABLE_PRICE",
        "La moneda y base impositiva deben coincidir; no se convierte IVA ni moneda",
      );
    if (price.price.lte(0) || price.baseQuantity.lte(0))
      throw new ApiError(
        422,
        "INVALID_PRICE",
        "Referencia de precio sin valor positivo o conversión válida",
      );
    const normalized = new Decimal(price.price.toString()).div(
      price.baseQuantity.toString(),
    );
    // No hidden rounding for conversion of commercial presentations.
    if (normalized.decimalPlaces() > 12)
      throw new ApiError(
        422,
        "EXPLICIT_NORMALIZED_PRICE_REQUIRED",
        "La conversión requiere redondeo; informe unitPrice explícito",
      );
    priceMap.set(selected.materialId, {
      unitPrice: normalized.toFixed(),
      sourcePriceId: price.id,
    });
  }
  return lines.map((line) => {
    const item = line.item;
    const override = overrides.find((value) => value.lineId === line.id);
    const componentIds = new Set(
      item.components.map((component) => component.materialId),
    );
    if (
      override?.materials &&
      (new Set(override.materials.map((value) => value.materialId)).size !==
        override.materials.length ||
        override.materials.some((value) => !componentIds.has(value.materialId)))
    )
      throw new ApiError(
        422,
        "INVALID_OVERRIDE",
        "Material repetido o ajeno al APU",
      );
    if (
      override?.laborUnitCost === undefined &&
      (item.laborCost === null ||
        item.laborCurrency !== valuation.currency ||
        item.laborTaxBasis !== valuation.taxBasis)
    )
      throw new ApiError(
        422,
        "INCOMPARABLE_LABOR",
        "Informe mano de obra explícita para la moneda y base impositiva elegidas",
      );
    return {
      sourceLineId: line.id,
      itemId: item.id,
      code: item.code,
      name: item.name,
      categoryId: item.categoryId,
      category: item.category.name,
      unitId: item.unitId,
      unit: item.unit.code,
      quantity: override?.quantity ?? line.quantity.toString(),
      laborUnitCost: override?.laborUnitCost ?? item.laborCost!.toString(),
      materials: item.components.map((component) => {
        const materialOverride = override?.materials?.find(
          (value) => value.materialId === component.materialId,
        );
        const selected = priceMap.get(component.materialId);
        if (materialOverride?.unitPrice === undefined && !selected)
          throw new ApiError(
            422,
            "MISSING_PRICE",
            `Falta precio explícito para ${component.material.code}`,
          );
        return {
          materialId: component.materialId,
          name: component.material.name,
          unitId: component.material.unitId,
          unit: component.material.unit.code,
          coefficient:
            materialOverride?.coefficient ?? component.coefficient.toString(),
          unitPrice: materialOverride?.unitPrice ?? selected!.unitPrice,
          sourcePriceId:
            materialOverride?.unitPrice !== undefined
              ? null
              : selected!.sourcePriceId,
        };
      }),
    };
  });
}

function pagination(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = parse(
    z.coerce.number().int().min(1).max(100000).default(1),
    params.get("page") ?? undefined,
  );
  const pageSize = parse(
    z.coerce.number().int().min(1).max(100).default(25),
    params.get("pageSize") ?? undefined,
  );
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}
async function json(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 2_000_000)
    throw new ApiError(
      413,
      "BODY_TOO_LARGE",
      "La solicitud supera el tamaño permitido",
    );
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 2_000_000)
    throw new ApiError(
      413,
      "BODY_TOO_LARGE",
      "La solicitud supera el tamaño permitido",
    );
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "JSON inválido");
  }
}

/** All resources are under /api/v1; return null only for another module's route. */
export async function handlerBudgets(
  request: Request,
  actor: Actor,
  segments: string[],
): Promise<Response | null> {
  const [resource, id, action] = segments;
  if (
    !["apu-items", "computations", "budgets", "budget-versions"].includes(
      resource,
    )
  )
    return null;
  if (segments.length > 3)
    throw new ApiError(404, "NOT_FOUND", "Ruta inexistente");
  const method = request.method;
  if (
    resource === "budget-versions" &&
    id &&
    action === "materials" &&
    method === "GET"
  ) {
    const version = await db.budgetVersion.findUnique({
      where: { id },
      include: {
        budget: true,
        materials: {
          include: {
            material: { select: { id: true, code: true, name: true } },
            unit: { select: { id: true, code: true, name: true } },
            category: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });
    if (!version) throw new ApiError(404, "NOT_FOUND", "Versión inexistente");
    await requireWork(actor, version.budget.workId);
    // This projection deliberately never serializes the economic snapshot.
    const materials = new Map<
      string,
      {
        materialId: string;
        unitId: string;
        quantity: Prisma.Decimal;
        material: { id: string; code: string; name: string };
        unit: { id: string; code: string; name: string };
      }
    >();
    for (const row of version.materials) {
      const key = `${row.materialId}:${row.unitId}`;
      const current = materials.get(key);
      if (current)
        current.quantity = current.quantity.add(row.quantity.toString());
      else
        materials.set(key, {
          materialId: row.materialId,
          unitId: row.unitId,
          quantity: new Decimal(row.quantity.toString()),
          material: row.material,
          unit: row.unit,
        });
    }
    return response({
      data: {
        versionId: id,
        workId: version.budget.workId,
        status: version.status,
        materials: [...materials.values()].map((row) => ({
          ...row,
          quantity: row.quantity.toFixed(),
        })),
        materialsByCategory: version.materials.map((row) => ({
          categoryId: row.categoryId,
          category: row.category,
          material: row.material,
          unit: row.unit,
          materialId: row.materialId,
          unitId: row.unitId,
          quantity: row.quantity.toString(),
        })),
      },
    });
  }
  requireReader(actor);
  if (resource === "apu-items") {
    if (!id && method === "GET") {
      const { page, pageSize, skip, take } = pagination(request);
      const categoryId =
        new URL(request.url).searchParams.get("categoryId") ?? undefined;
      const where = { ...(categoryId ? { categoryId } : {}) };
      const [data, total] = await Promise.all([
        db.apuItem.findMany({
          where,
          include: itemInclude,
          skip,
          take,
          orderBy: { id: "asc" },
        }),
        db.apuItem.count({ where }),
      ]);
      return response({ data, pagination: { page, pageSize, total } });
    }
    if (!id && method === "POST") {
      requireWriter(actor);
      const input = parse(itemSchema, await json(request));
      const result = await transaction(async (tx) => {
        const { components, ...data } = input;
        const code = data.code || (await sequentialCode(tx, "apu"));
        const item = await tx.apuItem.create({
          data: { ...data, code, components: { create: components } },
          include: itemInclude,
        });
        await audit(tx, actor, "CREATE", "ApuItem", item.id, input);
        return item;
      });
      return response({ data: result }, 201);
    }
    if (id && !action && method === "GET") {
      const item = await db.apuItem.findUnique({
        where: { id },
        include: itemInclude,
      });
      if (!item) throw new ApiError(404, "NOT_FOUND", "APU inexistente");
      return response({ data: item });
    }
    if (id && !action && method === "PATCH") {
      requireWriter(actor);
      // A full replacement makes component removals explicit and auditable.
      const input = parse(itemSchema, await json(request));
      const result = await transaction(async (tx) => {
        const { components, ...data } = input;
        await tx.apuMaterial.deleteMany({ where: { itemId: id } });
        const item = await tx.apuItem.update({
          where: { id },
          data: { ...data, components: { create: components } },
          include: itemInclude,
        });
        await audit(tx, actor, "UPDATE", "ApuItem", id, input);
        return item;
      });
      return response({ data: result });
    }
    if (id && action === "calculate" && method === "POST") {
      const valuation = parse(valuationSchema, await json(request));
      const result = await transaction(async (tx) => {
        const item = await tx.apuItem.findUnique({
          where: { id },
          include: itemInclude,
        });
        if (!item) throw new ApiError(404, "NOT_FOUND", "APU inexistente");
        const lines = await snapshotLines(
          tx,
          [{ id, item, quantity: new Decimal(1) }],
          valuation,
        );
        return calculateBudget({ ...valuation, lines });
      });
      return response({ data: result });
    }
  }
  if (resource === "computations") {
    if (!id && method === "GET") {
      const workId = new URL(request.url).searchParams.get("workId");
      if (workId) await requireWork(actor, workId);
      const { page, pageSize, skip, take } = pagination(request);
      const where = workId ? { workId } : {};
      const [data, total] = await Promise.all([
        db.computation.findMany({ where, skip, take, orderBy: { id: "asc" } }),
        db.computation.count({ where }),
      ]);
      return response({ data, pagination: { page, pageSize, total } });
    }
    if (!id && method === "POST") {
      requireWriter(actor);
      const input = parse(computationSchema, await json(request));
      await requireWork(actor, input.workId);
      const result = await transaction(async (tx) => {
        const computation = await tx.computation.create({
          data: {
            workId: input.workId,
            name: input.name,
            lines: { create: input.lines },
          },
          include: { lines: true },
        });
        await audit(tx, actor, "CREATE", "Computation", computation.id, input);
        return computation;
      });
      return response({ data: result }, 201);
    }
    if (id && !action && method === "GET") {
      const result = await db.computation.findUnique({
        where: { id },
        include: { lines: { include: { item: { include: itemInclude } } } },
      });
      if (!result) throw new ApiError(404, "NOT_FOUND", "Cómputo inexistente");
      await requireWork(actor, result.workId);
      return response({ data: result });
    }
    if (id && !action && method === "PATCH") {
      requireWriter(actor);
      const input = parse(computationPatchSchema, await json(request));
      const result = await transaction(async (tx) => {
        const current = await tx.computation.findUnique({
          where: { id },
          include: { lines: true },
        });
        if (!current)
          throw new ApiError(404, "NOT_FOUND", "Cómputo inexistente");
        if (current.workId !== input.workId)
          throw new ApiError(
            422,
            "IMMUTABLE_WORK",
            "No se puede cambiar la obra de un cómputo",
          );
        const currentById = new Map(
          current.lines.map((line) => [line.id, line]),
        );
        if (input.lines.some((line) => line.id && !currentById.has(line.id)))
          throw new ApiError(422, "INVALID_LINE", "Renglón ajeno al cómputo");
        const claimedIds = new Set(
          input.lines.flatMap((line) => (line.id ? [line.id] : [])),
        );
        const resolved = input.lines.map((line) => {
          if (line.id) return line;
          // Older clients can omit ids when an APU has an unambiguous identity.
          // Repeated APU rows need explicit ids; matching them by position invents identity.
          const candidates = current.lines.filter(
            (row) => row.itemId === line.itemId,
          );
          const uniqueInput =
            input.lines.filter((row) => row.itemId === line.itemId).length ===
            1;
          const existing =
            uniqueInput &&
            candidates.length === 1 &&
            !claimedIds.has(candidates[0].id)
              ? candidates[0]
              : undefined;
          return { ...line, id: existing?.id };
        });
        const retained = resolved.flatMap((line) => (line.id ? [line.id] : []));
        await tx.computationLine.deleteMany({
          where: { computationId: id, id: { notIn: retained } },
        });
        for (const line of resolved) {
          const data = { itemId: line.itemId, quantity: line.quantity };
          if (line.id)
            await tx.computationLine.update({ where: { id: line.id }, data });
          else
            await tx.computationLine.create({
              data: { ...data, computationId: id },
            });
        }
        const computation = await tx.computation.update({
          where: { id },
          data: { name: input.name },
          include: { lines: true },
        });
        await audit(tx, actor, "UPDATE", "Computation", id, input);
        return computation;
      });
      return response({ data: result });
    }
  }
  if (resource === "budgets") {
    if (!id && method === "GET") {
      const workId = new URL(request.url).searchParams.get("workId");
      if (workId) await requireWork(actor, workId);
      const { page, pageSize, skip, take } = pagination(request);
      const where = workId ? { workId } : {};
      const [data, total] = await Promise.all([
        db.budget.findMany({ where, skip, take, orderBy: { id: "asc" } }),
        db.budget.count({ where }),
      ]);
      return response({ data, pagination: { page, pageSize, total } });
    }
    if (!id && method === "POST") {
      requireWriter(actor);
      const input = parse(budgetSchema, await json(request));
      await requireWork(actor, input.workId);
      const result = await transaction(async (tx) => {
        const budget = await tx.budget.create({ data: input });
        await audit(tx, actor, "CREATE", "Budget", budget.id, input);
        return budget;
      });
      return response({ data: result }, 201);
    }
    if (id && !action && method === "GET") {
      const budget = await db.budget.findUnique({
        where: { id },
        include: { versions: { orderBy: { number: "desc" } } },
      });
      if (!budget)
        throw new ApiError(404, "NOT_FOUND", "Presupuesto inexistente");
      await requireWork(actor, budget.workId);
      return response({ data: budget });
    }
    if (id && action === "versions" && method === "POST") {
      requireWriter(actor);
      const input = parse(versionSchema, await json(request));
      const result = await idempotent(
        actor,
        `budget-version:${id}`,
        request.headers.get("idempotency-key") ?? "",
        input,
        async (tx) => {
          const budget = await tx.budget.findUnique({ where: { id } });
          if (!budget)
            throw new ApiError(404, "NOT_FOUND", "Presupuesto inexistente");
          const computation = await tx.computation.findUnique({
            where: { id: input.computationId },
            include: {
              lines: {
                include: { item: { include: itemInclude } },
                orderBy: { id: "asc" },
              },
            },
          });
          if (!computation || computation.workId !== budget.workId)
            throw new ApiError(
              422,
              "INVALID_COMPUTATION",
              "El cómputo debe pertenecer a la obra del presupuesto",
            );
          const lines = await snapshotLines(
            tx,
            computation.lines,
            input,
            input.overrides,
          );
          const snapshot = calculateBudget({ ...input, lines });
          if (
            snapshot.materialsByCategory.some((material) =>
              new Decimal(material.quantity).gte("100000000000000000000"),
            )
          )
            throw new ApiError(
              422,
              "QUANTITY_OUT_OF_RANGE",
              "La cantidad consolidada supera la precisión de almacenamiento",
            );
          const latest = await tx.budgetVersion.aggregate({
            where: { budgetId: id },
            _max: { number: true },
          });
          const version = await tx.budgetVersion.create({
            data: {
              budgetId: id,
              number: (latest._max.number ?? 0) + 1,
              currency: input.currency,
              taxBasis: input.taxBasis,
              precision: input.precision,
              roundingMode: input.roundingMode,
              createdById: actor.id,
              snapshot: {
                ...snapshot,
                computationId: computation.id,
                computationName: computation.name,
                overrides: input.overrides ?? [],
              } as unknown as Prisma.InputJsonValue,
              materials: {
                create: snapshot.materialsByCategory.map((material) => ({
                  materialId: material.materialId,
                  unitId: material.unitId,
                  categoryId: material.categoryId,
                  quantity: material.quantity,
                })),
              },
            },
            include: { materials: true },
          });
          await audit(
            tx,
            actor,
            "CREATE_VERSION",
            "BudgetVersion",
            version.id,
            {
              budgetId: id,
              number: version.number,
              computationId: computation.id,
              overrides: input.overrides ?? [],
            },
          );
          return version;
        },
      );
      return response({ data: result }, 201);
    }
  }
  if (resource === "budget-versions" && id) {
    if (!action && method === "GET") {
      const version = await db.budgetVersion.findUnique({
        where: { id },
        include: { budget: true },
      });
      if (!version) throw new ApiError(404, "NOT_FOUND", "Versión inexistente");
      await requireWork(actor, version.budget.workId);
      return response({ data: version });
    }
    if (action === "reference" && method === "POST") {
      requireRoles(actor, "GERENCIA");
      const result = await transaction(async (tx) => {
        const version = await tx.budgetVersion.findUnique({
          where: { id },
          include: { budget: true },
        });
        if (!version)
          throw new ApiError(404, "NOT_FOUND", "Versión inexistente");
        // Exactly one selected reference across all budgets of the work.
        await tx.budgetVersion.updateMany({
          where: {
            budget: { workId: version.budget.workId },
            status: "REFERENCE",
            id: { not: id },
          },
          data: { status: "ARCHIVED" },
        });
        const selected = await tx.budgetVersion.update({
          where: { id },
          data: { status: "REFERENCE" },
        });
        await audit(tx, actor, "SELECT_REFERENCE", "BudgetVersion", id, {
          workId: version.budget.workId,
        });
        return selected;
      });
      return response({ data: result });
    }
  }
  throw new ApiError(
    405,
    "METHOD_NOT_ALLOWED",
    "Operación no permitida para esta ruta",
  );
}
