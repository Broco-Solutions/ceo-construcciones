import { type Actor } from "../core/auth";
import { db, type Tx, schemaCapabilities } from "../core/db";
import { ApiError } from "../core/errors";

export async function receptionAccess(
  actor: Actor,
  order: { workId: string | null; destinationId: string },
  locationId: string,
  client: Tx | typeof db = db,
) {
  const location = await client.location.findUnique({
    where: { id: locationId },
  });
  if (!location?.active)
    throw new ApiError(403, "FORBIDDEN", "Destino de recepción no autorizado.");
  if (actor.role === "GERENCIA") return location;
  if (actor.role === "COMPRAS" && !location.workId) return location;
  if (!(await schemaCapabilities()).receptions) {
    if (actor.role === "COMPRAS") return location;
    if (actor.role !== "JEFE_OBRA")
      throw new ApiError(
        403,
        "FORBIDDEN",
        "Delegación no habilitada en este entorno.",
      );
  }
  if (
    actor.role === "JEFE_OBRA" &&
    location.workId &&
    order.workId === location.workId &&
    (await client.workAssignment.findUnique({
      where: { userId_workId: { userId: actor.id, workId: location.workId } },
    }))
  )
    return location;
  if (
    (await schemaCapabilities()).receptions &&
    order.destinationId === locationId &&
    (await client.receptionDelegation.findUnique({
      where: { userId_locationId: { userId: actor.id, locationId } },
    }))
  )
    return location;
  throw new ApiError(
    403,
    "FORBIDDEN",
    "No tiene delegación de recepción para este destino.",
  );
}
