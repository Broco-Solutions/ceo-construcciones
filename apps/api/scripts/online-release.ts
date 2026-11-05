/** Maintenance CLI, never imported by the server. No DDL, startup hook or endpoint. */
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { Role } from '@prisma/client';
import { db, schemaCapabilities } from '../src/core/db';
import { ensureOnlineDemoAccounts } from './online-demo-accounts';
import { applyCatalogInventory } from '../src/modules/catalog-load';
import { assertOnlineTarget, assertApplyConfirmation, sourceHashes } from './online-release-guard';
const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
async function operational() {
  return Object.fromEntries(await Promise.all(['client', 'work', 'supplier', 'budget', 'purchaseOrder', 'materialRequest', 'receipt', 'stockBalance', 'stockMovement'].map(async name => [name, await (db as any)[name].count()])));
}
async function main() {
  const [mode = 'inspect', directory, confirm] = process.argv.slice(2);
  assertOnlineTarget(process.env);
  if (!directory || !['inspect', 'catalog', 'accounts'].includes(mode)) throw Error('Uso: online-release.ts inspect|catalog|accounts DIRECTORIO [CONFIRMACION]');
  const root = resolve(directory);
  if ((await stat(root)).mode & 0o077) throw Error('El directorio debe ser privado (700)');
  const packet = JSON.parse(await readFile(join(root, 'release.json'), 'utf8'));
  if (process.env.RAILWAY_GIT_COMMIT_SHA !== packet.apiCommit) throw Error('El despliegue API no coincide con el paquete validado');
  const backup = JSON.parse(await readFile(join(root, 'backup-receipt.json'), 'utf8'));
  // Even dry-run validates all supplied artifacts; it never changes the database.
  const inputs: { input: any; hash: string }[] = [];
  for (const [source, hash] of Object.entries(sourceHashes)) {
    const entry = packet.sources[source];
    const original = await readFile(join(root, entry.original));
    const bytes = await readFile(join(root, entry.manifest));
    const input = JSON.parse(bytes.toString());
    if (digest(original) !== hash || digest(bytes) !== entry.manifestSha256 || input.sourceSha256 !== hash || (input.sourceLogical ?? 'BASE-CEO') !== source)
      throw Error('Fuente/manifiesto no coincide con el paquete inspeccionado');
    inputs.push({ input, hash });
  }
  const actor = await db.user.findUniqueOrThrow({ where: { id: packet.actorId }, select: { id: true, role: true, active: true } });
  if (!actor.active || actor.role !== Role.GERENCIA) throw Error('Actor autorizado requiere Gerencia activa');
  const before = await operational();
  if (mode === 'inspect') {
    console.log(JSON.stringify({ mode, capabilities: await schemaCapabilities(true), before, sources: inputs.map(x => ({ source: x.input.sourceLogical ?? 'BASE-CEO', hash: x.hash, activities: x.input.activities.length, prices: x.input.prices.length, labor: x.input.labor.length })) }));
    return;
  }
  assertApplyConfirmation(confirm, backup);
  if (mode === 'catalog') {
    const results = [];
    for (const { input, hash } of inputs) results.push(await applyCatalogInventory(input, hash, actor));
    const after = await operational();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw Error('Cambió un conteo operativo durante la carga; revisar antes de continuar');
    console.log(JSON.stringify({ mode, before, after, results }));
  } else {
    const file = join(root, 'credenciales-online.json');
    if ((await stat(file)).mode & 0o077) throw Error('Credenciales deben ser privadas (600)');
    const credentials = JSON.parse(await readFile(file, 'utf8'));
    const result = await ensureOnlineDemoAccounts(actor, credentials);
    console.log(JSON.stringify({ mode, ...result }));
  }
}
main().catch(async error => { if (process.argv[3]) await writeFile(join(resolve(process.argv[3]), 'failure-private.json'), JSON.stringify({ name: error?.name, message: error?.message, stack: error?.stack }), { mode: 0o600 }).catch(() => {}); console.error('Habilitación rechazada o fallida; revisar evidencia privada sin publicar datos ni credenciales.'); process.exitCode = 1; }).finally(() => db.$disconnect());
