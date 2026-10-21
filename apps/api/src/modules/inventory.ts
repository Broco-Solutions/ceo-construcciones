import { z } from "zod";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, transaction, type Tx } from "../core/db";
import { audit } from "../core/audit";
import { type Actor, requireRoles, requireWork } from "../core/auth";
import { ApiError } from "../core/errors";
import {
  id,
  text,
  decimal,
  nonnegative,
  D,
  ok,
  parse,
  paging,
  listed,
  found,
  conflict,
  locationAccess,
  validMaterial,
} from "./shared";

export async function idempotent<T>(
  actor: Actor,
  scope: string,
  key: string,
  payload: unknown,
  fn: (tx: Tx) => Promise<T>,
  eventOwner = actor.id,
): Promise<T> {
  if (!key || key.length > 120)
    throw new ApiError(
      422,
      "IDEMPOTENCY_REQUIRED",
      "Idempotency-Key requerido (1–120 caracteres)",
    );
  const storedKey = createHash("sha256")
    .update(`${eventOwner}:${scope}:${key}`)
    .digest("hex");
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const execute = () =>
    transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { key: storedKey },
      });
      if (existing) {
        if (existing.requestHash !== hash)
          conflict("La clave de idempotencia ya fue utilizada con otros datos");
        return existing.response as T;
      }
      const result = await fn(tx);
      await tx.idempotencyRecord.create({
        data: {
          key: storedKey,
          scope,
          actorId: actor.id,
          requestHash: hash,
          response: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
        },
      });
      return result;
    });
  try {
    return await execute();
  } catch (error) {
    // Concurrent identical requests may race on the event's unique key before
    // PostgreSQL reports a serialization failure. Read the committed winner.
    if ((error as { code?: string }).code !== "P2002") throw error;
    const existing = await db.idempotencyRecord.findUnique({
      where: { key: storedKey },
    });
    if (!existing) throw error;
    if (existing.requestHash !== hash)
      conflict("La clave de idempotencia ya fue utilizada con otros datos");
    return existing.response as T;
  }
}
export async function balance(tx: Tx, materialId: string, locationId: string) {
  await validMaterial(tx, materialId);
  return tx.stockBalance.upsert({
    where: { materialId_locationId: { materialId, locationId } },
    create: { materialId, locationId },
    update: {},
  });
}
export async function addPhysical(
  tx: Tx,
  materialId: string,
  locationId: string,
  quantity: Prisma.Decimal,
) {
  if (quantity.lte(0)) conflict("La cantidad de ingreso debe ser positiva");
  const b = await balance(tx, materialId, locationId);
  return tx.stockBalance.update({
    where: { id: b.id },
    data: { physical: { increment: quantity } },
  });
}
export async function removePhysical(
  tx: Tx,
  materialId: string,
  locationId: string,
  quantity: Prisma.Decimal,
  reservedToRelease = D(0),
) {
  if (
    quantity.lte(0) ||
    reservedToRelease.lt(0) ||
    reservedToRelease.gt(quantity)
  )
    conflict("Cantidad de egreso o liberación inválida");
  const b = await balance(tx, materialId, locationId);
  if (
    b.physical.minus(b.reserved).plus(reservedToRelease).lt(quantity) ||
    b.reserved.lt(reservedToRelease)
  )
    conflict("Stock disponible insuficiente");
  return tx.stockBalance.update({
    where: { id: b.id },
    data: {
      physical: { decrement: quantity },
      reserved: { decrement: reservedToRelease },
    },
  });
}
export const reserveSchema = z
  .object({
    materialId: id,
    sourceId: id,
    workId: id,
    requestLineId: id.optional(),
    quantity: decimal,
  })
  .strict();
export const moveSchema = z
  .object({
    type: z.enum([
      "INITIAL",
      "TRANSFER",
      "CONSUMPTION",
      "RETURN",
      "ADJUSTMENT",
    ]),
    materialId: id,
    quantity: decimal,
    sourceId: id.optional(),
    destinationId: id.optional(),
    workId: id.optional(),
    categoryId: id.optional(),
    reservationId: id.optional(),
    reason: text.optional(),
    direction: z.enum(["IN", "OUT"]).optional(),
  })
  .strict();
