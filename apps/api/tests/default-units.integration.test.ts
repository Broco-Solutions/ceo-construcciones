import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
const tag = randomUUID();
let token: string;

const DEFAULTS: [string, string][] = [
  ["Unidad", "un"], ["Metro", "m"], ["Metro cuadrado", "m²"], ["Metro cúbico", "m³"],
  ["Centímetro", "cm"], ["Milímetro", "mm"], ["Kilogramo", "kg"], ["Gramo", "g"],
  ["Tonelada", "t"], ["Litro", "L"], ["Mililitro", "mL"], ["Hora", "h"],
  ["Jornal", "jornal"], ["Día", "día"], ["Global", "gl"],
];
const migration = readFileSync(
  resolve(__dirname, "../prisma/migrations/20261023000100_default_units/migration.sql"),
  "utf8",
);

async function call(path: string, method = "GET", body?: unknown) {
  return dispatch(
    new Request(origin + "/api/v1/" + path, {
      method,
      headers: {
        origin,
        cookie: "ceo_session=" + token,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    path.split("?")[0].split("/"),
  );
}
const defaults = () =>
  db.unit.findMany({
    where: { OR: DEFAULTS.map(([name, symbol]) => ({ name, symbol })) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, symbol: true },
  });

describe.skipIf(process.env.RUN_INTEGRATION !== "1")("unidades predeterminadas", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !/test/i.test(target.pathname))
      throw new Error("Integración sólo sobre base local de prueba");
    const user = await db.user.create({
      data: { email: "units-" + tag + "@example.test", name: "Units test", role: "COMPUTO", passwordHash: "test-only" },
    });
    token = randomBytes(32).toString("hex");
    await db.session.create({
      data: { userId: user.id, tokenHash: sessionHash(token), expiresAt: new Date(Date.now() + 600000) },
    });
  });
  afterAll(async () => { await db.$disconnect(); });

  it("la migración deja disponibles las 15 unidades habituales con código UNI y símbolo", async () => {
    const rows = await defaults();
    expect(rows.map((r) => r.name).sort()).toEqual(DEFAULTS.map(([n]) => n).sort());
    for (const r of rows) expect(r.code).toMatch(/^UNI-\d{3,}$/);
    const res = await call("units?pageSize=100");
    expect(res.status).toBe(200);
    const listed = (await res.json()).data as { name: string; symbol: string | null }[];
    expect(listed.find((u) => u.name === "Metro cuadrado")?.symbol).toBe("m²");
  });

  it("volver a ejecutar la carga no duplica ni cambia códigos", async () => {
    const before = await defaults();
    const statements = migration.split(/\n(?=ALTER TABLE|CREATE OR REPLACE FUNCTION|DO \$\$|DROP FUNCTION)/);
    for (let i = 0; i < 2; i++)
      await db.$transaction(async (tx) => {
        for (const sql of statements) await tx.$executeRawUnsafe(sql);
      });
    expect(await defaults()).toEqual(before);
  });

  // Corre la migración real sobre copias vacías de Unit/CodeCounter en un esquema propio
  // (search_path local a la transacción) y revierte todo al terminar.
  async function legacyScenario(legacy: { code: string; name: string }[]) {
    const schema = "legacy_" + randomBytes(6).toString("hex");
    let result: { code: string; name: string; symbol: string | null }[] = [];
    let counter = 0;
    const rollback = new Error("rollback");
    await db
      .$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."Unit" (LIKE public."Unit" INCLUDING ALL)`);
          await tx.$executeRawUnsafe(`ALTER TABLE "${schema}"."Unit" DROP COLUMN "symbol"`);
          await tx.$executeRawUnsafe(`CREATE TABLE "${schema}"."CodeCounter" (LIKE public."CodeCounter" INCLUDING ALL)`);
          await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}", public`);
          await tx.$executeRawUnsafe(`INSERT INTO "CodeCounter" ("entity", "lastValue") VALUES ('units', ${legacy.length})`);
          for (const [i, u] of legacy.entries())
            await tx.$executeRawUnsafe(`INSERT INTO "Unit" ("id", "code", "name") VALUES ($1, $2, $3)`, "legacy-" + i, u.code, u.name);
          const statements = migration.split(/\n(?=ALTER TABLE|CREATE OR REPLACE FUNCTION|DO \$\$|DROP FUNCTION)/);
          for (let run = 0; run < 2; run++) for (const sql of statements) await tx.$executeRawUnsafe(sql);
          result = await tx.$queryRawUnsafe(`SELECT "code", "name", "symbol" FROM "Unit" ORDER BY "code"`);
          counter = (await tx.$queryRawUnsafe<{ lastValue: number }[]>(`SELECT "lastValue" FROM "CodeCounter" WHERE "entity" = 'units'`))[0].lastValue;
          throw rollback;
        },
        { timeout: 30000 },
      )
      .catch((e) => {
        if (e !== rollback) throw e;
      });
    const created = result.filter((u) => u.symbol !== null);
    return { legacy: result.filter((u) => u.symbol === null), created: created.map((u) => u.name), codes: created.map((u) => u.code), counter };
  }

  it("una unidad histórica «M» se toma como Metro", async () => {
    const r = await legacyScenario([{ code: "M", name: "M" }]);
    expect(r.legacy).toEqual([{ code: "M", name: "M", symbol: null }]);
    expect(r.created).not.toContain("Metro");
    expect(r.created).toContain("Mililitro");
    expect(r.created).toHaveLength(14);
  });

  it("«ML» con nombre Metro lineal se toma como Metro y no como Mililitro", async () => {
    const r = await legacyScenario([{ code: "ML", name: "Metro lineal" }]);
    expect(r.legacy).toEqual([{ code: "ML", name: "Metro lineal", symbol: null }]);
    expect(r.created).not.toContain("Metro");
    expect(r.created).toContain("Mililitro");
    expect(r.created).toHaveLength(14);
  });

  it("«mL» o un nombre Mililitro se toman como Mililitro y no como Metro", async () => {
    for (const legacy of [{ code: "mL", name: "mL" }, { code: "ML", name: "Mililitros" }]) {
      const r = await legacyScenario([legacy]);
      expect(r.legacy).toEqual([{ ...legacy, symbol: null }]);
      expect(r.created).not.toContain("Mililitro");
      expect(r.created).toContain("Metro");
      expect(r.created).toHaveLength(14);
    }
  });

  it("«ML» ambiguo se conserva sin atribuirle significado y no bloquea Metro ni Mililitro", async () => {
    for (const legacy of [{ code: "ML", name: "ML" }, { code: "UNI-001", name: "ml" }]) {
      const r = await legacyScenario([legacy]);
      expect(r.legacy).toEqual([{ ...legacy, symbol: null }]);
      expect(r.created).toContain("Metro");
      expect(r.created).toContain("Mililitro");
      expect(r.created).toHaveLength(15);
      // Códigos UNI-### del contador, salteando los ocupados y sin repetir con dos ejecuciones.
      for (const c of r.codes) expect(c).toMatch(/^UNI-\d{3,}$/);
      expect(new Set(r.codes).size).toBe(15);
      expect(r.codes).not.toContain("UNI-001");
      expect(r.counter).toBe(16);
    }
  });

  it("permite agregar unidades propias con la secuencia UNI y símbolo opcional", async () => {
    const res = await call("units", "POST", { code: "AUTO", name: "Viaje de camión " + tag, symbol: "viaje" });
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(201);
    expect(json.data.code).toMatch(/^UNI-\d{3,}$/);
    expect(json.data.symbol).toBe("viaje");
    const highest = Math.max(...(await defaults()).map((u) => Number(u.code.slice(4))));
    expect(Number(json.data.code.slice(4))).toBeGreaterThan(highest);

    const cleared = await call("units/" + json.data.id, "PATCH", { symbol: null });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).data.symbol).toBeNull();

    const plain = await call("units", "POST", { code: "AUTO", name: "Pliego " + tag });
    expect(plain.status).toBe(201);
    expect((await plain.json()).data.symbol).toBeNull();

    const tooLong = await call("units", "POST", { code: "AUTO", name: "Larga " + tag, symbol: "x".repeat(21) });
    expect(tooLong.status).toBe(422);
  });
});
