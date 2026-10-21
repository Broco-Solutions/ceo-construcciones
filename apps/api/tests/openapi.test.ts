import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { document } from "../../../scripts/generate-openapi";
import {
  workSchema,
  supplierSchema,
  materialSchema,
  presentationSchema,
  priceSchema,
} from "../src/modules/catalog";
import { reserveSchema, moveSchema } from "../src/modules/inventory";
import {
  itemSchema,
  computationSchema,
  budgetSchema,
  valuationSchema,
  versionSchema,
} from "../src/modules/budgets";
import {
  requestSchema,
  quotationSchema,
  orderSchema,
  receiptSchema,
} from "../src/modules/procurement";
import { schemas as importSchemas, inputSchema } from "../src/modules/imports";

const path = resolve(import.meta.dirname, "../../../docs/api/openapi.json");
const disk = JSON.parse(readFileSync(path, "utf8"));
type S = Record<string, any>;
function resolved(schema: S): S {
  return schema.$ref
    ? disk.components.schemas[schema.$ref.split("/").pop()]
    : schema;
}
function fieldNames(schema: S, seen = new Set<string>()): string[] {
  if (schema.$ref) {
    if (seen.has(schema.$ref)) return [];
    seen.add(schema.$ref);
    return fieldNames(resolved(schema), seen);
  }
  return [
    ...Object.keys(schema.properties ?? {}),
    ...Object.values(schema.properties ?? {}).flatMap((value) =>
      fieldNames(value as S, seen),
    ),
    ...(schema.items ? fieldNames(schema.items, seen) : []),
    ...(schema.anyOf ?? []).flatMap((value: S) => fieldNames(value, seen)),
  ];
}
describe("contrato OpenAPI completo y sincronizado", () => {
  it("es OpenAPI 3.1 válido y coincide con el generador", async () => {
    expect(disk).toEqual(document);
    await expect(
      SwaggerParser.validate(structuredClone(disk)),
    ).resolves.toHaveProperty("openapi", "3.1.0");
  });
  it("documenta todos los recursos y acciones V1 con schemas de éxito y permisos", () => {
    const expected: Record<string, string[]> = {
      "/auth/login": ["post"],
      "/auth/logout": ["post"],
      "/auth/me": ["get"],
      "/users": ["get", "post"],
      "/users/{id}": ["patch"],
      "/users/{id}/assignments": ["get", "put"],
      "/works": ["get", "post"],
      "/works/{id}": ["get", "patch"],
      "/locations": ["get", "post"],
      "/locations/{id}": ["get", "patch"],
      "/units": ["get", "post"],
      "/units/{id}": ["get", "patch"],
      "/categories": ["get", "post"],
      "/categories/{id}": ["get", "patch"],
      "/materials": ["get", "post"],
      "/materials/{id}": ["get", "patch"],
      "/suppliers": ["get", "post"],
      "/suppliers/{id}": ["get", "patch"],
      "/presentations": ["get", "post"],
      "/presentations/{id}": ["get", "patch"],
      "/prices": ["get", "post"],
      "/prices/{id}": ["get"],
      "/audit": ["get"],
      "/apu-items": ["get", "post"],
      "/apu-items/{id}": ["get", "patch"],
      "/apu-items/{id}/calculate": ["post"],
      "/computations": ["get", "post"],
      "/computations/{id}": ["get", "patch"],
      "/budgets": ["get", "post"],
      "/budgets/{id}": ["get"],
      "/budgets/{id}/versions": ["post"],
      "/budget-versions/{id}": ["get"],
      "/budget-versions/{id}/materials": ["get"],
      "/budget-versions/{id}/reference": ["post"],
      "/requests": ["get", "post"],
      "/requests/{id}": ["get"],
      "/requests/{id}/needs": ["get"],
      "/requests/{id}/status": ["post"],
      "/requests/{id}/history": ["get"],
      "/quotations": ["get", "post"],
      "/quotations/{id}": ["get"],
      "/quotations/{requestId}/comparison": ["get"],
      "/quotations/{id}/select": ["post"],
      "/purchase-orders": ["get", "post"],
      "/purchase-orders/{id}": ["get", "patch"],
      "/purchase-orders/{id}/status": ["post"],
      "/purchase-orders/{id}/invoice-reference": ["put"],
      "/purchase-orders/{id}/receipts": ["get", "post"],
      "/purchase-orders/{id}/pdf": ["get"],
      "/purchase-orders/{id}/history": ["get"],
      "/stock": ["get"],
      "/stock/alerts": ["get"],
      "/stock/{locationId}/minimum": ["put"],
      "/reservations": ["get", "post"],
      "/reservations/{id}": ["get"],
      "/reservations/{id}/cancel": ["post"],
      "/movements": ["get", "post"],
      "/reports/materials": ["get"],
      "/reports/materials/export": ["get"],
      "/exports/materials-report": ["get"],
      "/api/health": ["get"],
    };
    for (const kind of [
      "materials",
      "suppliers",
      "prices",
      "works",
      "stock",
      "purchase-orders",
    ])
      expected[`/exports/${kind}`] = ["get"];
    for (const kind of [
      "suppliers",
      "works",
      "materials",
      "prices",
      "purchase-orders",
      "initial-stock",
    ])
      for (const action of ["template", "preview", "commit"])
        expected[`/imports/${kind}/${action}`] = [
          action === "template" ? "get" : "post",
        ];
    expect(Object.keys(disk.paths).sort()).toEqual(
      Object.keys(expected).sort(),
    );
    const operationIds = new Set<string>();
    for (const [route, methods] of Object.entries(expected)) {
      expect(Object.keys(disk.paths[route]).sort()).toEqual(methods.sort());
      for (const method of methods) {
        const op = disk.paths[route][method];
        expect(op["x-roles"].length).toBeGreaterThan(0);
        expect(operationIds.has(op.operationId)).toBe(false);
        operationIds.add(op.operationId);
        expect(
          Object.entries(op.responses).some(
            ([status, response]) =>
              status.startsWith("2") && Boolean((response as S).content),
          ),
        ).toBe(true);
        for (const name of [...route.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
          expect(op.parameters).toContainEqual(
            expect.objectContaining({ name, in: "path", required: true }),
          );
        if (op.requestBody) {
          const media = op.requestBody.content["application/json"];
          expect(media.schema).toBeDefined();
          expect(media.example).toBeDefined();
        }
      }
    }
  });
  it("describe campos obligatorios de dominio, decimal textual e idempotencia", () => {
    const components = disk.components.schemas;
    for (const name of [
      "OrderInput",
      "ReceiptInput",
      "ReservationInput",
      "MovementInput",
      "ApuInput",
      "VersionInput",
      "MaterialInput",
    ])
      expect(components[name].required.length).toBeGreaterThan(0);
    expect(components.OrderInput.required).toEqual(
      expect.arrayContaining([
        "supplierId",
        "destinationId",
        "currency",
        "taxBasis",
        "lines",
      ]),
    );
    expect(components.OrderInput.required).not.toContain("workId");
    expect(components.VersionInput.required).toContain("roundingBoundary");
    expect(components.ReceiptInput.required).toContain("deliveryNote");
    expect(components.CommercialLineInput.properties.quantity.type).toBe(
      "string",
    );
    for (const route of [
      "/purchase-orders",
      "/purchase-orders/{id}/receipts",
      "/reservations",
      "/movements",
      "/imports/initial-stock/commit",
    ])
      expect(disk.paths[route].post.parameters).toContainEqual(
        expect.objectContaining({ name: "Idempotency-Key", required: true }),
      );
    expect(disk.paths["/reports/materials"].get.parameters).toContainEqual(
      expect.objectContaining({ name: "workId", required: true }),
    );
    expect(
      disk.paths["/materials"].get.parameters.find(
        (p: S) => p.name === "pageSize",
      ).schema.default,
    ).toBe(50);
    expect(
      disk.paths["/apu-items"].get.parameters.find(
        (p: S) => p.name === "pageSize",
      ).schema.default,
    ).toBe(25);
  });
  it("proyecciones de jefe excluyen economía y todas respuestas excluyen hashes", () => {
    for (const name of [
      "ChiefOrder",
      "VersionMaterials",
      "MaterialReport",
      "Stock",
      "ReceiptDetail",
    ]) {
      expect(fieldNames(disk.components.schemas[name])).not.toEqual(
        expect.arrayContaining(["unitPrice"]),
      );
      for (const forbidden of [
        "price",
        "unitPrice",
        "laborCost",
        "snapshot",
        "invoiceNumber",
        "currency",
        "passwordHash",
        "tokenHash",
      ])
        expect(fieldNames(disk.components.schemas[name])).not.toContain(
          forbidden,
        );
    }
    expect(disk.components.schemas.ChiefOrder.additionalProperties).toBe(false);
    expect(disk.components.schemas.ChiefOrderLine.additionalProperties).toBe(
      false,
    );
    expect(disk.components.schemas.VisibleOrder.anyOf).toContainEqual(
      expect.objectContaining({ "x-roles": ["JEFE_OBRA"] }),
    );
    const serialized = JSON.stringify(disk);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("tokenHash");
    for (const resource of [
      "/prices",
      "/apu-items",
      "/suppliers",
      "/budget-versions/{id}",
    ])
      expect(disk.paths[resource].get["x-roles"]).not.toContain("JEFE_OBRA");
  });
  it("precisión decimal conserva 16 enteros y 8 decimales de stock", () => {
    expect(
      new Prisma.Decimal("9999999999999999.12345678")
        .plus("0.00000001")
        .toFixed(),
    ).toBe("9999999999999999.12345679");
  });
  it("ejemplos de requests cumplen las validaciones reales de los handlers", () => {
    const cases: [
      string,
      string,
      { safeParse: (v: unknown) => { success: boolean } },
    ][] = [
      ["/works", "post", workSchema],
      ["/suppliers", "post", supplierSchema],
      ["/materials", "post", materialSchema],
      ["/presentations", "post", presentationSchema],
      ["/prices", "post", priceSchema],
      ["/reservations", "post", reserveSchema],
      ["/movements", "post", moveSchema],
      ["/apu-items", "post", itemSchema],
      ["/computations", "post", computationSchema],
      ["/budgets", "post", budgetSchema],
      ["/apu-items/{id}/calculate", "post", valuationSchema],
      ["/budgets/{id}/versions", "post", versionSchema],
      ["/requests", "post", requestSchema],
      ["/quotations", "post", quotationSchema],
      ["/purchase-orders", "post", orderSchema],
      ["/purchase-orders/{id}/receipts", "post", receiptSchema],
    ];
    for (const [route, method, schema] of cases) {
      const example =
        disk.paths[route][method].requestBody.content["application/json"]
          .example;
      expect(schema.safeParse(example).success, `${method} ${route}`).toBe(
        true,
      );
    }
    for (const [kind, schema] of Object.entries(importSchemas))
      for (const action of ["preview", "commit"]) {
        const example =
          disk.paths[`/imports/${kind}/${action}`].post.requestBody.content[
            "application/json"
          ].example;
        expect(inputSchema.safeParse(example).success).toBe(true);
        expect(
          schema.safeParse(example.rows[0]).success,
          `${kind} ${action}`,
        ).toBe(true);
      }
  });
});
