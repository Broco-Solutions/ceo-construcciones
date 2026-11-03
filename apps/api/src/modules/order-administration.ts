import { z } from "zod";
import { db, transaction } from "../core/db";
import { type Actor, requireRoles } from "../core/auth";
import { audit } from "../core/audit";
import { ApiError } from "../core/errors";
import {
  currency,
  found,
  id,
  listed,
  money,
  ok,
  paging,
  parse,
  text,
} from "./shared";

export const invoiceInfoSchema = z
  .object({ invoiceNumber: text, amount: money, currency })
  .strict();
export const paymentStatusSchema = z
  .object({ paymentStatus: z.enum(["PENDING", "PAID"]) })
  .strict();
export const delegationSchema = z
  .object({ locationIds: z.array(id).max(1000) })
  .strict();
const safeInclude = {
  supplier: { select: { id: true, name: true } },
  work: { select: { id: true, name: true, code: true } },
  invoiceInfo: {
    select: {
      orderId: true,
      amount: true,
      currency: true,
      paymentStatus: true,
      changedById: true,
      changedAt: true,
      changedBy: { select: { name: true } },
    },
  },
  invoiceLoadedBy: { select: { name: true } },
} as const;
function dto(o: Awaited<ReturnType<typeof rows>>[number]) {
  const info = o.invoiceInfo
    ? (({ changedBy, ...data }) => data)(o.invoiceInfo)
    : null;
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    createdAt: o.createdAt,
    supplier: o.supplier,
    work: o.work,
    invoiceNumber: o.invoiceNumber,
    invoiceLoadedAt: o.invoiceLoadedAt,
    invoiceLoadedByName: o.invoiceLoadedBy?.name ?? null,
    invoiceInfo: info,
    informationChangedByName: o.invoiceInfo?.changedBy.name ?? null,
  };
}
const rows = () => db.purchaseOrder.findMany({ include: safeInclude });
export async function handlerOrderAdministration(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  const [r, key, action] = s,
    method = request.method;
  if (r === "reception-delegations") {
    requireRoles(actor, "GERENCIA");
    if (!key) return null;
    found(await db.user.findUnique({ where: { id: key } }));
    if (method === "GET")
      return ok(
        await db.receptionDelegation.findMany({
          where: { userId: key },
          select: { locationId: true },
        }),
      );
    if (method === "PUT") {
      const b = await parse(request, delegationSchema);
      return ok(
        await transaction(async (tx) => {
          const user = found(await tx.user.findUnique({ where: { id: key } }));
          if (!user.active)
            throw new ApiError(
              422,
              "INACTIVE_USER",
              "El usuario debe estar activo.",
            );
          const ids = [...new Set(b.locationIds)];
          if (
            (await tx.location.count({
              where: { id: { in: ids }, active: true },
            })) !== ids.length
          )
            throw new ApiError(
              422,
              "INVALID_LOCATION",
              "Seleccioná ubicaciones activas.",
            );
          await tx.receptionDelegation.deleteMany({ where: { userId: key } });
          await tx.receptionDelegation.createMany({
            data: ids.map((locationId) => ({ userId: key, locationId })),
          });
          await audit(tx, actor, "DELEGATE_RECEPTION", "User", key, {
            locationIds: ids,
          });
          return { locationIds: ids };
        }),
      );
    }
  }
  if (r !== "order-administration") return null;
  requireRoles(actor, "GERENCIA", "COMPRAS", "ADMINISTRACION");
  if (method === "GET") {
    if (key)
      return ok(
        dto(
          found(
            await db.purchaseOrder.findUnique({
              where: { id: key },
              include: safeInclude,
            }),
          ),
        ),
      );
    const p = paging(request),
      q = new URL(request.url).searchParams;
    const payment = q.get("paymentStatus");
    if (payment) z.enum(["PENDING", "PAID"]).parse(payment);
    const where = {
      ...(payment ? { invoiceInfo: { is: { paymentStatus: payment } } } : {}),
    };
    const [data, total] = await db.$transaction([
      db.purchaseOrder.findMany({
        where,
        include: safeInclude,
        skip: p.skip,
        take: p.take,
        orderBy: { number: "desc" },
      }),
      db.purchaseOrder.count({ where }),
    ]);
    return listed(data.map(dto), total, p);
  }
  if (method === "PUT" && key && action === "invoice") {
    requireRoles(actor, "GERENCIA", "COMPRAS");
    const b = await parse(request, invoiceInfoSchema);
    return ok(
      await transaction(async (tx) => {
        const old = found(
          await tx.purchaseOrder.findUnique({
            where: { id: key },
            include: { invoiceInfo: true },
          }),
        );
        await tx.purchaseOrder.update({
          where: { id: key },
          data: {
            invoiceNumber: b.invoiceNumber,
            invoiceLoadedAt: new Date(),
            invoiceLoadedById: actor.id,
          },
        });
        const info = await tx.orderInvoiceInfo.upsert({
          where: { orderId: key },
          create: {
            orderId: key,
            amount: b.amount,
            currency: b.currency,
            changedById: actor.id,
          },
          update: {
            amount: b.amount,
            currency: b.currency,
            changedById: actor.id,
            changedAt: new Date(),
          },
        });
        await audit(
          tx,
          actor,
          "INVOICE_INFO",
          "PurchaseOrder",
          key,
          { invoiceNumber: b.invoiceNumber, ...info },
          old.invoiceInfo ?? undefined,
        );
        return info;
      }),
    );
  }
  if (method === "PUT" && key && action === "payment") {
    const b = await parse(request, paymentStatusSchema);
    return ok(
      await transaction(async (tx) => {
        const order = found(
          await tx.purchaseOrder.findUnique({ where: { id: key } }),
        );
        if (!order.invoiceNumber)
          throw new ApiError(
            422,
            "INVOICE_REQUIRED",
            "Cargá primero la referencia de factura.",
          );
        const before = await tx.orderInvoiceInfo.findUnique({
          where: { orderId: key },
        });
        const info = await tx.orderInvoiceInfo.upsert({
          where: { orderId: key },
          create: { orderId: key, ...b, changedById: actor.id },
          update: { ...b, changedById: actor.id, changedAt: new Date() },
        });
        await audit(
          tx,
          actor,
          "PAYMENT_INFORMATION",
          "PurchaseOrder",
          key,
          {
            paymentStatus: b.paymentStatus,
            changedAt: info.changedAt.toISOString(),
          },
          before ? { paymentStatus: before.paymentStatus } : undefined,
        );
        return info;
      }),
    );
  }
  return null;
}
