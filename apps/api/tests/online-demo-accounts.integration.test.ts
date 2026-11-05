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
  it('creates once, preserves passwords/other users and rolls back conflicts without resets', async () => {
    const before = await db.user.findMany({ orderBy: { id: 'asc' } });
    const actor = await db.user.findUniqueOrThrow({ where: { id: (await f.data('auth/me')).id } });
    const credentials = Object.fromEntries(Object.values(Role).map(role => [role, { email: role.toLowerCase() + '@demo.ceo.invalid', password: randomBytes(24).toString('base64url') }]));
    expect((await ensureOnlineDemoAccounts(actor, credentials)).created).toHaveLength(5);
    const installed = await db.user.findMany({ where: { email: { in: Object.values(credentials).map(c => c.email) } }, orderBy: { id: 'asc' } });
    expect((await ensureOnlineDemoAccounts(actor, credentials)).preserved).toHaveLength(5);
    expect(await db.user.findMany({ where: { id: { in: installed.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(installed);
    expect(await db.user.findMany({ where: { id: { in: before.map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(before);
    const changed = { ...credentials, COMPRAS: { ...credentials.COMPRAS, password: randomBytes(24).toString('base64url') } };
    const demoAdmin = installed.find(u => u.role === Role.GERENCIA)!;
    await db.user.delete({ where: { id: demoAdmin.id } });
    await expect(ensureOnlineDemoAccounts(actor, changed)).rejects.toThrow('Cuenta existente en conflicto');
    expect(await db.user.findUnique({ where: { email: credentials.GERENCIA.email } })).toBeNull();
    expect(await db.user.findMany({ where: { id: { in: installed.filter(u => u.id !== demoAdmin.id).map(u => u.id) } }, orderBy: { id: 'asc' } })).toEqual(installed.filter(u => u.id !== demoAdmin.id));
  });
});
