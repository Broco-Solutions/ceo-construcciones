import { Prisma } from "@prisma/client";
import type { Tx } from "../core/db";

/**
 * Códigos legibles y correlativos de entidades. No requiere migración de esquema.
 * El lock transaccional de PostgreSQL serializa las asignaciones del mismo tipo
 * y el contador se calcula desde los códigos persistidos, incluyendo importaciones.
 * Nunca cambia los códigos que ya están guardados.
 */
const scopes = {
  work: { prefix: "OBR", table: '"Work"', lock: 53810001n },
  supplier: { prefix: "PRV", table: '"Supplier"', lock: 53810002n },
  category: { prefix: "RUB", table: '"Category"', lock: 53810003n },
  material: { prefix: "MAT", table: '"Material"', lock: 53810004n },
  warehouse: { prefix: "GAL", table: '"Location"', lock: 53810005n },
  yard: { prefix: "PAT", table: '"Location"', lock: 53810006n },
  apu: { prefix: "APU", table: '"ApuItem"', lock: 53810007n },
} as const;

export type CodeScope = keyof typeof scopes;

export async function sequentialCode(tx: Tx, scope: CodeScope): Promise<string> {
  const { prefix, table, lock } = scopes[scope];
  // advisory_xact_lock se libera al commit/rollback; no se crea ninguna secuencia
  // que pueda desincronizarse con datos importados por código.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(${lock})`;
  const matching = `^${prefix}-[1-9][0-9]*$`;
  const leading = `^${prefix}-`;
  const values = await tx.$queryRaw<{ last: bigint }[]>(
    Prisma.sql`SELECT COALESCE(MAX(regexp_replace("code", ${leading}, '')::bigint), 0)::bigint AS "last"
    FROM ${Prisma.raw(table)} WHERE "code" ~ ${matching}`,
  );
  const next = (values[0]?.last ?? 0n) + 1n;
  return `${prefix}-${next.toString().padStart(3, "0")}`;
}
