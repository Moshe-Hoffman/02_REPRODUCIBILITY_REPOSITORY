#!/usr/bin/env python3
"""Verify the frozen SI reported-value manifest against generated outputs."""

from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
TARGETS = ROOT / "si_targets" / "reported_values.csv"
NUMBER = re.compile(
    r"(?<![A-Za-z0-9])([+-]?(?:\d+\.\d+|\d+|\.\d+)(?:[eE][+-]?\d+)?)(?![A-Za-z0-9])"
)


def main() -> int:
    targets = pd.read_csv(TARGETS)
    cache: dict[Path, list[float]] = {}
    rows = []
    for target in targets.itertuples(index=False):
        path = ROOT / target.output_file
        if path not in cache:
            cache[path] = (
                [float(value) for value in NUMBER.findall(path.read_text(errors="ignore"))]
                if path.exists() else []
            )
        expected = float(target.displayed_value)
        decimals = int(target.decimals)
        tolerance = 0.5001 * 10 ** (-decimals)
        transformed, scale = {
            "direct": (expected, 1),
            "opposite_sign": (-expected, 1),
            "percent_to_fraction": (expected / 100, .01),
            "opposite_percent_to_fraction": (-expected / 100, .01),
            "fraction_to_percent": (expected * 100, 100),
            "opposite_fraction_to_percent": (-expected * 100, 100),
        }[target.match_mode]
        passed = any(
            abs(value - transformed) <= max(tolerance * scale, abs(transformed) * 1e-8)
            for value in cache[path]
        )
        rows.append({**target._asdict(), "pass": passed})
    checks = pd.DataFrame(rows)
    checks.to_csv(ROOT / "si_reported_value_checks.csv", index=False)
    passed = int(checks["pass"].sum())
    print(f"Verified {passed}/{len(checks)} displayed SI values against generated outputs.")
    return 0 if passed == len(checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
