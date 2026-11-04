import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { sourcePriceBases, sourcePriceContext, samePriceSeries, sourcePriceFactors } from './source-price-basis';
import { db, transaction, schemaCapabilities, type Tx } from "../core/db";
import { type Actor, requireRoles } from "../core/auth";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { found, id, ok, parse, text } from "./shared";
import { idempotent } from "./inventory";
import {
  calculateCommercial,
  editorContentSchema,
  quantityExpression,
  type EditorContent,
} from "./commercial-domain";
import { commercialPdf } from "./commercial-pdf";
import { baseSource, installBase } from "./base-template";
import {
  initialReferenceContent,
  costReview,
  applyReviewedCosts,
} from "./budget-cost-updates";

export const draftSaveSchema = z
  .object({ revision: z.number().int().min(0), content: editorContentSchema })
  .strict();
export const editorCreateSchema = z
  .object({
    workId: id,
    name: text,
    templateId: id.optional(),
    sourceVersionId: id.optional(),
    useReferenceCosts: z.boolean().optional(),
  })
  .strict()
  .refine(
    (v) => !(v.templateId && v.sourceVersionId),
    "Elegí plantilla o revisión, no ambas.",
  );
export const issueSchema = z
  .object({ revision: z.number().int().min(1) })
  .strict();
export const templateSchema = z
  .object({ name: text, content: editorContentSchema })
  .strict();
export const emptyContent = (): EditorContent => ({
  currency: "ARS",
  taxBasis: "EXCLUDED",
  markup: "0",
  conditions: "",
  exclusions: "",
  observations: "",
  deadline: "",
  lines: [],
});
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

export async function validateReferences(tx: Tx, content: EditorContent) {
  const labor = content.lines.flatMap((l) => l.laborReferences ?? []);
  if (labor.length) {
    if (!(await schemaCapabilities()).referenceCosts)
      throw new ApiError(
        503,
        "FEATURE_NOT_ENABLED",
        "Las referencias de mano de obra aún no están habilitadas.",
      );
    const rates = await tx.laborRate.findMany({
      where: { id: { in: [...new Set(labor.map((l) => l.rateId))] } },
      include: { resource: true },
    });
    for (const reference of labor) {
      const rate = rates.find((r) => r.id === reference.rateId);
      if (
        !rate ||
        rate.resourceId !== reference.resourceId ||
        rate.resource.unit !== reference.unit ||
        rate.currency !== content.currency ||
        rate.taxBasis !== content.taxBasis ||
        !rate.value.eq(reference.value)
      )
        throw new ApiError(
          422,
          "LABOR_PROVENANCE_MISMATCH",
          "La tarifa no coincide con el recurso, unidad, moneda, IVA o importe. Para un ajuste directo, retirala explícitamente.",
        );
    }
  }
  const categoryIds = [...new Set(content.lines.map((l) => l.categoryId))],
    unitIds = [
      ...new Set(
        content.lines.flatMap((l) => [
          l.unitId,
          ...l.materials.map((m) => m.unitId),
        ]),
      ),
    ];
  if (
    (await tx.category.count({ where: { id: { in: categoryIds } } })) !==
      categoryIds.length ||
    (await tx.unit.count({ where: { id: { in: unitIds } } })) !== unitIds.length
  )
    throw new ApiError(422, "INVALID_REFERENCE", "Rubro o unidad desconocida.");
  const materials = await tx.material.findMany({
    where: {
      id: {
        in: [
          ...new Set(
            content.lines.flatMap((l) => l.materials.map((m) => m.materialId)),
          ),
        ],
      },
    },
    select: { id: true, unitId: true },
  });
  if (
    content.lines.some((l) =>
      l.materials.some(
        (m) =>
          !materials.some(
            (x) => x.id === m.materialId && x.unitId === m.unitId,
          ),
      ),
    )
  )
    throw new ApiError(
      422,
      "INVALID_REFERENCE",
      "Material o unidad de consumo incompatible.",
    );
  const sourced = content.lines
    .flatMap((l) => l.materials)
    .filter((m) => m.sourcePriceId !== null);
  if (sourced.length) {
    const basisIds = sourced.flatMap(m => m.sourcePriceBasis ? [m.sourcePriceBasis] : []);
    if (basisIds.length && !(await schemaCapabilities()).referenceCosts) throw new ApiError(503, 'FEATURE_NOT_ENABLED', 'Las referencias de origen aún no están habilitadas.');
    const bases = await sourcePriceBases(tx, basisIds);
    const factors = await sourcePriceFactors(tx, [...bases.keys()]);
    const prices = await tx.materialPrice.findMany({
      where: { id: { in: [...new Set(sourced.map((m) => m.sourcePriceId!))] } },
    });
    for (const material of sourced) {
      const price = prices.find((p) => p.id === material.sourcePriceId);
      const basis = material.sourcePriceBasis ? bases.get(material.sourcePriceBasis) : undefined;
      const valuation = sourcePriceContext(content, material.materialId, basis);
      const normalized = price?.price
        .div(price.baseQuantity).mul(material.sourcePriceFactor ?? '1')
        .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
      if (
        !price ||
        price.materialId !== material.materialId ||
        price.currency !== content.currency ||
        price.taxBasis !== valuation.taxBasis ||
        (material.sourcePriceBasis && (!basis || !samePriceSeries(basis, price))) ||
        (material.sourcePriceFactor !== undefined && material.sourcePriceFactor !== '1' && !factors.has(`${material.sourcePriceBasis}:${material.sourcePriceFactor}`)) ||
        material.unitPrice === null ||
        !normalized?.eq(material.unitPrice) ||
        (price.price.gt(0) && normalized.isZero())
      )
        throw new ApiError(
          422,
          "PRICE_PROVENANCE_MISMATCH",
          "La referencia de precio no coincide con este material, moneda, IVA o importe. Para un ajuste manual, quitá la referencia.",
        );
    }
  }
}

