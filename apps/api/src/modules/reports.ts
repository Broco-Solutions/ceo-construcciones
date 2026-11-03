import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { z } from "zod";
import { Actor, requireWork } from "../core/auth";
import { transaction } from "../core/db";
import { ApiError } from "../core/errors";

const Decimal = Prisma.Decimal.clone({ precision: 80 });
export const filterSchema = z
  .object({
    workId: z.string().min(1).max(100),
    categoryId: z.string().min(1).max(100).optional(),
    materialId: z.string().min(1).max(100).optional(),
    versionId: z.string().min(1).max(100).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
type Filter = z.infer<typeof filterSchema>;
type QuantityField =
  | "planned"
  | "requested"
  | "purchased"
  | "consumed"
  | "received"
  | "physical"
  | "reserved";
type Aggregate = {
  materialId: string;
  quantities: Record<QuantityField, Prisma.Decimal>;
};

export async function materialReport(actor: Actor, filter: Filter) {
  await requireWork(actor, filter.workId);
  return transaction(async (tx) => {
    const version = filter.versionId
      ? await tx.budgetVersion.findUnique({
          where: { id: filter.versionId },
          select: {
            id: true,
            budget: { select: { workId: true } },
            number: true,
            status: true,
          },
        })
      : await tx.budgetVersion.findFirst({
          where: { budget: { workId: filter.workId }, status: "REFERENCE" },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            budget: { select: { workId: true } },
            number: true,
            status: true,
          },
        });
    if (
      filter.versionId &&
      (!version || version.budget.workId !== filter.workId)
    )
      throw new ApiError(
        422,
        "INVALID_VERSION",
        "La versión debe pertenecer a la obra consultada",
      );
    const planned = version
      ? await tx.budgetMaterial.findMany({
          where: {
            versionId: version.id,
            ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
            ...(filter.materialId ? { materialId: filter.materialId } : {}),
          },
          select: { materialId: true, categoryId: true, quantity: true },
        })
      : [];
    const requested = await tx.requestLine.findMany({
      where: {
        ...(filter.materialId ? { materialId: filter.materialId } : {}),
        request: {
          workId: filter.workId,
          status: { in: ["SUBMITTED", "PROCESSING", "COMPLETED"] },
          ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        },
      },
      select: { materialId: true, quantity: true },
    });
    const purchased = await tx.purchaseOrderLine.findMany({
      where: {
        ...(filter.materialId ? { materialId: filter.materialId } : {}),
        order: {
          workId: filter.workId,
          status: { in: ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"] },
          ...(filter.categoryId
            ? { request: { categoryId: filter.categoryId } }
            : {}),
        },
      },
      select: { materialId: true, quantity: true },
    });
    const consumed = await tx.stockMovement.findMany({
      where: {
        workId: filter.workId,
        type: "CONSUMPTION",
        ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
        ...(filter.materialId ? { materialId: filter.materialId } : {}),
      },
      select: { materialId: true, quantity: true },
    });
    const received = await tx.receiptLine.findMany({
      where: {
        ...(filter.materialId
          ? { orderLine: { materialId: filter.materialId } }
          : {}),
        receipt: {
          order: {
            workId: filter.workId,
            ...(filter.categoryId
              ? { request: { categoryId: filter.categoryId } }
              : {}),
          },
        },
      },
      select: { quantity: true, orderLine: { select: { materialId: true } } },
    });
    // A balance belongs to an obra/location, never to a construction category.
    const balances = filter.categoryId
      ? []
      : await tx.stockBalance.findMany({
          where: {
            location: { workId: filter.workId },
            ...(filter.materialId ? { materialId: filter.materialId } : {}),
          },
          select: { materialId: true, physical: true, reserved: true },
        });
    const all = new Map<string, Aggregate>();
    function add(
      materialId: string,
      field: QuantityField,
      value: Prisma.Decimal,
    ) {
      let row = all.get(materialId);
      if (!row) {
        row = {
          materialId,
          quantities: {
            planned: new Decimal(0),
            requested: new Decimal(0),
            purchased: new Decimal(0),
            consumed: new Decimal(0),
            received: new Decimal(0),
            physical: new Decimal(0),
            reserved: new Decimal(0),
          },
        };
        all.set(materialId, row);
      }
      row.quantities[field] = row.quantities[field].add(value.toString());
    }
    for (const row of planned) add(row.materialId, "planned", row.quantity);
    for (const row of requested) add(row.materialId, "requested", row.quantity);
    for (const row of purchased) add(row.materialId, "purchased", row.quantity);
    for (const row of consumed) add(row.materialId, "consumed", row.quantity);
    for (const row of received)
      add(row.orderLine.materialId, "received", row.quantity);
    for (const row of balances) {
      add(row.materialId, "physical", row.physical);
      add(row.materialId, "reserved", row.reserved);
    }
    const materials = await tx.material.findMany({
      where: { id: { in: [...all.keys()] } },
      select: {
        id: true,
        code: true,
        name: true,
        unitId: true,
        unit: { select: { code: true, name: true, symbol: true } },
      },
    });
    const details = new Map(
      materials.map((material) => [material.id, material]),
    );
    const rows = [...all.values()]
      .map(({ materialId, quantities: q }) => {
        const material = details.get(materialId)!;
        return {
          materialId,
          code: material.code,
          name: material.name,
          unitId: material.unitId,
          // Abreviatura visible; el código automático UNI-### no se muestra al usuario.
          unit:
            material.unit.symbol ??
            (/^UNI-\d+$/.test(material.unit.code)
              ? material.unit.name
              : material.unit.code),
          planned: version ? q.planned.toFixed() : null,
          requested: q.requested.toFixed(),
          purchased: q.purchased.toFixed(),
          consumed: q.consumed.toFixed(),
          received: q.received.toFixed(),
          physical: filter.categoryId ? null : q.physical.toFixed(),
          reserved: filter.categoryId ? null : q.reserved.toFixed(),
          available: filter.categoryId
            ? null
            : q.physical.sub(q.reserved).toFixed(),
          remainingToRequest: version
            ? q.planned.sub(q.requested).toFixed()
            : null,
          remainingToPurchase: version
            ? q.planned.sub(q.purchased).toFixed()
            : null,
          consumptionVariance: version
            ? q.consumed.sub(q.planned).toFixed()
            : null,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
    return {
      workId: filter.workId,
      categoryId: filter.categoryId ?? null,
      version: version
        ? { id: version.id, number: version.number, status: version.status }
        : null,
      warnings: [
        ...(!version
          ? ["SIN_VERSION_DE_REFERENCIA: previsto y desvíos sin calcular"]
          : []),
        ...(filter.categoryId
          ? [
              "STOCK_SIN_DISTRIBUCION_POR_RUBRO: saldos físicos/disponibles no atribuibles al rubro",
            ]
          : []),
      ],
      definitions: {
        requested:
          "Pedidos enviados/en proceso/completados, sin borradores ni anulados",
        purchased:
          "Cantidades en OC emitidas, parciales o recibidas; excluye borradores/anuladas",
        received:
          "Recepciones confirmadas de OC atribuidas a la obra, cualquiera sea su destino físico",
        consumed: "Movimientos de consumo registrados en la obra",
        available:
          "Físico menos reservado en la ubicación de la obra; sin existencias de galpón/patio",
        categoryAttribution:
          "Actividad de obra para previsto; rubro del pedido para solicitado/comprado/recibido; rubro explícito del movimiento para consumo. Registros sin rubro sólo en el total de obra.",
      },
      rows,
    };
  });
}

export async function reportWorkbook(
  report: Awaited<ReturnType<typeof materialReport>>,
) {
  const book = new ExcelJS.Workbook();
  book.creator = "CEO Construcciones";
  const sheet = book.addWorksheet("Materiales");
  const columns = [
    ["code", "Código"],
    ["name", "Material"],
    ["unit", "Unidad"],
    ["planned", "Previsto"],
    ["requested", "Pedido"],
    ["purchased", "Comprado"],
    ["received", "Recibido"],
    ["consumed", "Consumido"],
    ["physical", "Físico en obra"],
    ["reserved", "Reservado en obra"],
    ["available", "Disponible en obra"],
    ["remainingToRequest", "Previsto menos pedido"],
    ["remainingToPurchase", "Previsto menos comprado"],
    ["consumptionVariance", "Consumido menos previsto"],
  ];
  sheet.columns = columns.map(([key, header]) => ({
    key,
    header,
    width: key === "name" ? 45 : 25,
    style: { numFmt: "@" },
  }));
  for (const row of report.rows)
    sheet.addRow(
      Object.fromEntries(
        columns.map(([key]) => [
          key,
          row[key as keyof typeof row] ?? "Sin dato",
        ]),
      ),
    );
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const notes = book.addWorksheet("Criterios");
  notes.addRows([
    ["Obra", report.workId],
    ["Rubro", report.categoryId ?? "Todos"],
    ["Versión", report.version?.id ?? "Sin referencia"],
    [
      "Cantidades",
      "Decimales como texto para conservar precisión; sin fórmulas ni importes económicos",
    ],
    ...report.warnings.map((warning) => ["Advertencia", warning]),
    ...Object.entries(report.definitions),
  ]);
  notes.getColumn(1).width = 28;
  notes.getColumn(2).width = 110;
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function handlerReports(
  request: Request,
  actor: Actor,
  segments: string[],
): Promise<Response | null> {
  const isReport = segments[0] === "reports";
  const isExport =
    segments[0] === "exports" && segments[1] === "materials-report";
  if (!isReport && !isExport) return null;
  if (request.method !== "GET")
    throw new ApiError(
      405,
      "METHOD_NOT_ALLOWED",
      "Sólo se permiten consultas de informes",
    );
  if (
    !(isExport && segments.length === 2) &&
    !(
      isReport &&
      segments[1] === "materials" &&
      (segments.length === 2 ||
        (segments.length === 3 && segments[2] === "export"))
    )
  )
    throw new ApiError(404, "NOT_FOUND", "Informe inexistente");
  const parsed = filterSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success)
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Filtros inválidos",
      parsed.error.flatten(),
    );
  const filter = parsed.data;
  const report = await materialReport(actor, filter);
  if (isExport || segments[2] === "export")
    return new Response(await reportWorkbook(report), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition":
          'attachment; filename="seguimiento-materiales.xlsx"',
      },
    });
  return Response.json({
    data: {
      ...report,
      rows: report.rows.slice(
        (filter.page - 1) * filter.pageSize,
        filter.page * filter.pageSize,
      ),
    },
    pagination: {
      page: filter.page,
      pageSize: filter.pageSize,
      total: report.rows.length,
    },
  });
}
