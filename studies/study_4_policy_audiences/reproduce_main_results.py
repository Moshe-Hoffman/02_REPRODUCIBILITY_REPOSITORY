"""Reproduce Study 4 main-text analyses and the statistical figure panel."""

from contextlib import redirect_stdout
from pathlib import Path
import os
import sys

HERE = Path(__file__).resolve().parent
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

OUT = HERE / "output"


def main():
    OUT.mkdir(exist_ok=True)
    sys.path.insert(0, str(HERE))
    import _analysis_functions as analysis

    stimuli_path, dossier_paths, csv_paths = analysis.find_input_files(HERE)
    policies, claims, facts, quants = analysis.load_stimuli(stimuli_path)
    dossiers, exposure, process = analysis.load_dossiers(dossier_paths, facts, claims)
    raw = analysis.load_reviewer_csvs(csv_paths)
    claim_o, quant_o, support_o = analysis.build_outcomes(raw, claims, quants)
    claim_p, policy_p = analysis.build_predictors(dossiers, exposure, process, claims)
    claim, quant, support = analysis.merge_analysis_frames(claim_o, quant_o, support_o, claim_p, policy_p)

    specs = [
        ("Claim warrantedness", claim, "delta_w ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("Quantitative estimates", quant, "delta_b ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("Policy support", support, "delta_support ~ Adv + Pro_count + Con_count + C(policy_id)"),
    ]
    rows = [{"section": "sample", "metric": "N", "value": 288, "se": None, "p": None}]
    for label, data, formula in specs:
        model, error = analysis.fit_model(data, formula)
        if error: raise RuntimeError(error)
        estimate = float(model.params["Adv"]); se = float(model.bse["Adv"])
        _, p = analysis.one_sided_p(estimate, se, "positive")
        rows.append({"section": "advocacy effects", "metric": label, "value": estimate, "se": se, "p": p})

    # Main-text attenuation analysis: add the pro- and anti-policy sharing
    # measures to the identical baseline specification and test the paired
    # coefficient change with a participant-clustered stacked regression.
    base_rhs = [
        "Adv + Pro_shown + Con_shown + C(policy_claim)",
        "Adv + Pro_shown + Con_shown + C(policy_claim)",
        "Adv + Pro_count + Con_count + C(policy_id)",
    ]
    process_rhs = [
        " + ".join(analysis.process_cols(["sharing_any", "sharing_count"])),
        " + ".join(analysis.process_cols(["sharing_any", "sharing_count"])),
        " + ".join(analysis.process_cols(["sharing_any", "sharing_count"], policy=True)),
    ]
    attenuation_rows = []
    for (label, data, outcome), rhs, proc in zip(
        [("Claim warrantedness", claim, "delta_w"),
         ("Quantitative estimates", quant, "delta_b"),
         ("Policy support", support, "delta_support")],
        base_rhs,
        process_rhs,
    ):
        baseline, err1 = analysis.fit_model(data, f"{outcome} ~ {rhs}")
        augmented, err2 = analysis.fit_model(data, f"{outcome} ~ {rhs} + {proc}")
        if err1 or err2:
            raise RuntimeError(err1 or err2)
        paired = analysis.stacked_attenuation(
            f"Sharing attenuation: {label}", data, outcome, rhs, f"{rhs} + {proc}",
            [analysis.TestSpec("baseline - adjusted > 0", contrast={"base::Adv": 1, "aug::Adv": -1})],
        )
        change, change_se = analysis.contrast_from_model(paired, {"base::Adv": 1, "aug::Adv": -1})
        _, change_p = analysis.one_sided_p(change, change_se, "positive")
        base_est = float(baseline.params["Adv"])
        adjusted_est = float(augmented.params["Adv"])
        attenuation_rows.extend([
            {"outcome": label, "specification": "Baseline", "estimate": base_est},
            {"outcome": label, "specification": "Sharing-adjusted", "estimate": adjusted_est},
        ])
        rows.append({"section": "sharing attenuation", "metric": label,
                     "value": 100 * (base_est - adjusted_est) / base_est,
                     "se": change_se, "p": change_p})

    full_report = OUT / "full_analysis_report.txt"
    with full_report.open("w", encoding="utf-8") as stream, redirect_stdout(stream):
        analysis.summarize_inputs(stimuli_path, dossier_paths, csv_paths, policies, claims, dossiers, raw, claim, quant, support)
        rhs = analysis.run_primary_models(claim, quant, support)
        analysis.run_process_models(claim, quant, support, rhs)
        # Mixed-effects robustness checks belong to the later SI runner.

    report = pd.DataFrame(rows)
    report.to_csv(OUT / "main_text_results.csv", index=False)
    sys.path.insert(0, str(HERE.parents[1]))
    from common.manuscript_target_checks import check_targets
    check_input = report.assign(metric=lambda d: d["section"] + ":" + d["metric"])
    check_targets(check_input, HERE.parents[1] / "manuscript_targets" / "study_4.csv",
                  OUT / "manuscript_checks.csv")
    lines = ["STUDY 4 MAIN-TEXT RESULTS", "=" * 72, "N = 288"]
    for row in report.itertuples():
        if row.section == "sample":
            continue
        lines.append(f"{row.metric}: {row.value:.4f} (SE={row.se:.4f}, p={row.p:.4g})")
    (OUT / "main_text_results.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    frames = []
    for label, data, outcome in [("Claim beliefs", claim, "delta_w"),
                                  ("Quantitative estimates", quant, "delta_b"),
                                  ("Policy support", support, "delta_support")]:
        means = data.groupby(["reviewer_id", "Adv"], as_index=False)[outcome].mean()
        summary = means.groupby("Adv")[outcome].agg(["mean", "sem"]).reset_index()
        summary["outcome"] = label; frames.append(summary)
    plot = pd.concat(frames, ignore_index=True)
    plot.to_csv(OUT / "figure_plot_data.csv", index=False)
    x = np.arange(3); width = .36
    fig, ax = plt.subplots(figsize=(6.2, 3.3), constrained_layout=True)
    for i, (adv, label, color) in enumerate([(0, "Assigned to oppose", "#2878B5"), (1, "Assigned to support", "#F27C0E")]):
        sub = plot[plot.Adv.eq(adv)].set_index("outcome")
        order = ["Claim beliefs", "Quantitative estimates", "Policy support"]
        ax.bar(x + (i-.5)*width, [sub.loc[o,"mean"] for o in order], width, color=color, label=label)
        ax.errorbar(x + (i-.5)*width, [sub.loc[o,"mean"] for o in order],
                    yerr=[1.96*sub.loc[o,"sem"] for o in order], fmt="none", ecolor="black", capsize=3)
    ax.axhline(0, color="#2878B5", linewidth=.8); ax.spines[["top","right"]].set_visible(False)
    ax.set_xticks(x); ax.set_xticklabels(["Claim beliefs", "Quantitative\nestimates", "Policy support"])
    ax.set_ylabel("Mean standardized change\ntoward policy support"); ax.legend(frameon=False)
    fig.savefig(OUT / "Figure_4_statistical_panel.pdf", bbox_inches="tight")
    fig.savefig(OUT / "Figure_4_statistical_panel.png", dpi=300, bbox_inches="tight")
    plt.close(fig)

    attenuation = pd.DataFrame(attenuation_rows)
    attenuation.to_csv(OUT / "figure_4_sharing_attenuation_values.csv", index=False)
    labels = ["Claim judgments", "Quantitative estimates", "Policy support"]
    source_labels = ["Claim warrantedness", "Quantitative estimates", "Policy support"]
    y = np.arange(len(labels))
    fig, ax = plt.subplots(figsize=(7.0, 2.35), constrained_layout=True)
    styles = {
        "Baseline": {"marker": "o", "color": "#4D4D4D"},
        "Sharing-adjusted": {"marker": "^", "color": "#1B9E77"},
    }
    for yi, source_label in zip(y, source_labels):
        sub = attenuation.loc[attenuation["outcome"].eq(source_label)].set_index("specification")
        x0 = float(sub.loc["Baseline", "estimate"])
        x1 = float(sub.loc["Sharing-adjusted", "estimate"])
        ax.plot([x0, x1], [yi, yi], color="#B8B8B8", linewidth=2.2, zorder=1)
    for specification, style in styles.items():
        sub = attenuation.loc[attenuation["specification"].eq(specification)].set_index("outcome")
        ax.scatter(
            [float(sub.loc[name, "estimate"]) for name in source_labels], y,
            marker=style["marker"], color=style["color"], s=54,
            label=specification, zorder=2,
        )
    ax.axvline(0, color="#4D4D4D", linestyle="--", linewidth=.9)
    ax.set_yticks(y); ax.set_yticklabels(labels); ax.invert_yaxis()
    ax.set_xlim(-0.03, 0.72)
    ax.set_xlabel("Standardized advocacy coefficient")
    ax.spines[["top", "right"]].set_visible(False)
    ax.legend(frameon=False, loc="upper right")
    fig.savefig(OUT / "Figure_4_sharing_attenuation_panel.pdf", bbox_inches="tight")
    fig.savefig(OUT / "Figure_4_sharing_attenuation_panel.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Study 4 complete. Outputs: {OUT}")


if __name__ == "__main__":
    main()
