import { writeFileSync, mkdirSync } from "node:fs";
import {
  laborResourceSchema,
  laborResourcePatchSchema,
  laborRateSchema,
  activityCostingWriteSchema,
  resolvedActivitySchema,
} from "../apps/api/src/modules/cost-references";
import {
  costReviewSchema,
  costApplySchema,
  compositionReplacementSchema,
} from "../apps/api/src/modules/budget-cost-updates";
import { resolve } from "node:path";
import { Prisma } from "../apps/api/node_modules/@prisma/client";
import { zodToJsonSchema } from "../apps/api/node_modules/zod-to-json-schema";
import {
  named,
  unitSchema,
  workSchema,
  clientSchema,
  supplierSchema,
  materialSchema,
  materialPatchSchema,
  presentationSchema,
  priceSchema,
} from "../apps/api/src/modules/catalog";
import { reserveSchema, moveSchema } from "../apps/api/src/modules/inventory";
import {
  itemSchema,
  computationSchema,
  computationPatchSchema,
  budgetSchema,
  valuationSchema,
  versionSchema,
} from "../apps/api/src/modules/budgets";
import {
  requestSchema,
  commercialLine,
  quotationSchema,
  orderSchema,
  receiptSchema,
} from "../apps/api/src/modules/procurement";
import { schemas as importSchemas } from "../apps/api/src/modules/imports";
import { editorContentSchema } from "../apps/api/src/modules/commercial-domain";
import {
  draftSaveSchema,
  editorCreateSchema,
  issueSchema,
  templateSchema,
} from "../apps/api/src/modules/commercial";
import {
  invoiceInfoSchema,
  paymentStatusSchema,
  delegationSchema,
} from "../apps/api/src/modules/order-administration";
import {
  priceFileSchema,
  priceMappingSchema,
} from "../apps/api/src/modules/reference-prices";

type S = Record<string, any>;
const schemas: Record<string, S> = {};
const paths: Record<string, S> = {};
const roles = ["GERENCIA", "COMPRAS", "COMPUTO", "JEFE_OBRA", "ADMINISTRACION"];
const commercial = roles.slice(0, 3),
  buyers = roles.slice(0, 2),
  writers = ["GERENCIA", "COMPUTO"];
const operational = ["GERENCIA", "COMPRAS", "COMPUTO", "JEFE_OBRA"];
const str: S = { type: "string" },
  bool: S = { type: "boolean" },
  integer: S = { type: "integer" },
  id: S = { type: "string", minLength: 1, maxLength: 100 };
const dec: S = {
  type: "string",
  pattern: "^-?\\d+(\\.\\d+)?$",
  description: "Decimal serializado como texto, nunca float.",
};
const nullable = (schema: S): S => ({ anyOf: [schema, { type: "null" }] });
const arr = (items: S): S => ({ type: "array", items });
const ref = (name: string): S => ({ $ref: `#/components/schemas/${name}` });
const obj = (
  properties: Record<string, S>,
  required = Object.keys(properties),
): S => ({ type: "object", properties, required, additionalProperties: false });
const data = (schema: S): S => obj({ data: schema });
const paginated = (schema: S): S =>
  obj({ data: arr(schema), pagination: ref("Pagination") });
const add = (name: string, schema: S) => {
  schemas[name] = schema;
  return ref(name);
};
const extend = (
  name: string,
  base: string,
  fields: Record<string, S>,
  omit: string[] = [],
) => {
  const properties = { ...schemas[base].properties, ...fields };
  for (const key of omit) delete properties[key];
  return add(
    name,
    obj(
      properties,
      [
        ...new Set([...(schemas[base].required ?? []), ...Object.keys(fields)]),
      ].filter((key) => !omit.includes(key)),
    ),
  );
};
const zod = (name: string, schema: any) => {
  const converted = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as S;
  delete converted.$schema;
  return add(name, converted);
};
for (const enumeration of Prisma.dmmf.datamodel.enums)
  add(enumeration.name, {
    type: "string",
    enum: enumeration.values.map((v) => v.name),
  });
for (const model of Prisma.dmmf.datamodel.models) {
  if (
    ["Session", "AuthAttempt", "IdempotencyRecord", "CodeCounter"].includes(
      model.name,
    )
  )
    continue;
  const properties: Record<string, S> = {};
  for (const field of model.fields) {
    if (
      field.kind === "object" ||
      ["passwordHash", "tokenHash"].includes(field.name)
    )
      continue;
    let schema: S =
      field.kind === "enum"
        ? ref(field.type)
        : field.type === "Decimal"
          ? dec
          : field.type === "Int"
            ? integer
            : field.type === "Boolean"
              ? bool
              : field.type === "DateTime"
                ? { type: "string", format: "date-time" }
                : field.type === "Json"
                  ? {}
                  : str;
    if (field.isList) schema = arr(schema);
    if (!field.isRequired) schema = nullable(schema);
    properties[field.name] = schema;
  }
  add(model.name, obj(properties));
}
schemas.Work.required = schemas.Work.required.filter(
  (name: string) => !["clientId", "address"].includes(name),
);
schemas.ApuItem.required = schemas.ApuItem.required.filter(
  (name: string) => name !== "directCost",
);
schemas.MaterialPrice.properties.referenceDate = nullable(str);
schemas.MaterialPrice.properties.referenceDatePrecision = {
  enum: ["DAY", "MONTH", "UNKNOWN"],
};
schemas.MaterialPrice.properties.referenceState = { enum: ["HISTORICAL", "REVIEW_REQUIRED"] };
schemas.LaborRate.properties.referenceState={enum:['HISTORICAL','USER']};
add(
  "Pagination",
  obj({
    page: { type: "integer", minimum: 1 },
    pageSize: { type: "integer", minimum: 1, maximum: 100 },
    total: { type: "integer", minimum: 0 },
  }),
);
add(
  "ZodFlattenDetails",
  obj({
    formErrors: arr(str),
    fieldErrors: { type: "object", additionalProperties: arr(str) },
  }),
);
add("ZodIssue", {
  type: "object",
  properties: { code: str, message: str, path: arr({ anyOf: [str, integer] }) },
  required: ["code", "message", "path"],
  additionalProperties: true,
});
add(
  "Error",
  obj({
    error: obj(
      {
        code: str,
        message: str,
        details: {
          anyOf: [
            ref("ZodFlattenDetails"),
            arr(ref("ZodIssue")),
            { type: "object", additionalProperties: true },
            { type: "array" },
            str,
          ],
          description:
            "APU/cómputos/presupuestos y reportes: Zod flatten {formErrors,fieldErrors}; catálogos/compras/inventario: array de issues Zod. Otros errores pueden contener objetos de dominio o filas. El cliente debe discriminar por forma, no suponer siempre array.",
        },
      },
      ["code", "message"],
    ),
  }),
);
for (const [name, schema] of Object.entries({
  NamedInput: named,
  UnitInput: unitSchema,
  WorkInput: workSchema,
  ClientInput: clientSchema,
  SupplierInput: supplierSchema,
  MaterialInput: materialSchema,
  PresentationInput: presentationSchema,
  PriceInput: priceSchema,
  ReservationInput: reserveSchema,
  MovementInput: moveSchema,
  ApuInput: itemSchema,
  ComputationInput: computationSchema,
  ComputationPatch: computationPatchSchema,
  BudgetInput: budgetSchema,
  ValuationInput: valuationSchema,
  VersionInput: versionSchema,
  RequestInput: requestSchema,
  CommercialLineInput: commercialLine,
  QuotationInput: quotationSchema,
  OrderInput: orderSchema,
  ReceiptInput: receiptSchema,
}))
  zod(name, schema);
for (const [name, schema] of Object.entries({
  WorkPatch: workSchema.partial(),
  ClientPatch: clientSchema.partial(),
  SupplierPatch: supplierSchema.partial(),
  MaterialPatch: materialPatchSchema,
  NamedPatch: named.partial(),
  UnitPatch: unitSchema.partial(),
}))
  zod(name, schema);
schemas.MaterialPatch.description =
  "La unidad base es inmutable. unitId no se admite en PATCH (422); crear otro material para cambiarla.";
schemas.PriceInput.description =
  "Sin presentationId, baseQuantity debe ser decimal igual a1 (p.ej. 1 o 1.0); con presentación debe coincidir exactamente con su equivalencia. Incompatibilidad devuelve409; no se inventan conversiones.";
