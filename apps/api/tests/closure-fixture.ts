import { randomBytes, randomUUID } from "node:crypto";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import { sessionHash } from "../src/core/auth";
import { dispatch } from "../src/router";
import { expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
const contract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../../docs/api/openapi.json"),
    "utf8",
  ),
);
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function assertClosureContract(
  path: string,
  method: string,
  status: number,
  payload: unknown,
) {
  const pathname = "/" + path.split("?")[0],
    match = Object.entries(contract.paths).find(([pattern]) =>
      new RegExp(`^${pattern.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(pathname),
    );
  expect(match, `Ruta ${method} ${pathname} documentada`).toBeDefined();
  const operation = (match![1] as Record<string, any>)[method.toLowerCase()],
    schema =
      operation?.responses[status]?.content?.["application/json"]?.schema;
  expect(schema, `Contrato ${method} ${match![0]} ${status}`).toBeDefined();
  const key = `${method}:${match![0]}:${status}`;
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile({ ...schema, components: contract.components });
    validators.set(key, validate);
  }
  expect(validate(payload), `${key}: ${ajv.errorsText(validate.errors)}`).toBe(
    true,
  );
}

/** Authenticated real dispatch + PostgreSQL; no replaced network or data layer. */
export async function closureFixture() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (
    !["127.0.0.1", "localhost"].includes(target.hostname) ||
    !target.pathname.includes("test")
  )
    throw Error("Sólo PostgreSQL loopback test");
  const tag = randomUUID(),
    origin = process.env.APP_ORIGIN ?? "http://localhost:3000",
    tokens = new Map<Role, string>();
  for (const role of Object.values(Role)) {
    const user = await db.user.create({
        data: {
          email: `${tag}-${role}@test.invalid`,
          name: `Actor sintético ${role}`,
          role,
          passwordHash: "disabled",
        },
      }),
      token = randomBytes(32).toString("hex");
    await db.session.create({
      data: {
        tokenHash: sessionHash(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    tokens.set(role, token);
  }
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    key: string = randomUUID(),
    role: Role = "GERENCIA",
  ) {
    return dispatch(
      new Request(`${origin}/api/v1/${path}`, {
        method,
        headers: {
          origin,
          cookie: `ceo_session=${tokens.get(role)}`,
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      path.split("?")[0].split("/"),
    );
  }
  async function data(
    path: string,
    method = "GET",
    body?: unknown,
    key?: string,
    role?: Role,
  ) {
    const response = await call(path, method, body, key, role),
      json = await response.json();
    expect(response.status, JSON.stringify(json)).toBeLessThan(300);
    assertClosureContract(path, method, response.status, json);
    return json.data;
  }
  return { tag, call, data };
}
