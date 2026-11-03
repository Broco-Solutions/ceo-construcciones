import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import source from "../../data/base-template.json";
import type { Tx } from "../core/db";
import type { Actor } from "../core/auth";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import { editorContentSchema, type EditorContent } from "./commercial-domain";
import { nonnegative } from "./shared";

const sourceSchema = z
  .object({
    format: z.literal("base-template-v1"),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    notice: z.string(),
    lines: z
      .array(
        z.object({
          sourceKey: z.string(),
          category: z.string(),
          name: z.string(),
          unit: z.string(),
          quantity: nonnegative,
          laborUnitCost: nonnegative.nullable(),
          directUnitCost: nonnegative.nullable(),
          materials: z.array(
            z.object({
              sourceKey: z.string(),
              name: z.string(),
              unit: z.string(),
              coefficient: nonnegative,
              unitPrice: nonnegative.nullable(),
            }),
          ),
        }),
      )
      .min(1)
      .max(500),
  })
  .passthrough();
export const baseSource = sourceSchema.parse(source);
const code = (kind: string, key: string) =>
  `BASE-${kind}-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
// Source-specific explicit aliases: in these construction sheets ML means
// metro lineal. This is never applied to arbitrary imported provider units.
const sourceUnits: Record<string, { symbol: string; name: string }> = {
  gl: { symbol: "gl", name: "Global" },
  ml: { symbol: "m", name: "Metro" },
  m2: { symbol: "m²", name: "Metro cuadrado" },
  m3: { symbol: "m³", name: "Metro cúbico" },
  kg: { symbol: "kg", name: "Kilogramo" },
  lts: { symbol: "L", name: "Litro" },
  h: { symbol: "h", name: "Hora" },
  u: { symbol: "un", name: "Unidad" },
  un: { symbol: "un", name: "Unidad" },
  mes: { symbol: "mes", name: "Mes" },
  bolsa: { symbol: "bolsa", name: "Bolsa" },
  rollo: { symbol: "rollo", name: "Rollo" },
};

/** Explicit user action, atomic and idempotent. No startup/data migration or
 * fuzzy matching. New reference materials get their own stable BASE codes. */
export async function installBase(tx: Tx, actor: Actor) {
  const name = `BASE · ${baseSource.sourceSha256.slice(0, 12)}`;
  const existing = await tx.budgetTemplate.findFirst({ where: { name } });
  if (existing) return existing;
  const units = new Map<string, { id: string; symbol: string }>(),
    categories = new Map<string, { id: string; name: string }>(),
    materials = new Map<string, { id: string; unitId: string }>();
  async function unit(raw: string) {
    const alias = sourceUnits[raw.toLowerCase().trim()];
    if (!alias)
      throw new ApiError(
        422,
        "BASE_UNIT",
        "Unidad BASE sin mapeo explícito: " + raw,
      );
    let u = units.get(alias.symbol);
    if (!u) {
      const previous = await tx.unit.findFirst({
        where: { symbol: alias.symbol },
        orderBy: { code: "asc" },
      });
      const saved =
        previous ??
        (await tx.unit.create({
          data: {
            code: code("U", alias.symbol),
            name: alias.name,
            symbol: alias.symbol,
          },
        }));
      u = { id: saved.id, symbol: alias.symbol };
      units.set(alias.symbol, u);
    }
    return u;
  }
  const lines: EditorContent["lines"] = [];
  for (const line of baseSource.lines) {
    let category = categories.get(line.category);
    if (!category) {
      category =
        (await tx.category.findFirst({
          where: { name: line.category },
          orderBy: { code: "asc" },
        })) ??
        (await tx.category.create({
          data: { code: code("R", line.category), name: line.category },
        }));
      categories.set(line.category, category);
    }
    const u = await unit(line.unit),
      components: EditorContent["lines"][number]["materials"] = [];
    for (const m of line.materials) {
      const mu = await unit(m.unit),
        key = JSON.stringify([m.name, mu.symbol]);
      let material = materials.get(key);
      if (!material) {
        material = await tx.material.upsert({
          where: { code: code("M", key) },
          create: { code: code("M", key), name: m.name, unitId: mu.id },
          update: {},
        });
        if (material.unitId !== mu.id)
          throw new ApiError(
            409,
            "BASE_REFERENCE_CONFLICT",
            "El material BASE existente cambió su unidad. Revisá su código antes de instalar.",
          );
        materials.set(key, material);
      }
      const repeated = components.find((c) => c.materialId === material!.id);
      if (repeated) {
        const coefficient = new Prisma.Decimal(repeated.coefficient).add(
          m.coefficient,
        );
        repeated.unitPrice =
          repeated.unitPrice === null || m.unitPrice === null
            ? null
            : new Prisma.Decimal(repeated.coefficient)
                .mul(repeated.unitPrice)
                .add(new Prisma.Decimal(m.coefficient).mul(m.unitPrice))
                .div(coefficient)
                .toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP)
                .toFixed();
        repeated.coefficient = coefficient.toFixed();
      } else
        components.push({
          materialId: material.id,
          name: m.name,
          unitId: mu.id,
          unit: mu.symbol,
          coefficient: m.coefficient,
          unitPrice: m.unitPrice,
          sourcePriceId: null,
        });
    }
    lines.push({
      key: randomUUID(),
      itemId: null,
      code: line.sourceKey,
      name: line.name,
      categoryId: category.id,
      category: category.name,
      unitId: u.id,
      unit: u.symbol,
      quantity: "0",
      laborUnitCost: line.laborUnitCost,
      directUnitCost: line.directUnitCost,
      status: "ACTIVE",
      materials: components,
    });
  }
  const content = editorContentSchema.parse({
    currency: "ARS",
    taxBasis: "UNSPECIFIED",
    markup: "50",
    materialDemandIncomplete: true,
    conditions: "",
    exclusions: "",
    observations: "",
    deadline: "",
    lines,
  });
  const template = await tx.budgetTemplate.create({
    data: {
      name,
      content: JSON.parse(JSON.stringify(content)) as Prisma.InputJsonValue,
    },
  });
  await audit(tx, actor, "INSTALL_BASE", "BudgetTemplate", template.id, {
    sourceSha256: baseSource.sourceSha256,
    notice: baseSource.notice,
    activities: lines.length,
    materials: materials.size,
    unitMapping: "source-specific-v1",
    rounding:
      "Cached source values rounded HALF_UP to 8 decimals; no formula execution.",
  });
  return template;
}
