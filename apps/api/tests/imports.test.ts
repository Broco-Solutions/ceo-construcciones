import { describe, expect, it } from "vitest";
import { normalizeImport, parseCsv } from "../src/modules/imports";

describe("plantillas de importación controladas", () => {
  it("lee comillas escapadas, CRLF y texto multilineal sin inventar números", () => {
    const rows = parseCsv(
      'externalCode,name,phone\r\nP1,"Proveedor ""Norte""\nSucursal",00123\r\n',
    );
    expect(rows).toEqual([
      {
        externalCode: "P1",
        name: 'Proveedor "Norte"\nSucursal',
        phone: "00123",
      },
    ]);
  });
  it("rechaza CSV sin cierre, columnas inconsistentes y encabezados duplicados", () => {
    for (const csv of ['a,b\n"x,y', "a,b\nx", "a,a\nx,y"])
      expect(() => parseCsv(csv)).toThrow();
  });
  it("reporta precios cero, cantidades numéricas y referencias incompletas", () => {
    expect(
      normalizeImport("prices", [
        {
          externalCode: "p",
          materialCode: "C",
          price: "0",
          currency: "ARS",
          taxBasis: "UNSPECIFIED",
          effectiveAt: "2026-10-22T00:00:00Z",
        },
      ]).errors,
    ).toHaveLength(1);
    expect(
      normalizeImport("initial-stock", [
        {
          externalCode: "s",
          materialCode: "C",
          locationCode: "G",
          quantity: 12,
          reason: "Recuento",
        },
      ]).errors,
    ).toHaveLength(1);
  });
  it("detecta duplicados y cabeceras contradictorias de una misma OC", () => {
    expect(
      normalizeImport("works", [
        { externalCode: "W", name: "Uno" },
        { externalCode: "W", name: "Dos" },
      ]).errors,
    ).toHaveLength(1);
    const line = {
      externalCode: "OC1",
      supplierCode: "S1",
      destinationCode: "G",
      materialCode: "C",
      quantity: "2",
      unitPrice: "4",
      currency: "ARS",
      taxBasis: "UNSPECIFIED",
    };
    expect(
      normalizeImport("purchase-orders", [
        line,
        { ...line, materialCode: "A", supplierCode: "S2" },
      ]).errors,
    ).toHaveLength(1);
  });
  it("permite OC general y preserva decimales textuales exactos", () => {
    const normalized = normalizeImport("purchase-orders", [
      {
        externalCode: "OC1",
        supplierCode: "S1",
        destinationCode: "G",
        materialCode: "C",
        quantity: "0.00000001",
        unitPrice: "1.25000000",
        currency: "ARS",
        taxBasis: "UNSPECIFIED",
      },
    ]);
    expect(normalized.errors).toEqual([]);
    expect(normalized.rows[0].quantity).toBe("0.00000001");
  });
  it("rechaza aperturas repetidas del mismo par material/ubicación aunque cambie el identificador", () => {
    const row = {
      externalCode: "open1",
      materialCode: "C",
      locationCode: "G",
      quantity: "10",
      reason: "Recuento",
    };
    const result = normalizeImport("initial-stock", [
      row,
      { ...row, externalCode: "open2" },
    ]);
    expect(result.errors).toEqual([
      {
        row: 2,
        message:
          "El mismo material y ubicación sólo admiten una apertura de inventario",
      },
    ]);
  });
  it("identifica fila de proveedores con taxId duplicado aunque cambie externalCode", () => {
    const result = normalizeImport("suppliers", [
      { externalCode: "S1", name: "Uno", taxId: "CUIT1" },
      { externalCode: "S2", name: "Dos", taxId: "CUIT1" },
    ]);
    expect(result.errors).toEqual([
      { row: 2, message: "Identificación fiscal duplicada dentro del archivo" },
    ]);
  });
});
