import { db, schemaCapabilities, type Tx } from "../core/db";
export async function retiredPriceIds(
  tx: Pick<Tx, "catalogOrigin"> = db,
  ids?: string[],
) {
  if (!(await schemaCapabilities()).referenceCosts) return [];
  return (
    await tx.catalogOrigin.findMany({
      where: {
        kind: "price-retired",
        ...(ids ? { entityId: { in: ids } } : {}),
      },
      select: { entityId: true },
    })
  ).map((o) => o.entityId);
}
export async function priceProvenance<T extends { id: string }>(prices: T[]) {
  if (!(await schemaCapabilities()).referenceCosts || !prices.length)
    return prices;
  const origins = await db.catalogOrigin.findMany({
    where: {
      kind: { in: ["price", "composition-price", "price-retired"] },
      entityId: { in: prices.map((p) => p.id) },
    },
  });
  return prices.map((p) => {
    const origin = origins.find((o) => o.entityId === p.id);
    if (!origin) return p;
    if (origin.kind === "price-retired")
      return {
        ...p,
        referenceDate: null,
        referenceDatePrecision: "UNKNOWN",
        referenceState: "REVIEW_REQUIRED",
      };
    const record = (
      origin.evidence as {
        record: { date: string | null; datePrecision: string };
      }
    ).record;
    return {
      ...p,
      referenceDate: record.date,
      referenceDatePrecision: record.datePrecision,
      referenceState: "HISTORICAL" as const,
    };
  });
}
