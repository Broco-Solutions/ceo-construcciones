import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db, transaction } from "../core/db";
import { audit } from "../core/audit";
import { type Actor, requireRoles, requireWork } from "../core/auth";
import { ApiError } from "../core/errors";
import {
  id,
  text,
  nonnegative,
  decimal,
  money,
  currency,
  taxBasis,
  ok,
  parse,
  paging,
  listed,
  found,
  conflict,
  presentationCheck,
} from "./shared";
export const named = z.object({ code: text, name: text }).strict();
export const workSchema = named.extend({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  managerId: id.nullable().optional(),
});
export const supplierSchema = named.extend({
  taxId: text.nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: text.nullable().optional(),
  address: text.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional(),
});
export const materialSchema = named.extend({
  unitId: id,
  categoryId: id.nullable().optional(),
  minimum: nonnegative.optional(),
  active: z.boolean().optional(),
});
export const presentationSchema = z
  .object({
    materialId: id,
    supplierId: id.nullable().optional(),
    name: text,
    baseQuantity: decimal,
    active: z.boolean().optional(),
  })
  .strict();
export const priceSchema = z
  .object({
    materialId: id,
    supplierId: id.nullable().optional(),
    presentationId: id.nullable().optional(),
    price: decimal,
    baseQuantity: decimal,
    currency,
    taxBasis,
    effectiveAt: z.string().datetime().optional(),
    source: text.optional(),
  })
  .strict();
