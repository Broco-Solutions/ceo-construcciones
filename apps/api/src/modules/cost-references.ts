import { entitySearchWhere } from "./entity-search";
import { retiredPriceIds } from "./price-provenance";
import { sourcePriceBases, sourcePriceContext, samePriceSeries, undatedPriceIds, sourcePriceFactors } from './source-price-basis';
import {
  selectLaborReference,
  selectMaterialReference,
} from "./reference-selection";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createHash } from "node:crypto";
import { db, transaction, schemaCapabilities, type Tx } from "../core/db";
import { type Actor, requireRoles } from "../core/auth";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import {
  id,
  text,
  nonnegative,
  currency,
  taxBasis,
  parse,
  ok,
  paging,
  listed,
  found,
} from "./shared";

const D = Prisma.Decimal.clone({ precision: 80 });
export const laborResourceSchema = z
  .object({
    code: text,
    name: text,
    unit: text,
    kind: z.enum(["CATEGORY", "SERVICE"]),
    active: z.boolean().optional(),
  })
  .strict();
export const laborResourcePatchSchema = z
  .object({ name: text.optional(), active: z.boolean().optional() })
  .strict();
export const laborRateSchema = z
  .object({
    resourceId: id,
    value: nonnegative,
    currency,
    taxBasis,
    effectiveAt: z.string().datetime().nullable(),
    dateLabel: text.nullable(),
    datePrecision: z.enum(["DAY", "MONTH", "UNKNOWN"]),
    source: text,
    series: text,
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.datePrecision === "UNKNOWN") !== (v.effectiveAt === null))
      c.addIssue({
        code: "custom",
        message:
          "Fecha desconocida requiere effectiveAt nulo; una referencia fechada requiere su fecha explícita.",
      });
    if (
      v.datePrecision === "MONTH" &&
      (!/^\d{4}-\d{2}$/.test(v.dateLabel ?? "") ||
        v.effectiveAt?.slice(0, 7) !== v.dateLabel)
    )
      c.addIssue({
        code: "custom",
        message: "Mes y fecha técnica deben corresponder.",
      });
    if (
      v.datePrecision === "DAY" &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(v.dateLabel ?? "") ||
        v.effectiveAt?.slice(0, 10) !== v.dateLabel)
    )
      c.addIssue({
        code: "custom",
        message: "Día y fecha de referencia deben corresponder.",
      });
    if (v.datePrecision === "UNKNOWN" && v.dateLabel !== null)
      c.addIssue({
        code: "custom",
        message: "Una fecha desconocida no tiene día ni mes informado.",
      });
  });
export const activityCostingSchema = z
  .object({
    currency,
    taxBasis,
    laborMode: z.enum(["DIRECT", "CALCULATED"]),
    labor: z
      .array(
        z
          .object({ resourceId: id, rateId: id, coefficient: nonnegative })
          .strict(),
      )
      .max(100),
    materials: z
      .array(z.object({ materialId: id, priceId: id, sourcePriceBasis: id.optional(), sourcePriceFactor: nonnegative.optional() }).strict())
      .max(500),
    materialsIncludedInDirect: z.boolean().default(false),
    notice: z.string().max(2000).default(""),
    materialReview: z
      .object({
        status: z.enum(["DIRECT", "VERIFIED", "UNRESOLVED"]),
        detail: z.string(),
        evidence: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      (v.laborMode === "DIRECT" && v.labor.length) ||
      (v.laborMode === "CALCULATED" && !v.labor.length)
    )
      c.addIssue({
        code: "custom",
        message: "Elegí MO directa o composición, sin sumarlas.",
      });
    for (const field of ["labor", "materials"] as const) {
      const ids = v[field].map((x) =>
        "resourceId" in x ? x.resourceId : x.materialId,
      );
      if (new Set(ids).size !== ids.length)
        c.addIssue({
          code: "custom",
          message: "Referencia repetida",
          path: [field],
        });
    }
  });
export type ActivityCosting = z.infer<typeof activityCostingSchema>;
async function laborProvenance<T extends { id: string }>(rates: T[]) {
  const origins = await db.catalogOrigin.findMany({
    where: { kind: "labor-rate", entityId: { in: rates.map((r) => r.id) } },
  });
  const historical = new Set(origins.map((o) => o.entityId));
  return rates.map((rate) => ({
    ...rate,
    referenceState: historical.has(rate.id)
      ? ("HISTORICAL" as const)
      : ("USER" as const),
  }));
}
export const resolvedActivitySchema = z
  .object({
    revision: z.number().int(),
    content: activityCostingSchema,
    labor: z.array(
      z
        .object({
          resourceId: id,
          rateId: id,
          coefficient: nonnegative,
          name: z.string(),
          unit: z.string(),
          value: nonnegative.nullable(),
          source: z.string().nullable(),
          dateLabel: z.string().nullable(),
          datePrecision: z.string(),
        })
        .strict(),
    ),
    materials: z.array(
      z
        .object({
          materialId: id,
          coefficient: nonnegative,
          unitPrice: nonnegative.nullable(),
          sourcePriceId: id.nullable(),
          sourcePriceBasis: id.optional(),
          sourcePriceFactor: nonnegative.optional(),
        })
        .strict(),
    ),
    laborCost: nonnegative.nullable(),
    materialCost: nonnegative.nullable(),
    directCost: nonnegative.nullable(),
    totalUnitCost: nonnegative.nullable(),
    issues: z.array(z.string()),
  })
  .strict();
export const activityCostingWriteSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    content: activityCostingSchema,
    expectedDirectCost: nonnegative.nullable().optional(),
  })
  .strict();