schemas.PriceInput.allOf = [
  {
    if: {
      not: {
        required: ["presentationId"],
        properties: { presentationId: { type: "string" } },
      },
    },
    then: { properties: { baseQuantity: { pattern: "^1(?:\\.0{1,8})?$" } } },
  },
];
const selectedPrice = schemas.ValuationInput.properties.prices.items;
selectedPrice.oneOf = [
  { required: ["priceId"], not: { required: ["unitPrice"] } },
  { required: ["unitPrice"], not: { required: ["priceId"] } },
];
schemas.VersionInput.properties.prices.items.oneOf = selectedPrice.oneOf;
schemas.MovementInput.oneOf = [
  {
    properties: { type: { const: "INITIAL" } },
    required: ["destinationId"],
    not: {
      anyOf: [{ required: ["sourceId"] }, { required: ["reservationId"] }],
    },
  },
  {
    properties: { type: { const: "TRANSFER" } },
    required: ["sourceId", "destinationId"],
  },
  {
    properties: { type: { const: "RETURN" } },
    required: ["sourceId", "destinationId"],
    not: { required: ["reservationId"] },
  },
  {
    properties: { type: { const: "CONSUMPTION" } },
    required: ["sourceId"],
    not: {
      anyOf: [{ required: ["destinationId"] }, { required: ["reservationId"] }],
    },
  },
  {
    properties: { type: { const: "ADJUSTMENT" } },
    required: ["direction", "reason"],
    oneOf: [
      {
        properties: { direction: { const: "IN" } },
        required: ["destinationId"],
        not: { required: ["sourceId"] },
      },
      {
        properties: { direction: { const: "OUT" } },
        required: ["sourceId"],
        not: { required: ["destinationId"] },
      },
    ],
    not: { required: ["reservationId"] },
  },
];
// Base Material is also used by clients across read/write responses. Relations
// are optional there and required in MaterialDetail returned by catalog GETs.
schemas.Material.properties.unit = ref("Unit");
schemas.Material.properties.category = nullable(ref("Category"));
add(
  "LocationSummary",
  obj({ id, code: str, name: str, kind: ref("LocationKind") }),
);
add(
  "ReturnDestination",
  obj({
    id,
    code: str,
    name: str,
    kind: { type: "string", enum: ["WAREHOUSE", "YARD"] },
    active: { const: true },
  }),
);
add("VisibleLocation", {
  anyOf: [ref("Location"), ref("ReturnDestination")],
  description:
    "Jefe: ubicación completa de obra propia o sólo metadatos de galpón/patio activo; no concede lectura de saldos globales.",
});
extend("AuditEntry", "AuditLog", { actorName: nullable(str) });
extend("MovementDetail", "StockMovement", {
  source: nullable(ref("LocationSummary")),
  destination: nullable(ref("LocationSummary")),
  actorName: str,
});
schemas.MovementDetail.description =
  "Ubicaciones mínimas sin saldos. Para Jefe, source/destination de obras no asignadas se proyectan null, incluso si el movimiento llega a su obra autorizada. Los IDs escalares se conservan como referencia histórica; no conceden acceso.";
// Keep strict GET DTOs; historical idempotency snapshots have a separate union.
add("MovementWriteResult", {
  anyOf: [ref("MovementDetail"), ref("StockMovement")],
  description:
    "Nuevas intenciones devuelven MovementDetail. Replay de claves guardadas con el contrato anterior puede devolver StockMovement sin metadatos; GET /movements los incluye sin repetir la operación.",
});

add("MinimumSource", {
  type: "string",
  enum: ["LOCATION", "MATERIAL", "NONE"],
  description:
    "LOCATION: override local, incluso 0. MATERIAL: heredado positivo. NONE: sin override y mínimo global 0.",
});
extend("MaterialDetail", "Material", {
  unit: ref("Unit"),
  category: nullable(ref("Category")),
});
add("ClientSummary", obj({ id, code: str, name: str }));
extend("WorkList", "Work", {
  location: nullable(ref("Location")),
  client: nullable(ref("ClientSummary")),
});
extend("WorkDetail", "WorkList", {
  assignments: arr(obj({ userId: id })),
  referenceVersionId: nullable(id),
});
extend("ClientWork", "WorkList", { budgets: arr(ref("Budget")) });
extend("ClientDetail", "Client", { works: arr(ref("ClientWork")) });
extend("ClientList", "Client", { _count: obj({ works: integer }) });
extend("Stock", "StockBalance", {
  material: extend("StockMaterial", "Material", { unit: ref("Unit") }),
  location: ref("Location"),
  available: dec,
  minimum: dec,
  belowMinimum: bool,
  minimumSource: ref("MinimumSource"),
});
add(
  "StockAlert",
  obj({
    balanceId: nullable(id),
    materialId: id,
    locationId: id,
    material: obj({
      id,
      code: str,
      name: str,
      unitId: id,
      unit: obj({ code: str, name: str, symbol: nullable(str) }),
    }),
    location: obj({ id, code: str, name: str, workId: nullable(id) }),
    physical: dec,
    reserved: dec,
    available: dec,
    minimum: dec,
    belowMinimum: { const: true },
    minimumSource: ref("MinimumSource"),
  }),
);
extend("RequestDetail", "MaterialRequest", { lines: arr(ref("RequestLine")) });
extend("QuotationDetail", "Quotation", { lines: arr(ref("QuotationLine")) });
extend("OrderLineDetail", "PurchaseOrderLine", {
  pendingQuantity: dec,
  lineAmount: nullable(dec),
});
extend("OrderDetail", "PurchaseOrder", {
  lines: arr(ref("OrderLineDetail")),
  supplier: obj({ id, code: str, name: str }),
  destination: ref("LocationSummary"),
  work: nullable(obj({ id, code: str, name: str })),
  createdByName: str,
  invoiceLoadedByName: nullable(str),
  totalAmount: nullable(dec),
  amountWarning: {
    anyOf: [{ const: "ROUNDING_POLICY_REQUIRED" }, { type: "null" }],
  },
});
schemas.OrderDetail.description =
  "OC nuevas: HALF_UP a 2 decimales por importe extendido, total como suma de líneas; precios y equivalencias originales intactos, sin agregar IVA. OC históricas sin política: importes exactos hasta 8 decimales; si no son representables, null y ROUNDING_POLICY_REQUIRED.";
extend("LegacyOrderDetail", "PurchaseOrder", {
  lines: arr(ref("PurchaseOrderLine")),
});
add("OrderWriteResult", {
  anyOf: [ref("OrderDetail"), ref("LegacyOrderDetail")],
  description:
    "Nueva OC devuelve OrderDetail. Una clave idempotente creada con el contrato anterior conserva LegacyOrderDetail; consultar GET /purchase-orders/{id} para descripciones/importes actuales, sin volver a crear.",
});
add(
  "ChiefOrderLine",
  obj({
    id,
    materialId: id,
    quantity: dec,
    receivedQuantity: dec,
    pendingQuantity: dec,
  }),
);
add(
  "ChiefOrder",
  obj({
    id,
    number: integer,
    workId: nullable(id),
    requestId: nullable(id),
    destinationId: id,
    destination: ref("LocationSummary"),
    createdByName: str,
    status: ref("PurchaseOrderStatus"),
    createdAt: { type: "string", format: "date-time" },
    lines: arr(ref("ChiefOrderLine")),
  }),
);
add("VisibleOrder", {
  anyOf: [
    { ...ref("OrderDetail"), "x-roles": commercial },
    { ...ref("ChiefOrder"), "x-roles": ["JEFE_OBRA"] },
  ],
  description:
    "JEFE_OBRA recibe exclusivamente ChiefOrder de obras asignadas destinadas físicamente a su obra. Sin precios, proveedor, moneda, factura ni costos.",
});
extend(
  "ReceiptDetail",
  "Receipt",
  {
    lines: arr(ref("ReceiptLine")),
    actorName: str,
    location: ref("LocationSummary"),
  },
  ["idempotencyKey"],
);
extend("LegacyReceiptDetail", "Receipt", { lines: arr(ref("ReceiptLine")) }, [
  "idempotencyKey",
]);
add("ReceiptWriteResult", {
  anyOf: [ref("ReceiptDetail"), ref("LegacyReceiptDetail")],
  description:
    "Nuevo evento devuelve ReceiptDetail. Replay previo conserva metadatos originales LegacyReceiptDetail; GET de recepciones incluye nombres/ubicación actuales.",
});
extend("ApuComponent", "ApuMaterial", {
  material: extend("ApuMaterialDetail", "Material", { unit: ref("Unit") }),
});
extend("ApuDetail", "ApuItem", {
  unit: ref("Unit"),
  category: ref("Category"),
  components: arr(ref("ApuComponent")),
});
schemas.ApuDetail.properties.referenceCost = obj({
  laborCost: nullable(dec), totalUnitCost: nullable(dec), currency: str,
  taxBasis: ref("TaxBasis"),
});
extend("ComputationDetail", "Computation", {
  lines: arr(
    extend("ComputationLineDetail", "ComputationLine", {
      item: ref("ApuDetail"),
    }),
  ),
});
extend("ComputationWriteResult", "Computation", {
  lines: arr(ref("ComputationLine")),
});
const bom = obj({
  materialId: id,
  name: str,
  unitId: id,
  unit: str,
  quantity: dec,
});
add(
  "SnapshotMaterial",
  obj({
    materialId: id,
    name: str,
    unitId: id,
    unit: str,
    coefficient: dec,
    unitPrice: dec,
    sourcePriceId: nullable(id),
    quantity: dec,
    unitCost: dec,
  }),
);
add(
  "SnapshotLine",
  obj({
    sourceLineId: id,
    itemId: id,
    code: nullable(str),
    name: str,
    categoryId: id,
    category: str,
    unitId: id,
    unit: str,
    quantity: dec,
    laborUnitCost: dec,
    materials: arr(ref("SnapshotMaterial")),
    materialUnitCost: dec,
    totalUnitCost: dec,
    materialCost: dec,
    laborCost: dec,
    totalCost: dec,
  }),
);
add(
  "BudgetCalculation",
  obj({
    currency: str,
    taxBasis: ref("TaxBasis"),
    precision: integer,
    roundingMode: { type: "string", enum: ["HALF_UP", "HALF_EVEN", "DOWN"] },
    roundingBoundary: { const: "EXTENDED_LINE_COMPONENTS" },
    lines: arr(ref("SnapshotLine")),
    categories: arr(
      obj({
        categoryId: id,
        name: str,
        materialCost: dec,
        laborCost: dec,
        totalCost: dec,
      }),
    ),
    materials: arr(bom),
    materialsByCategory: arr(obj({ ...bom.properties, categoryId: id })),
    materialCost: dec,
    laborCost: dec,
    totalCost: dec,
  }),
);
// New activity direct costs are optional in V1 snapshots and old schemas.
schemas.SnapshotLine.properties.directUnitCost = dec;
schemas.SnapshotLine.properties.directCost = dec;
schemas.BudgetCalculation.properties.directCost = dec;
schemas.BudgetCalculation.properties.categories.items.properties.directCost =
  dec;
