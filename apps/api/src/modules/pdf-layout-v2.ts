import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
const BLUE = rgb(34 / 255, 59 / 255, 123 / 255),
  INK = rgb(0.08, 0.11, 0.18),
  MUTED = rgb(0.36, 0.4, 0.49),
  LINE = rgb(0.88, 0.9, 0.94),
  PALE = rgb(0.96, 0.97, 0.99);
export const pdfMoney = (s: string) => {
  const [whole, fraction] = new Prisma.Decimal(s)
    .toFixed(2, Prisma.Decimal.ROUND_HALF_UP)
    .split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + fraction;
};
export const pdfDecimal = (s: string) => {
  const [whole, fraction] = new Prisma.Decimal(s).toFixed().split(".");
  return (
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".") +
    (fraction ? "," + fraction : "")
  );
};
export const pdfUnitPrice = (s: string) => {
  const formatted = pdfDecimal(s),
    [whole, fraction = ""] = formatted.split(",");
  return whole + "," + fraction.padEnd(2, "0");
};
export const pdfTax = (tax: string) =>
  tax === "INCLUDED"
    ? "IVA incluido"
    : tax === "EXCLUDED"
      ? "IVA no incluido · alícuota no informada"
      : "Tratamiento de IVA no especificado";
/** V2 assets and geometry are immutable. Introduce V3 for later presentation changes. */
export async function documentV2({
  kind,
  number,
  date,
}: {
  kind: string;
  number: string;
  date: string;
}) {
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(kind + " — CEO Construcciones");
  pdf.setAuthor("CEO Construcciones");
  pdf.setProducer("CEO Construcciones · Plantilla 2");
  const fixed = new Date(date);
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  const logo = await pdf.embedPng(
    await readFile(resolve(process.cwd(), "data/pdf-v2/ceo-logo-azul.png")),
  );
  const left = 42,
    right = 553.28,
    width = right - left,
    bottom = 61;
  let page: PDFPage,
    y = 0;
  const safe = (text: string) =>
    [
      ...text
        .replace(/[\u0000-\u001f]/g, " ")
        .replaceAll("→", "-")
        .replaceAll("−", "-"),
    ]
      .map((c) => {
        try {
          font.encodeText(c);
          return c;
        } catch {
          return "?";
        }
      })
      .join("");
  function wrap(text: string, w: number, size = 9.5, f: PDFFont = font) {
    const lines: string[] = [];
    let row = "";
    for (const word of safe(text).split(/\s+/)) {
      if (row && f.widthOfTextAtSize(row + " " + word, size) > w) {
        lines.push(row);
        row = "";
      }
      let part = "";
      for (const c of word) {
        if (part && f.widthOfTextAtSize(part + c, size) > w) {
          lines.push(part);
          part = "";
        }
        part += c;
      }
      row += (row ? " " : "") + part;
    }
    if (row) lines.push(row);
    return lines.length ? lines : [""];
  }
  function text(
    value: string,
    x: number,
    yy: number,
    size = 9.5,
    f = font,
    color = INK,
  ) {
    page.drawText(safe(value), { x, y: yy, size, font: f, color });
  }
  function newPage() {
    page = pdf.addPage([595.28, 841.89]);
    page.drawImage(logo, {
      x: left,
      y: 748,
      width: 94,
      height: (94 * logo.height) / logo.width,
    });
    text(
      kind,
      right - bold.widthOfTextAtSize(safe(kind), 17),
      789,
      17,
      bold,
      BLUE,
    );
    text(
      number,
      right - font.widthOfTextAtSize(safe(number), 10),
      770,
      10,
      font,
      MUTED,
    );
    const d = new Date(date).toLocaleDateString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
    });
    text(d, right - font.widthOfTextAtSize(d, 9), 753, 9, font, MUTED);
    page.drawRectangle({ x: left, y: 734, width, height: 2, color: BLUE });
    y = 714;
  }
  function space(height: number) {
    if (y - height < bottom) newPage();
  }
  function paragraph(
    value: string,
    {
      size = 9.5,
      strong = false,
      color = INK,
      gap = 6,
    }: {
      size?: number;
      strong?: boolean;
      color?: ReturnType<typeof rgb>;
      gap?: number;
    } = {},
  ) {
    for (const p of value.split(/\r?\n/)) {
      for (const line of wrap(p, width, size, strong ? bold : font)) {
        space(size + 6);
        text(line, left, y, size, strong ? bold : font, color);
        y -= size + 5;
      }
    }
    y -= gap;
  }
  function section(title: string) {
    space(47);
    y -= 4;
    page.drawRectangle({ x: left, y: y - 8, width, height: 25, color: PALE });
    text(title, left + 9, y, 10, bold, BLUE);
    y -= 28;
  }
  type Column = { label: string; width: number; right?: boolean };
  function table(columns: Column[], rows: string[][], group?: string) {
    const heading = (continued = false) => {
      if (continued && group)
        paragraph(group + " (continuación)", { strong: true, color: BLUE });
      space(29);
      page.drawRectangle({ x: left, y: y - 9, width, height: 25, color: BLUE });
      let x = left;
      for (const col of columns) {
        text(col.label, x + 5, y, 8.5, bold, rgb(1, 1, 1));
        x += col.width;
      }
      y -= 31;
    };
    space(68);
    heading();
    rows.forEach((values, index) => {
      const cells = values.map((v, i) =>
          v
            .split(/\r?\n/)
            .flatMap((part) => wrap(part, columns[i].width - 10, 9)),
        ),
        count = Math.max(...cells.map((c) => c.length), 1);
      let offset = 0;
      while (offset < count) {
        const remaining = count - offset,
          need = Math.min(remaining, 5) * 13 + 12;
        if (y - need < bottom) {
          newPage();
          heading(true);
        }
        const capacity = Math.max(1, Math.floor((y - bottom - 10) / 13)),
          chunk = Math.min(capacity, remaining),
          height = chunk * 13 + 10;
        if (index % 2 === 0)
          page.drawRectangle({
            x: left,
            y: y - height + 7,
            width,
            height,
            color: PALE,
          });
        let x = left;
        columns.forEach((col, i) => {
          cells[i]
            .slice(offset, offset + chunk)
            .forEach((line, j) =>
              text(
                line,
                col.right
                  ? x + col.width - 5 - font.widthOfTextAtSize(line, 9)
                  : x + 5,
                y - j * 13,
                9,
              ),
            );
          x += col.width;
        });
        y -= height;
        offset += chunk;
        if (offset < count) {
          newPage();
          heading(true);
        }
      }
      page.drawLine({
        start: { x: left, y: y + 4 },
        end: { x: right, y: y + 4 },
        thickness: 0.3,
        color: LINE,
      });
    });
    y -= 8;
  }
  function total(label: string, amount: string, currency: string) {
    space(62);
    page.drawRectangle({ x: left, y: y - 40, width, height: 54, color: BLUE });
    text(label, left + 12, y - 10, 11, bold, rgb(1, 1, 1));
    const amountText = currency + " " + pdfMoney(amount),
      lines = wrap(amountText, width - 120, 14, bold);
    lines.forEach((l, i) =>
      text(
        l,
        right - 12 - bold.widthOfTextAtSize(l, 14),
        y - 10 - i * 18,
        14,
        bold,
        rgb(1, 1, 1),
      ),
    );
    y -= 65;
  }
  async function save() {
    const pages = pdf.getPages();
    pages.forEach((p, i) => {
      const label = `${kind} · ${number} · Página ${i + 1} de ${pages.length}`;
      p.drawLine({
        start: { x: left, y: 43 },
        end: { x: right, y: 43 },
        thickness: 0.5,
        color: LINE,
      });
      p.drawText(safe(label), { x: left, y: 28, size: 8, font, color: MUTED });
    });
    return pdf.save({ useObjectStreams: false });
  }
  newPage();
  return { paragraph, section, table, total, save };
}
