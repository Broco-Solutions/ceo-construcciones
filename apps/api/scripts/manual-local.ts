import { PrismaClient, Role } from "@prisma/client";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import {
  readFile,
  readlink,
  writeFile,
  mkdir,
  stat,
  unlink,
  access,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createServer } from "node:net";
import { once } from "node:events";
import type { EditorContent } from "../src/modules/commercial-domain";
const root = resolve(__dirname, "../../.."),
  state = join(homedir(), ".local/state/ceo-construcciones-codex/manual");
const origin = "http://localhost:3100",
  base = "http://127.0.0.1:3101",
  database = "ceo_manual_test";
const pidFile = join(state, "processes.json"),
  releaseFile = join(state, "release.json");
const command = process.argv[2] ?? "start";
type Processes = {
  runId: string;
  pids: number[];
  sha: string;
  supervisorPid?: number;
  supervisorStart?: string;
};
async function readProcesses() {
  try {
    return JSON.parse(await readFile(pidFile, "utf8")) as Processes;
  } catch {
    return null;
  }
}
async function owned(pid: number, runId: string) {
  try {
    const owner = await stat(`/proc/${pid}`);
    if (owner.uid !== process.getuid?.()) return false;
    const env = await readFile(`/proc/${pid}/environ`, "utf8");
    return env.split("\0").includes(`CEO_MANUAL_RUN_ID=${runId}`);
  } catch {
    return false;
  }
}
async function processStart(pid: number) {
  try {
    return (await readFile(`/proc/${pid}/stat`, "utf8"))
      .split(") ")[1]
      .split(" ")[19];
  } catch {
    return undefined;
  }
}
async function supervisor(previous: Processes | null) {
  const pid = previous?.supervisorPid;
  if (!pid || pid === process.pid || !previous.supervisorStart) return false;
  try {
    const owner = await stat(`/proc/${pid}`);
    const cwd = await readlink(`/proc/${pid}/cwd`);
    return (
      owner.uid === process.getuid?.() &&
      cwd === join(root, "apps/api") &&
      (await processStart(pid)) === previous.supervisorStart
    );
  } catch {
    return false;
  }
}
function shell(command: string, args: string[], env = process.env) {
  const r = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0)
    throw Error(
      `Falló ${command} ${args[0] ?? ""}; sin publicar salida sensible`,
    );
  return r.stdout.trim();
}
async function free(port: number) {
  const s = createServer();
  s.listen(port);
  await once(s, "listening");
  await new Promise<void>((done, reject) =>
    s.close((e) => (e ? reject(e) : done())),
  );
}
async function health(url: string, child: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw Error(
        "Servidor local terminó antes de estar disponible; revisar logs privados",
      );
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("El servidor no quedó disponible; revisar logs privados");
}
async function build(app: string, env: NodeJS.ProcessEnv) {
  const { open } = await import("node:fs/promises");
  const log = await open(join(state, `build-${app}.log`), "w", 0o600);
  try {
    const p = spawn("pnpm", ["--dir", `apps/${app}`, "build"], {
      cwd: root,
      env,
      stdio: ["ignore", log.fd, log.fd],
    });
    const [code] = await once(p, "exit");
    if (code !== 0)
      throw Error(
        `Build ${app} falló (${code}); revisar ${join(state, `build-${app}.log`)}`,
      );
  } finally {
    await log.close();
  }
}
async function seed() {
  const { db } = await import("../src/core/db"),
    { hashPassword, sessionHash } = await import("../src/core/auth"),
    { dispatch } = await import("../src/router");
  type Login = { email: string; password: string };
  let credentials: Record<string, Login>;
  try {
    credentials = JSON.parse(
      await readFile(join(state, "credenciales.json"), "utf8"),
    );
  } catch {
    credentials = Object.fromEntries(
      Object.values(Role).map((role) => [
        role,
        {
          email: `${role.toLowerCase()}@manual.invalid`,
          password: randomBytes(21).toString("base64url"),
        },
      ]),
    );
    await writeFile(
      join(state, "credenciales.json"),
      JSON.stringify(credentials, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
  }
  for (const [role, c] of Object.entries(credentials))
    if (!(await db.user.findUnique({ where: { email: c.email } })))
      await db.user.create({
        data: {
          email: c.email,
          name: `${role} · prueba manual`,
          role: role as Role,
          passwordHash: await hashPassword(c.password),
        },
      });
  const actor = await db.user.findUniqueOrThrow({
      where: { email: credentials.GERENCIA.email },
    }),
    token = randomBytes(32).toString("hex");
  const session = await db.session.create({
    data: {
      userId: actor.id,
      tokenHash: sessionHash(token),
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  async function call<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
    key: string = randomUUID(),
  ): Promise<T> {
    const r = await dispatch(
      new Request(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          origin,
          cookie: `ceo_session=${token}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("?")[0].split("/"),
    );
    const j = await r.json();
    if (!r.ok)
      throw Error(
        `Preparación manual: ${method} ${path} (${r.status}) ${j.error?.code ?? ""}`,
      );
    return j.data;
  }
  async function ensure(
    resource: string,
    code: string,
    body: Record<string, unknown>,
  ) {
    let page = 1;
    for (;;) {
      const rows = await call<any[]>(`${resource}?page=${page}&pageSize=100`);
      const found = rows.find((x) => x.code === code);
      if (found) return found;
      if (rows.length < 100) break;
      page++;
    }
    return call(resource, "POST", { code, ...body });
  }
  try {
    const client = await ensure("clients", "MAN-CLI", {
      name: "Cliente sintético manual",
      contact: "Sin datos reales",
    });
    const foreignClient = await ensure("clients", "MAN-CLI-AJENA", {
      name: "Otro cliente sintético",
    });
    const works = [];
    for (const [n, name] of [
      [1, "Obra manual Norte"],
      [2, "Obra manual Sur"],
      [3, "Obra ajena para permisos"],
    ] as const)
      works.push(
        await ensure("works", `MAN-OBR-${n}`, {
          name,
          clientId: n === 3 ? foreignClient.id : client.id,
          address: "Dirección sintética",
        }),
      );
    const chief = await db.user.findUniqueOrThrow({
      where: { email: credentials.JEFE_OBRA.email },
    });
    // Only install the initial assignment once. Never overwrite manual edits.
    const mark = join(state, "initialized.json");
    let initialized = false;
    try {
      await access(mark);
      initialized = true;
    } catch {}
    if (!initialized) {
      const current = await db.workAssignment.findMany({
        where: { userId: chief.id },
      });
      await call(`users/${chief.id}/assignments`, "PUT", {
        workIds: [...new Set([...current.map((x) => x.workId), works[0].id])],
      });
    }
    const warehouse = await ensure("locations", "MAN-GAL", {
      name: "Galpón manual",
      kind: "WAREHOUSE",
    });
    await ensure("locations", "MAN-PAT", {
      name: "Patio manual",
      kind: "YARD",
    });
    const category = await ensure("categories", "MAN-VARIOS", {
      name: "VARIOS",
    });
    const kg = await db.unit.findFirstOrThrow({ where: { symbol: "kg" } }),
      gl = await db.unit.findFirstOrThrow({ where: { symbol: "gl" } });
    const cement = await ensure("materials", "MAN-CEM", {
      name: "Cemento sintético manual",
      unitId: kg.id,
      categoryId: category.id,
      minimum: "10",
    });
    const lime = await ensure("materials", "MAN-CAL", {
      name: "Cal sintética manual",
      unitId: kg.id,
      categoryId: category.id,
    });
    const suppliers = [];
    for (let i = 1; i <= 3; i++) {
      const supplier = await ensure("suppliers", `MAN-PROV-${i}`, {
        name: `Corralón manual ${i}`,
      });
      suppliers.push(supplier);
      for (const material of [cement, lime]) {
        const p = await call<any[]>(
          `prices?materialId=${material.id}&supplierId=${supplier.id}&pageSize=100`,
        );
        if (!p.some((x) => x.source === "Preparación manual inicial"))
          await call("prices", "POST", {
            materialId: material.id,
            supplierId: supplier.id,
            price: String(10 + i * 2),
            baseQuantity: "1",
            currency: "ARS",
            taxBasis: "EXCLUDED",
            effectiveAt: "2026-06-01T12:00:00Z",
            source: "Preparación manual inicial",
          });
      }
    }
    const name = "Plantilla sintética manual";
    let template = await db.budgetTemplate.findFirst({ where: { name } });
    if (!template)
      template = await call("budget-templates", "POST", {
        name,
        content: {
          currency: "ARS",
          taxBasis: "EXCLUDED",
          markup: "50",
          conditions: "Validez: 30 días. Datos de prueba.",
          exclusions: "Sin datos reales.",
          observations: "",
          deadline: "90 días",
          lines: [
            {
              key: randomUUID(),
              itemId: null,
              code: null,
              name: "Actividad sintética completa",
              categoryId: category.id,
              category: category.name,
              unitId: gl.id,
              unit: "gl",
              quantity: "0",
              laborUnitCost: "1000",
              directUnitCost: "500",
              status: "ACTIVE",
              materials: [
                {
                  materialId: cement.id,
                  name: cement.name,
                  unitId: kg.id,
                  unit: "kg",
                  coefficient: "2",
                  unitPrice: "12",
                  sourcePriceId: null,
                },
              ],
            },
          ],
        },
      });
    await call(
      "budget-templates/base",
      "POST",
      undefined,
      "manual-base-initial",
    );
    const destination = await db.location.findFirstOrThrow({
      where: { workId: works[0].id, active: true },
    });
    if (!initialized) {
      const order = await call(
        "purchase-orders",
        "POST",
        {
          supplierId: suppliers[0].id,
          workId: works[0].id,
          destinationId: destination.id,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          lines: [
            {
              materialId: cement.id,
              quantity: "40",
              unitPrice: "12",
              baseQuantity: "1",
            },
          ],
        },
        "manual-order-initial",
      );
      const current = await call(`purchase-orders/${order.id}`);
      if (current.status === "DRAFT")
        await call(`purchase-orders/${order.id}/status`, "POST", {
          status: "ISSUED",
        });
    }
    if (!initialized) {
      const order = await call(
        "purchase-orders",
        "POST",
        {
          supplierId: suppliers[0].id,
          destinationId: warehouse.id,
          currency: "ARS",
          taxBasis: "EXCLUDED",
          lines: [
            {
              materialId: cement.id,
              quantity: "10",
              unitPrice: "12",
              baseQuantity: "1",
            },
          ],
        },
        "manual-general-order-initial",
      );
      const current = await call(`purchase-orders/${order.id}`);
      if (current.status === "DRAFT")
        await call(`purchase-orders/${order.id}/status`, "POST", {
          status: "ISSUED",
        });
      if (!current.invoiceNumber)
        await call(`order-administration/${order.id}/invoice`, "PUT", {
          invoiceNumber: "MANUAL-SINTETICA-1",
          amount: "120",
          currency: "ARS",
        });
      for (const material of [cement, lime])
        await call(
          "movements",
          "POST",
          {
            type: "INITIAL",
            materialId: material.id,
            quantity: "100",
            destinationId: warehouse.id,
          },
          `manual-opening-${material.code}`,
        );
    }
    if (
      !(await db.budget.findFirst({
        where: { name: "Presupuesto sintético manual" },
      }))
    )
      await call(
        "budget-editor",
        "POST",
        {
          name: "Presupuesto sintético manual",
          workId: works[0].id,
          templateId: template!.id,
        },
        "manual-budget-initial",
      );
    const admin = await db.user.findUniqueOrThrow({
      where: { email: credentials.ADMINISTRACION.email },
    });
    if (!initialized)
      await call(`reception-delegations/${admin.id}`, "PUT", {
        locationIds: [warehouse.id],
      });
    // Private DG content is optional and never copied into Git. Import only once.
    const dgPath = join(state, "dg-normalized.json");
    try {
      const input = JSON.parse(await readFile(dgPath, "utf8")) as EditorContent;
      if (
        !(await db.budgetTemplate.findFirst({
          where: { name: "DG privado · revisión técnica" },
        }))
      ) {
        const content = structuredClone(input),
          units = new Map<string, string>(),
          cats = new Map<string, string>(),
          mats = new Map<string, string>();
        for (const l of content.lines) {
          let cat = cats.get(l.categoryId);
          if (!cat) {
            cat = (
              await ensure("categories", `MAN-DG-R-${cats.size + 1}`, {
                name: l.category,
              })
            ).id;
            cats.set(l.categoryId, cat!);
          }
          l.categoryId = cat!;
          for (const row of [l, ...l.materials]) {
            let unit = units.get(row.unit);
            if (!unit) {
              unit = (await db.unit.findFirst({ where: { symbol: row.unit } }))
                ?.id;
              if (!unit)
                unit = (
                  await ensure("units", `MAN-DG-U-${units.size + 1}`, {
                    name: `Unidad de fuente ${row.unit}`,
                    symbol: row.unit,
                  })
                ).id;
              units.set(row.unit, unit!);
            }
            row.unitId = unit!;
          }
          for (const m of l.materials) {
            let id = mats.get(m.materialId);
            if (!id) {
              id = (
                await ensure("materials", `MAN-DG-M-${mats.size + 1}`, {
                  name: m.name,
                  unitId: m.unitId,
                  categoryId: cat,
                })
              ).id;
              mats.set(m.materialId, id!);
            }
            m.materialId = id!;
          }
        }
        const t = await call("budget-templates", "POST", {
          name: "DG privado · revisión técnica",
          content,
        });
        await call(
          "budget-editor",
          "POST",
          {
            name: "DG privado · demanda orientativa, ver limitaciones",
            workId: works[1].id,
            templateId: t.id,
          },
          "manual-dg-initial",
        );
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    await writeFile(
      mark,
      JSON.stringify({
        client: client.id,
        works: works.map((x) => x.id),
        template: template!.id,
        warehouse: warehouse.id,
        createdAt: new Date().toISOString(),
      }) + "\n",
      { mode: 0o600 },
    );
    console.log(
      "Datos manuales preparados sin sobrescribir registros existentes. Credenciales: " +
        join(state, "credenciales.json"),
    );
  } finally {
    await db.session.delete({ where: { id: session.id } });
    await db.$disconnect();
  }
}
async function main() {
  await mkdir(state, { recursive: true, mode: 0o700 });
  const previous = await readProcesses();
  if (command === "stop") {
    if (!previous) {
      console.log("No hay procesos manuales registrados. Base preservada.");
      return;
    }
    if (!previous.pids.length && (await supervisor(previous))) {
      console.log(
        "La preparación sigue en su terminal. Usá Ctrl+C allí para interrumpirla; no se matan procesos por un PID no verificado.",
      );
      return;
    }
    for (const pid of previous.pids) {
      if (await owned(pid, previous.runId)) process.kill(pid, "SIGTERM");
    }
    console.log(
      "Parada solicitada sólo a procesos propios. No se borraron datos.",
    );
    return;
  }
  if (command === "status") {
    const active = previous
      ? await Promise.all(previous.pids.map((p) => owned(p, previous.runId)))
      : [];
    console.log(
      JSON.stringify({
        urls: { web: origin, health: base + "/api/health" },
        processes: active,
        preparing: !active.some(Boolean) && (await supervisor(previous)),
        release: await readFile(releaseFile, "utf8").catch(() => null),
        credentials: join(state, "credenciales.json"),
      }),
    );
    return;
  }
  if (command !== "start")
    throw Error("Uso: bash CEO_Manual_Local.sh start|stop|status");
  if (
    previous &&
    ((
      await Promise.all(previous.pids.map((p) => owned(p, previous.runId)))
    ).some(Boolean) ||
      (await supervisor(previous)))
  )
    throw Error(
      "Hay procesos manuales propios. Usá status y stop antes de reconstruir; no se reemplaza un binario en uso.",
    );
  await free(3100);
  await free(3101);
  const original = new URL(process.env.DATABASE_URL ?? "");
  if (
    original.hostname !== "127.0.0.1" ||
    original.pathname !== "/ceo_api_test"
  )
    throw Error(
      "Se requiere el entorno local preparado, loopback y base de pruebas original.",
    );
  const endpoint = process.env.DOCKER_CONTEXT
    ? shell("docker", [
        "context",
        "inspect",
        process.env.DOCKER_CONTEXT,
        "--format",
        "{{.Endpoints.docker.Host}}",
      ])
    : (process.env.DOCKER_HOST ??
      shell("docker", [
        "context",
        "inspect",
        "--format",
        "{{.Endpoints.docker.Host}}",
      ]));
  if (!endpoint.startsWith("unix://"))
    throw Error("Docker debe usar un socket Unix local");
  if (
    shell("docker", [
      "inspect",
      "-f",
      '{{index .Config.Labels "broco.ceo.purpose"}}',
      "ceo-codex-tests",
    ]) !== "local-codex-tests-v1"
  )
    throw Error("Contenedor local de pruebas no verificado");
  const dockerPort = shell("docker", ["port", "ceo-codex-tests", "5432/tcp"]);
  if (dockerPort !== `127.0.0.1:${original.port}`)
    throw Error("Puerto PostgreSQL no coincide con el contenedor de pruebas");
  const preparationId = randomUUID();
  await writeFile(
    pidFile,
    JSON.stringify({
      runId: preparationId,
      pids: [],
      supervisorPid: process.pid,
      supervisorStart: await processStart(process.pid),
      sha: shell("git", ["rev-parse", "HEAD"]),
    }) + "\n",
    { mode: 0o600 },
  );
  const initial = new PrismaClient({ datasourceUrl: original.toString() });
  try {
    const found = await initial.$queryRaw<
      { datname: string }[]
    >`SELECT datname FROM pg_database WHERE datname=${database}`;
    if (!found.length)
      await initial.$executeRawUnsafe('CREATE DATABASE "ceo_manual_test"');
  } finally {
    await initial.$disconnect();
  }
  original.pathname = "/" + database;
  process.env.DATABASE_URL = original.toString();
  process.env.APP_ORIGIN = origin;
  process.env.API_BASE_URL = base;
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  await writeFile(
    join(state, "local.env"),
    `DATABASE_URL='${original.toString()}'\nAPP_ORIGIN='${origin}'\nAPI_BASE_URL='${base}'\n`,
    { mode: 0o600 },
  );
  shell("pnpm", ["--dir", "apps/api", "db:deploy"]);
  await seed();
  console.log("Compilando API y web. Logs privados en " + state);
  await build("api", process.env);
  await build("web", process.env);
  const sha = shell("git", ["rev-parse", "HEAD"]),
    tree = shell("git", ["rev-parse", "HEAD^{tree}"]),
    diff = shell("git", ["diff", "--binary", "HEAD"]);
  await writeFile(
    releaseFile,
    JSON.stringify({
      sha,
      tree,
      workingDiffSha: diff
        ? createHash("sha256").update(diff).digest("hex")
        : null,
      builtAt: new Date().toISOString(),
    }) + "\n",
    { mode: 0o600 },
  );
  const runId = preparationId,
    env = {
      ...process.env,
      NODE_ENV: "production" as const,
      CEO_MANUAL_RUN_ID: runId,
    };
  const { open } = await import("node:fs/promises");
  const apiLog = await open(join(state, "api.log"), "a", 0o600),
    webLog = await open(join(state, "web.log"), "a", 0o600);
  const api = spawn(
    process.execPath,
    [resolve(root, "apps/api/.next/standalone/server.js")],
    {
      cwd: join(root, "apps/api"),
      env: { ...env, PORT: "3101", HOSTNAME: "127.0.0.1" },
      stdio: ["ignore", apiLog.fd, apiLog.fd],
    },
  );
  const web = spawn(
    process.execPath,
    [
      resolve(root, "apps/web/node_modules/next/dist/bin/next"),
      "start",
      "-p",
      "3100",
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: join(root, "apps/web"),
      env,
      stdio: ["ignore", webLog.fd, webLog.fd],
    },
  );
  await writeFile(
    pidFile,
    JSON.stringify({
      runId,
      pids: [api.pid, web.pid],
      supervisorPid: process.pid,
      supervisorStart: await processStart(process.pid),
      sha,
    }) + "\n",
    { mode: 0o600 },
  );
  const stop = () => {
    api.kill("SIGTERM");
    web.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await health(base + "/api/health", api);
    await health(origin + "/login", web);
    console.log(
      `LISTO: ${origin} · API ${base}/api/health · SHA ${sha}${diff ? " (con cambios locales)" : ""}\nEsta terminal supervisa el entorno. Ctrl+C o bash CEO_Manual_Local.sh stop para detener; la base se conserva.`,
    );
    await Promise.race([once(api, "exit"), once(web, "exit")]);
  } finally {
    stop();
    await apiLog.close();
    await webLog.close();
    const current = await readProcesses();
    if (current?.runId === runId) await unlink(pidFile).catch(() => undefined);
  }
}
main().catch(async (e) => {
  await mkdir(state, { recursive: true, mode: 0o700 });
  await writeFile(
    join(state, "failure.log"),
    e instanceof Error ? (e.stack ?? e.message) : String(e),
    { mode: 0o600 },
  );
  console.error(
    "No se inició/completó el entorno manual. Revisá el destino, puertos y logs privados; no se borraron datos.",
  );
  process.exitCode = 1;
});