export async function previewActivityCosting(
  tx: Tx,
  itemId: string,
  content: ActivityCosting,
) {
  const replacesAggregate = await validateActivityCosting(tx, itemId, content);
  const item = found(
    await tx.apuItem.findUnique({
      where: { id: itemId },
      include: { components: true },
    }),
  );
  const rates = await tx.laborRate.findMany({
    where: { id: { in: content.labor.map((l) => l.rateId) } },
  });
  const prices = await tx.materialPrice.findMany({
    where: { id: { in: content.materials.map((m) => m.priceId) } },
  });
  const laborCost =
    content.laborMode === "DIRECT"
      ? (item.laborCost?.toFixed() ?? null)
      : content.labor
          .reduce(
            (sum, l) =>
              sum.add(
                new D(l.coefficient).mul(
                  rates.find((r) => r.id === l.rateId)!.value,
                ),
              ),
            new D(0),
          )
          .toDecimalPlaces(8)
          .toFixed();
  let materialCost: string | null = content.materialsIncludedInDirect
    ? "0"
    : null;
  if (
    !content.materialsIncludedInDirect &&
    item.components.every(
      (c) =>
        c.coefficient.isZero() ||
        content.materials.some((m) => m.materialId === c.materialId),
    )
  )
    materialCost = item.components
      .reduce((sum, c) => {
        const p = prices.find(
          (p) =>
            p.id ===
            content.materials.find((m) => m.materialId === c.materialId)
              ?.priceId,
        );
        const factor = content.materials.find(m => m.materialId === c.materialId)?.sourcePriceFactor ?? '1';
        return sum.add(p ? c.coefficient.mul(p.price.div(p.baseQuantity).mul(factor).toDecimalPlaces(8)) : 0);
      }, new D(0))
      .toDecimalPlaces(8)
      .toFixed();
  const origin = await tx.catalogOrigin.findFirst({
    where: { kind: "activity", entityId: itemId },
  });
  const directCost = replacesAggregate
    ? "0"
    : item.directCost === null &&
        origin &&
        (origin.evidence as { record: { direct: unknown } }).record.direct ===
          null
      ? null
      : (item.directCost?.toFixed() ?? "0");
  return {
    laborCost,
    materialCost,
    directCost,
    totalUnitCost:
      laborCost !== null && materialCost !== null && directCost !== null
        ? new D(laborCost).add(materialCost).add(directCost).toFixed()
        : null,
  };
}
export async function referenceCostsEnabled() {
  if (!(await schemaCapabilities()).referenceCosts)
    throw new ApiError(
      503,
      "FEATURE_NOT_ENABLED",
      "Los costos de referencia requieren la migración de aplicación autorizada.",
    );
}
export async function validateActivityCosting(
  tx: Tx,
  itemId: string,
  content: ActivityCosting,
) {
  const item = found(
    await tx.apuItem.findUnique({
      where: { id: itemId },
      include: { components: true },
    }),
  );
  if (
    (item.directCost?.gt(0) ||
      (content.laborMode === "DIRECT" && item.laborCost?.gt(0))) &&
    (item.laborCurrency !== content.currency ||
      item.laborTaxBasis !== content.taxBasis)
  )
    throw new ApiError(
      422,
      "INCOMPARABLE_DIRECT_COST",
      "La moneda y el IVA de los importes directos deben coincidir con la actividad; no se convierten importes.",
    );
  const previous = await tx.activityCosting.findUnique({ where: { itemId } });
  const previousContent = previous
    ? activityCostingSchema.parse(previous.content)
    : null;
  const replacesAggregate =
    !!previousContent?.materialsIncludedInDirect &&
    !content.materialsIncludedInDirect;
  if (
    replacesAggregate &&
    (!item.components.length ||
      item.components.some(
        (c) =>
          c.coefficient.gt(0) &&
          !content.materials.some((m) => m.materialId === c.materialId),
      ) ||
      content.materialReview?.status !== "VERIFIED" ||
      content.materialReview.evidence.trim().length < 10 ||
      /^(confirmad[oa]|revisad[oa]|ok|aceptad[oa]|materiales revisados)[.!\s]*$/i.test(
        content.materialReview.evidence.trim(),
      ) ||
      content.materialReview.evidence ===
        previousContent?.materialReview?.evidence)
  )
    throw new ApiError(
      422,
      "AGGREGATE_EVIDENCE_REQUIRED",
      "La sustitución requiere composición completa, referencias elegidas y nueva evidencia. Se retira el agregado completo, sin ajuste residual.",
    );
  const rates = await tx.laborRate.findMany({
    where: { id: { in: content.labor.map((x) => x.rateId) } },
    include: { resource: true },
  });
  const prices = await tx.materialPrice.findMany({
    where: { id: { in: content.materials.map((x) => x.priceId) } },
    include: { presentation: true, supplier: true },
  });
  const bases = await sourcePriceBases(tx, content.materials.flatMap(m => m.sourcePriceBasis ? [m.sourcePriceBasis] : []));
  const factors = await sourcePriceFactors(tx, [...bases.keys()]);
  for (const c of content.labor) {
    const r = rates.find((r) => r.id === c.rateId);
    if (
      !r ||
      r.resourceId !== c.resourceId ||
      !r.resource.active ||
      r.currency !== content.currency ||
      r.taxBasis !== content.taxBasis ||
      (r.effectiveAt && r.effectiveAt > new Date())
    )
      throw new ApiError(
        422,
        "INCOMPATIBLE_REFERENCE",
        "Tarifa ausente, futura o incompatible.",
      );
  }
  for (const c of content.materials) {
    const p = prices.find((p) => p.id === c.priceId);
    const basis = c.sourcePriceBasis ? bases.get(c.sourcePriceBasis) : undefined;
    const valuation = sourcePriceContext(content, c.materialId, basis);
    if (
      !item.components.some((m) => m.materialId === c.materialId) ||
      !p ||
      p.materialId !== c.materialId ||
      p.currency !== content.currency ||
      p.taxBasis !== valuation.taxBasis ||
      (c.sourcePriceBasis && (!basis || !samePriceSeries(basis, p))) ||
      (c.sourcePriceFactor !== undefined && c.sourcePriceFactor !== '1' && !factors.has(`${c.sourcePriceBasis}:${c.sourcePriceFactor}`)) ||
      p.effectiveAt > new Date() ||
      !p.baseQuantity.gt(0) ||
      (p.supplier && !p.supplier.active) ||
      (p.presentation &&
        (!p.presentation.active ||
          !p.presentation.baseQuantity.eq(p.baseQuantity)))
    )
      throw new ApiError(
        422,
        "INCOMPATIBLE_REFERENCE",
        "Precio ajeno, futuro o incompatible.",
      );
  }
  return replacesAggregate;
}

