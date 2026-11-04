import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { linearCost } from "../scripts/source-linear-cost";

describe("dependencias lineales de MO original", () => {
  it("recupera consumos explícitos sin sumar el agregado y sin tratar aportes como IVA", () => {
    const book = new ExcelJS.Workbook(),
      mo = book.addWorksheet("MO real "),
      recipe = book.addWorksheet("01-TareasP");
    mo.getCell("D11").value = 9485;
    mo.getCell("D13").value = 7186;
    mo.getCell("D30").value = "más un 21,00% de aportes";
    recipe.getCell("D20").value = 0.2;
    recipe.getCell("D21").value = 0.2;
    recipe.getCell("G20").value = { formula: "+'MO real '!D11", result: 9485 };
    recipe.getCell("G21").value = { formula: "+'MO real '!D13", result: 7186 };
    recipe.getCell("I20").value = { formula: "G20*D20", result: 1897 };
    recipe.getCell("I21").value = { formula: "G21*D21", result: 1437.2 };
    recipe.getCell("J22").value = { formula: "SUM(I20:I21)", result: 3334.2 };
    const result = linearCost(
      book,
      "01-TareasP",
      "J22",
      new Map([
        ["MO real !D11", "oficial"],
        ["MO real !D13", "ayudante"],
      ]),
    );
    expect(result.issue).toBeNull();
    expect(result.constant).toBe("0");
    expect(result.components).toEqual([
      { sourceKey: "oficial", coefficient: "0.2" },
      { sourceKey: "ayudante", coefficient: "0.2" },
    ]);
    expect(result.evidence).not.toContain("MO real !D30");
  });
  it("conserva ausencia, fórmulas no soportadas y ciclos como fallos específicos", () => {
    const book = new ExcelJS.Workbook(),
      s = book.addWorksheet("A");
    s.getCell("A1").value = { formula: "A1", result: 0 };
    s.getCell("A2").value = { formula: "AVERAGE(A3:A4)", result: 0 };
    expect(linearCost(book, "A", "A1", new Map()).issue).toContain("cíclica");
    expect(linearCost(book, "A", "A2", new Map()).issue).toContain(
      "no soportada",
    );
    expect(linearCost(book, "A", "A3", new Map()).issue).toContain("ausente");
    s.getCell("A4").value = 0;
    expect(linearCost(book, "A", "A4", new Map()).constant).toBe("0");
  });
});
