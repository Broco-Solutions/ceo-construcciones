import { describe, expect, it } from 'vitest';
import { assertOnlineTarget, assertApplyConfirmation, demoTarget } from '../scripts/online-release-guard';
const env = {
  RAILWAY_PROJECT_ID: demoTarget.projectId,
  RAILWAY_ENVIRONMENT_ID: demoTarget.environmentId,
  RAILWAY_SERVICE_ID: demoTarget.apiServiceId,
  APP_ORIGIN: demoTarget.origin,
  DATABASE_URL: 'postgresql://ignored:ignored@postgres.railway.internal:5432/railway',
};
const backup = {
  ...demoTarget,
  sha256: 'a'.repeat(64),
  verified: ['local/remote sha256 identical', 'pg_restore full decode exit 0'],
};
describe('one-off online release safeguards', () => {
  it('admits only the explicit existing target', () => expect(() => assertOnlineTarget(env)).not.toThrow());
  for (const key of ['RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID', 'RAILWAY_SERVICE_ID', 'APP_ORIGIN'])
    it(`rejects a different ${key}`, () => expect(() => assertOnlineTarget({ ...env, [key]: 'different' })).toThrow());
  it('rejects local and unrelated databases', () => {
    for (const url of ['postgresql://localhost/ceo_manual_test', 'postgresql://postgres.railway.internal/other', 'postgresql://another.railway.internal/railway'])
      expect(() => assertOnlineTarget({ ...env, DATABASE_URL: url })).toThrow();
  });
  it('requires explicit write confirmation plus the verified backup', () => {
    expect(() => assertApplyConfirmation(undefined, backup)).toThrow();
    expect(() => assertApplyConfirmation('APPLY_CEO_EXISTING_ONLINE_DEMO', backup)).not.toThrow();
    expect(() => assertApplyConfirmation('APPLY_CEO_EXISTING_ONLINE_DEMO', { ...backup, verified: [] })).toThrow();
    expect(() => assertApplyConfirmation('APPLY_CEO_EXISTING_ONLINE_DEMO', { ...backup, postgresServiceId: 'other' })).toThrow();
  });
});
