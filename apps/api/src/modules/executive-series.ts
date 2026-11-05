import { Prisma } from "@prisma/client";
const Decimal = Prisma.Decimal.clone({ precision: 80 });
export type Point = {
  key: string;
  label: string;
  currency: string;
  taxBasis: string;
  amount: string;
};
/** Aggregate exact amounts on the server. Missing values are counted elsewhere. */
export function monetarySeries(
  rows: {
    key: string;
    label: string;
    currency: string;
    taxBasis: string;
    amount: string | null;
  }[],
): Point[] {
  const groups = new Map<
    string,
    { point: Omit<Point, "amount">; amount: Prisma.Decimal }
  >();
  for (const r of rows) {
    if (r.amount === null) continue;
    const id = JSON.stringify([r.key, r.currency, r.taxBasis]),
      old = groups.get(id) ?? {
        point: {
          key: r.key,
          label: r.label,
          currency: r.currency,
          taxBasis: r.taxBasis,
        },
        amount: new Decimal(0),
      };
    old.amount = old.amount.add(r.amount);
    groups.set(id, old);
  }
  return [...groups.values()]
    .map((r) => ({ ...r.point, amount: r.amount.toFixed(2) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}
