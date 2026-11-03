import { describe, it, expect } from "vitest";
import { localPrice, monthArgentina } from "../src/modules/reference-prices";
describe("precios de referencia", () => {
  it("normaliza números locales sin interpretar fórmulas", () => {
    expect(localPrice("1.234,56")).toBe("1234.56");
    expect(localPrice("0,50")).toBe("0.50");
    expect(localPrice("=1+2")).toBe("=1+2");
  });
  it("T24 usa el mes argentino durante el cambio de mes UTC", () => {
    expect(monthArgentina(new Date("2026-11-01T02:59:59Z"))).toBe(
      monthArgentina(new Date("2026-10-31T12:00:00Z")),
    );
    expect(monthArgentina(new Date("2026-11-01T03:00:00Z"))).not.toBe(
      monthArgentina(new Date("2026-11-01T02:59:59Z")),
    );
  });
});
