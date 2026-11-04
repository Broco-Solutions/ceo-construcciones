/** Bounded symbolic reader of the documented BIFF cost references. No eval,
 * workbook engine, external links, macros or inferred physical quantities. */
import { Prisma } from "@prisma/client";
export type SourceSheet = {
  name: string;
  rows: unknown[][];
  formulas?: { row: number; column: number; text: string | null }[];
};
const D = Prisma.Decimal.clone({ precision: 80 });
export type SourceMaterial = {
  name: string;
  unit: string;
  coefficient: string;
  unitPrice: string | null;
  cells: string[];
};
type Value = {
  scalar: Prisma.Decimal;
  materials: SourceMaterial[];
  warnings: string[];
};
const scalar = (n: Prisma.Decimal.Value): Value => ({
  scalar: new D(n),
  materials: [],
  warnings: [],
});
export const sourceUnit = (s: string) =>
  ({
    ML: "m",
    M2: "m²",
    M3: "m³",
    U: "un",
    UN: "un",
    UND: "un",
    GL: "gl",
    KG: "kg",
    LTS: "L",
    L: "L",
    MES: "mes",
    H: "h",
    BOLSA: "bolsa",
  })[s.trim().toUpperCase().replace(/^\//, "")] ?? s.trim();
const number = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? new D(v).toDecimalPlaces(8, D.ROUND_HALF_UP)
    : null;
export function extractComposition(
  sheets: SourceSheet[],
  sheetName: string,
  row: number,
  column = 5,
  exactCoefficients = false,
) {
  const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
    ? exactCoefficients ? new D(String(v)) : new D(v).toDecimalPlaces(8, D.ROUND_HALF_UP) : null;
  const used = new Set<string>(),
    visiting = new Set<string>();
  let visits = 0;
  const failure = (message: string): Value => ({
    ...scalar(0),
    warnings: [message],
  });
  const scale = (v: Value, f: Prisma.Decimal) => ({
    ...v,
    scalar: v.scalar.mul(f),
    materials: v.materials.map((m) => ({
      ...m,
      coefficient: (exactCoefficients ? new D(m.coefficient).mul(f) : new D(m.coefficient).mul(f).toDecimalPlaces(8, D.ROUND_HALF_UP)).toFixed(),
    })),
  });
  const add = (a: Value, b: Value): Value => ({
    scalar: a.scalar.add(b.scalar),
    materials: [...a.materials, ...b.materials],
    warnings: [...a.warnings, ...b.warnings],
  });
  const reference = (
    name: string,
    r: number,
    c: number,
    depth: number,
  ): Value => {
    const cell = `${name}!${String.fromCharCode(64 + c)}${r}`,
      sheet = sheets.find((s) => s.name === name),
      values = sheet?.rows[r - 1];
    used.add(cell);
    if (
      !sheet ||
      !values ||
      depth > 30 ||
      ++visits > 1000 ||
      visiting.has(cell)
    )
      return failure(`${cell}: referencia ausente, cíclica o fuera de límite`);
    const cached = number(values[c - 1]);
    const formula = sheet.formulas?.find(
      (f) => f.row === r && f.column === c,
    )?.text;
    // A price reference is a material term, never a quantity inferred from money.
    if (
      c === 7 &&
      typeof values[1] === "string" &&
      typeof values[4] === "string" &&
      number(values[3]) !== null
    ) {
      const nameValue = String(values[1]).trim(),
        unit = sourceUnit(String(values[4]));
      const warnings: string[] = [];
      const priceRef = formula?.match(
        /^\+?PRECIOS!\$?G\$?(\d+)(?::\$?G\$?\1)?$/,
      );
      if (priceRef) {
        const price = sheets.find((s) => s.name === "PRECIOS")?.rows[
          Number(priceRef[1]) - 1
        ];
        if (price) {
          const priceUnit = String(price[0]).includes("1 BOLSON = 1m3")
            ? "m³"
            : sourceUnit(String(price[2]));
          const panel = String(price[0])
            .toUpperCase()
            .match(/(\d+)X(\d+)X\d+MM/);
          const oneSquareMetre =
            unit === "m²" &&
            priceUnit === "un" &&
            panel &&
            new D(panel[1]).mul(panel[2]).eq(1000000);
          if (oneSquareMetre)
            used.add(
              `PRECIOS!A${priceRef[1]}: placa 1000×1000 mm = 1 m² explícito`,
            );
          if (priceUnit !== unit && !oneSquareMetre)
            warnings.push(
              `${cell}: unidad ${unit} contradice PRECIOS!C${priceRef[1]} (${priceUnit}); no se supone equivalencia`,
            );
        }
      }
      return {
        scalar: new D(0),
        materials: [
          {
            name: nameValue,
            unit,
            coefficient: "1",
            unitPrice: cached?.toFixed() ?? null,
            cells: [cell, `${name}!D${r}`, `${name}!E${r}`],
          },
        ],
        warnings,
      };
    }
    if (name === "PRECIOS" && c === 7 && typeof values[0] === "string") {
      const unit = String(values[0]).includes("1 BOLSON = 1m3")
        ? "m³"
        : sourceUnit(String(values[2]));
      return {
        scalar: new D(0),
        materials: [
          {
            name: String(values[0]).trim(),
            unit,
            coefficient: "1",
            unitPrice: cached?.toFixed() ?? null,
            cells: [cell, `${name}!B${r}`, `${name}!C${r}`],
          },
        ],
        warnings: [],
      };
    }
    // Coefficients and dimensions are explicit cached source inputs. Their
    // underlying Excel expressions are recorded but never executed.
    if ([3, 4, 14, 15].includes(c))
      return cached
        ? scalar(cached)
        : failure(`${cell}: dimensión/consumo sin valor numérico`);
    if (!formula)
      return cached
        ? scalar(cached)
        : values[c - 1] === "" || values[c - 1] == null
          ? scalar(0)
          : failure(`${cell}: valor no numérico`);
    visiting.add(cell);
    let expression = formula;
    const warnings: string[] = [];
    // Division inside a material's extended cost can be amortisation. It is
    // not silently treated as half the physical quantity.
    if (c === 9) {
      const reuse = expression.match(
        new RegExp(`^G${r}\\*D${r}/(\\d+(?:\\.\\d+)?)$`),
      );
      if (reuse) {
        expression = `G${r}*D${r}`;
        warnings.push(
          `${cell}: división de costo por ${reuse[1]} (reutilización/amortización); cantidad física D${r} conservada como orientativa, falta definir uso físico`,
        );
      }
    }
    // A cost uplift on a material subtotal is not a documented yield.
    if (c === 10) {
      const uplift = expression.match(/^SUM\((I\d+:I\d+)\)\*(\d+(?:\.\d+)?)$/);
      if (uplift && new D(uplift[2]).gt(1)) {
        expression = `SUM(${uplift[1]})`;
        warnings.push(
          `${cell}: factor ${uplift[2]} del subtotal sin regla física; no se transforma en rendimiento`,
        );
      }
    }
    try {
      const v = parse(expression, name, depth + 1);
      v.warnings.push(...warnings);
      return v;
    } catch {
      return failure(
        `${cell}: expresión no admitida para extracción física (${formula})`,
      );
    } finally {
      visiting.delete(cell);
    }
  };
  const parse = (expression: string, current: string, depth: number): Value => {
    const regex =
      /(?:'[^']+'|[A-Za-z0-9_-]+)!\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\d+(?:\.\d+)?|SUM|[()+*/,-]/g;
    const tokens = expression.match(regex) ?? [];
    if (tokens.join("").replace(/\s/g, "") !== expression.replace(/\s/g, ""))
      throw Error("Token no admitido");
    let i = 0;
    const atom = (): Value => {
      const t = tokens[i++];
      if (!t) throw Error();
      if (t === "+" || t === "-") {
        const v = atom();
        return t === "-" ? scale(v, new D(-1)) : v;
      }
      if (t === "(") {
        const v = sum();
        if (tokens[i++] !== ")") throw Error();
        return v;
      }
      if (t === "SUM") {
        if (tokens[i++] !== "(") throw Error();
        let v = atom();
        while (tokens[i] === ",") {
          i++;
          v = add(v, atom());
        }
        if (tokens[i++] !== ")") throw Error();
        return v;
      }
      if (/^\d+(?:\.\d+)?$/.test(t)) return scalar(t);
      const ref = t.match(
        /^(?:(?:'([^']+)'|([^!]+))!)?\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/,
      );
      if (!ref) throw Error();
      const name = ref[1] ?? ref[2] ?? current,
        c = ref[3].split("").reduce((n, s) => n * 26 + s.charCodeAt(0) - 64, 0),
        r = Number(ref[4]);
      if (ref[5] && ref[5] !== ref[3])
        throw Error("Rango rectangular no admitido");
      const end = Number(ref[6] ?? r);
      if (end < r || end - r > 500) throw Error();
      let v = scalar(0);
      for (let n = r; n <= end; n++) v = add(v, reference(name, n, c, depth));
      return v;
    };
    const product = (): Value => {
      let v = atom();
      while (tokens[i] === "*" || tokens[i] === "/") {
        const op = tokens[i++],
          b = atom();
        if (b.materials.length) {
          if (v.materials.length || op === "/")
            throw Error("Producto no lineal");
          v = scale(b, v.scalar);
        } else {
          if (op === "/" && b.scalar.isZero()) throw Error();
          const warnings = [...v.warnings, ...b.warnings];
          v = scale(v, op === "*" ? b.scalar : new D(1).div(b.scalar));
          v.warnings = warnings;
        }
      }
      return v;
    };
    const sum = (): Value => {
      let v = product();
      while (tokens[i] === "+" || tokens[i] === "-") {
        const op = tokens[i++],
          b = product();
        v = add(v, op === "+" ? b : scale(b, new D(-1)));
      }
      return v;
    };
    const v = sum();
    if (i !== tokens.length) throw Error();
    return v;
  };
  const value = reference(sheetName, row, column, 0);
  if (!value.scalar.isZero())
    value.warnings.push(
      `${sheetName}!${String.fromCharCode(64 + column)}${row}: importe fijo ${value.scalar.toFixed()} sin desglose físico`,
    );
  const grouped = new Map<string, SourceMaterial>();
  for (const m of value.materials) {
    if (new D(m.coefficient).lte(0)) {
      if (new D(m.coefficient).lt(0))
        value.warnings.push("Consumo negativo no recuperable");
      continue;
    }
    const key = JSON.stringify([m.name.toUpperCase().trim(), m.unit, ...(exactCoefficients ? [m.cells[0]] : [])]),
      old = grouped.get(key);
    if (old) {
      const q = new D(old.coefficient).add(m.coefficient);
      old.unitPrice =
        old.unitPrice === null || m.unitPrice === null
          ? null
          : new D(old.coefficient)
              .mul(old.unitPrice)
              .add(new D(m.coefficient).mul(m.unitPrice))
              .div(q)
              .toDecimalPlaces(8, D.ROUND_HALF_UP)
              .toFixed();
      old.coefficient = q.toFixed();
      old.cells.push(...m.cells);
    } else grouped.set(key, { ...m });
  }
  return {
    materials: [...grouped.values()],
    warnings: [...new Set(value.warnings)],
    cells: [...used],
    missingPrices: [...grouped.values()]
      .filter((m) => m.unitPrice === null)
      .map((m) => m.cells[0]),
  };
}
