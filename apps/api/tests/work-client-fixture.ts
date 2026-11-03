import { randomUUID } from "node:crypto";
import { db } from "../src/core/db";
/** Real synthetic client for the new required relationship in V1 flow tests. */
export async function workClientBody(
  path: string,
  method: string,
  body: unknown,
) {
  if (
    path.replace(/^\//, "").split("?")[0] !== "works" ||
    method.toUpperCase() !== "POST" ||
    !body ||
    typeof body !== "object" ||
    "clientId" in body
  )
    return body;
  const client = await db.client.create({
    data: {
      code: `test-client-${randomUUID()}`,
      name: "Cliente sintético del recorrido",
    },
  });
  return { ...body, clientId: client.id };
}
