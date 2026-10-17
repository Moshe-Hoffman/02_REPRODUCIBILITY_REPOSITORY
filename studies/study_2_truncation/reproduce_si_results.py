"""Reproduce Study 2 supplementary analyses in an isolated output folder."""
from pathlib import Path
import os, subprocess, sys
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE / "output_si"

def main() -> None:
    OUT.mkdir(exist_ok=True)
    env = os.environ.copy(); env["MPLBACKEND"] = "Agg"; env["MPLCONFIGDIR"] = str(HERE / ".matplotlib_cache"); env["STUDY2_OUTPUT_DIR"] = str(OUT)
    result = subprocess.run([sys.executable, str(HERE / "_analysis_functions.py")], cwd=HERE, env=env, text=True, capture_output=True)
    (OUT / "si_results.txt").write_text(result.stdout + result.stderr, encoding="utf-8")
    required = ["lambda_by_block_and_rule.csv", "lambda_pooled.csv", "ordering_contrasts.csv", "deviation_from_bayes_contrasts.csv"]
    checks = pd.DataFrame([{"check": f"created {name}", "expected": 1, "observed": int((OUT/name).exists()), "pass": (OUT/name).exists()} for name in required])
    checks.to_csv(OUT / "si_checks.csv", index=False)
    if result.returncode or not checks["pass"].all(): raise RuntimeError("Study 2 SI run failed; see output_si/si_results.txt")
    print(f"Study 2 SI analyses complete: {OUT}")

if __name__ == "__main__": main()
