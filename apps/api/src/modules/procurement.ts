import { listSelection } from "./list-selection";
import { orderPresentation, orderPdfV2, publicOrderNotes, type OrderPresentation } from "./order-pdf-v2";
import { z } from "zod";
import {
  Prisma,
  PurchaseOrderStatus,
  RequestStatus,
  QuotationStatus,
} from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import { db, transaction, schemaCapabilities, type Tx } from "../core/db";
import { audit } from "../core/audit";
import { type Actor, requireRoles, requireWork } from "../core/auth";
import { ApiError } from "../core/errors";
import {
  id,
  text,
  decimal,
  money,
  currency,
  taxBasis,
  D,
  ok,
  parse,
  paging,
  listed,
  found,
  conflict,
  locationAccess,
  validMaterial,
  presentationCheck,
  uniqueLines,
} from "./shared";
import { idempotent, addPhysical } from "./inventory";
import { receptionAccess } from "./reception-access";
import { netNeedsInTransaction } from "./net-needs";
export const requestSchema = z
  .object({
    workId: id,
    categoryId: id,
    requiredAt: z.string().datetime(),
    notes: z.string().max(4000).optional(),
    coverageHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    lines: z
      .array(z.object({ materialId: id, quantity: decimal }).strict())
      .min(1)
      .max(500),
  })
  .strict();
export const commercialLine = z
  .object({
    materialId: id,
    presentationId: id.optional(),
    quantity: decimal,
    unitPrice: money,
    baseQuantity: decimal,
  })
  .strict();
export const quotationSchema = z
  .object({
    supplierId: id,
    requestId: id.optional(),
    currency,
    taxBasis,
    validUntil: z.string().datetime().optional(),
    deliveryTerms: text.optional(),
    notes: z.string().max(4000).optional(),
    lines: z.array(commercialLine).min(1).max(500),
  })
  .strict();
export const orderSchema = z
  .object({
    supplierId: id,
    workId: id.optional(),
    requestId: id.optional(),
    quotationId: id.optional(),
    destinationId: id,
    currency,
    taxBasis,
    notesPublic: z.boolean().optional(),
    notes: z.string().max(4000).optional(),
    lines: z.array(commercialLine).min(1).max(500),
  })
  .strict();
export const receiptSchema = z
  .object({
    locationId: id,
    deliveryNote: text,
    lines: z
      .array(z.object({ orderLineId: id, quantity: decimal }).strict())
      .min(1)
      .max(500),
  })
  .strict();
