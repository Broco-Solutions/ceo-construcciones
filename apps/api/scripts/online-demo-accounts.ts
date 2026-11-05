import { Role } from '@prisma/client';
import { db, transaction } from '../src/core/db';
import { hashPassword, verifyPassword, type Actor } from '../src/core/auth';

export async function ensureOnlineDemoAccounts(actor: Actor, credentials: Record<string, { id?: string; email: string; password: string }>) {
  const authorized = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!authorized.active || authorized.role !== Role.GERENCIA || actor.role !== Role.GERENCIA) throw Error('Actor Gerencia requerido');
    const records: { role: Role; id?: string; email: string; password: string }[] = [];
    for (const role of Object.values(Role)) {
      const c = credentials[role];
      if (!c || typeof c.password !== 'string' || typeof c.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) || (c.id !== undefined && (typeof c.id !== 'string' || !c.id)) || (!c.id && c.email !== `${role.toLowerCase()}@demo.ceo.invalid`)) throw Error('Acceso DEMO inválido');
      records.push({ role, id: c.id, email: c.email, password: c.password });
    }
    return transaction(async tx => {
      const created: string[] = [], preserved: string[] = [];
      for (const c of records) {
        const previous = await tx.user.findUnique({ where: c.id ? { id: c.id } : { email: c.email } });
        if (c.id && !previous) throw Error('Identidad DEMO ausente; no se recrea');
        if (previous) {
          const origin = await tx.auditLog.findFirst({ where: { action: 'CREATE_DEMO_ACCOUNT', entityType: 'User', entityId: previous.id } });
          if (!origin || previous.email !== c.email || previous.role !== c.role || !previous.active || !previous.name.startsWith('DEMO · ') || !(await verifyPassword(c.password, previous.passwordHash))) throw Error('Cuenta existente en conflicto; no se modifica');
          preserved.push(c.role); continue;
        }
        const installed = await tx.auditLog.findFirst({ where: { action: 'CREATE_DEMO_ACCOUNT', entityType: 'User', after: { path: ['role'], equals: c.role } } });
        if (installed) throw Error('Cuenta DEMO ya instalada: requiere correspondencia por ID; no se recrea');
        const user = await tx.user.create({ data: { email: c.email, role: c.role, name: `DEMO · ${c.role}`, passwordHash: await hashPassword(c.password) } });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'CREATE_DEMO_ACCOUNT', entityType: 'User', entityId: user.id, after: { role: c.role, purpose: 'Demo online autorizada; sin comunicaciones' } } });
        created.push(c.role);
      }
      return { created, preserved };
    });

}
