import { describe, it, expect } from "vitest";
import {
  extractComposition,
  type SourceSheet,
} from "../scripts/historical-composition";
function source(): SourceSheet[] {
  return [
    {
      name: "REV C",
      rows: [["", "", "", "", ""]],
      formulas: [{ row: 1, column: 5, text: "01-Tasks!J4:J4" }],
    },
    {
      name: "01-Tasks",
      rows: [
        ["", "Actividad sin código", "", "", "", "", "", "", "", 45, "/m2"],
        ["", "Cemento", "", 2.5, "kg", "", 18, "", 45],
        ["", "", "", "", "", "", "", "", 0],
        ["", "", "", "", "", "", "", "", "materiales", 45],
      ],
      formulas: [
        { row: 2, column: 9, text: "G2*D2" },
        { row: 4, column: 10, text: "SUM(I2:I3)" },
      ],
    },
  ];
}
describe("revisión física de referencias históricas", () => {
  it("recupera encabezados sin código y materiales sin x, y sigue referencias locales", () => {
    const s = source();
    s[0].rows.push([]);
    s[0].formulas!.push({ row: 2, column: 5, text: "E1/2.0" });
    const r = extractComposition(s, "REV C", 2);
    expect(r.warnings).toEqual([]);
    expect(r.materials[0]).toMatchObject({
      name: "Cemento",
      coefficient: "1.25",
      unitPrice: "18",
    });
  });
  it("no convierte un precio ausente en cero ni pierde el consumo físico explícito", () => {
    const s = source();
    s[1].rows[1][6] = "";
    const r = extractComposition(s, "REV C", 1);
    expect(r.materials[0].coefficient).toBe("2.5");
    expect(r.materials[0].unitPrice).toBeNull();
    expect(r.missingPrices).toEqual(["01-Tasks!G2"]);
  });
  it("no usa amortización o factor de costo como rendimiento físico", () => {
    const s = source();
    s[1].formulas![0].text = "G2*D2/2.0";
    s[1].formulas![1].text = "SUM(I2:I3)*1.2";
    const r = extractComposition(s, "REV C", 1);
    expect(r.materials[0].coefficient).toBe("2.5");
    expect(r.warnings).toHaveLength(2);
  });
  it("no evalúa funciones, enlaces activos ni referencias cíclicas", () => {
    for (const expression of [
      'WEBSERVICE("https://invalid.test")',
      "E1",
      'RUN("x")',
    ]) {
      const s = source();
      s[0].formulas![0].text = expression;
      expect(extractComposition(s, "REV C", 1).warnings.length).toBeGreaterThan(
        0,
      );
    }
  });
});