async function supplier(tx: Tx, supplierId: string) {
  const s = found(
    await tx.supplier.findUnique({ where: { id: supplierId } }),
    "Proveedor",
  );
  if (!s.active) conflict("Proveedor inactivo");
  return s;
}
async function commercialCheck(tx: Tx, b: z.infer<typeof quotationSchema>) {
  await supplier(tx, b.supplierId);
  uniqueLines(b.lines);
  for (const l of b.lines) await presentationCheck(tx, l, b.supplierId);
  if (b.requestId) {
    const r = found(
      await tx.materialRequest.findUnique({
        where: { id: b.requestId },
        include: { lines: true },
      }),
    );
    if (["CANCELLED", "DRAFT"].includes(r.status))
      conflict("Pedido no disponible para compras");
    for (const l of b.lines)
      if (!r.lines.some((x) => x.materialId === l.materialId))
        conflict("Material no incluido en pedido");
    return r;
  }
  return null;
}
const orderInclude = {
  lines: true,
  createdBy: { select: { name: true } },
  invoiceLoadedBy: { select: { name: true } },
  supplier: { select: { id: true, code: true, name: true } },
  destination: { select: { id: true, code: true, name: true, kind: true } },
  work: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PurchaseOrderInclude;
const receiptInclude = {
  lines: { include: { orderLine: { select: { material: { select: {
    code: true, name: true, unit: { select: { code: true, name: true, symbol: true } },
  } } } } } },
  receivedBy: { select: { name: true } },
  location: { select: { id: true, code: true, name: true, kind: true } },
} satisfies Prisma.ReceiptInclude;

/** Return only exact registered amounts; no implicit rounding or extra tax. */
export function exactOrderAmount(line: {
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  baseQuantity: Prisma.Decimal;
}): Prisma.Decimal | null {
  const numerator = line.quantity.mul(line.unitPrice);
  const amount = numerator.div(line.baseQuantity);
  return amount.decimalPlaces() <= 8 &&
    amount.mul(line.baseQuantity).eq(numerator)
    ? amount
    : null;
}

export async function createOrder(
  tx: Tx,
  actor: Actor,
  b: z.infer<typeof orderSchema>,
) {
  const r = await commercialCheck(tx, b);
  const dest = await locationAccess(actor, b.destinationId, tx);
  if (b.workId) await requireWork(actor, b.workId, tx);
  if (!b.workId && dest.workId)
    conflict("Una OC general debe destinarse a galpón o patio");
  if (dest.workId && dest.workId !== b.workId) conflict("Destino de otra obra");
  if (r && r.workId !== b.workId) conflict("Pedido de otra obra");
  if (b.quotationId) {
    const q = found(
      await tx.quotation.findUnique({
        where: { id: b.quotationId },
        include: { lines: true },
      }),
    );
    if (
      q.supplierId !== b.supplierId ||
      q.requestId !== (b.requestId || null) ||
      q.status !== "SELECTED" ||
      q.currency !== b.currency ||
      q.taxBasis !== b.taxBasis
    )
      conflict("Cotización incompatible o sin selección");
    for (const l of b.lines) {
      const ql = q.lines.find((x) => x.materialId === l.materialId);
      if (
        !ql ||
        !ql.unitPrice.eq(l.unitPrice) ||
        !ql.baseQuantity.eq(l.baseQuantity) ||
        ql.presentationId !== (l.presentationId || null)
      )
        conflict("Precio o presentación difiere de cotización seleccionada");
    }
  }
  const { lines, notesPublic, ...data } = b;
  const order = await tx.purchaseOrder.create({
    data: { ...data, createdById: actor.id, lines: { create: lines } },
    include: orderInclude,
  });
  if ((await schemaCapabilities()).coverage)
    await tx.orderAmountPolicy.create({ data: { orderId: order.id } });
  await audit(tx, actor, "CREATE", "PurchaseOrder", order.id, b);
  await audit(tx, actor, "PDF_VERSION", "PurchaseOrder", order.id, {version:2,notesPublic:notesPublic===true});
  return publicOrder(order, actor, tx);
}
async function publicOrder(
  order: Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>,
  actor: Actor,
  client: Tx | typeof db = db,
) {
  const { createdBy, invoiceLoadedBy, ...data } = order;
  if (actor.role !== "JEFE_OBRA") {
    const policy = (await schemaCapabilities()).coverage
      ? await client.orderAmountPolicy.findUnique({
          where: { orderId: order.id },
        })
      : null;
    const amounts = order.lines.map((l) =>
      policy
        ? l.quantity
            .mul(l.unitPrice)
            .div(l.baseQuantity)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : exactOrderAmount(l),
    );
    const allExact = amounts.every((amount) => amount !== null);
    return {
      ...data,
      createdByName: createdBy.name,
      invoiceLoadedByName: invoiceLoadedBy?.name ?? null,
      lines: order.lines.map((line, index) => ({
        ...line,
        pendingQuantity: line.quantity.minus(line.receivedQuantity),
        lineAmount: amounts[index]?.toFixed() ?? null,
      })),
      totalAmount: allExact
        ? amounts
            .reduce<Prisma.Decimal>(
              (total, amount) => total.plus(amount!),
              D(0),
            )
            .toFixed()
        : null,
      amountWarning: allExact ? null : "ROUNDING_POLICY_REQUIRED",
    };
  }
  return {
    id: order.id,
    number: order.number,
    workId: order.workId,
    requestId: order.requestId,
    destinationId: order.destinationId,
    destination: order.destination,
    createdByName: createdBy.name,
    status: order.status,
    createdAt: order.createdAt,
    lines: order.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      quantity: l.quantity,
      receivedQuantity: l.receivedQuantity,
      pendingQuantity: l.quantity.minus(l.receivedQuantity),
    })),
  };
}
function publicReceipt(
  r: Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>,
) {
  return {
    id: r.id,
    orderId: r.orderId,
    locationId: r.locationId,
    location: r.location,
    deliveryNote: r.deliveryNote,
    receivedById: r.receivedById,
    actorName: r.receivedBy.name,
    createdAt: r.createdAt,
    lines: r.lines.map(({ orderLine, ...line }) => ({
      ...line, materialCode: orderLine.material.code,
      materialName: orderLine.material.name,
      unit: orderLine.material.unit.symbol ?? orderLine.material.unit.code,
    })),
  };
}
async function orderAccess(actor: Actor, key: string) {
  const o = found(
    await db.purchaseOrder.findUnique({
      where: { id: key },
      include: orderInclude,
    }),
    "Orden",
  );
  if (actor.role === "JEFE_OBRA") {
    if (!o.workId) throw new ApiError(403, "FORBIDDEN", "Orden no autorizada");
    await requireWork(actor, o.workId);
    const loc = found(
      await db.location.findUnique({ where: { id: o.destinationId } }),
    );
    if (loc.workId !== o.workId)
      throw new ApiError(
        403,
        "FORBIDDEN",
        "La orden no está destinada a su obra",
      );
  }
  return o;
}
export async function handlerProcurement(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  const [resource, key, action] = s;
  const method = request.method;
  const q = new URL(request.url).searchParams;
  const p = paging(request);
  if (resource === "requests") {
    if (method === "GET" && key && action === "history" && s.length === 3) {
      const r = found(
        await db.materialRequest.findUnique({ where: { id: key } }),
      );
      await requireWork(actor, r.workId);
      const where = { entityType: "MaterialRequest", entityId: key };
      const [data, total] = await db.$transaction([
        db.auditLog.findMany({
          where,
          skip: p.skip,
          take: p.take,
          include: { actor: { select: { name: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        db.auditLog.count({ where }),
      ]);
      return listed(
        data.map(({ actor: historyActor, ...entry }) => ({
          ...entry,
          actorName: historyActor?.name ?? null,
        })),
        total,
        p,
      );
    }
    if (method === "GET" && s.length <= 2) {
      if (key) {
        const r = found(
          await db.materialRequest.findUnique({
            where: { id: key },
            include: { lines: true },
          }),
        );
        await requireWork(actor, r.workId);
        return ok(r);
      }
      const where: Prisma.MaterialRequestWhereInput = {
        ...listSelection(q),
        workId: q.get("workId") || undefined,
        categoryId: q.get("categoryId") || undefined,
        status: q.has("status")
          ? z.nativeEnum(RequestStatus).parse(q.get("status"))
          : undefined,
      };
      if (actor.role === "JEFE_OBRA")
        where.work = { assignments: { some: { userId: actor.id } } };
      const [data, total] = await db.$transaction([
        db.materialRequest.findMany({
          where,
          include: { lines: true },
          skip: p.skip,
          take: p.take,
          orderBy: { createdAt: "desc" },
        }),
        db.materialRequest.count({ where }),
      ]);
      return listed(data, total, p);
    }
    if (method === "POST" && !key) {
      requireRoles(actor, "GERENCIA", "COMPRAS", "JEFE_OBRA");
      const b = await parse(request, requestSchema);
      await requireWork(actor, b.workId);
      uniqueLines(b.lines);
      const createRequest = async (tx: Tx) => {
        await requireWork(actor, b.workId, tx);
        if (
          b.coverageHash &&
          (await netNeedsInTransaction(tx, b.workId)).coverageHash !==
            b.coverageHash
        )
          throw new ApiError(
            409,
            "COVERAGE_CHANGED",
            "Cambió la cobertura de materiales. Revisá nuevamente la sugerencia antes de confirmar.",
          );
        for (const l of b.lines) await validMaterial(tx, l.materialId);
        const { lines, coverageHash, ...data } = b;
        const r = await tx.materialRequest.create({
          data: {
            ...data,
            requestedById: actor.id,
            status: "SUBMITTED",
            lines: { create: lines },
          },
          include: { lines: true },
        });
        await audit(tx, actor, "CREATE", "MaterialRequest", r.id, b);
        return r;
      };
      return ok(
        request.headers.has("idempotency-key")
          ? await idempotent(
              actor,
              "material-request",
              request.headers.get("idempotency-key")!,
              b,
              createRequest,
            )
          : await transaction(createRequest),
        201,
      );
    }
    if (method === "POST" && key && action === "status" && s.length === 3) {
      requireRoles(actor, "GERENCIA", "COMPRAS");
      const b = await parse(
        request,
        z
          .object({ status: z.enum(["PROCESSING", "COMPLETED", "CANCELLED"]) })
          .strict(),
      );
      return ok(
        await transaction(async (tx) => {
          const r = found(
            await tx.materialRequest.findUnique({ where: { id: key } }),
          );
          const transitions: Record<string, string[]> = {
            SUBMITTED: ["PROCESSING", "CANCELLED"],
            PROCESSING: ["COMPLETED", "CANCELLED"],
          };
          if (!transitions[r.status]?.includes(b.status))
            conflict("Transición de pedido no permitida");
          if (b.status === "CANCELLED") {
            const reservations = await tx.reservation.count({
              where: { requestLine: { requestId: key }, status: "ACTIVE" },
            });
            const orders = await tx.purchaseOrder.count({
              where: { requestId: key, status: { not: "CANCELLED" } },
            });
            if (reservations || orders)
              conflict(
                "Libere reservas y anule órdenes vinculadas antes de cancelar",
              );
          }
          const updated = await tx.materialRequest.update({
            where: { id: key },
            data: b,
          });
          await audit(tx, actor, "STATUS", "MaterialRequest", key, {
            from: r.status,
            to: b.status,
          });
          return updated;
        }),
      );
    }
    if (method === "GET" && key && action === "needs" && s.length === 3) {
      const r = found(
        await db.materialRequest.findUnique({
          where: { id: key },
          include: { lines: true },
        }),
      );
      await requireWork(actor, r.workId);
      const version = await db.budgetVersion.findFirst({
        where: { budget: { workId: r.workId }, status: "REFERENCE" },
        include: { materials: true },
      });
      const requests = await db.requestLine.findMany({
        where: { request: { workId: r.workId, status: { not: "CANCELLED" } } },
      });
      const locations =
        actor.role === "JEFE_OBRA"
          ? { work: { assignments: { some: { userId: actor.id } } } }
          : {};
      const balances = await db.stockBalance.findMany({
        where: {
          location: locations,
          materialId: { in: r.lines.map((l) => l.materialId) },
        },
      });
      return ok({
        versionId: version?.id || null,
        lines: r.lines.map((l) => ({
          materialId: l.materialId,
          requested: l.quantity,
          planned:
            version?.materials
              .filter((m) => m.materialId === l.materialId)
              .reduce((a, m) => a.plus(m.quantity), D(0))
              .toString() ?? null,
          alreadyRequested: requests
            .filter((x) => x.materialId === l.materialId)
            .reduce((a, m) => a.plus(m.quantity), D(0))
            .toString(),
          availability: balances
            .filter((x) => x.materialId === l.materialId)
            .map((x) => ({
              locationId: x.locationId,
              physical: x.physical,
              reserved: x.reserved,
              available: x.physical.minus(x.reserved),
            })),
        })),
      });
    }
  }
  if (resource === "quotations") {
    requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
    if (method === "GET" && s.length <= 2) {
      if (key)
        return ok(
          found(
            await db.quotation.findUnique({
              where: { id: key },
              include: { lines: true },
            }),
          ),
        );
      const where = {
        requestId: q.get("requestId") || undefined,
        supplierId: q.get("supplierId") || undefined,
        status: q.has("status")
          ? z.nativeEnum(QuotationStatus).parse(q.get("status"))
          : undefined,
      };
      const [data, total] = await db.$transaction([
        db.quotation.findMany({
          where,
          include: { lines: true },
          skip: p.skip,
          take: p.take,
          orderBy: { createdAt: "desc" },
        }),
        db.quotation.count({ where }),
      ]);
      return listed(data, total, p);
    }
    if (method === "GET" && key && action === "comparison" && s.length === 3) {
      const quotes = await db.quotation.findMany({
        where: { requestId: key, status: { not: "REJECTED" } },
        include: {
          lines: { orderBy: [{ materialId: "asc" }, { id: "asc" }] },
          supplier: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const bases = new Set(quotes.map((x) => `${x.currency}:${x.taxBasis}`));
      const comparable =
        bases.size === 1 && quotes.every((x) => x.taxBasis !== "UNSPECIFIED");
      return ok({
        requestId: key,
        comparable,
        reason: comparable
          ? null
          : "Monedas o bases impositivas distintas/no especificadas; sin ranking monetario",
        quotations: quotes.map((x) => ({
          ...x,
          lines: x.lines.map((l) => ({
            ...l,
            baseUnitPrice: l.unitPrice.div(l.baseQuantity).toString(),
          })),
        })),
      });
    }
    requireRoles(actor, "GERENCIA", "COMPRAS");
    if (method === "POST" && !key) {
      const b = await parse(request, quotationSchema);
      return ok(
        await transaction(async (tx) => {
          await commercialCheck(tx, b);
          const { lines, ...data } = b;
          const r = await tx.quotation.create({
            data: { ...data, status: "RECEIVED", lines: { create: lines } },
            include: { lines: true },
          });
          await audit(tx, actor, "CREATE", "Quotation", r.id, b);
          return r;
        }),
        201,
      );
    }
    if (method === "POST" && key && action === "select" && s.length === 3) {
      return ok(
        await transaction(async (tx) => {
          const quote = found(
            await tx.quotation.findUnique({ where: { id: key } }),
          );
          if (!["RECEIVED", "SELECTED"].includes(quote.status))
            conflict("Cotización no seleccionable");
          if (quote.validUntil && quote.validUntil < new Date())
            conflict("Cotización vencida");
          if (quote.requestId)
            await tx.quotation.updateMany({
              where: {
                requestId: quote.requestId,
                status: "SELECTED",
                id: { not: key },
              },
              data: {
                status: "RECEIVED",
                selectedAt: null,
                selectedById: null,
              },
            });
          const r = await tx.quotation.update({
            where: { id: key },
            data: {
              status: "SELECTED",
              selectedAt: new Date(),
              selectedById: actor.id,
            },
          });
          await audit(tx, actor, "SELECT", "Quotation", key);
          return r;
        }),
      );
    }
  }
  if (resource === "purchase-orders") {
    if (method === "GET" && key && action === "history" && s.length === 3) {
      requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
      await orderAccess(actor, key);
      const where: Prisma.AuditLogWhereInput = {
        OR: [
          { entityType: "PurchaseOrder", entityId: key },
          {
            entityType: "Receipt",
            action: "RECEIVE",
            after: { path: ["orderId"], equals: key },
          },
        ],
      };
      const [data, total] = await db.$transaction([
        db.auditLog.findMany({
          where,
          skip: p.skip,
          take: p.take,
          include: { actor: { select: { name: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        }),
        db.auditLog.count({ where }),
      ]);
      return listed(
        data.map(({ actor: historyActor, ...entry }) => ({
          ...entry,
          actorName: historyActor?.name ?? null,
        })),
        total,
        p,
      );
    }
    if (method === "GET" && s.length === 1) {
      const where: Prisma.PurchaseOrderWhereInput = {
        ...listSelection(q),
        workId: q.get("workId") || undefined,
        supplierId: q.get("supplierId") || undefined,
        requestId: q.get("requestId") || undefined,
        quotationId: q.get("quotationId") || undefined,
        destinationId: q.get("destinationId") || undefined,
        status: q.has("status")
          ? z.nativeEnum(PurchaseOrderStatus).parse(q.get("status"))
          : undefined,
      };
      if (actor.role === "JEFE_OBRA") {
        where.work = { assignments: { some: { userId: actor.id } } };
        where.destination = {
          work: { assignments: { some: { userId: actor.id } } },
        };
      }
      const [data, total] = await db.$transaction([
        db.purchaseOrder.findMany({
          where,
          include: orderInclude,
          skip: p.skip,
          take: p.take,
          orderBy: [{ number: "desc" }, { id: "desc" }],
        }),
        db.purchaseOrder.count({ where }),
      ]);
      return listed(
        await Promise.all(data.map((o) => publicOrder(o, actor))),
        total,
        p,
      );
    }
    if (method === "GET" && key && s.length === 2)
      return ok({...await publicOrder(await orderAccess(actor, key), actor),...(actor.role!=="JEFE_OBRA"?{notesPublic:await publicOrderNotes(db,key)}:{})});
    if (method === "POST" && !key) {
      requireRoles(actor, "GERENCIA", "COMPRAS");
      const b = await parse(request, orderSchema);
      return ok(
        await idempotent(
          actor,
          "purchase-order",
          request.headers.get("idempotency-key") || "",
          b,
          (tx) => createOrder(tx, actor, b),
        ),
        201,
      );
    }
    if (method === "POST" && key && action === "status" && s.length === 3) {
      requireRoles(actor, "GERENCIA", "COMPRAS");
      const b = await parse(
        request,
        z.object({ status: z.enum(["ISSUED", "CANCELLED"]) }).strict(),
      );
      return ok(
        await transaction(async (tx) => {
          const o = found(
            await tx.purchaseOrder.findUnique({
              where: { id: key },
              include: { lines: true },
            }),
          );
          if (b.status === "ISSUED") {
            if (o.status !== "DRAFT")
              conflict("Solo puede emitirse una OC borrador");
            await commercialCheck(tx, {
              supplierId: o.supplierId,
              requestId: o.requestId ?? undefined,
              currency: o.currency,
              taxBasis: o.taxBasis,
              lines: o.lines.map((l) => ({
                materialId: l.materialId,
                presentationId: l.presentationId ?? undefined,
                quantity: l.quantity.toString(),
                unitPrice: l.unitPrice.toString(),
                baseQuantity: l.baseQuantity.toString(),
              })),
            });
            await locationAccess(actor, o.destinationId, tx);
          }
          if (
            b.status === "CANCELLED" &&
            (!["DRAFT", "ISSUED"].includes(o.status) ||
              o.lines.some((l) => l.receivedQuantity.gt(0)))
          )
            conflict("No puede anularse una OC con recepciones");
          const r = await tx.purchaseOrder.update({
            where: { id: key },
            data: b,
            include: orderInclude,
          });
          if(b.status==='ISSUED'){
            const snapshot=await orderPresentation(tx,r,await publicOrder(r,actor,tx));
            await audit(tx,actor,'PDF_PRESENTATION','PurchaseOrder',key,JSON.parse(JSON.stringify({...snapshot,date:new Date().toISOString()})));
          }
          await audit(tx, actor, "STATUS", "PurchaseOrder", key, {
            from: o.status,
            to: b.status,
          });
          return publicOrder(r, actor, tx);
        }),
      );
    }
    if (method === "PATCH" && key && s.length === 2) {
      requireRoles(actor, "GERENCIA", "COMPRAS");
      const b = await parse(
        request,
        z
          .object({
            notesPublic: z.boolean().optional(),
            notes: z.string().max(4000).optional(),
            lines: z.array(commercialLine).min(1).max(500).optional(),
          })
          .strict(),
      );
      return ok(
        await transaction(async (tx) => {
          const o = found(
            await tx.purchaseOrder.findUnique({ where: { id: key } }),
          );
          if (o.status !== "DRAFT")
            conflict("Solo puede editarse una OC borrador");
          if (b.lines) {
            uniqueLines(b.lines);
            for (const l of b.lines)
              await presentationCheck(tx, l, o.supplierId);
            if (o.quotationId)
              conflict(
                "La OC vinculada a cotización no permite modificar sus renglones",
              );
            if (o.requestId) {
              const req = found(
                await tx.materialRequest.findUnique({
                  where: { id: o.requestId },
                  include: { lines: true },
                }),
              );
              for (const l of b.lines)
                if (!req.lines.some((x) => x.materialId === l.materialId))
                  conflict("Material fuera del pedido");
            }
            await tx.purchaseOrderLine.deleteMany({ where: { orderId: key } });
          }
          if(b.notesPublic!==undefined)await audit(tx,actor,'PDF_NOTES_VISIBILITY','PurchaseOrder',key,{notesPublic:b.notesPublic});
          const result = await tx.purchaseOrder.update({
            where: { id: key },
            data: {
              notes: b.notes,
              lines: b.lines ? { create: b.lines } : undefined,
            },
            include: orderInclude,
          });
          await audit(tx, actor, "UPDATE", "PurchaseOrder", key, b);
          return publicOrder(result, actor, tx);
        }),
      );
    }
    if (
      method === "PUT" &&
      key &&
      action === "invoice-reference" &&
      s.length === 3
    ) {
      requireRoles(actor, "GERENCIA", "COMPRAS");
      const b = await parse(
        request,
        z.object({ invoiceNumber: text }).strict(),
      );
      return ok(
        await transaction(async (tx) => {
          const old = found(
            await tx.purchaseOrder.findUnique({ where: { id: key } }),
          );
          const result = await tx.purchaseOrder.update({
            where: { id: key },
            data: {
              invoiceNumber: b.invoiceNumber,
              invoiceLoadedAt: new Date(),
              invoiceLoadedById: actor.id,
            },
            include: orderInclude,
          });
          await audit(tx, actor, "INVOICE_REFERENCE", "PurchaseOrder", key, {
            before: old.invoiceNumber,
            after: b.invoiceNumber,
          });
          return publicOrder(result, actor, tx);
        }),
      );
    }
    if (method === "POST" && key && action === "receipts" && s.length === 3) {
      requireRoles(
        actor,
        "GERENCIA",
        "COMPRAS",
        "JEFE_OBRA",
        "COMPUTO",
        "ADMINISTRACION",
      );
      const b = await parse(request, receiptSchema);
      const accessOrder = found(
        await db.purchaseOrder.findUnique({
          where: { id: key },
          select: { workId: true, destinationId: true },
        }),
      );
      await receptionAccess(actor, accessOrder, b.locationId);
      const result = await idempotent(
        actor,
        `receipt:${key}`,
        request.headers.get("idempotency-key") || "",
        b,
        async (tx) => {
          const o = found(
            await tx.purchaseOrder.findUnique({
              where: { id: key },
              include: { lines: true },
            }),
          );
          if (!["ISSUED", "PARTIALLY_RECEIVED"].includes(o.status))
            conflict("La orden no admite recepciones");
          const loc = await receptionAccess(actor, o, b.locationId, tx);
          if (loc.workId && loc.workId !== o.workId)
            conflict("No puede recibir en una obra distinta a la orden");
          if (
            new Set(b.lines.map((l) => l.orderLineId)).size !== b.lines.length
          )
            conflict("Renglón de recepción repetido");
          const receipt = await tx.receipt.create({
            data: {
              orderId: key,
              locationId: b.locationId,
              receivedById: actor.id,
              deliveryNote: b.deliveryNote,
              idempotencyKey: createHash("sha256")
                .update(
                  `receipt:${key}:${request.headers.get("idempotency-key")}`,
                )
                .digest("hex"),
            },
          });
          for (const l of b.lines) {
            const ol = o.lines.find((x) => x.id === l.orderLineId);
            if (!ol) conflict("Renglón ajeno a la orden");
            const qty = D(l.quantity);
            if (ol.receivedQuantity.plus(qty).gt(ol.quantity))
              conflict("Recepción excede cantidad pendiente");
            const rl = await tx.receiptLine.create({
              data: {
                receiptId: receipt.id,
                orderLineId: ol.id,
                quantity: qty,
              },
            });
            await tx.purchaseOrderLine.update({
              where: { id: ol.id },
              data: { receivedQuantity: { increment: qty } },
            });
            await addPhysical(tx, ol.materialId, b.locationId, qty);
            if (
              o.workId &&
              !loc.workId &&
              (await schemaCapabilities()).coverage
            ) {
              const requestLine = o.requestId
                ? await tx.requestLine.findUnique({
                    where: {
                      requestId_materialId: {
                        requestId: o.requestId,
                        materialId: ol.materialId,
                      },
                    },
                  })
                : null;
              const reserve = await tx.reservation.create({
                data: {
                  materialId: ol.materialId,
                  sourceId: b.locationId,
                  workId: o.workId,
                  requestLineId: requestLine?.id,
                  quantity: qty,
                  createdById: actor.id,
                },
              });
              await tx.stockBalance.update({
                where: {
                  materialId_locationId: {
                    materialId: ol.materialId,
                    locationId: b.locationId,
                  },
                },
                data: { reserved: { increment: qty } },
              });
              await tx.receiptCoverage.create({
                data: { receiptLineId: rl.id, reservationId: reserve.id },
              });
              await audit(
                tx,
                actor,
                "RESERVE_RECEIPT",
                "Reservation",
                reserve.id,
                {
                  receiptLineId: rl.id,
                  orderId: key,
                  workId: o.workId,
                  quantity: qty.toFixed(),
                },
              );
            }
            await tx.stockMovement.create({
              data: {
                type: "RECEIPT",
                materialId: ol.materialId,
                quantity: qty,
                destinationId: b.locationId,
                workId: o.workId,
                receiptLineId: rl.id,
                createdById: actor.id,
                idempotencyKey: `receipt-line:${rl.id}`,
              },
            });
          }
          const pending = await tx.purchaseOrderLine.count({
            where: {
              orderId: key,
              receivedQuantity: { lt: tx.purchaseOrderLine.fields.quantity },
            },
          });
          await tx.purchaseOrder.update({
            where: { id: key },
            data: { status: pending ? "PARTIALLY_RECEIVED" : "RECEIVED" },
          });
          await audit(tx, actor, "RECEIVE", "Receipt", receipt.id, {
            orderId: key,
            ...b,
          });
          return publicReceipt(
            found(
              await tx.receipt.findUnique({
                where: { id: receipt.id },
                include: receiptInclude,
              }),
            ),
          );
        },
        `order:${key}`,
      );
      return ok(result, 201);
    }
    if (method === "GET" && key && action === "receipts" && s.length === 3) {
      await orderAccess(actor, key);
      const where = { orderId: key,...listSelection(q) };
      const [rows, total] = await db.$transaction([
        db.receipt.findMany({
          where,
          include: receiptInclude,
          skip: p.skip,
          take: p.take,
          orderBy: { createdAt: "desc" },
        }),
        db.receipt.count({ where }),
      ]);
      return listed(rows.map(publicReceipt), total, p);
    }
    if (method === "GET" && key && action === "pdf" && s.length === 3) {
      requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
      const o = await orderAccess(actor, key);
      const presentation=await db.auditLog.findFirst({where:{entityType:'PurchaseOrder',entityId:key,action:'PDF_PRESENTATION'},orderBy:{createdAt:'asc'}});
      const marker=await db.auditLog.findFirst({where:{entityType:'PurchaseOrder',entityId:key,action:'PDF_VERSION'}});
      if(presentation||o.status==='DRAFT'&&marker){
        const snapshot=presentation?.after as OrderPresentation|null??await orderPresentation(db,o,await publicOrder(o,actor));
        return new Response(Buffer.from(await orderPdfV2(snapshot,o.status==='CANCELLED'?'CANCELLED':snapshot.status)),{headers:{'content-type':'application/pdf','content-disposition':`attachment; filename="OC-${o.number}.pdf"`}});
      }
      const vendor = found(
        await db.supplier.findUnique({ where: { id: o.supplierId } }),
      );
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      let page = doc.addPage(),
        y = 790;
      const write = (t: string) => {
        const clean = t.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
        let row = "";
        const draw = () => {
          if (y < 45) {
            page = doc.addPage();
            y = 790;
          }
          page.drawText(row, { x: 40, y, size: 10, font, color: rgb(0, 0, 0) });
          y -= 18;
          row = "";
        };
        for (const char of clean) {
          if (font.widthOfTextAtSize(row + char, 10) > 510) draw();
          row += char;
        }
        if (row) draw();
      };
      write(`CEO Construcciones - Orden de compra ${o.number}`);
      write(`Proveedor: ${vendor.name} - Estado: ${o.status}`);
      write(`Moneda: ${o.currency}; base impositiva: ${o.taxBasis}`);
      let total = D(0),
        allExact = true;
      const policy = (await schemaCapabilities()).coverage
        ? await db.orderAmountPolicy.findUnique({ where: { orderId: o.id } })
        : null;
      for (const l of o.lines) {
        const m = found(
          await db.material.findUnique({
            where: { id: l.materialId },
            include: { unit: true },
          }),
        );
        const amount = policy
          ? l.quantity
              .mul(l.unitPrice)
              .div(l.baseQuantity)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          : exactOrderAmount(l);
        const exact = amount !== null;
        allExact = allExact && exact;
        if (amount) total = total.plus(amount);
        write(
          `${m.code} ${m.name} | ${l.quantity} ${m.unit.code} | precio ${l.unitPrice} por ${l.baseQuantity} | importe ${amount ? amount.toFixed() : `${l.quantity} x ${l.unitPrice} / ${l.baseQuantity} (requiere redondeo explicito)`}`,
        );
      }
      write(
        allExact
          ? `Suma exacta de importes registrados: ${total.toFixed()} ${o.currency}`
          : "Total sin calcular: validar politica de redondeo para las fracciones indicadas.",
      );
      if (policy)
        write(
          "Importes: 2 decimales, HALF_UP por renglón; total como suma de importes.",
        );
      write(
        "Sin calculo adicional de IVA; no es factura ni comprobante de pago.",
      );
      return new Response(Buffer.from(await doc.save()), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="OC-${o.number}.pdf"`,
        },
      });
    }
  }
  return null;
}
