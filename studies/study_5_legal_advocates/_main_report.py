"""Create a concise Study 5 report in main-text order and verify its values."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd


HERE = Path(__file__).resolve().parent
REPOSITORY = HERE.parents[1]
sys.path.insert(0, str(REPOSITORY))
from common.manuscript_target_checks import check_targets


def add(rows, section, metric, label, value, se=None, p=None, display=True):
    rows.append({
        "order": len(rows) + 1,
        "section": section,
        "metric": metric,
        "label": label,
        "value": float(value),
        "se": None if se is None else float(se),
        "p": None if p is None else float(p),
        "display": bool(display),
    })


def build(output: Path) -> None:
    table1 = pd.read_csv(output / "table_1_main_updating_results.csv")
    table6 = pd.read_csv(output / "table_6_raw_change_robustness.csv")
    coefficients = pd.read_csv(output / "model_coefficients.csv")
    table2 = pd.read_csv(output / "table_2_process_as_outcome_results.csv")
    attenuation = pd.read_csv(output / "raw_change_attenuation_summary.csv")
    claim = pd.read_csv(output / "claim_update_table.csv")
    verdict = pd.read_csv(output / "verdict_update_table.csv")
    process = pd.read_csv(output / "process_fact_table.csv")
    rows = []

    add(rows, "Sample", "N", "Participants", claim["pid"].nunique())

    claim["change_pp"] = claim["Y_post"] - claim["Y_pre"]
    claim_person = claim.groupby(["pid", "advocate_plaintiff"], as_index=False)["change_pp"].mean()
    claim_means = claim_person.groupby("advocate_plaintiff")["change_pp"].mean()
    verdict["change_pp"] = verdict["Y_post_verdict"] - verdict["Y_pre_verdict"]
    verdict_means = verdict.groupby("advocate_plaintiff")["change_pp"].mean()
    add(rows, "Advocacy effects", "claim_change_defendant_pp", "Mean claim change: Defendant advocates (percentage points)", claim_means.loc[0])
    add(rows, "Advocacy effects", "claim_change_plaintiff_pp", "Mean claim change: Plaintiff advocates (percentage points)", claim_means.loc[1])
    add(rows, "Advocacy effects", "verdict_change_defendant_pp", "Mean verdict change: Defendant advocates (percentage points)", verdict_means.loc[0])
    add(rows, "Advocacy effects", "verdict_change_plaintiff_pp", "Mean verdict change: Plaintiff advocates (percentage points)", verdict_means.loc[1])

    def raw_result(quantity):
        return table6.loc[table6["Quantity"].eq(quantity)].iloc[0]

    def raw_component(term):
        return coefficients.loc[
            coefficients["model"].eq("claim_asymmetry_raw_change")
            & coefficients["term"].eq(term)
        ].iloc[0]

    claim_h1 = raw_result("Claim-level total advocacy effect")
    verdict_h1 = raw_result("Verdict-level total advocacy effect")
    gamma_p = raw_component("adv_x_P")
    gamma_d = raw_component("adv_x_D")
    asym = raw_result("Claim-level pooled asymmetry")
    verdict_asym = raw_result("Verdict-level pooled asymmetry")
    for prefix, row, label in [
        ("claim_advocacy", claim_h1, "Claim-level advocacy coefficient"),
        ("verdict_advocacy", verdict_h1, "Verdict-level advocacy coefficient"),
        ("claim_gamma_p", gamma_p, "Plaintiff-evidence interaction"),
        ("claim_gamma_d", gamma_d, "Defendant-evidence interaction"),
    ]:
        if prefix in {"claim_gamma_p", "claim_gamma_d"}:
            estimate, se, p = row["coef"], row["se"], row["p_one_sided_gt0"]
        else:
            estimate, se, p = row["Estimate (percentage points)"], row["SE"], row["p(one-sided, >0)"]
        add(rows, "Regression results", f"{prefix}_b", f"{label} (percentage points)", estimate, se, p)
        add(rows, "Regression results", f"{prefix}_se", f"{label}: SE", se, display=False)
        add(rows, "Regression results", f"{prefix}_p", f"{label}: p", p, display=False)
    add(rows, "Regression results", "claim_asymmetry_b", "Pooled claim-level asymmetry (percentage points)", asym["Estimate (percentage points)"], asym["SE"], asym["p(one-sided, >0)"])
    add(rows, "Regression results", "claim_asymmetry_se", "Pooled claim-level asymmetry: SE", asym["SE"], display=False)
    add(rows, "Regression results", "claim_asymmetry_p", "Pooled claim-level asymmetry: p", asym["p(one-sided, >0)"], display=False)
    add(rows, "Regression results", "verdict_asymmetry_b", "Pooled verdict-level asymmetry (percentage points)", verdict_asym["Estimate (percentage points)"], verdict_asym["SE"], verdict_asym["p(one-sided, >0)"])
    add(rows, "Regression results", "verdict_asymmetry_se", "Pooled verdict-level asymmetry: SE", verdict_asym["SE"], display=False)
    add(rows, "Regression results", "verdict_asymmetry_p", "Pooled verdict-level asymmetry: raw-scale p", verdict_asym["p(one-sided, >0)"], display=False)
    prereg_verdict_asym = table1.loc[table1["Quantity"].eq("H2: verdict-level asymmetry (gamma_P + gamma_D)")].iloc[0]
    add(rows, "Regression results", "verdict_asymmetry_logit_p", "Pooled verdict-level asymmetry: preregistered log-odds p", prereg_verdict_asym["p(one-sided)"], display=False)

    process["aligned"] = process["advocate_plaintiff"].astype(float).eq(process["S_plaintiff"].astype(float))
    process_means = process.groupby("aligned")[["reference", "activation"]].mean() * 100
    add(rows, "Selective processing", "reference_aligned_percent", "Referenced: advocacy-aligned evidence (%)", process_means.loc[True, "reference"])
    add(rows, "Selective processing", "reference_opposing_percent", "Referenced: opposing evidence (%)", process_means.loc[False, "reference"])
    add(rows, "Selective processing", "activation_aligned_percent", "Activated: advocacy-aligned evidence (%)", process_means.loc[True, "activation"])
    add(rows, "Selective processing", "activation_opposing_percent", "Activated: opposing evidence (%)", process_means.loc[False, "activation"])

    process_labels = {
        "Open count": "process_open",
        "Log(1 + viewing time)": "process_view",
        "Reference": "process_reference",
        "Activation": "process_activation",
    }
    for label, prefix in process_labels.items():
        row = table2.loc[table2["Process outcome"].eq(label)].iloc[0]
        add(rows, "Selective processing", f"{prefix}_b", f"{label}: advocacy-alignment coefficient", row["Advocacy × Plaintiff evidence"], row["SE"], row["p(one-sided, >0)"])
        add(rows, "Selective processing", f"{prefix}_se", f"{label}: SE", row["SE"], display=False)

    core = attenuation.loc[attenuation["model"].eq("all_process")].set_index("quantity")
    for quantity, prefix, label in [
        ("claim_advocacy_beta_MR", "attenuation_claim", "Claim advocacy attenuation"),
        ("verdict_advocacy_beta_MR", "attenuation_verdict", "Verdict advocacy attenuation"),
        ("claim_asymmetry_gamma_P_plus_gamma_D", "attenuation_asymmetry", "Claim asymmetry attenuation"),
    ]:
        row = core.loc[quantity]
        add(rows, "Attenuation", f"{prefix}_percent", f"{label} (%)", row["percent_attenuation"], p=row["p_one_sided"])
        add(rows, "Attenuation", f"{prefix}_p", f"{label}: p", row["p_one_sided"], display=False)

    report = pd.DataFrame(rows)
    report.to_csv(output / "main_text_results.csv", index=False)
    lines = ["STUDY 5 MAIN-TEXT RESULTS", "=" * 72, f"N = {claim['pid'].nunique()}"]
    displayed = report.loc[report["display"]]
    for section, section_rows in displayed.groupby("section", sort=False):
        if section == "Sample":
            continue
        lines.extend(["", section, "-" * len(section)])
        for row in section_rows.itertuples():
            extras = []
            if pd.notna(row.se):
                extras.append(f"SE = {row.se:.3f}")
            if pd.notna(row.p):
                extras.append(f"p = {row.p:.4g}")
            suffix = f" ({', '.join(extras)})" if extras else ""
            lines.append(f"{row.label}: {row.value:.4f}{suffix}")
    (output / "main_text_results.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    checked = check_targets(
        report,
        REPOSITORY / "manuscript_targets" / "study_5.csv",
        output / "manuscript_checks.csv",
    )
    print(f"Main-text report written to {output / 'main_text_results.txt'}")
    print(f"Manuscript checks passed: {checked['pass'].sum()}/{len(checked)}")
