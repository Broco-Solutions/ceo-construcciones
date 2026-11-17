import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";

describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "M07: clientes, obras y conservación de vínculos",
  () => {
    let f: Awaited<ReturnType<typeof closureFixture>>;
    let client: string, emptyClient: string, work: string, secondWork: string;
    let chief: string;
    beforeAll(async () => {
      f = await closureFixture();
      client = (await f.data("clients", "POST", {
        code: `m07-a-${f.tag}`, name: `Cliente principal ${f.tag}`,
      }, undefined, "COMPUTO")).id;
      emptyClient = (await f.data("clients", "POST", {
        code: `m07-b-${f.tag}`, name: `Cliente sin obras ${f.tag}`,
      })).id;
      work = (await f.data("works", "POST", {
        code: `m07-a-${f.tag}`, name: "Primera obra M07", clientId: client,
      })).id;
      secondWork = (await f.data("works", "POST", {
        code: `m07-b-${f.tag}`, name: "Segunda obra M07", clientId: client,
      })).id;
      chief = (await db.user.findUniqueOrThrow({
        where: { email: `${f.tag}-JEFE_OBRA@test.invalid` },
      })).id;
    });
    afterAll(() => db.$disconnect());

    it("conserva todos los campos editados del cliente y aplica permisos de lectura/escritura", async () => {
      expect((await f.call("clients", "POST", { code: `invalid-${f.tag}` })).status).toBe(422);
      const initial = await f.data(`clients/${client}`);
      expect(initial.taxId).toBeNull();
      expect((await f.data(`clients/${emptyClient}`)).works).toEqual([]);
      const fields = {
        name: `Cliente editado ${f.tag}`, contact: "Contacto M07", phone: "0351-000000",
        email: "m07@test.invalid", address: "Dirección sintética 123", notes: "Observación conservada",
      };
      await f.data(`clients/${client}`, "PATCH", fields, undefined, "COMPUTO");
      expect(await f.data(`clients/${client}`, "GET", undefined, undefined, "COMPRAS")).toMatchObject(fields);
      await f.data(`clients/${client}`, "PATCH", { notes: "Edición Gerencia" });
      for (const role of ["COMPRAS", "JEFE_OBRA", "ADMINISTRACION"] as const) {
        for (const [path, method, body] of [
          ["clients", "POST", { code: `denied-${f.tag}`, name: "Rechazado" }],
          [`clients/${client}`, "PATCH", { name: "Rechazado" }],
        ] as const) expect((await f.call(path, method, body, undefined, role)).status).toBe(403);
      }
      for (const role of ["JEFE_OBRA", "ADMINISTRACION"] as const) {
        for (const path of ["clients", `clients/${client}`])
          expect((await f.call(path, "GET", undefined, undefined, role)).status).toBe(403);
      }
      expect((await f.data(`clients/${client}`)).name).toBe(fields.name);
      const audit = await f.data(`audit?entity=Client&entityId=${client}`);
      expect(audit.some((a: any) => a.action === "CREATE")).toBe(true);
      expect(audit.filter((a: any) => a.action === "UPDATE")).toHaveLength(2);
      expect(audit.every((a: any) => a.actorId && !Number.isNaN(Date.parse(a.createdAt)))).toBe(true);
    });

    it("edita responsable/estado/dirección sin otorgar acceso implícito y asigna/revoca obras", async () => {
      const before = await f.data(`works/${work}`);
      expect(before.location).toMatchObject({ workId: work, kind: "WORK", code: `OBRA-m07-a-${f.tag}` });
      await f.data(`works/${work}`, "PATCH", {
        name: "Primera obra editada", address: "Dirección de obra M07", managerId: chief,
      });
      expect((await f.call(`works/${work}`, "GET", undefined, undefined, "JEFE_OBRA")).status).toBe(403);
      for (const status of ["PAUSED", "COMPLETED", "ACTIVE"]) {
        await f.data(`works/${work}`, "PATCH", { status });
        expect(await f.data(`works/${work}`)).toMatchObject({
          name: "Primera obra editada", address: "Dirección de obra M07", managerId: chief,
          status, clientId: client, location: { id: before.location.id, workId: work },
        });
      }
      expect((await f.call(`works/${work}`, "PATCH", { status: "INVALID" })).status).toBe(422);
      await f.data(`users/${chief}/assignments`, "PUT", { workIds: [work, work] });
      expect(await f.data(`users/${chief}/assignments`)).toEqual([{ workId: work }]);
      expect((await f.data(`works?q=${f.tag}`, "GET", undefined, undefined, "JEFE_OBRA")).map((w: any) => w.id)).toEqual([work]);
      await f.data(`works/${work}`, "GET", undefined, undefined, "JEFE_OBRA");
      expect((await f.call(`works/${secondWork}`, "GET", undefined, undefined, "JEFE_OBRA")).status).toBe(403);
      for (const role of ["COMPRAS", "COMPUTO", "JEFE_OBRA", "ADMINISTRACION"] as const) {
        expect((await f.call(`works/${work}`, "PATCH", { name: "Prohibido" }, undefined, role)).status).toBe(403);
        expect((await f.call("works", "POST", { code: `denied-${f.tag}`, name: "Prohibido", clientId: client }, undefined, role)).status).toBe(403);
        expect((await f.call(`users/${chief}/assignments`, "PUT", { workIds: [] }, undefined, role)).status).toBe(403);
      }
      await f.data(`users/${chief}/assignments`, "PUT", { workIds: [] });
      expect((await f.call(`works/${work}`, "GET", undefined, undefined, "JEFE_OBRA")).status).toBe(403);
      const audit = await f.data(`audit?entity=Work&entityId=${work}`);
      expect(audit.some((a: any) => a.action === "CREATE")).toBe(true);
      expect(audit.some((a: any) => a.before?.managerId === null && a.after?.managerId === chief)).toBe(true);
      expect(await db.location.count({ where: { workId: work } })).toBe(1);
    });

    it("filtra y pagina clientes/obras conservando vínculos y totales sin duplicados", async () => {
      const pages = [];
      for (const page of [1, 2]) {
        const response = await f.call(`clients?q=${f.tag}&pageSize=1&page=${page}`);
        const payload = await response.json();
        expect(payload.pagination.total).toBe(2);
        pages.push(payload.data[0].id);
      }
      expect(new Set(pages)).toEqual(new Set([client, emptyClient]));
      for (const page of [1, 2]) {
        const payload = await (await f.call(`works?clientId=${client}&pageSize=1&page=${page}`)).json();
        expect(payload.pagination.total).toBe(2);
        expect(payload.data[0].clientId).toBe(client);
        expect(payload.data[0].client.id).toBe(client);
        expect(payload.data[0].id).toBe(page === 1 ? work : secondWork);
      }
      await f.data(`works/${secondWork}`, "PATCH", { status: "PAUSED" });
      expect((await f.data(`works?clientId=${client}&status=PAUSED`)).map((w: any) => w.id)).toEqual([secondWork]);
      expect(await f.data(`works?clientId=${emptyClient}`)).toEqual([]);
      const detail = await f.data(`clients/${client}`);
      expect(detail.works.map((w: any) => w.id)).toEqual([work, secondWork]);
    });

    it("inactivar preserva obras/presupuestos/auditoría y las obras históricas conservan cliente null", async () => {
      const budget = await db.budget.create({ data: { workId: work, name: "Presupuesto vinculado M07" } });
      const legacy = await db.work.create({ data: { code: `m07-legacy-${f.tag}`, name: "Histórica sintética sin cliente" } });
      const historical = await f.data(`works/${legacy.id}`);
      expect(historical).toMatchObject({ clientId: null, client: null });
      const worksBefore = await db.work.findMany({ where: { clientId: client }, include: { location: true, assignments: true, budgets: true }, orderBy: { id: "asc" } });
      const history = await db.auditLog.findMany({ where: { entityId: { in: [client, work, secondWork] } }, orderBy: { id: "asc" } });
      await f.data(`clients/${client}`, "PATCH", { active: false }, undefined, "COMPUTO");
      for (let n = 0; n < 2; n++) {
        const detail = await f.data(`clients/${client}`);
        expect(detail.active).toBe(false);
        expect(detail.works).toHaveLength(2);
        expect(detail.works.flatMap((w: any) => w.budgets.map((b: any) => b.id))).toEqual([budget.id]);
      }
      expect(await db.work.findMany({ where: { clientId: client }, include: { location: true, assignments: true, budgets: true }, orderBy: { id: "asc" } })).toEqual(worksBefore);
      expect(await db.auditLog.findMany({ where: { id: { in: history.map(a => a.id) } }, orderBy: { id: "asc" } })).toEqual(history);
      expect(await db.work.findUnique({ where: { id: legacy.id } })).toEqual(legacy);
      expect((await f.data(`clients?q=${f.tag}&active=false`)).map((c: any) => c.id)).toEqual([client]);
      expect((await f.data(`clients?q=${f.tag}&active=true`)).map((c: any) => c.id)).toEqual([emptyClient]);
      expect((await f.call("works", "POST", { code: `m07-no-client-${f.tag}`, name: "Sin cliente" })).status).toBe(422);
      expect((await f.call("works", "POST", { code: `m07-inactive-${f.tag}`, name: "Cliente inactivo", clientId: client })).status).toBe(422);
    });
  },
);
