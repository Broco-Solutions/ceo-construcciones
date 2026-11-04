import type { MaterialPrice, TaxBasis } from "@prisma/client";
import type { Tx } from "../core/db";
import { schemaCapabilities } from "../core/db";

/** A source's INCLUDED supply and unspecified commercial/MO basis are distinct.
 * This exception is anchored to an immutable imported quote, never a tax
 * conversion or a claim accepted just because a client supplied an enum. */
export async function sourcePriceBases(tx: Tx, ids: string[]) {
  if (!ids.length) return new Map<string, MaterialPrice>();
  const origins = await tx.catalogOrigin.findMany({
    where: {
      source: "BASE-CEO",
      kind: { in: ["price", "composition-price"] },
      entityId: { in: [...new Set(ids)] },
    },
  });
  return new Map(
    (
      await tx.materialPrice.findMany({
        where: { id: { in: origins.map((o) => o.entityId) } },
      })
    ).map((p) => [p.id, p]),
  );
}
export function sourcePriceContext(
  context: { currency: string; taxBasis: TaxBasis },
  materialId: string,
  anchor: MaterialPrice | undefined,
) {
  return context.taxBasis === "UNSPECIFIED" &&
    anchor?.materialId === materialId &&
    anchor.currency === context.currency
    ? { ...context, taxBasis: anchor.taxBasis }
    : context;
}
export function samePriceSeries(a: MaterialPrice, b: MaterialPrice) {
  return (
    a.materialId === b.materialId &&
    a.currency === b.currency &&
    a.taxBasis === b.taxBasis &&
    a.presentationId === b.presentationId &&
    a.supplierId === b.supplierId &&
    (a.supplierId !== null || a.source === b.source)
  );
}
export async function sourcePriceFactors(tx: Tx, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const origins = await tx.catalogOrigin.findMany({
    where: {
      source: "BASE-CEO",
      kind: "composition-expression",
      entityId: { in: [...new Set(ids)] },
    },
  });
  return new Set(
    origins.map(
      (o) =>
        `${o.entityId}:${(o.evidence as { record: { factor: string } }).record.factor}`,
    ),
  );
}

/** Undated historical amounts can be pinned, but cannot win a comparison or
 * become a latest quote using their technical sentinel timestamp. */
export async function undatedPriceIds(tx: Pick<Tx, "catalogOrigin">) {
  if (!(await schemaCapabilities()).referenceCosts) return [];
  return (
    await tx.catalogOrigin.findMany({
      where: {
        kind: { in: ["price", "composition-price"] },
        evidence: { path: ["record", "datePrecision"], equals: "UNKNOWN" },
      },
      select: { entityId: true },
    })
  ).map((o) => o.entityId);
}
