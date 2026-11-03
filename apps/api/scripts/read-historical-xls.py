"""Read the controlled legacy BIFF source, never macros or formulas.

Run with an analysis-only xlrd installation. Writes cached input values and
source coordinates to a new JSON file; no database/network operations.
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path
import xlrd
from xlrd.formula import decompile_formula, FMLA_TYPE_CELL, FMLA_TYPE_SHARED

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
content = args.source.read_bytes()
if len(content) > 5_000_000 or content[:8] != bytes.fromhex("d0cf11e0a1b11ae1"):
    raise ValueError("Se requiere un XLS BIFF de hasta 5 MB")
book = xlrd.open_workbook(file_contents=content, on_demand=True)
sheets = []
for sheet_index, sheet in enumerate(book.sheets()):
    if sheet.nrows > 2000 or sheet.ncols > 100:
        raise ValueError("Hoja fuera del límite controlado")
    rows = []
    for index in range(sheet.nrows):
        rows.append([
            {"error": xlrd.error_text_from_code.get(cell.value, "error")}
            if cell.ctype == xlrd.XL_CELL_ERROR else cell.value
            for cell in sheet.row(index)
        ])
    # Decode formula text as evidence; never evaluate it or follow links.
    # BIFF stores shared formulas separately from cells referencing their anchor.
    book._position = book._sh_abs_posn[sheet_index]
    formulas, shared, pending = [], [], []
    while True:
        opcode, size, data = book.get_record_parts()
        if opcode == 0x000A:
            break
        if opcode in (0x0006, 0x0206, 0x0406) and size >= 22:
            row, col = struct.unpack("<HH", data[:4])
            length = struct.unpack("<H", data[20:22])[0]
            pending.append((row, col, data[22:22 + length]))
        elif opcode == 0x04BC and size >= 10:
            first, last, first_col, last_col = struct.unpack("<HHBB", data[:6])
            length = struct.unpack("<H", data[8:10])[0]
            shared.append((first, last, first_col, last_col, data[10:10 + length]))
    for row, col, tokens in pending:
        formula_type = FMLA_TYPE_CELL
        if len(tokens) == 5 and tokens[0] == 1:
            matches = [f for f in shared if f[0] <= row <= f[1] and f[2] <= col <= f[3]]
            if len(matches) == 1:
                tokens, formula_type = matches[0][4], FMLA_TYPE_SHARED
        try:
            expression = decompile_formula(book, tokens, len(tokens), formula_type,
                                           browx=row, bcolx=col)
        except Exception:
            expression = None  # cached value remains; ambiguity is explicit
        formulas.append({"row": row + 1, "column": col + 1,
                         "text": expression, "decoded": expression is not None})
    sheets.append({"name": sheet.name, "rows": rows, "formulas": formulas})
with args.output.open("x", encoding="utf8") as output:
    json.dump({"format": "cached-biff-v1", "sourceName": args.source.name,
               "sha256": hashlib.sha256(content).hexdigest(), "sheets": sheets},
              output, ensure_ascii=False, indent=2)
print("XLS leído sin ejecutar contenido activo; JSON nuevo con huella SHA-256.")
