#!/usr/bin/env python3
"""Reproduce the cross-study restored-case sensitivity table in the SI."""

from pathlib import Path
import warnings

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf


HERE = Path(__file__).resolve().parent
DATA = HERE / "sensitivity_data"
OUT = HERE / "sensitivity_output"


def fit(formula, data, cluster=None, hc1=False):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        result = smf.ols(formula, data=data).fit()
        if cluster:
            rows = result.model.data.row_labels
            result = result.get_robustcov_results(
                cov_type="cluster", groups=data.loc[rows, cluster]
            )
        elif hc1:
            result = result.get_robustcov_results(cov_type="HC1")
    return result


def coefficient(result, term):
    values = pd.Series(np.asarray(result.params), index=result.model.exog_names)
    return float(values[term])


def main():
    OUT.mkdir(exist_ok=True)
    rows = []

    # Study 2: pooled proportional-adjustment coefficient across all 119 runs.
    d = pd.read_csv(DATA / "study2_pooled_restored_runs.csv")
    model = fit(
        "response_minus_naive_dm ~ 0 + gap_dm", d, cluster="participant_uid"
    )
    rows.append({"study": 2, "estimand": "pooled lambda", "estimate": coefficient(model, "gap_dm")})

    # Study 3: disclosed one-sided conditions relative to the both-sides arm.
    claim = pd.read_csv(DATA / "study3_claim_restored_sessions.csv")
    verdict = pd.read_csv(DATA / "study3_verdict_restored_sessions.csv")
    claim_model = fit(
        "delta ~ T2 + T3 + T4 + T5 + C(claim_id)",
        claim,
        cluster="participant_key",
    )
    verdict_model = fit(
        "delta ~ T2 + T3 + T4 + T5 + C(case_id)", verdict, hc1=True
    )
    for label, estimate in [
        ("claim T2-T1", coefficient(claim_model, "T2")),
        ("claim T1-T3", -coefficient(claim_model, "T3")),
        ("verdict T2-T1", coefficient(verdict_model, "T2")),
        ("verdict T1-T3", -coefficient(verdict_model, "T3")),
    ]:
        rows.append({"study": 3, "estimand": label, "estimate": estimate})

    # Study 4: advocacy assignment effects across all 291 completed sessions.
    study4_specs = [
        ("claim warrantedness", "study4_claim_restored_sessions.csv", "delta_w ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("quantitative estimates", "study4_quant_restored_sessions.csv", "delta_b ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("policy support", "study4_support_restored_sessions.csv", "delta_support ~ Adv + Pro_count + Con_count + C(policy_id)"),
    ]
    for label, filename, formula in study4_specs:
        d = pd.read_csv(DATA / filename)
        model = fit(formula, d, cluster="dossier_id")
        rows.append({"study": 4, "estimand": label, "estimate": coefficient(model, "Adv")})

    # Study 5: first completed run per person, with two assistance-screen cases restored.
    claim = pd.read_csv(DATA / "study5_claim_restored_cases.csv")
    verdict = pd.read_csv(DATA / "study5_verdict_restored_cases.csv")
    claim_model = fit(
        "dlogit ~ advocate_plaintiff + P_shown + D_shown + C(claim_id)",
        claim,
        cluster="pid",
    )
    asym_model = fit(
        "dlogit ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)",
        claim,
        cluster="pid",
    )
    verdict_model = fit(
        "dlogit ~ advocate_plaintiff + P_count + D_count + C(case_id)",
        verdict,
        cluster="pid",
    )
    for label, estimate in [
        ("claim advocacy", coefficient(claim_model, "advocate_plaintiff")),
        ("claim asymmetry", coefficient(asym_model, "adv_x_P") + coefficient(asym_model, "adv_x_D")),
        ("verdict advocacy", coefficient(verdict_model, "advocate_plaintiff")),
    ]:
        rows.append({"study": 5, "estimand": label, "estimate": estimate})

    # Study 6: first completed exposure per person, with six assistance-screen cases restored.
    claim = pd.read_csv(DATA / "study6_claim_restored_cases.csv")
    quant = pd.read_csv(DATA / "study6_quant_restored_cases.csv")
    support = pd.read_csv(DATA / "study6_support_restored_cases.csv")
    study6_specs = [
        ("claim advocacy", claim, "delta_w ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("quantitative advocacy", quant, "delta_b ~ Adv + Pro_shown + Con_shown + C(policy_claim)"),
        ("policy advocacy", support, "delta_support ~ Adv + Pro_count + Con_count + C(policy_id)"),
    ]
    for label, d, formula in study6_specs:
        model = fit(formula, d, cluster="participant_id")
        rows.append({"study": 6, "estimand": label, "estimate": coefficient(model, "Adv")})
    aligned = claim.loc[claim["ClaimCongenial"].eq(1)].copy()
    asym_model = fit(
        "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)",
        aligned,
        cluster="participant_id",
    )
    rows.append({
        "study": 6,
        "estimand": "asymmetry on aligned claims",
        "estimate": coefficient(asym_model, "Adv_Pro") + coefficient(asym_model, "Adv_Con"),
    })

    results = pd.DataFrame(rows)
    results.to_csv(OUT / "sensitivity_results.csv", index=False)

    expected = {
        (2, "pooled lambda"): .361,
        (3, "claim T2-T1"): 22.27,
        (3, "claim T1-T3"): 15.42,
        (3, "verdict T2-T1"): 24.47,
        (3, "verdict T1-T3"): 15.09,
        (4, "claim warrantedness"): .385,
        (4, "quantitative estimates"): .209,
        (4, "policy support"): .526,
        (5, "claim advocacy"): .886,
        (5, "claim asymmetry"): 2.157,
        (5, "verdict advocacy"): 1.323,
        (6, "claim advocacy"): .468,
        (6, "quantitative advocacy"): .179,
        (6, "policy advocacy"): .836,
        (6, "asymmetry on aligned claims"): .774,
    }
    checks = []
    for row in results.itertuples(index=False):
        target = expected[(row.study, row.estimand)]
        # The SI displays Study 3 contrasts to two decimals and the remaining
        # estimates to three. Allow half a displayed unit plus a small margin
        # for platform-level floating-point differences.
        tolerance = .006 if abs(target) >= 2 else .0006
        passed = abs(row.estimate - target) <= tolerance
        checks.append({
            "study": row.study,
            "estimand": row.estimand,
            "expected_rounded": target,
            "observed": row.estimate,
            "pass": passed,
        })
    checks = pd.DataFrame(checks)
    checks.to_csv(OUT / "sensitivity_checks.csv", index=False)
    if not checks["pass"].all():
        raise RuntimeError("Sensitivity checks failed; see sensitivity_output/sensitivity_checks.csv")
    print(results.to_string(index=False))
    print(f"\nSensitivity analyses reproduced: {OUT}")


if __name__ == "__main__":
    main()
