"""Builds backend/data/headphones/sbaf/index.json from the measurement files that sit in that folder.

The files are the unmodified .txt files of the SBAF headphone measurements (CC BY 4.0, see NOTICE.txt there). Run it again
after adding or replacing files:

    cd backend
    .venv\\Scripts\\python.exe ..\\dev-tests\\build_headphone_library.py
"""
import json
import os
import re
import sys
import time

sys.path.insert(0, os.getcwd())
from auralization.headphone import read_headphone_csv

FOLDER = os.path.join("data", "headphones", "sbaf")
RIGS = {
    "cFPC21": {"pt": "placa plana (cFPC21)", "en": "flat-plate coupler (cFPC21)"},
    "cEAR32": {"pt": "miniDSP EARS, sem parafusos, compensação 3.2 (cEAR32)", "en": "miniDSP EARS, screws removed, compensation 3.2 (cEAR32)"},
    "cEAR30": {"pt": "miniDSP EARS de fábrica, compensação 3.02 (cEAR30)", "en": "miniDSP EARS as shipped, compensation 3.02 (cEAR30)"},
    "cEARS32": {"pt": "variante do miniDSP EARS (cEARS32), não descrita no README", "en": "miniDSP EARS variant (cEARS32), not described in the README"},
    "cEARS30": {"pt": "variante do miniDSP EARS (cEARS30), não descrita no README", "en": "miniDSP EARS variant (cEARS30), not described in the README"},
}

groups = {}
for name in sorted(os.listdir(FOLDER)):
    m = re.fullmatch(r"(c[A-Za-z0-9]+)-([A-Za-z0-9]+)-(.+?)-?([LR])\.txt", name)      # two files lack the hyphen before the channel
    if not m:
        continue
    rig, brand, model, ch = m.groups()
    groups.setdefault((rig, brand, model), {})[ch] = name

items = []
for (rig, brand, model), files in sorted(groups.items(), key=lambda kv: (kv[0][1].lower(), kv[0][2].lower(), kv[0][0])):
    points = []
    for ch, fname in files.items():
        hp = read_headphone_csv(open(os.path.join(FOLDER, fname), "rb").read(), fname)
        points.append(hp.n_points)
    items.append({
        "id": f"sbaf:{rig}:{brand}-{model}",
        "brand": brand,
        "model": model.replace("-", " "),
        "rig": rig,
        "channels": sorted(files),
        "files": [files[c] for c in sorted(files)],
        "n_points": min(points),
    })

index = {
    "source": {
        "name": "SBAF headphone measurements (superbestaudiofriends)",
        "license": "CC BY 4.0",
        "url": "https://github.com/superbestaudiofriends/headphone-measurements-frequency-response",
        "ref": "sbaf",
    },
    "rigs": RIGS,
    "items": items,
}
with open(os.path.join(FOLDER, "index.json"), "w", encoding="utf-8", newline="\n") as fh:
    json.dump(index, fh, ensure_ascii=False, indent=1)
    fh.write("\n")
print(f"{len(items)} entries from {sum(len(i['files']) for i in items)} files, {len({(i['brand'], i['model']) for i in items})} models")
