/** Explicit, one-off release target. Local helpers deliberately keep their guards. */
export const demoTarget = {
  projectId: 'd2fb9213-5508-4b3d-91a8-b6bd86451ceb',
  environmentId: 'f924e0f0-4b5e-4bc8-9054-9debff6bfa0e',
  apiServiceId: 'ecbce7df-7f7c-4c1b-88d0-87dffec35a3e',
  postgresServiceId: '1df48cf0-edaa-41f9-a063-39e681af962b',
  origin: 'https://ceo-construcciones.brocosolutions.com',
} as const;
export const sourceHashes = {
  'BASE-CEO': '5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e',
  'DG-CEO': '0e2e7b84dec93f910a5bd826c25bc61d05856a8952aaaea38f0c3ae2bb6facc0',
} as const;
export function assertOnlineTarget(env: Readonly<Record<string, string | undefined>>) {
  for (const [key, expected] of Object.entries({
    RAILWAY_PROJECT_ID: demoTarget.projectId,
    RAILWAY_ENVIRONMENT_ID: demoTarget.environmentId,
    RAILWAY_SERVICE_ID: demoTarget.apiServiceId,
    APP_ORIGIN: demoTarget.origin,
  })) if (env[key] !== expected) throw Error(`Destino rechazado: ${key}`);
  const url = new URL(env.DATABASE_URL ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== 'postgres.railway.internal' || url.pathname !== '/railway')
    throw Error('Postgres de destino rechazado');
}
export function assertApplyConfirmation(confirm: string | undefined, backup: { sha256?: string; verified?: string[]; projectId?: string; environmentId?: string; postgresServiceId?: string }) {
  if (confirm !== 'APPLY_CEO_EXISTING_ONLINE_DEMO') throw Error('Falta confirmación explícita de aplicación');
  if (backup.projectId !== demoTarget.projectId || backup.environmentId !== demoTarget.environmentId || backup.postgresServiceId !== demoTarget.postgresServiceId || !/^[a-f0-9]{64}$/.test(backup.sha256 ?? '') || !backup.verified?.includes('local/remote sha256 identical') || !backup.verified.includes('pg_restore full decode exit 0'))
    throw Error('Falta respaldo verificado del destino');
}