extend("StoredSnapshot", "BudgetCalculation", {
  computationId: id,
  computationName: str,
  overrides: schemas.VersionInput.properties.overrides,
});
schemas.BudgetVersion.properties.snapshot = ref("StoredSnapshot");
extend("VersionCreated", "BudgetVersion", {
  materials: arr(ref("BudgetMaterial")),
});
extend("VersionDetail", "BudgetVersion", { budget: ref("Budget") });
extend("BudgetDetail", "Budget", { versions: arr(ref("BudgetVersion")) });
zod("EditorContent", editorContentSchema);
zod("DraftSaveInput", draftSaveSchema);
zod("EditorCreateInput", editorCreateSchema);
zod("IssueInput", issueSchema);
zod("TemplateInput", templateSchema);
schemas.BudgetDraft.properties.content = ref("EditorContent");
schemas.BudgetTemplate.properties.content = ref("EditorContent");
extend("CommercialLine", "SnapshotLine", {
  directUnitCost: dec,
  directCost: dec,
  materials: arr(
    obj(
      {
        ...schemas.EditorContent.properties.lines.items.properties.materials
          .items.properties,
        quantity: dec,
        unitCost: nullable(dec),
      },
      schemas.EditorContent.properties.lines.items.properties.materials.items
        .required,
    ),
  ),
  materialsIncludedInDirect: bool,
  sellingUnitPrice: dec,
  sellingAmount: dec,
});
schemas.CommercialLine.required = schemas.CommercialLine.required.filter(
  (k: string) => k !== "materialsIncludedInDirect",
);
extend("CommercialCategory", "BudgetCalculation", {});
schemas.CommercialCategory = obj({
  ...schemas.BudgetCalculation.properties.categories.items.properties,
  directCost: dec,
  sellingAmount: dec,
});
extend("CommercialCalculation", "BudgetCalculation", {
  formatVersion: { const: 2 },
  unitCosts: arr(
    obj({
      lineKey: id,
      totalUnitCost: nullable(dec),
      missingCosts: arr(str),
      quantityPending: bool,
      zeroQuantity: bool,
    }),
  ),
  lines: arr(ref("CommercialLine")),
  categories: arr(ref("CommercialCategory")),
  directCost: dec,
  commercialTotal: dec,
  materialDemandIncomplete: bool,
  materialReviewIssues: arr(obj({ lineKey: id, name: str, detail: str })),
  materialQuantityPolicy: obj({
    precision: { const: 8 },
    roundingMode: { const: "HALF_UP" },
    boundary: { const: "CATEGORY_MATERIAL" },
  }),
  issues: arr(obj({ lineKey: id, message: str })),
  complete: bool,
});
schemas.CommercialCalculation.required =
  schemas.CommercialCalculation.required.filter(
    (k: string) => !["unitCosts", "materialReviewIssues"].includes(k),
  );
add(
  "CommercialHeader",
  obj({
    client: obj({ name: str, taxId: nullable(str), address: nullable(str) }),
    work: obj({ name: str, address: nullable(str) }),
    name: str,
    conditions: str,
    exclusions: str,
    observations: str,
    deadline: str,
    pdfTemplateVersion: integer,
    issuedAt: { type: "string", format: "date-time" },
  }),
);
schemas.CommercialHeader.properties.nonPricedLines = arr(
  obj({ category: str, name: str, status: { enum: ["INCLUDED", "EXCLUDED"] } }),
);
extend("CommercialSnapshot", "CommercialCalculation", {
  editorContent: ref("EditorContent"),
  commercial: ref("CommercialHeader"),
  computationId: id,
  computationName: str,
  overrides: arr({}),
});
schemas.BudgetVersion.properties.snapshot = {
  anyOf: [ref("StoredSnapshot"), ref("CommercialSnapshot")],
};
extend("IssuedVersion", "BudgetVersion", { issue: ref("BudgetIssue") });
extend("EditorVersion", "BudgetVersion", {
  issue: nullable(ref("BudgetIssue")),
});
extend("EditorWork", "Work", { client: nullable(ref("Client")) });
extend("BudgetEditor", "Budget", {
  work: ref("EditorWork"),
  draft: nullable(ref("BudgetDraft")),
  versions: arr(ref("EditorVersion")),
});
zod("InvoiceInfoInput", invoiceInfoSchema);
zod("PaymentStatusInput", paymentStatusSchema);
zod("DelegationInput", delegationSchema);
add(
  "AdministrativeOrder",
  obj({
    id,
    number: integer,
    status: ref("PurchaseOrderStatus"),
    createdAt: { type: "string", format: "date-time" },
    supplier: obj({ id, name: str }),
    work: nullable(obj({ id, name: str, code: str })),
    invoiceNumber: nullable(str),
    invoiceLoadedAt: nullable({ type: "string", format: "date-time" }),
    invoiceLoadedByName: nullable(str),
    invoiceInfo: nullable(ref("OrderInvoiceInfo")),
    informationChangedByName: nullable(str),
  }),
);
add(
  "DelegatedOrder",
  obj({
    id,
    number: integer,
    status: ref("PurchaseOrderStatus"),
    destination: obj({ id, name: str }),
    lines: arr(
      obj({
        id,
        quantity: dec,
        receivedQuantity: dec,
        pendingQuantity: dec,
        material: obj({
          name: str,
          unit: obj({ name: str, symbol: nullable(str) }),
        }),
      }),
    ),
  }),
);
zod("PriceFileInput", priceFileSchema);
zod("PriceMappingInput", priceMappingSchema);
add(
  "PriceFileSheets",
  obj({
    sheets: arr(obj({ name: str, columns: arr(str), rows: arr(arr(str)) })),
  }),
);
extend("ReferencePrice", "MaterialPrice", {
  presentation: nullable(ref("Presentation")),
});
add(
  "PriceComparison",
  obj({
    material: obj({ id, name: str, unit: str }),
    candidates: arr(
      obj({
        supplier: obj({ id, name: str }),
        price: nullable(ref("ReferencePrice")),
        normalizedPrice: nullable(dec),
        lowest: bool,
        reviewDue: bool,
        lastReviewedAt: nullable({ type: "string", format: "date-time" }),
      }),
    ),
  }),
);
add(
  "NetNeeds",
  obj({
    workId: id,
    referenceVersionId: nullable(id),
    materialDemandIncomplete: bool,
    coverageHash: str,
    rows: arr(
      obj({
        materialId: id,
        code: str,
        name: str,
        unit: str,
        planned: nullable(dec),
        consumed: dec,
        workAvailable: dec,
        pendingCoverage: dec,
        covered: dec,
        remaining: nullable(dec),
        excess: nullable(dec),
        generalAvailable: nullable(dec),
        exact: bool,
        warnings: arr(str),
        sources: arr(obj({ kind: str, id, quantity: dec })),
      }),
    ),
  }),
);
add("MoneyGroup", obj({ currency: str, taxBasis: str, amount: dec }));
add(
  "ManagementTotals",
  obj({
    purchases: arr(ref("MoneyGroup")),
    budgeted: arr(ref("MoneyGroup")),
    unvaluedPurchases: integer,
  }),
);
add(
  "ClientIndicatorRow",
  obj({
    clientId: nullable(id),
    name: str,
    activeWorks: integer,
    completedWorks: integer,
    otherWorks: integer,
    unissuedBudgets: integer,
    unvaluedPurchases: integer,
    budgeted: arr(ref("MoneyGroup")),
    purchases: arr(ref("MoneyGroup")),
  }),
);
add(
  "PurchaseReportRow",
  obj({
    id,
    number: integer,
    workId: nullable(id),
    workName: str,
    supplierId: id,
    supplierName: str,
    status: ref("PurchaseOrderStatus"),
    createdAt: { type: "string", format: "date-time" },
    currency: str,
    taxBasis: str,
    totalAmount: nullable(dec),
    lines: arr(
      obj({
        materialId: id,
        materialCode: str,
        materialName: str,
        unit: str,
        quantity: dec,
        receivedQuantity: dec,
      }),
    ),
  }),
);
add(
  "ClientIndicators",
  obj({
    rows: arr(ref("ClientIndicatorRow")),
    totals: ref("ManagementTotals"),
  }),
);
add(
  "PurchasesReport",
  obj({ rows: arr(ref("PurchaseReportRow")), totals: ref("ManagementTotals") }),
);
add(
  "VersionMaterials",
  obj({
    versionId: id,
    workId: id,
    status: ref("BudgetStatus"),
    materials: arr(
      obj({
        materialId: id,
        unitId: id,
        quantity: dec,
        material: obj({ id, code: str, name: str }),
        unit: obj({ id, code: str, name: str, symbol: nullable(str) }),
      }),
    ),
    materialsByCategory: arr(
      obj({
        categoryId: id,
        materialId: id,
        unitId: id,
        quantity: dec,
        material: obj({ id, code: str, name: str }),
        unit: obj({ id, code: str, name: str, symbol: nullable(str) }),
        category: obj({ id, code: str, name: str }),
      }),
    ),
  }),
);
add(
  "Needs",
  obj({
    versionId: nullable(id),
    lines: arr(
      obj({
        materialId: id,
        requested: dec,
        planned: nullable(dec),
        alreadyRequested: dec,
        availability: arr(
          obj({ locationId: id, physical: dec, reserved: dec, available: dec }),
        ),
      }),
    ),
  }),
);
extend("ComparedQuotationLine", "QuotationLine", { baseUnitPrice: dec });
extend("ComparedQuotation", "Quotation", {
  supplier: obj({ id, name: str }),
  lines: arr(ref("ComparedQuotationLine")),
});
add(
  "Comparison",
  obj({
    requestId: id,
    comparable: bool,
    reason: nullable(str),
    quotations: arr(ref("ComparedQuotation")),
  }),
);
add(
  "ReportRow",
  obj({
    materialId: id,
    code: str,
    name: str,
    unitId: id,
    unit: str,
    planned: nullable(dec),
    requested: dec,
    purchased: dec,
    consumed: dec,
    received: dec,
    physical: nullable(dec),
    reserved: nullable(dec),
    available: nullable(dec),
    remainingToRequest: nullable(dec),
    remainingToPurchase: nullable(dec),
    consumptionVariance: nullable(dec),
  }),
);
add(
  "MaterialReport",
  obj({
    workId: id,
    categoryId: nullable(id),
    version: nullable(
      obj({ id, number: integer, status: ref("BudgetStatus") }),
    ),
    warnings: arr(str),
    definitions: obj(
      Object.fromEntries(
        [
          "requested",
          "purchased",
          "received",
          "consumed",
          "available",
          "categoryAttribution",
        ].map((k) => [k, str]),
      ),
    ),
    rows: arr(ref("ReportRow")),
  }),
);

