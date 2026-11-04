import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { inspectCeoCatalog, cached } from "./inspect-ceo-catalog";
import { linearCost } from "./source-linear-cost";
async function main() {
  const [path, output] = process.argv.slice(2);
  if (!path || !output)
    throw Error("Uso: verify-ceo-source.ts BASE.xlsx evidencia-privada.json");
  const inventory = await inspectCeoCatalog(path);
  assert.equal(
    inventory.sourceSha256,
    "5b67b22f03e425f49b1b0922ca575cf1245e9ceac7442b21dbd1e03b5b243e9e",
  );
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(
    (await readFile(path)) as unknown as Parameters<typeof book.xlsx.load>[0],
  );
  const result = linearCost(
    book,
    "01-TareasP",
    "J22",
    new Map([
      ["MO real !D11", "oficial"],
      ["MO real !D13", "ayudante"],
    ]),
  );
  assert.equal(result.issue, null);
  assert.equal(result.constant, "0");
  assert.deepEqual(result.components, [
    { sourceKey: "oficial", coefficient: "0.2" },
    { sourceKey: "ayudante", coefficient: "0.2" },
  ]);
  const mo = book.getWorksheet("MO real ")!;
  const official = String(cached(mo.getCell("D11").value)),
    helper = String(cached(mo.getCell("D13").value));
  const total = new Prisma.Decimal(official)
    .mul("0.2")
    .add(new Prisma.Decimal(helper).mul("0.2"));
  assert.equal(total.toFixed(2), "3334.20");
  assert.equal(
    total.toFixed(),
    String(cached(book.getWorksheet("01-TareasP")!.getCell("J22").value)),
  );
  const cement = inventory.prices.find((p) => p.key === "PRECIOS!A5")!;
  assert.equal(cement.presentationQuantity, "25");
  assert.equal(
    new Prisma.Decimal(String(cement.gross))
      .div(String(cement.presentationQuantity))
      .toFixed(),
    "348.964",
  );
  assert.equal(
    inventory.inventory.filter((r) => r.sheet === "PRECIOS").length,
    inventory.prices.length + inventory.excluded.length,
  );
  assert.equal(
    inventory.categories.length,
    new Set(inventory.categories.map((c) => c.key)).size,
  );
  const evidence = {
    sourceSha256: inventory.sourceSha256,
    extractorVersion: inventory.extractorVersion,
    activities: inventory.activities.length,
    categories: inventory.categories.length,
    priceRows: inventory.prices.length,
    excludedPriceRows: inventory.excluded.length,
    laborRows: inventory.labor.length,
    laborExample: {
      official,
      helper,
      hoursEach: "0.2",
      total: total.toFixed(2),
      evidence: result.evidence,
    },
    cement: {
      quantity: "25",
      normalized: "348.964",
      evidence: "PRECIOS!A5:G5",
    },
    conclusion:
      "Inventario completo de filas PRECIOS y ejemplo real conciliados; los faltantes conservan sus celdas en el manifiesto.",
  };
  await writeFile(output, JSON.stringify(evidence, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(evidence));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
