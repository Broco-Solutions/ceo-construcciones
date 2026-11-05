import { Role } from '@prisma/client';
import { db, transaction } from '../src/core/db';
import { hashPassword, verifyPassword, type Actor } from '../src/core/auth';

export async function ensureOnlineDemoAccounts(actor: Actor, credentials: Record<string, { email: string; password: string }>) {
  const authorized = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!authorized.active || authorized.role !== Role.GERENCIA || actor.role !== Role.GERENCIA) throw Error('Actor Gerencia requerido');
    const records: { role: Role; email: string; password: string; passwordHash: string }[] = [];
    for (const role of Object.values(Role)) {
      const c = credentials[role];
      if (!c || c.email !== `${role.toLowerCase()}@demo.ceo.invalid` || typeof c.password !== 'string') throw Error('Acceso DEMO inválido');
      records.push({ role, email: c.email, password: c.password, passwordHash: await hashPassword(c.password) });
    }
    return transaction(async tx => {
      const created: string[] = [], preserved: string[] = [];
      for (const c of records) {
        const previous = await tx.user.findUnique({ where: { email: c.email } });
        if (previous) {
          if (previous.role !== c.role || !previous.active || !previous.name.startsWith('DEMO · ') || !(await verifyPassword(c.password, previous.passwordHash))) throw Error('Cuenta existente en conflicto; no se modifica');
          preserved.push(c.role); continue;
        }
        const user = await tx.user.create({ data: { email: c.email, role: c.role, name: `DEMO · ${c.role}`, passwordHash: c.passwordHash } });
        await tx.auditLog.create({ data: { actorId: actor.id, action: 'CREATE_DEMO_ACCOUNT', entityType: 'User', entityId: user.id, after: { role: c.role, purpose: 'Demo online autorizada; sin comunicaciones' } } });
        created.push(c.role);
      }
      return { created, preserved };
    });

}
