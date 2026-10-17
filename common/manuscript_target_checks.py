"""Utilities for comparing regenerated quantities with manuscript targets."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd


def check_targets(actual: pd.DataFrame, targets_path: Path, output_path: Path) -> pd.DataFrame:
    """Compare regenerated results with a manuscript target table.

    Target columns are `metric`, `comparison`, `target`, and `tolerance`.
    An optional `field` column selects the regenerated column to check (for
    example, ``value``, ``se``, or ``p``); it defaults to ``value``.  This lets
    the repository verify uncertainty estimates and reported p-values rather
    than checking coefficients alone.
    Supported comparisons are `equal`, `less_than`, and `greater_than`.
    """
    targets = pd.read_csv(targets_path)
    if "field" not in targets:
        targets["field"] = "value"
    targets["field"] = targets["field"].fillna("value")
    unsupported = sorted(set(targets["field"]) - set(actual.columns))
    if unsupported:
        raise ValueError(f"Target table requests missing result fields: {unsupported}")

    long_actual = actual.melt(
        id_vars=["metric"],
        value_vars=sorted(set(targets["field"])),
        var_name="field",
        value_name="actual",
    ).drop_duplicates(["metric", "field"], keep="last")
    checked = targets.merge(long_actual, on=["metric", "field"], how="left")

    def evaluate(row: pd.Series) -> bool:
        value = row["actual"]
        if pd.isna(value):
            return False
        comparison = row["comparison"]
        target = row["target"]
        tolerance = row.get("tolerance", 0.0)
        tolerance = 0.0 if pd.isna(tolerance) else float(tolerance)
        if comparison == "equal":
            return bool(np.isclose(value, target, atol=tolerance, rtol=0))
        if comparison == "less_than":
            return bool(value < target)
        if comparison == "greater_than":
            return bool(value > target)
        raise ValueError(f"Unknown manuscript-target comparison: {comparison}")

    checked["pass"] = checked.apply(evaluate, axis=1)
    checked["difference"] = checked["actual"] - checked["target"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    checked.to_csv(output_path, index=False)
    failures = checked.loc[~checked["pass"]]
    if not failures.empty:
        labels = ", ".join(failures["metric"].tolist())
        raise AssertionError(f"Manuscript checks failed: {labels}. See {output_path}")
    return checked
