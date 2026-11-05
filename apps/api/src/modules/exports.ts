import ExcelJS from "exceljs";
import { type Actor, requireRoles } from "../core/auth";
const safeText=(value:unknown)=>typeof value==='string' && /^[\s]*[=+@-]/.test(value) ? "'"+value : value;
export async function xlsxResponse(
  name: string,
  columns: string[],
  rows: unknown[][],
  context?: Record<string, unknown>,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CEO Construcciones";
  const sheet = workbook.addWorksheet(name.slice(0, 31));
  sheet.addRow(columns);
  for (const row of rows) sheet.addRow(row.map(safeText));
  if (context) {
    const meta = workbook.addWorksheet("Contexto");
    meta.addRow(["Contexto", "Valor"]);
    for (const [key, value] of Object.entries(context))
      meta.addRow([
        safeText(key),
        safeText(typeof value === "object" ? JSON.stringify(value) : String(value)),
      ]);
    meta.columns.forEach((c) => (c.width = 45));
  }
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
  const { handlerSelections } = await import("./selections");
  const filters = Object.fromEntries(new URL(request.url).searchParams);
  delete filters.page;
  delete filters.pageSize;
  const delegated = new Request(
    new URL("/api/v1/selections/export", request.url),
    {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify({ resource: kind, filters }),
    },
  );
  return handlerSelections(delegated, actor, ["selections", "export"]);
}
