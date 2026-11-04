import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Actor } from "../core/auth";
import type { Tx } from "../core/db";
import { audit } from "../core/audit";
import { editorContentSchema, type EditorContent } from "./commercial-domain";
import { activityCostingSchema } from "./cost-references";
import type { MaterialLinkage } from "../../scripts/base-material-linkage";
import { z } from "zod";
import { nonnegative } from "./shared";

export const materialLinkageSchema = z
  .object({
    version: z.literal(1),
    classification: z.enum(["A", "B", "C"]),
    physicalComplete: z.boolean(),
    economicComplete: z.boolean(),
    originalAggregate: nonnegative.nullable(),
    reconstructed: nonnegative.nullable(),
    difference: z.string().nullable(),
    reconciliation: z.string().nullable(),
    evidence: z.array(z.string()),
    issues: z.array(z.string()),
    materials: z.array(
      z.object({
        name: z.string(),
        unit: z.string(),
        coefficient: nonnegative,
        unitPrice: nonnegative.nullable(),
        cells: z.array(z.string()).min(1),
        priceSourceKey: z.string().nullable(),
        quote: z
          .object({
            key: z.string(),
            value: nonnegative,
            baseQuantity: nonnegative,
            factor: nonnegative,
            taxBasis: z.enum(["INCLUDED", "EXCLUDED", "UNSPECIFIED"]),
            source: z.string(),
            date: z.string().nullable(),
            datePrecision: z.string(),
            evidence: z.array(z.string()),
          })
          .nullable(),
      }),
    ),
  })
  .superRefine((v, c) => {
    if (
      v.classification === "B" &&
      (!v.physicalComplete ||
        !v.economicComplete ||
        v.issues.length ||
        !v.materials.length ||
        v.materials.some(
          (m) => !m.quote || new Prisma.Decimal(m.quote.baseQuantity).lte(0),
        ) ||
        v.originalAggregate === null ||
        v.reconstructed === null)
    )
      c.addIssue({
        code: "custom",
        message:
          "La composición conectable requiere prueba física y económica completa.",
      });
  });

export const catalogFingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
/** Completes only this loader's unchanged rows. History and drafts are never
 * queried for update, nor can a new cost reference be overwritten by reloading. */
