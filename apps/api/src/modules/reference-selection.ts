import type {
  LaborRate,
  MaterialPrice,
  Prisma,
  TaxBasis,
} from "@prisma/client";
type Context = { currency: string; taxBasis: TaxBasis };
type SelectedLabor = LaborRate & { resource: { active: boolean } };
type Price = MaterialPrice & {
  supplier?: { active: boolean } | null;
  presentation?: { active: boolean; baseQuantity: Prisma.Decimal } | null;
};
/** Shared policy for catalog, new snapshots and explicit draft review.
 * Inputs are ordered newest first by effective date/creation/id; never by price. */
export function selectLaborReference(
  selected: SelectedLabor | undefined,
  candidates: LaborRate[],
  context: Context,
  now = new Date(),
): LaborRate | undefined {
  if (
    !selected ||
    !selected.resource.active ||
    selected.currency !== context.currency ||
    selected.taxBasis !== context.taxBasis
  )
    return;
  if (selected.effectiveAt === null) return selected; // Preserve exact undated selection, never promote it.
  if (selected.effectiveAt > now) return;
  return candidates.find(
    (r) =>
      r.effectiveAt !== null &&
      r.effectiveAt <= now &&
      r.resourceId === selected.resourceId &&
      r.series === selected.series &&
      r.currency === context.currency &&
      r.taxBasis === context.taxBasis,
  );
}
export function selectMaterialReference(
  selected: MaterialPrice | undefined,
  candidates: Price[],
  materialId: string,
  context: Context,
  allowUnselected = false,
  now = new Date(),
): Price | undefined {
  const compatible = candidates.filter(
    (p) =>
      p.materialId === materialId &&
      p.currency === context.currency &&
      p.taxBasis === context.taxBasis &&
      p.effectiveAt <= now &&
      (!p.supplier || p.supplier.active) &&
      (!p.presentation ||
        (p.presentation.active &&
          p.presentation.baseQuantity.eq(p.baseQuantity))),
  );
  if (selected) {
    if (
      selected.materialId !== materialId ||
      selected.currency !== context.currency ||
      selected.taxBasis !== context.taxBasis ||
      selected.effectiveAt > now
    )
      return;
    return compatible.find(
      (p) =>
        p.supplierId === selected.supplierId &&
        p.presentationId === selected.presentationId &&
        (p.supplierId !== null || p.source === selected.source),
    );
  }
  if (!allowUnselected) return;
  const series = new Set(
    compatible.map((p) =>
      JSON.stringify([
        p.supplierId,
        p.presentationId,
        p.supplierId ? null : p.source,
      ]),
    ),
  );
  return series.size === 1 ? compatible[0] : undefined;
}