const q = (name: string, schema: S = str, required = false) => ({
  name,
  in: "query",
  required,
  schema,
});
const paging = [
  q("page", { type: "integer", minimum: 1, maximum: 100000, default: 1 }),
  q("pageSize", { type: "integer", minimum: 1, maximum: 100, default: 50 }),
];
const pathParams = (path: string) =>
  [...path.matchAll(/\{(\w+)\}/g)].map((m) => ({
    name: m[1],
    in: "path",
    required: true,
    schema: id,
  }));
const errors = Object.fromEntries(
  [400, 401, 403, 404, 405, 409, 413, 422, 429, 500, 503].map((code) => [
    code,
    {
      description: (
        {
          400: "JSON/entrada inválida",
          401: "Sesión requerida/vencida o credenciales inválidas",
          403: "Rol, recurso u Origin prohibido",
          404: "Recurso inexistente",
          405: "Método no permitido",
          409: "Conflicto de negocio, concurrencia o idempotencia",
          413: "Cuerpo demasiado grande",
          422: "Validación o integridad fallida",
          429: "Demasiados intentos de acceso",
          500: "Error interno",
          503: "Configuración Origin faltante",
        } as Record<number, string>
      )[code],
      content: { "application/json": { schema: ref("Error") } },
    },
  ]),
);
function operation(
  path: string,
  method: string,
  summary: string,
  response: S,
  options: {
    roles?: string[];
    input?: S;
    status?: number;
    list?: boolean;
    queries?: any[];
    idempotent?: boolean;
    public?: boolean;
    raw?: boolean;
    mime?: string;
    description?: string;
    example?: unknown;
  } = {},
) {
  const mime = options.mime ?? "application/json",
    status = options.status ?? 200;
  const parameters = structuredClone([
    ...pathParams(path),
    ...(options.list ? paging : []),
    ...(options.queries ?? []),
    ...(options.idempotent
      ? [
          {
            name: "Idempotency-Key",
            in: "header",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 120 },
            description: path.endsWith("/receipts")
              ? "Clave única por OC y evento, compartida entre receptores autorizados. Repetir mismo cuerpo devuelve el resultado original; otro cuerpo produce 409."
              : "Clave única por actor, alcance y evento. Repetir mismo cuerpo devuelve el resultado original; otro cuerpo produce 409.",
          },
        ]
      : []),
  ]);
  const op: S = {
    operationId: `${method}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`,
    summary,
    tags: [path.split("/")[1]],
    "x-roles": options.roles ?? operational,
    description:
      options.description ??
      "Autorización backend por rol y recurso; JEFE_OBRA limitado a sus obras y sin campos económicos.",
    parameters,
    responses: {
      ...errors,
      [status]: {
        description: "Operación completada",
        content: {
          [mime]: {
            schema: options.raw
              ? response
              : options.list
                ? paginated(response)
                : data(response),
          },
        },
      },
    },
    security: options.public ? [] : [{ session: [] }],
  };
  if (!["get", "head", "options"].includes(method))
    op.parameters.push({
      name: "Origin",
      in: "header",
      required: true,
      schema: { type: "string", format: "uri" },
      description:
        "Origen público exacto APP_ORIGIN; el proxy debe preservarlo. No usar cookies de terceros.",
    });
  if (options.input)
    op.requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: options.input,
          ...(options.example === undefined
            ? {}
            : { example: options.example }),
        },
      },
    };
  paths[path] ??= {};
  paths[path][method] = op;
}
const userInput = obj({
  email: { type: "string", format: "email", maxLength: 254 },
  name: { type: "string", minLength: 1, maxLength: 200 },
  password: { type: "string", minLength: 8, maxLength: 128, writeOnly: true },
  role: ref("Role"),
});
add("UserInput", userInput);
add("UserPatch", obj({ ...userInput.properties, active: bool }, []));
operation(
  "/auth/login",
  "post",
  "Iniciar sesión",
  obj({ id, name: str, role: ref("Role") }),
  {
    public: true,
    input: obj({
      email: { type: "string", format: "email" },
      password: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        writeOnly: true,
      },
    }),
    example: { email: "usuario@example.com", password: "contraseña-ejemplo" },
    description:
      "Scrypt. Cupo PostgreSQL de 10 intentos cada 15 minutos por cliente opaco (ceo_login_client), compartido entre emails; nunca bloquea la cuenta. Valores de cookie desconocidos se reemplazan por tokens aleatorios del servidor, guardados sólo como hash. Ante 401 y 429 RATE_LIMITED también se conserva Set-Cookie del cliente; AUTH_BUSY puede responder antes de identificarlo. Admisión adicional por proceso: máximo 2 verificaciones simultáneas y token bucket de 20/s con ráfaga máxima 20, incluso si se rotan cookies. 429 incluye Retry-After en segundos. No usa IP ni encabezados reenviados. Cookie de sesión ceo_session de 12 horas, HttpOnly SameSite=Lax Secure en producción. El cupo de cliente puede eludirse borrando cookies; la admisión global del proceso permanece activa. No es defensa contra DDoS distribuido.",
  },
);
paths["/auth/login"].post.parameters = [
  ...paths["/auth/login"].post.parameters,
  {
    name: "ceo_login_client",
    in: "cookie",
    required: false,
    description:
      "Cookie opaca emitida por el servidor; reenviar automáticamente, incluso después de 401/429.",
    schema: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
];
paths["/auth/login"].post.responses[200].headers = {
  "Set-Cookie": {
    schema: str,
    description:
      "Dos campos Set-Cookie separados: ceo_session (Max-Age=43200) y ceo_login_client (Max-Age=900). Ambos HttpOnly; SameSite=Lax; Path=/; Secure en producción; sin Domain. El proxy debe preservar ambos campos sin concatenarlos ni descartarlos.",
  },
};
for (const code of [401, 429]) {
  // Error definitions are shared by other operations; specialize only login.
  paths["/auth/login"].post.responses[code] = structuredClone(
    paths["/auth/login"].post.responses[code],
  );
  paths["/auth/login"].post.responses[code].headers = {
    "Set-Cookie": {
      schema: str,
      description:
        "ceo_login_client opaca HttpOnly; conservar aun en respuestas de error. Opcional en AUTH_BUSY (admisión rechazada antes de identificar cliente). Sin credenciales ni email.",
    },
    ...(code === 429
      ? {
          "Retry-After": {
            schema: { type: "integer", minimum: 1, maximum: 900 },
            description:
              "Segundos sugeridos: hasta fin del cupo cliente (RATE_LIMITED), o 1 segundo por capacidad/tasa del proceso (AUTH_BUSY).",
          },
        }
      : {}),
  };
}
operation("/auth/logout", "post", "Cerrar sesión", obj({ loggedOut: bool }));
operation("/auth/me", "get", "Usuario actual", ref("User"));
paths["/auth/me"].get["x-roles"] = roles;
paths["/auth/logout"].post["x-roles"] = roles;
paths["/auth/login"].post["x-roles"] = roles;
operation(
  "/budget-editor",
  "post",
  "Crear presupuesto desde plantilla o revisión",
  ref("Budget"),
  {
    roles: writers,
    input: ref("EditorCreateInput"),
    idempotent: true,
    status: 201,
  },
);
add(
  "BaseTemplateInfo",
  obj({
    sourceSha256: str,
    notice: str,
    activities: integer,
    issues: arr(obj({ row: integer, message: str })),
  }),
);
operation(
  "/budget-templates/base",
  "get",
  "Consultar procedencia y observaciones de la BASE real",
  ref("BaseTemplateInfo"),
  { roles: commercial },
);
operation(
  "/budget-templates/base",
  "post",
  "Incorporar BASE normalizada por acción explícita",
  ref("BudgetTemplate"),
  { roles: writers, idempotent: true, status: 201 },
);
operation(
  "/budget-editor/{id}",
  "get",
  "Espacio de trabajo de presupuesto",
  ref("BudgetEditor"),
  { roles: commercial },
);
operation(
  "/budget-editor/{id}",
  "put",
  "Guardar borrador con revisión optimista",
  ref("BudgetDraft"),
  { roles: writers, input: ref("DraftSaveInput") },
);
operation(
  "/budget-editor/{id}/calculate",
  "post",
  "Recalcular sin guardar",
  ref("CommercialCalculation"),
  { roles: commercial, input: ref("EditorContent") },
);
add(
  "DraftPriceChanges",
  obj({
    changes: arr(
      obj({
        lineKey: id,
        materialId: id,
        name: str,
        previous: nullable(dec),
        next: dec,
        sourcePriceId: id,
        effectiveAt: { type: "string", format: "date-time" },
        source: nullable(str),
        manual: bool,
      }),
    ),
  }),
);
operation(
  "/budget-editor/{id}/price-updates",
  "post",
  "Revisar diferencias de precios sin modificar el borrador",
  ref("DraftPriceChanges"),
  { roles: writers, input: ref("EditorContent") },
);
operation(
  "/budget-editor/{id}/issue",
  "post",
  "Emitir revisión comercial",
  ref("IssuedVersion"),
  { roles: writers, input: ref("IssueInput"), idempotent: true, status: 201 },
);
operation(
  "/budget-editor/{id}/preview",
  "post",
  "Previsualizar PDF sin emitir",
  str,
  {
    roles: writers,
    input: ref("EditorContent"),
    raw: true,
    mime: "application/pdf",
  },
);
operation(
  "/budget-issues/{id}/pdf",
  "get",
  "Descargar revisión comercial conservada",
  str,
  { roles: commercial, raw: true, mime: "application/pdf" },
);
operation(
  "/budget-templates",
  "get",
  "Plantillas de presupuesto",
  arr(ref("BudgetTemplate")),
  { roles: commercial },
);
operation(
  "/budget-templates",
  "post",
  "Guardar plantilla reutilizable",
  ref("BudgetTemplate"),
  { roles: writers, input: ref("TemplateInput"), status: 201 },
);
operation(
  "/quantity-expression",
  "post",
  "Resolver cantidad auxiliar",
  obj({ quantity: dec }),
  {
    roles: writers,
    input: obj({ expression: { type: "string", maxLength: 200 } }),
  },
);
operation(
  "/order-administration",
  "get",
  "Consultar referencias informativas de factura",
  ref("AdministrativeOrder"),
  { roles: ["GERENCIA", "COMPRAS", "ADMINISTRACION"], list: true },
);
operation(
  "/order-administration/{id}",
  "get",
  "Referencia informativa de una OC",
  ref("AdministrativeOrder"),
  { roles: ["GERENCIA", "COMPRAS", "ADMINISTRACION"] },
);
operation(
  "/order-administration/{id}/invoice",
  "put",
  "Registrar número e importe de factura",
  ref("OrderInvoiceInfo"),
  { roles: buyers, input: ref("InvoiceInfoInput") },
);
operation(
  "/order-administration/{id}/payment",
  "put",
  "Marcar pago informativo",
  ref("OrderInvoiceInfo"),
  {
    roles: ["GERENCIA", "COMPRAS", "ADMINISTRACION"],
    input: ref("PaymentStatusInput"),
  },
);
operation(
  "/reception-delegations/{id}",
  "get",
  "Destinos delegados al usuario",
  arr(obj({ locationId: id })),
  { roles: ["GERENCIA"] },
);
operation(
  "/reception-delegations/{id}",
  "put",
  "Reemplazar delegaciones de recepción",
  obj({ locationIds: arr(id) }),
  { roles: ["GERENCIA"], input: ref("DelegationInput") },
);
operation(
  "/receipt-desk",
  "get",
  "Recepciones delegadas sin datos económicos",
  ref("DelegatedOrder"),
  { roles, list: true },
);
zod("LaborResourceInput", laborResourceSchema);
zod("LaborResourcePatch", laborResourcePatchSchema);
zod("CostReviewInput", costReviewSchema);
zod("CostApplyInput", costApplySchema);
zod('CompositionReplacement', compositionReplacementSchema);
add(
  "ReferenceCostChange",
  obj({
    key: str,
    lineKey: id,
    kind: { enum: ["MATERIAL", "LABOR", "COMPOSITION"] },
    index: integer,
    name: str,
    previous: nullable(dec),
    next: dec,
    sourceId: id,
    source: nullable(str),
    dateLabel: nullable(str),
    datePrecision: str,
    manual: bool,
    replacement: ref('CompositionReplacement'),
  }, ['key', 'lineKey', 'kind', 'index', 'name', 'previous', 'next', 'sourceId', 'source', 'dateLabel', 'datePrecision', 'manual']),
);
add(
  "ReferenceCostReview",
  obj({
    revision: integer,
    changes: arr(ref("ReferenceCostChange")),
    planHash: str,
    before: ref("CommercialCalculation"),
    after: ref("CommercialCalculation"),
  }),
);
operation(
  "/budget-editor/{id}/cost-review",
  "post",
  "Previsualizar materiales y MO sin escribir",
  ref("ReferenceCostReview"),
  { roles: writers, input: ref("CostReviewInput") },
);
operation(
  "/budget-editor/{id}/apply-cost-review",
  "post",
  "Aplicar cambios seleccionados con control de borrador y referencias",
  ref("BudgetDraft"),
  { roles: writers, input: ref("CostApplyInput") },
);
zod("LaborRateInput", laborRateSchema);
zod("ActivityCostingInput", activityCostingWriteSchema);
zod("ResolvedActivityCost", resolvedActivitySchema);
extend("LaborResourceDetail", "LaborResource", {
  rates: arr(ref("LaborRate")),
});
schemas.LaborResourceDetail.properties.linkedActivities = arr(
  obj({ id, name: str }),
);
extend("LaborRateCreated", "LaborRate", { linkedActivities: arr(id) });
operation(
  "/labor-resources",
  "get",
  "Consultar conceptos y referencias de mano de obra",
  ref("LaborResourceDetail"),
  { roles: commercial, list: true, queries: [q("q")] },
);
operation(
  "/labor-resources/{id}",
  "get",
  "Consultar concepto y tarifas históricas",
  ref("LaborResourceDetail"),
  { roles: commercial },
);
operation(
  "/labor-resources/{id}",
  "patch",
  "Actualizar descripción o disponibilidad sin borrar tarifas",
  ref("LaborResource"),
  { roles: writers, input: ref("LaborResourcePatch") },
);
operation(
  "/labor-resources",
  "post",
  "Crear concepto de mano de obra",
  ref("LaborResource"),
  { roles: writers, input: ref("LaborResourceInput"), status: 201 },
);
operation(
  "/labor-rates",
  "get",
  "Consultar historial paginado de tarifas",
  ref("LaborRate"),
  { roles: commercial, list: true, queries: [q("resourceId", id, true)] },
);
operation(
  "/labor-rates",
  "post",
  "Registrar tarifa sin modificar presupuestos",
  ref("LaborRateCreated"),
  { roles: writers, input: ref("LaborRateInput"), status: 201 },
);
operation(
  "/activity-costing/{id}",
  "get",
  "Resolver costo de actividad con referencias seleccionadas",
  nullable(ref("ResolvedActivityCost")),
  { roles: commercial },
);
operation(
  "/activity-costing/{id}",
  "put",
  "Actualizar selección y composición con revisión optimista",
  ref("ActivityCosting"),
  { roles: writers, input: ref("ActivityCostingInput") },
);
operation(
  "/activity-costing/{id}/preview",
  "post",
  "Previsualizar composición sin guardar",
  obj({
    laborCost: nullable(dec),
    materialCost: nullable(dec),
    directCost: nullable(dec),
    totalUnitCost: nullable(dec),
  }),
  {
    roles: writers,
    input: zod(
      "ActivityCostingContent",
      activityCostingWriteSchema.shape.content,
    ),
  },
);
operation(
  "/price-files",
  "post",
  "Leer archivo XLSX/CSV limitado sin ejecutar contenido activo",
  ref("PriceFileSheets"),
  { roles: commercial, input: ref("PriceFileInput") },
);
operation(
  "/price-mapping",
  "post",
  "Resolver columnas contra catálogo exacto",
  obj({
    rows: arr(ref("Import_prices_Row")),
    errors: arr(obj({ row: integer, message: str })),
  }),
  { roles: commercial, input: ref("PriceMappingInput") },
);
operation(
  "/price-comparison",
  "get",
  "Comparar hasta tres referencias vigentes",
  ref("PriceComparison"),
  {
    roles: commercial,
    queries: [q("materialId", id, true), q("supplierIds", str, true)],
  },
);
operation(
  "/price-review/{id}",
  "post",
  "Registrar revisión mensual sin cambiar precios",
  obj({ reviewedAt: { type: "string", format: "date-time" } }),
  { roles: commercial },
);
operation(
  "/net-needs",
  "get",
  "Necesidad neta de obra sin duplicar documentos",
  ref("NetNeeds"),
  { queries: [q("workId", id, true)] },
);
for (const kind of ["clients", "purchases"]) {
  const access = kind === "clients" ? ["GERENCIA"] : commercial,
    queries = ["clientId", "workId", "supplierId", "from", "to", "status"].map(
      (k) => q(k),
    );
  operation(
    `/reports/${kind}`,
    "get",
    kind === "clients"
      ? "Indicadores por cliente"
      : "Compras por obra y proveedor",
    obj({
      data: ref(kind === "clients" ? "ClientIndicators" : "PurchasesReport"),
      pagination: ref("Pagination"),
    }),
    { roles: access, raw: true, queries: [...queries, ...paging] },
  );
  operation(
    `/reports/${kind}/export`,
    "get",
    "Exportar informe completo conciliado",
    str,
    {
      roles: access,
      raw: true,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      queries,
    },
  );
}
operation("/users", "get", "Listar usuarios", ref("User"), {
  roles: ["GERENCIA"],
  list: true,
});
operation("/users", "post", "Crear usuario", ref("User"), {
  roles: ["GERENCIA"],
  input: ref("UserInput"),
  status: 201,
});
operation("/users/{id}", "patch", "Editar usuario", ref("User"), {
  roles: ["GERENCIA"],
  input: ref("UserPatch"),
  description:
    "Cambio de rol, contraseña o desactivación revoca sesiones; conserva al menos una Gerencia activa.",
});
operation(
  "/users/{id}/assignments",
  "get",
  "Obras asignadas",
  arr(obj({ workId: id })),
  { roles: ["GERENCIA"] },
);
operation(
  "/users/{id}/assignments",
  "put",
  "Reemplazar obras asignadas",
  obj({ workIds: arr(id) }),
  {
    roles: ["GERENCIA"],
    input: obj({ workIds: { type: "array", items: id, maxItems: 1000 } }),
  },
);

const catalog = [
  ["works", "Work", "WorkInput", "WorkPatch", ["GERENCIA"]],
  ["clients", "Client", "ClientInput", "ClientPatch", ["GERENCIA", "COMPUTO"]],
  ["units", "Unit", "UnitInput", "UnitPatch", writers],
  ["categories", "Category", "NamedInput", "NamedPatch", writers],
  ["suppliers", "Supplier", "SupplierInput", "SupplierPatch", buyers],
  ["materials", "Material", "MaterialInput", "MaterialPatch", commercial],
  ["presentations", "Presentation", "PresentationInput", null, commercial],
  ["prices", "MaterialPrice", "PriceInput", null, commercial],
] as const;
for (const [resource, model, input, patch, writeRoles] of catalog) {
  const readRoles = ["suppliers", "prices", "clients"].includes(resource)
    ? commercial
    : operational;
  const enriched =
    resource === "works"
      ? "WorkList"
      : resource === "clients"
        ? "ClientList"
        : resource === "materials"
          ? "MaterialDetail"
          : model;
  const filters: Record<string, string[]> = {
    works: ["status", "q", "search"],
    clients: ["search", "q", "active"],
    suppliers: ["search", "q", "active"],
    materials: ["search", "q", "categoryId", "active"],
    presentations: ["materialId"],
    prices: ["materialId", "supplierId"],
  };
  operation(`/${resource}`, "get", `Listar ${resource}`, ref(enriched), {
    roles: readRoles,
    list: true,
    queries: (filters[resource] ?? []).map((name) =>
      q(
        name,
        name === "status"
          ? ref("WorkStatus")
          : name === "active"
            ? { type: "string", enum: ["true", "false"] }
            : str,
      ),
    ),
  });
  operation(
    `/${resource}/{id}`,
    "get",
    `Consultar ${resource}`,
    ref(
      resource === "works"
        ? "WorkDetail"
        : resource === "clients"
          ? "ClientDetail"
          : enriched,
    ),
    { roles: readRoles },
  );
  operation(`/${resource}`, "post", `Crear ${resource}`, ref(model), {
    roles: [...writeRoles],
    input: ref(input),
    status: 201,
  });
  if (patch)
    operation(`/${resource}/{id}`, "patch", `Editar ${resource}`, ref(model), {
      roles: [...writeRoles],
      input: ref(patch),
    });
  if (resource === "presentations")
    operation(
      "/presentations/{id}",
      "patch",
      "Activar/desactivar presentación",
      ref("Presentation"),
      { roles: commercial, input: obj({ active: bool }) },
    );
}
operation("/locations", "get", "Listar ubicaciones", ref("VisibleLocation"), {
  list: true,
  description:
    "Jefe recibe obras asignadas y metadatos mínimos id/code/name/kind/active de galpones/patios activos para devolver. No habilita stock global ni otras obras.",
});
operation(
  "/locations/{id}",
  "get",
  "Consultar ubicación",
  ref("VisibleLocation"),
);
operation("/locations", "post", "Crear galpón o patio", ref("Location"), {
  roles: ["GERENCIA"],
  input: obj(
    {
      code: str,
      name: str,
      kind: { type: "string", enum: ["WAREHOUSE", "YARD"] },
      active: bool,
    },
    ["code", "name", "kind"],
  ),
  status: 201,
});
operation("/locations/{id}", "patch", "Editar ubicación", ref("Location"), {
  roles: ["GERENCIA"],
  input: obj({ code: str, name: str, active: bool }, []),
});
operation("/audit", "get", "Registro de auditoría", ref("AuditEntry"), {
  roles: ["GERENCIA"],
  list: true,
  queries: [
    q("entity", {
      type: "string",
      description:
        "Tipo de entidad textual: Work, Material, PurchaseOrder, Receipt, BudgetVersion, etc. No enum cerrado; refleja acciones de módulos.",
    }),
    q("entityId"),
    q("actorId"),
    q("action"),
    q("from", { type: "string", format: "date-time" }),
    q("to", { type: "string", format: "date-time" }),
  ],
  description:
    "Filtros combinables y paginación global; from/to ISO8601 inclusivos, from<=to. Actor sólo nombre; antes/después de UPDATE Work completos. Orden createdAt,id descendente.",
});

for (const [resource, model, input, detail] of [
  ["apu-items", "ApuDetail", "ApuInput", "ApuDetail"],
  ["computations", "Computation", "ComputationInput", "ComputationDetail"],
  ["budgets", "Budget", "BudgetInput", "BudgetDetail"],
]) {
  operation(`/${resource}`, "get", `Listar ${resource}`, ref(model), {
    roles: commercial,
    list: true,
    queries: [q(resource === "apu-items" ? "categoryId" : "workId")],
    description: "Paginación: page=1; pageSize=25 por defecto (máximo 100).",
  });
  paths[`/${resource}`].get.parameters.find(
    (p: any) => p.name === "pageSize",
  ).schema.default = 25;
  operation(`/${resource}/{id}`, "get", `Consultar ${resource}`, ref(detail), {
    roles: commercial,
  });
  operation(
    `/${resource}`,
    "post",
    `Crear ${resource}`,
    ref(resource === "computations" ? "ComputationWriteResult" : model),
    { roles: writers, input: ref(input), status: 201 },
  );
  if (resource !== "budgets")
    operation(
      `/${resource}/{id}`,
      "patch",
      `Reemplazar ${resource}`,
      ref(resource === "computations" ? "ComputationWriteResult" : model),
      {
        roles: writers,
        input: ref(resource === "computations" ? "ComputationPatch" : input),
        description:
          resource === "computations"
            ? "Reemplazo completo. lines[].id opcional debe pertenecer a este cómputo y no repetirse; conserva identidad. Sin id conserva renglón si itemId es único antes/después. APU duplicados requieren id para conservarla; sin él se recrean. Snapshots anteriores no cambian."
            : "Reemplazo completo, incluidos componentes/renglones. No es un PATCH parcial.",
      },
    );
}
operation(
  "/apu-items/{id}/calculate",
  "post",
  "Calcular APU con valoración explícita",
  ref("BudgetCalculation"),
  { roles: commercial, input: ref("ValuationInput") },
);
operation(
  "/budgets/{id}/versions",
  "post",
  "Crear versión inmutable",
  ref("VersionCreated"),
  {
    roles: writers,
    input: ref("VersionInput"),
    status: 201,
    idempotent: true,
    description:
      "Idempotency-Key obligatorio por actor/presupuesto: misma clave y cuerpo conserva201 y snapshot, incluso en concurrencia; cuerpo distinto409. Snapshot de cantidades, coeficientes y precios. priceId o unitPrice exclusivo por material; no se infiere IVA, moneda ni redondeo.",
  },
);
operation(
  "/budget-versions/{id}",
  "get",
  "Consultar versión",
  ref("VersionDetail"),
  { roles: commercial },
);
operation(
  "/budget-versions/{id}/reference",
  "post",
  "Elegir referencia de obra",
  ref("BudgetVersion"),
  { roles: writers },
);
operation(
  "/budget-versions/{id}/materials",
  "get",
  "Consultar materiales previstos sin costos",
  ref("VersionMaterials"),
);

for (const [resource, detail, input, writeRoles, queries] of [
  [
    "requests",
    "RequestDetail",
    "RequestInput",
    ["GERENCIA", "COMPRAS", "JEFE_OBRA"],
    ["workId", "categoryId", "status"],
  ],
  [
    "quotations",
    "QuotationDetail",
    "QuotationInput",
    buyers,
    ["requestId", "supplierId", "status"],
  ],
  [
    "purchase-orders",
    "VisibleOrder",
    "OrderInput",
    buyers,
    [
      "workId",
      "supplierId",
      "status",
      "requestId",
      "quotationId",
      "destinationId",
    ],
  ],
] as const) {
  operation(`/${resource}`, "get", `Listar ${resource}`, ref(detail), {
    roles: resource === "quotations" ? commercial : roles,
    list: true,
    queries: queries.map((name) =>
      q(
        name,
        name === "status"
          ? ref(
              resource === "requests"
                ? "RequestStatus"
                : resource === "purchase-orders"
                  ? "PurchaseOrderStatus"
                  : "QuotationStatus",
            )
          : str,
      ),
    ),
  });
  operation(`/${resource}/{id}`, "get", `Consultar ${resource}`, ref(detail), {
    roles: resource === "quotations" ? commercial : roles,
  });
  operation(
    `/${resource}`,
    "post",
    `Crear ${resource}`,
    ref(resource === "purchase-orders" ? "OrderWriteResult" : detail),
    {
      roles: [...writeRoles],
      input: ref(input),
      status: 201,
      idempotent: resource === "purchase-orders",
    },
  );
}
operation(
  "/requests/{id}/status",
  "post",
  "Cambiar estado de pedido",
  ref("MaterialRequest"),
  {
    roles: buyers,
    input: obj({
      status: {
        type: "string",
        enum: ["PROCESSING", "COMPLETED", "CANCELLED"],
      },
    }),
  },
);
operation(
  "/requests/{id}/needs",
  "get",
  "Necesidades y disponibilidad",
  ref("Needs"),
  {
    description:
      "alreadyRequested suma pedidos no cancelados de la obra e INCLUYE el pedido consultado; no es cantidad de otros pedidos. Jefe sólo disponibilidad de sus ubicaciones.",
  },
);
operation(
  "/requests/{id}/history",
  "get",
  "Historial del pedido",
  ref("AuditEntry"),
  { list: true },
);
operation(
  "/purchase-orders/{id}/history",
  "get",
  "Historial de la OC",
  ref("AuditEntry"),
  {
    roles: commercial,
    list: true,
    description:
      "Incluye acciones de OC y RECEIVE de Receipt de esa OC. entityType/entityId identifican recibo, after.orderId enlaza OC; actorName y createdAt. Orden cronológico createdAt,id. Jefe consulta recepciones sin historia económica vía /receipts.",
  },
);
operation(
  "/quotations/{requestId}/comparison",
  "get",
  "Comparar cotizaciones de un pedido",
  ref("Comparison"),
  {
    roles: commercial,
    description:
      "El parámetro es requestId (no quotationId). Orden cronológico createdAt,id ascendente; líneas materialId,id. No representa ranking económico ni aprobación automática. Sin ranking monetario cuando monedas o bases impositivas no coinciden/no están especificadas.",
  },
);
operation(
  "/quotations/{id}/select",
  "post",
  "Seleccionar cotización manualmente",
  ref("Quotation"),
  { roles: buyers },
);
operation(
  "/purchase-orders/{id}",
  "patch",
  "Editar OC borrador",
  ref("OrderDetail"),
  {
    roles: buyers,
    input: obj(
      {
        notes: { type: "string", maxLength: 4000 },
        lines: {
          type: "array",
          items: ref("CommercialLineInput"),
          minItems: 1,
          maxItems: 500,
        },
      },
      [],
    ),
  },
);
operation(
  "/purchase-orders/{id}/status",
  "post",
  "Emitir/anular OC",
  ref("OrderDetail"),
  {
    roles: buyers,
    input: obj({ status: { type: "string", enum: ["ISSUED", "CANCELLED"] } }),
  },
);
operation(
  "/purchase-orders/{id}/invoice-reference",
  "put",
  "Registrar referencia de factura",
  ref("OrderDetail"),
  {
    roles: buyers,
    input: obj({
      invoiceNumber: { type: "string", minLength: 1, maxLength: 500 },
    }),
    description:
      "Sólo número; timestamp de carga y actor automáticos. No fecha de pago ni datos contables.",
  },
);
operation(
  "/purchase-orders/{id}/receipts",
  "post",
  "Confirmar recepción parcial o total",
  ref("ReceiptWriteResult"),
  {
    roles,
    input: ref("ReceiptInput"),
    status: 201,
    idempotent: true,
  },
);
operation(
  "/purchase-orders/{id}/receipts",
  "get",
  "Listar recepciones",
  ref("ReceiptDetail"),
  { list: true },
);
operation("/purchase-orders/{id}/pdf", "get", "Descargar OC", str, {
  roles: commercial,
  mime: "application/pdf",
  raw: true,
});

operation(
  "/stock",
  "get",
  "Stock físico, reservado, disponible y mínimos",
  ref("Stock"),
  { list: true, queries: [q("materialId"), q("locationId")] },
);
operation(
  "/stock/{locationId}/minimum",
  "put",
  "Configurar mínimo por ubicación",
  ref("StockBalance"),
  {
    roles: buyers,
    input: obj({
      materialId: id,
      minimum: nullable({
        type: "string",
        pattern: "^(0|[1-9]\\d{0,15})(\\.\\d{1,8})?$",
      }),
    }),
  },
);
operation(
  "/stock/alerts",
  "get",
  "Alertas de mínimo, incluidos materiales sin saldo",
  ref("StockAlert"),
  {
    list: true,
    queries: [q("materialId"), q("locationId")],
    description:
      "Materiales/ubicaciones activos con disponible menor al mínimo efectivo positivo. Incluye pares sin StockBalance como físico/reservado cero, balanceId null. Override de mínimo 0 desactiva alerta por ubicación. JEFE_OBRA sólo sus obras.",
  },
);
operation("/reservations", "get", "Listar reservas", ref("Reservation"), {
  list: true,
  queries: [q("workId"), q("materialId")],
});
operation("/reservations/{id}", "get", "Consultar reserva", ref("Reservation"));
operation(
  "/reservations",
  "post",
  "Reservar disponibilidad",
  ref("Reservation"),
  {
    roles: buyers,
    input: ref("ReservationInput"),
    status: 201,
    idempotent: true,
  },
);
operation(
  "/reservations/{id}/cancel",
  "post",
  "Cancelar saldo pendiente de reserva",
  ref("Reservation"),
  { roles: buyers },
);
operation(
  "/movements",
  "get",
  "Historial de movimientos",
  ref("MovementDetail"),
  { list: true, queries: [q("materialId"), q("workId"), q("locationId")] },
);
operation(
  "/movements",
  "post",
  "Confirmar movimiento",
  ref("MovementWriteResult"),
  {
    roles: ["GERENCIA", "COMPRAS", "JEFE_OBRA"],
    input: ref("MovementInput"),
    status: 201,
    idempotent: true,
    description:
      "INITIAL/ADJUSTMENT: GERENCIA; TRANSFER: GERENCIA/COMPRAS; CONSUMPTION/RETURN: también JEFE_OBRA en sus obras. INITIAL sólo apertura material/ubicación sin movimientos previos; ajustes requieren reason y direction. Transferencia puede satisfacer reserva parcial. CONSUMPTION exige sourceId de obra; RETURN de obra a galpón/patio; workId si informado debe coincidir.",
  },
);

const reportQueries = [
  q("workId", id, true),
  q("categoryId"),
  q("materialId"),
  q("versionId"),
  ...paging,
];
operation(
  "/reports/materials",
  "get",
  "Seguimiento de cantidades materiales",
  obj({ data: ref("MaterialReport"), pagination: ref("Pagination") }),
  { raw: true, queries: reportQueries },
);
for (const path of ["/reports/materials/export", "/exports/materials-report"])
  operation(path, "get", "Exportar seguimiento a Excel", str, {
    raw: true,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    queries: reportQueries,
    description:
      "Exporta todas las filas del informe; page/pageSize se validan pero no recortan el archivo.",
  });
for (const kind of [
  "materials",
  "suppliers",
  "prices",
  "works",
  "stock",
  "purchase-orders",
])
  operation(`/exports/${kind}`, "get", `Exportar ${kind} a Excel`, str, {
    roles: ["suppliers", "prices", "purchase-orders"].includes(kind)
      ? commercial
      : roles,
    raw: true,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    description:
      "Archivo XLSX; máximo 10000 registros; obras/stock restringidos para JEFE_OBRA.",
  });
for (const [kind, rowSchema] of Object.entries(importSchemas)) {
  const row = zod(`Import_${kind.replace("-", "_")}_Row`, rowSchema);
  const properties = {
    rows: { type: "array", items: row, minItems: 1, maxItems: 1000 },
    csv: { type: "string", maxLength: 1500000 },
    confirmationHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
    reviewPrices: bool,
    baselineHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  };
  const input = {
    ...obj(properties, []),
    oneOf: [
      { required: ["rows"], not: { required: ["csv"] } },
      { required: ["csv"], not: { required: ["rows"] } },
    ],
  };
  operation(`/imports/${kind}/template`, "get", `Plantilla CSV ${kind}`, str, {
    roles: kind === "prices" ? commercial : ["GERENCIA"],
    raw: true,
    mime: "text/csv",
  });
  operation(
    `/imports/${kind}/preview`,
    "post",
    `Validar ${kind} sin escribir`,
    obj(
      {
        valid: bool,
        rowCount: integer,
        errors: arr(obj({ row: integer, message: str })),
        confirmationHash: str,
        baselineHash: str,
        normalizedRows: arr(row),
        differences: arr(
          obj({
            row: integer,
            materialCode: str,
            previous: nullable(
              obj({
                id,
                materialId: id,
                supplierId: nullable(id),
                presentationId: nullable(id),
                price: dec,
                baseQuantity: dec,
                currency: str,
                taxBasis: ref("TaxBasis"),
                effectiveAt: { type: "string", format: "date-time" },
              }),
            ),
            newPrice: dec,
            baseQuantity: dec,
            currency: str,
            taxBasis: ref("TaxBasis"),
            effectiveAt: str,
          }),
        ),
      },
      ["valid", "rowCount", "errors", "confirmationHash"],
    ),
    {
      roles: kind === "prices" ? commercial : ["GERENCIA"],
      input,
      description:
        "Usar rows JSON o csv RFC4180 con coma y encabezados; campos numéricos como texto. No cambia la base. Devuelve rowCount y errores: fila1 es primera fila de datos, sin encabezado. No devuelve filas normalizadas; la vista de contenido CSV/JSON se arma localmente y no debe presentarse como transformación validada.",
    },
  );
  operation(
    `/imports/${kind}/commit`,
    "post",
    `Importar ${kind} atómicamente`,
    obj({ importedRows: integer, createdIds: arr(id), confirmationHash: str }),
    {
      roles: kind === "prices" ? commercial : ["GERENCIA"],
      input: { ...input, required: ["confirmationHash"] },
      status: 201,
      idempotent: true,
      description:
        "Requiere confirmationHash del preview para los mismos datos. Revalida referencias y rechaza duplicados por externalCode. OC abiertas agrupadas por externalCode. No se ejecutó migración real de CEO Obras.",
    },
  );
}
operation(
  "/api/health",
  "get",
  "Verificar API y PostgreSQL",
  obj({
    status: { const: "ok" },
    service: { const: "ceo-api" },
    database: { const: "connected" },
  }),
  {
    public: true,
    raw: true,
    description: "Consulta SELECT 1. 503 si PostgreSQL no responde.",
  },
);
paths["/api/health"].get.servers = [{ url: "/" }];
paths["/api/health"].get.responses[503] = {
  description: "Base de datos no disponible",
  content: {
    "application/json": {
      schema: obj({
        status: { const: "unavailable" },
        service: { const: "ceo-api" },
      }),
    },
  },
};
function example(schema: S, depth = 0): unknown {
  if (depth > 12) return null;
  if (schema.$ref)
    return example(schemas[schema.$ref.split("/").pop()!], depth + 1);
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.anyOf) return example(schema.anyOf[0], depth + 1);
  if (schema.type === "object")
    return Object.fromEntries(
      (schema.required ?? []).map((key: string) => [
        key,
        example(schema.properties[key], depth + 1),
      ]),
    );
  if (schema.type === "array")
    return schema.minItems ? [example(schema.items, depth + 1)] : [];
  if (schema.type === "integer" || schema.type === "number")
    return schema.minimum ?? 1;
  if (schema.type === "boolean") return true;
  if (schema.format === "date-time") return "2026-10-22T12:00:00.000Z";
  if (schema.format === "email") return "usuario@example.test";
  if (schema.pattern?.includes("[A-Z]")) return "ARS";
  if (schema.pattern?.includes("d") || schema.pattern?.includes("0-9"))
    return schema.pattern.includes("64") ? "a".repeat(64) : "1";
  if (schema.writeOnly) return "contraseña-de-ejemplo";
  return "ejemplo";
}
for (const path of Object.values(paths))
  for (const op of Object.values(path) as S[]) {
    const content = op.requestBody?.content?.["application/json"];
    if (content && !("example" in content)) {
      const base = example(content.schema) as S;
      const source = content.schema.$ref
        ? schemas[content.schema.$ref.split("/").pop()!]
        : content.schema;
      if (source.oneOf && source.properties?.rows) {
        base.rows = [example(source.properties.rows.items)];
        if (op.summary.startsWith("Importar"))
          base.confirmationHash = "a".repeat(64);
      }
      if (content.schema.$ref === "#/components/schemas/MovementInput") {
        base.type = "INITIAL";
        base.destinationId = "ubicacion-id";
      }
      content.example = base;
    }
  }
