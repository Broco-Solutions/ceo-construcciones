#!/usr/bin/env node
// Datos sintéticos reproducibles para E2E/demos locales. Sólo contra una API local aislada.
// Requiere: E2E_BASE_URL (web con proxy, p.ej. http://localhost:3000), E2E_SECRETS_DIR con admin.pw
// (contraseña del Gerencia creado por bootstrap) y E2E_GERENCIA_EMAIL. Genera compras.pw, computo.pw y
// jefe.pw con contraseñas aleatorias. Es idempotente: reutiliza registros existentes por código/email.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const dir = process.env.E2E_SECRETS_DIR;
if (!dir) throw new Error('E2E_SECRETS_DIR requerido');
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1'].includes(host)) throw new Error(`Seed sólo permitido contra loopback, no ${host}`);

let cookie = '';
async function call(method, path, body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: base, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie();
  if (set.length) {
    const jar = Object.fromEntries(cookie.split('; ').filter(Boolean).map((c) => c.split(/=(.*)/s).slice(0, 2)));
    for (const c of set) {
      const [kv] = c.split(';');
      const [k, v] = kv.split(/=(.*)/s);
      jar[k] = v;
    }
    cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw Object.assign(new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`), { status: res.status });
  return json;
}
async function all(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await call('GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=100`);
    out.push(...r.data);
    if (out.length >= r.pagination.total || !r.data.length) return out;
  }
}
async function ensure(listPath, createPath, match, body) {
  const found = (await all(listPath)).find(match);
  if (found) return found;
  return (await call('POST', createPath, body)).data;
}
function secret(name) {
  const p = join(dir, name);
  if (existsSync(p)) return readFileSync(p, 'utf8').trim();
  const pw = randomBytes(18).toString('base64url');
  writeFileSync(p, pw, { mode: 0o600 });
  return pw;
}

await call('POST', '/auth/login', { email: process.env.E2E_GERENCIA_EMAIL ?? 'gerencia@demo.local', password: readFileSync(join(dir, 'admin.pw'), 'utf8').trim() });

const byCode = (code) => (x) => x.code === code;
const kg = await ensure('/units', '/units', byCode('KG'), { code: 'KG', name: 'Kilogramo' });
const m3 = await ensure('/units', '/units', byCode('M3'), { code: 'M3', name: 'Metro cúbico' });
await ensure('/units', '/units', byCode('M2'), { code: 'M2', name: 'Metro cuadrado' });
await ensure('/units', '/units', byCode('U'), { code: 'U', name: 'Unidad' });
const rev = await ensure('/categories', '/categories', byCode('REV'), { code: 'REV', name: 'Revoques' });
await ensure('/categories', '/categories', byCode('MAMP'), { code: 'MAMP', name: 'Mampostería' });
const cem = await ensure('/materials', '/materials', byCode('CEM-001'), { code: 'CEM-001', name: 'Cemento portland', unitId: kg.id, categoryId: rev.id, minimum: '500' });
await ensure('/materials', '/materials', byCode('CAL-001'), { code: 'CAL-001', name: 'Cal hidráulica', unitId: kg.id, categoryId: rev.id });
await ensure('/materials', '/materials', byCode('ARE-001'), { code: 'ARE-001', name: 'Arena fina', unitId: m3.id, categoryId: rev.id });
await ensure(`/presentations?materialId=${cem.id}`, '/presentations', (p) => p.name === 'Bolsa 50 kg', { materialId: cem.id, name: 'Bolsa 50 kg', baseQuantity: '50' });
await ensure('/suppliers', '/suppliers', byCode('PROV-DEMO-1'), { code: 'PROV-DEMO-1', name: 'Corralón Demo Sur' });
await ensure('/suppliers', '/suppliers', byCode('PROV-DEMO-CMP2'), { code: 'PROV-DEMO-CMP2', name: 'Proveedor Demo Oeste' });
await ensure('/locations', '/locations', byCode('GAL-01'), { code: 'GAL-01', name: 'Galpón Demo Central', kind: 'WAREHOUSE' });
await ensure('/locations', '/locations', byCode('PAT-01'), { code: 'PAT-01', name: 'Patio Demo', kind: 'YARD' });
const work = await ensure('/works', '/works', byCode('OBR-DEMO-01'), { code: 'OBR-DEMO-01', name: 'Obra Demo Norte', status: 'ACTIVE' });

const users = await all('/users');
for (const [file, email, name, role] of [
  ['compras.pw', 'compras@demo.local', 'Compras Demo', 'COMPRAS'],
  ['computo.pw', 'computo@demo.local', 'Cómputo Demo', 'COMPUTO'],
  ['jefe.pw', 'jefe@demo.local', 'Jefe Demo', 'JEFE_OBRA'],
]) {
  let u = users.find((x) => x.email === email);
  if (!u) u = (await call('POST', '/users', { email, name, role, password: secret(file) })).data;
  else if (!existsSync(join(dir, file))) throw new Error(`${email} existe pero falta ${file}`);
  if (role === 'JEFE_OBRA') await call('PUT', `/users/${u.id}/assignments`, { workIds: [work.id] });
}
console.log('Seed E2E listo: catálogo, ubicaciones, obra y usuarios sintéticos.');
