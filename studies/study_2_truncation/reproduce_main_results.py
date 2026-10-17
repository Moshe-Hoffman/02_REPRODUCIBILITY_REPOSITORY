"""Reproduce Study 2 analyses; safe to launch without arguments."""

from pathlib import Path
import os
import subprocess
import sys
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT = HERE / "output"


def main():
    OUT.mkdir(exist_ok=True)
    env = os.environ.copy(); env.setdefault("MPLBACKEND", "Agg")
    env.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))
    result = subprocess.run([sys.executable, "_analysis_functions.py"], cwd=HERE, env=env,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (OUT / "full_analysis_log.txt").write_text(result.stdout, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(f"Study 2 analysis failed; see {OUT / 'full_analysis_log.txt'}")
    cells = pd.read_csv(OUT / "lambda_by_block_and_rule.csv")
    pooled = pd.read_csv(OUT / "lambda_pooled.csv")
    rows = [{"section": "sample", "metric": "N", "value": 116, "se": None, "p": None}]
    rows.extend({"section": "block-by-rule lambda", "metric": row["cell"],
             "value": row["lambda"], "se": row["clustered_se"],
             "p": max(row["p_lambda_gt_0"], row["p_lambda_lt_1"])}
            for _, row in cells.iterrows())
    rows.append({"section": "pooled lambda", "metric": "pooled lambda",
                 "value": pooled.loc[0, "lambda"], "se": pooled.loc[0, "clustered_se"],
                 "p": max(pooled.loc[0, "p_lambda_gt_0"], pooled.loc[0, "p_lambda_lt_1"])})
    ordering = pd.read_csv(OUT / "ordering_contrasts.csv")
    for _, row in ordering.iterrows():
        p = row["one_sided_p"] if pd.notna(row["one_sided_p"]) else row["one_sided_p_for_RandomDrop_gt_OnlyLow"]
        rows.append({"section": "judgment ordering", "metric": row["contrast"],
                     "value": row["estimate"], "se": row["clustered_se"], "p": p})
    deviations = pd.read_csv(OUT / "deviation_from_bayes_contrasts.csv")
    for _, row in deviations.iterrows():
        rows.append({"section": "absolute deviation from Bayesian benchmark", "metric": row["contrast"],
                     "value": row["estimate"], "se": row["clustered_se"], "p": row["one_sided_p_gt_0"]})
    report = pd.DataFrame(rows)
    report.to_csv(OUT / "main_text_results.csv", index=False)
    sys.path.insert(0, str(HERE.parents[1]))
    from common.manuscript_target_checks import check_targets
    check_input = report.assign(metric=lambda d: d["section"] + ":" + d["metric"])
    check_targets(check_input, HERE.parents[1] / "manuscript_targets" / "study_2.csv",
                  OUT / "manuscript_checks.csv")
    lines = ["STUDY 2 MAIN-TEXT RESULTS", "=" * 72, "N = 116"]
    last_section = None
    for row in report.itertuples(index=False):
        if row.section == "sample":
            continue
        if row.section != last_section:
            lines.extend(["", row.section.upper()])
            last_section = row.section
        lines.append(f"{row.metric}: {row.value:.6f} (SE={row.se:.6f}, p={row.p:.6g})")
    (OUT / "main_text_results.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Study 2 complete. Outputs: {OUT}")


if __name__ == "__main__":
    main()
