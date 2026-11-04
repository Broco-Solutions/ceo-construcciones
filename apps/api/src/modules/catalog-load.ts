import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { transaction, type Tx } from "../core/db";
import { type Actor, requireRoles } from "../core/auth";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { editorContentSchema, type EditorContent } from "./commercial-domain";
import { nonnegative } from "./shared";
import { referenceCostsEnabled, activityCostingSchema } from "./cost-references";
import { completeBaseMaterialLinks, materialLinkageSchema } from './base-material-links';
const nullable = nonnegative.nullable();
const inventorySchema = z.object({
  format: z.literal("ceo-catalog-inventory-v1"),
  extractorVersion: z.literal(1),
  sourceLogical: z.enum(["BASE-CEO", "DG-CEO"]).default("BASE-CEO"),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  categories: z.array(z.object({ key: z.string(), name: z.string() })),
  prices: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      unit: z.string(),
      presentationQuantity: nullable,
      net: nullable,
      gross: nullable,
      date: z.string().nullable(),
      datePrecision: z.string(),
      source: z.string(),
      status: z.string(),
      issues: z.array(z.string()),
      evidence: z.string(),
    }),
  ),
  labor: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      unit: z.string(),
      kind: z.string(),
      canonicalSourceKey: z.string().optional(),
      value: nullable,
      source: z.string(),
      date: z.string().nullable(),
      datePrecision: z.string(),
      evidence: z.string(),
    }),
  ),
  activities: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      categoryKey: z.string(),
      unit: z.string(),
      labor: nullable,
      direct: nullable,
      materialLinkage: materialLinkageSchema.optional(),
      laborComposition: z.object({
        reconciled: z.boolean(),
        components: z.array(
          z.object({ sourceKey: z.string(), coefficient: nonnegative }),
        ),
        evidence: z.array(z.string()),
        issue: z.string().nullable(),
      }),
      materialComposition: z.object({
        materials: z.array(
          z.object({
            name: z.string(),
            unit: z.string(),
            coefficient: nonnegative,
            unitPrice: nullable,
            cells: z.array(z.string()),
            priceSourceKey: z.string().nullable(),
          }),
        ),
        warnings: z.array(z.string()),
      }),
    }),
  ),
});
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const code = (kind: string, key: string) =>
  "CEO-" + kind + "-" + hash(key).slice(0, 16);

