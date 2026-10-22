"""Exact-once text replacement helper (the Edit tool truncates files on the OneDrive mount)."""
import io
import sys


def apply(edits):
    """edits: list of (path, old, new). Every `old` must occur exactly once in its file."""
    by_file = {}
    for path, old, new in edits:
        by_file.setdefault(path, []).append((old, new))

    results = {}
    for path, pairs in by_file.items():
        with io.open(path, "r", encoding="utf-8", newline="") as f:
            src = f.read()
        nl = "\r\n" if "\r\n" in src else "\n"
        for old, new in pairs:
            old_n = old.replace("\n", nl)
            new_n = new.replace("\n", nl)
            count = src.count(old_n)
            if count != 1:
                sys.exit(f"ABORT {path}: expected 1 match, found {count} for: {old[:70]!r}")
            src = src.replace(old_n, new_n)
        results[path] = src

    for path, src in results.items():
        with io.open(path, "w", encoding="utf-8", newline="") as f:
            f.write(src)
        print("patched", path, f"({len(by_file[path])} edits)")
