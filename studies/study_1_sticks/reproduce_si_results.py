"""Reproduce Study 1 analyses reported in the Supplementary Information."""

from pathlib import Path
from contextlib import redirect_stdout
import os
import sys

import pandas as pd

HERE = Path(__file__).resolve().parent
DATA = HERE / "data" / "study1_main_analysis_data.csv"
OUT = HERE / "output_si"
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))


def main() -> None:
    OUT.mkdir(exist_ok=True)
    sys.path.insert(0, str(HERE))
    import _analysis_functions as analysis

    with (OUT / "si_results.txt").open("w", encoding="utf-8") as stream, redirect_stdout(stream):
        data, audit, _ = analysis.prepare_analysis_data(pd.read_csv(DATA, low_memory=False))
        mixed_frames, mixed_condition, robust_frames, robust_condition = [], [], [], []
        diagnostics = {}
        for outcome in ["raw_estimate", "adjustment_visible", "deviation_bayes", "deviation_bayes_exact"]:
            model, diag = analysis.fit_preferred_mixed_model(data, outcome)
            diagnostics[outcome] = diag
            mixed_frames.append(analysis.mixed_result_table(model, outcome))
            mixed_condition.append(analysis.condition_specific_test_table(model, outcome, "preferred mixed model"))
            robust, robust_model = analysis.fit_clustered_participant_FE(data, outcome)
            robust_frames.append(robust)
            robust_condition.append(analysis.condition_specific_test_table(robust_model, outcome, "participant-FE clustered"))

        mixed = pd.concat(mixed_frames, ignore_index=True)
        mixed_tests = pd.concat(mixed_condition, ignore_index=True)
        robust = pd.concat(robust_frames, ignore_index=True)
        robust_tests = pd.concat(robust_condition, ignore_index=True)
        lambdas = pd.concat([
            analysis.fit_benchmark_gap_lambda(data, "bayes", "Corrected preregistered"),
            analysis.fit_benchmark_gap_lambda(data, "bayes_exact_discrete", "Exact discrete"),
        ], ignore_index=True)
        treatment, pairwise, trends, by_h = analysis.fit_exact_lambda_m_and_treatment_comparisons(data)
        center_lambda, center_tracking, center_dispersion = analysis.fit_center_heuristic_and_tracking(data)
        secondary, secondary_diag = analysis.fit_secondary_pooled_undercorrection(data)
        cells = analysis.empirical_cell_means(data)

        benchmark_summary = data.groupby("condition", observed=True).agg(
            N=("exact_minus_prereg_bayes", "size"),
            mean_exact_minus_prereg=("exact_minus_prereg_bayes", "mean"),
            mean_abs_difference=("exact_minus_prereg_bayes", lambda x: x.abs().mean()),
            max_abs_difference=("exact_minus_prereg_bayes", lambda x: x.abs().max()),
        ).reset_index()
        benchmark_cells = data.groupby(["condition", "n_hidden"], observed=True).agg(
            N=("exact_minus_prereg_bayes", "size"),
            prereg_bayes_mean=("bayes", "mean"),
            exact_bayes_mean=("bayes_exact_discrete", "mean"),
            mean_exact_minus_prereg=("exact_minus_prereg_bayes", "mean"),
            mean_abs_difference=("exact_minus_prereg_bayes", lambda x: x.abs().mean()),
        ).reset_index()

        outputs = {
            "mixed_model_coefficients.csv": mixed,
            "condition_specific_mixed_tests.csv": mixed_tests,
            "participant_fe_clustered_coefficients.csv": robust,
            "condition_specific_clustered_tests.csv": robust_tests,
            "benchmark_gap_lambda.csv": lambdas,
            "exact_lambda_by_treatment.csv": treatment,
            "exact_lambda_pairwise.csv": pairwise,
            "exact_lambda_hidden_count_trends.csv": trends,
            "exact_lambda_by_hidden_count.csv": by_h,
            "fixed_center_lambda.csv": center_lambda,
            "bayes_tracking.csv": center_tracking,
            "bayes_center_dispersion.csv": center_dispersion,
            "secondary_pooled_undercorrection.csv": secondary,
            "empirical_cell_means.csv": cells,
            "benchmark_comparison.csv": benchmark_summary,
            "benchmark_comparison_by_cell.csv": benchmark_cells,
        }
        for filename, table in outputs.items():
            table.to_csv(OUT / filename, index=False)

        report = analysis.build_share_report(
            DATA, audit, mixed, mixed_tests, robust, robust_tests,
            benchmark_summary, benchmark_cells, lambdas, treatment, pairwise,
            trends, by_h, center_lambda, center_tracking, center_dispersion,
            secondary, cells, diagnostics, secondary_diag,
        )
        print(report)

    checks = pd.DataFrame([
        {"check": "final N", "expected": 50, "observed": audit["final_analytic_N"], "pass": audit["final_analytic_N"] == 50},
        {"check": "27 trials per participant", "expected": 1350, "observed": len(data), "pass": len(data) == 1350},
        {"check": "three censoring conditions", "expected": 3, "observed": data["condition"].nunique(), "pass": data["condition"].nunique() == 3},
        {"check": "all SI output tables written", "expected": len(outputs), "observed": sum((OUT / f).exists() for f in outputs), "pass": all((OUT / f).exists() for f in outputs)},
    ])
    checks.to_csv(OUT / "si_checks.csv", index=False)
    if not checks["pass"].all():
        raise RuntimeError("Study 1 SI validation failed; see output_si/si_checks.csv")
    print(f"Study 1 SI analyses complete: {OUT}")


if __name__ == "__main__":
    main()
