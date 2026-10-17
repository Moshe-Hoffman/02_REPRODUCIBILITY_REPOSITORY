#!/usr/bin/env python3
"""Interactively locate a reported number or phrase in generated outputs."""

from __future__ import annotations

import re
import csv
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def output_files() -> list[Path]:
    files: list[Path] = []
    for folder in (ROOT / "studies").glob("study_*/output*"):
        files.extend(path for path in folder.iterdir() if path.suffix in {".txt", ".csv"})
    return sorted(files)


def numerical_matches(query: str, files: list[Path]) -> list[str]:
    try:
        expected = float(query)
    except ValueError:
        return []
    decimals = len(query.split(".", 1)[1]) if "." in query else 0
    tolerance = 0.5001 * 10 ** (-decimals)
    variants = {expected, -expected, expected / 100, -expected / 100,
                expected * 100, -expected * 100}
    found: list[str] = []
    pattern = re.compile(
        r"(?<![A-Za-z0-9])([+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?)(?![A-Za-z0-9])"
    )
    for path in files:
        for number, line in enumerate(path.read_text(errors="ignore").splitlines(), start=1):
            values = [float(match) for match in pattern.findall(line)]
            if any(abs(value - variant) <= max(tolerance, abs(variant) * 1e-8)
                   for value in values for variant in variants):
                found.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    return found


def indexed_matches(query: str) -> list[str]:
    """Search frozen main-text and SI target indexes before verbose outputs."""
    found: list[str] = []
    si_targets = ROOT / "si_targets" / "reported_values.csv"
    if si_targets.exists():
        with si_targets.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                haystack = " ".join(row.values())
                if query.casefold() in haystack.casefold():
                    found.append(
                        f"SI Study {row['study']}, line {row['si_line']}: "
                        f"{row['displayed_value']} — {row['context']}\n"
                        f"  source: {row['output_file']}"
                    )
    for path in sorted((ROOT / "manuscript_targets").glob("study_*.csv")):
        with path.open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                haystack = " ".join(row.values())
                if query.casefold() in haystack.casefold():
                    found.append(f"Main text {path.stem}: {row}")
    return found


def main() -> None:
    files = output_files()
    if not files:
        print("No generated outputs found. Run reproduce_all_main_results.py and reproduce_all_si_results.py first.")
        return
    query = input("Enter a reported number or phrase: ").strip()
    if not query:
        return
    indexed = indexed_matches(query)
    if indexed:
        print("\nIndexed reported-result matches:\n" + "\n".join(indexed[:25]))
        if len(indexed) > 25:
            print(f"... plus {len(indexed) - 25} additional indexed matches")
        return
    literal: list[str] = []
    for path in files:
        for number, line in enumerate(path.read_text(errors="ignore").splitlines(), start=1):
            if query.casefold() in line.casefold():
                literal.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    matches = literal or numerical_matches(query, files)
    if matches:
        print("\n".join(matches[:50]))
        if len(matches) > 50:
            print(f"... plus {len(matches) - 50} additional generated-output matches")
    else:
        print("No match found. See RESULTS_INDEX.md for the relevant study output.")


if __name__ == "__main__":
    main()
