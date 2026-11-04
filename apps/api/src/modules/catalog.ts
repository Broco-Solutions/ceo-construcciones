import { z } from "zod";
import { priceProvenance, retiredPriceIds } from "./price-provenance";
import { Prisma } from "@prisma/client";
import { db, transaction, schemaCapabilities } from "../core/db";
import { audit } from "../core/audit";
import { codeForCreate } from "./automatic-codes";
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
  canonicalTaxId,
  duplicateClientTaxId,
} from "./shared";
export const named = z.object({ code: text, name: text }).strict();
/** Unidad de medida: el símbolo es opcional; null lo quita. */
export const unitSchema = named.extend({
  symbol: z.string().trim().min(1).max(20).nullable().optional(),
});
export const workSchema = named.extend({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
  managerId: id.nullable().optional(),
  // Kept optional in the schema so legacy records and migration tooling can be
  // read/updated. New work creation below requires it explicitly.
  clientId: id.optional(),
  address: text.nullable().optional(),
});
export const clientSchema = named.extend({
  taxId: text.nullable().optional(),
  contact: text.nullable().optional(),
  phone: text.nullable().optional(),
  email: z.string().email().nullable().optional(),
  address: text.nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional(),
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
    price: nonnegative,
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
      "clients",
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
              client: { select: { id: true, code: true, name: true } },
              assignments: { select: { userId: true } },
            },
          }),
        );
        const reference = await db.budgetVersion.findFirst({
          where: { budget: { workId: key }, status: "REFERENCE" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        return ok({
          ...work,
          clientId: work.clientId ?? null,
          address: work.address ?? null,
          client: work.client ?? null,
          referenceVersionId: reference?.id ?? null,
        });
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
      if (q.get("clientId")) {
        if (!(await schemaCapabilities()).clients)
          throw new ApiError(
            503,
            "FEATURE_NOT_ENABLED",
            "Los filtros por cliente aún no están habilitados.",
          );
        where.clientId = q.get("clientId")!;
      }
      const [data, total] = await db.$transaction([
        db.work.findMany({
          where,
          include: {
            location: true,
            client: { select: { id: true, code: true, name: true } },
          },
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
        }),
        db.work.count({ where }),
      ]);
      return listed(
        data.map((w) => ({
          ...w,
          clientId: w.clientId ?? null,
          address: w.address ?? null,
          client: w.client ?? null,
        })),
        total,
        p,
      );
    }
    requireRoles(actor, "GERENCIA");
    if (method === "POST" && !key) {
      const b = await parse(request, workSchema);
      const enabled = (await schemaCapabilities()).clients;
      if (!enabled && ("clientId" in b || "address" in b))
        throw new ApiError(
          503,
          "FEATURE_NOT_ENABLED",
          "Los datos de cliente aún no están habilitados en este entorno.",
        );
      return ok(
        await transaction(async (tx) => {
          if (enabled && !b.clientId)
            throw new ApiError(
              422,
              "VALIDATION_ERROR",
              "Debe seleccionar un cliente para la obra.",
              {
                fieldErrors: { clientId: ["Completá este campo"] },
                formErrors: [],
              },
            );
          if (enabled) {
            const client = await tx.client.findUnique({
              where: { id: b.clientId! },
            });
            if (!client?.active)
              throw new ApiError(
                422,
                "INVALID_CLIENT",
                "Seleccioná un cliente activo.",
              );
          }
          const code = await codeForCreate(tx, "works", b.code);
          const w = await tx.work.create({
            data: {
              ...b,
              code,
              location: {
                create: { code: `OBRA-${code}`, name: b.name, kind: "WORK" },
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
      if (
        !(await schemaCapabilities()).clients &&
        ("clientId" in b || "address" in b)
      )
        throw new ApiError(
          503,
          "FEATURE_NOT_ENABLED",
          "Los datos de cliente aún no están habilitados en este entorno.",
        );
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
  if (resource === "clients") {
    if (method === "GET") {
      requireRoles(actor, "GERENCIA", "COMPRAS", "COMPUTO");
      if (key) {
        return ok(
          found(
            await db.client.findUnique({
              where: { id: key },
              include: {
                works: {
                  include: {
                    location: true,
                    client: { select: { id: true, code: true, name: true } },
                    budgets: true,
                  },
                  orderBy: { code: "asc" },
                },
              },
            }),
          ),
        );
      }
      const where: Prisma.ClientWhereInput = {
        active,
        ...(search
          ? {
              OR: [
                { code: { contains: search, mode: "insensitive" } },
                { name: { contains: search, mode: "insensitive" } },
                {
                  taxId: {
                    contains: canonicalTaxId(search),
                    mode: "insensitive",
                  },
                },
              ],
            }
          : {}),
      };
      const [data, total] = await db.$transaction([
        db.client.findMany({
          where,
          skip: p.skip,
          take: p.take,
          orderBy: { code: "asc" },
          include: { _count: { select: { works: true } } },
        }),
        db.client.count({ where }),
      ]);
      return listed(data, total, p);
    }
    requireRoles(actor, "GERENCIA", "COMPUTO");
    if ((method === "POST" && !key) || (method === "PATCH" && key)) {
      const b = await parse(
        request,
        key ? clientSchema.partial() : clientSchema,
      );
      if (b.taxId) b.taxId = canonicalTaxId(b.taxId);
      return ok(
        await transaction(async (tx) => {
          if (b.taxId && (await duplicateClientTaxId(tx, b.taxId, key ?? "")))
            throw new ApiError(
              409,
              "DUPLICATE_TAX_ID",
              "Ya existe un cliente con ese CUIT.",
            );
          const row = key
            ? await tx.client.update({ where: { id: key }, data: b })
            : await tx.client.create({
                data: {
                  ...(b as z.infer<typeof clientSchema>),
                  code: await codeForCreate(
                    tx,
                    "clients",
                    (b as z.infer<typeof clientSchema>).code,
                  ),
                },
              });
          await audit(
            tx,
            actor,
            key ? "UPDATE" : "CREATE",
            "Client",
            row.id,
            b,
          );
          return row;
        }),
        key ? 200 : 201,
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
          const l = await tx.location.create({
            data: { ...b, code: await codeForCreate(tx, "locations", b.code) },
          });
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
      const schema = resource === "units" ? unitSchema : named;
      const b = await parse(request, key ? schema.partial() : schema);
      return ok(
        await transaction(async (tx) => {
          const row =
            resource === "units"
              ? key
                ? await tx.unit.update({ where: { id: key }, data: b })
                : await tx.unit.create({
                    data: {
                      ...(b as z.infer<typeof unitSchema>),
                      code: await codeForCreate(
                        tx,
                        "units",
                        (b as z.infer<typeof unitSchema>).code,
                      ),
                    },
                  })
              : key
                ? await tx.category.update({ where: { id: key }, data: b })
                : await tx.category.create({
                    data: {
                      ...(b as z.infer<typeof named>),
                      code: await codeForCreate(
                        tx,
                        "categories",
                        (b as z.infer<typeof named>).code,
                      ),
                    },
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
                data: {
                  ...(b as z.infer<typeof materialSchema>),
                  code: await codeForCreate(
                    tx,
                    "materials",
                    (b as z.infer<typeof materialSchema>).code,
                  ),
                },
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
                data: {
                  ...(b as z.infer<typeof supplierSchema>),
                  code: await codeForCreate(
                    tx,
                    "suppliers",
                    (b as z.infer<typeof supplierSchema>).code,
                  ),
                },
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
          (
            await priceProvenance([
              found(await db.materialPrice.findUnique({ where: { id: key } })),
            ])
          )[0],
        );
      const where = {
        id: { notIn: await retiredPriceIds() },
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
      return listed(await priceProvenance(data), total, p);
    }
    if (method === "POST" && !key) {
      const b = await parse(request, priceSchema);
      if (
        new Prisma.Decimal(b.price).isZero() &&
        !(await schemaCapabilities()).coverage
      )
        throw new ApiError(
          503,
          "FEATURE_NOT_ENABLED",
          "El precio cero explícito requiere la migración de precios de aplicación.",
        );
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
