import { retiredPriceIds } from "./price-provenance";
import {
  selectLaborReference,
  selectMaterialReference,
} from "./reference-selection";
import { z } from "zod";
import { validateReferences } from "./commercial";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { type Actor, requireRoles } from "../core/auth";
import { db, transaction, schemaCapabilities, type Tx } from "../core/db";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { ok, parse, found } from "./shared";
import {
  editorContentSchema,
  calculateCommercial,
  type EditorContent,
} from "./commercial-domain";
import { referenceCostsEnabled, resolveActivityCosts } from "./cost-references";
export const costReviewSchema = z
  .object({
    revision: z.number().int().positive(),
    content: editorContentSchema,
    selected: z.array(z.string()).max(10000).optional(),
  })
  .strict();
export const costApplySchema = costReviewSchema.extend({
  planHash: z.string().length(64),
  selected: z.array(z.string()).max(10000),
});
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
export async function initialReferenceContent(tx: Tx, content: EditorContent) {
  const costs = await resolveActivityCosts(
    tx,
    content.lines.flatMap((l) => (l.itemId ? [l.itemId] : [])),
  );
  return editorContentSchema.parse({
    ...content,
    lines: content.lines.map((line) => {
      const resolved = line.itemId ? costs.get(line.itemId) : null;
      if (
        !resolved ||
        resolved.content.currency !== content.currency ||
        resolved.content.taxBasis !== content.taxBasis
      )
        return line;
      return {
        ...line,
        directUnitCost: resolved.directCost,
        materialsIncludedInDirect: resolved.content.materialsIncludedInDirect,
        materialReview: resolved.content.materialReview ?? line.materialReview,
        laborUnitCost: resolved.laborCost,
        laborReferences:
          resolved.content.laborMode === "CALCULATED" &&
          resolved.labor.every((l) => l.value !== null)
            ? resolved.labor.map((l) => ({
                ...l,
                value: l.value!,
                source: l.source ?? "",
              }))
            : undefined,
        materials: line.materials.map((m) => {
          const p = resolved.materials.find(
            (r) => r.materialId === m.materialId,
          );
          return p?.sourcePriceId
            ? { ...m, unitPrice: p.unitPrice, sourcePriceId: p.sourcePriceId }
            : m;
        }),
      };
    }),
  });
}
export async function costReview(
  tx: Tx,
  revision: number,
  content: EditorContent,
) {
  const enabled = (await schemaCapabilities()).referenceCosts;
  const selectedRates = enabled
    ? await tx.laborRate.findMany({
        where: {
          id: {
            in: content.lines.flatMap(
              (l) => l.laborReferences?.map((r) => r.rateId) ?? [],
            ),
          },
        },
        include: { resource: true },
      })
    : [];
  const rates = enabled
    ? await tx.laborRate.findMany({
        where: {
          resourceId: { in: selectedRates.map((r) => r.resourceId) },
          effectiveAt: { lte: new Date() },
        },
        orderBy: [
          { effectiveAt: "desc" },
          { createdAt: "desc" },
          { id: "desc" },
        ],
      })
    : [];
  const selectedPrices = await tx.materialPrice.findMany({
    where: {
      id: {
        in: content.lines.flatMap((l) =>
          l.materials.flatMap((m) =>
            m.sourcePriceId ? [m.sourcePriceId] : [],
          ),
        ),
      },
    },
  });
  const prices = await tx.materialPrice.findMany({
    where: {
      id: { notIn: await retiredPriceIds(tx) },
      materialId: {
        in: [
          ...new Set(
            content.lines.flatMap((l) => l.materials.map((m) => m.materialId)),
          ),
        ],
      },
      effectiveAt: { lte: new Date() },
      currency: content.currency,
      taxBasis: content.taxBasis,
    },
    include: { presentation: true, supplier: true },
    orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  const priceOrigins = enabled
    ? await tx.catalogOrigin.findMany({
        where: { kind: "price", entityId: { in: prices.map((p) => p.id) } },
      })
    : [];
  const changes: {
    key: string;
    lineKey: string;
    kind: "MATERIAL" | "LABOR";
    index: number;
    name: string;
    previous: string | null;
    next: string;
    sourceId: string;
    source: string | null;
    dateLabel: string | null;
    datePrecision: string;
    manual: boolean;
  }[] = [];
  for (const line of content.lines) {
    line.laborReferences?.forEach((r, index) => {
      const selected = selectedRates.find((s) => s.id === r.rateId),
        next = selectLaborReference(selected, rates, content);
      if (next && next.id !== r.rateId)
        changes.push({
          key: `${line.key}:LABOR:${index}`,
          lineKey: line.key,
          kind: "LABOR",
          index,
          name: r.name,
          previous: r.value,
          next: next.value.toFixed(),
          sourceId: next.id,
          source: next.source,
          dateLabel: next.dateLabel,
          datePrecision: next.datePrecision,
          manual: !selected?.value.eq(r.value),
        });
    });
    if (!line.materialsIncludedInDirect)
      line.materials.forEach((m, index) => {
        const selected = selectedPrices.find((p) => p.id === m.sourcePriceId);
        const next = selectMaterialReference(
          selected,
          prices,
          m.materialId,
          content,
          m.sourcePriceId === null,
        );
        if (next && next.id !== m.sourcePriceId)
          changes.push({
            key: `${line.key}:MATERIAL:${index}`,
            lineKey: line.key,
            kind: "MATERIAL",
            index,
            name: m.name,
            previous: m.unitPrice,
            next: next.price
              .div(next.baseQuantity)
              .toDecimalPlaces(8)
              .toFixed(),
            sourceId: next.id,
            source: next.source,
            dateLabel:
              (
                priceOrigins.find((o) => o.entityId === next.id)?.evidence as
                  | { record?: { date?: string } }
                  | undefined
              )?.record?.date ?? next.effectiveAt.toISOString(),
            datePrecision:
              (
                priceOrigins.find((o) => o.entityId === next.id)?.evidence as
                  | { record?: { datePrecision?: string } }
                  | undefined
              )?.record?.datePrecision ?? "DAY",
            manual:
              m.sourcePriceId === null ||
              (m.unitPrice !== null &&
                !selected!.price
                  .div(selected!.baseQuantity)
                  .toDecimalPlaces(8)
                  .eq(m.unitPrice)),
          });
      });
  }
  return { revision, changes, planHash: hash({ revision, content, changes }) };
}
export function applyReviewedCosts(
  content: EditorContent,
  changes: Awaited<ReturnType<typeof costReview>>["changes"],
  selected: string[],
) {
  const result = structuredClone(content);
  for (const line of result.lines) {
    for (const c of changes.filter(
      (c) => c.lineKey === line.key && selected.includes(c.key),
    )) {
      if (c.kind === "MATERIAL")
        line.materials[c.index] = {
          ...line.materials[c.index],
          unitPrice: c.next,
          sourcePriceId: c.sourceId,
        };
      else if (line.laborReferences) {
        const r = line.laborReferences[c.index];
        line.laborReferences[c.index] = {
          ...r,
          value: c.next,
          rateId: c.sourceId,
          source: c.source ?? "",
          dateLabel: c.dateLabel,
          datePrecision: c.datePrecision,
        };
      }
    }
    if (line.laborReferences)
      line.laborUnitCost = line.laborReferences
        .reduce(
          (sum, r) => sum.add(new Prisma.Decimal(r.coefficient).mul(r.value)),
          new Prisma.Decimal(0),
        )
        .toDecimalPlaces(8)
        .toFixed();
  }
  return editorContentSchema.parse(result);
}
export async function handlerBudgetCostUpdates(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  if (
    s[0] !== "budget-editor" ||
    !s[1] ||
    !["cost-review", "apply-cost-review"].includes(s[2]) ||
    request.method !== "POST"
  )
    return null;
  requireRoles(actor, "GERENCIA", "COMPUTO");
  await referenceCostsEnabled();
  if (s[2] === "cost-review") {
    const b = await parse(request, costReviewSchema);
    found(await db.budget.findUnique({ where: { id: s[1] } }));
    const review = await costReview(db, b.revision, b.content);
    if (b.selected?.some((key) => !review.changes.some((c) => c.key === key)))
      throw new ApiError(
        409,
        "REFERENCE_CONFLICT",
        "Las referencias cambiaron; volvé a revisar las diferencias.",
      );
    const next = applyReviewedCosts(
      b.content,
      review.changes,
      b.selected ?? review.changes.filter((c) => !c.manual).map((c) => c.key),
    );
    return ok({
      ...review,
      before: calculateCommercial(b.content),
      after: calculateCommercial(next),
    });
  }
  const b = await parse(request, costApplySchema);
  return ok(
    await transaction(async (tx) => {
      const draft = found(
        await tx.budgetDraft.findUnique({ where: { budgetId: s[1] } }),
      );
      if (draft.revision !== b.revision)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "El borrador cambió; conservá tu trabajo y revisá nuevamente.",
        );
      const review = await costReview(tx, b.revision, b.content);
      if (review.planHash !== b.planHash)
        throw new ApiError(
          409,
          "REFERENCE_CONFLICT",
          "Las referencias cambiaron desde la revisión. Volvé a revisar.",
        );
      if (b.selected.some((key) => !review.changes.some((c) => c.key === key)))
        throw new ApiError(
          422,
          "INVALID_SELECTION",
          "Cambio ajeno a la revisión.",
        );
      const content = applyReviewedCosts(b.content, review.changes, b.selected);
      await validateReferences(tx, content);
      const updated = await tx.budgetDraft.update({
        where: { budgetId: s[1] },
        data: { content, revision: { increment: 1 } },
      });
      await audit(tx, actor, "APPLY_REFERENCE_COSTS", "BudgetDraft", s[1], {
        selected: b.selected,
        planHash: b.planHash,
      });
      return updated;
    }),
  );
}
