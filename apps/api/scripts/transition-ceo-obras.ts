/** One-off controlled transition adapter. Defaults to read-only dry run.
 * Only local test databases are accepted, including --execute. Production
 * enablement/cutover is deliberately outside this application's mission. */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "../src/core/db";
import {
  schemas,
  normalizeImport,
  handlerImports,
  type ImportKind,
} from "../src/modules/imports";
import type { Actor } from "../src/core/auth";

const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const inputSchema = z
  .object({
    source: z.string().min(1).max(200),
    clients: z.array(z.record(z.unknown())).max(1000).default([]),
    suppliers: z.array(z.record(z.unknown())).max(1000).default([]),
    works: z.array(z.record(z.unknown())).max(1000).default([]),
    materials: z.array(z.record(z.unknown())).max(1000).default([]),
    openOrders: z
      .array(
        z
          .object({
            externalCode: z.string(),
            supplierCode: z.string(),
            workCode: z.string().optional(),
            destinationCode: z.string(),
            materialCode: z.string(),
            orderedQuantity: z.string(),
            receivedQuantity: z.string(),
            unitPrice: z.string(),
            currency: z.string(),
            taxBasis: z.string(),
            notes: z.string().optional(),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
  })
  .strict();
async function main() {
  const [file, ...args] = process.argv.slice(2);
  if (!file)
    throw Error(
      "Uso: transition-ceo-obras.ts archivo.json [--execute --actor-email usuario@test.invalid]",
    );
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["localhost", "127.0.0.1"].includes(target.hostname) ||
    !target.pathname.includes("test")
  )
    throw Error(
      "Sólo PostgreSQL loopback con nombre test. El corte productivo está fuera de esta herramienta.",
    );
  const bytes = await readFile(file);
  if (bytes.length > 1_500_000) throw Error("Máximo 1,5 MB");
  const source = inputSchema.parse(JSON.parse(bytes.toString())),
    errors: { kind: string; row: number; message: string }[] = [],
    closed: { row: number; externalCode: string }[] = [];
  const orders: Record<string, unknown>[] = [];
  for (const [i, row] of source.openOrders.entries()) {
    try {
      for (const v of [row.orderedQuantity, row.receivedQuantity])
        if (!/^\d+(\.\d{1,8})?$/.test(v))
          throw Error("Cantidad decimal textual inválida");
      const ordered = new Prisma.Decimal(row.orderedQuantity),
        received = new Prisma.Decimal(row.receivedQuantity);
      if (received.gt(ordered)) throw Error("Recibido supera lo ordenado");
      const pending = ordered.sub(received);
      if (pending.isZero()) {
        closed.push({ row: i + 1, externalCode: row.externalCode });
        continue;
      }
      const { orderedQuantity, receivedQuantity, ...rest } = row;
      orders.push({
        ...rest,
        quantity: pending.toFixed(),
        notes: `${source.source} · ordenado ${orderedQuantity}, recibido previamente ${receivedQuantity}, sólo pendiente ${pending.toFixed()}${row.notes ? " · " + row.notes : ""}`,
      });
    } catch (e) {
      errors.push({
        kind: "purchase-orders",
        row: i + 1,
        message: (e as Error).message,
      });
    }
  }
  const phases: Record<string, Record<string, unknown>[]> = {
    clients: source.clients,
    suppliers: source.suppliers,
    works: source.works,
    materials: source.materials,
    "purchase-orders": orders,
  };
  const jobs: { kind: ImportKind; rows: Record<string, string>[] }[] = [],
    summary: Record<
      string,
      { created: number; linked: number; rejected: number }
    > = {};
  for (const [kind, raw] of Object.entries(phases)) {
    const k = kind as ImportKind,
      normal = normalizeImport(k, raw),
      state = { created: 0, linked: 0, rejected: normal.errors.length };
    summary[k] = state;
    errors.push(...normal.errors.map((e) => ({ kind, ...e })));
    const groups = new Map<string, Record<string, string>[]>();
    for (const row of normal.rows)
      groups.set(row.externalCode, [
        ...(groups.get(row.externalCode) ?? []),
        row,
      ]);
    const fresh: Record<string, string>[] = [];
    for (const [code, rows] of groups) {
      const record = await db.idempotencyRecord.findUnique({
        where: { key: `import:${k}:${code}` },
      });
      if (record) {
        if (record.requestHash !== sha(rows)) {
          errors.push({
            kind: k,
            row: normal.rows.indexOf(rows[0]) + 1,
            message:
              "Identificador importado con otro contenido; no se sobrescribe",
          });
          state.rejected += rows.length;
        } else state.linked += rows.length;
        continue;
      }
      const existing =
        k === "clients"
          ? await db.client.findUnique({ where: { code } })
          : k === "suppliers"
            ? await db.supplier.findUnique({ where: { code } })
            : k === "works"
              ? await db.work.findUnique({ where: { code } })
              : k === "materials"
                ? await db.material.findUnique({ where: { code } })
                : null;
      if (existing) {
        errors.push({
          kind: k,
          row: normal.rows.indexOf(rows[0]) + 1,
          message:
            "Código existente sin procedencia de esta importación: requiere mapeo explícito; no se adivina identidad",
        });
        state.rejected += rows.length;
        continue;
      }
      fresh.push(...rows);
      state.created += rows.length;
    }
    jobs.push({ kind: k, rows: fresh });
  }
  // Validate against the projected graph without writing dependencies first.
  const known = async (
    kind: "clients" | "suppliers" | "works" | "materials",
    code: string,
  ) =>
    phases[kind].some((r) => r.externalCode === code) ||
    Boolean(
      kind === "clients"
        ? await db.client.findUnique({ where: { code } })
        : kind === "suppliers"
          ? await db.supplier.findUnique({ where: { code } })
          : kind === "works"
            ? await db.work.findUnique({ where: { code } })
            : await db.material.findUnique({ where: { code } }),
    );
  for (const job of jobs)
    for (const [i, row] of job.rows.entries()) {
      const fail = (message: string) =>
        errors.push({ kind: job.kind, row: i + 1, message });
      if (row.clientCode && !(await known("clients", row.clientCode)))
        fail("Cliente sin mapeo exacto");
      if (row.supplierCode && !(await known("suppliers", row.supplierCode)))
        fail("Proveedor sin mapeo exacto");
      if (row.workCode && !(await known("works", row.workCode)))
        fail("Obra sin mapeo exacto");
      if (row.materialCode && !(await known("materials", row.materialCode)))
        fail("Material sin mapeo exacto");
      if (
        row.unitCode &&
        !(await db.unit.findUnique({ where: { code: row.unitCode } }))
      )
        fail("Unidad sin mapeo exacto");
      if (
        row.categoryCode &&
        !(await db.category.findUnique({ where: { code: row.categoryCode } }))
      )
        fail("Rubro sin mapeo exacto");
      if (
        row.destinationCode &&
        !(await db.location.findUnique({
          where: { code: row.destinationCode },
        })) &&
        !source.works.some(
          (w) => `OBRA-${w.externalCode}` === row.destinationCode,
        )
      )
        fail("Destino sin mapeo exacto");
    }
  const execute = args.includes("--execute"),
    report = {
      source: source.source,
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
      mode: execute ? "execute-isolated" : "dry-run",
      summary,
      closedRowsNotImported: closed,
      errors,
    };
  if (errors.length) {
    console.log(JSON.stringify(report));
    process.exitCode = 1;
    return;
  }
  if (!execute) {
    console.log(JSON.stringify(report));
    return;
  }
  const email = args[args.indexOf("--actor-email") + 1];
  if (!args.includes("--actor-email") || !email)
    throw Error("--actor-email de Gerencia sintética requerido para ejecutar");
  const user = await db.user.findFirst({
    where: { email, role: "GERENCIA", active: true },
  });
  if (!user) throw Error("Actor local no autorizado");
  const actor: Actor = { id: user.id, role: user.role };
  for (const job of jobs) {
    if (!job.rows.length) continue;
    const body = { rows: job.rows },
      url = `http://localhost/api/v1/imports/${job.kind}`,
      preview = await handlerImports(
        new Request(url + "/preview", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        actor,
        ["imports", job.kind, "preview"],
      );
    const p = await preview!.json();
    if (!p.data?.valid)
      throw Error(
        JSON.stringify({ kind: job.kind, errors: p.data?.errors ?? p }),
      );
    const commit = await handlerImports(
      new Request(url + "/commit", {
        method: "POST",
        headers: {
          "idempotency-key": sha({
            source: report.sourceSha256,
            kind: job.kind,
          }),
        },
        body: JSON.stringify({
          ...body,
          confirmationHash: p.data.confirmationHash,
        }),
      }),
      actor,
      ["imports", job.kind, "commit"],
    );
    if (commit!.status !== 201) throw Error("Commit rechazado: " + job.kind);
  }
  console.log(JSON.stringify(report));
}
main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Error de transición");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
