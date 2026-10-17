#!/usr/bin/env python3
"""Run every main-text study reproduction from the repository root."""

from pathlib import Path
import os
import subprocess
import sys

import pandas as pd


ROOT = Path(__file__).resolve().parent
STUDIES = [
    "study_1_sticks",
    "study_2_truncation",
    "study_3_legal_audiences",
    "study_4_policy_audiences",
    "study_5_legal_advocates",
    "study_6_policy_advocates",
]

EXPECTED_FIGURES = {
    "study_1_sticks": ["Figure_1_statistical_panels.pdf"],
    "study_2_truncation": ["Figure_2_statistical_panels.pdf"],
    "study_3_legal_audiences": ["Figure_3_statistical_panels.pdf"],
    "study_4_policy_audiences": [
        "Figure_4_statistical_panel.pdf",
        "Figure_4_sharing_attenuation_panel.pdf",
    ],
    "study_5_legal_advocates": ["Figure_5_statistical_panels.pdf"],
    "study_6_policy_advocates": [
        "Figure_6_advocacy_panel.pdf",
        "Figure_6_responsiveness_panel.pdf",
        "figure_6_attenuation_estimates.pdf",
    ],
}


def main() -> int:
    env = os.environ.copy()
    env.setdefault("MPLBACKEND", "Agg")
    env.setdefault("MPLCONFIGDIR", str(ROOT / ".matplotlib_cache"))
    failures = []
    summary = []
    for name in STUDIES:
        folder = ROOT / "studies" / name
        print("\n" + "=" * 78, flush=True)
        print(f"RUNNING {name}", flush=True)
        print("=" * 78, flush=True)
        result = subprocess.run([sys.executable, "reproduce_main_results.py"], cwd=folder, env=env)
        if result.returncode:
            failures.append(name)
            summary.append({"study": name, "status": "failed", "checks_passed": 0,
                            "checks_total": 0, "figures_present": False})
            continue
        checks = pd.read_csv(folder / "output" / "manuscript_checks.csv")
        expected = [folder / "output" / item for item in EXPECTED_FIGURES[name]]
        figures_present = all(path.exists() and path.stat().st_size > 0 for path in expected)
        status = "passed" if checks["pass"].all() and figures_present else "failed"
        if status == "failed":
            failures.append(name)
        summary.append({
            "study": name,
            "status": status,
            "checks_passed": int(checks["pass"].sum()),
            "checks_total": int(len(checks)),
            "figures_present": figures_present,
        })
        print(f"Verified {int(checks['pass'].sum())}/{len(checks)} manuscript targets; "
              f"data-driven figure outputs present: {figures_present}", flush=True)
    pd.DataFrame(summary).to_csv(ROOT / "main_results_reproduction_summary.csv", index=False)
    if failures:
        print("\nFailed: " + ", ".join(failures), file=sys.stderr)
        return 1
    print("\nAll six study reproductions completed successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
