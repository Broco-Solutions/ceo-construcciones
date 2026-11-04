import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { cached } from "./inspect-ceo-catalog";
type Linear = { constant: Prisma.Decimal; terms: Map<string, Prisma.Decimal> };
const D = Prisma.Decimal.clone({ precision: 80 });
const scalar = (v: Prisma.Decimal.Value): Linear => ({
  constant: new D(v),
  terms: new Map(),
});
/** Bounded, linear dependency reader. Unsupported formula retains an explicit issue.
 * Does not evaluate macros, external links or arbitrary Excel functions. */
export function linearCost(
  book: ExcelJS.Workbook,
  sheet: string,
  address: string,
  leaves: Map<string, string>,
  options: { sumBlanks?: boolean; exact?: boolean; cachedDimensions?: boolean } = {},
) {
  const visiting = new Set<string>(),
    evidence = new Set<string>();
  let visits = 0;
  const scale = (v: Linear, n: Prisma.Decimal): Linear => ({
    constant: v.constant.mul(n),
    terms: new Map([...v.terms].map(([k, c]) => [k, c.mul(n)])),
  });
  const plus = (a: Linear, b: Linear): Linear => {
    const terms = new Map(a.terms);
    for (const [k, c] of b.terms)
      terms.set(k, (terms.get(k) ?? new D(0)).add(c));
    return { constant: a.constant.add(b.constant), terms };
  };
  function cell(s: string, a: string, depth: number, sumMember = false): Linear {
    const key = `${s}!${a.replaceAll("$", "").toUpperCase()}`;
    if (++visits > 2000 || depth > 40 || visiting.has(key))
      throw Error(`${key}: dependencia cíclica o fuera de límite`);
    evidence.add(key);
    const resource = leaves.get(key);
    if (resource)
      return { constant: new D(0), terms: new Map([[resource, new D(1)]]) };
    const target = book.getWorksheet(s)?.getCell(a.replaceAll("$", ""));
    if (!target) throw Error(`${key}: celda no disponible`);
    const formula = target.formula;
    if (options.cachedDimensions && /^(C|D|N|O)\$?\d+$/i.test(a.replaceAll('$', ''))) {
      const value = cached(target.value);
      if (typeof value !== 'number') throw Error(`${key}: dimensión/consumo sin valor numérico`);
      return scalar(String(value));
    }
    if (!formula) {
      const v = cached(target.value);
      if (options.sumBlanks && sumMember && (target.value === null || target.value === undefined || target.value === '')) return scalar(0);
      if (typeof v !== "number" || !Number.isFinite(v))
        throw Error(`${key}: valor numérico ausente`);
      return scalar(String(v));
    }
    visiting.add(key);
    try {
      return expression(formula.replace(/^=/, ""), s, depth + 1);
    } finally {
      visiting.delete(key);
    }
  }
  function expression(input: string, local: string, depth: number): Linear {
    const pattern =
      /\s*(?:('[^']+'|[\w-]+)!\$?([A-Z]+)\$?(\d+)|\$?([A-Z]+)\$?(\d+)|(\d+(?:\.\d+)?)|(SUM)|([+*/(),:-]))/gy;
    const tokens: {
      text: string;
      sheet?: string;
      address?: string;
      number?: string;
      sum?: boolean;
    }[] = [];
    let end = 0,
      m: RegExpExecArray | null;
    while ((m = pattern.exec(input))) {
      end = pattern.lastIndex;
      tokens.push({
        text: m[0].trim(),
        ...(m[2]
          ? { sheet: m[1].replace(/^'|'$/g, ""), address: m[2] + m[3] }
          : m[4]
            ? { sheet: local, address: m[4] + m[5] }
            : m[6]
              ? { number: m[6] }
              : m[7]
                ? { sum: true }
                : {}),
      });
    }
    if (input.slice(end).trim())
      throw Error(`${local}: fórmula no soportada: ${input}`);
    let pos = 0;
    function atom(): Linear {
      const t = tokens[pos++];
      if (!t) throw Error("Expresión incompleta");
      if (t.text === "+") return atom();
      if (t.text === "-") return scale(atom(), new D(-1));
      if (t.number) return scalar(t.number);
      if (t.address) return cell(t.sheet!, t.address, depth + 1);
      if (t.sum) {
        if (tokens[pos++]?.text !== "(") throw Error("SUM inválido");
        let result = scalar(0);
        while (tokens[pos]?.text !== ")") {
          const start = tokens[pos],
            colon = tokens[pos + 1];
          if (start?.address && colon?.text === ":") {
            const finish = tokens[pos + 2];
            if (!finish?.address || start.sheet !== finish.sheet)
              throw Error("Rango inválido");
            const a = start.address.match(/^([A-Z]+)(\d+)$/)!,
              b = finish.address.match(/^([A-Z]+)(\d+)$/)!;
            if (a[1] !== b[1] || +b[2] - +a[2] > 500 || +b[2] < +a[2])
              throw Error("Rango fuera de límite");
            for (let r = +a[2]; r <= +b[2]; r++)
              result = plus(result, cell(start.sheet!, a[1] + r, depth + 1, true));
            pos += 3;
          } else result = plus(result, add());
          if (tokens[pos]?.text === ",") pos++;
          else break;
        }
        if (tokens[pos++]?.text !== ")") throw Error("Cierre SUM ausente");
        return result;
      }
      if (t.text === "(") {
        const v = add();
        if (tokens[pos++]?.text !== ")") throw Error("Paréntesis sin cierre");
        return v;
      }
      throw Error("Término no soportado");
    }
    function product(): Linear {
      let v = atom();
      while (["*", "/"].includes(tokens[pos]?.text)) {
        const op = tokens[pos++].text,
          b = atom();
        if (op === "/") {
          if (b.terms.size || b.constant.isZero())
            throw Error("Divisor no escalar");
          v = scale(v, new D(1).div(b.constant));
        } else if (!b.terms.size) v = scale(v, b.constant);
        else if (!v.terms.size) v = scale(b, v.constant);
        else throw Error("Producto no lineal");
      }
      return v;
    }
    function add(): Linear {
      let v = product();
      while (["+", "-"].includes(tokens[pos]?.text)) {
        const op = tokens[pos++].text;
        v = plus(v, scale(product(), new D(op === "+" ? 1 : -1)));
      }
      return v;
    }
    const v = add();
    if (pos !== tokens.length) throw Error("Tokens sin interpretar");
    return v;
  }
  try {
    const result = cell(sheet, address, 0);
    return {
      constant: result.constant.toFixed(),
      components: [...result.terms].map(([sourceKey, coefficient]) => ({
        sourceKey,
        coefficient: (options.exact ? coefficient : coefficient.toDecimalPlaces(8)).toFixed(),
      })),
      evidence: [...evidence],
      issue: null,
    };
  } catch (e) {
    return {
      constant: null,
      components: [],
      evidence: [...evidence],
      issue: (e as Error).message,
    };
  }
}
