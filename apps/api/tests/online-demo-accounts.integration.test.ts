import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Role } from '@prisma/client';
import { db } from '../src/core/db';
import { closureFixture } from './closure-fixture';
import { ensureOnlineDemoAccounts } from '../scripts/online-demo-accounts';

describe.skipIf(process.env.RUN_INTEGRATION !== '1')('online demo maintenance action on isolated PostgreSQL', () => {
  let f: Awaited<ReturnType<typeof closureFixture>>;
  beforeAll(async () => { f = await closureFixture(); });
  afterAll(() => db.$disconnect());
  it('creates once, preserves passwords/other users and refuses conflicts or stale identities without resets', async () => {
    const before = await db.user.findMany({ orderBy: { id: 'asc' } });
    const actor = await db.user.findUniqueOrThrow({ where: { id: (await f.data('auth/me')).id } });
    const credentials = Object.fromEntries(Object.values(Role).map(role => [role, { email: role.toLowerCase() + '@demo.ceo.invalid', password: randomBytes(24).toString('base64url') }]));
    expect((await ensureOnlineDemoAccounts(actor, credentials)).created).toHaveLength(5);
    const installed = await db.user.findMany({ where: { email: { in: Object.values(credentials).map(c => c.email) } }, orderBy: { id: 'asc' } });
    expect((await ensureOnlineDemoAccounts(actor, credentials)).preserved).toHaveLength(5);
    expect(await db.user.findMany({ where: { id: { in: installed.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(installed);
    expect(await db.user.findMany({ where: { id: { in: before.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(before);
    const changed = { ...credentials, COMPRAS: { ...credentials.COMPRAS, password: randomBytes(24).toString('base64url') } };
    await expect(ensureOnlineDemoAccounts(actor, changed)).rejects.toThrow('Cuenta existente en conflicto');
    expect(await db.user.findMany({ where: { id: { in: installed.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(installed);
    const demoAdmin = installed.find(u => u.role === Role.GERENCIA)!;
    await db.user.delete({ where: { id: demoAdmin.id } });
    await expect(ensureOnlineDemoAccounts(actor, credentials)).rejects.toThrow('requiere correspondencia por ID');
    expect(await db.user.findUnique({ where: { email: credentials.GERENCIA.email } })).toBeNull();
    expect(await db.user.findMany({ where: { id: { in: installed.filter(u => u.id !== demoAdmin.id).map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(installed.filter(u => u.id !== demoAdmin.id));
  });
});

describe.skipIf(process.env.RUN_INTEGRATION !== '1')('stable identities after demo account rename', () => {
  afterAll(() => db.$disconnect());
  it('recognizes renamed identities by ID, never recreates a missing identity or falls back to another user', async () => {
    const f = await closureFixture();
    const actor = await f.data('auth/me');
    const credentials: Record<string, { id: string; email: string; password: string }> = {};
    for (const role of Object.values(Role)) {
      const password = randomBytes(24).toString('base64url');
      const user = await f.data('users', 'POST', { name: `DEMO · ${role}`, email: `${role.toLowerCase()}-${f.tag}@example.invalid`, password, role });
      await db.auditLog.create({ data: { actorId: actor.id, action: 'CREATE_DEMO_ACCOUNT', entityType: 'User', entityId: user.id } });
      credentials[role] = { id: user.id, email: user.email, password };
    }
    const snapshot = await db.user.findMany({ where: { id: { in: Object.values(credentials).map(c => c.id) } }, orderBy: { id: 'asc' } });
    expect((await ensureOnlineDemoAccounts(actor, credentials)).preserved).toHaveLength(5);
    expect(await db.user.findMany({ where: { id: { in: snapshot.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(snapshot);
    const missing = { ...credentials, GERENCIA: { ...credentials.GERENCIA, id: 'missing-demo-identity' } };
    await expect(ensureOnlineDemoAccounts(actor, missing)).rejects.toThrow('Identidad DEMO ausente');
    const wrong = { ...credentials, GERENCIA: { ...credentials.GERENCIA, id: credentials.COMPRAS.id } };
    await expect(ensureOnlineDemoAccounts(actor, wrong)).rejects.toThrow('Cuenta existente en conflicto');
    expect(await db.user.findMany({ where: { id: { in: snapshot.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(snapshot);
  });
});
