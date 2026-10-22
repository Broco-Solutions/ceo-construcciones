import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.env.RUN_INTEGRATION !== '1')('autorización conserva conexión transaccional', () => {
  it('tres transacciones autorizan obras con un pool de sólo tres conexiones', () => {
    const target = new URL(process.env.DATABASE_URL ?? '');
    if (!['localhost', '127.0.0.1'].includes(target.hostname) || !target.pathname.includes('test'))
      throw new Error('Solo PostgreSQL local aislado test');
    target.searchParams.set('connection_limit', '3');
    target.searchParams.set('pool_timeout', '2');
    // A separate process ensures the singleton actually opens the constrained
    // pool; changing process.env after another test imported db is insufficient.
    const script = `
      import { randomUUID } from 'node:crypto';
      import { db, transaction } from './src/core/db';
      import { requireWork } from './src/core/auth';
      import { locationAccess } from './src/modules/shared';
      (async () => {
        const suffix = randomUUID();
        const actor = await db.user.create({data:{email:'pool-'+suffix+'@example.test',name:'Jefe pool',role:'JEFE_OBRA',passwordHash:'unused'}});
        const work = await db.work.create({data:{code:'pool-'+suffix,name:'Obra pool',assignments:{create:{userId:actor.id}},location:{create:{code:'pool-'+suffix,name:'Ubicación pool',kind:'WORK'}}},include:{location:true}});
        let arrived = 0;
        let release = () => {};
        const barrier = new Promise(resolve => { release = resolve; });
        try {
          const results = await Promise.allSettled([1,2,3].map(() => transaction(async tx => {
            await tx.work.count();
            if (++arrived === 3) release();
            await barrier;
            await requireWork(actor, work.id, tx);
            await locationAccess(actor, work.location.id, tx);
          })));
          console.info(JSON.stringify(results.map(result => result.status === 'fulfilled' ? {status:result.status} : {status:result.status,code:result.reason.code})));
          if (results.some(result => result.status !== 'fulfilled')) process.exitCode = 1;
        } finally {
          await db.workAssignment.deleteMany({where:{userId:actor.id}});
          await db.location.delete({where:{id:work.location.id}});
          await db.work.delete({where:{id:work.id}});
          await db.user.delete({where:{id:actor.id}});
          await db.$disconnect();
        }
      })().catch(() => { console.error('pool_regression_failed'); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../node_modules/tsx/dist/cli.mjs'), '--eval', script], {
      cwd: resolve(import.meta.dirname, '..'),
      env: { ...process.env, DATABASE_URL: target.toString() },
      encoding: 'utf8', timeout: 10000,
    });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual([{ status: 'fulfilled' }, { status: 'fulfilled' }, { status: 'fulfilled' }]);
  }, 12000);
});
