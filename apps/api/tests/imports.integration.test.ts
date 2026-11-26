import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { db } from "../src/core/db";
import { handlerImports, importTemplates, type ImportKind } from "../src/modules/imports";
const enabled = process.env.RUN_INTEGRATION === "1";
const suffix = randomUUID();
let actor: { id: string; role: typeof Role.GERENCIA };
const request = (kind: string, action: string, body: unknown, key = "") =>
  new Request(`http://localhost/api/v1/imports/${kind}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
async function run(kind: string, action: string, body: unknown, key = "") {
  const response = await handlerImports(
    request(kind, action, body, key),
    actor,
    ["imports", kind, action],
  );
  return (await response!.json()).data;
}

describe.skipIf(!enabled)("importación PostgreSQL aislado", () => {
  beforeAll(async () => {
    const target = new URL(process.env.DATABASE_URL!);
    if (
      !["localhost", "127.0.0.1", "::1", "[::1]"].includes(target.hostname) ||
      !/test/i.test(target.pathname)
    )
      throw new Error("Requiere PostgreSQL local aislado test");
    actor = {
      id: (
        await db.user.create({
          data: {
            email: `imports-${suffix}@example.test`,
            name: "Importador",
            role: "GERENCIA",
            passwordHash: "no-login-test",
          },
        })
      ).id,
      role: Role.GERENCIA,
    };
  });
  it("previsualiza sin escribir, exige hash, confirma e impide duplicación entre reintentos y actores", async () => {
    const rows = [
      { externalCode: `supplier-${suffix}`, name: "Proveedor de prueba" },
    ];
    const before = await db.supplier.count();
    const preview = await run("suppliers", "preview", { rows });
    expect(preview.valid).toBe(true);
    expect(await db.supplier.count()).toBe(before);
    await expect(
      run(
        "suppliers",
        "commit",
        { rows, confirmationHash: "0".repeat(64) },
        "wrong",
      ),
    ).rejects.toMatchObject({ status: 409 });
    const committed = await run(
      "suppliers",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "same",
    );
    const replay = await run(
      "suppliers",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "same",
    );
    expect(replay).toEqual(committed);
    expect(
      await db.supplier.count({ where: { code: rows[0].externalCode } }),
    ).toBe(1);
    const repeated = await run("suppliers", "preview", { rows });
    expect(repeated.valid).toBe(false);
    expect(
      await db.auditLog.count({
        where: { actorId: actor.id, action: "IMPORT" },
      }),
    ).toBe(1);
  });
  it("archivo inválido completo no importa ninguna fila", async () => {
    const rows = [
      { externalCode: `valid-${suffix}`, name: "Válido" },
      { externalCode: `invalid-${suffix}`, name: "Inválido", email: "bad" },
    ];
    const preview = await run("suppliers", "preview", { rows });
    expect(preview.valid).toBe(false);
    await expect(
      run(
        "suppliers",
        "commit",
        { rows, confirmationHash: preview.confirmationHash },
        "invalid",
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(
      await db.supplier.findUnique({ where: { code: rows[0].externalCode } }),
    ).toBeNull();
  });
  it("inventario inicial ingresa una única vez y rechaza referencias inexistentes", async () => {
    const unit = await db.unit.create({
      data: { code: `unit-${suffix}`, name: "unidad" },
    });
    const material = await db.material.create({
      data: { code: `mat-${suffix}`, name: "Material", unitId: unit.id },
    });
    const location = await db.location.create({
      data: { code: `loc-${suffix}`, name: "Galpón", kind: "WAREHOUSE" },
    });
    const rows = [
      {
        externalCode: `initial-${suffix}`,
        materialCode: material.code,
        locationCode: location.code,
        quantity: "12.34567890",
        reason: "Recuento validado",
      },
    ];
    const preview = await run("initial-stock", "preview", { rows });
    expect(preview.valid).toBe(true);
    await run(
      "initial-stock",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "initial",
    );
    await run(
      "initial-stock",
      "commit",
      { rows, confirmationHash: preview.confirmationHash },
      "initial",
    );
    const balance = await db.stockBalance.findUniqueOrThrow({
      where: {
        materialId_locationId: {
          materialId: material.id,
          locationId: location.id,
        },
      },
    });
    expect(balance.physical.toString()).toBe("12.3456789");
    expect(
      await db.stockMovement.count({
        where: { materialId: material.id, type: "INITIAL" },
      }),
    ).toBe(1);
    expect(
      (
        await run("initial-stock", "preview", {
          rows: [
            {
              ...rows[0],
              externalCode: `unknown-${suffix}`,
              materialCode: "unknown",
            },
          ],
        })
      ).valid,
    ).toBe(false);
  });
  it("DB rechaza sobrereserva y revierte la transacción completa", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const u = await tx.unit.create({
          data: { code: `badunit-${suffix}`, name: "unidad" },
        });
        const m = await tx.material.create({
          data: { code: `badmat-${suffix}`, name: "Material", unitId: u.id },
        });
        const l = await tx.location.create({
          data: { code: `badloc-${suffix}`, name: "Patio", kind: "YARD" },
        });
        await tx.stockBalance.create({
          data: {
            materialId: m.id,
            locationId: l.id,
            physical: "1",
            reserved: "2",
          },
        });
      }),
    ).rejects.toThrow();
    expect(
      await db.unit.findUnique({ where: { code: `badunit-${suffix}` } }),
    ).toBeNull();
  });
  it("DB rechaza cantidades recibidas mayores que OC", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const u = await tx.unit.create({
          data: { code: `ocunit-${suffix}`, name: "unidad" },
        });
        const m = await tx.material.create({
          data: { code: `ocmat-${suffix}`, name: "Material", unitId: u.id },
        });
        const l = await tx.location.create({
          data: { code: `ocloc-${suffix}`, name: "Patio", kind: "YARD" },
        });
        const supplier = await tx.supplier.create({
          data: { code: `ocsupplier-${suffix}`, name: "Proveedor" },
        });
        await tx.purchaseOrder.create({
          data: {
            supplierId: supplier.id,
            destinationId: l.id,
            currency: "ARS",
            createdById: actor.id,
            lines: {
              create: {
                materialId: m.id,
                quantity: "1",
                receivedQuantity: "2",
                unitPrice: "1",
              },
            },
          },
        });
      }),
    ).rejects.toThrow();
  });
  it("DB preserva snapshot económico aunque se intente modificar directamente", async () => {
    await expect(
      db.$transaction(async (tx) => {
        const work = await tx.work.create({
          data: { code: `snapwork-${suffix}`, name: "Obra" },
        });
        const budget = await tx.budget.create({
          data: { workId: work.id, name: "Presupuesto" },
        });
        const version = await tx.budgetVersion.create({
          data: {
            budgetId: budget.id,
            number: 1,
            currency: "ARS",
            precision: 2,
            roundingMode: "HALF_UP",
            createdById: actor.id,
            snapshot: { unitPrice: "12" },
          },
        });
        await tx.budgetVersion.update({
          where: { id: version.id },
          data: { snapshot: { unitPrice: "99" } },
        });
      }),
    ).rejects.toThrow();
  });

  it("no permite una segunda apertura con otro identificador externo ni repetir el par en un archivo", async () => {
    const row = {
      externalCode: `recount-${suffix}`,
      materialCode: `mat-${suffix}`,
      locationCode: `loc-${suffix}`,
      quantity: "8",
      reason: "Intento de segundo recuento",
    };
    const preview = await run("initial-stock", "preview", { rows: [row] });
    expect(preview.valid).toBe(false);
    expect(
      preview.errors.some((e: { message: string }) =>
        e.message.includes("ajuste"),
      ),
    ).toBe(true);
    await expect(
      run(
        "initial-stock",
        "commit",
        { rows: [row], confirmationHash: preview.confirmationHash },
        "recount",
      ),
    ).rejects.toMatchObject({ status: 422 });
    const duplicated = await run("initial-stock", "preview", {
      rows: [row, { ...row, externalCode: `other-recount-${suffix}` }],
    });
    expect(duplicated.valid).toBe(false);
    expect(
      duplicated.errors.some(
        (e: { row: number; message: string }) =>
          e.row === 2 && e.message.includes("sólo admiten una apertura"),
      ),
    ).toBe(true);
    const material = await db.material.findUniqueOrThrow({
        where: { code: row.materialCode },
      }),
      location = await db.location.findUniqueOrThrow({
        where: { code: row.locationCode },
      });
    expect(
      (
        await db.stockBalance.findUniqueOrThrow({
          where: {
            materialId_locationId: {
              materialId: material.id,
              locationId: location.id,
            },
          },
        })
      ).physical.toString(),
    ).toBe("12.3456789");
  });
  it("protege aperturas concurrentes del mismo par en importaciones diferentes", async () => {
    const unit = await db.unit.findUniqueOrThrow({
        where: { code: `unit-${suffix}` },
      }),
      location = await db.location.findUniqueOrThrow({
        where: { code: `loc-${suffix}` },
      });
    const material = await db.material.create({
      data: {
        code: `concurrent-mat-${suffix}`,
        name: "Material concurrente",
        unitId: unit.id,
      },
    });
    const one = [
      {
        externalCode: `concurrent-a-${suffix}`,
        materialCode: material.code,
        locationCode: location.code,
        quantity: "10",
        reason: "Recuento A",
      },
    ];
    const two = [
      {
        ...one[0],
        externalCode: `concurrent-b-${suffix}`,
        reason: "Recuento B",
      },
    ];
    const a = await run("initial-stock", "preview", { rows: one }),
      b = await run("initial-stock", "preview", { rows: two });
    expect(a.valid && b.valid).toBe(true);
    const outcomes = await Promise.allSettled([
      run(
        "initial-stock",
        "commit",
        { rows: one, confirmationHash: a.confirmationHash },
        "concurrent-a",
      ),
      run(
        "initial-stock",
        "commit",
        { rows: two, confirmationHash: b.confirmationHash },
        "concurrent-b",
      ),
    ]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(
      (
        await db.stockBalance.findUniqueOrThrow({
          where: {
            materialId_locationId: {
              materialId: material.id,
              locationId: location.id,
            },
          },
        })
      ).physical.toString(),
    ).toBe("10");
    expect(
      await db.stockMovement.count({ where: { materialId: material.id } }),
    ).toBe(1);
  });
  it("detecta saldo preexistente sin movimientos importados", async () => {
    const unit = await db.unit.findUniqueOrThrow({
        where: { code: `unit-${suffix}` },
      }),
      location = await db.location.findUniqueOrThrow({
        where: { code: `loc-${suffix}` },
      });
    const material = await db.material.create({
      data: {
        code: `existing-mat-${suffix}`,
        name: "Existente",
        unitId: unit.id,
      },
    });
    await db.stockBalance.create({
      data: { materialId: material.id, locationId: location.id, physical: "1" },
    });
    const preview = await run("initial-stock", "preview", {
      rows: [
        {
          externalCode: `existing-open-${suffix}`,
          materialCode: material.code,
          locationCode: location.code,
          quantity: "2",
          reason: "Recuento",
        },
      ],
    });
    expect(preview.valid).toBe(false);
  });
});

const officialHeaders: Record<ImportKind, string[]> = {
  clients: ["Código", "Nombre o razón social", "CUIT", "Contacto", "Teléfono", "Email", "Dirección", "Observaciones"],
  works: ["Código", "Nombre de obra", "Código de cliente", "Dirección"],
  suppliers: ["Código", "Nombre o razón social", "CUIT", "Email", "Teléfono", "Dirección"],
  materials: ["Código", "Material", "Unidad", "Rubro", "Stock mínimo"],
  prices: ["Código material", "Unidad", "Presentación", "Precio"],
  "purchase-orders": ["Código de OC", "Código de proveedor", "Código de obra", "Código de destino", "Código material", "Cantidad", "Precio unitario", "Moneda", "Base impositiva", "Observaciones"],
  "initial-stock": ["Código de registro", "Código material", "Código de ubicación", "Cantidad", "Motivo"],
};

async function workbookPayload(book: ExcelJS.Workbook) {
  return { file: {
    name: "datos.xlsx",
    base64: Buffer.from(await book.xlsx.writeBuffer()).toString("base64"),
  } };
}

async function template(kind: ImportKind, excel = true) {
  return (await handlerImports(
    new Request(`http://localhost/imports/${kind}/template${excel ? "?format=xlsx" : ""}`),
    actor, ["imports", kind, "template"],
  ))!;
}

