import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  PDFDocument,
  StandardFonts,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { calculateCommercial } from "../src/modules/commercial-domain";
import { pdfMoney, pdfUnitPrice } from "../src/modules/pdf-layout-v2";
import { commercialPdf } from "../src/modules/commercial-pdf";
import {
  orderPdfV2,
  type OrderPresentation,
} from "../src/modules/order-pdf-v2";
import { pdfFixture, pdfText, pdfEvidence } from "./helpers/pdf-fixture";
async function expectSeparatorsOutsideText(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  let checked = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (
      !(object instanceof PDFRawStream) ||
      object.dict.toString().includes("/Subtype /Image")
    )
      continue;
    const stream = Buffer.from(decodePDFRawStream(object).decode()).toString(
      "latin1",
    );
    const text = [
      ...stream.matchAll(/([\d.]+) Tf\n24 TL\n1 0 0 1 [\d.]+ ([\d.]+) Tm/g),
    ].map((m) => ({ size: Number(m[1]), baseline: Number(m[2]) }));
    for (const m of stream.matchAll(/42 ([\d.]+) m\n553\.28 [\d.]+ l/g)) {
      const y = Number(m[1]);
      for (const t of text)
        expect(
          y >= t.baseline - t.size * 0.25 && y <= t.baseline + t.size * 0.8,
          `Separador y=${y} cruza texto en y=${t.baseline}, tamaño=${t.size}`,
        ).toBe(false);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
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
    await pdfEvidence("presupuesto-V1-historico.pdf", a);
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
      let previousLine = -1;
      for (const line of f.calculation.lines) {
        const position = text.indexOf(
          line.name.slice(0, count === 1 ? undefined : 12),
        );
        expect(position).toBeGreaterThan(previousLine);
        previousLine = position;
        expect(text).toContain(pdfMoney(line.sellingAmount));
      }
      for (const category of f.calculation.categories)
        expect(text).toContain(
          `Subtotal ${category.name}: ARS ${pdfMoney(category.sellingAmount)}`,
        );
      expect(text).toContain(`ARS ${pdfMoney(f.calculation.commercialTotal)}`);
      expect(text).not.toMatch(
        /laborCost|directCost|markup|Costo interno|Mano de obra|Rentabilidad/,
      );
      expect(
        Buffer.from(await commercialPdf(f.calculation, header, "R2")),
      ).toEqual(Buffer.from(bytes));
      await expectSeparatorsOutsideText(bytes);
      await pdfEvidence(
        count === 1
          ? "presupuesto-V2-una-pagina.pdf"
          : "presupuesto-V2-146-partidas.pdf",
        bytes,
      );
    }
  });
  it("sólo publica venta y condiciones; preserva precisión sin filtrar composición ni metadatos privados", async () => {
    const f = pdfFixture();
    f.content.lines[0].quantity = "1.23456789";
    f.content.lines[0].materials = [
      {
        materialId: "private-material",
        name: "PRIVADO-MATERIAL-7391",
        unitId: "private-unit",
        unit: "kg",
        coefficient: "0.12345678",
        unitPrice: "987.654321",
        sourcePriceId: null,
      },
    ];
    const calculation = calculateCommercial(f.content);
    const bytes = await commercialPdf(
      calculation,
      { ...f.header, pdfTemplateVersion: 2 },
      "R1",
    );
    const text = await pdfText(bytes),
      pdf = await PDFDocument.load(bytes);
    expect(text.replace(/\s/g, "")).toContain(
      pdfUnitPrice(calculation.lines[0].sellingUnitPrice),
    );
    expect(text).toContain(pdfMoney(calculation.lines[0].sellingAmount));
    expect(text).toContain(pdfMoney(calculation.commercialTotal));
    const publicData =
      text +
      Buffer.from(bytes).toString("latin1") +
      JSON.stringify({
        title: pdf.getTitle(),
        author: pdf.getAuthor(),
        subject: pdf.getSubject(),
        keywords: pdf.getKeywords(),
        producer: pdf.getProducer(),
      });
    expect(publicData).not.toMatch(
      /PRIVADO-MATERIAL-7391|0[.,]12345678|987[.,]654321|laborUnitCost|directUnitCost|materialUnitCost|coefficient|markup|sourcePriceId/,
    );
    await pdfEvidence("presupuesto-V2-precision-publica.pdf", bytes);
  });
  it("rubros extensos se ajustan al ancho imprimible", async () => {
    const f = pdfFixture();
    const title =
      "Demoliciones, mampostería y terminaciones interiores con coordinación de gremios. "
        .repeat(5)
        .trim();
    f.content.lines[0].category = title;
    const bytes = await commercialPdf(
      calculateCommercial(f.content),
      { ...f.header, pdfTemplateVersion: 2 },
      "R1",
    );
    await pdfEvidence("presupuesto-V2-rubro-extenso.pdf", bytes);
    const pdf = await PDFDocument.load(bytes),
      font = await pdf.embedFont(StandardFonts.HelveticaBold);
    let titles = 0;
    for (const [, object] of pdf.context.enumerateIndirectObjects()) {
      if (
        !(object instanceof PDFRawStream) ||
        object.dict.toString().includes("/Subtype /Image")
      )
        continue;
      const stream = Buffer.from(decodePDFRawStream(object).decode()).toString(
        "latin1",
      );
      for (const block of stream.matchAll(/BT([\s\S]*?)ET/g)) {
        const value = block[1].match(/<([A-Fa-f\d]+)>\s*Tj/),
          position = block[1].match(/1 0 0 1 ([\d.]+) ([\d.]+) Tm/);
        if (!value || !position || !block[1].includes(" 10 Tf")) continue;
        const text = Buffer.from(value[1], "hex").toString("latin1");
        if (!title.includes(text)) continue;
        titles++;
        expect(
          Number(position[1]) + font.widthOfTextAtSize(text, 10),
        ).toBeLessThanOrEqual(553.28);
      }
    }
    expect(titles).toBeGreaterThan(0);
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
    await expectSeparatorsOutsideText(bytes);
    await pdfEvidence("OC-V2-extensa.pdf", bytes);
    const cancelled = await orderPdfV2(snapshot, "CANCELLED");
    await pdfEvidence("OC-V2-extensa-cancelada.pdf", cancelled);
    for (let i = 0; i < 80; i++)
      expect(text).toContain(`M-${i} · Material ${i}`);
    expect(await pdfText(cancelled)).toContain("CANCELADA");
  });
});
