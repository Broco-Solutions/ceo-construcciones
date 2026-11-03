import { type Actor } from "../core/auth";
import { db } from "../core/db";
import { listed, paging } from "./shared";
export async function handlerReceiptDesk(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  if (s[0] !== "receipt-desk" || s.length !== 1 || request.method !== "GET")
    return null;
  const p = paging(request);
  const where = {
    status: {
      in: ["ISSUED", "PARTIALLY_RECEIVED"] as (
        | "ISSUED"
        | "PARTIALLY_RECEIVED"
      )[],
    },
    destination: {
      active: true,
      receptionDelegations: { some: { userId: actor.id } },
    },
  };
  const [data, total] = await db.$transaction([
    db.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        destination: { select: { id: true, name: true } },
        lines: {
          select: {
            id: true,
            quantity: true,
            receivedQuantity: true,
            material: {
              select: {
                name: true,
                unit: { select: { name: true, symbol: true } },
              },
            },
          },
        },
      },
      skip: p.skip,
      take: p.take,
      orderBy: { number: "desc" },
    }),
    db.purchaseOrder.count({ where }),
  ]);
  return listed(
    data.map((o) => ({
      ...o,
      lines: o.lines.map((l) => ({
        ...l,
        pendingQuantity: l.quantity.minus(l.receivedQuantity),
      })),
    })),
    total,
    p,
  );
}
