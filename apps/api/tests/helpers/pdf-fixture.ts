import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  calculateCommercial,
  type EditorContent,
} from "../../src/modules/commercial-domain";
export function pdfFixture(count = 1) {
  const content: EditorContent = {
    currency: "ARS",
    taxBasis: "EXCLUDED",
    markup: "50",
    conditions:
      "Entrega según alcance registrado.\nCondición extensa de demostración sintética, sin datos privados.",
    exclusions: "No incluye tareas ajenas a las partidas.",
    observations: "",
    deadline: "Plazo a coordinar",
    lines: Array.from({ length: count }, (_, i) => ({
      key: "line-" + i,
      itemId: null,
      code: "P-" + i,
      name:
        count === 1
          ? "Partida sintética m² y m³"
          : "Partida " +
            i +
            " · Mampostería, aislación y terminación con descripción extensa ".repeat(
              4,
            ),
      categoryId: "cat-" + Math.floor(i / 9),
      category: "Rubro " + Math.floor(i / 9),
      unitId: "u",
      unit: i % 2 ? "m²" : "m³",
      quantity: "10",
      laborUnitCost: "1200",
      directUnitCost: "800",
      status: "ACTIVE" as const,
      materials: [],
    })),
  };
  return {
    content,
    calculation: calculateCommercial(content),
    header: {
      name: "Presupuesto sintético de pruebas",
      client: { name: "Cliente de prueba", taxId: null, address: null },
      work: { name: "Obra sintética", address: null },
      conditions: content.conditions,
      exclusions: content.exclusions,
      observations: content.observations,
      deadline: content.deadline,
      issuedAt: "2026-10-01T12:00:00.000Z",
    },
  };
}

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
export async function pdfEvidence(name: string, bytes: Uint8Array) {
  if (process.env.CEO_PDF_EVIDENCE_DIR) {
    await mkdir(process.env.CEO_PDF_EVIDENCE_DIR, {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(join(process.env.CEO_PDF_EVIDENCE_DIR, name), bytes, {
      mode: 0o600,
    });
  }
}