export const document = {
  openapi: "3.1.0",
  info: {
    title: "CEO Construcciones — Backend V1",
    version: "1.0.0",
    description:
      "Contrato API en español. Proxy same-origin del frontend debe reenviar Cookie, Set-Cookie y Origin exacto APP_ORIGIN; nunca DATABASE_URL. Cookies HttpOnly, sin CORS abierto. Cantidades y precios como texto decimal. Los permisos operativos son una matriz conservadora pendiente de validación CEO. Errores uniformes; ningún endpoint de jefe devuelve campos económicos.",
  },
  servers: [
    {
      url: "/api/v1",
      description: "Mismo origen público mediante proxy seguro",
    },
  ],
  security: [{ session: [] }],
  paths,
  components: {
    securitySchemes: {
      session: {
        type: "apiKey",
        in: "cookie",
        name: "ceo_session",
        description:
          "Token opaco HttpOnly, Secure en producción, SameSite=Lax. Sesión 12 horas; revocada en logout o cambio sensible.",
      },
    },
    schemas,
  },
};
if (process.argv[1]?.endsWith("generate-openapi.ts")) {
  const directory = resolve(import.meta.dirname, "../docs/api");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    resolve(directory, "openapi.json"),
    JSON.stringify(document, null, 2) + "\n",
  );
  console.info(
    `OpenAPI: ${Object.keys(paths).length} rutas, ${Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0)} operaciones.`,
  );
}
