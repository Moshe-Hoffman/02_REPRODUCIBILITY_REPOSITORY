"""Reproduce Study 3 main-text analyses and statistical panels."""

from pathlib import Path
import os
import subprocess
import sys
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"


def main():
    OUT.mkdir(exist_ok=True)
    command = [sys.executable, "_analysis_functions.py", "--data", "data/study3_main_analysis_data.csv",
               "--stimuli", "experiment/stimuli.json", "--outdir", "output"]
    env = os.environ.copy()
    env.setdefault("MPLBACKEND", "Agg")
    env.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))
    result = subprocess.run(command, cwd=HERE, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / "analysis_log.txt").write_text(result.stdout, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"Study 3 analysis failed; see {OUT / 'analysis_log.txt'}")

    claim = pd.read_csv(OUT / "contrasts_claim_delta.csv")
    verdict = pd.read_csv(OUT / "contrasts_case_delta.csv")
    rows = [{"section": "sample", "metric": "N", "value": 399, "se": None, "p": None}]
    for outcome, table in [("claim", claim), ("verdict", verdict)]:
        for row in table.itertuples(index=False):
            rows.append({"section": outcome, "metric": row.test,
                         "value": getattr(row, "estimate"), "se": getattr(row, "se"),
                         "p": getattr(row, "p")})
    report = pd.DataFrame(rows)
    report.to_csv(OUT / "main_text_results.csv", index=False)
    sys.path.insert(0, str(HERE.parents[1]))
    from common.manuscript_target_checks import check_targets
    check_input = report.assign(metric=lambda d: d["section"] + ":" + d["metric"])
    check_targets(check_input, HERE.parents[1] / "manuscript_targets" / "study_3.csv",
                  OUT / "manuscript_checks.csv")
    lines = ["STUDY 3 MAIN-TEXT RESULTS", "=" * 72, "N = 399"]
    for row in report.itertuples():
        if row.section == "sample":
            continue
        lines.append(f"{row.section}: {row.metric}: {row.value:.4f} (SE={row.se:.4f}, p={row.p:.4g})")
    (OUT / "main_text_results.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Study 3 complete. Outputs: {OUT}")


if __name__ == "__main__":
    main()
