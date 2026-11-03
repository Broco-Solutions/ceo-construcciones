import { describe, it, expect, afterAll } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { db } from "../src/core/db";
import { closureFixture } from "./closure-fixture";
describe.skipIf(process.env.RUN_INTEGRATION !== "1")(
  "F8: transición CEO Obras aislada",
  () => {
    afterAll(() => db.$disconnect());
    it("T45/T47: dry-run sin escritura, cliente/obra real y OC sólo pendiente; repetir no duplica", async () => {
      const f = await closureFixture(),
        prefix = `transition-${f.tag}`,
        dir = await mkdtemp(join(tmpdir(), "ceo-transition-test-")),
        file = join(dir, "source.json");
      const unit = await db.unit.create({
        data: { code: prefix, name: "Unidad de transición" },
      });
      const manifest = {
        source: "Export sintético de CEO Obras",
        clients: [
          { externalCode: `c-${prefix}`, name: "Comitente recuperado" },
        ],
        suppliers: [
          { externalCode: `s-${prefix}`, name: "Proveedor recuperado" },
        ],
        works: [
          {
            externalCode: `w-${prefix}`,
            name: "Obra activa recuperada",
            clientCode: `c-${prefix}`,
          },
        ],
        materials: [
          {
            externalCode: `m-${prefix}`,
            name: "Material recuperado",
            unitCode: unit.code,
          },
        ],
        openOrders: [
          {
            externalCode: `o-${prefix}`,
            supplierCode: `s-${prefix}`,
            workCode: `w-${prefix}`,
            destinationCode: `OBRA-w-${prefix}`,
            materialCode: `m-${prefix}`,
            orderedQuantity: "100",
            receivedQuantity: "40",
            unitPrice: "10",
            currency: "ARS",
            taxBasis: "EXCLUDED",
          },
        ],
      };
      await writeFile(file, JSON.stringify(manifest), { flag: "wx" });
      function run(execute = false) {
        const r = spawnSync(
          "pnpm",
          [
            "exec",
            "tsx",
            "scripts/transition-ceo-obras.ts",
            file,
            ...(execute
              ? ["--execute", "--actor-email", `${f.tag}-GERENCIA@test.invalid`]
              : []),
          ],
          { encoding: "utf8", env: process.env, timeout: 30000 },
        );
        expect(r.status, r.stderr || r.stdout).toBe(0);
        return JSON.parse(r.stdout.trim().split("\n").pop()!);
      }
      const dry = run();
      expect(dry.mode).toBe("dry-run");
      expect(dry.errors).toEqual([]);
      expect(await db.client.count({ where: { code: `c-${prefix}` } })).toBe(0);
      expect(await db.work.count({ where: { code: `w-${prefix}` } })).toBe(0);
      run(true);
      const work = await db.work.findUniqueOrThrow({
        where: { code: `w-${prefix}` },
        include: { client: true, purchaseOrders: { include: { lines: true } } },
      });
      expect(work.client!.code).toBe(`c-${prefix}`);
      expect(work.purchaseOrders).toHaveLength(1);
      expect(work.purchaseOrders[0]).toMatchObject({ status: "ISSUED" });
      expect(work.purchaseOrders[0].lines[0].quantity.toFixed()).toBe("60");
      expect(work.purchaseOrders[0].lines[0].receivedQuantity.toFixed()).toBe(
        "0",
      );
      expect(
        await db.stockMovement.count({
          where: { material: { code: `m-${prefix}` } },
        }),
      ).toBe(0);
      const again = run(true);
      expect(again.summary.clients.linked).toBe(1);
      expect(again.summary["purchase-orders"].linked).toBe(1);
      expect(await db.purchaseOrder.count({ where: { workId: work.id } })).toBe(
        1,
      );
    }, 60000);
  },
);
