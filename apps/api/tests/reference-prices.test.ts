import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { handlerReferencePrices, localPrice, monthArgentina } from "../src/modules/reference-prices";
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

describe("lectura compartida de archivos Excel", () => {
  it("informa archivo dañado, vacío, extensión inválida y límite de tamaño", async () => {
    for (const [name, bytes, status, code] of [
      ["roto.xlsx", Buffer.from([0x50, 0x4b, 0x03, 0x04]), 422, "INVALID_XLSX"],
      ["vacio.xlsx", Buffer.alloc(0), 422, "EMPTY_FILE"],
      ["macros.xlsm", Buffer.from("archivo"), 422, "UNSUPPORTED_FILE"],
      ["exceso.xlsx", Buffer.alloc(1_000_001), 413, "FILE_TOO_LARGE"],
    ] as const) {
      await expect(priceFile(name, bytes)).rejects.toMatchObject({ status, code });
    }
  });

  it("aplica los límites de filas y columnas a un XLSX real", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Datos");
    sheet.addRow(["Código"]);
    for (let i = 0; i < 1001; i++) sheet.addRow(["M"]);
    await expect(priceFile("filas.xlsx", Buffer.from(await book.xlsx.writeBuffer())))
      .rejects.toMatchObject({ status: 422, code: "ROW_LIMIT" });
    book.removeWorksheet(sheet.id);
    const wide = book.addWorksheet("Datos");
    wide.addRow(Array.from({ length: 101 }, (_, i) => String(i)));
    wide.addRow(["Valor"]);
    await expect(priceFile("columnas.xlsx", Buffer.from(await book.xlsx.writeBuffer())))
      .rejects.toMatchObject({ status: 422, code: "ROW_LIMIT" });
  });

  it("rechaza más de 20 MB expandidos aunque el archivo esté comprimido", async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Datos");
    sheet.addRow(["Texto"]);
    for (let i = 0; i < 700; i++) sheet.addRow([String(i) + "a".repeat(30_000)]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    expect(bytes.length).toBeLessThan(1_000_000);
    await expect(priceFile("expandido.xlsx", bytes))
      .rejects.toMatchObject({ status: 413, code: "FILE_EXPANDED_LIMIT" });
  }, 15_000);

  it("devuelve un error de archivo si el XML apunta a una cadena inexistente", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Datos").addRows([["Precio"], ["valor"]]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer({ zip: { compression: "STORE" } }));
    const index = bytes.indexOf("<v>1</v>");
    expect(index).toBeGreaterThan(-1);
    bytes[index + 3] = "9".charCodeAt(0);
    await expect(priceFile("internamente-dañado.xlsx", bytes))
      .rejects.toMatchObject({ status: 422, code: "INVALID_XLSX" });
  });

  it("conserva el decimal de ocho lugares cargado como celda numérica", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Datos").addRows([["Precio"], [0.00000001]]);
    const response = await priceFile("decimal.xlsx", Buffer.from(await book.xlsx.writeBuffer()));
    expect((await response!.json()).data.sheets[0].rows).toEqual([["0.00000001"]]);
  });

  it("rechaza un archivo renombrado a XLSX con una entrada de macros", async () => {
    const book = new ExcelJS.Workbook();
    book.addWorksheet("Datos").addRows([["Precio"], [1]]);
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    const original = Buffer.from("xl/styles.xml");
    const macro = Buffer.from("xl/vbaProject");
    expect(macro.length).toBe(original.length);
    for (let index = bytes.indexOf(original); index !== -1; index = bytes.indexOf(original, index + macro.length))
      macro.copy(bytes, index);
    await expect(priceFile("macros-disfrazadas.xlsx", bytes))
      .rejects.toMatchObject({ status: 422, code: "ACTIVE_CONTENT" });
  });

  it("mantiene todos los encabezados del CSV aun con celdas opcionales vacías", async () => {
    const response = await priceFile(
      "lista.csv",
      Buffer.from("Código material;Unidad;Presentación;Precio\nM;kg;;7.210,50"),
    );
    expect((await response!.json()).data.sheets[0]).toMatchObject({
      columns: ["Código material", "Unidad", "Presentación", "Precio"],
      rows: [["M", "kg", "", "7.210,50"]],
    });
  });
});

function priceFile(name: string, bytes: Buffer) {
  return handlerReferencePrices(new Request("http://localhost/price-files", {
    method: "POST",
    body: JSON.stringify({ name, base64: bytes.toString("base64") }),
  }), { id: "solo-lectura", role: "GERENCIA" }, ["price-files"]);
}
