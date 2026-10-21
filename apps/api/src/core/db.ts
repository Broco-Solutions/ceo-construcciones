import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "./errors";

// Decimal(24,8) stock must retain every fractional digit during arithmetic.
Prisma.Decimal.set({ precision: 80 });

const globalDb = globalThis as unknown as { ceoDb?: PrismaClient };
export const db = globalDb.ceoDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.ceoDb = db;
export type Tx = Prisma.TransactionClient;

export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await db.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 10000,
        timeout: 20000,
      });
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034") throw error;
      if (attempt === 9)
        throw new ApiError(
          409,
          "CONCURRENT_OPERATION",
          "La operación coincidió con otra modificación. Reintente.",
        );
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(300, 15 * 2 ** attempt) + Math.random() * 100,
        ),
      );
    }
  }
  throw new Error("unreachable");
}
