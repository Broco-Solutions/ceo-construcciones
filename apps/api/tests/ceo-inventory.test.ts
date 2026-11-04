import { it, expect } from "vitest";
import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectCeoCatalog } from "../scripts/inspect-ceo-catalog";
it("CI-06/09: normaliza por fórmula comprobada, conserva caché y distingue regla contradictoria y ausente", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ceo-inventory-"));
  try {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("COSTO");
    book.addWorksheet("MO real ");
    const p = book.addWorksheet("PRECIOS");
    p.getCell("A3").value = "FUENTE MAYO 2026";
    for (const row of [5, 6, 7]) {
      p.getCell(`A${row}`).value = "CEMENTO " + row;
      p.getCell(`B${row}`).value = 3;
      p.getCell(`C${row}`).value = "kg";
    }
    p.getCell("E5").value = 8;
    p.getCell("F5").value = 10;
    p.getCell("G5").value = { formula: "+F5/B5", result: 3.33 };
    p.getCell("E6").value = 8;
    p.getCell("F6").value = 10;
    p.getCell("G6").value = { formula: "+F6", result: 10 };
    p.getCell("F7").value = { error: "#REF!" };
    p.getCell("A8").value = "OTROS 18-06-25";
    p.getCell("A9").value = "Material fechado";
    p.getCell("B9").value = 1;
    p.getCell("C9").value = "kg";
    p.getCell("F9").value = 10;
    p.getCell("A10").value = "RETAK";
    p.getCell("A11").value = "Material sin fecha";
    p.getCell("B11").value = 1;
    p.getCell("C11").value = "kg";
    p.getCell("F11").value = 10;
    const path = join(dir, "source.xlsx");
    await book.xlsx.writeFile(path);
    const result = await inspectCeoCatalog(path);
    expect(result.prices[0]).toMatchObject({
      status: "HISTORICAL",
      gross: "10",
      presentationQuantity: "3",
      normalized: "3.33",
      issues: [],
    });
    expect(result.prices[0].observations).toHaveLength(1);
    expect(result.prices[1].status).toBe("INCOMPLETE");
    expect(result.prices[3]).toMatchObject({
      date: "2025-06-18",
      datePrecision: "DAY",
      source: "OTROS 18-06-25",
    });
    expect(result.prices[4]).toMatchObject({
      date: null,
      datePrecision: "UNKNOWN",
      source: "RETAK",
    });
    expect(result.prices[2]).toMatchObject({
      status: "INCOMPLETE",
      gross: null,
      net: null,
    });
  } finally {
    await rm(dir, { recursive: true });
  }
});
