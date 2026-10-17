"""Reproduce Study 1 main-text analyses and statistical figure panels."""

from pathlib import Path
import os
import sys
import pandas as pd

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "study1_main_analysis_data.csv"
OUT = HERE / "output"
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))


def main():
    OUT.mkdir(exist_ok=True)
    sys.path.insert(0, str(HERE))
    import _analysis_functions as analysis
    import _figure_functions as figure

    data, audit, _ = analysis.prepare_analysis_data(pd.read_csv(DATA, low_memory=False))
    rows = [{"section": "sample", "metric": "N", "value": audit["final_analytic_N"], "se": None, "p": None}]
    for outcome in ["raw_estimate", "adjustment_visible", "deviation_bayes"]:
        model, _ = analysis.fit_preferred_mixed_model(data, outcome)
        table = analysis.mixed_result_table(model, outcome)
        table.to_csv(OUT / f"model_{outcome}.csv", index=False)
        if outcome == "raw_estimate":
            labels = {
                "tall": "Tallest visible vs Random at 5 hidden",
                "short": "Shortest visible vs Random at 5 hidden",
                "tall_hc": "Tallest-visible difference slope per hidden stick",
                "short_hc": "Shortest-visible difference slope per hidden stick",
            }
            for term, label in labels.items():
                item = table.loc[table["term"].eq(term)].iloc[0]
                rows.append({"section": "raw_estimate", "metric": label,
                             "value": item["beta"], "se": item["SE"],
                             "p": item["p_one_sided_directional"]})
        condition = analysis.condition_specific_test_table(model, outcome, "preferred")
        condition.to_csv(OUT / f"condition_tests_{outcome}.csv", index=False)
        for row in condition.itertuples():
            rows.append({"section": outcome, "metric": f"{outcome}:{row.condition}:{row.quantity}",
                         "value": row.estimate, "se": row.SE, "p": row.p_one_sided_directional})

    lambdas = analysis.fit_benchmark_gap_lambda(data, "bayes_exact_discrete", "Exact")
    lambdas.to_csv(OUT / "lambda_estimates.csv", index=False)
    for _, row in lambdas.iterrows():
        rows.append({"section": "proportional adjustment", "metric": f"lambda:{row['scope']}",
                     "value": row["lambda"], "se": row["SE"], "p": row["p_lambda_lt_1"]})

    cells = analysis.empirical_cell_means(data)
    cells.to_csv(OUT / "figure_plot_data.csv", index=False)
    pd.DataFrame(rows).to_csv(OUT / "main_text_results.csv", index=False)
    report = pd.DataFrame(rows)
    sys.path.insert(0, str(HERE.parents[1]))
    from common.manuscript_target_checks import check_targets
    check_input = report.assign(metric=lambda d: d["section"] + ":" + d["metric"])
    check_targets(check_input, HERE.parents[1] / "manuscript_targets" / "study_1.csv",
                  OUT / "manuscript_checks.csv")
    pd.DataFrame([audit]).to_csv(OUT / "sample_audit.csv", index=False)

    lines = ["STUDY 1 MAIN-TEXT RESULTS", "=" * 72, f"N = {audit['final_analytic_N']}"]
    for row in rows:
        if row["section"] == "sample":
            continue
        lines.append(f"{row['metric']}: {row['value']:.6f} (SE={row['se']:.6f}, p={row['p']:.6g})")
    (OUT / "main_text_results.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    figure.make_figures(DATA, OUT)
    (OUT / "fig_sticks_pooled_main.pdf").replace(OUT / "Figure_1_statistical_panels.pdf")
    print(f"Study 1 complete. Outputs: {OUT}")


if __name__ == "__main__":
    main()
