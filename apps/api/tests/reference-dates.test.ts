import { it, expect } from "vitest";
import { laborRateSchema } from "../src/modules/cost-references";
it("CI-07: día, mes y fecha desconocida conservan su precisión", () => {
  const base = {
    resourceId: "resource",
    value: "0",
    currency: "ARS",
    taxBasis: "UNSPECIFIED",
    source: "Histórica",
    series: "serie",
    effectiveAt: "2026-05-01T03:00:00Z",
    dateLabel: "2026-05-01",
    datePrecision: "DAY",
  };
  expect(laborRateSchema.safeParse(base).success).toBe(true);
  expect(
    laborRateSchema.safeParse({ ...base, dateLabel: "2026-05-02" }).success,
  ).toBe(false);
  expect(
    laborRateSchema.safeParse({
      ...base,
      datePrecision: "MONTH",
      dateLabel: "2026-05",
    }).success,
  ).toBe(true);
  expect(
    laborRateSchema.safeParse({
      ...base,
      datePrecision: "UNKNOWN",
      effectiveAt: null,
      dateLabel: null,
    }).success,
  ).toBe(true);
  expect(
    laborRateSchema.safeParse({
      ...base,
      datePrecision: "UNKNOWN",
      effectiveAt: null,
    }).success,
  ).toBe(false);
});