/** Shared batch resolver. Series choices remain explicit; no cheapest-provider fallback. */
export async function resolveActivityCosts(tx: Tx, ids: string[]) {
  if (!(await schemaCapabilities()).referenceCosts || !ids.length)
    return new Map<string, ResolvedActivity>();
  const definitions = await tx.activityCosting.findMany({
    where: { itemId: { in: ids } },
  });
  const contents = definitions.map((d) => ({
    row: d,
    content: activityCostingSchema.parse(d.content),
  }));
  const items = await tx.apuItem.findMany({
    where: { id: { in: definitions.map((d) => d.itemId) } },
    include: { components: true },
  });
  const rateIds = contents.flatMap((d) => d.content.labor.map((c) => c.rateId));
  const priceIds = contents.flatMap((d) =>
    d.content.materials.map((c) => c.priceId),
  );
  const selectedRates = await tx.laborRate.findMany({
    where: { id: { in: rateIds } },
    include: { resource: true },
  });
  const allRates = await tx.laborRate.findMany({
    where: {
      resourceId: { in: selectedRates.map((r) => r.resourceId) },
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }],
    },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const selectedPrices = await tx.materialPrice.findMany({
    where: { id: { in: priceIds } },
  });
  const allPrices = await tx.materialPrice.findMany({
    where: {
      id: { notIn: await retiredPriceIds(tx) },
      materialId: { in: selectedPrices.map((p) => p.materialId) },
      effectiveAt: { lte: new Date() },
    },
    include: { presentation: true, supplier: true },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const bases = await sourcePriceBases(tx, contents.flatMap(d => d.content.materials.flatMap(m => m.sourcePriceBasis ? [m.sourcePriceBasis] : [])));
  const undated = new Set(await undatedPriceIds(tx));
  const activityOrigins = await tx.catalogOrigin.findMany({
    where: { kind: "activity", entityId: { in: items.map((i) => i.id) } },
  });
  const result = new Map<string, ResolvedActivity>();
  for (const { row, content: c } of contents) {
    const item = items.find((i) => i.id === row.itemId);
    if (!item) continue;
    const issues: string[] = [];
    const labor = c.labor.map((component) => {
      const selected = selectedRates.find((r) => r.id === component.rateId);
      const current = selectLaborReference(selected, allRates, c);
      if (!current)
        issues.push("Tarifa no disponible: " + component.resourceId);
      return {
        ...component,
        rateId: current?.id ?? component.rateId,
        name: selected?.resource.name ?? component.resourceId,
        unit: selected?.resource.unit ?? "",
        value: current?.value.toFixed() ?? null,
        source: current?.source ?? null,
        dateLabel: current?.dateLabel ?? null,
        datePrecision: current?.datePrecision ?? "UNKNOWN",
      };
    });
    const materials = item.components.map((component) => {
      const selection = c.materials.find(
          (m) => m.materialId === component.materialId,
        ),
        selected = selectedPrices.find((p) => p.id === selection?.priceId);
      const current = selectMaterialReference(
        selected,
        allPrices.filter(p => !undated.has(p.id) || p.id === selected?.id),
        component.materialId,
        sourcePriceContext(c, component.materialId, selection?.sourcePriceBasis ? bases.get(selection.sourcePriceBasis) : undefined),
      );
      if (
        !current &&
        component.coefficient.gt(0) &&
        !c.materialsIncludedInDirect
      )
        issues.push("Elegir referencia: " + component.materialId);
      return {
        materialId: component.materialId,
        coefficient: component.coefficient.toFixed(),
        unitPrice:
          current?.price
            .div(current.baseQuantity).mul(selection?.sourcePriceFactor ?? '1')
            .toDecimalPlaces(8)
            .toFixed() ?? null,
        sourcePriceId: current?.id ?? null,
        ...(selection?.sourcePriceBasis ? { sourcePriceBasis: selection.sourcePriceBasis } : {}),
        ...(selection?.sourcePriceFactor ? { sourcePriceFactor: selection.sourcePriceFactor } : {}),
      };
    });
    const compatibleDirect =
      item.laborCurrency === c.currency && item.laborTaxBasis === c.taxBasis;
    const laborCost =
      c.laborMode === "DIRECT"
        ? item.laborCost?.gt(0) && !compatibleDirect
          ? null
          : (item.laborCost?.toFixed() ?? null)
        : labor.some((l) => l.value === null && !new D(l.coefficient).isZero())
          ? null
          : labor
              .reduce(
                (s, l) => s.add(new D(l.coefficient).mul(l.value ?? 0)),
                new D(0),
              )
              .toDecimalPlaces(8)
              .toFixed();
    const materialCost = c.materialsIncludedInDirect
      ? "0"
      : materials.some(
            (m) => m.unitPrice === null && !new D(m.coefficient).isZero(),
          )
        ? null
        : materials
            .reduce(
              (s, m) => s.add(new D(m.coefficient).mul(m.unitPrice ?? 0)),
              new D(0),
            )
            .toDecimalPlaces(8)
            .toFixed();
    const origin = activityOrigins.find((o) => o.entityId === item.id);
    const missingDirect =
      item.directCost === null &&
      origin &&
      (origin.evidence as { record: { direct: unknown } }).record.direct ===
        null;
    const directCost =
      missingDirect || (item.directCost?.gt(0) && !compatibleDirect)
        ? null
        : (item.directCost?.toFixed() ?? "0");
    if (!compatibleDirect)
      issues.push(
        "La valoración de los directos cambió. Revisá referencias sin convertir importes.",
      );
    if (missingDirect)
      issues.push("Costo directo pendiente en la fuente; no se inventa cero.");
    result.set(item.id, {
      revision: row.revision,
      content: c,
      labor,
      materials,
      laborCost,
      materialCost,
      directCost,
      totalUnitCost:
        laborCost !== null && materialCost !== null && directCost !== null
          ? new D(laborCost).add(materialCost).add(directCost).toFixed()
          : null,
      issues,
    });
  }
  return result;
}
export type ResolvedActivity = {
  revision: number;
  content: ActivityCosting;
  labor: {
    resourceId: string;
    rateId: string;
    coefficient: string;
    name: string;
    unit: string;
    value: string | null;
    source: string | null;
    dateLabel: string | null;
    datePrecision: string;
  }[];
  materials: {
    materialId: string;
    coefficient: string;
    unitPrice: string | null;
    sourcePriceId: string | null;
    sourcePriceBasis?: string;
    sourcePriceFactor?: string;
  }[];
  laborCost: string | null;
  materialCost: string | null;
  directCost: string | null;
  totalUnitCost: string | null;
  issues: string[];
};

export async function handlerCostReferences(
  request: Request,
  actor: Actor,
  segments: string[],
): Promise<Response | null> {
  const [resource, key, action] = segments;
  if (
    !["labor-resources", "labor-rates", "activity-costing"].includes(resource)
  )
    return null;
  requireRoles(actor, "GERENCIA", "COMPUTO", "COMPRAS");
  await referenceCostsEnabled();
  if (resource === "labor-resources" && request.method === "GET") {
    const p = paging(request),
      q = new URL(request.url).searchParams.get("q") ?? "";
    const where = {
      ...(key ? { id: key } : {}),
      ...(!key ? await entitySearchWhere("labor-resources", new URL(request.url).searchParams) : {}),
    };
    const [rows, total] = await Promise.all([
      db.laborResource.findMany({
        where,
        include: {
          rates: {
            where: {
              OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }],
            },
            orderBy: [
              { effectiveAt: { sort: "desc", nulls: "last" } },
              { createdAt: "desc" },
            ],
            take: 50,
          },
        },
        orderBy: { code: "asc" },
        skip: p.skip,
        take: p.take,
      }),
      db.laborResource.count({ where }),
    ]);
    if (key) {
      const row = found(rows[0]);
      const resource = { ...row, rates: await laborProvenance(row.rates) };
      const definitions = await db.activityCosting.findMany();
      const linked = definitions
        .filter((a) =>
          activityCostingSchema
            .parse(a.content)
            .labor.some((l) => l.resourceId === key),
        )
        .map((a) => a.itemId);
      const linkedActivities = await db.apuItem.findMany({
        where: { id: { in: linked } },
        select: { id: true, name: true },
      });
      return ok({ ...resource, linkedActivities });
    }
    const rates = await laborProvenance(rows.flatMap((row) => row.rates));
    const decorated = rows.map((row) => ({
      ...row,
      rates: row.rates.map((rate) => rates.find((r) => r.id === rate.id)!),
    }));
    return listed(decorated, total, p);
  }
  if (resource === "activity-costing" && key && request.method === "GET")
    return ok((await resolveActivityCosts(db, [key])).get(key) ?? null);
  if (resource === "labor-rates" && request.method === "GET") {
    const resourceId = new URL(request.url).searchParams.get("resourceId");
    if (!resourceId)
      throw new ApiError(422, "RESOURCE_REQUIRED", "Seleccioná el concepto.");
    const p = paging(request),
      where = { resourceId };
    const [rows, total] = await Promise.all([
      db.laborRate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: p.skip,
        take: p.take,
      }),
      db.laborRate.count({ where }),
    ]);
    return listed(await laborProvenance(rows), total, p);
  }
  requireRoles(actor, "GERENCIA", "COMPUTO");
  if (resource === "labor-resources" && key && request.method === "PATCH") {
    const body = await parse(request, laborResourcePatchSchema);
    return ok(
      await transaction(async (tx) => {
        const before = found(
          await tx.laborResource.findUnique({ where: { id: key } }),
        );
        const row = await tx.laborResource.update({
          where: { id: key },
          data: body,
        });
        await audit(tx, actor, "UPDATE", "LaborResource", key, body, before);
        return row;
      }),
    );
  }
  if (
    resource === "activity-costing" &&
    key &&
    action === "preview" &&
    request.method === "POST"
  )
    return ok(
      await previewActivityCosting(
        db,
        key,
        await parse(request, activityCostingSchema),
      ),
    );
  if (resource === "labor-resources" && request.method === "POST" && !key) {
    const body = await parse(request, laborResourceSchema);
    return ok(
      await transaction(async (tx) => {
        const row = await tx.laborResource.create({ data: body });
        await audit(tx, actor, "CREATE", "LaborResource", row.id, body);
        return row;
      }),
      201,
    );
  }
  if (resource === "labor-rates" && request.method === "POST" && !key) {
    const body = await parse(request, laborRateSchema);
    return ok(
      await transaction(async (tx) => {
        found(
          await tx.laborResource.findUnique({ where: { id: body.resourceId } }),
        );
        const row = await tx.laborRate.create({
          data: { ...body, createdById: actor.id },
        });
        await audit(tx, actor, "CREATE", "LaborRate", row.id, body);
        const activities = await tx.activityCosting.findMany();
        return {
          ...row,
          linkedActivities: activities
            .filter((a) =>
              activityCostingSchema
                .parse(a.content)
                .labor.some((l) => l.resourceId === body.resourceId),
            )
            .map((a) => a.itemId),
        };
      }),
      201,
    );
  }
  if (
    resource === "activity-costing" &&
    key &&
    request.method === "PUT" &&
    !action
  ) {
    const body = await parse(request, activityCostingWriteSchema);
    return ok(
      await transaction(async (tx) => {
        const replacesAggregate = await validateActivityCosting(
          tx,
          key,
          body.content,
        );
        const old = await tx.activityCosting.findUnique({
          where: { itemId: key },
        });
        if ((old?.revision ?? 0) !== body.revision)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "La composición cambió. Revisá antes de guardar.",
          );
        if (replacesAggregate) {
          const item = found(
            await tx.apuItem.findUnique({ where: { id: key } }),
          );
          if (
            body.expectedDirectCost === undefined ||
            item.directCost?.toFixed() !==
              (body.expectedDirectCost ?? undefined)
          )
            throw new ApiError(
              409,
              "AGGREGATE_CONFLICT",
              "El agregado cambió o no fue confirmado. Volvé a revisar.",
            );
          await tx.apuItem.update({
            where: { id: key },
            data: { directCost: "0" },
          });
          await audit(
            tx,
            actor,
            "REPLACE_MATERIAL_AGGREGATE",
            "ApuItem",
            key,
            {
              directCost: "0",
              evidence: body.content.materialReview!.evidence,
            },
            { directCost: item.directCost?.toFixed() ?? null },
          );
        }
        const saved = await tx.activityCosting.upsert({
          where: { itemId: key },
          create: { itemId: key, content: body.content },
          update: { content: body.content, revision: { increment: 1 } },
        });
        await audit(
          tx,
          actor,
          "UPDATE",
          "ActivityCosting",
          key,
          body.content,
          old?.content as Prisma.InputJsonValue | undefined,
        );
        return saved;
      }),
    );
  }
  return null;
}
