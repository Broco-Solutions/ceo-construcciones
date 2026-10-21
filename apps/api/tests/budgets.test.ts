import { describe, expect, it } from "vitest";
import { BudgetSnapshotInput, calculateBudget } from "../src/modules/budgets";

function example(): BudgetSnapshotInput {
  return {
    currency: "ARS",
    taxBasis: "EXCLUDED",
    precision: 2,
    roundingMode: "HALF_UP",
    lines: [
      {
        sourceLineId: "line",
        itemId: "cal",
        code: "C1",
        name: "Aplicado a la cal completo",
        categoryId: "cielorrasos",
        category: "Cielorrasos",
        unitId: "m2",
        unit: "m²",
        quantity: "100",
        laborUnitCost: "12.5",
        materials: [
          {
            materialId: "cemento",
            name: "Cemento",
            unitId: "kg",
            unit: "kg",
            coefficient: "4.5",
            unitPrice: "2",
            sourcePriceId: "cement-price",
          },
          {
            materialId: "cal",
            name: "Cal",
            unitId: "kg",
            unit: "kg",
            coefficient: "6.6",
            unitPrice: "3",
            sourcePriceId: null,
          },
          {
            materialId: "arena",
            name: "Arena",
            unitId: "m3",
            unit: "m³",
            coefficient: "0.07",
            unitPrice: "10",
            sourcePriceId: null,
          },
        ],
      },
    ],
  };
}

describe("APU y presupuesto decimal con snapshots independientes", () => {
  it("100 m² requieren 450 kg cemento, 660 kg cal y 7 m³ arena", () => {
    const result = calculateBudget(example());
    expect(result.materials.map((row) => row.quantity)).toEqual([
      "450",
      "660",
      "7",
    ]);
    expect(result.lines[0].materialUnitCost).toBe("29.5");
    expect(result.materialCost).toBe("2950.00");
    expect(result.laborCost).toBe("1250.00");
    expect(result.totalCost).toBe("4200.00");
  });
  it("consolida materiales entre ítems y rubros conservando desglose", () => {
    const input = example();
    input.lines.push({
      ...structuredClone(input.lines[0]),
      sourceLineId: "line-2",
      categoryId: "revoques",
      category: "Revoques",
      quantity: "50",
    });
    const result = calculateBudget(input);
    expect(result.materials.map((row) => row.quantity)).toEqual([
      "675",
      "990",
      "10.5",
    ]);
    expect(result.materialsByCategory).toHaveLength(6);
    expect(result.categories.map((row) => row.totalCost)).toEqual([
      "4200.00",
      "2100.00",
    ]);
    expect(result.totalCost).toBe("6300.00");
  });
  it("copia cantidades, coeficientes, etiquetas y precios sin alias al origen", () => {
    const input = example();
    const versionOne = calculateBudget(input);
    const serialized = JSON.stringify(versionOne);
    input.lines[0].quantity = "200";
    input.lines[0].materials[0].coefficient = "5";
    input.lines[0].materials[0].unitPrice = "20";
    input.lines[0].materials[0].name = "Nombre actualizado";
    const versionTwo = calculateBudget(input);
    expect(JSON.stringify(versionOne)).toBe(serialized);
    expect(versionTwo.materials[0].quantity).toBe("1000");
    expect(versionOne.lines[0].materials[0].unitPrice).toBe("2");
    expect(versionOne.lines[0].materials[0].name).toBe("Cemento");
  });
  it("usa redondeo explícito por componente extendido y suma renglones visibles", () => {
    const input = example();
    input.lines = [
      {
        ...input.lines[0],
        quantity: "1",
        laborUnitCost: "1.005",
        materials: [
          {
            ...input.lines[0].materials[0],
            coefficient: "1",
            unitPrice: "0.005",
          },
        ],
      },
    ];
    const halfUp = calculateBudget(input);
    const halfEven = calculateBudget({ ...input, roundingMode: "HALF_EVEN" });
    expect(halfUp.totalCost).toBe("1.02");
    expect(halfEven.totalCost).toBe("1.00");
    expect(halfUp.roundingBoundary).toBe("EXTENDED_LINE_COMPONENTS");
  });
  it("conserva 16 decimales de cantidades y más de 20 dígitos significativos", () => {
    const input = example();
    input.lines = [
      {
        ...input.lines[0],
        quantity: "1234567890123456.12345678",
        laborUnitCost: "0",
        materials: [
          {
            ...input.lines[0].materials[0],
            coefficient: "0.12345678",
            unitPrice: "1",
          },
        ],
      },
    ];
    const result = calculateBudget(input);
    expect(result.materials[0].quantity).toBe(
      "152415776406035.6954732565279684",
    );
  });
});
