import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";

const tag = `filters-${randomUUID()}`;
let adminId: string, chiefId: string, admin: string, chief: string;
let work: string,
  other: string,
  unit: string,
  category: string,
  material: string;
const origin = process.env.APP_ORIGIN ?? "http://localhost:3001";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  token = admin,
) {
  return dispatch(
    new Request(`${origin}/api/v1/${path}`, {
      method,
      headers: {
        origin,
        cookie: `ceo_session=${token}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    path.split("?")[0].split("/"),
  );
}
async function data(
  path: string,
  method = "GET",
  body?: unknown,
  token = admin,
) {
  const response = await call(path, method, body, token);
  const payload = await response.json();
  expect(response.status, JSON.stringify(payload)).toBeLessThan(300);
  return payload.data;
}
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "integración issue3: catálogo, filtros y referencia segura",
  () => {
    beforeAll(async () => {
      const target = new URL(process.env.DATABASE_URL!);
      if (
        !["localhost", "127.0.0.1"].includes(target.hostname) ||
        !/test/i.test(target.pathname)
      )
        throw new Error("Sólo PostgreSQL aislado local test");
      for (const role of ["GERENCIA", "JEFE_OBRA"] as const) {
        const user = await db.user.create({
          data: {
            email: `${role}-${tag}@example.test`,
            name: `Nombre ${role}`,
            role,
            passwordHash: "no-login-fixture",
          },
        });
        const token = randomBytes(32).toString("hex");
        await db.session.create({
          data: {
            userId: user.id,
            tokenHash: sessionHash(token),
            expiresAt: new Date(Date.now() + 600000),
          },
        });
        if (role === "GERENCIA") {
          adminId = user.id;
          admin = token;
        } else {
          chiefId = user.id;
          chief = token;
        }
      }
      work = (
        await data("works", "POST", { code: `${tag}-one`, name: "Obra uno" })
      ).id;
      other = (
        await data("works", "POST", {
          code: `${tag}-two`,
          name: "Obra dos",
          status: "PAUSED",
        })
      ).id;
      await data("works", "POST", { code: `${tag}-three`, name: "Obra tres" });
      await db.workAssignment.create({
        data: { userId: chiefId, workId: work },
      });
      unit = (await data("units", "POST", { code: tag, name: "Unidad filtro" }))
        .id;
      category = (
        await data("categories", "POST", { code: tag, name: "Rubro filtro" })
      ).id;
      material = (
        await data("materials", "POST", {
          code: `${tag}-one`,
          name: "Material activo",
          unitId: unit,
          categoryId: category,
        })
      ).id;
      await data("materials", "POST", {
        code: `${tag}-two`,
        name: "Material inactivo",
        unitId: unit,
        active: false,
      });
    });
    afterAll(async () => {
      await db.$disconnect();
    });
    it("busca obras antes de paginar y conserva alcance del Jefe", async () => {
      const first = await (
        await call(`works?q=${tag.toUpperCase()}&pageSize=1`)
      ).json();
      const second = await (
        await call(`works?search=${tag}&pageSize=1&page=2`)
      ).json();
      expect(first.pagination.total).toBe(3);
      expect(second.pagination.total).toBe(3);
      expect(first.data[0].id).not.toBe(second.data[0].id);
      const assigned = await (
        await call(`works?q=${tag}&pageSize=1`, "GET", undefined, chief)
      ).json();
      expect(assigned.pagination.total).toBe(1);
      expect(assigned.data.map((w: { id: string }) => w.id)).toEqual([work]);
      expect(
        (await data(`works?q=${tag}&status=PAUSED`)).map(
          (w: { id: string }) => w.id,
        ),
      ).toEqual([other]);
    });
    it("busca proveedores por nombre/código/CUIT con activo y total global", async () => {
      const one = await data("suppliers", "POST", {
        code: `${tag}-one`,
        name: "Corralón uno",
        taxId: `${tag}-tax`,
      });
      const two = await data("suppliers", "POST", {
        code: `${tag}-two`,
        name: "Corralón dos",
        active: false,
      });
      const found = await (
        await call(`suppliers?search=${tag}&pageSize=1`)
      ).json();
      expect(found.pagination.total).toBe(2);
      expect((await data(`suppliers?q=${tag}&active=false`))[0].id).toBe(
        two.id,
      );
      expect((await data(`suppliers?search=${tag}-tax`))[0].id).toBe(one.id);
      expect(
        (await call(`suppliers?search=${tag}`, "GET", undefined, chief)).status,
      ).toBe(403);
    });
    it("filtra materiales activos globalmente y rechaza activo inválido", async () => {
      const response = await (
        await call(`materials?search=${tag}&active=false&pageSize=1`)
      ).json();
      expect(response.pagination.total).toBe(1);
      expect(response.data[0].active).toBe(false);
      expect((await data(`materials?q=${tag}&active=true`))[0].id).toBe(
        material,
      );
      expect((await call("materials?active=no")).status).toBe(422);
    });
    it("audita obra con antes/después y filtra actor/acción/fechas antes de paginar", async () => {
      await data(`works/${work}`, "PATCH", { name: "Obra renombrada" });
      const path = `audit?entity=Work&actorId=${adminId}&action=UPDATE&from=2000-01-01T00:00:00Z&to=2100-01-01T00:00:00Z&pageSize=1`;
      const result = await (await call(path)).json();
      expect(result.pagination.total).toBe(1);
      expect(result.data[0]).toMatchObject({
        entityId: work,
        actorName: "Nombre GERENCIA",
        before: { name: "Obra uno" },
        after: { name: "Obra renombrada" },
      });
      expect(result.data[0]).not.toHaveProperty("actor");
      expect(await data(`audit?actorId=${chiefId}&action=UPDATE`)).toEqual([]);
      expect((await call("audit?from=bad")).status).toBe(422);
      expect(
        (await call("audit?from=2100-01-01T00:00:00Z&to=2000-01-01T00:00:00Z"))
          .status,
      ).toBe(422);
      expect((await call(path, "GET", undefined, chief)).status).toBe(403);
    });
    it("expone referencia vigente de obra sin snapshot ni economía al Jefe", async () => {
      expect(
        (await data(`works/${work}`, "GET", undefined, chief))
          .referenceVersionId,
      ).toBeNull();
      const item = await data("apu-items", "POST", {
        name: "Sólo MO",
        unitId: unit,
        categoryId: category,
        laborCost: "1",
        laborCurrency: "ARS",
        laborTaxBasis: "EXCLUDED",
        components: [],
      });
      const computation = await data("computations", "POST", {
        name: "Cómputo",
        workId: work,
        lines: [{ itemId: item.id, quantity: "1" }],
      });
      const budget = await data("budgets", "POST", {
        name: "Presupuesto",
        workId: work,
      });
      const version = await data(`budgets/${budget.id}/versions`, "POST", {
        computationId: computation.id,
        currency: "ARS",
        taxBasis: "EXCLUDED",
        precision: 2,
        roundingMode: "HALF_UP",
        roundingBoundary: "EXTENDED_LINE_COMPONENTS",
        prices: [],
      });
      await data(`budget-versions/${version.id}/reference`, "POST");
      const visible = await data(`works/${work}`, "GET", undefined, chief);
      expect(visible.referenceVersionId).toBe(version.id);
      expect(JSON.stringify(visible)).not.toMatch(
        /snapshot|price|cost|currency|taxBasis|password|email/i,
      );
      expect(
        (await call(`works/${other}`, "GET", undefined, chief)).status,
      ).toBe(403);
    });
    it("mantiene unidad inmutable y equivalencia uno sin presentación; errores documentados", async () => {
      expect(
        (await call(`materials/${material}`, "PATCH", { unitId: unit })).status,
      ).toBe(422);
      expect(
        (
          await call("prices", "POST", {
            materialId: material,
            price: "2",
            baseQuantity: "2",
            currency: "ARS",
            taxBasis: "EXCLUDED",
          })
        ).status,
      ).toBe(409);
      const price = await data("prices", "POST", {
        materialId: material,
        price: "2",
        baseQuantity: "1.0",
        currency: "ARS",
        taxBasis: "EXCLUDED",
      });
      expect(price.baseQuantity).toBe("1");
      const invalid = await (await call("apu-items", "POST", {})).json();
      expect(invalid.error.details).toMatchObject({
        formErrors: [],
        fieldErrors: expect.any(Object),
      });
      const issues = await (await call("materials", "POST", {})).json();
      expect(Array.isArray(issues.error.details)).toBe(true);
    });
  },
);
