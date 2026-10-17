"""Reproduce Study 6 main-text analyses and statistical figure panels."""

from contextlib import redirect_stdout
from pathlib import Path
import os
import sys
import warnings

HERE = Path(__file__).resolve().parent
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(HERE / ".matplotlib_cache"))

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

OUT = HERE / "output"
DATA = HERE / "data" / "study6_main_analysis_data.csv"
STIMULI = HERE / "experiment" / "stimuli.json"


def main():
    # Some deliberately stacked, rank-deficient covariance calculations emit
    # low-level floating-point warnings for nuisance columns; reported target
    # contrasts remain finite and are checked below.
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    OUT.mkdir(exist_ok=True)
    sys.path.insert(0, str(HERE))
    import _analysis_functions as analysis

    policies, claims, facts, quants = analysis.load_stimuli(STIMULI)
    raw = analysis.load_advocate_csvs([DATA])
    participants = analysis.participant_table(raw)
    completed = participants.loc[participants["completed_primary"]].copy()
    claim_o, quant_o, support_o = analysis.build_outcomes(raw, claims, quants)
    claim_p, policy_p, bundle_p = analysis.build_predictors(raw, completed, claims, facts)
    claim = analysis.merge_claim_outcome(claim_o, claim_p)
    quant = analysis.merge_claim_outcome(quant_o, claim_p)
    support = analysis.merge_support_outcome(support_o, policy_p)
    assert completed.shape[0] == 304

    specs = [
        ("Claim advocacy", claim, "delta_w ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("Quantitative advocacy", quant, "delta_b ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("Policy-support advocacy", support, "delta_support ~ Adv + Pro_count + Con_count + C(policy_id)"),
    ]
    rows = [{"section": "sample", "metric": "N", "value": 304, "se": None, "p": None}]

    claim_person_raw = claim.groupby(["participant_id", "Adv"], as_index=False)["delta_w_raw"].mean()
    claim_raw_means = claim_person_raw.groupby("Adv")["delta_w_raw"].mean()
    support_raw_means = support.groupby("Adv")["delta_support_raw"].mean()
    rows.extend([
        {"section": "descriptive changes", "metric": "Claim change, assigned to oppose",
         "value": float(claim_raw_means.loc[0]), "se": None, "p": None},
        {"section": "descriptive changes", "metric": "Claim change, assigned to support",
         "value": float(claim_raw_means.loc[1]), "se": None, "p": None},
        {"section": "descriptive changes", "metric": "Policy-support change, assigned to oppose",
         "value": float(support_raw_means.loc[0]), "se": None, "p": None},
        {"section": "descriptive changes", "metric": "Policy-support change, assigned to support",
         "value": float(support_raw_means.loc[1]), "se": None, "p": None},
    ])
    for label, data, formula in specs:
        fit = analysis.fit_model(data, formula)
        est, se, _, p = analysis.contrast_stat(fit, {"Adv": 1})
        rows.append({"section": "advocacy effects", "metric": label, "value": est, "se": se, "p": p/2})

    aligned = claim.loc[claim["ClaimCongenial"].eq(1)].copy()
    h3_formula = "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)"
    h3 = analysis.fit_model(aligned, h3_formula)
    for metric, weights in [("Pro-evidence responsiveness", {"Adv_Pro": 1}),
                            ("Anti-evidence responsiveness", {"Adv_Con": 1}),
                            ("Pooled asymmetric updating", {"Adv_Pro": 1, "Adv_Con": 1})]:
        est, se, _, p = analysis.contrast_stat(h3, weights)
        rows.append({"section": "asymmetric updating", "metric": metric, "value": est, "se": se, "p": p/2})

    # Main-text complementary H3 and moderator results.
    for label, data, outcome, formula, weights in [
        ("Claim warrantedness", claim, "delta_w", "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", {"Adv_Pro": 1, "Adv_Con": 1}),
        ("Quantitative estimates", quant, "delta_b", "delta_b ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", {"Adv_Pro": 1, "Adv_Con": 1}),
        ("Policy support", support, "delta_support", "delta_support ~ Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + C(policy_id)", {"Adv_Pro_count": 1, "Adv_Con_count": 1}),
    ]:
        fit = analysis.fit_model(data, formula)
        est, se, _, p2 = analysis.contrast_stat(fit, weights)
        rows.append({"section": "evidence-alignment asymmetry, all claims", "metric": label,
                     "value": est, "se": se, "p": analysis.one_sided_p(est, p2, "positive")})

    h2_specs = [
        ("Claim warrantedness", claim, "delta_w ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", {"Pro_CC": 1, "Con_CC": -1}),
        ("Quantitative estimates", quant, "delta_b ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", {"Pro_CC": 1, "Con_CC": -1}),
        ("Policy support", support, "delta_support ~ Adv + Pro_count + Con_count + Pro_cong + Con_cong + C(policy_id)", {"Pro_cong": 1, "Con_cong": -1}),
    ]
    for label, data, formula, weights in h2_specs:
        fit = analysis.fit_model(data, formula)
        est, se, _, p2 = analysis.contrast_stat(fit, weights)
        rows.append({"section": "claim-alignment asymmetry", "metric": label,
                     "value": est, "se": se, "p": analysis.one_sided_p(est, p2, "positive")})

    moderator = analysis.fit_model(
        claim,
        "delta_w ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Adv_Pro + Adv_Con + Adv_Pro_CC + Adv_Con_CC + C(policy_claim)",
    )
    for label, term in [("Pro evidence on advocacy-aligned claims", "Adv_Pro_CC"),
                        ("Anti evidence on advocacy-aligned claims", "Adv_Con_CC")]:
        est, se, _, p2 = analysis.contrast_stat(moderator, {term: 1})
        rows.append({"section": "claim-alignment moderator", "metric": label,
                     "value": est, "se": se, "p": analysis.one_sided_p(est, p2, "positive")})

    # Each preregistered process measure is analyzed as an outcome for evidence
    # bundles that were actually available to the participant.
    shown = bundle_p.loc[bundle_p["shown"].eq(1)].copy()
    for measure in analysis.PROCESS_MEASURES:
        fit = analysis.fit_model(shown, f"{measure} ~ EvidenceCongenial + N_bundles + C(policy_claim)")
        est, se, _, p2 = analysis.contrast_stat(fit, {"EvidenceCongenial": 1})
        rows.append({"section": "selective processing", "metric": analysis.PROCESS_LABELS[measure],
                     "value": est, "se": se, "p": analysis.one_sided_p(est, p2, "positive")})

    def attenuation(data, outcome, base_rhs, target, measures, label):
        proc = " + ".join(analysis.process_cols(["ProProc", "ConProc"], measures))
        aug_rhs = f"{base_rhs} + {proc}"
        d0, d1 = data.copy(), data.copy()
        d0["_model"] = "baseline"; d1["_model"] = "augmented"
        stacked = pd.concat([d0, d1], ignore_index=True, sort=False)
        stacked["_aug"] = stacked["_model"].eq("augmented").astype(int)
        fit = analysis.fit_model(stacked, f"{outcome} ~ ({base_rhs}) + _aug:({aug_rhs})")
        increment = f"_aug:{target}" if f"_aug:{target}" in fit.model.exog_names else f"{target}:_aug"
        base, _, _, _ = analysis.contrast_stat(fit, {target: 1})
        adjusted, _, _, _ = analysis.contrast_stat(fit, {target: 1, increment: 1})
        change, change_se, _, p2 = analysis.contrast_stat(fit, {increment: -1})
        rows.append({"section": "process attenuation", "metric": label,
                     "value": 100 * change / base, "se": change_se,
                     "p": analysis.one_sided_p(change, p2, "positive"),
                     "baseline": base, "adjusted": adjusted})

    all_measures = analysis.PROCESS_MEASURES
    sharing = analysis.PROCESS_SUBSETS["sharing only"]
    attenuation(claim, "delta_w", "Adv + Pro_shown + Con_shown + C(policy_claim)", "Adv", all_measures, "Claim advocacy, all process measures")
    attenuation(quant, "delta_b", "Adv + Pro_shown + Con_shown + C(policy_claim)", "Adv", all_measures, "Quantitative advocacy, all process measures")
    attenuation(support, "delta_support", "Adv + Pro_count + Con_count + C(policy_id)", "Adv", all_measures, "Policy-support advocacy, all process measures")
    h3_base = "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)"

    aligned = claim.loc[claim["ClaimCongenial"].eq(1)].copy()
    for label, measures in [
        ("Pooled asymmetric updating on advocacy-aligned claims, sharing only", sharing),
        ("Pooled asymmetric updating on advocacy-aligned claims, all process measures", all_measures),
    ]:
        proc = " + ".join(analysis.process_cols(["ProProc", "ConProc"], measures))
        result = analysis.matched_contrast_attenuation(
            aligned,
            "delta_w",
            h3_base,
            f"{h3_base} + {proc}",
            {"Adv_Pro": 1.0, "Adv_Con": 1.0},
        )
        if result is not None:
            rows.append({
                "section": "process attenuation",
                "metric": label,
                "value": result["attenuation_percent"],
                "se": result["se"],
                "p": result["p_one_sided"],
                "baseline": result["baseline_coef"],
                "adjusted": result["augmented_coef"],
            })

    # The component analyses across all claims are retained as secondary SI results.
    attenuation(claim, "delta_w", h3_base, "Adv_Pro", all_measures, "Pro-evidence responsiveness, all process measures")
    attenuation(claim, "delta_w", h3_base, "Adv_Con", all_measures, "Anti-evidence responsiveness, all process measures")
    attenuation(claim, "delta_w", "Adv + Pro_shown + Con_shown + C(policy_claim)", "Adv", sharing, "Claim advocacy, sharing only")

    with (OUT / "full_analysis_report.txt").open("w", encoding="utf-8") as stream, redirect_stdout(stream):
        analysis.run_all(STIMULI, [DATA], OUT)

    report = pd.DataFrame(rows)
    report.to_csv(OUT / "main_text_results.csv", index=False)
    sys.path.insert(0, str(HERE.parents[1]))
    from common.manuscript_target_checks import check_targets
    check_input = report.assign(metric=lambda d: d["section"] + ":" + d["metric"])
    check_targets(check_input, HERE.parents[1] / "manuscript_targets" / "study_6.csv",
                  OUT / "manuscript_checks.csv")
    lines = ["STUDY 6 MAIN-TEXT RESULTS", "="*72, "N = 304"]
    last_section = None
    for row in report.itertuples(index=False):
        if row.section == "sample":
            continue
        if row.section != last_section:
            lines.extend(["", row.section.upper()])
            last_section = row.section
        extra = ""
        if hasattr(row, "baseline") and pd.notna(row.baseline):
            extra = f", baseline={row.baseline:.4f}, adjusted={row.adjusted:.4f}"
        uncertainty = []
        if pd.notna(row.se):
            uncertainty.append(f"SE={row.se:.4f}")
        if pd.notna(row.p):
            uncertainty.append(f"p={row.p:.4g}")
        suffix = f" ({', '.join(uncertainty)}{extra})" if uncertainty or extra else ""
        lines.append(f"{row.metric}: {row.value:.4f}{suffix}")
    (OUT / "main_text_results.txt").write_text("\n".join(lines)+"\n", encoding="utf-8")

    frames=[]
    for label, data, outcome in [("Claim beliefs",claim,"delta_w"),("Accuracy-incentivized\nquantitative estimates",quant,"delta_b"),("Policy support",support,"delta_support")]:
        person=data.groupby(["participant_id","Adv"],as_index=False)[outcome].mean()
        summary=person.groupby("Adv")[outcome].agg(["mean","sem"]).reset_index(); summary["outcome"]=label; frames.append(summary)
    plot=pd.concat(frames,ignore_index=True); plot.to_csv(OUT/"figure_advocacy_plot_data.csv",index=False)
    order=["Claim beliefs","Accuracy-incentivized\nquantitative estimates","Policy support"]
    x=np.arange(3); width=.36; fig,ax=plt.subplots(figsize=(6.2,3.3),constrained_layout=True)
    for i,(adv,label,color) in enumerate([(0,"Assigned to oppose","#2878B5"),(1,"Assigned to support","#F27C0E")]):
        sub=plot[plot.Adv.eq(adv)].set_index("outcome"); vals=[sub.loc[o,"mean"] for o in order]
        ax.bar(x+(i-.5)*width,vals,width,color=color,label=label)
        ax.errorbar(x+(i-.5)*width,vals,yerr=[1.96*sub.loc[o,"sem"] for o in order],fmt="none",ecolor="black",capsize=3)
    ax.axhline(0,color="#2878B5",linewidth=.8); ax.spines[["top","right"]].set_visible(False)
    ax.set_xticks(x); ax.set_xticklabels(order); ax.set_ylabel("Mean standardized change\ntoward policy support"); ax.legend(frameon=False)
    fig.savefig(OUT/"Figure_6_advocacy_panel.pdf",bbox_inches="tight"); fig.savefig(OUT/"Figure_6_advocacy_panel.png",dpi=300,bbox_inches="tight"); plt.close(fig)

    # Figure 6c: descriptive updating among advocacy-aligned claims.  As in
    # the manuscript, observations are first averaged within participant and
    # randomized evidence condition; bars then show participant-level means
    # with normal-approximation 95% confidence intervals.
    aligned_plot = claim.loc[claim["ClaimCongenial"].eq(1)].copy()
    aligned_plot["condition"] = np.select(
        [
            aligned_plot["Pro_shown"].eq(0) & aligned_plot["Con_shown"].eq(1),
            aligned_plot["Pro_shown"].eq(1) & aligned_plot["Con_shown"].eq(1),
            aligned_plot["Pro_shown"].eq(1) & aligned_plot["Con_shown"].eq(0),
        ],
        ["Anti-policy only", "Both sides", "Pro-policy only"],
        default="Other",
    )
    aligned_person = (
        aligned_plot.loc[aligned_plot["condition"].ne("Other")]
        .groupby(["participant_id", "Adv", "condition"], as_index=False)["delta_w"].mean()
    )
    aligned_summary = (
        aligned_person.groupby(["condition", "Adv"])["delta_w"]
        .agg(["mean", "sem", "count"]).reset_index()
    )
    aligned_summary["ci95"] = 1.96 * aligned_summary["sem"]
    aligned_summary.to_csv(OUT / "figure_responsiveness_plot_data.csv", index=False)
    order_c = ["Anti-policy only", "Both sides", "Pro-policy only"]
    fig, ax = plt.subplots(figsize=(6.2, 3.3), constrained_layout=True)
    for i, (adv, label, color) in enumerate([(0, "Assigned to oppose", "#2878B5"), (1, "Assigned to support", "#F27C0E")]):
        sub = aligned_summary.loc[aligned_summary["Adv"].eq(adv)].set_index("condition")
        values = [sub.loc[item, "mean"] for item in order_c]
        cis = [sub.loc[item, "ci95"] for item in order_c]
        ax.bar(x + (i-.5)*width, values, width, color=color, label=label)
        ax.errorbar(x + (i-.5)*width, values, yerr=cis, fmt="none", ecolor="black", capsize=3)
    ax.axhline(0, color="#2878B5", linewidth=.8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_xticks(x, order_c)
    ax.set_ylabel("Mean standardized claim updating\ntoward policy support")
    ax.legend(frameon=False)
    fig.savefig(OUT / "Figure_6_responsiveness_panel.pdf", bbox_inches="tight")
    fig.savefig(OUT / "Figure_6_responsiveness_panel.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
    print(f"Study 6 complete. Outputs: {OUT}")


if __name__ == "__main__":
    main()
