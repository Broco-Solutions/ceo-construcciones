import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { commercialPdf } from "../src/modules/commercial-pdf";
import {
  orderPdfV2,
  type OrderPresentation,
} from "../src/modules/order-pdf-v2";
import { pdfFixture } from "./helpers/pdf-fixture";
export async function pdfText(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .flatMap(([, object]) => {
      if (
        !(object instanceof PDFRawStream) ||
        object.dict.toString().includes("/Subtype /Image")
      )
        return [];
      try {
        return [
          ...Buffer.from(decodePDFRawStream(object).decode())
            .toString("latin1")
            .matchAll(/<([A-Fa-f\d]+)>\s*Tj/g),
        ].map((m) => Buffer.from(m[1], "hex").toString("latin1"));
      } catch {
        return [];
      }
    })
    .join("\n");
}
async function evidence(name: string, bytes: Uint8Array) {
  if (process.env.CEO_PDF_EVIDENCE_DIR) {
    await mkdir(process.env.CEO_PDF_EVIDENCE_DIR, { recursive: true });
    await writeFile(join(process.env.CEO_PDF_EVIDENCE_DIR, name), bytes);
  }
}
describe("PDF versionados y públicos", () => {
  it("V1 conserva exactamente los bytes del renderer de main y fallback sin versión", async () => {
    const f = pdfFixture(),
      a = await commercialPdf(f.calculation, f.header, "R1"),
      b = await commercialPdf(
        f.calculation,
        { ...f.header, pdfTemplateVersion: 1 },
        "R1",
      );
    expect(Buffer.from(a)).toEqual(Buffer.from(b));
    expect(createHash("sha256").update(a).digest("hex")).toBe(
      "38e71b1a6621649b098e2db3da162c8f198a456159d64dfc9989eb5458d25434",
    );
  });
  it("V2 de una página y 146 partidas mantiene números/texto, cabeceras y pie en todas las páginas", async () => {
    for (const count of [1, 146]) {
      const f = pdfFixture(count),
        header = {
          ...f.header,
          pdfTemplateVersion: 2,
          nonPricedLines: [
            {
              category: "VARIOS",
              name: "Partida incluida m²",
              status: "INCLUDED" as const,
            },
            {
              category: "VARIOS",
              name: "Partida excluida m³",
              status: "EXCLUDED" as const,
            },
          ],
        };
      const bytes = await commercialPdf(f.calculation, header, "R2"),
        pdf = await PDFDocument.load(bytes),
        text = await pdfText(bytes);
      if (count === 1) expect(pdf.getPageCount()).toBe(1);
      if (count > 1) expect(pdf.getPageCount()).toBeGreaterThan(5);
      expect((text.match(/PRESUPUESTO/g) ?? []).length).toBeGreaterThanOrEqual(
        pdf.getPageCount(),
      );
      expect((text.match(/Página/g) ?? []).length).toBe(pdf.getPageCount());
      expect(text).toContain("Partida incluida m²");
      expect(text).toContain("Partida excluida m³");
      expect(text).toContain("3.000,00");
      expect(text).toContain("TOTAL");
      expect(text).not.toMatch(
        /laborCost|directCost|markup|Costo interno|Mano de obra|Rentabilidad/,
      );
      expect(
        Buffer.from(await commercialPdf(f.calculation, header, "R2")),
      ).toEqual(Buffer.from(bytes));
      await evidence(
        count === 1
          ? "presupuesto-V2-una-pagina.pdf"
          : "presupuesto-V2-146-partidas.pdf",
        bytes,
      );
    }
  });
  it("OC V2 no recalcula importes; presentación, destino, estado y cantidades legibles", async () => {
    const snapshot: OrderPresentation = {
      version: 2,
      number: 123,
      date: "2026-10-01T12:00:00Z",
      status: "ISSUED",
      currency: "ARS",
      taxBasis: "INCLUDED",
      supplier: { name: "Proveedor sintético", taxId: null, address: null },
      destination: "Patio de prueba · Patio",
      work: null,
      notes: "Entrega según cantidades registradas.",
      lines: Array.from({ length: 80 }, (_, i) => ({
        name: "Material " + i + " · descripción con acentos m² y m³ ".repeat(5),
        code: "M-" + i,
        unit: "kg",
        presentation: "Bolsa de 25 kg",
        quantity: "50",
        unitPrice: "12500",
        baseQuantity: "25",
        amount: "25000.00",
      })),
      total: "2000000.00",
    };
    const bytes = await orderPdfV2(snapshot),
      pdf = await PDFDocument.load(bytes),
      text = await pdfText(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(text).toContain("Bolsa de 25 kg");
    expect(text).toContain("2.000.000,00");
    expect(text).toContain("Compra general");
    expect(text).not.toContain("undefined");
    expect(Buffer.from(await orderPdfV2(snapshot))).toEqual(Buffer.from(bytes));
    await evidence("OC-V2-extensa.pdf", bytes);
    expect(await pdfText(await orderPdfV2(snapshot, "CANCELLED"))).toContain(
      "CANCELADA",
    );
  });
});
