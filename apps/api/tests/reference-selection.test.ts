import { it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  selectLaborReference,
  selectMaterialReference,
} from "../src/modules/reference-selection";
const now = new Date("2026-11-01T12:00:00Z"),
  context = { currency: "ARS", taxBasis: "EXCLUDED" as const };
it("CI-21/22: misma política selecciona serie compatible sin cambiar proveedor, futuro ni fecha desconocida", () => {
  const rate = {
    id: "old",
    resourceId: "oficial",
    series: "horaria",
    currency: "ARS",
    taxBasis: "EXCLUDED" as const,
    value: new Prisma.Decimal(10),
    effectiveAt: new Date("2026-01-01"),
    createdAt: new Date(),
    createdById: "actor",
    dateLabel: "2026-01",
    datePrecision: "MONTH",
    source: "Fuente",
    resource: { active: true },
  };
  const next = {
    ...rate,
    id: "next",
    value: new Prisma.Decimal(12),
    effectiveAt: new Date("2026-10-01"),
  };
  expect(
    selectLaborReference(
      rate,
      [
        { ...next, id: "future", effectiveAt: new Date("2027-01-01") },
        { ...next, id: "usd", currency: "USD" },
        next,
      ],
      context,
      now,
    )?.id,
  ).toBe("next");
  expect(
    selectLaborReference({ ...rate, effectiveAt: null }, [next], context, now)
      ?.id,
  ).toBe("old");
  expect(
    selectLaborReference(
      { ...rate, resource: { active: false } },
      [next],
      context,
      now,
    ),
  ).toBeUndefined();
  const price = {
    id: "old",
    materialId: "cemento",
    supplierId: null,
    presentationId: "bolsa",
    price: new Prisma.Decimal(12500),
    baseQuantity: new Prisma.Decimal(25),
    currency: "ARS",
    taxBasis: "EXCLUDED" as const,
    effectiveAt: new Date("2026-01-01"),
    createdAt: new Date(),
    source: "Canal elegido",
    presentation: { active: true, baseQuantity: new Prisma.Decimal(25) },
  };
  const changed = {
    ...price,
    id: "new",
    price: new Prisma.Decimal(15000),
    effectiveAt: new Date("2026-10-01"),
  };
  expect(
    selectMaterialReference(
      price,
      [
        {
          ...changed,
          id: "cheap",
          source: "Otro",
          price: new Prisma.Decimal(1),
        },
        changed,
      ],
      "cemento",
      context,
      false,
      now,
    )?.id,
  ).toBe("new");
  expect(
    selectMaterialReference(
      undefined,
      [changed, { ...changed, id: "other", source: "Otro" }],
      "cemento",
      context,
      true,
      now,
    ),
  ).toBeUndefined();
  expect(
    selectMaterialReference(
      price,
      [{ ...changed, baseQuantity: new Prisma.Decimal(50) }],
      "cemento",
      context,
      false,
      now,
    ),
  ).toBeUndefined();
  expect(
    selectMaterialReference(
      price,
      [changed],
      "cemento",
      { ...context, taxBasis: "INCLUDED" },
      false,
      now,
    ),
  ).toBeUndefined();
});
