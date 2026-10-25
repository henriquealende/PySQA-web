"""Batch XLSX with pass/fail marks and notes (routers.export._build_xlsx).
Run from the backend folder:  .venv/Scripts/python ../dev-tests/test_batch_limits.py"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
import openpyxl

from routers.export import _build_xlsx

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:200] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


sheet = {
    "sheet_name": "Batch",
    "columns": {
        "File": ["quiet", "loud", "none"],
        "Loudness ZWK\n(sone)": [5.7, 23.7, None],
        "Result": ["OK Pass", "XX Fail", ""],
    },
    "marks": {
        "Loudness ZWK\n(sone)": ["pass", "fail", None],
        "Result": ["pass", "fail", None],
    },
    "notes": ["Limits: Loudness ZWK <= 15", "Pass: 1 - Fail: 1 - No value: 0"],
}
ws = openpyxl.load_workbook(_build_xlsx([sheet]))["Batch"]


def fill(r, c):
    return ws.cell(row=r, column=c).fill.fgColor.rgb


check("pass cell is green", fill(2, 2) == "FF1F5A3E", fill(2, 2))
check("fail cell is red", fill(3, 2) == "FF6B2420", fill(3, 2))
check("unmarked cell keeps the row fill", fill(4, 2) not in ("FF1F5A3E", "FF6B2420"), fill(4, 2))
check("fail cell text is bold", ws.cell(row=3, column=2).font.b is True)
check("result column is marked too", fill(2, 3) == "FF1F5A3E" and fill(3, 3) == "FF6B2420")
check("value kept as a number", abs(ws.cell(row=3, column=2).value - 23.7) < 1e-9, ws.cell(row=3, column=2).value)
check("note 1 written under the table", ws.cell(row=6, column=1).value == "Limits: Loudness ZWK <= 15", ws.cell(row=6, column=1).value)
check("note 2 written under the table", ws.cell(row=7, column=1).value.startswith("Pass: 1"), ws.cell(row=7, column=1).value)

# A sheet without marks or notes still works as before
plain = openpyxl.load_workbook(_build_xlsx([{"sheet_name": "P", "columns": {"A": [1.5, 2.5]}}]))["P"]
check("sheet without marks is unchanged", plain.cell(row=2, column=1).value == 1.5 and plain.max_row == 3, plain.max_row)

print("\n%s" % ("ALL PASS" if not fails else "FAILED: " + ", ".join(fails)))
sys.exit(1 if fails else 0)
