import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { db } from "../core/db";
import { type Actor, requireRoles } from "../core/auth";
import { ApiError } from "../core/errors";
export async function xlsxResponse(
  name: string,
  columns: string[],
  rows: unknown[][],
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CEO Construcciones";
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  sheet.addRow(columns);
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((c) => {
    c.width = 24;
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(Buffer.from(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${name}.xlsx"`,
    },
  });
}
export async function handlerExports(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  if (s[0] !== "exports" || s.length !== 2 || request.method !== "GET")
    return null;
  const kind = s[1];
  if (
    ![
      "materials",
      "suppliers",
      "prices",
      "works",
      "stock",
      "purchase-orders",
    ].includes(kind)
  )
    return null;
  if (["suppliers", "prices", "purchase-orders"].includes(kind))
    requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
  // Explicit limit prevents an unbounded server allocation; larger archives use pg_dump.
  const max = 10000;
  if (kind === "materials") {
    if ((await db.material.count()) > max)
      throw new ApiError(
        422,
        "EXPORT_LIMIT",
        "Filtre o solicite exportación completa a Gerencia",
      );
    const rows = await db.material.findMany({
      include: { unit: true, category: true },
      orderBy: { code: "asc" },
    });
    return xlsxResponse(
      kind,
      ["Código", "Material", "Unidad", "Rubro", "Mínimo", "Activo"],
      rows.map((r) => [
        r.code,
        r.name,
        r.unit.code,
        r.category?.name || "",
        r.minimum.toString(),
        r.active,
      ]),
    );
  }
  if (kind === "suppliers") {
    if ((await db.supplier.count()) > max)
      throw new ApiError(422, "EXPORT_LIMIT", "Exportación excede 10000 filas");
    const rows = await db.supplier.findMany({ orderBy: { code: "asc" } });
    return xlsxResponse(
      kind,
      [
        "Código",
        "Proveedor",
        "CUIT",
        "Email",
        "Teléfono",
        "Dirección",
        "Activo",
      ],
      rows.map((r) => [
        r.code,
        r.name,
        r.taxId || "",
        r.email || "",
        r.phone || "",
        r.address || "",
        r.active,
      ]),
    );
  }
  if (kind === "prices") {
    if ((await db.materialPrice.count()) > max)
      throw new ApiError(422, "EXPORT_LIMIT", "Exportación excede 10000 filas");
    const rows = await db.materialPrice.findMany({
      include: { material: true, supplier: true, presentation: true },
      orderBy: { effectiveAt: "desc" },
    });
    return xlsxResponse(
      kind,
      [
        "Material",
        "Proveedor",
        "Presentación",
        "Precio",
        "Cantidad base",
        "Moneda",
        "Base impositiva",
        "Vigencia",
      ],
      rows.map((r) => [
        r.material.code,
        r.supplier?.code || "",
        r.presentation?.name || "",
        r.price.toString(),
        r.baseQuantity.toString(),
        r.currency,
        r.taxBasis,
        r.effectiveAt.toISOString(),
      ]),
    );
  }
  if (kind === "works") {
    const where: Prisma.WorkWhereInput =
      actor.role === "JEFE_OBRA"
        ? { assignments: { some: { userId: actor.id } } }
        : {};
    if ((await db.work.count({ where })) > max)
      throw new ApiError(422, "EXPORT_LIMIT", "Exportación excede 10000 filas");
    const rows = await db.work.findMany({ where, orderBy: { code: "asc" } });
    return xlsxResponse(
      kind,
      ["Código", "Obra", "Estado", "Responsable"],
      rows.map((r) => [r.code, r.name, r.status, r.managerId || ""]),
    );
  }
  if (kind === "stock") {
    const where: Prisma.StockBalanceWhereInput =
      actor.role === "JEFE_OBRA"
        ? {
            location: { work: { assignments: { some: { userId: actor.id } } } },
          }
        : {};
    if ((await db.stockBalance.count({ where })) > max)
      throw new ApiError(422, "EXPORT_LIMIT", "Exportación excede 10000 filas");
    const rows = await db.stockBalance.findMany({
      where,
      include: { material: { include: { unit: true } }, location: true },
    });
    return xlsxResponse(
      kind,
      [
        "Material",
        "Unidad",
        "Ubicación",
        "Físico",
        "Reservado",
        "Disponible",
        "Mínimo",
        "Alerta",
      ],
      rows.map((r) => [
        r.material.code,
        r.material.unit.code,
        r.location.code,
        r.physical.toString(),
        r.reserved.toString(),
        r.physical.minus(r.reserved).toString(),
        (r.minimum ?? r.material.minimum).toString(),
        r.physical.minus(r.reserved).lt(r.minimum ?? r.material.minimum),
      ]),
    );
  }
  if ((await db.purchaseOrderLine.count()) > max)
    throw new ApiError(422, "EXPORT_LIMIT", "Exportación excede 10000 filas");
  const rows = await db.purchaseOrderLine.findMany({
    include: {
      order: { include: { supplier: true, destination: true, work: true } },
      material: true,
    },
    orderBy: { order: { number: "asc" } },
  });
  return xlsxResponse(
    kind,
    [
      "OC",
      "Proveedor",
      "Obra",
      "Destino",
      "Estado",
      "Material",
      "Pedido",
      "Recibido",
      "Precio",
      "Cantidad base",
      "Moneda",
      "Base impositiva",
      "Factura referencia",
    ],
    rows.map((r) => [
      r.order.number,
      r.order.supplier.code,
      r.order.work?.code || "",
      r.order.destination.code,
      r.order.status,
      r.material.code,
      r.quantity.toString(),
      r.receivedQuantity.toString(),
      r.unitPrice.toString(),
      r.baseQuantity.toString(),
      r.order.currency,
      r.order.taxBasis,
      r.order.invoiceNumber || "",
    ]),
  );
}
