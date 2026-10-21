import { describe, expect, it } from "vitest";
import { D } from "../src/modules/shared";
import { exactOrderAmount } from "../src/modules/procurement";

describe("importes de OC sin política de redondeo implícita", () => {
  it("respeta la base de presentación y conserva precisión de Decimal", () => {
    const amount = (
      quantity: string,
      unitPrice: string,
      baseQuantity: string,
    ) =>
      exactOrderAmount({
        quantity: D(quantity),
        unitPrice: D(unitPrice),
        baseQuantity: D(baseQuantity),
      });
    expect(amount("15", "120", "10")?.toFixed()).toBe("180");
    expect(amount("0.00000001", "1", "1")?.toFixed()).toBe("0.00000001");
    expect(
      amount("9999999999999999", "9999999999999999.99999999", "1")?.toFixed(),
    ).toBe("99999999999999989999999900000000.00000001");
    expect(amount("1", "1", "3")).toBeNull();
    expect(amount("0.00000001", "0.1", "1")).toBeNull();
    expect(amount("5", "0", "3")?.toFixed()).toBe("0");
  });
});
