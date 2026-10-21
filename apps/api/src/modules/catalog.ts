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
export const materialPatchSchema = materialSchema
  .omit({ unitId: true })
  .partial();
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
  const search = (q.get("q") || q.get("search"))?.trim();
  const active = q.has("active")
    ? z
        .enum(["true", "false"])
        .transform((value) => value === "true")
        .parse(q.get("active"))
    : undefined;
  if (resource === "audit") {
    requireRoles(actor, "GERENCIA");
    if (method !== "GET" || key) return null;
    const timestamp = (name: string) =>
      q.has(name)
        ? new Date(z.string().datetime({ offset: true }).parse(q.get(name)))
        : undefined;
    const from = timestamp("from"),
      to = timestamp("to");
    if (from && to && from > to)
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "El inicio del intervalo debe ser anterior al fin.",
      );
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.get("entity") || undefined,
      entityId: q.get("entityId") || undefined,
      actorId: q.get("actorId") || undefined,
      action: q.get("action") || undefined,
      ...(from || to ? { createdAt: { gte: from, lte: to } } : {}),
    };
    const [data, total] = await db.$transaction([
      db.auditLog.findMany({
        where,
        skip: p.skip,
        take: p.take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { actor: { select: { name: true } } },
      }),
      db.auditLog.count({ where }),
    ]);
    return listed(
      data.map(({ actor, ...log }) => ({
        ...log,
        actorName: actor?.name ?? null,
      })),
      total,
      p,
    );
  }
  if (resource === "works") {
    if (method === "GET") {
      if (key) {
        await requireWork(actor, key);
        const work = found(
          await db.work.findUnique({
            where: { id: key },
            include: {
              location: true,
              assignments: { select: { userId: true } },
            },
          }),
        );
        const reference = await db.budgetVersion.findFirst({
          where: { budget: { workId: key }, status: "REFERENCE" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        return ok({ ...work, referenceVersionId: reference?.id ?? null });
      }
      const where: Prisma.WorkWhereInput =
        actor.role === "JEFE_OBRA"
          ? { assignments: { some: { userId: actor.id } } }
          : {};
      if (search)
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ];
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
          const before = found(
            await tx.work.findUnique({ where: { id: key } }),
          );
          const w = await tx.work.update({ where: { id: key }, data: b });
          await audit(
            tx,
            actor,
            "UPDATE",
            "Work",
            key,
            JSON.parse(JSON.stringify(w)),
            JSON.parse(JSON.stringify(before)),
          );
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
          if (!loc.workId) {
            if (loc.active && ["WAREHOUSE", "YARD"].includes(loc.kind))
              return ok({
                id: loc.id,
                code: loc.code,
                name: loc.name,
                kind: loc.kind,
                active: loc.active,
              });
            throw new ApiError(403, "FORBIDDEN", "Ubicación no autorizada");
          }
          await requireWork(actor, loc.workId);
        }
        return ok(loc);
      }
      const where: Prisma.LocationWhereInput =
        actor.role === "JEFE_OBRA"
          ? {
              OR: [
                { work: { assignments: { some: { userId: actor.id } } } },
                {
                  workId: null,
                  kind: { in: ["WAREHOUSE", "YARD"] },
                  active: true,
                },
              ],
            }
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
      return listed(
        data.map((loc) =>
          actor.role === "JEFE_OBRA" && !loc.workId
            ? {
                id: loc.id,
                code: loc.code,
                name: loc.name,
                kind: loc.kind,
                active: loc.active,
              }
            : loc,
        ),
        total,
        p,
      );
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
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { code: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        categoryId: q.get("categoryId") || undefined,
        active,
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
        key ? materialPatchSchema : materialSchema,
      );
      return ok(
        await transaction(async (tx) => {
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
      const where: Prisma.SupplierWhereInput = {
        active,
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                { taxId: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const [data, total] = await db.$transaction([
        db.supplier.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.supplier.count({ where }),
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
