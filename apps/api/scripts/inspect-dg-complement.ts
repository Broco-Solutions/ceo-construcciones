/** Controlled DG complement. BIFF decoder reads cached cells, never executes Excel. */
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { inspectCeoCatalog } from "./inspect-ceo-catalog";
import { sourceUnit, type SourceSheet } from "./historical-composition";
export async function inspectDgComplement(path: string) {
  const bytes = await readFile(path),
    hash = createHash("sha256").update(bytes).digest("hex");
  const dir = await mkdtemp(join(tmpdir(), "ceo-dg-"));
  try {
    const output = join(dir, "cached.json");
    const result = spawnSync(
      "uv",
      [
        "run",
        "--no-project",
        "--with",
        "xlrd==2.0.2",
        "python",
        join(__dirname, "read-historical-xls.py"),
        path,
        output,
      ],
      {
        env: {
          ...process.env,
          UV_CACHE_DIR: join(
            homedir(),
            ".local/state/ceo-construcciones-codex/uv-cache",
          ),
        },
        encoding: "utf8",
        timeout: 60000,
      },
    );
    if (result.status !== 0)
      throw Error(
        "No se pudo leer BIFF de forma controlada: " +
          (result.error?.message ?? result.stderr),
      );
    const raw = JSON.parse(await readFile(output, "utf8")) as {
      sha256: string;
      sheets: SourceSheet[];
    };
    if (raw.sha256 !== hash)
      throw Error("El hash DG cambió durante la inspección");
    const base = await inspectCeoCatalog(join(dirname(path), "base.xlsx"));
    const mo = raw.sheets.find((s) => s.name === "MO real ")!;
    if (
      !mo ||
      !mo.rows.some((r) => r.some((c) => String(c).trim() === "JULIO 2026"))
    )
      throw Error("Fecha de categorías DG sin evidencia JULIO 2026");
    const labor = [];
    for (let row = 9; row <= 13; row++)
      for (const [col, unit] of [
        [3, "día"],
        [4, "h"],
      ] as const) {
        const key = `MO real !${col === 3 ? "C" : "D"}${row}`,
          name = String(mo.rows[row - 1][0]).trim(),
          value = mo.rows[row - 1][col - 1];
        const canonical = base.labor.find((l) => l.key === key);
        if (
          !canonical ||
          canonical.name !== name ||
          canonical.unit !== unit ||
          typeof value !== "number" ||
          value < 0
        )
          throw Error(
            "Identidad/tarifa DG sin correspondencia verificable: " + key,
          );
        labor.push({
          key,
          canonicalSourceKey: key,
          name,
          unit,
          kind: "CATEGORY",
          value: new Prisma.Decimal(String(value)).toFixed(),
          date: "2026-07",
          datePrecision: "MONTH",
          source: "DG histórico · MO real · Julio 2026",
          evidence: `DG:${key}; MO real !K6=JULIO 2026; categoría BASE:${key}; nombres y unidades exactos`,
        });
      }
    const prices = raw.sheets.find((s) => s.name === "PRECIOS")!;
    const priceReview = prices.rows.flatMap((row, index) => {
      const name = String(row[0] ?? "").trim();
      if (!name || typeof row[2] !== "string" || !row[2].trim()) return [];
      const unit = sourceUnit(String(row[2])),
        quantity = typeof row[1] === "number" ? String(row[1]) : null;
      const matches = base.prices.filter(
        (p) =>
          p.name === name &&
          p.unit === unit &&
          p.presentationQuantity === quantity,
      );
      const exact = matches.filter(
        (p) =>
          p.net ===
            (typeof row[4] === "number"
              ? new Prisma.Decimal(String(row[4])).toDecimalPlaces(8).toFixed()
              : null) &&
          p.gross ===
            (typeof row[5] === "number"
              ? new Prisma.Decimal(String(row[5])).toDecimalPlaces(8).toFixed()
              : null),
      );
      return [
        {
          key: `DG:PRECIOS!A${index + 1}`,
          name,
          unit,
          quantity,
          baseCandidates: matches.map((p) => p.key),
          status:
            exact.length === 1
              ? "ALREADY_BASE"
              : matches.length
                ? "QUOTE_SCOPE_REQUIRES_REVIEW"
                : "IDENTITY_REQUIRES_REVIEW",
          reason:
            exact.length === 1
              ? "Identidad y cotización neta/bruta ya conservadas en BASE"
              : "DG es un presupuesto particular: no sustituir la referencia BASE ni inferir identidad/canal de una cotización diferente sin confirmación documental",
          original: row.slice(0, 7),
        },
      ];
    });
    const laborReview = mo.rows.flatMap((row, index) => {
      if (
        typeof row[7] !== "string" ||
        typeof row[8] !== "string" ||
        !row[7].trim() ||
        !row[8].trim() ||
        row[7] === row[8] ||
        ["DESCRIPCION", "TOTAL"].includes(row[7])
      )
        return [];
      const name = row[7].trim(),
        unit = sourceUnit(row[8]),
        value =
          typeof row[10] === "number"
            ? new Prisma.Decimal(String(row[10])).toFixed()
            : null;
      const matches = base.labor.filter(
        (l) => l.kind === "SERVICE" && l.name === name && l.unit === unit,
      );
      const combined = index + 1 === 113 || index + 1 === 114;
      return [
        {
          key: `DG:MO real !H${index + 1}:K${index + 1}`,
          name,
          unit,
          value,
          baseCandidates: matches.map((l) => l.key),
          status: combined
            ? "COMBINED_NOT_SALARY"
            : value === null
              ? "NO_QUOTED_VALUE"
              : matches.some((l) => l.value === value)
                ? "ALREADY_BASE"
                : "HISTORICAL_SCOPE_REQUIRES_REVIEW",
          reason: combined
            ? "Suministro y MO combinados: no importar como salario"
            : value === null
              ? "K sin tarifa numérica"
              : matches.some((l) => l.value === value)
                ? "Concepto, unidad y valor ya conservados en BASE"
                : "Servicio de obra histórica; no sustituir una referencia general sin verificar fecha, cotizador y alcance",
        },
      ];
    });
    return {
      format: "ceo-catalog-inventory-v1",
      extractorVersion: 1,
      sourceLogical: "DG-CEO",
      sourceSha256: hash,
      baseSha256: base.sourceSha256,
      categories: [],
      activities: [],
      prices: [],
      labor,
      priceReview,
      laborReview,
      inventory: raw.sheets,
    };
  } finally {
    await rm(dir, { recursive: true });
  }
}
