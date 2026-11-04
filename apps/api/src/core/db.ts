import { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "./errors";

// Decimal(24,8) stock must retain every fractional digit during arithmetic.
Prisma.Decimal.set({ precision: 80 });

const globalDb = globalThis as unknown as { ceoRawDb?: PrismaClient };
const rawDb = globalDb.ceoRawDb ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalDb.ceoRawDb = rawDb;
type Capabilities = {
  clients: boolean;
  commercial: boolean;
  receptions: boolean;
  coverage: boolean;
  activities: boolean;
  referenceCosts: boolean;
};
let capabilities: Capabilities | undefined,
  capabilityPromise: Promise<Capabilities> | undefined,
  lastProbe = 0;
/** Read-only application schema probe. Requests refresh it before starting
 * transactions; queries inside a transaction reuse the settled result. */
export async function schemaCapabilities(
  refresh = false,
): Promise<Capabilities> {
  if (capabilities && (!refresh || Date.now() - lastProbe < 10000))
    return capabilities;
  if (capabilityPromise) return capabilityPromise;
  capabilityPromise = rawDb.$queryRaw<Capabilities[]>`SELECT
    (to_regclass('public."Client"') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Work' AND column_name='clientId') AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='Work' AND column_name='address')) AS clients,
    (to_regclass('public."BudgetDraft"') IS NOT NULL AND to_regclass('public."BudgetIssue"') IS NOT NULL AND to_regclass('public."BudgetTemplate"') IS NOT NULL) AS commercial,
    (to_regclass('public."ReceptionDelegation"') IS NOT NULL AND to_regclass('public."OrderInvoiceInfo"') IS NOT NULL) AS receptions,
    (to_regclass('public."ReceiptCoverage"') IS NOT NULL AND to_regclass('public."OrderAmountPolicy"') IS NOT NULL) AS coverage,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ApuItem' AND column_name='directCost') AS activities,
    (to_regclass('public."LaborResource"') IS NOT NULL AND to_regclass('public."LaborRate"') IS NOT NULL AND to_regclass('public."ActivityCosting"') IS NOT NULL AND to_regclass('public."CatalogOrigin"') IS NOT NULL AND to_regclass('public."CatalogLoadRun"') IS NOT NULL) AS "referenceCosts"`
    .then((rows) => {
      capabilities = rows[0];
      lastProbe = Date.now();
      return capabilities;
    })
    .finally(() => {
      capabilityPromise = undefined;
    });
  return capabilityPromise;
}
const legacyWorkFields = [
  "id",
  "code",
  "name",
  "status",
  "managerId",
  "createdAt",
  "updatedAt",
];
const modelMap = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
/** Prisma selects implicit scalars, including new nullable columns. Replace
 * those projections on V1, including nested Work relations, before execution. */
export function compatibleProjection(
  model: string,
  input: Record<string, unknown>,
  cap: Pick<Capabilities, "clients" | "activities"> = {
    clients: false,
    activities: false,
  },
): Record<string, unknown> {
  const args = { ...input },
    definition = modelMap.get(model);
  for (const kind of ["select", "include"] as const) {
    const selection = args[kind];
    if (!selection || typeof selection !== "object") continue;
    const projected = { ...(selection as Record<string, unknown>) };
    for (const [name, value] of Object.entries(projected)) {
      const field = definition?.fields.find(
        (f) => f.name === name && f.kind === "object",
      );
      if (field && (value === true || (value && typeof value === "object")))
        projected[name] = compatibleProjection(
          field.type,
          value === true ? {} : (value as Record<string, unknown>),
          cap,
        );
    }
    args[kind] = projected;
  }
  if (model === "Work" && !cap.clients) {
    const selected = args.select as Record<string, unknown> | undefined,
      included = args.include as Record<string, unknown> | undefined;
    const projection = selected
      ? { ...selected }
      : {
          ...Object.fromEntries(legacyWorkFields.map((k) => [k, true])),
          ...included,
        };
    delete projection.client;
    delete projection.clientId;
    delete projection.address;
    args.select = projection;
    delete args.include;
  }
  if (model === "ApuItem" && !cap.activities) {
    const selected = args.select as Record<string, unknown> | undefined,
      included = args.include as Record<string, unknown> | undefined;
    const fields = definition!.fields
      .filter((f) => f.kind !== "object" && f.name !== "directCost")
      .map((f) => [f.name, true]);
    const projection = selected
      ? { ...selected }
      : { ...Object.fromEntries(fields), ...included };
    delete projection.directCost;
    args.select = projection;
    delete args.include;
  }
  return args;
}
const projectionOperations = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "create",
  "update",
  "upsert",
  "delete",
]);
const extended = rawDb.$extends({
  query: {
    $allModels: {
      $allOperations: async ({ model, operation, args, query }) => {
        const cap = await schemaCapabilities();
        return query(
          (!cap.clients || !cap.activities) &&
            projectionOperations.has(operation)
            ? (compatibleProjection(
                model,
                args as Record<string, unknown>,
                cap,
              ) as typeof args)
            : args,
        );
      },
    },
  },
});
export const db = extended as unknown as PrismaClient;
export type Tx = Prisma.TransactionClient;

export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  // Settle the read-only probe before occupying a transaction connection.
  await schemaCapabilities();
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
