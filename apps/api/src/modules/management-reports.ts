import { monetarySeries } from "./executive-series";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { type Actor, requireRoles } from "../core/auth";
import { db, transaction, schemaCapabilities } from "../core/db";
import { ApiError } from "../core/errors";
import { D, id, paging } from "./shared";
import { xlsxResponse } from "./exports";
import { exactOrderAmount } from "./procurement";

export function argentinaInterval(from?: string, to?: string) {
  const date = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) =>
        !Number.isNaN(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v,
      "Fecha inválida",
    );
  const start = from ? new Date(`${date.parse(from)}T03:00:00Z`) : undefined;
  const end = to
    ? new Date(new Date(`${date.parse(to)}T03:00:00Z`).getTime() + 86400000)
    : undefined;
  if (start && end && start >= end)
    throw new ApiError(422, "INVALID_PERIOD", "El período no es válido.");
  return { gte: start, lt: end };
}
export async function managementReport(
  actor: Actor,
  request: Request,
  kind: "clients" | "purchases",
) {
  requireRoles(
    actor,
    ...(kind === "clients"
      ? (["GERENCIA"] as const)
      : (["GERENCIA", "COMPRAS", "COMPUTO"] as const)),
  );
  const q = new URL(request.url).searchParams,
    p = paging(request),
    clientId = q.get("clientId") || undefined,
    workId = q.get("workId") || undefined,
    supplierId = q.get("supplierId") || undefined;
  for (const value of [clientId, workId, supplierId])
    if (value) id.parse(value);
  const period = argentinaInterval(
      q.get("from") || undefined,
      q.get("to") || undefined,
    ),
    hasPeriod = !!period.gte || !!period.lt;
  const status = q.get("status") || undefined;
  if (status)
    z.enum([
      "DRAFT",
      "ISSUED",
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "CANCELLED",
    ]).parse(status);
  return transaction(async (tx) => {
    if (!(await schemaCapabilities()).coverage)
      throw new ApiError(
        503,
        "FEATURE_NOT_ENABLED",
        "Los indicadores requieren la migración de política de importes.",
      );
    if (
      (await tx.client.count({ where: { id: clientId } })) > 10000 ||
      (await tx.work.count({ where: { id: workId, clientId } })) > 10000
    )
      throw new ApiError(
        422,
        "REPORT_LIMIT",
        "Acotá los filtros a menos de 10000 clientes y obras.",
      );
    const clients = await tx.client.findMany({
      where: { id: clientId },
      select: { id: true, name: true },
    });
    const works = await tx.work.findMany({
      where: { id: workId, clientId },
      select: {
        id: true,
        name: true,
        status: true,
        client: { select: { id: true, name: true } },
      },
    });
    const general=q.get('general')==='true';
    if(general&&(clientId||workId))throw new ApiError(422,'INCOMPATIBLE_FILTERS','Las compras generales no tienen cliente ni obra.');
    const orderWhere: Prisma.PurchaseOrderWhereInput = {
      ...(general?{workId:null}:{}),
      ...(workId || clientId ? { workId: { in: works.map((w) => w.id) } } : {}),
      supplierId,
      status: status
        ? (status as Prisma.EnumPurchaseOrderStatusFilter["equals"])
        : { in: ["ISSUED", "PARTIALLY_RECEIVED", "RECEIVED"] },
      ...(hasPeriod ? { createdAt: period } : {}),
    };
    if ((await tx.purchaseOrder.count({ where: orderWhere })) > 10000)
      throw new ApiError(
        422,
        "REPORT_LIMIT",
        "El informe admite 10000 órdenes. Acotá los filtros.",
      );
    const orders = await tx.purchaseOrder.findMany({
      where: orderWhere,
      select: {
        id: true,
        number: true,
        workId: true,
        currency: true,
        taxBasis: true,
        status: true,
        createdAt: true,
        amountPolicy: true,
        supplier: { select: { id: true, name: true } },
        lines: {
          select: {
            materialId: true,
            quantity: true,
            receivedQuantity: true,
            unitPrice: true,
            baseQuantity: true,
            material: {
              select: {
                code: true,
                name: true,
                unit: { select: { name: true, symbol: true } },
              },
            },
          },
        },
      },
      orderBy: { number: "desc" },
    });
    const purchases = orders.map((order) => {
      const amounts = order.lines.map((l) =>
        order.amountPolicy
          ? l.quantity
              .mul(l.unitPrice)
              .div(l.baseQuantity)
              .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
          : exactOrderAmount(l),
      );
      const comparable = amounts.every(
        (a) => a !== null && a.decimalPlaces() <= 2,
      );
      return {
        ...order,
        totalAmount: comparable
          ? amounts
              .reduce<Prisma.Decimal>((sum, a) => sum.add(a!), D(0))
              .toFixed(2)
          : null,
      };
    });
    if (
      kind === "clients" &&
      (await tx.budget.count({
        where: { workId: { in: works.map((w) => w.id) } },
      })) > 10000
    )
      throw new ApiError(
        422,
        "REPORT_LIMIT",
        "Acotá el informe a menos de 10000 presupuestos.",
      );
    const budgets =
      kind === "clients"
        ? await tx.budget.findMany({
            where: { workId: { in: works.map((w) => w.id) } },
            select: {
              id: true,
              workId: true,
              versions: {
                where: { issue: { isNot: null } },
                orderBy: { number: "desc" },
                take: 1,
                select: { currency: true, taxBasis: true, issue: true },
              },
            },
          })
        : [];
    type Group = { currency: string; taxBasis: string; amount: Prisma.Decimal };
    const add = (
      groups: Map<string, Group>,
      currency: string,
      taxBasis: string,
      amount: Prisma.Decimal.Value,
    ) => {
      const key = `${currency}:${taxBasis}`,
        old = groups.get(key) ?? { currency, taxBasis, amount: D(0) };
      old.amount = old.amount.add(amount);
      groups.set(key, old);
    };
    const serialize = (groups: Map<string, Group>) =>
      [...groups.values()]
        .map((g) => ({ ...g, amount: g.amount.toFixed(2) }))
        .sort((a, b) =>
          `${a.currency}:${a.taxBasis}`.localeCompare(
            `${b.currency}:${b.taxBasis}`,
          ),
        );
    const purchaseTotals = new Map<string, Group>(),
      budgetTotals = new Map<string, Group>();
    for (const o of purchases)
      if (o.totalAmount !== null)
        add(purchaseTotals, o.currency, o.taxBasis, o.totalAmount);
    const clientRows = new Map<
      string,
      {
        clientId: string | null;
        name: string;
        activeWorks: number;
        completedWorks: number;
        otherWorks: number;
        unissuedBudgets: number;
        unvaluedPurchases: number;
        budgeted: Map<string, Group>;
        purchases: Map<string, Group>;
      }
    >();
    if (!workId)
      for (const client of clients)
        clientRows.set(client.id, {
          clientId: client.id,
          name: client.name,
          activeWorks: 0,
          completedWorks: 0,
          otherWorks: 0,
          unissuedBudgets: 0,
          unvaluedPurchases: 0,
          budgeted: new Map(),
          purchases: new Map(),
        });
    for (const w of works) {
      const key = w.client?.id ?? "legacy";
      const row = clientRows.get(key) ?? {
        clientId: w.client?.id ?? null,
        name: w.client?.name ?? "Cliente sin vincular",
        activeWorks: 0,
        completedWorks: 0,
        otherWorks: 0,
        unissuedBudgets: 0,
        unvaluedPurchases: 0,
        budgeted: new Map<string, Group>(),
        purchases: new Map<string, Group>(),
      };
      if (w.status === "ACTIVE") row.activeWorks++;
      else if (w.status === "COMPLETED") row.completedWorks++;
      else row.otherWorks++;
      for (const budget of budgets.filter((b) => b.workId === w.id)) {
        const v = budget.versions[0];
        if (!v?.issue) {
          row.unissuedBudgets++;
          continue;
        }
        if (
          hasPeriod &&
          ((period.gte && v.issue.issuedAt < period.gte) ||
            (period.lt && v.issue.issuedAt >= period.lt))
        )
          continue;
        add(row.budgeted, v.currency, v.taxBasis, v.issue.commercialTotal);
        add(budgetTotals, v.currency, v.taxBasis, v.issue.commercialTotal);
      }
      for (const o of purchases.filter((o) => o.workId === w.id))
        if (o.totalAmount === null) row.unvaluedPurchases++;
        else add(row.purchases, o.currency, o.taxBasis, o.totalAmount);
      clientRows.set(key, row);
    }
    const rows =
      kind === "clients"
        ? [...clientRows.values()].map((r) => ({
            ...r,
            budgeted: serialize(r.budgeted),
            purchases: serialize(r.purchases),
          }))
        : purchases.map((o) => ({
            id: o.id,
            number: o.number,
            workId: o.workId,
            workName:
              works.find((w) => w.id === o.workId)?.name ??
              (o.workId ? "Obra sin vincular" : "Compra general"),
            supplierId: o.supplier.id,
            supplierName: o.supplier.name,
            status: o.status,
            createdAt: o.createdAt,
            currency: o.currency,
            taxBasis: o.taxBasis,
            totalAmount: o.totalAmount,
            lines: o.lines.map((l) => ({
              materialId: l.materialId,
              materialCode: l.material.code,
              materialName: l.material.name,
              unit: l.material.unit.symbol ?? l.material.unit.name,
              quantity: l.quantity.toFixed(),
              receivedQuantity: l.receivedQuantity.toFixed(),
            })),
          }));
    const workNames=new Map(works.map(w=>[w.id,w.name]));
    const purchasePoints=purchases.map(o=>({currency:o.currency,taxBasis:o.taxBasis,amount:o.totalAmount,order:o}));
    const budgetPoints=[...clientRows.values()].flatMap(r=>serialize(r.budgeted).map(g=>({...g,key:r.clientId??'legacy',label:r.name})));
    const budgetWorkPoints=budgets.flatMap(b=>{const v=b.versions[0];return v?.issue&&(!period.gte||v.issue.issuedAt>=period.gte)&&(!period.lt||v.issue.issuedAt<period.lt)?[{key:b.workId,label:workNames.get(b.workId)??'Obra sin vincular',currency:v.currency,taxBasis:v.taxBasis,amount:v.issue.commercialTotal.toFixed(2)}]:[];});
    const executive={
      activeWorks:works.filter(w=>w.status==='ACTIVE').length,
      pendingOrders:purchases.filter(o=>['ISSUED','PARTIALLY_RECEIVED'].includes(o.status)).length,
      orderCount:purchases.length,
      orderStates:[...new Set(purchases.map(o=>o.status))].map(status=>({status,count:purchases.filter(o=>o.status===status).length})),
      purchasesByMonth:monetarySeries(purchasePoints.map(p=>({...p,key:new Date(p.order.createdAt.getTime()-3*3600000).toISOString().slice(0,7),label:new Date(p.order.createdAt.getTime()-3*3600000).toISOString().slice(0,7)}))),
      purchasesBySupplier:monetarySeries(purchasePoints.map(p=>({...p,key:p.order.supplier.id,label:p.order.supplier.name}))),
      purchasesByWork:monetarySeries(purchasePoints.map(p=>({...p,key:p.order.workId??'general',label:p.order.workId?workNames.get(p.order.workId)??'Obra sin vincular':'Compras generales · sin obra'}))),
      budgetedByClient:monetarySeries(budgetPoints),
      budgetedByWork:monetarySeries(budgetWorkPoints),
    };
    return {
      rows,
      executive,
      totals: {
        purchases: serialize(purchaseTotals),
        budgeted: serialize(budgetTotals),
        unvaluedPurchases: purchases.filter((o) => o.totalAmount === null)
          .length,
      },
      pagination: { page: p.page, pageSize: p.pageSize, total: rows.length },
    };
  });
}
export async function handlerManagementReports(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  if (
    s[0] !== "reports" ||
    !["clients", "purchases"].includes(s[1]) ||
    request.method !== "GET"
  )
    return null;
  const report = await managementReport(
    actor,
    request,
    s[1] as "clients" | "purchases",
  );
  if (s[2] === "export") {
    if (s[1] === "purchases")
      return xlsxResponse(
        "compras-obra-proveedor",
        [
          "OC",
          "Obra",
          "Proveedor",
          "Estado",
          "Fecha",
          "Moneda",
          "IVA",
          "Importe registrado",
          "Cantidades",
        ],
        report.rows.flatMap((r) =>
          "number" in r
            ? [
                [
                  r.number,
                  r.workName,
                  r.supplierName,
                  r.status,
                  r.createdAt.toISOString(),
                  r.currency,
                  r.taxBasis,
                  r.totalAmount ??
                    "Sin importe comparable; revisar política histórica",
                  r.lines
                    .map(
                      (l) =>
                        `${l.materialName} (${l.materialCode}): ${l.quantity} ${l.unit} (recibido ${l.receivedQuantity})`,
                    )
                    .join("; "),
                ],
              ]
            : [],
        ),
        {filtros:Object.fromEntries(new URL(request.url).searchParams),fechaCompras:"Creación de OC; estado actual",alcance:"Todo el filtro autorizado; monedas/IVA separados"},
      );
    return xlsxResponse(
      "indicadores-clientes",
      [
        "Cliente",
        "Obras activas",
        "Obras finalizadas",
        "Otras obras",
        "Presupuestos sin emisión comercial",
        "Moneda",
        "IVA",
        "Presupuestado vigente",
        "Compras asociadas",
        "OC sin importe comparable",
      ],
      report.rows.flatMap((r) => {
        if (!("name" in r)) return [];
        const keys = [
          ...new Set(
            [...r.budgeted, ...r.purchases].map(
              (a) => `${a.currency}:${a.taxBasis}`,
            ),
          ),
        ];
        if (!keys.length)
          return [
            [
              r.name,
              r.activeWorks,
              r.completedWorks,
              r.otherWorks,
              r.unissuedBudgets,
              "Sin importes",
              "Sin dato",
              "Sin dato",
              "Sin dato",
              r.unvaluedPurchases,
            ],
          ];
        return keys.map((key) => {
          const b = r.budgeted.find(
              (a) => `${a.currency}:${a.taxBasis}` === key,
            ),
            p = r.purchases.find((a) => `${a.currency}:${a.taxBasis}` === key);
          return [
            r.name,
            r.activeWorks,
            r.completedWorks,
            r.otherWorks,
            r.unissuedBudgets,
            (b ?? p)!.currency,
            (b ?? p)!.taxBasis,
            b?.amount ?? "Sin dato",
            p?.amount ?? "Sin dato",
            r.unvaluedPurchases,
          ];
        });
      }),
      {filtros:Object.fromEntries(new URL(request.url).searchParams),presupuestos:"Última revisión emitida por presupuesto; fecha de emisión",compras:"Fecha de creación de OC; estado actual"},
    );
  }
  return Response.json({
    data: {
      rows: report.rows.slice(
        (report.pagination.page - 1) * report.pagination.pageSize,
        report.pagination.page * report.pagination.pageSize,
      ),
      totals: report.totals,
      executive: report.executive,
    },
    pagination: report.pagination,
  });
}