/** Entire validated load is atomic, serialized by source. No operational entities. */
export async function applyCatalogInventory(
  input: unknown,
  expectedHash: string,
  actor: Actor,
) {
  requireRoles(actor, "GERENCIA");
  await referenceCostsEnabled();
  const source = inventorySchema.parse(input);
  if (source.sourceSha256 !== expectedHash)
    throw new ApiError(
      409,
      "SOURCE_HASH_MISMATCH",
      "El hash de la fuente no coincide con el confirmado.",
    );
  return transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(440411042026)`;
    const summary = {
      created: {} as Record<string, number>,
      reused: {} as Record<string, number>,
      reconciledCategories: [] as string[],
      incomplete: [] as { kind: string; key: string; detail: string }[],
      conflicts: [] as { kind: string; key: string; detail: string }[],
      correctedSourceLinks: [] as string[],
      retiredProvisionalServices: [] as string[],
      retiredPriceReferences: [] as string[],
    };
    const origins = await tx.catalogOrigin.findMany({
        where: { source: source.sourceLogical },
      }),
      units = await tx.unit.findMany();
    const count = (type: "created" | "reused", kind: string) => {
      summary[type][kind] = (summary[type][kind] ?? 0) + 1;
    };
    async function retirePrice(
      origin: (typeof origins)[number],
      reason: string,
    ) {
      const current = await tx.materialPrice.findUnique({
        where: { id: origin.entityId },
      });
      if (!current || hash(current) !== origin.installedHash)
        throw new ApiError(
          409,
          "SOURCE_PRICE_CONFLICT",
          "Referencia modificada; no se sustituye.",
        );
      origin.kind = "price-retired";
      origin.sourceKey += ":retired:" + origin.entityId;
      origin.evidence = {
        ...(origin.evidence as Record<string, Prisma.JsonValue>),
        correction: reason,
      };
      await tx.catalogOrigin.update({
        where: { id: origin.id },
        data: {
          kind: origin.kind,
          sourceKey: origin.sourceKey,
          evidence: origin.evidence,
        },
      });
      summary.retiredPriceReferences.push(origin.entityId);
      await audit(
        tx,
        actor,
        "RETIRE_PROVISIONAL_PRICE_REFERENCE",
        "MaterialPrice",
        origin.entityId,
        { reason },
      );
    }
    async function map(
      kind: string,
      key: string,
      data: unknown,
      create: () => Promise<{ id: string; reused?: boolean }>,
      read: (id: string) => Promise<unknown>,
    ) {
      let old = origins.find((o) => o.kind === kind && o.sourceKey === key);
      if (old && kind === "price" && old.sourceHash !== hash(data)) {
        const previous = (old.evidence as { record: Record<string, unknown> })
            .record,
          next = data as Record<string, unknown>;
        const identity = (r: Record<string, unknown>) => [
          r.key,
          r.name,
          r.unit,
          r.presentationQuantity,
          r.net,
          r.gross,
          r.taxBasis,
          r.quotedColumn,
        ];
        if (isDeepStrictEqual(identity(previous), identity(next))) {
          await retirePrice(
            old,
            "Corrección documentada de fecha/fuente del encabezado original; importes intactos.",
          );
          old = undefined;
        }
      }
      if (old) {
        const current = await read(old.entityId);
        if (!current || hash(current) !== old.installedHash)
          summary.conflicts.push({
            kind,
            key,
            detail: "Destino modificado por usuario; se conserva.",
          });
        const materialIdentity = (value: unknown) => {
          const r = value as Record<string, unknown>;
          return {
            name: r.name,
            unit: r.unit,
            cells: r.cells,
            priceSourceKey: r.priceSourceKey,
          };
        };
        // A scaled consumption belongs to its activity, never to material identity.
        const sameSource =
          kind === "material"
            ? hash({
                name: (
                  old.evidence as { record: { name: string; unit: string } }
                ).record.name,
                unit: (
                  old.evidence as { record: { name: string; unit: string } }
                ).record.unit,
              }) ===
              hash({
                name: (data as { name: string }).name,
                unit: (data as { unit: string }).unit,
              })
            : kind === "recipe-material"
              ? hash(
                  materialIdentity(
                    (old.evidence as { record: unknown }).record,
                  ),
                ) === hash(materialIdentity(data))
              : old.sourceHash === hash(data);
        if (!sameSource)
          summary.conflicts.push({
            kind,
            key,
            detail:
              "La fuente cambió; requiere revisar correspondencia, sin sobrescritura.",
          });
        count("reused", kind);
        return old.entityId;
      }
      const row = await create(),
        current = await read(row.id);
      const mapping = await tx.catalogOrigin.create({
        data: {
          source: source.sourceLogical,
          kind,
          sourceKey: key,
          entityId: row.id,
          sourceHash: hash(data),
          installedHash: hash(current),
          evidence: JSON.parse(
            JSON.stringify({
              sourceSha256: source.sourceSha256,
              extractorVersion: source.extractorVersion,
              record: data,
            }),
          ),
        },
      });
      origins.push(mapping);
      count(row.reused ? "reused" : "created", kind);
      return row.id;
    }
    async function unit(symbol: string) {
      const aliases: Record<string, string> = {
        ML: "m",
        M: "m",
        M2: "m²",
        M3: "m³",
        U: "un",
        UNID: "un",
        UN: "un",
        KG: "kg",
        LTS: "L",
        L: "L",
        GL: "gl",
      };
      symbol = aliases[symbol.trim().toUpperCase()] ?? symbol.trim();
      let found = units.find((u) => u.symbol === symbol);
      if (!found) {
        found = await tx.unit.create({
          data: { code: code("U", symbol), name: symbol, symbol },
        });
        units.push(found);
        count("created", "unit");
      }
      return found.id;
    }
    const categories = new Map<string, string>();
    const installations = await tx.auditLog.findMany({
      where: {
        action: "INSTALL_BASE",
        entityType: "BudgetTemplate",
        after: { path: ["sourceSha256"], equals: source.sourceSha256 },
      },
    });
    const previousTemplates = await tx.budgetTemplate.findMany({
      where: { id: { in: installations.map((a) => a.entityId) } },
    });
    const previousCategories = await tx.category.findMany();
    for (const c of source.categories) {
      const claims = new Set<string>();
      for (const template of previousTemplates) {
        const parsed = editorContentSchema.safeParse(template.content);
        if (!parsed.success) continue;
        for (const line of parsed.data.lines) {
          const activity = source.activities.find(
            (a) => a.key.replace("COSTO!B", "COSTO:") === line.code,
          );
          if (activity?.categoryKey === c.key && line.category === c.name)
            claims.add(line.categoryId);
        }
      }
      const legacy =
        claims.size === 1
          ? previousCategories.find(
              (row) => row.id === [...claims][0] && row.name === c.name,
            )
          : undefined;
      const mapping = origins.find(
        (o) => o.kind === "category" && o.sourceKey === c.key,
      );
      if (legacy && mapping && mapping.entityId !== legacy.id) {
        // Correct only this loader's untouched provisional rows. No user documents
        // or legacy categories are deleted or relinked.
        const provisional = previousCategories.find(
          (row) => row.id === mapping.entityId,
        );
        const activityMappings = origins.filter((o) => o.kind === "activity"),
          templateMappings = origins.filter((o) => o.kind === "template");
        const ownedItems = await tx.apuItem.findMany({
          where: { categoryId: mapping.entityId },
          include: { components: true },
        });
        const templates = await tx.budgetTemplate.findMany();
        const drafts = await tx.budgetDraft.findMany();
        const contains = (value: unknown) => {
          const parsed = editorContentSchema.safeParse(value);
          return (
            parsed.success &&
            parsed.data.lines.some((l) => l.categoryId === mapping.entityId)
          );
        };
        const touched =
          ownedItems.some((item) => {
            const origin = activityMappings.find((o) => o.entityId === item.id);
            return !origin || hash(item) !== origin.installedHash;
          }) ||
          drafts.some((d) => contains(d.content)) ||
          templates.some(
            (t) =>
              contains(t.content) &&
              (!templateMappings.some((o) => o.entityId === t.id) ||
                hash(t) !==
                  templateMappings.find((o) => o.entityId === t.id)!
                    .installedHash),
          );
        const external =
          (await tx.material.count({
            where: { categoryId: mapping.entityId },
          })) +
          (await tx.materialRequest.count({
            where: { categoryId: mapping.entityId },
          })) +
          (await tx.stockMovement.count({
            where: { categoryId: mapping.entityId },
          })) +
          (await tx.budgetMaterial.count({
            where: { categoryId: mapping.entityId },
          }));
        if (
          provisional &&
          provisional.code === code("R", c.key) &&
          hash(provisional) === mapping.installedHash &&
          !touched &&
          !external
        ) {
          for (const item of ownedItems) {
            const updated = await tx.apuItem.update({
                where: { id: item.id },
                data: { categoryId: legacy.id },
                include: { components: true },
              }),
              origin = activityMappings.find((o) => o.entityId === item.id)!;
            origin.installedHash = hash(updated);
            await tx.catalogOrigin.update({
              where: { id: origin.id },
              data: { installedHash: origin.installedHash },
            });
          }
          for (const template of templates.filter((t) => contains(t.content))) {
            const content = editorContentSchema.parse(template.content);
            for (const line of content.lines)
              if (line.categoryId === mapping.entityId)
                line.categoryId = legacy.id;
            const updated = await tx.budgetTemplate.update({
                where: { id: template.id },
                data: { content },
              }),
              origin = templateMappings.find(
                (o) => o.entityId === template.id,
              )!;
            origin.installedHash = hash(updated);
            await tx.catalogOrigin.update({
              where: { id: origin.id },
              data: { installedHash: origin.installedHash },
            });
          }
          const provisionalId = mapping.entityId;
          mapping.entityId = legacy.id;
          mapping.installedHash = hash(legacy);
          await tx.catalogOrigin.update({
            where: { id: mapping.id },
            data: { entityId: legacy.id, installedHash: mapping.installedHash },
          });
          await tx.category.delete({ where: { id: provisionalId } });
          await audit(
            tx,
            actor,
            "RECONCILE_SOURCE_CATEGORY",
            "CatalogOrigin",
            mapping.id,
            {
              previousProvisionalId: provisionalId,
              canonicalId: legacy.id,
              sourceHash: source.sourceSha256,
            },
          );
          summary.reconciledCategories.push(c.key);
        }
      }
      categories.set(
        c.key,
        await map(
          "category",
          c.key,
          c,
          async () =>
            legacy
              ? { id: legacy.id, reused: true }
              : tx.category.create({
                  data: { code: code("R", c.key), name: c.name },
                }),
          (id) => tx.category.findUnique({ where: { id } }),
        ),
      );
    }
    const materials = new Map<
      string,
      { id: string; unitId: string; priceId: string | null }
    >();
    const serviceKeys = new Set<string>();
    for (const p of source.prices) {
      // Services found in PRECIOS remain source evidence; never fictitious stock.
      if (
        /^(?:VOLQUETE\b|BAÑO QUIMICO\b|BOMBEO\b)|ALQUILER|MONTAJE|LIMPIEZA|TRANSPORTE|BOMBA|MANO DE OBRA/i.test(
          p.name,
        ) ||
        /ALQUILERES DE HERRAMIENTAS/i.test(p.source)
      ) {
        for (const origin of origins.filter(
          (o) =>
            o.kind === "price" &&
            (o.sourceKey === p.key || o.sourceKey === p.key + ":EXCLUDED"),
        ))
          await retirePrice(
            origin,
            "Servicio/equipo de alquiler del original; no es material de stock.",
          );
        serviceKeys.add(p.key);
        summary.incomplete.push({
          kind: "service",
          key: p.key,
          detail: "Referencia de servicio; no se crea material de stock.",
        });
        continue;
      }
      if (!p.date)
        for (const origin of origins.filter(
          (o) =>
            o.kind === "price" &&
            (o.sourceKey === p.key || o.sourceKey === p.key + ":EXCLUDED"),
        ))
          await retirePrice(
            origin,
            "El encabezado no acredita fecha; no heredar la del proveedor anterior.",
          );
      const unitId = await unit(p.unit);
      const id = await map(
        "material",
        p.key,
        p,
        () =>
          tx.material.create({
            data: { code: code("M", p.key), name: p.name, unitId },
          }),
        (id) => tx.material.findUnique({ where: { id } }),
      );
      let priceId: string | null = null;
      if (
        p.presentationQuantity !== null &&
        new Prisma.Decimal(p.presentationQuantity).gt(0)
      ) {
        const presentationId = await map(
          "presentation",
          p.key,
          { key: p.key, quantity: p.presentationQuantity, unitId },
          () =>
            tx.presentation.create({
              data: {
                materialId: id,
                name: `${p.presentationQuantity} ${p.unit} · ${p.key}`,
                baseQuantity: p.presentationQuantity!,
              },
            }),
          (id) => tx.presentation.findUnique({ where: { id } }),
        );
        if (p.gross !== null && p.date && p.status === "HISTORICAL")
          priceId = await map(
            "price",
            p.key,
            p,
            () =>
              tx.materialPrice.create({
                data: {
                  materialId: id,
                  presentationId,
                  price: p.gross!,
                  baseQuantity: p.presentationQuantity!,
                  currency: "ARS",
                  taxBasis: "INCLUDED",
                  effectiveAt: new Date(
                    p.date +
                      (p.datePrecision === "DAY"
                        ? "T12:00:00Z"
                        : "-01T12:00:00Z"),
                  ),
                  source: `${p.source} · ${p.datePrecision === "DAY" ? "día " + p.date : "mes " + p.date + ", día no informado"} · ${p.key}`,
                },
              }),
            (id) => tx.materialPrice.findUnique({ where: { id } }),
          );
        // Both amounts are explicitly supplied in E ($) and F ($ + IVA).
        // Store separate compatible series; this is not a fiscal conversion.
        if (p.net !== null && p.date && p.status === "HISTORICAL")
          await map(
            "price",
            p.key + ":EXCLUDED",
            { ...p, quotedColumn: "E", taxBasis: "EXCLUDED" },
            () =>
              tx.materialPrice.create({
                data: {
                  materialId: id,
                  presentationId,
                  price: p.net!,
                  baseQuantity: p.presentationQuantity!,
                  currency: "ARS",
                  taxBasis: "EXCLUDED",
                  effectiveAt: new Date(
                    p.date +
                      (p.datePrecision === "DAY"
                        ? "T12:00:00Z"
                        : "-01T12:00:00Z"),
                  ),
                  source: `${p.source} · ${p.datePrecision === "DAY" ? "día " + p.date : "mes " + p.date + ", día no informado"} · ${p.key}`,
                },
              }),
            (id) => tx.materialPrice.findUnique({ where: { id } }),
          );
      }
      if (!priceId)
        summary.incomplete.push({
          kind: "price",
          key: p.key,
          detail:
            p.issues.join("; ") ||
            "Fecha/precio sin evidencia suficiente; referencia sin valor aplicable.",
        });
      materials.set(p.key, { id, unitId, priceId });
    }
    const labor = new Map<
      string,
      { resourceId: string; rateId: string | null }
    >();
    for (const l of source.labor) {
      if (l.kind === "COMBINED_SERVICE") {
        summary.incomplete.push({
          kind: "labor",
          key: l.key,
          detail:
            "Suministro y MO combinados, no se importa como tarifa salarial.",
        });
        continue;
      }
      let canonicalResource: { id: string } | null = null;
      if (l.canonicalSourceKey) {
        if (source.sourceLogical !== "DG-CEO" || l.kind !== "CATEGORY")
          throw new ApiError(
            422,
            "INVALID_SOURCE_MAPPING",
            "Correspondencia de origen no autorizada.",
          );
        const mapping = await tx.catalogOrigin.findUniqueOrThrow({
          where: {
            source_kind_sourceKey: {
              source: "BASE-CEO",
              kind: "labor-resource",
              sourceKey: l.canonicalSourceKey,
            },
          },
        });
        const record = (
          mapping.evidence as {
            record: { name: string; unit: string; kind: string };
          }
        ).record;
        if (
          record.name.trim() !== l.name.trim() ||
          record.unit !== l.unit ||
          record.kind !== l.kind
        )
          throw new ApiError(
            409,
            "SOURCE_IDENTITY_CONFLICT",
            "La identidad de la categoría histórica no coincide con BASE.",
          );
        const current = await tx.laborResource.findUniqueOrThrow({
          where: { id: mapping.entityId },
        });
        if (hash(current) !== mapping.installedHash)
          throw new ApiError(
            409,
            "SOURCE_IDENTITY_CONFLICT",
            "El recurso BASE fue modificado; revisar correspondencia DG.",
          );
        canonicalResource = current;
      }
      const resourceId = await map(
        "labor-resource",
        l.key,
        l,
        () =>
          canonicalResource
            ? Promise.resolve({ id: canonicalResource.id, reused: true })
            : tx.laborResource.create({
                data: {
                  code: code("MO", l.key),
                  name: l.name,
                  unit: l.unit,
                  kind: l.kind,
                },
              }),
        (id) => tx.laborResource.findUnique({ where: { id } }),
      );
      let rateId: string | null = null;
      if (l.value !== null)
        rateId = await map(
          "labor-rate",
          l.key,
          l,
          () =>
            tx.laborRate.create({
              data: {
                resourceId,
                value: l.value!,
                currency: "ARS",
                taxBasis: "UNSPECIFIED",
                effectiveAt: l.date ? new Date(l.date + "-01T12:00:00Z") : null,
                dateLabel: l.date,
                datePrecision: l.date ? "MONTH" : "UNKNOWN",
                source: l.source,
                series: l.canonicalSourceKey ?? l.key,
                createdById: actor.id,
              },
            }),
          (id) => tx.laborRate.findUnique({ where: { id } }),
        );
      else
        summary.incomplete.push({
          kind: "labor",
          key: l.key,
          detail: "Tarifa ausente en " + l.evidence,
        });
      labor.set(l.key, { resourceId, rateId });
    }
    const lines: EditorContent["lines"] = [];
    for (const entry of source.activities) {
      // New proof is versioned independently; the PR14 origin fingerprint and
      // its original aggregate remain comparable and unchanged.
      const { materialLinkage: _linkage, ...a } = entry;
      const categoryId = categories.get(a.categoryKey)!,
        unitId = await unit(a.unit);
      const components: EditorContent["lines"][number]["materials"] = [];
      for (const m of a.materialComposition.materials) {
        if (m.priceSourceKey && serviceKeys.has(m.priceSourceKey)) continue;
        const mu = await unit(m.unit),
          candidate = m.priceSourceKey ? materials.get(m.priceSourceKey) : null;
        let materialId = candidate?.unitId === mu ? candidate.id : null;
        if (!materialId)
          materialId = await map(
            "recipe-material",
            m.cells[0],
            m,
            () =>
              tx.material.create({
                data: {
                  code: code("RM", m.cells[0]),
                  name: m.name,
                  unitId: mu,
                },
              }),
            (id) => tx.material.findUnique({ where: { id } }),
          );
        const old = components.find((c) => c.materialId === materialId);
        if (old)
          old.coefficient = new Prisma.Decimal(old.coefficient!)
            .add(m.coefficient)
            .toFixed();
        else
          components.push({
            materialId,
            name: m.name,
            unitId: mu,
            unit: m.unit,
            coefficient: m.coefficient,
            unitPrice: m.unitPrice,
            sourcePriceId: null,
          });
      }
      // A newly decoded direct PRECIOS reference can prove an old recipe row
      // was a service. Correct only this loader's unchanged provisional catalog;
      // issued snapshots, old templates and user edits are never rewritten.
      let correctedService = false;
      const oldActivity = origins.find(
        (o) => o.kind === "activity" && o.sourceKey === a.key,
      );
      const oldCosting = origins.find(
        (o) => o.kind === "activity-costing" && o.sourceKey === a.key,
      );
      const ownTemplate = origins.find((o) => o.kind === "template");
      if (oldActivity && oldCosting && ownTemplate) {
        const previous = (
          oldActivity.evidence as unknown as { record: typeof a }
        ).record;
        const ignoreLinks = (record: typeof a) => ({
          ...record,
          materialComposition: {
            ...record.materialComposition,
            materials: record.materialComposition.materials.map((m) => ({
              ...m,
              priceSourceKey: null,
            })),
          },
        });
        const newServices = a.materialComposition.materials.filter(
          (m, i) =>
            m.priceSourceKey &&
            serviceKeys.has(m.priceSourceKey) &&
            previous.materialComposition.materials[i] !== undefined,
        );
        if (
          newServices.length &&
          isDeepStrictEqual(ignoreLinks(previous), ignoreLinks(a))
        ) {
          const current = await tx.apuItem.findUnique({
            where: { id: oldActivity.entityId },
            include: { components: true },
          });
          const costing = await tx.activityCosting.findUnique({
            where: { itemId: oldCosting.entityId },
          });
          const template = await tx.budgetTemplate.findUnique({
            where: { id: ownTemplate.entityId },
          });
          if (
            current &&
            costing &&
            template &&
            hash(current) === oldActivity.installedHash &&
            hash(costing) === oldCosting.installedHash &&
            hash(template) === ownTemplate.installedHash
          ) {
            const serviceIds = newServices.flatMap((m) =>
              origins
                .filter(
                  (o) =>
                    (o.kind === "recipe-material" &&
                      o.sourceKey === m.cells[0]) ||
                    (o.kind === "material" && o.sourceKey === m.priceSourceKey),
                )
                .map((o) => o.entityId),
            );
            if (
              serviceIds.some((id) =>
                current.components.some((c) => c.materialId === id),
              )
            ) {
              await tx.apuMaterial.deleteMany({
                where: { itemId: current.id, materialId: { in: serviceIds } },
              });
              const refreshed = await tx.apuItem.findUniqueOrThrow({
                where: { id: current.id },
                include: { components: true },
              });
              oldActivity.installedHash = hash(refreshed);
              oldActivity.sourceHash = hash(a);
              oldActivity.evidence = {
                sourceSha256: source.sourceSha256,
                extractorVersion: source.extractorVersion,
                record: JSON.parse(JSON.stringify(a)),
              };
              await tx.catalogOrigin.update({
                where: { id: oldActivity.id },
                data: {
                  installedHash: oldActivity.installedHash,
                  sourceHash: oldActivity.sourceHash,
                  evidence: oldActivity.evidence,
                },
              });
              correctedService = true;
              summary.correctedSourceLinks.push(a.key);
              await audit(
                tx,
                actor,
                "CORRECT_VERIFIED_SERVICE_LINK",
                "ApuItem",
                current.id,
                { sourceKey: a.key, removedServiceMaterialIds: serviceIds },
              );
            }
          }
        }
      }
      const itemId = await map(
        "activity",
        a.key,
        a,
        () =>
          tx.apuItem.create({
            data: {
              code: code("A", a.key),
              name: a.name,
              categoryId,
              unitId,
              laborCost: a.labor,
              directCost: a.direct,
              laborCurrency: "ARS",
              laborTaxBasis: "UNSPECIFIED",
              components: {
                create: components
                  .filter((m) => new Prisma.Decimal(m.coefficient!).gt(0))
                  .map((m) => ({
                    materialId: m.materialId,
                    coefficient: m.coefficient!,
                  })),
              },
            },
          }),
        (id) =>
          tx.apuItem.findUnique({
            where: { id },
            include: { components: true },
          }),
      );
      const laborComponents = a.laborComposition.components.flatMap((c) => {
        const l = labor.get(c.sourceKey);
        return l?.rateId
          ? [
              {
                resourceId: l.resourceId,
                rateId: l.rateId,
                coefficient: c.coefficient,
              },
            ]
          : [];
      });
      const calculated =
        a.laborComposition.reconciled &&
        laborComponents.length === a.laborComposition.components.length;
      const review = {
        status:
          a.materialComposition.warnings.length ||
          (!components.length &&
            a.direct !== null &&
            new Prisma.Decimal(a.direct).gt(0) &&
            !/BAÑO|OBRADOR|MOVILIDAD|SEGURO|HIGIENE|SEGURIDAD/i.test(a.name))
            ? "UNRESOLVED"
            : components.length
              ? "VERIFIED"
              : "DIRECT",
        detail:
          a.materialComposition.warnings.join("; ") ||
          (!components.length
            ? "Agregado histórico sin composición física recuperada; revisar su alcance."
            : "Composición física del original, sin doble suma del agregado."),
        evidence: a.key,
      };
      let content = {
        currency: "ARS",
        taxBasis: "UNSPECIFIED",
        laborMode: calculated ? "CALCULATED" : "DIRECT",
        labor: calculated ? laborComponents : [],
        materials: [],
        materialsIncludedInDirect: true,
        materialReview: review,
        notice:
          "Suministro histórico agregado: sus materiales físicos no se suman otra vez. " +
          a.materialComposition.warnings.join("; "),
      };
      if (entry.materialLinkage && entry.materialLinkage.classification !== 'B') {
        const plan = entry.materialLinkage;
        content.materialReview = {
          status: plan.classification === 'A' ? 'DIRECT' : plan.physicalComplete ? 'VERIFIED' : 'UNRESOLVED',
          detail: plan.classification === 'A' ? 'Costo directo de origen; no produce materiales.' : 'Suministro histórico utilizable como agregado; la actualización por insumo sigue limitada por los datos indicados.',
          evidence: a.key,
        };
        content.notice = plan.classification === 'A' ? 'Costo directo legítimo de origen. No se deducen materiales.' : ('Suministro histórico agregado. ' + plan.issues.join('; ')).slice(0, 2000);
        if (oldCosting && oldActivity && (oldActivity.evidence as { sourceSha256?: string }).sourceSha256 === source.sourceSha256) {
          const saved = await tx.activityCosting.findUnique({ where: { itemId } });
          const current = await tx.apuItem.findUnique({ where: { id: itemId }, include: { components: true } });
          if (saved && current && hash(saved) === oldCosting.installedHash && hash(current) === oldActivity.installedHash && hash(saved.content) !== hash(content)) {
            const updated = await tx.activityCosting.update({ where: { itemId }, data: { content, revision: { increment: 1 } } });
            oldCosting.installedHash = hash(updated); oldCosting.sourceHash = hash(content);
            oldCosting.evidence = JSON.parse(JSON.stringify({ sourceSha256: source.sourceSha256, extractorVersion: source.extractorVersion, record: content }));
            await tx.catalogOrigin.update({ where: { id: oldCosting.id }, data: { installedHash: oldCosting.installedHash, sourceHash: oldCosting.sourceHash, evidence: oldCosting.evidence as Prisma.InputJsonValue } });
          }
        }
      }
      const installedLink = origins.find(o => o.kind === 'activity-linkage' && o.sourceKey === a.key);
      if (installedLink && oldCosting) {
        const saved = await tx.activityCosting.findUnique({ where: { itemId } });
        if (saved) content = activityCostingSchema.parse(saved.content) as typeof content;
      }
      if (correctedService && oldCosting) {
        const corrected = await tx.activityCosting.update({
          where: { itemId },
          data: { content, revision: { increment: 1 } },
        });
        oldCosting.installedHash = hash(corrected);
        oldCosting.sourceHash = hash(content);
        oldCosting.evidence = {
          sourceSha256: source.sourceSha256,
          extractorVersion: source.extractorVersion,
          record: JSON.parse(JSON.stringify(content)),
        };
        await tx.catalogOrigin.update({
          where: { id: oldCosting.id },
          data: {
            installedHash: oldCosting.installedHash,
            sourceHash: oldCosting.sourceHash,
            evidence: oldCosting.evidence,
          },
        });
        const template = await tx.budgetTemplate.findUniqueOrThrow({
          where: { id: ownTemplate!.entityId },
        });
        const parsed = editorContentSchema.parse(template.content);
        for (const line of parsed.lines)
          if (line.itemId === itemId) {
            line.materials = components;
            line.materialReview = review as typeof line.materialReview;
          }
        const updated = await tx.budgetTemplate.update({
          where: { id: template.id },
          data: { content: parsed },
        });
        ownTemplate!.installedHash = hash(updated);
        await tx.catalogOrigin.update({
          where: { id: ownTemplate!.id },
          data: { installedHash: ownTemplate!.installedHash },
        });
      }
      // Metadata from the guarded service correction is a costing definition,
      // as for every ordinary activity-costing mapping.
      if (
        oldCosting &&
        oldCosting.sourceHash === hash(a) &&
        isDeepStrictEqual(
          (oldCosting.evidence as { record: unknown }).record,
          a,
        )
      ) {
        const current = await tx.activityCosting.findUnique({
          where: { itemId },
        });
        if (current && hash(current) === oldCosting.installedHash) {
          oldCosting.sourceHash = hash(content);
          oldCosting.evidence = {
            sourceSha256: source.sourceSha256,
            extractorVersion: source.extractorVersion,
            record: JSON.parse(JSON.stringify(content)),
          };
          await tx.catalogOrigin.update({
            where: { id: oldCosting.id },
            data: {
              sourceHash: oldCosting.sourceHash,
              evidence: oldCosting.evidence,
            },
          });
        }
      }
      await map(
        "activity-costing",
        a.key,
        content,
        async () => {
          await tx.activityCosting.create({ data: { itemId, content } });
          return { id: itemId };
        },
        (id) => tx.activityCosting.findUnique({ where: { itemId: id } }),
      );
      if (
        a.materialComposition.warnings.length ||
        a.labor === null ||
        a.direct === null
      )
        summary.incomplete.push({
          kind: "activity",
          key: a.key,
          detail:
            [...a.materialComposition.warnings, a.laborComposition.issue]
              .filter(Boolean)
              .join("; ") || "Costo ausente en fuente.",
        });
      lines.push({
        key: randomUUID(),
        itemId,
        code: code("A", a.key),
        name: a.name,
        categoryId,
        category: source.categories.find((c) => c.key === a.categoryKey)!.name,
        unitId,
        unit: a.unit,
        quantity: "0",
        laborUnitCost: a.labor,
        directUnitCost: a.direct,
        status: "ACTIVE",
        materialsIncludedInDirect: true,
        materials: components,
        materialReview:
          review as EditorContent["lines"][number]["materialReview"],
      });
    }
    const content = editorContentSchema.parse({
      currency: "ARS",
      taxBasis: "UNSPECIFIED",
      markup: "50",
      conditions: "",
      exclusions: "",
      observations: "",
      deadline: "",
      lines,
    });
    if (source.sourceLogical === "BASE-CEO")
      await map(
        "template",
        "BASE-CEO-2026-10",
        {
          activities: source.activities.map((a) => a.key),
          sourceHash: source.sourceSha256,
        },
        () =>
          tx.budgetTemplate.create({
            data: { name: "BASE CEO — Octubre 2026", content },
          }),
        (id) => tx.budgetTemplate.findUnique({ where: { id } }),
      );
    const materialLinks = await completeBaseMaterialLinks(tx, source, actor);
    summary.conflicts.push(...materialLinks.conflicts);
    // Preserve the provisional identity for traceability, but don't offer an
    // unused, proven service as a stock material. Any user usage prevents this.
    const serviceCells = new Set(
      source.activities.flatMap((a) =>
        a.materialComposition.materials
          .filter((m) => m.priceSourceKey && serviceKeys.has(m.priceSourceKey))
          .map((m) => m.cells[0]),
      ),
    );
    for (const origin of origins.filter(
      (o) =>
        (o.kind === "recipe-material" && serviceCells.has(o.sourceKey)) ||
        (o.kind === "material" && serviceKeys.has(o.sourceKey)),
    )) {
      const material = await tx.material.findUnique({
        where: { id: origin.entityId },
      });
      if (!material?.active || hash(material) !== origin.installedHash)
        continue;
      const used =
        (await tx.apuMaterial.count({ where: { materialId: material.id } })) +
        (await tx.stockBalance.count({ where: { materialId: material.id } })) +
        (await tx.stockMovement.count({ where: { materialId: material.id } })) +
        (await tx.materialPrice.count({
          where: {
            materialId: material.id,
            id: {
              notIn: origins
                .filter((o) => o.kind === "price-retired")
                .map((o) => o.entityId),
            },
          },
        }));
      if (used) continue;
      const documents = [
        ...(await tx.budgetDraft.findMany({ select: { content: true } })),
        ...(await tx.budgetTemplate.findMany({ select: { content: true } })),
        ...(await tx.budgetVersion.findMany({ select: { snapshot: true } })),
      ];
      if (documents.some((d) => JSON.stringify(d).includes(material.id)))
        continue;
      const updated = await tx.material.update({
        where: { id: material.id },
        data: { active: false },
      });
      origin.installedHash = hash(updated);
      await tx.catalogOrigin.update({
        where: { id: origin.id },
        data: { installedHash: origin.installedHash },
      });
      summary.retiredProvisionalServices.push(origin.sourceKey);
      await audit(
        tx,
        actor,
        "RETIRE_UNUSED_IMPORTED_SERVICE",
        "Material",
        material.id,
        { sourceKey: origin.sourceKey },
      );
    }
    const run = await tx.catalogLoadRun.create({
      data: {
        sourceHash: source.sourceSha256,
        manifestHash: hash(source),
        actorId: actor.id,
        summary: JSON.parse(JSON.stringify({ ...summary, materialLinks })),
      },
    });
    await audit(tx, actor, "LOAD_REFERENCE_CATALOG", "CatalogLoadRun", run.id, {
      sourceHash: source.sourceSha256,
      created: summary.created,
      reused: summary.reused,
    });
    return { runId: run.id, ...summary, materialLinks };
  });
}
