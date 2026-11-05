import type { Tx } from "../core/db";
import {
  documentV2,
  pdfMoney,
  pdfDecimal,
  pdfTax,
  pdfUnitPrice,
} from "./pdf-layout-v2";
export type OrderPresentation = {
  version: 2;
  number: number;
  date: string;
  status: string;
  currency: string;
  taxBasis: string;
  supplier: { name: string; taxId: string | null; address: string | null };
  destination: string;
  work: string | null;
  notes: string;
  lines: {
    name: string;
    code: string;
    unit: string;
    presentation: string;
    quantity: string;
    unitPrice: string;
    baseQuantity: string;
    amount: string | null;
  }[];
  total: string | null;
};
export async function publicOrderNotes(client: Tx, id: string) {
  const last = await client.auditLog.findFirst({
    where: {
      entityType: "PurchaseOrder",
      entityId: id,
      action: { in: ["PDF_VERSION", "PDF_NOTES_VISIBILITY"] },
    },
    orderBy: { createdAt: "desc" },
  });
  return (
    (last?.after as { notesPublic?: boolean } | null)?.notesPublic === true
  );
}
/** Capture only registered public values. No price lookup or economic recalculation. */
export async function orderPresentation(
  client: Tx,
  order: any,
  valued: any,
): Promise<OrderPresentation> {
  const [supplier, materials, presentations, notesPublic] = await Promise.all([
    client.supplier.findUniqueOrThrow({ where: { id: order.supplierId } }),
    client.material.findMany({
      where: { id: { in: order.lines.map((l: any) => l.materialId) } },
      include: { unit: true },
    }),
    client.presentation.findMany({
      where: {
        id: {
          in: order.lines.flatMap((l: any) =>
            l.presentationId ? [l.presentationId] : [],
          ),
        },
      },
    }),
    publicOrderNotes(client, order.id),
  ]);
  const byMaterial = new Map(materials.map((m) => [m.id, m])),
    byPresentation = new Map(presentations.map((p) => [p.id, p]));
  return {
    version: 2,
    number: order.number,
    date: order.createdAt.toISOString(),
    status: order.status,
    currency: order.currency,
    taxBasis: order.taxBasis,
    supplier: {
      name: supplier.name,
      taxId: supplier.taxId,
      address: supplier.address,
    },
    destination:
      order.destination.name +
      " · " +
      { WAREHOUSE: "Galpón", YARD: "Patio", WORK: "Obra" }[
        order.destination.kind as "WORK"
      ],
    work: order.work?.name ?? null,
    notes: notesPublic ? (order.notes ?? "") : "",
    lines: order.lines.map((l: any, i: number) => {
      const m = byMaterial.get(l.materialId)!;
      return {
        name: m.name,
        code: m.code,
        unit: m.unit.symbol ?? m.unit.code,
        presentation:
          byPresentation.get(l.presentationId)?.name ?? "Unidad base",
        quantity: l.quantity.toFixed(),
        unitPrice: l.unitPrice.toFixed(),
        baseQuantity: l.baseQuantity.toFixed(),
        amount: valued.lines[i].lineAmount ?? null,
      };
    }),
    total: valued.totalAmount ?? null,
  };
}
const labels: Record<string, string> = {
  DRAFT: "BORRADOR",
  ISSUED: "EMITIDA",
  CANCELLED: "CANCELADA",
  PARTIALLY_RECEIVED: "RECEPCIÓN PARCIAL",
  RECEIVED: "RECIBIDA",
};
export async function orderPdfV2(
  snapshot: OrderPresentation,
  currentStatus = snapshot.status,
) {
  const doc = await documentV2({
    kind: "ORDEN DE COMPRA",
    number: `OC-${snapshot.number}`,
    date: snapshot.date,
  });
  doc.paragraph(labels[currentStatus] ?? currentStatus, { strong: true });
  doc.section("Proveedor y entrega");
  doc.paragraph(snapshot.supplier.name, { strong: true });
  if (snapshot.supplier.taxId)
    doc.paragraph("CUIT: " + snapshot.supplier.taxId);
  if (snapshot.supplier.address)
    doc.paragraph("Domicilio: " + snapshot.supplier.address);
  doc.paragraph("Destino: " + snapshot.destination);
  doc.paragraph(
    snapshot.work ? "Obra: " + snapshot.work : "Compra general · sin obra",
  );
  doc.paragraph(`Moneda: ${snapshot.currency} · ${pdfTax(snapshot.taxBasis)}`);
  doc.table(
    [
      { label: "Material / presentación", width: 182 },
      { label: "Cantidad / un.", width: 74, right: true },
      { label: "Precio / base", width: 130, right: true },
      { label: "Importe", width: 125.28, right: true },
    ],
    snapshot.lines.map((l) => [
      `${l.code} · ${l.name}\n${l.presentation}`,
      `${pdfDecimal(l.quantity)} ${l.unit}`,
      `${pdfUnitPrice(l.unitPrice)} / ${pdfDecimal(l.baseQuantity)} ${l.unit}`,
      l.amount === null ? "Requiere política de redondeo" : pdfMoney(l.amount),
    ]),
  );
  if (snapshot.total !== null)
    doc.total("TOTAL", snapshot.total, snapshot.currency);
  else
    doc.paragraph(
      "Total no comparable: revisar política de redondeo de las fracciones indicadas.",
      { strong: true },
    );
  doc.paragraph(pdfTax(snapshot.taxBasis));
  if (snapshot.notes) {
    doc.section("Condiciones / observaciones para el proveedor");
    doc.paragraph(snapshot.notes);
  }
  doc.paragraph("Orden de compra. No es factura ni comprobante de pago.", {
    size: 8.5,
  });
  return doc.save();
}
