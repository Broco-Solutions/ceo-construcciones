import { Prisma } from "@prisma/client";
import type { Tx } from "./db";
import type { Actor } from "./auth";

export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  entity: string,
  entityId: string,
  details?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({
    data: {
      actorId: actor.id,
      action,
      entityType: entity,
      entityId,
      ...(details === undefined ? {} : { after: details }),
    },
  });
}
