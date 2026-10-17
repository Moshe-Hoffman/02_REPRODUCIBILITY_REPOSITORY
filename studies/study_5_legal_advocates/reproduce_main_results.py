"""Reproduce the Study 5 main-text analyses and statistical figure inputs.

This file is intentionally argument-free so it can be launched by double-clicking
it in Python Launcher. Outputs are always written beside this script.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "study5_main_analysis_data.csv"
STIMULI = HERE / "experiment" / "stimuli.json"
OUTPUT = HERE / "output"
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))


def require_inputs() -> None:
    missing = [path for path in [DATA, STIMULI] if not path.exists()]
    if missing:
        formatted = "\n".join(f"  - {path}" for path in missing)
        raise FileNotFoundError(f"Study 5 cannot run because these inputs are missing:\n{formatted}")


def main() -> None:
    require_inputs()
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(HERE))
    import _analysis_functions as analysis

    print("=" * 72)
    print("STUDY 5: LEGAL ADVOCATES")
    print("Reproducing main-text analyses in manuscript order")
    print("=" * 72)
    analysis.main([
        "--data", str(DATA),
        "--stimuli", str(STIMULI),
        "--outdir", str(OUTPUT),
        "--no-final-cleaning",
    ])
    from _main_report import build as build_main_text_report
    build_main_text_report(OUTPUT)

    from _main_figure import build as build_main_text_figure
    build_main_text_figure(OUTPUT)

    print("\nStudy 5 reproduction finished.")
    print(f"Open this folder to inspect the results: {OUTPUT}")


if __name__ == "__main__":
    main()
