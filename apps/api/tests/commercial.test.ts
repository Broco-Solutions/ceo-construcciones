import { describe, it, expect } from "vitest";
import {
  calculateCommercial,
  editorContentSchema,
  quantityExpression,
  type EditorContent,
} from "../src/modules/commercial-domain";
const content = (): EditorContent => ({
  currency: "ARS",
  taxBasis: "EXCLUDED",
  markup: "50",
  conditions: "",
  exclusions: "",
  observations: "",
  deadline: "",
  lines: [
    {
      key: "line",
      itemId: null,
      code: null,
      name: "Construcción",
      categoryId: "cat",
      category: "VARIOS",
      unitId: "unit",
      unit: "gl",
      quantity: "3",
      laborUnitCost: "100000",
      directUnitCost: "900000",
      status: "ACTIVE",
      materials: [],
    },
  ],
});
describe("cierre comercial decimal", () => {
  it("H02: costo unitario conocido antes de cargar cantidad; vacío sigue pendiente", () => {
    const c = content();
    c.lines = ["0", null, "2"].map((quantity, i) => ({
      ...c.lines[0],
      key: `unit-${i}`,
      quantity,
    }));
    const r = calculateCommercial(c);
    expect(r.unitCosts.map((l) => l.totalUnitCost)).toEqual([
      "1000000",
      "1000000",
      "1000000",
    ]);
    expect(r.unitCosts.map((l) => l.quantityPending)).toEqual([
      false,
      true,
      false,
    ]);
    expect(r.totalCost).toBe("2000000.00");
    expect(r.materials).toEqual([]);
    c.lines[0].laborUnitCost = null;
    const missing = calculateCommercial(c).unitCosts[0];
    expect(missing.totalUnitCost).toBeNull();
    expect(missing.missingCosts).toContain("Mano de obra");
  });
  it("H04: consumo cero explícito no genera demanda ni un falso error de precisión", () => {
    const c = content();
    c.lines[0].materials = [
      {
        materialId: "zero",
        name: "No utilizado",
        unitId: "kg",
        unit: "kg",
        coefficient: "0",
        unitPrice: "12",
        sourcePriceId: null,
      },
    ];
    const r = calculateCommercial(c);
    expect(r.complete).toBe(true);
    expect(r.materials).toEqual([]);
  });
  it("DG/H04: agregado conocido y consumos verificables se separan sin inventar precio ni duplicar costo", () => {
    const c = content();
    c.lines[0].materialsIncludedInDirect = true;
    c.lines[0].materials = [
      {
        materialId: "m",
        name: "Consumo físico",
        unitId: "kg",
        unit: "kg",
        coefficient: "2",
        unitPrice: null,
        sourcePriceId: null,
      },
    ];
    const r = calculateCommercial(c);
    expect(r.complete).toBe(true);
    expect(r.totalCost).toBe("3000000.00");
    expect(r.materials[0].quantity).toBe("6");
    expect(r.lines[0].materials[0].unitPrice).toBeNull();
    c.lines[0].materialsIncludedInDirect = false;
    expect(calculateCommercial(c).complete).toBe(false);
  });
  it("materiales revisados exige evidencia concreta; un booleano no resuelve los faltantes", () => {
    const c = content();
    c.materialDemandIncomplete = true;
    expect(calculateCommercial(c).materialDemandIncomplete).toBe(true);
    c.lines[0].materialReview = {
      status: "UNRESOLVED",
      detail: "Falta cantidad del insumo",
      evidence: "",
    };
    c.materialDemandIncomplete = false;
    expect(calculateCommercial(c).materialDemandIncomplete).toBe(true);
    c.lines[0].materialReview = {
      status: "DIRECT",
      detail: "Servicio sin materiales",
      evidence: "Contrato sintético, cláusula de servicio",
    };
    expect(calculateCommercial(c).materialDemandIncomplete).toBe(false);
    c.lines[0].materialReview.evidence = "";
    expect(editorContentSchema.safeParse(c).success).toBe(false);
  });
  it("cantidades fraccionarias consolidan lo mismo que almacena inventario, sin convertir demanda positiva en cero", () => {
    const c = content();
    c.lines = [0, 1].map((i) => ({
      ...c.lines[0],
      key: `line-${i}`,
      categoryId: `cat-${i}`,
      quantity: "0.33333333",
      materials: [
        {
          materialId: "material",
          name: "Material",
          unitId: "unit",
          unit: "kg",
          coefficient: "0.33333333",
          unitPrice: "1",
          sourcePriceId: null,
        },
      ],
    }));
    const r = calculateCommercial(c);
    expect(r.complete).toBe(true);
    expect(r.materialsByCategory.map((m) => m.quantity)).toEqual([
      "0.11111111",
      "0.11111111",
    ]);
    expect(r.materials[0].quantity).toBe("0.22222222");
    c.lines[0].quantity = "0.00000001";
    c.lines[0].materials[0].coefficient = "0.00000001";
    expect(calculateCommercial(c).complete).toBe(false);
  });
  it("T11/T12: costo 3 millones y 50% da 4,5 millones sin material ficticio", () => {
    const r = calculateCommercial(content());
    expect(r.totalCost).toBe("3000000.00");
    expect(r.commercialTotal).toBe("4500000.00");
    expect(r.materials).toEqual([]);
  });
  it("T12: ajustes reemplazan el general, sin acumulación", () => {
    const c = content();
    c.lines[0].markup = "20";
    expect(calculateCommercial(c).commercialTotal).toBe("3600000.00");
    delete c.lines[0].markup;
    c.lines[0].directMarkup = "0";
    expect(calculateCommercial(c).commercialTotal).toBe("3150000.00");
    c.lines[0].markup = "10";
    expect(editorContentSchema.safeParse(c).success).toBe(false);
  });
  it("T11: incluidos y excluidos no suman costos ni materiales", () => {
    const c = content();
    c.lines[0].status = "INCLUDED";
    expect(calculateCommercial(c).totalCost).toBe("0.00");
    expect(calculateCommercial(c).complete).toBe(false);
  });
  it("no transforma datos incompletos en cero", () => {
    const c = content();
    c.lines[0].directUnitCost = null;
    const r = calculateCommercial(c);
    expect(r.complete).toBe(false);
    expect(r.issues).toHaveLength(1);
    c.lines[0].directUnitCost = "0";
    expect(calculateCommercial(c).complete).toBe(true);
  });
  it("T13: parser aritmético acotado sin código ejecutable", () => {
    expect(quantityExpression("(2+3)*4/2")).toBe("10");
    expect(quantityExpression("1/3")).toBe("0.33333333");
    for (const s of [
      "process.exit()",
      "1/0",
      "a+3",
      "2**4",
      "(1+2",
      "-1",
      "1;2",
      ".5",
      "1. + 2",
      "1..2",
    ])
      expect(() => quantityExpression(s)).toThrow();
  });
});