export async function handlerCommercial(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  const [resource, key, action] = s,
    method = request.method;
  if (
    ![
      "budget-editor",
      "budget-templates",
      "budget-issues",
      "quantity-expression",
    ].includes(resource)
  )
    return null;
  requireRoles(actor, "GERENCIA", "COMPUTO", "COMPRAS");
  if (
    method !== "GET" &&
    !(resource === "budget-editor" && action === "calculate")
  )
    requireRoles(actor, "GERENCIA", "COMPUTO");
  if (resource === "quantity-expression" && method === "POST") {
    const b = await parse(
      request,
      z.object({ expression: z.string().max(200) }).strict(),
    );
    return ok({ quantity: quantityExpression(b.expression) });
  }
  if (resource === "budget-templates") {
    if (key === "base" && method === "GET")
      return ok({
        sourceSha256: baseSource.sourceSha256,
        notice: baseSource.notice,
        activities: baseSource.lines.length,
        issues: sourceIssues(),
      });
    if (key === "base" && method === "POST")
      return ok(
        await idempotent(
          actor,
          "install-base",
          request.headers.get("idempotency-key") ?? "",
          { sourceSha256: baseSource.sourceSha256 },
          (tx) => installBase(tx, actor),
        ),
        201,
      );
    if (method === "GET" && !key)
      return ok(
        await db.budgetTemplate.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        }),
      );
    if (method === "POST" && !key) {
      const b = await parse(request, templateSchema);
      return ok(
        await transaction(async (tx) => {
          await validateReferences(tx, b.content);
          const t = await tx.budgetTemplate.create({
            data: { name: b.name, content: json(b.content) },
          });
          await audit(tx, actor, "CREATE", "BudgetTemplate", t.id);
          return t;
        }),
        201,
      );
    }
  }
  if (resource === "budget-editor" && !key && method === "POST") {
    const b = await parse(request, editorCreateSchema);
    return ok(
      await idempotent(
        actor,
        "budget-editor-create",
        request.headers.get("idempotency-key") ?? "",
        b,
        async (tx) => {
          const work = found(
            await tx.work.findUnique({
              where: { id: b.workId },
              select: { id: true, clientId: true },
            }),
          );
          if (!work.clientId)
            throw new ApiError(
              422,
              "CLIENT_REQUIRED",
              "Vinculá el cliente de la obra antes de iniciar un presupuesto comercial.",
            );
          let content = emptyContent();
          let pristineCatalogTemplate = false;
          if (b.templateId)
            content = editorContentSchema.parse(
              found(
                await tx.budgetTemplate.findFirst({
                  where: { id: b.templateId, active: true },
                }),
              ).content,
            );
          if (b.templateId && (await schemaCapabilities()).referenceCosts) {
            const mapping = await tx.catalogOrigin.findFirst({
              where: {
                kind: "template",
                entityId: b.templateId,
                source: "BASE-CEO",
              },
            });
            if (mapping) {
              const template = await tx.budgetTemplate.findUnique({
                where: { id: b.templateId },
              });
              pristineCatalogTemplate =
                !!template && hash(template) === mapping.installedHash;
            }
          }
          if (b.sourceVersionId) {
            const source = found(
              await tx.budgetVersion.findUnique({
                where: { id: b.sourceVersionId },
              }),
            );
            const snapshot = source.snapshot as Record<string, unknown>;
            if (snapshot.editorContent)
              content = editorContentSchema.parse(snapshot.editorContent);
            else {
              const old = snapshot as unknown as ReturnType<
                typeof calculateCommercial
              >;
              content = {
                ...emptyContent(),
                currency: source.currency,
                taxBasis: source.taxBasis,
                lines: old.lines.map((l) => ({
                  key: randomUUID(),
                  itemId: l.itemId,
                  code: l.code,
                  name: l.name,
                  categoryId: l.categoryId,
                  category: l.category,
                  unitId: l.unitId,
                  unit: l.unit,
                  quantity: l.quantity,
                  laborUnitCost: l.laborUnitCost,
                  directUnitCost: l.directUnitCost ?? "0",
                  status: "ACTIVE",
                  materials: l.materials.map((m) => ({
                    materialId: m.materialId,
                    name: m.name,
                    unitId: m.unitId,
                    unit: m.unit,
                    coefficient: m.coefficient,
                    unitPrice: m.unitPrice,
                    sourcePriceId: m.sourcePriceId,
                  })),
                })),
              };
            }
          }
          if (
            (await schemaCapabilities()).referenceCosts &&
            (b.useReferenceCosts ?? pristineCatalogTemplate)
          ) {
            if (pristineCatalogTemplate)
              content = await initialReferenceContent(tx, content);
            else {
              const review = await costReview(tx, 1, content);
              content = applyReviewedCosts(
                content,
                review.changes,
                review.changes.filter((c) => !c.manual).map((c) => c.key),
              );
            }
          }
          content = {
            ...content,
            lines: content.lines.map((l) => ({ ...l, key: randomUUID() })),
          };
          await validateReferences(tx, content);
          const budget = await tx.budget.create({
            data: {
              workId: b.workId,
              name: b.name,
              draft: { create: { content: json(content) } },
            },
          });
          await audit(tx, actor, "CREATE", "Budget", budget.id, {
            sourceVersionId: b.sourceVersionId ?? null,
            templateId: b.templateId ?? null,
          });
          return budget;
        },
      ),
      201,
    );
  }
  if (resource === "budget-editor" && key) {
    if (method === "GET" && !action) {
      const budget = found(
        await db.budget.findUnique({
          where: { id: key },
          include: {
            work: { include: { client: true } },
            draft: true,
            versions: { include: { issue: true }, orderBy: { number: "desc" } },
          },
        }),
      );
      return ok(budget);
    }
    if (method === "POST" && action === "calculate")
      return ok(calculateCommercial(await parse(request, editorContentSchema)));
    if (method === "POST" && action === "price-updates") {
      found(
        await db.budget.findUnique({
          where: { id: key },
          select: { id: true },
        }),
      );
      const content = await parse(request, editorContentSchema);
      const review = await costReview(db, 0, content);
      return ok({
        changes: review.changes
          .filter((c) => c.kind === "MATERIAL")
          .map((c) => ({
            lineKey: c.lineKey,
            materialId: content.lines.find((l) => l.key === c.lineKey)!
              .materials[c.index].materialId,
            name: c.name,
            previous: c.previous,
            next: c.next,
            sourcePriceId: c.sourceId,
            effectiveAt:
              c.dateLabel?.length === 7
                ? c.dateLabel + "-01T12:00:00Z"
                : c.dateLabel,
            source: c.source,
            manual: c.manual,
          })),
      });
    }
    if (method === "PUT" && !action) {
      const b = await parse(request, draftSaveSchema);
      return ok(
        await transaction(async (tx) => {
          found(await tx.budget.findUnique({ where: { id: key } }));
          await validateReferences(tx, b.content);
          const old = await tx.budgetDraft.findUnique({
            where: { budgetId: key },
          });
          if (
            !old &&
            (await tx.budgetVersion.count({ where: { budgetId: key } }))
          )
            throw new ApiError(
              422,
              "LEGACY_COST_VERSION",
              "Conservá las versiones de costos anteriores y copialas a un presupuesto comercial nuevo.",
            );
          if ((old?.revision ?? 0) !== b.revision)
            throw new ApiError(
              409,
              "DRAFT_CONFLICT",
              "El borrador cambió en otra sesión. Tus cambios siguen en pantalla; recargá antes de reemplazarlo.",
            );
          // An acknowledgement cannot erase a source completeness marker.
          // Concrete per-line evidence can resolve it in the calculation.
          if (
            old &&
            (old.content as { materialDemandIncomplete?: boolean })
              .materialDemandIncomplete
          )
            b.content.materialDemandIncomplete = true;
          for (const prior of (old?.content as EditorContent | undefined)
            ?.lines ?? []) {
            const current = b.content.lines.find((l) => l.key === prior.key);
            if (current && prior.materialReview && !current.materialReview)
              current.materialReview = prior.materialReview;
          }
          // Revalidate after retaining source evidence: a client cannot omit the
          // review field and persist a VERIFIED composition without materials.
          editorContentSchema.parse(b.content);
          const draft = old
            ? await tx.budgetDraft.update({
                where: { budgetId: key },
                data: { content: json(b.content), revision: { increment: 1 } },
              })
            : await tx.budgetDraft.create({
                data: { budgetId: key, content: json(b.content) },
              });
          await audit(tx, actor, "SAVE_DRAFT", "Budget", key, {
            revision: draft.revision,
            compositionChanges: b.content.lines
              .filter((l) => {
                const previous = (
                  old?.content as EditorContent | undefined
                )?.lines.find((x) => x.key === l.key);
                return (
                  JSON.stringify([
                    previous?.materials,
                    previous?.directUnitCost,
                    previous?.materialsIncludedInDirect,
                    previous?.materialReview,
                  ]) !==
                  JSON.stringify([
                    l.materials,
                    l.directUnitCost,
                    l.materialsIncludedInDirect,
                    l.materialReview,
                  ])
                );
              })
              .map((l) => ({
                lineKey: l.key,
                before: (old?.content as EditorContent | undefined)?.lines.find(
                  (x) => x.key === l.key,
                ),
                after: l,
              })),
          });
          return draft;
        }),
      );
    }
    if (method === "POST" && action === "issue") {
      const b = await parse(request, issueSchema);
      return ok(
        await idempotent(
          actor,
          `budget-issue:${key}`,
          request.headers.get("idempotency-key") ?? "",
          b,
          async (tx) => {
            const budget = found(
              await tx.budget.findUnique({
                where: { id: key },
                include: { work: { include: { client: true } }, draft: true },
              }),
            );
            if (!budget.draft || budget.draft.revision !== b.revision)
              throw new ApiError(
                409,
                "DRAFT_CONFLICT",
                "Guardá y revisá el borrador actual antes de emitir.",
              );
            const content = editorContentSchema.parse(budget.draft.content),
              calculation = calculateCommercial(content);
            if (!budget.work.client)
              throw new ApiError(
                422,
                "CLIENT_REQUIRED",
                "La obra necesita un cliente vinculado.",
              );
            if (!calculation.complete)
              throw new ApiError(
                422,
                "INCOMPLETE_BUDGET",
                "Completá las partidas antes de emitir.",
                calculation.issues,
              );
            await validateReferences(tx, content);
            const commercial = {
              client: {
                name: budget.work.client.name,
                taxId: budget.work.client.taxId,
                address: budget.work.client.address,
              },
              work: { name: budget.work.name, address: budget.work.address },
              name: budget.name,
              conditions: content.conditions,
              exclusions: content.exclusions,
              observations: content.observations,
              deadline: content.deadline,
              pdfTemplateVersion: 1,
              nonPricedLines: content.lines
                .filter((l) => l.status !== "ACTIVE")
                .map((l) => ({
                  category: l.category,
                  name: l.name,
                  status: l.status as "INCLUDED" | "EXCLUDED",
                })),
            };
            const contentHash = hash({ content, commercial });
            const previous = await tx.budgetVersion.findFirst({
              where: { budgetId: key, issue: { isNot: null } },
              include: { issue: true },
              orderBy: { number: "desc" },
            });
            if (previous?.issue?.contentHash === contentHash) return previous;
            const latest = await tx.budgetVersion.aggregate({
              where: { budgetId: key },
              _max: { number: true },
            });
            const reference = await tx.budgetVersion.findFirst({
              where: { budget: { workId: budget.workId }, status: "REFERENCE" },
              select: { id: true, budgetId: true },
            });
            const useReference = !reference || reference.budgetId === key;
            if (useReference)
              await tx.budgetVersion.updateMany({
                where: {
                  budget: { workId: budget.workId },
                  status: "REFERENCE",
                },
                data: { status: "ARCHIVED" },
              });
            const issuedAt = new Date();
            const version = await tx.budgetVersion.create({
              data: {
                budgetId: key,
                number: (latest._max.number ?? 0) + 1,
                status: useReference ? "REFERENCE" : "DRAFT",
                currency: content.currency,
                taxBasis: content.taxBasis,
                precision: 2,
                roundingMode: "HALF_UP",
                createdById: actor.id,
                snapshot: json({
                  ...calculation,
                  editorContent: content,
                  commercial: {
                    ...commercial,
                    issuedAt: issuedAt.toISOString(),
                  },
                  computationId: key,
                  computationName: budget.name,
                  overrides: [],
                }),
                issue: {
                  create: {
                    contentHash,
                    issuedAt,
                    commercialTotal: calculation.commercialTotal,
                  },
                },
                materials: {
                  create: calculation.materialsByCategory.map((m) => ({
                    materialId: m.materialId,
                    unitId: m.unitId,
                    categoryId: m.categoryId,
                    quantity: m.quantity,
                  })),
                },
              },
              include: { issue: true },
            });
            await audit(tx, actor, "ISSUE", "BudgetVersion", version.id, {
              budgetId: key,
              number: version.number,
              referenceUpdated: useReference,
              contentHash,
            });
            return version;
          },
        ),
        201,
      );
    }
    if (method === "POST" && action === "preview") {
      const content = await parse(request, editorContentSchema),
        calculation = calculateCommercial(content);
      if (!calculation.complete)
        throw new ApiError(
          422,
          "INCOMPLETE_BUDGET",
          "Completá las partidas para previsualizar.",
          calculation.issues,
        );
      const budget = found(
        await db.budget.findUnique({
          where: { id: key },
          include: { work: { include: { client: true } } },
        }),
      );
      return pdfResponse(
        await commercialPdf(
          calculation,
          {
            name: budget.name,
            client: budget.work.client ?? {
              name: "Cliente sin vincular",
              taxId: null,
              address: null,
            },
            work: budget.work,
            conditions: content.conditions,
            exclusions: content.exclusions,
            observations: content.observations,
            deadline: content.deadline,
            issuedAt: new Date().toISOString(),
            nonPricedLines: content.lines
              .filter((l) => l.status !== "ACTIVE")
              .map((l) => ({
                category: l.category,
                name: l.name,
                status: l.status as "INCLUDED" | "EXCLUDED",
              })),
          },
          "Vista previa",
        ),
      );
    }
  }
  if (resource === "budget-issues" && key && method === "GET") {
    requireRoles(actor, "GERENCIA", "COMPUTO");
    const version = found(
      await db.budgetVersion.findUnique({
        where: { id: key },
        include: { issue: true },
      }),
    );
    if (!version.issue)
      throw new ApiError(
        422,
        "LEGACY_COST_VERSION",
        "Versión de costos anterior: copiá a un borrador para emitir comercialmente.",
      );
    const snapshot = version.snapshot as unknown as Parameters<
      typeof commercialPdf
    >[0] & { commercial: Parameters<typeof commercialPdf>[1] };
    return pdfResponse(
      await commercialPdf(snapshot, snapshot.commercial, `R${version.number}`),
    );
  }
  throw new ApiError(405, "METHOD_NOT_ALLOWED", "Operación no permitida.");
}
function pdfResponse(bytes: Uint8Array) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="presupuesto.pdf"',
    },
  });
}
function sourceIssues() {
  return (
    (baseSource.issues as { row: number; message: string }[] | undefined) ?? []
  );
}