export async function handlerInventory(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  const [resource, key, action] = s;
  const method = request.method;
  const q = new URL(request.url).searchParams;
  const p = paging(request);
  if (
    resource === "stock" &&
    key === "alerts" &&
    s.length === 2 &&
    method === "GET"
  ) {
    const filters = z
      .object({ materialId: id.optional(), locationId: id.optional() })
      .parse({
        materialId: q.get("materialId") ?? undefined,
        locationId: q.get("locationId") ?? undefined,
      });
    // Material minima apply even before the first physical event. Do not create
    // artificial balance records from this read-only query.
    const from = Prisma.sql`FROM "Material" m CROSS JOIN "Location" l
   LEFT JOIN "StockBalance" b ON b."materialId"=m.id AND b."locationId"=l.id
   JOIN "Unit" u ON u.id=m."unitId"
   WHERE m.active=true AND l.active=true
   AND COALESCE(b.minimum,m.minimum)>0
   AND COALESCE(b.physical,0)-COALESCE(b.reserved,0)<COALESCE(b.minimum,m.minimum)
   ${filters.materialId ? Prisma.sql`AND m.id=${filters.materialId}` : Prisma.empty}
   ${filters.locationId ? Prisma.sql`AND l.id=${filters.locationId}` : Prisma.empty}
   ${actor.role === "JEFE_OBRA" ? Prisma.sql`AND EXISTS (SELECT 1 FROM "WorkAssignment" a WHERE a."workId"=l."workId" AND a."userId"=${actor.id})` : Prisma.empty}`;
    type AlertRow = {
      balanceId: string | null;
      materialId: string;
      materialCode: string;
      materialName: string;
      unitId: string;
      unitCode: string;
      locationId: string;
      locationCode: string;
      locationName: string;
      workId: string | null;
      physical: Prisma.Decimal;
      reserved: Prisma.Decimal;
      minimum: Prisma.Decimal;
    };
    return transaction(async (tx) => {
      const rows = await tx.$queryRaw<AlertRow[]>(
        Prisma.sql`SELECT b.id AS "balanceId",m.id AS "materialId",m.code AS "materialCode",m.name AS "materialName",m."unitId",u.code AS "unitCode",l.id AS "locationId",l.code AS "locationCode",l.name AS "locationName",l."workId",COALESCE(b.physical,0) AS physical,COALESCE(b.reserved,0) AS reserved,COALESCE(b.minimum,m.minimum) AS minimum ${from} ORDER BY m.code,l.code LIMIT ${p.take} OFFSET ${p.skip}`,
      );
      const totals = await tx.$queryRaw<{ total: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS total ${from}`,
      );
      return listed(
        rows.map((row) => ({
          balanceId: row.balanceId,
          materialId: row.materialId,
          locationId: row.locationId,
          material: {
            id: row.materialId,
            code: row.materialCode,
            name: row.materialName,
            unitId: row.unitId,
            unit: { code: row.unitCode },
          },
          location: {
            id: row.locationId,
            code: row.locationCode,
            name: row.locationName,
            workId: row.workId,
          },
          physical: D(row.physical).toFixed(),
          reserved: D(row.reserved).toFixed(),
          available: D(row.physical).minus(row.reserved).toFixed(),
          minimum: D(row.minimum).toFixed(),
          belowMinimum: true,
        })),
        Number(totals[0].total),
        p,
      );
    });
  }
  if (resource === "stock" && s.length === 1 && method === "GET") {
    const where: Prisma.StockBalanceWhereInput = {
      materialId: q.get("materialId") || undefined,
      locationId: q.get("locationId") || undefined,
    };
    if (actor.role === "JEFE_OBRA")
      where.location = {
        work: { assignments: { some: { userId: actor.id } } },
      };
    const [rows, total] = await db.$transaction([
      db.stockBalance.findMany({
        where,
        include: { material: { include: { unit: true } }, location: true },
        skip: p.skip,
        take: p.take,
        orderBy: { id: "asc" },
      }),
      db.stockBalance.count({ where }),
    ]);
    return listed(
      rows.map((b) => {
        const available = b.physical.minus(b.reserved);
        const minimum = b.minimum ?? b.material.minimum;
        return {
          ...b,
          available: available.toString(),
          minimum: minimum.toString(),
          belowMinimum: available.lt(minimum),
        };
      }),
      total,
      p,
    );
  }
  if (
    resource === "stock" &&
    key &&
    action === "minimum" &&
    method === "PUT" &&
    s.length === 3
  ) {
    requireRoles(actor, "GERENCIA", "COMPRAS");
    const b = await parse(
      request,
      z.object({ materialId: id, minimum: nonnegative.nullable() }).strict(),
    );
    return ok(
      await transaction(async (tx) => {
        await locationAccess(actor, key, tx);
        const row = await balance(tx, b.materialId, key);
        const result = await tx.stockBalance.update({
          where: { id: row.id },
          data: { minimum: b.minimum },
        });
        await audit(tx, actor, "SET_MINIMUM", "StockBalance", row.id, b);
        return result;
      }),
    );
  }
  if (resource === "reservations") {
    if (method === "GET" && s.length <= 2) {
      if (key) {
        const r = found(
          await db.reservation.findUnique({ where: { id: key } }),
        );
        await requireWork(actor, r.workId);
        return ok(r);
      }
      const where: Prisma.ReservationWhereInput = {
        workId: q.get("workId") || undefined,
        materialId: q.get("materialId") || undefined,
      };
      if (actor.role === "JEFE_OBRA")
        where.work = { assignments: { some: { userId: actor.id } } };
      const [data, total] = await db.$transaction([
        db.reservation.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { createdAt: "desc" },
        }),
        db.reservation.count({ where }),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA", "COMPRAS");
    if (method === "POST" && !key) {
      const b = await parse(request, reserveSchema);
      return ok(
        await idempotent(
          actor,
          "reservation",
          request.headers.get("idempotency-key") || "",
          b,
          async (tx) => {
            await requireWork(actor, b.workId);
            await locationAccess(actor, b.sourceId, tx);
            if (b.requestLineId) {
              const l = found(
                await tx.requestLine.findUnique({
                  where: { id: b.requestLineId },
                  include: { request: true },
                }),
              );
              if (
                l.materialId !== b.materialId ||
                l.request.workId !== b.workId ||
                l.request.status === "CANCELLED"
              )
                conflict("Renglón de pedido incompatible");
            }
            const qty = D(b.quantity),
              stock = await balance(tx, b.materialId, b.sourceId);
            if (stock.physical.minus(stock.reserved).lt(qty))
              conflict("Stock disponible insuficiente para reservar");
            await tx.stockBalance.update({
              where: { id: stock.id },
              data: { reserved: { increment: qty } },
            });
            const r = await tx.reservation.create({
              data: { ...b, createdById: actor.id },
            });
            await audit(tx, actor, "RESERVE", "Reservation", r.id, b);
            return r;
          },
        ),
        201,
      );
    }
    if (method === "POST" && key && action === "cancel" && s.length === 3) {
      return ok(
        await transaction(async (tx) => {
          const r = found(
            await tx.reservation.findUnique({ where: { id: key } }),
          );
          if (r.status === "CANCELLED") return r;
          if (r.status !== "ACTIVE") conflict("Reserva ya satisfecha");
          const b = await balance(tx, r.materialId, r.sourceId),
            pending = r.quantity.minus(r.fulfilledQuantity);
          if (b.reserved.lt(pending)) conflict("Saldo reservado inconsistente");
          await tx.stockBalance.update({
            where: { id: b.id },
            data: { reserved: { decrement: pending } },
          });
          const result = await tx.reservation.update({
            where: { id: key },
            data: { status: "CANCELLED" },
          });
          await audit(tx, actor, "CANCEL", "Reservation", key);
          return result;
        }),
      );
    }
  }
  if (resource === "movements") {
    if (method === "GET" && s.length === 1) {
      const where: Prisma.StockMovementWhereInput = {
        materialId: q.get("materialId") || undefined,
        workId: q.get("workId") || undefined,
      };
      if (actor.role === "JEFE_OBRA")
        where.work = { assignments: { some: { userId: actor.id } } };
      if (q.get("locationId"))
        where.OR = [
          { sourceId: q.get("locationId")! },
          { destinationId: q.get("locationId")! },
        ];
      const [data, total] = await db.$transaction([
        db.stockMovement.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { createdAt: "desc" },
        }),
        db.stockMovement.count({ where }),
      ]);
      return listed(data, total, p);
    }
    if (method === "POST" && s.length === 1) {
      const b = await parse(request, moveSchema);
      if (b.type === "INITIAL" || b.type === "ADJUSTMENT")
        requireRoles(actor, "GERENCIA");
      else if (b.type === "TRANSFER")
        requireRoles(actor, "GERENCIA", "COMPRAS");
      else requireRoles(actor, "GERENCIA", "COMPRAS", "JEFE_OBRA");
      return ok(
        await idempotent(
          actor,
          "movement",
          request.headers.get("idempotency-key") || "",
          b,
          async (tx) => {
            const qty = D(b.quantity);
            await validMaterial(tx, b.materialId);
            const source = b.sourceId
              ? await locationAccess(actor, b.sourceId, tx)
              : null;
            // Un jefe puede devolver desde su obra a galpón/patio; nunca leer stock ajeno.
            let destination = b.destinationId
              ? found(
                  await tx.location.findUnique({
                    where: { id: b.destinationId },
                  }),
                )
              : null;
            if (destination && !destination.active)
              conflict("Ubicación inactiva");
            if (actor.role === "JEFE_OBRA" && destination?.workId)
              await requireWork(actor, destination.workId);
            let workId = b.workId;
            if (workId) await requireWork(actor, workId);
            if (b.categoryId)
              found(
                await tx.category.findUnique({ where: { id: b.categoryId } }),
                "Rubro",
              );
            if (source && destination && source.id === destination.id)
              conflict("Origen y destino deben ser distintos");
            if (["TRANSFER", "RETURN"].includes(b.type)) {
              if (!source || !destination)
                conflict("Origen y destino obligatorios");
              if (b.type === "RETURN" && (!source.workId || destination.workId))
                conflict("Una devolución sale de obra hacia galpón o patio");
              if (b.type === "RETURN") workId = source.workId!;
              else workId = destination.workId || source.workId || undefined;
            } else if (b.type === "CONSUMPTION") {
              if (!source?.workId || destination)
                conflict("El consumo requiere solo origen en obra");
              workId = source.workId;
            } else if (b.type === "INITIAL") {
              if (!destination || source || b.reservationId)
                conflict("Inventario inicial requiere solo destino");
              workId = destination.workId || undefined;
              // INITIAL is a single opening balance, never an additional recount.
              // Corrections after the first operation require a reasoned ADJUSTMENT.
              if (
                await tx.stockMovement.findFirst({
                  where: {
                    materialId: b.materialId,
                    OR: [
                      { sourceId: destination.id },
                      { destinationId: destination.id },
                    ],
                  },
                  select: { id: true },
                })
              )
                conflict(
                  "El material ya tiene movimientos en esta ubicación. Registre un ajuste con motivo",
                );
            } else if (b.type === "ADJUSTMENT") {
              if (!b.reason || !b.direction)
                conflict("Ajuste requiere motivo y dirección");
              if (b.direction === "IN" && (!destination || source))
                conflict("Ajuste de ingreso requiere solo destino");
              if (b.direction === "OUT" && (!source || destination))
                conflict("Ajuste de egreso requiere solo origen");
              workId = source?.workId || destination?.workId || undefined;
            }
            if (b.workId && b.workId !== workId)
              conflict(
                "La obra informada no coincide con las ubicaciones del movimiento",
              );
            if (b.reservationId && b.type !== "TRANSFER")
              conflict("Solo transferencias pueden satisfacer reservas");
            let release = D(0);
            if (b.reservationId) {
              const r = found(
                await tx.reservation.findUnique({
                  where: { id: b.reservationId },
                }),
              );
              if (
                r.status !== "ACTIVE" ||
                r.materialId !== b.materialId ||
                r.sourceId !== b.sourceId ||
                r.workId !== destination?.workId ||
                r.quantity.minus(r.fulfilledQuantity).lt(qty)
              )
                conflict("Reserva incompatible o cantidad excedida");
              release = qty;
              const fulfilled = r.fulfilledQuantity.plus(qty);
              await tx.reservation.update({
                where: { id: r.id },
                data: {
                  fulfilledQuantity: fulfilled,
                  status: fulfilled.eq(r.quantity) ? "FULFILLED" : "ACTIVE",
                },
              });
            }
            if (source)
              await removePhysical(tx, b.materialId, source.id, qty, release);
            if (destination)
              await addPhysical(tx, b.materialId, destination.id, qty);
            const movement = await tx.stockMovement.create({
              data: {
                type: b.type,
                materialId: b.materialId,
                quantity: qty,
                sourceId: source?.id,
                destinationId: destination?.id,
                workId,
                categoryId: b.categoryId,
                reservationId: b.reservationId,
                createdById: actor.id,
                reason: b.reason,
                idempotencyKey: createHash("sha256")
                  .update(
                    `${actor.id}:movement:${request.headers.get("idempotency-key")}`,
                  )
                  .digest("hex"),
              },
            });
            await audit(tx, actor, b.type, "StockMovement", movement.id, b);
            return movement;
          },
        ),
        201,
      );
    }
  }
  return null;
}
