import { type Actor, requireWork } from "../core/auth";
import { transaction, schemaCapabilities, type Tx } from "../core/db";
import { ApiError } from "../core/errors";
import { D, id, ok } from "./shared";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

/** Reconcile one work/material. A request and its orders share one coverage
 * bucket; only delivery into work stock leaves that pending bucket. */
export async function netNeeds(actor: Actor, workId: string) {
  await requireWork(actor, workId);
  const result = await transaction(async (tx) =>
    netNeedsInTransaction(tx, workId),
  );
  return actor.role === "JEFE_OBRA"
    ? {
        ...result,
        rows: result.rows
          .filter(
            (r) =>
              r.planned !== null ||
              r.consumed !== "0" ||
              r.workAvailable !== "0" ||
              r.pendingCoverage !== "0",
          )
          .map((r) => ({ ...r, generalAvailable: null })),
      }
    : result;
}
export async function netNeedsInTransaction(tx: Tx, workId: string) {
  if (!(await schemaCapabilities()).coverage)
    throw new ApiError(
      503,
      "FEATURE_NOT_ENABLED",
      "Las necesidades netas requieren la migración de trazabilidad de aplicación.",
    );
  const reference = await tx.budgetVersion.findFirst({
    where: { budget: { workId }, status: "REFERENCE" },
    select: { id: true, snapshot: true },
    orderBy: { createdAt: "desc" },
  });
  const materialDemandIncomplete =
    reference?.snapshot !== null &&
    typeof reference?.snapshot === "object" &&
    (reference.snapshot as { materialDemandIncomplete?: boolean })
      .materialDemandIncomplete === true;
  const planned = reference
    ? await tx.budgetMaterial.findMany({
        where: { versionId: reference.id },
        select: { materialId: true, quantity: true },
      })
    : [];
  const requests = await tx.materialRequest.findMany({
    where: { workId, status: { not: "DRAFT" } },
    include: { lines: true },
  });
  const orders = await tx.purchaseOrder.findMany({
    where: {
      workId,
      status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"] },
    },
    select: {
      id: true,
      requestId: true,
      lines: {
        select: {
          id: true,
          materialId: true,
          quantity: true,
          receivedQuantity: true,
          receiptLines: {
            select: {
              id: true,
              quantity: true,
              coverage: true,
              receipt: { select: { location: { select: { workId: true } } } },
            },
          },
        },
      },
    },
  });
  const reservations = await tx.reservation.findMany({
    where: { workId },
    select: {
      id: true,
      materialId: true,
      requestLineId: true,
      status: true,
      quantity: true,
      fulfilledQuantity: true,
      receiptCoverage: true,
    },
  });
  const balances = await tx.stockBalance.findMany({
    where: { location: { workId } },
    select: { materialId: true, physical: true, reserved: true },
  });
  const consumed = await tx.stockMovement.findMany({
    where: { workId, type: "CONSUMPTION" },
    select: { materialId: true, quantity: true },
  });
  const global = await tx.stockBalance.findMany({
    where: { location: { workId: null, active: true } },
    select: { materialId: true, physical: true, reserved: true },
  });
  const transfers = await tx.stockMovement.findMany({
    where: { destination: { workId }, type: "TRANSFER" },
    select: { materialId: true, quantity: true, reservationId: true },
  });
  const all = new Set(
    [
      ...planned,
      ...balances,
      ...consumed,
      ...global,
      ...requests.flatMap((r) => r.lines),
      ...orders.flatMap((o) => o.lines),
      ...reservations,
    ].map((x) => x.materialId),
  );
  const materials = await tx.material.findMany({
    where: { id: { in: [...all] } },
    select: {
      id: true,
      code: true,
      name: true,
      unit: { select: { name: true, symbol: true } },
    },
  });
  const sum = (values: { quantity: { toString(): string } }[]) =>
    values.reduce((a, v) => a.add(v.quantity.toString()), D(0));
  const result = materials.map((material) => {
    const mid = material.id,
      P = sum(planned.filter((r) => r.materialId === mid)),
      C = sum(consumed.filter((r) => r.materialId === mid));
    const S = balances
      .filter((r) => r.materialId === mid)
      .reduce((a, r) => a.add(r.physical).sub(r.reserved), D(0));
    let T = D(0);
    const sources: { kind: string; id: string; quantity: string }[] = [];
    const warnings: string[] = [];
    if (materialDemandIncomplete)
      warnings.push(
        "El presupuesto de referencia tiene suministros sin composición de materiales verificada. El faltante es orientativo.",
      );
    for (const request of requests) {
      const line = request.lines.find((l) => l.materialId === mid);
      if (!line) continue;
      const related = orders
        .filter((o) => o.requestId === request.id)
        .flatMap((o) => o.lines.filter((l) => l.materialId === mid));
      const ordered = sum(related),
        delivered = related.reduce(
          (a, l) =>
            a.add(
              sum(
                l.receiptLines.filter(
                  (r) => r.receipt.location.workId === workId,
                ),
              ),
            ),
          D(0),
        );
      const reserves = reservations.filter((r) => r.requestLineId === line.id);
      const fulfilled = reserves.reduce(
        (a, r) => a.add(r.fulfilledQuantity),
        D(0),
      );
      const autoFulfilled = reserves
        .filter((r) => r.receiptCoverage)
        .reduce((a, r) => a.add(r.fulfilledQuantity), D(0));
      const externalPending = reserves
        .filter((r) => !r.receiptCoverage && r.status === "ACTIVE")
        .reduce((a, r) => a.add(r.quantity.sub(r.fulfilledQuantity)), D(0));
      const requested = ["SUBMITTED", "PROCESSING"].includes(request.status)
        ? line.quantity
        : D(0);
      const coverage = Prisma.Decimal.max(
        0,
        requested.sub(delivered).sub(fulfilled),
        ordered.sub(delivered).sub(autoFulfilled).add(externalPending),
      );
      if (coverage.gt(0)) {
        T = T.add(coverage);
        sources.push({
          kind: "REQUEST",
          id: request.id,
          quantity: coverage.toFixed(),
        });
      }
    }
    for (const order of orders.filter((o) => !o.requestId))
      for (const line of order.lines.filter((l) => l.materialId === mid)) {
        const delivered = sum(
          line.receiptLines.filter((r) => r.receipt.location.workId === workId),
        );
        const autoFulfilled = reservations
          .filter(
            (r) =>
              r.receiptCoverage &&
              line.receiptLines.some(
                (l) => l.id === r.receiptCoverage!.receiptLineId,
              ),
          )
          .reduce((a, r) => a.add(r.fulfilledQuantity), D(0));
        const pending = Prisma.Decimal.max(
          0,
          line.quantity.sub(delivered).sub(autoFulfilled),
        );
        T = T.add(pending);
        if (pending.gt(0))
          sources.push({
            kind: "DIRECT_ORDER",
            id: order.id,
            quantity: pending.toFixed(),
          });
        if (
          line.receiptLines.some(
            (r) => r.receipt.location.workId !== workId && !r.coverage,
          )
        )
          warnings.push(
            "Cobertura sin vincular: recepción atribuida a la obra en otra ubicación. Vinculá su traslado antes de considerar exacto el faltante.",
          );
      }
    for (const reserve of reservations.filter(
      (r) =>
        r.materialId === mid &&
        !r.requestLineId &&
        !r.receiptCoverage &&
        r.status === "ACTIVE",
    )) {
      const pending = reserve.quantity.sub(reserve.fulfilledQuantity);
      T = T.add(pending);
      sources.push({
        kind: "RESERVATION",
        id: reserve.id,
        quantity: pending.toFixed(),
      });
    }
    const linkedOrders = orders
      .filter((o) => o.requestId)
      .flatMap((o) => o.lines.filter((l) => l.materialId === mid));
    if (
      linkedOrders.some((l) =>
        l.receiptLines.some(
          (r) => r.receipt.location.workId !== workId && !r.coverage,
        ),
      )
    )
      warnings.push(
        "Cobertura sin vincular: una recepción del pedido está fuera de la obra; revisá reservas y traslados.",
      );
    if (
      T.gt(0) &&
      transfers.some((t) => t.materialId === mid && !t.reservationId)
    )
      warnings.push(
        "Cobertura sin vincular: traslado sin pedido o reserva asociado. El faltante es orientativo.",
      );
    const covered = C.add(S).add(T),
      generalAvailable = global
        .filter((r) => r.materialId === mid)
        .reduce((a, r) => a.add(r.physical).sub(r.reserved), D(0));
    return {
      materialId: mid,
      code: material.code,
      name: material.name,
      unit: material.unit.symbol ?? material.unit.name,
      planned: reference ? P.toFixed() : null,
      consumed: C.toFixed(),
      workAvailable: S.toFixed(),
      pendingCoverage: T.toFixed(),
      covered: covered.toFixed(),
      remaining: reference
        ? Prisma.Decimal.max(0, P.sub(covered)).toFixed()
        : null,
      excess: reference
        ? Prisma.Decimal.max(0, covered.sub(P)).toFixed()
        : null,
      generalAvailable: generalAvailable.toFixed(),
      exact: warnings.length === 0,
      warnings,
      sources,
    };
  });
  result.sort((a, b) => a.materialId.localeCompare(b.materialId));
  const coverageRows = result
    .filter(
      (r) => (r.planned !== null && D(r.planned).gt(0)) || D(r.covered).gt(0),
    )
    .map((r) => ({
      materialId: r.materialId,
      planned: r.planned,
      consumed: r.consumed,
      workAvailable: r.workAvailable,
      pendingCoverage: r.pendingCoverage,
      exact: r.exact,
      warnings: r.warnings,
      sources: r.sources,
    }));
  const coverageHash = createHash("sha256")
    .update(
      JSON.stringify({ reference: reference?.id ?? null, rows: coverageRows }),
    )
    .digest("hex");
  return {
    workId,
    referenceVersionId: reference?.id ?? null,
    materialDemandIncomplete,
    coverageHash,
    rows: result,
  };
}
export async function handlerNetNeeds(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  if (s[0] !== "net-needs" || request.method !== "GET") return null;
  const workId = id.parse(new URL(request.url).searchParams.get("workId"));
  return ok(await netNeeds(actor, workId));
}
