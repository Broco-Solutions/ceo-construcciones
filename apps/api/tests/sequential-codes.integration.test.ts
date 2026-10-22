import { randomBytes, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";

const enabled = process.env.RUN_INTEGRATION === "1";
const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
const tag = randomUUID().slice(0, 12);
let token = "";
let unitId = "";
let categoryId = "";

async function request(path: string, method = "GET", body?: unknown) {
  const response = await dispatch(
    new Request(origin + "/api/v1/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: "ceo_session=" + token,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path.split("?")[0].split("/"),
  );
  const json = await response.json();
  return { response, json };
}

async function create(path: string, body: unknown) {
  const { response, json } = await request(path, "POST", body);
  expect(response.status, JSON.stringify(json)).toBe(201);
  return json.data as { id: string; code: string };
}

function numberOf(code: string, prefix: string) {
  expect(code).toMatch(new RegExp("^" + prefix + "-[0-9]{3,}$"));
  return BigInt(code.slice(prefix.length + 1));
}

describe.skipIf(!enabled)("códigos correlativos asignados en PostgreSQL", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || !/test/i.test(target.pathname))
      throw new Error("Solamente PostgreSQL aislado de pruebas");
    const user = await db.user.create({
      data: {
        email: "code-" + tag + "@example.test",
        name: "Pruebas códigos",
        role: "GERENCIA",
        passwordHash: "no-login-fixture",
      },
    });
    token = randomBytes(32).toString("hex");
    await db.session.create({
      data: { userId: user.id, tokenHash: sessionHash(token), expiresAt: new Date(Date.now() + 600000) },
    });
    const unit = await create("units", { code: "ud-" + tag, name: "Unidad técnica " + tag });
    unitId = unit.id;
  });

  it("crea obras OBR-001 ... y su ubicación asociada sin código enviado", async () => {
    const first = await create("works", { name: "Obra secuencial A " + tag });
    const second = await create("works", { name: "Obra secuencial B " + tag });
    expect(numberOf(second.code, "OBR")).toBe(numberOf(first.code, "OBR") + 1n);
    const location = await db.location.findUniqueOrThrow({ where: { workId: first.id } });
    expect(location.code).toBe("OBRA-" + first.code);
  });

  it("asigna prefijos distintos para rubros, proveedores, materiales, galpones y patios", async () => {
    const cat = await create("categories", { name: "Rubro secuencial " + tag });
    categoryId = cat.id;
    numberOf(cat.code, "RUB");
    const supplier = await create("suppliers", { name: "Proveedor secuencial " + tag });
    numberOf(supplier.code, "PRV");
    const mat = await create("materials", { name: "Material secuencial " + tag, unitId, categoryId });
    numberOf(mat.code, "MAT");
    const gal = await create("locations", { name: "Galpón prueba " + tag, kind: "WAREHOUSE" });
    numberOf(gal.code, "GAL");
    const patio = await create("locations", { name: "Patio prueba " + tag, kind: "YARD" });
    numberOf(patio.code, "PAT");
  });

  it("crea APU con código automático y conserva la carga explícita de mano de obra", async () => {
    if (!categoryId) {
      const c = await create("categories", { name: "Rubro para APU " + tag });
      categoryId = c.id;
    }
    const apu = await create("apu-items", {
      name: "APU automático " + tag,
      categoryId,
      unitId,
      laborCost: "0",
      laborCurrency: "ARS",
      laborTaxBasis: "UNSPECIFIED",
      components: [],
    });
    numberOf(apu.code, "APU");
  });

  it("sigue aceptando códigos anteriores, sin sobrescribir los importados", async () => {
    const custom = "PRV-MANUAL-" + tag;
    const supplier = await create("suppliers", { code: custom, name: "Proveedor legado " + tag });
    expect(supplier.code).toBe(custom);
    const { response } = await request("units", "POST", { name: "Sin símbolo " + tag });
    expect(response.status).toBe(422);
  });

  it("asigna correlativos únicos en altas simultáneas", async () => {
    const rows = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        create("suppliers", { name: "Proveedor concurrente " + tag + " " + i }),
      ),
    );
    const values = rows.map((x) => numberOf(x.code, "PRV"));
    expect(new Set(values.map(String)).size).toBe(rows.length);
    const sorted = values.slice().sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    expect(sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1n)).toBe(true);
  });
});
