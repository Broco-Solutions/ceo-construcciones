import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { calculateCommercial } from "./commercial-domain";
import { Prisma } from "@prisma/client";

type PublicHeader = {
  name: string;
  client: { name: string; taxId: string | null; address: string | null };
  work: { name: string; address: string | null };
  conditions: string;
  exclusions: string;
  observations: string;
  deadline: string;
  issuedAt: string;
  nonPricedLines?: {
    category: string;
    name: string;
    status: "INCLUDED" | "EXCLUDED";
  }[];
};
/** Only the allowlisted public fields below enter the PDF or its metadata. */
export async function commercialPdf(
  calculation: ReturnType<typeof calculateCommercial>,
  header: PublicHeader,
  revision: string,
) {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Presupuesto — CEO Construcciones");
  pdf.setAuthor("CEO Construcciones");
  pdf.setProducer("CEO Construcciones");
  const fixedDate = new Date(header.issuedAt);
  pdf.setCreationDate(fixedDate);
  pdf.setModificationDate(fixedDate);
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const clean = (s: string) =>
    s
      .replace(/[\u0000-\u001f]/g, " ")
      .replaceAll("→", "-")
      .replaceAll("−", "-")
      .replaceAll("₋", "-");
  const safe = (s: string) =>
    [...clean(s)]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  const wrap = (s: string, width: number, size = 10, f: PDFFont = font) => {
    const result: string[] = [];
    let row = "";
    for (const word of safe(s).split(/\s+/)) {
      if (
        f.widthOfTextAtSize((row ? " " : "") + word, size) +
          f.widthOfTextAtSize(row, size) >
          width &&
        row
      ) {
        result.push(row);
        row = "";
      }
      let remaining = word;
      while (f.widthOfTextAtSize(remaining, size) > width) {
        let cut = remaining.length - 1;
        while (
          cut > 1 &&
          f.widthOfTextAtSize(remaining.slice(0, cut), size) > width
        )
          cut--;
        if (row) {
          result.push(row);
          row = "";
        }
        result.push(remaining.slice(0, cut));
        remaining = remaining.slice(cut);
      }
      row += (row ? " " : "") + remaining;
    }
    if (row) result.push(row);
    return result.length ? result : [""];
  };
  let page = pdf.addPage([595.28, 841.89]),
    y = 785;
  const draw = (s: string, x: number, yy: number, size = 10, f = font) =>
    page.drawText(safe(s), {
      x,
      y: yy,
      size,
      font: f,
      color: rgb(0.08, 0.13, 0.17),
    });
  const newPage = () => {
    page = pdf.addPage([595.28, 841.89]);
    y = 785;
    draw("CEO Construcciones", 40, y, 17, bold);
    const label = safe(`Presupuesto · ${revision}`);
    draw(label, 555 - font.widthOfTextAtSize(label, 10), y, 10);
    y -= 28;
  };
  const space = (height: number) => {
    if (y - height < 55) newPage();
  };
  const paragraph = (s: string, size = 10, f = font) => {
    for (const row of wrap(s, 515, size, f)) {
      space(size + 6);
      draw(row, 40, y, size, f);
      y -= size + 5;
    }
    y -= 5;
  };
  paragraph("CEO Construcciones", 20, bold);
  paragraph(`Presupuesto · ${revision}`, 12, bold);
  paragraph(header.name, 13, bold);
  paragraph(`Cliente / comitente: ${header.client.name}`);
  if (header.client.taxId) paragraph(`CUIT: ${header.client.taxId}`);
  if (header.client.address) paragraph(`Domicilio: ${header.client.address}`);
  paragraph(
    `Obra: ${header.work.name}${header.work.address ? " · " + header.work.address : ""}`,
  );
  paragraph(
    `Fecha: ${new Date(header.issuedAt).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`,
  );
  const money = (s: string) => {
    const [whole, fraction] = new Prisma.Decimal(s)
      .toFixed(2, Prisma.Decimal.ROUND_HALF_UP)
      .split(".");
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
  };
  const unitPrice = (value: string) => {
    const [whole, raw = ""] = new Prisma.Decimal(value).toFixed().split(".");
    const fraction = raw.replace(/0+$/, "").padEnd(2, "0");
    return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fraction}`;
  };
  for (const category of calculation.categories) {
    space(65);
    paragraph(category.name, 12, bold);
    const headings = () => {
      draw("Partida", 40, y, 9, bold);
      draw("Un.", 262, y, 9, bold);
      draw("Cantidad", 300, y, 9, bold);
      draw("Precio unitario", 370, y, 9, bold);
      draw("Importe", 510, y, 9, bold);
      y -= 19;
    };
    headings();
    for (const line of calculation.lines.filter(
      (l) => l.categoryId === category.categoryId,
    )) {
      const rows = wrap(line.name, 210, 9),
        unitRows = wrap(line.unit, 28, 8),
        quantityRows = wrap(line.quantity, 62, 8),
        priceRows = wrap(unitPrice(line.sellingUnitPrice), 90, 8),
        height =
          Math.max(
            rows.length * 13,
            unitRows.length * 13,
            quantityRows.length * 13,
            priceRows.length * 13,
            18,
          ) + 8;
      if (y - height < 55) {
        newPage();
        paragraph(category.name + " (continuación)", 12, bold);
        headings();
      }
      const amount = money(line.sellingAmount);
      const count = Math.max(
        rows.length,
        unitRows.length,
        quantityRows.length,
        priceRows.length,
        1,
      );
      for (let offset = 0; offset < count; ) {
        const capacity = Math.max(1, Math.floor((y - 55 - 8) / 13)),
          chunk = Math.min(capacity, count - offset);
        rows
          .slice(offset, offset + chunk)
          .forEach((r, i) => draw(r, 40, y - i * 13, 9));
        unitRows
          .slice(offset, offset + chunk)
          .forEach((r, i) => draw(r, 262, y - i * 13, 8));
        quantityRows
          .slice(offset, offset + chunk)
          .forEach((r, i) => draw(r, 300, y - i * 13, 8));
        priceRows
          .slice(offset, offset + chunk)
          .forEach((r, i) =>
            draw(r, 455 - font.widthOfTextAtSize(r, 8), y - i * 13, 8),
          );
        if (offset === 0) {
          const amountText = (value: string, right: number, width: number) => {
            let size = 8;
            while (size > 5 && font.widthOfTextAtSize(value, size) > width)
              size -= 0.25;
            draw(value, right - font.widthOfTextAtSize(value, size), y, size);
          };
          amountText(amount, 555, 94);
        }
        y -= Math.max(chunk * 13, 18) + 8;
        offset += chunk;
        if (offset < count) {
          newPage();
          paragraph(category.name + " (continuación)", 12, bold);
          headings();
        }
      }
    }
    space(27);
    paragraph(
      `Subtotal ${category.name}: ${calculation.currency} ${money(category.sellingAmount)}`,
      10,
      bold,
    );
  }
  space(60);
  paragraph(
    `TOTAL: ${calculation.currency} ${money(calculation.commercialTotal)}`,
    16,
    bold,
  );
  paragraph(
    "Precios unitarios con precisión de cálculo. Importes por partida redondeados a 2 decimales.",
    8,
  );
  paragraph(
    calculation.taxBasis === "EXCLUDED"
      ? "+ IVA (alícuota no informada)"
      : calculation.taxBasis === "INCLUDED"
        ? "IVA incluido"
        : "Tratamiento de IVA no especificado",
  );
  if (header.nonPricedLines?.length) {
    space(40);
    paragraph("Partidas sin importe independiente", 11, bold);
    for (const line of header.nonPricedLines)
      paragraph(
        `${line.category} · ${line.name}: ${line.status === "INCLUDED" ? "Incluida en otra partida" : "Excluida"}`,
      );
  }
  for (const [title, body] of [
    ["Plazo", header.deadline],
    ["Condiciones", header.conditions],
    ["Exclusiones", header.exclusions],
    ["Observaciones", header.observations],
  ])
    if (body) {
      space(40);
      paragraph(title, 11, bold);
      for (const p of body.split(/\r?\n/)) paragraph(p);
    }
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++)
    pages[i].drawText(
      `CEO Construcciones · ${revision} · ${i + 1} / ${pages.length}`,
      { x: 40, y: 27, size: 8, font },
    );
  return pdf.save({ useObjectStreams: false });
}