async function loadTemplate(kind: ImportKind) {
  const response = await template(kind);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await response.arrayBuffer());
  return { response, book, sheet: book.getWorksheet("Datos")! };
}

describe.skipIf(!enabled)("plantillas oficiales y confirmación con PostgreSQL", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost" || !/test/i.test(url.pathname))
      throw new Error("Requiere PostgreSQL local aislado test");
    actor = { id: (await db.user.create({ data: {
      email: `official-${suffix}@example.test`, name: "Plantillas", role: "GERENCIA",
      passwordHash: "no-login-test",
    } })).id, role: "GERENCIA" };
  });

  it.each(Object.entries(officialHeaders))("descarga y abre la plantilla %s, y conserva el CSV anterior", async (key, headers) => {
    const kind = key as ImportKind;
    const { response, book, sheet } = await loadTemplate(kind);
    expect(response.headers.get("content-type")).toContain("spreadsheetml");
    expect(response.headers.get("content-disposition")).toMatch(/plantilla-.*-\d{4}-\d{2}-\d{2}\.xlsx/);
    expect(book.worksheets.map(({ name }) => name)).toEqual(["Datos", "Contexto"]);
    expect(sheet.rowCount).toBe(1);
    expect((sheet.getRow(1).values as string[]).slice(1)).toEqual(headers);
    expect(sheet.getRow(1).font.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    headers.forEach((header, index) => {
      if (/^Código|^(CUIT|Teléfono)$/.test(header)) expect(sheet.getColumn(index + 1).numFmt).toBe("@");
    });
    expect(book.getWorksheet("Contexto")?.getColumn(2).values?.join(" ")).toContain("Esta hoja no se importa");
    expect(await (await template(kind, false)).text()).toBe(importTemplates[kind].join(",") + "\r\n");
  });

  it.each(["xlsx", "csv", "csv ;", "técnico"] as const)("previsualiza y confirma los seis tipos administrativos en %s", async (format) => {
    const tag = `${format.length}-${format[0]}-${suffix}`;
    const code = (prefix: string) => `${prefix}-${tag}`;
    const kg = await db.unit.findFirstOrThrow({ where: { symbol: "kg" } });
    const location = await db.location.create({ data: { code: code("L"), name: "Patio sintético", kind: "YARD" } });
    const data: Partial<Record<ImportKind, (string | number)[][]>> = {
      clients: [[code("C"), "Cliente sintético", "", "", "00123", "", "", ""]],
      works: [[code("W"), "Obra sintética", code("C"), ""], [code("W2"), "Obra sin cliente", "", ""]],
      suppliers: [[code("S"), "Proveedor sintético", "", "", "000432", ""]],
      materials: [[code("M"), code("Cemento"), kg.code, "", ""], [code("M2"), code("Cal"), kg.code, "", 2]],
      "purchase-orders": [
        [code("OC"), code("S"), "", location.code, code("M"), 2, format === "xlsx" ? 7210.5 : "7.210,50", "ARS", "Sin IVA", ""],
        [code("OC"), code("S"), "", location.code, code("M2"), 5, "11.12345678", "ARS", "Sin IVA", ""],
      ],
      "initial-stock": [[code("INI"), code("M"), location.code, format === "xlsx" ? 0.12345678 : "0,12345678", "Recuento"]],
    };
    let orderId = "";
    for (const [key, values] of Object.entries(data)) {
      const kind = key as ImportKind;
      let payload;
      if (format === "xlsx") {
        const { book, sheet } = await loadTemplate(kind);
        sheet.addRows(values);
        payload = await workbookPayload(book);
      } else {
        const technical = format === "técnico";
        const delimiter = format === "csv ;" ? ";" : ",";
        const headers = technical ? importTemplates[kind] : officialHeaders[kind];
        const ordered = technical && kind === "clients"
          ? values.map(([code, name, taxId, contact, phone, email, address, notes]) =>
              [code, name, taxId, contact, email, phone, address, notes])
          : values;
        const records = technical ? ordered.map((row) => row.map((value, index) => {
          const field = headers[index];
          if (field === "taxBasis") return "EXCLUDED";
          if (field === "unitPrice" && value === "7.210,50") return "7210.50";
          if (field === "quantity" && value === "0,12345678") return "0.12345678";
          return value;
        })) : values;
        payload = { csv: [headers, ...records]
          .map((row) => row.map((value) => `"${value}"`).join(delimiter)).join("\r\n") };
      }
      const preview = await run(kind, "preview", payload);
      expect(preview.errors, kind).toEqual([]);
      expect(preview.table.columns).toHaveLength(officialHeaders[kind].length);
      expect(preview.table.columns).toEqual(expect.arrayContaining(officialHeaders[kind]));
      expect(preview.table.rows).toHaveLength(values.length);
      const result = await run(kind, "commit", { ...payload, confirmationHash: preview.confirmationHash }, `batch-${tag}-${kind}`);
      expect(result.importedRows).toBe(values.length);
      if (kind === "purchase-orders") {
        expect(result.createdIds).toHaveLength(1);
        orderId = result.createdIds[0];
        expect(await db.stockMovement.count({ where: { destinationId: location.id } })).toBe(0);
      }
    }
    const order = await db.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true, receipts: true } });
    expect(order).toMatchObject({ status: "ISSUED", workId: null, taxBasis: "EXCLUDED", receipts: [] });
    expect(order.lines.map((line) => line.unitPrice.toFixed())).toEqual(expect.arrayContaining(["7210.5", "11.12345678"]));
    const work = await db.work.findUniqueOrThrow({ where: { code: code("W") }, include: { location: true, client: true } });
    expect(work.client?.code).toBe(code("C"));
    expect(work.client?.phone).toBe("00123");
    expect(work.location?.code).toBe(`OBRA-${code("W")}`);
    expect((await db.work.findUniqueOrThrow({ where: { code: code("W2") } })).clientId).toBeNull();
    expect((await db.stockMovement.findFirstOrThrow({ where: { destinationId: location.id, type: "INITIAL" } })).quantity.toFixed()).toBe("0.12345678");
    const repeated = await run("initial-stock", "preview", {
      csv: `Código de registro,Código material,Código de ubicación,Cantidad,Motivo\nOTRO,${code("M")},${location.code},1,Recuento`,
    });
    expect(repeated.errors).toEqual([expect.objectContaining({ row: 1, message: expect.stringContaining("ya tiene movimientos") })]);
  });

  it("resuelve kg con código distinto, rubro y código automático después del explícito, con replay sin incrementar", async () => {
    const kg = await db.unit.findFirstOrThrow({ where: { code: "UNI-007", symbol: "kg" } });
    const actualCode = `UNI-IMPORT-KG-${suffix}`;
    const otherKg = await db.unit.findMany({
      where: { symbol: "kg", id: { not: kg.id } }, select: { id: true },
    });
    const otherUnits = { id: { in: otherKg.map(({ id }) => id) } };
    try {
      await db.unit.updateMany({ where: otherUnits, data: { symbol: null } });
      await db.unit.update({ where: { id: kg.id }, data: { code: actualCode } });
      const counter = () => db.codeCounter.findUniqueOrThrow({ where: { entity: "materials" } });
      const { lastValue } = await counter();
      const explicitCode = `MAT-${String(lastValue + 1).padStart(3, "0")}`;
      const category = await db.category.create({ data: { code: `rubro-${suffix}`, name: `Albañilería ${suffix}` } });
      const { book, sheet } = await loadTemplate("materials");
      const cement = `Cemento Portland Loma Negra ${suffix}`;
      sheet.addRows([["", cement, "kg", ` ${category.name.toUpperCase()} `, ""], [explicitCode, `Cal hidratada extra Avellaneda ${suffix}`, " KILOGRAMO ", "", 50]]);
      const input = await workbookPayload(book);
      const preview = await run("materials", "preview", input);
      expect(preview.errors).toEqual([]);
      expect(preview.table.rows[0]).toMatchObject({ row: 1, values: ["", cement, "kg", ` ${category.name.toUpperCase()} `, ""], automaticCode: true });
      expect((await counter()).lastValue).toBe(lastValue);
      const payload = { ...input, confirmationHash: preview.confirmationHash };
      const first = await run("materials", "commit", payload, "official-auto");
      const automatic = await db.material.findFirstOrThrow({ where: { name: cement }, include: { unit: true } });
      expect(automatic).toMatchObject({
        code: `MAT-${String(lastValue + 2).padStart(3, "0")}`,
        categoryId: category.id, unit: { code: actualCode },
      });
      expect(automatic.minimum.toFixed()).toBe("0");
      await expect(db.material.findUnique({ where: { code: explicitCode } })).resolves.toMatchObject({ unitId: kg.id });
      expect(await run("materials", "commit", payload, "official-auto")).toEqual(first);
      expect((await counter()).lastValue).toBe(lastValue + 2);
      const repeated = await run("materials", "preview", {
        csv: `Código,Material,Unidad,Rubro,Stock mínimo\n, ${cement.toUpperCase()} ,kg,,`,
      });
      expect(repeated.errors).toContainEqual({ row: 1, message: expect.stringContaining("ya existe un material") });
      await db.unit.update({ where: { id: kg.id }, data: { symbol: null } });
      expect(await run("materials", "commit", payload, "official-auto")).toEqual(first);
      expect((await counter()).lastValue).toBe(lastValue + 2);
    } finally {
      await db.unit.update({ where: { id: kg.id }, data: { code: kg.code, symbol: kg.symbol } });
      await db.unit.updateMany({ where: otherUnits, data: { symbol: "kg" } });
    }
  });

  it("rechaza unidad inexistente o ambigua, rubro inválido y nombres duplicados sin abrir el lote", async () => {
    const ambiguous = await db.unit.create({ data: { code: `AMB-${suffix}`, name: "Otra unidad", symbol: "kg" } });
    try {
      const data = { csv: [
        "Código;Material;Unidad;Rubro;Stock mínimo",
        `D1-${suffix};Material uno;kg;;`,
        `D2-${suffix};Material dos;KG;;`,
        `D3-${suffix};Material tres;UNI-007;Rubro inexistente;`,
        `D4-${suffix};material tres;UNI-007;;`,
      ].join("\n") };
      const parsed = await run("materials", "preview", data);
      expect(parsed.valid).toBe(false);
      expect(parsed.errors).toEqual(expect.arrayContaining([
        { row: 1, message: "La unidad coincide con varios registros. Indicá su código exacto." },
        { row: 2, message: "La unidad indicada no existe en el catálogo." },
        { row: 3, message: "El rubro indicado no existe en el catálogo." },
        { row: 4, message: expect.stringContaining("nombre se repite") },
      ]));
      await expect(run("materials", "commit", { ...data, confirmationHash: parsed.confirmationHash }, "bad-materials"))
        .rejects.toMatchObject({ status: 422 });
      expect(await db.material.findUnique({ where: { code: `D4-${suffix}` } })).toBeNull();
    } finally {
      await db.unit.delete({ where: { id: ambiguous.id } });
    }
  });

  it("revalida la identidad de la unidad al confirmar el código automático", async () => {
    const unit = await db.unit.create({ data: { code: `U-${suffix}`, name: `Unidad singular ${suffix}`, symbol: `u-${suffix}` } });
    const csv = `Código,Material,Unidad,Rubro,Stock mínimo\n,Material nuevo ${suffix},${unit.symbol},,`;
    const preview = await run("materials", "preview", { csv });
    expect(preview.valid).toBe(true);
    await db.unit.update({ where: { id: unit.id }, data: { symbol: null } });
    await expect(run("materials", "commit", { csv, confirmationHash: preview.confirmationHash }, "unit-stale"))
      .rejects.toMatchObject({ status: 409 });
    expect(await db.material.count({ where: { name: `Material nuevo ${suffix}` } })).toBe(0);
  });

  it("elige Datos, conserva el número de fila tras un hueco y rechaza fórmulas, columnas y hojas ambiguas", async () => {
    const { book, sheet } = await loadTemplate("suppliers");
    sheet.addRow([`novalido-${suffix}`, "Válido"]);
    sheet.getRow(4).values = ["Fórmula", { formula: '"Nombre"', result: "Nombre" }];
    const payload = await workbookPayload(book);
    const preview = await run("suppliers", "preview", payload);
    expect(preview.table.rows.map((r: { row: number }) => r.row)).toEqual([1, 3]);
    expect(preview.errors).toContainEqual({ row: 3, message: expect.stringContaining("Reemplazá la fórmula") });
    await expect(run("suppliers", "commit", { ...payload, confirmationHash: preview.confirmationHash }, "formula"))
      .rejects.toMatchObject({ status: 422 });
    expect(await db.supplier.findUnique({ where: { code: `novalido-${suffix}` } })).toBeNull();
    sheet.name = "Proveedores";
    await expect(run("suppliers", "preview", await workbookPayload(book))).rejects.toMatchObject({ code: "INVALID_SHEET" });
    book.removeWorksheet(book.getWorksheet("Contexto")!.id);
    expect((await run("suppliers", "preview", await workbookPayload(book))).rowCount).toBe(2);
    await expect(run("suppliers", "preview", { csv: "Código,Nombre o razón social,Desconocida\nX,N," }))
      .rejects.toMatchObject({ code: "INVALID_HEADERS" });
    await expect(run("suppliers", "preview", { csv: "Código,Código\nX,Y" }))
      .rejects.toMatchObject({ code: "INVALID_CSV" });
  });

  it.each(Object.values(Role))("respeta el rol %s para plantillas y previsualización", async (role) => {
    const current = { ...actor, role };
    for (const kind of Object.keys(officialHeaders)) {
      const allowed = role === "GERENCIA" || kind === "prices" && (role === "COMPRAS" || role === "COMPUTO");
      const get = handlerImports(new Request(`http://localhost/imports/${kind}/template?format=xlsx`), current, ["imports", kind, "template"]);
      const post = handlerImports(request(kind, "preview", { rows: [{}] }), current, ["imports", kind, "preview"]);
      if (allowed) {
        await expect(get).resolves.toMatchObject({ status: 200 });
        await expect(post).resolves.toMatchObject({ status: 200 });
      } else {
        await expect(get).rejects.toMatchObject({ status: 403 });
        await expect(post).rejects.toMatchObject({ status: 403 });
      }
    }
  });
});
