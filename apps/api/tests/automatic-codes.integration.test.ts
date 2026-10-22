import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import { numberedCode } from "../src/modules/automatic-codes";

const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
const tag = randomUUID();
let token: string;

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
async function create<T extends { code: string }>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await call(path, "POST", body);
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(201);
  return json.data as T;
}
function number(code: string, prefix: string): number {
  expect(code).toMatch(new RegExp("^" + prefix + "-\\d{3,}$"));
  return Number(code.split("-")[1]);
}

describe.skipIf(process.env.RUN_INTEGRATION !== "1")("secuencias de códigos por entidad", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !/test/i.test(target.pathname))
      throw new Error("Integración sólo sobre base local de prueba");
    const user = await db.user.create({
      data: { email: "autocodes-" + tag + "@example.test", name: "Autocodes test", role: "GERENCIA", passwordHash: "test-only" },
    });
    token = randomBytes(32).toString("hex");
    await db.session.create({
      data: { userId: user.id, tokenHash: sessionHash(token), expiresAt: new Date(Date.now() + 600000) },
    });
  });
  afterAll(async () => { await db.$disconnect(); });

  it("genera OBR, PRV, RUB, UNI, MAT, UBI y APU sin código ingresado", async () => {
    const work = await create<{ id: string; code: string }>("works", { code: "AUTO", name: "Obra " + tag });
    number(work.code, "OBR");
    const location = await db.location.findFirstOrThrow({ where: { workId: work.id } });
    expect(location.code).toBe("OBRA-" + work.code);

    const supplier = await create<{ code: string }>("suppliers", { code: "AUTO", name: "Proveedor " + tag });
    number(supplier.code, "PRV");
    const category = await create<{ id: string; code: string }>("categories", { code: "AUTO", name: "Rubro " + tag });
    number(category.code, "RUB");
    const unit = await create<{ id: string; code: string }>("units", { code: "AUTO", name: "Unidad " + tag });
    number(unit.code, "UNI");
    const material = await create<{ code: string }>("materials", {
      code: "AUTO", name: "Material " + tag, categoryId: category.id, unitId: unit.id,
    });
    number(material.code, "MAT");
    const yard = await create<{ code: string }>("locations", { code: "AUTO", name: "Patio " + tag, kind: "YARD" });
    number(yard.code, "UBI");
    const apu = await create<{ code: string }>("apu-items", {
      code: "AUTO", name: "APU " + tag, categoryId: category.id, unitId: unit.id,
      laborCost: "0", laborCurrency: "ARS", laborTaxBasis: "UNSPECIFIED", components: [],
    });
    number(apu.code, "APU");
  });

  it("garantiza numeración distinta bajo altas simultáneas", async () => {
    const [a, b] = await Promise.all([
      create<{ code: string }>("suppliers", { code: "AUTO", name: "Proveedor paralelo 1 " + tag }),
      create<{ code: string }>("suppliers", { code: "AUTO", name: "Proveedor paralelo 2 " + tag }),
    ]);
    expect(a.code).not.toBe(b.code);
    expect(Math.abs(number(a.code, "PRV") - number(b.code, "PRV"))).toBe(1);
  });

  it("salta un código importado y conserva los códigos manuales históricos", async () => {
    const before = await db.codeCounter.findUniqueOrThrow({ where: { entity: "categories" } });
    const reserved = numberedCode("RUB", before.lastValue + 1);
    const manual = await create<{ code: string }>("categories", { code: reserved, name: "Rubro manual " + tag });
    expect(manual.code).toBe(reserved);
    const next = await create<{ code: string }>("categories", { code: "AUTO", name: "Rubro automático " + tag });
    expect(next.code).toBe(numberedCode("RUB", before.lastValue + 2));
  });
});