export async function handlerCatalog(
  request: Request,
  actor: Actor,
  s: string[],
): Promise<Response | null> {
  const [resource, key] = s;
  const method = request.method;
  if (
    ![
      "works",
      "locations",
      "units",
      "categories",
      "suppliers",
      "materials",
      "presentations",
      "prices",
      "audit",
    ].includes(resource)
  )
    return null;
  if (s.length > 2) return null;
  const q = new URL(request.url).searchParams;
  const p = paging(request);
  if (resource === "audit") {
    requireRoles(actor, "GERENCIA");
    if (method !== "GET" || key) return null;
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.get("entity") || undefined,
      entityId: q.get("entityId") || undefined,
    };
    const [data, total] = await db.$transaction([
      db.auditLog.findMany({
        where,
        skip: p.skip,
        take: p.take,
        orderBy: { createdAt: "desc" },
      }),
      db.auditLog.count({ where }),
    ]);
    return listed(data, total, p);
  }
  if (resource === "works") {
    if (method === "GET") {
      if (key) {
        await requireWork(actor, key);
        return ok(
          found(
            await db.work.findUnique({
              where: { id: key },
              include: {
                location: true,
                assignments: { select: { userId: true } },
              },
            }),
          ),
        );
      }
      const where: Prisma.WorkWhereInput =
        actor.role === "JEFE_OBRA"
          ? { assignments: { some: { userId: actor.id } } }
          : {};
      if (q.get("status"))
        where.status = z
          .enum(["ACTIVE", "PAUSED", "COMPLETED"])
          .parse(q.get("status"));
      const [data, total] = await db.$transaction([
        db.work.findMany({
          where,
          include: { location: true },
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.work.count({ where }),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA");
    if (method === "POST" && !key) {
      const b = await parse(request, workSchema);
      return ok(
        await transaction(async (tx) => {
          const w = await tx.work.create({
            data: {
              ...b,
              location: {
                create: { code: `OBRA-${b.code}`, name: b.name, kind: "WORK" },
              },
            },
          });
          await audit(tx, actor, "CREATE", "Work", w.id);
          return w;
        }),
        201,
      );
    }
    if (method === "PATCH" && key) {
      const b = await parse(request, workSchema.partial());
      return ok(
        await transaction(async (tx) => {
          const w = await tx.work.update({ where: { id: key }, data: b });
          await audit(tx, actor, "UPDATE", "Work", key, b);
          return w;
        }),
      );
    }
  }
  if (resource === "locations") {
    if (method === "GET") {
      if (key) {
        const loc = found(await db.location.findUnique({ where: { id: key } }));
        if (actor.role === "JEFE_OBRA") {
          if (!loc.workId)
            throw new ApiError(403, "FORBIDDEN", "Ubicación no autorizada");
          await requireWork(actor, loc.workId);
        }
        return ok(loc);
      }
      const where: Prisma.LocationWhereInput =
        actor.role === "JEFE_OBRA"
          ? { work: { assignments: { some: { userId: actor.id } } } }
          : {};
      const [data, total] = await db.$transaction([
        db.location.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.location.count({ where }),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA");
    const schema = named.extend({
      kind: z.enum(["WAREHOUSE", "YARD"]),
      active: z.boolean().optional(),
    });
    if (method === "POST" && !key) {
      const b = await parse(request, schema);
      return ok(
        await transaction(async (tx) => {
          const l = await tx.location.create({ data: b });
          await audit(tx, actor, "CREATE", "Location", l.id);
          return l;
        }),
        201,
      );
    }
    if (method === "PATCH" && key) {
      const b = await parse(
        request,
        named.extend({ active: z.boolean() }).partial(),
      );
      return ok(
        await transaction(async (tx) => {
          const l = await tx.location.update({ where: { id: key }, data: b });
          await audit(tx, actor, "UPDATE", "Location", l.id, b);
          return l;
        }),
      );
    }
  }
  if (resource === "units" || resource === "categories") {
    if (method === "GET") {
      if (key)
        return ok(
          found(
            resource === "units"
              ? await db.unit.findUnique({ where: { id: key } })
              : await db.category.findUnique({ where: { id: key } }),
          ),
        );
      if (resource === "units") {
        const [data, total] = await db.$transaction([
          db.unit.findMany({
            skip: p.skip,
            take: p.take,
            orderBy: { code: "asc" },
          }),
          db.unit.count(),
        ]);
        return listed(data, total, p);
      }
      const [data, total] = await db.$transaction([
        db.category.findMany({
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.category.count(),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA", "COMPUTO");
    if ((method === "POST" && !key) || (method === "PATCH" && key)) {
      const b = await parse(request, key ? named.partial() : named);
      return ok(
        await transaction(async (tx) => {
          const row =
            resource === "units"
              ? key
                ? await tx.unit.update({ where: { id: key }, data: b })
                : await tx.unit.create({ data: b as z.infer<typeof named> })
              : key
                ? await tx.category.update({ where: { id: key }, data: b })
                : await tx.category.create({
                    data: b as z.infer<typeof named>,
                  });
          await audit(
            tx,
            actor,
            key ? "UPDATE" : "CREATE",
            resource,
            row.id,
            b,
          );
          return row;
        }),
        key ? 200 : 201,
      );
    }
  }
  if (resource === "materials") {
    if (method === "GET") {
      if (key)
        return ok(
          found(
            await db.material.findUnique({
              where: { id: key },
              include: { unit: true, category: true },
            }),
          ),
        );
      const where: Prisma.MaterialWhereInput = {
        name: q.get("search")
          ? { contains: q.get("search")!, mode: "insensitive" }
          : undefined,
        categoryId: q.get("categoryId") || undefined,
      };
      const [data, total] = await db.$transaction([
        db.material.findMany({
          where,
          include: { unit: true, category: true },
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.material.count({ where }),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
    if ((method === "POST" && !key) || (method === "PATCH" && key)) {
      const b = await parse(
        request,
        key ? materialSchema.partial() : materialSchema,
      );
      return ok(
        await transaction(async (tx) => {
          if (key && b.unitId) {
            const old = found(
              await tx.material.findUnique({ where: { id: key } }),
            );
            if (old.unitId !== b.unitId)
              conflict(
                "La unidad base es inmutable; cree otro material para no alterar cantidades históricas",
              );
          }
          const row = key
            ? await tx.material.update({ where: { id: key }, data: b })
            : await tx.material.create({
                data: b as z.infer<typeof materialSchema>,
              });
          await audit(
            tx,
            actor,
            key ? "UPDATE" : "CREATE",
            "Material",
            row.id,
            b,
          );
          return row;
        }),
        key ? 200 : 201,
      );
    }
  }
  if (resource === "suppliers") {
    requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
    if (method === "GET") {
      if (key)
        return ok(found(await db.supplier.findUnique({ where: { id: key } })));
      const [data, total] = await db.$transaction([
        db.supplier.findMany({
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.supplier.count(),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA", "COMPRAS");
    if ((method === "POST" && !key) || (method === "PATCH" && key)) {
      const b = await parse(
        request,
        key ? supplierSchema.partial() : supplierSchema,
      );
      return ok(
        await transaction(async (tx) => {
          const row = key
            ? await tx.supplier.update({ where: { id: key }, data: b })
            : await tx.supplier.create({
                data: b as z.infer<typeof supplierSchema>,
              });
          await audit(
            tx,
            actor,
            key ? "UPDATE" : "CREATE",
            "Supplier",
            row.id,
            b,
          );
          return row;
        }),
        key ? 200 : 201,
      );
    }
  }
  if (resource === "presentations") {
    if (method === "GET") {
      if (key)
        return ok(
          found(await db.presentation.findUnique({ where: { id: key } })),
        );
      const where = { materialId: q.get("materialId") || undefined };
      const [data, total] = await db.$transaction([
        db.presentation.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { id: "asc" },
        }),
        db.presentation.count({ where }),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
    if (method === "POST" && !key) {
      const b = await parse(request, presentationSchema);
      return ok(
        await transaction(async (tx) => {
          const row = await tx.presentation.create({ data: b });
          await audit(tx, actor, "CREATE", "Presentation", row.id, b);
          return row;
        }),
        201,
      );
    }
    if (method === "PATCH" && key) {
      const b = await parse(
        request,
        z.object({ active: z.boolean() }).strict(),
      );
      return ok(
        await transaction(async (tx) => {
          const row = await tx.presentation.update({
            where: { id: key },
            data: b,
          });
          await audit(tx, actor, "UPDATE", "Presentation", key, b);
          return row;
        }),
      );
    }
  }
  if (resource === "prices") {
    requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
    if (method === "GET") {
      if (key)
        return ok(
          found(await db.materialPrice.findUnique({ where: { id: key } })),
        );
      const where = {
        materialId: q.get("materialId") || undefined,
        supplierId: q.get("supplierId") || undefined,
      };
      const [data, total] = await db.$transaction([
        db.materialPrice.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { effectiveAt: "desc" },
        }),
        db.materialPrice.count({ where }),
      ]);
      return listed(data, total, p);
    }
    if (method === "POST" && !key) {
      const b = await parse(request, priceSchema);
      return ok(
        await transaction(async (tx) => {
          await presentationCheck(tx, b, b.supplierId || "");
          const row = await tx.materialPrice.create({ data: b });
          await audit(tx, actor, "CREATE", "MaterialPrice", row.id, b);
          return row;
        }),
        201,
      );
    }
  }
  return null;
}
