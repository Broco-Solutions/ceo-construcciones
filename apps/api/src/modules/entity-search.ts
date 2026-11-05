import { listSelection } from "./list-selection";
import { Prisma } from "@prisma/client";
import { db } from "../core/db";
import { ApiError } from "../core/errors";
export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim()
    .replace(/\s+/g, " ");
}
const definitions = {
  works: ["Work", "code", "name"],
  clients: ["Client", "code", "name", "taxId"],
  suppliers: ["Supplier", "code", "name", "taxId"],
  materials: ["Material", "code", "name"],
  "apu-items": ["ApuItem", "code", "name"],
  categories: ["Category", "code", "name"],
  units: ["Unit", "code", "name"],
  locations: ["Location", "code", "name"],
  "labor-resources": ["LaborResource", "code", "name"],
  presentations: ["Presentation", "name"],
  reservations: ["Reservation", "id"],
} as const;
/** Parameterized, extension-free accent matching. IDs are intersected with the
 * caller's authorized predicate BEFORE count/pagination, never in the browser. */
export async function entitySearchWhere(
  resource: keyof typeof definitions,
  query: URLSearchParams,
) {
  const selected = query.get("id");
  if (selected) return { id: selected,...listSelection(query) };
  const search = normalizeSearch(query.get("search") ?? query.get("q") ?? "");
  if (!search) return listSelection(query);
  if (search.length > 200)
    throw new ApiError(
      422,
      "SEARCH_TOO_LONG",
      "Acotá la búsqueda a 200 caracteres.",
    );
  const [table, ...fields] = definitions[resource];
  const expression = Prisma.sql`regexp_replace(regexp_replace(normalize(lower(concat_ws(' ', ${Prisma.join(fields.map((field) => Prisma.raw('"' + field + '"')))})), NFD), ${"[\u0300-\u036f]"}, '', 'g'), '\\s+', ' ', 'g')`;
  const clauses = search
    .split(" ")
    .map((term) => Prisma.sql`position(${term} in ${expression}) > 0`);
  const rows = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT "id" FROM ${Prisma.raw('"' + table + '"')} WHERE ${Prisma.join(clauses, " AND ")}`,
  );
  return { id: { in: rows.map((row) => row.id) },...listSelection(query) };
}
