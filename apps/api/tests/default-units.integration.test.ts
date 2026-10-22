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