export async function completeBaseMaterialLinks(
  tx: Tx,
  source: {
    sourceLogical: string;
    sourceSha256: string;
    activities: { key: string; materialLinkage?: MaterialLinkage }[];
  },
  actor: Actor,
) {
  const result = {
    linked: [] as string[],
    alreadyLinked: [] as string[],
    conflicts: [] as { kind: string; key: string; detail: string }[],
    createdReferences: 0,
    createdPresentations: 0,
  };
  if (source.sourceLogical !== "BASE-CEO") return result;
  const origins = await tx.catalogOrigin.findMany({
    where: { source: "BASE-CEO" },
  });
  const origin = (kind: string, key: string) =>
    origins.find((o) => o.kind === kind && o.sourceKey === key);
  async function track(
    kind: string,
    key: string,
    row: { id?: string },
    record: unknown,
  ) {
    const created = await tx.catalogOrigin.create({
      data: {
        source: "BASE-CEO",
        kind,
        sourceKey: key,
        entityId: row.id!,
        sourceHash: catalogFingerprint(record),
        installedHash: catalogFingerprint(row),
        evidence: json({ sourceSha256: source.sourceSha256, record }),
      },
    });
    origins.push(created);
    return created;
  }
  async function refresh(
    o: (typeof origins)[number],
    row: unknown,
    record?: unknown,
  ) {
    o.installedHash = catalogFingerprint(row);
    if (record !== undefined) {
      o.sourceHash = catalogFingerprint(record);
      o.evidence = JSON.parse(
        JSON.stringify({ sourceSha256: source.sourceSha256, record }),
      ) as Prisma.JsonValue;
    }
    await tx.catalogOrigin.update({
      where: { id: o.id },
      data: {
        installedHash: o.installedHash,
        sourceHash: o.sourceHash,
        evidence: o.evidence as Prisma.InputJsonValue,
      },
    });
  }
  const templateOrigin = origins.find((o) => o.kind === "template");
  const template = templateOrigin
    ? await tx.budgetTemplate.findUnique({
        where: { id: templateOrigin.entityId },
      })
    : null;
  const templateEditable =
    template &&
    templateOrigin &&
    catalogFingerprint(template) === templateOrigin.installedHash;
  const templateContent = template
    ? editorContentSchema.parse(template.content)
    : null;
  let templateChanged = false;
  for (const a of source.activities) {
    const plan = a.materialLinkage;
    if (!plan || plan.classification !== "B") continue;
    const own = origin("activity", a.key),
      costingOrigin = origin("activity-costing", a.key);
    if (
      !own ||
      !costingOrigin ||
      (own.evidence as { sourceSha256?: string }).sourceSha256 !==
        source.sourceSha256
    )
      continue;
    const item = await tx.apuItem.findUnique({
      where: { id: own.entityId },
      include: { components: true },
    });
    const costing = await tx.activityCosting.findUnique({
      where: { itemId: own.entityId },
    });
    if (
      !item ||
      !costing ||
      catalogFingerprint(item) !== own.installedHash ||
      catalogFingerprint(costing) !== costingOrigin.installedHash
    ) {
      result.conflicts.push({
        kind: "material-linkage",
        key: a.key,
        detail:
          "Actividad o definición editada por usuario; se preserva sin sustituir composición ni agregado.",
      });
      continue;
    }
    const previous = origin("activity-linkage", a.key);
    if (previous && previous.sourceHash === catalogFingerprint(plan)) {
      result.alreadyLinked.push(a.key);
      continue;
    }
    if (previous) {
      result.conflicts.push({
        kind: "material-linkage",
        key: a.key,
        detail:
          "Cambió la prueba de composición instalada; requiere conciliación específica.",
      });
      continue;
    }
    // Preflight every existing identity before writing this activity. User
    // changes are conflicts, not grounds to abort other verified recipes.
    let userConflict = false;
    for (const m of plan.materials) {
      const keys = [
        m.priceSourceKey,
        m.cells[0],
        m.quote ? m.quote.key + ":" + m.unit : null,
      ];
      for (const o of origins.filter(
        (o) =>
          keys.includes(o.sourceKey) &&
          [
            "material",
            "recipe-material",
            "material-equivalence",
            "price",
            "composition-price",
            "composition-presentation",
          ].includes(o.kind),
      )) {
        const row = [
          "material",
          "recipe-material",
          "material-equivalence",
        ].includes(o.kind)
          ? await tx.material.findUnique({ where: { id: o.entityId } })
          : o.kind.includes("presentation")
            ? await tx.presentation.findUnique({ where: { id: o.entityId } })
            : await tx.materialPrice.findUnique({ where: { id: o.entityId } });
        if (!row || catalogFingerprint(row) !== o.installedHash)
          userConflict = true;
      }
    }
    if (userConflict) {
      result.conflicts.push({
        kind: "material-linkage",
        key: a.key,
        detail:
          "Identidad, presentación o precio de origen editado: se conserva y se omite esta conversión.",
      });
      continue;
    }
    const components: EditorContent["lines"][number]["materials"] = [];
    const references: {
      materialId: string;
      priceId: string;
      sourcePriceBasis: string;
      sourcePriceFactor?: string;
    }[] = [];
    let invalid = false;
    for (const m of plan.materials) {
      if (!m.quote) {
        invalid = true;
        break;
      }
      const q = m.quote;
      const unit = await tx.unit.findFirst({ where: { symbol: m.unit } });
      if (!unit) {
        invalid = true;
        break;
      }
      const priceMaterial = m.priceSourceKey
        ? origin("material", m.priceSourceKey)
        : undefined;
      let material = priceMaterial
        ? await tx.material.findUnique({
            where: { id: priceMaterial.entityId },
          })
        : null;
      const identityKey = q.key + ":" + m.unit;
      if (material?.unitId !== unit.id) {
        const mapped =
          origin("material-equivalence", identityKey) ??
          origin("recipe-material", m.cells[0]);
        material = mapped
          ? await tx.material.findUnique({ where: { id: mapped.entityId } })
          : null;
        // The original contains the unit equivalence; old identities stay alive
        // for previous budgets/stock. Reuse the proven recipe identity.
        if (
          !material ||
          material.unitId !== unit.id ||
          catalogFingerprint(material) !== mapped!.installedHash
        ) {
          invalid = true;
          break;
        }
        if (!origin("material-equivalence", identityKey))
          await track("material-equivalence", identityKey, material, {
            quote: q.key,
            unit: m.unit,
            evidence: q.evidence,
          });
      } else if (
        priceMaterial &&
        catalogFingerprint(material) !== priceMaterial.installedHash
      ) {
        invalid = true;
        break;
      }
      const existingPrice = m.priceSourceKey
        ? origin("price", q.key)
        : undefined;
      let price = existingPrice
        ? await tx.materialPrice.findUnique({
            where: { id: existingPrice.entityId },
          })
        : null;
      if (
        price?.materialId !== material.id ||
        price.taxBasis !== q.taxBasis ||
        !price.price.eq(q.value) ||
        !price.baseQuantity.eq(q.baseQuantity)
      ) {
        const priceOrigin = origin("composition-price", identityKey);
        price = priceOrigin
          ? await tx.materialPrice.findUnique({
              where: { id: priceOrigin.entityId },
            })
          : null;
        if (!price) {
          const presentationOrigin = origin(
            "composition-presentation",
            identityKey,
          );
          const presentation = presentationOrigin
            ? await tx.presentation.findUniqueOrThrow({
                where: { id: presentationOrigin.entityId },
              })
            : await tx.presentation.create({
                data: {
                  materialId: material.id,
                  name: `${q.baseQuantity} ${m.unit} · referencia BASE`,
                  baseQuantity: q.baseQuantity,
                },
              });
          if (!presentationOrigin) {
            await track("composition-presentation", identityKey, presentation, {
              key: q.key,
              unit: m.unit,
              quantity: q.baseQuantity,
            });
            result.createdPresentations++;
          }
          // MaterialPrice V1 requires a timestamp. Epoch is a technical sentinel,
          // explicitly UNKNOWN in provenance, excluded from comparisons/latest.
          price = await tx.materialPrice.create({
            data: {
              materialId: material.id,
              presentationId: presentation.id,
              price: q.value,
              baseQuantity: q.baseQuantity,
              currency: "ARS",
              taxBasis: q.taxBasis,
              source: `${q.source} · ${q.date ?? "fecha no informada"} · ${q.key}`,
              effectiveAt: q.date
                ? new Date(
                    q.date +
                      (q.datePrecision === "DAY"
                        ? "T12:00:00Z"
                        : "-01T12:00:00Z"),
                  )
                : new Date(0),
            },
          });
          await track("composition-price", identityKey, price, {
            ...q,
            datePrecision: q.datePrecision,
            compositionReference: true,
            technicalDate:
              q.date === null ? "EPOCH_SENTINEL_NOT_QUOTATION_DATE" : null,
          });
          result.createdReferences++;
        } else if (catalogFingerprint(price) !== priceOrigin!.installedHash) {
          invalid = true;
          break;
        }
      } else if (
        existingPrice &&
        catalogFingerprint(price) !== existingPrice.installedHash
      ) {
        invalid = true;
        break;
      }
      if (
        q.factor !== "1" &&
        !origin("composition-expression", identityKey + ":" + q.factor)
      )
        await track(
          "composition-expression",
          identityKey + ":" + q.factor,
          price,
          { factor: q.factor, evidence: q.evidence },
        );
      const found = components.find((c) => c.materialId === material!.id);
      if (found)
        found.coefficient = new Prisma.Decimal(found.coefficient!)
          .add(m.coefficient)
          .toFixed();
      else {
        components.push({
          materialId: material.id,
          name: material.name,
          unitId: unit.id,
          unit: m.unit,
          coefficient: m.coefficient,
          unitPrice: price.price
            .div(price.baseQuantity)
            .mul(q.factor)
            .toDecimalPlaces(8)
            .toFixed(),
          sourcePriceId: price.id,
          sourcePriceBasis: price.id,
          ...(q.factor !== "1" ? { sourcePriceFactor: q.factor } : {}),
        });
        references.push({
          materialId: material.id,
          priceId: price.id,
          sourcePriceBasis: price.id,
          ...(q.factor !== "1" ? { sourcePriceFactor: q.factor } : {}),
        });
      }
    }
    if (invalid)
      throw Error(
        `Conflicto de identidad/precio al completar ${a.key}; lote revertido, sin cambios parciales.`,
      );
    const materialReview = {
      status: "VERIFIED" as const,
      detail:
        "Composición física y económica conciliada con las fórmulas del original. Referencias históricas; no implica cotización actual.",
      evidence: plan.evidence.join(" → ").slice(0, 1900),
    };
    const content = activityCostingSchema.parse({
      ...activityCostingSchema.parse(costing.content),
      materials: references,
      materialsIncludedInDirect: false,
      materialReview,
      notice:
        "Materiales calculados desde referencias de origen. Se conserva el IVA informado de cada insumo; la valoración comercial y la MO no se convierten.",
    });
    await tx.apuMaterial.deleteMany({ where: { itemId: item.id } });
    await tx.apuItem.update({
      where: { id: item.id },
      data: {
        directCost: "0",
        components: {
          create: components.map((m) => ({
            materialId: m.materialId,
            coefficient: m.coefficient!,
          })),
        },
      },
    });
    const updated = await tx.apuItem.findUniqueOrThrow({
      where: { id: item.id },
      include: { components: true },
    });
    const updatedCosting = await tx.activityCosting.update({
      where: { itemId: item.id },
      data: { content, revision: { increment: 1 } },
    });
    await refresh(own, updated); // Evidence retains the original aggregate verbatim.
    await refresh(costingOrigin, updatedCosting, content);
    const legacyMaterials = templateEditable
      ? templateContent?.lines.find((l) => l.itemId === item.id)?.materials
      : undefined;
    const linkedOrigin = await track("activity-linkage", a.key, updated, plan);
    // Keep the exact old recipe for a separate, opt-in draft composition change.
    linkedOrigin.evidence = json({
      sourceSha256: source.sourceSha256,
      record: plan,
      legacyMaterials,
      connectedMaterials: components,
    }) as Prisma.JsonValue;
    await tx.catalogOrigin.update({
      where: { id: linkedOrigin.id },
      data: { evidence: linkedOrigin.evidence as Prisma.InputJsonValue },
    });
    await audit(
      tx,
      actor,
      "CONNECT_VERIFIED_BASE_MATERIALS",
      "ApuItem",
      item.id,
      {
        sourceKey: a.key,
        previousAggregate: plan.originalAggregate,
        reconstructed: plan.reconstructed,
        difference: plan.difference,
        proof: plan.evidence,
        materialIds: components.map((m) => m.materialId),
      },
    );
    result.linked.push(a.key);
    if (templateEditable && templateContent) {
      const line = templateContent.lines.find((l) => l.itemId === item.id);
      if (line) {
        Object.assign(line, {
          materials: components,
          materialsIncludedInDirect: false,
          materialReview,
          directUnitCost: "0",
        });
        templateChanged = true;
      }
    }
  }
  if (templateChanged && templateEditable && templateContent) {
    const updated = await tx.budgetTemplate.update({
      where: { id: template!.id },
      data: { content: editorContentSchema.parse(templateContent) },
    });
    await refresh(templateOrigin!, updated);
  }
  if (result.linked.length && template && !templateEditable)
    result.conflicts.push({
      kind: "template",
      key: template.id,
      detail:
        "BASE particular editada: se conserva su receta; no se reemplaza ni duplica.",
    });
  return result;
}
