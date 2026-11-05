import type { calculateCommercial } from "./commercial-domain";
import { commercialPdfV1, type PublicHeader } from "./commercial-pdf-v1";
import {
  documentV2,
  pdfDecimal,
  pdfMoney,
  pdfTax,
  pdfUnitPrice,
} from "./pdf-layout-v2";
export async function commercialPdf(
  calculation: ReturnType<typeof calculateCommercial>,
  header: PublicHeader,
  revision: string,
) {
  // Missing version is a legacy document. Never consult current catalogue/assets.
  if ((header.pdfTemplateVersion ?? 1) === 1)
    return commercialPdfV1(calculation, header, revision);
  if (header.pdfTemplateVersion !== 2)
    throw new Error("Versión de presentación de PDF no soportada");
  const doc = await documentV2({
    kind: "PRESUPUESTO",
    number: revision,
    date: header.issuedAt,
  });
  doc.paragraph(header.name, { size: 13, strong: true });
  doc.section("Cliente y obra");
  doc.paragraph(`Cliente / comitente: ${header.client.name}`, { strong: true });
  if (header.client.taxId) doc.paragraph("CUIT: " + header.client.taxId);
  if (header.client.address)
    doc.paragraph("Domicilio: " + header.client.address);
  doc.paragraph(
    "Obra: " +
      header.work.name +
      (header.work.address ? " · " + header.work.address : ""),
  );
  doc.paragraph(
    `Moneda: ${calculation.currency} · ${pdfTax(calculation.taxBasis)}`,
  );
  for (const category of calculation.categories) {
    doc.section(category.name);
    doc.table(
      [
        { label: "Ítem", width: 27 },
        { label: "Descripción", width: 171 },
        { label: "Un.", width: 28 },
        { label: "Cantidad", width: 59, right: true },
        { label: "Precio unitario", width: 110, right: true },
        { label: "Importe", width: 116.28, right: true },
      ],
      calculation.lines
        .filter((l) => l.categoryId === category.categoryId)
        .map((l, i) => [
          String(i + 1),
          l.name,
          l.unit,
          pdfDecimal(l.quantity),
          pdfUnitPrice(l.sellingUnitPrice),
          pdfMoney(l.sellingAmount),
        ]),
      category.name,
    );
    doc.paragraph(
      `Subtotal ${category.name}: ${calculation.currency} ${pdfMoney(category.sellingAmount)}`,
      { strong: true },
    );
  }
  doc.total("TOTAL", calculation.commercialTotal, calculation.currency);
  doc.paragraph(pdfTax(calculation.taxBasis));
  doc.paragraph(
    "Precios unitarios con precisión de cálculo. Importes por partida redondeados a 2 decimales.",
    { size: 8.5 },
  );
  if (header.nonPricedLines?.length) {
    doc.section("Partidas sin importe independiente");
    header.nonPricedLines.forEach((l) =>
      doc.paragraph(
        `${l.category} · ${l.name}: ${l.status === "INCLUDED" ? "Incluida en otra partida" : "Excluida"}`,
      ),
    );
  }
  for (const [title, body] of [
    ["Plazo", header.deadline],
    ["Condiciones", header.conditions],
    ["Exclusiones", header.exclusions],
    ["Observaciones", header.observations],
  ])
    if (body) {
      doc.section(title);
      doc.paragraph(body);
    }
  return doc.save();
}
