import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { db, type Tx, transaction } from "../core/db";
import { type Actor, requireRoles } from "../core/auth";
import { ApiError } from "../core/errors";
import { audit } from "../core/audit";
import {
  id,
  nonnegative,
  ok,
  parse,
  found,
  validMaterial,
  locationAccess,
  D,
} from "./shared";
import {
  applyMovement,
  authorizeMovement,
  validateMovement,
  moveSchema,
  balance,
  idempotent,
} from "./inventory";
export const minimumBatchSchema = z
  .object({
    rows: z
      .array(
        z
          .object({
            materialId: id,
            locationId: id,
            minimum: nonnegative.nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
    planHash: id.optional(),
  })
  .strict();
export const movementBatchSchema = z
  .object({
    header: moveSchema.omit({
      materialId: true,
      quantity: true,
      categoryId: true,
      reservationId: true,
    }),
    rows: z
      .array(
        moveSchema.pick({
          materialId: true,
          quantity: true,
          categoryId: true,
          reservationId: true,
        }),
      )
      .min(1)
      .max(100),
    planHash: id.optional(),
  })
  .strict();
const fingerprint = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function unique(values: string[]) {
  if (new Set(values).size !== values.length)
    throw new ApiError(
      422,
      "DUPLICATE_BATCH_ROW",
      "Hay filas repetidas. Consolidá las cantidades o retiralas antes de revisar.",
    );
}
async function currentActor(tx: Tx, actor: Actor) {
  const user = found(await tx.user.findUnique({ where: { id: actor.id } }));
  if (!user.active || user.role !== actor.role)
    throw new ApiError(
      403,
      "FORBIDDEN",
      "Los permisos cambiaron. Revisá la operación.",
    );
}
export async function minimumPlan(
  tx: Tx,
  actor: Actor,
  input: z.infer<typeof minimumBatchSchema>,
) {
  requireRoles(actor, "GERENCIA", "COMPRAS");
  await currentActor(tx, actor);
  unique(input.rows.map((r) => r.materialId + ":" + r.locationId));
  const result = [];
  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index];
    try {
      const material = await validMaterial(tx, row.materialId),
        location = await locationAccess(actor, row.locationId, tx);
      const current = await tx.stockBalance.findUnique({
        where: {
          materialId_locationId: {
            materialId: row.materialId,
            locationId: row.locationId,
          },
        },
      });
      const own = current?.minimum?.toFixed() ?? null,
        general = material.minimum.toFixed(),
        next = row.minimum === null ? null : D(row.minimum).toFixed();
      result.push({
        ...row,
        minimum: next,
        index,
        material: material.name,
        unitId: material.unitId,
        location: location.name,
        general,
        own,
        effective: own ?? general,
        nextEffective: next ?? general,
        source:
          next !== null ? "LOCATION" : D(general).gt(0) ? "MATERIAL" : "NONE",
        change: own === next ? "UNCHANGED" : current ? "CHANGE" : "CREATE",
      });
    } catch (error) {
      throw new ApiError(
        error instanceof ApiError ? error.status : 422,
        "BATCH_ROW_ERROR",
        "Revisá la fila indicada; no se aplicó ningún cambio.",
        [
          {
            row: index + 1,
            message: error instanceof Error ? error.message : "Fila inválida",
          },
        ],
      );
    }
  }
  const planHash = fingerprint(
    result.map((r) => ({
      materialId: r.materialId,
      locationId: r.locationId,
      unitId: r.unitId,
      general: r.general,
      own: r.own,
      minimum: r.minimum,
    })),
  );
  return {
    planHash,
    rows: result,
    created: result.filter((r) => r.change === "CREATE").length,
    changed: result.filter((r) => r.change === "CHANGE").length,
    unchanged: result.filter((r) => r.change === "UNCHANGED").length,
  };
}
export async function movementPlan(
  tx: Tx,
  actor: Actor,
  input: z.infer<typeof movementBatchSchema>,
) {
  await currentActor(tx, actor);
  unique(input.rows.map((r) => r.materialId));
  const result = [];
  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index],
      b = moveSchema.parse({ ...input.header, ...row });
    await authorizeMovement(actor, b, tx);
    let validated;
    try {
      validated = await validateMovement(tx, actor, b);
    } catch (error) {
      throw new ApiError(
        error instanceof ApiError ? error.status : 422,
        "BATCH_ROW_ERROR",
        "Revisá la fila indicada; no se aplicó ningún cambio.",
        [
          {
            row: index + 1,
            message: error instanceof Error ? error.message : "Fila inválida",
          },
        ],
      );
    }
    const { material, source, destination: dest, reservation } = validated;
    const stock = source
      ? await tx.stockBalance.findUnique({
          where: {
            materialId_locationId: {
              materialId: b.materialId,
              locationId: source.id,
            },
          },
        })
      : null;
    const destinationStock = dest
      ? await tx.stockBalance.findUnique({
          where: {
            materialId_locationId: {
              materialId: b.materialId,
              locationId: dest.id,
            },
          },
        })
      : null;
    const physical = stock?.physical ?? D(0),
      reserved = stock?.reserved ?? D(0),
      available = physical.minus(reserved),
      usable = available.plus(reservation ? D(b.quantity) : 0);
    if (source && usable.lt(b.quantity))
      throw new ApiError(
        409,
        "BATCH_ROW_ERROR",
        "Stock disponible insuficiente; lote sin aplicar.",
        [
          {
            row: index + 1,
            message: material.name + ": disponible " + usable.toFixed(),
          },
        ],
      );
    result.push({
      ...row,
      index,
      material: material.name,
      unitId: material.unitId,
      sourceId: source?.id ?? null,
      destinationId: dest?.id ?? null,
      physical: physical.toFixed(),
      reserved: reserved.toFixed(),
      available: available.toFixed(),
      destinationPhysical: destinationStock?.physical.toFixed() ?? "0",
      sourceActive: source?.active ?? null,
      destinationActive: dest?.active ?? null,
      reservation: reservation
        ? {
            id: reservation.id,
            quantity: reservation.quantity.toFixed(),
            fulfilled: reservation.fulfilledQuantity.toFixed(),
            status: reservation.status,
          }
        : null,
    });
  }
  return {
    planHash: fingerprint({ header: input.header, rows: result }),
    rows: result,
  };
}
export async function handlerInventoryBatches(
  request: Request,
  actor: Actor,
  s: string[],
) {
  const minimum = s[0] === "stock-minimum-batches",
    movement = s[0] === "movement-batches";
  if (!minimum && !movement) return null;
  if (request.method !== "POST" || s.length > 2 || (s[1] && s[1] !== "preview"))
    return null;
  if (minimum) requireRoles(actor, "GERENCIA", "COMPRAS");
  const input = minimum
    ? await parse(request, minimumBatchSchema)
    : await parse(request, movementBatchSchema);
  if (!minimum)
    for (const row of (input as z.infer<typeof movementBatchSchema>).rows)
      await authorizeMovement(
        actor,
        moveSchema.parse({
          ...(input as z.infer<typeof movementBatchSchema>).header,
          ...row,
        }),
      );
  type Plan =
    | Awaited<ReturnType<typeof minimumPlan>>
    | Awaited<ReturnType<typeof movementPlan>>;
  const build = async (tx: Tx): Promise<Plan> =>
    minimum
      ? minimumPlan(tx, actor, input as z.infer<typeof minimumBatchSchema>)
      : movementPlan(tx, actor, input as z.infer<typeof movementBatchSchema>);
  if (s[1] === "preview") return ok(await transaction(build));
  if (!input.planHash)
    throw new ApiError(
      422,
      "PREVIEW_REQUIRED",
      "Revisá el lote antes de confirmar.",
    );
  return ok(
    await idempotent(
      actor,
      minimum ? "minimum-batch" : "movement-batch",
      request.headers.get("idempotency-key") ?? "",
      input,
      async (tx) => {
        const plan = await build(tx);
        if (plan.planHash !== input.planHash)
          throw new ApiError(
            409,
            "BATCH_CONFLICT",
            "El lote cambió desde la revisión. Revisá de nuevo; tus valores se conservan.",
          );
        const batchId = randomUUID(),
          results = [];
        if (minimum) {
          for (const row of (plan as Awaited<ReturnType<typeof minimumPlan>>)
            .rows) {
            if (row.change === "UNCHANGED") continue;
            const current = await balance(tx, row.materialId, row.locationId);
            const result = await tx.stockBalance.update({
              where: { id: current.id },
              data: { minimum: row.minimum },
            });
            await audit(tx, actor, "SET_MINIMUM", "StockBalance", current.id, {
              batchId,
              materialId: row.materialId,
              locationId: row.locationId,
              minimum: row.minimum,
            });
            results.push(result);
          }
        } else {
          const b = input as z.infer<typeof movementBatchSchema>;
          for (let i = 0; i < b.rows.length; i++)
            results.push(
              await applyMovement(
                tx,
                actor,
                moveSchema.parse({ ...b.header, ...b.rows[i] }),
                batchId + ":" + i,
                batchId,
              ),
            );
        }
        await audit(
          tx,
          actor,
          minimum ? "MINIMUM_BATCH" : "MOVEMENT_BATCH",
          "InventoryBatch",
          batchId,
          { count: results.length, ids: results.map((r) => r.id) },
        );
        return { batchId, count: results.length, rows: results };
      },
    ),
    201,
  );
}
