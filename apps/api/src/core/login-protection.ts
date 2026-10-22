import { randomBytes } from "node:crypto";
import { db, transaction } from "./db";
import { sessionHash } from "./auth";
import { ApiError } from "./errors";

export const LOGIN_CLIENT_COOKIE = "ceo_login_client";
export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const LOGIN_ATTEMPT_LIMIT = 10;
const VERIFICATION_CAPACITY = 2;
export const LOGIN_VERIFICATIONS_PER_SECOND = 20;
export const LOGIN_CLEANUP_BATCH = 1000;
const LOGIN_CLEANUP_INTERVAL_MS = 30000;

/** Keep a grace window so a returning client can renew its expired bucket. */
export async function purgeExpiredLoginAttempts(
  now = new Date(),
  client: Pick<typeof db, "$executeRaw"> = db,
): Promise<number> {
  // Prisma DateTime uses UTC-valued timestamp(3) without a timezone. Bind an
  // explicit timestamp string so the PostgreSQL session timezone cannot age it.
  const cutoff = new Date(
    now.getTime() - LOGIN_WINDOW_SECONDS * 1000,
  ).toISOString();
  return client.$executeRaw`
    WITH expired AS (
      SELECT "key" FROM "AuthAttempt"
      WHERE "resetAt" < ${cutoff}::timestamp
      ORDER BY "resetAt", "key"
      LIMIT ${LOGIN_CLEANUP_BATCH}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "AuthAttempt" AS attempts
    USING expired
    WHERE attempts."key" = expired."key"
      AND attempts."resetAt" < ${cutoff}::timestamp
  `;
}

/** One bounded purge per process/30 seconds; replicas skip rows being purged. */
export function createLoginCleanup(
  purge: () => Promise<number> = purgeExpiredLoginAttempts,
  now: () => number = () => performance.now(),
) {
  let nextCleanup = -Infinity;
  return async (): Promise<void> => {
    const current = now();
    if (current < nextCleanup) return;
    nextCleanup = current + LOGIN_CLEANUP_INTERVAL_MS;
    await purge();
  };
}
const cleanupLoginAttempts = createLoginCleanup();

export function loginClientKey(token: string): string {
  return `login-client:${sessionHash(token)}`;
}
export function loginClientCookie(token: string): string {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "true";
  return `${LOGIN_CLIENT_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${LOGIN_WINDOW_SECONDS}${secure ? "; Secure" : ""}`;
}
/** Unknown values never select a caller-chosen bucket. Store only a token hash. */
export async function identifyLoginClient(request: Request): Promise<string> {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${LOGIN_CLIENT_COOKIE}=`))
    ?.slice(LOGIN_CLIENT_COOKIE.length + 1);
  if (
    token &&
    /^[a-f0-9]{64}$/.test(token) &&
    (await db.authAttempt.findUnique({
      where: { key: loginClientKey(token) },
      select: { key: true },
    }))
  )
    return token;
  return randomBytes(32).toString("hex");
}
/** One quota per browser/client, across all emails. Never lock a user account. */
export async function consumeLoginAttempt(token: string): Promise<void> {
  await cleanupLoginAttempts();
  const key = loginClientKey(token);
  await transaction(async (tx) => {
    const now = new Date();
    const bucket = await tx.authAttempt.findUnique({ where: { key } });
    if (!bucket || bucket.resetAt <= now) {
      await tx.authAttempt.upsert({
        where: { key },
        create: {
          key,
          failures: 1,
          resetAt: new Date(now.getTime() + LOGIN_WINDOW_SECONDS * 1000),
        },
        update: {
          failures: 1,
          resetAt: new Date(now.getTime() + LOGIN_WINDOW_SECONDS * 1000),
        },
      });
      return;
    }
    if (bucket.failures >= LOGIN_ATTEMPT_LIMIT) {
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Demasiados intentos en este cliente. Reintente más tarde.",
        undefined,
        {
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000),
            ),
          ),
        },
      );
    }
    await tx.authAttempt.update({
      where: { key },
      data: { failures: { increment: 1 } },
    });
  });
}
/** Per-process admission also bounds fresh/rotated clients: no queue and no IP. */
export function createLoginGate(now: () => number = () => performance.now()) {
  let active = 0;
  let credits = LOGIN_VERIFICATIONS_PER_SECOND;
  let lastRefill = now();
  return async <T>(verify: () => Promise<T>): Promise<T> => {
    const current = now();
    credits = Math.min(
      LOGIN_VERIFICATIONS_PER_SECOND,
      credits +
        (Math.max(0, current - lastRefill) * LOGIN_VERIFICATIONS_PER_SECOND) /
          1000,
    );
    lastRefill = current;
    if (active >= VERIFICATION_CAPACITY || credits < 1)
      throw new ApiError(
        429,
        "AUTH_BUSY",
        "Inicio de sesión ocupado. Reintente en unos segundos.",
        undefined,
        { "Retry-After": "1" },
      );
    credits--;
    active++;
    try {
      return await verify();
    } finally {
      active--;
    }
  };
}
export const withLoginCapacity = createLoginGate();
