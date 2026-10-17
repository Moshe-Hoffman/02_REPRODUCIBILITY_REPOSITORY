"""Reproduce the post-assignment completion and dossier-coverage checks."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf


def fit_lpm(data: pd.DataFrame, outcome: str, cluster: str | None = None) -> dict[str, float]:
    columns = [outcome, "Adv", "Pro_count", "Con_count", "policy_id"]
    if cluster:
        columns.append(cluster)
    frame = data[columns].dropna().copy()
    model = smf.ols(
        f"{outcome} ~ Adv + Pro_count + Con_count + C(policy_id)", data=frame
    )
    if cluster:
        result = model.fit(
            cov_type="cluster",
            cov_kwds={"groups": frame[cluster], "use_correction": True},
        )
    else:
        result = model.fit(cov_type="HC1")
    joint = result.wald_test("Pro_count = 0, Con_count = 0", scalar=True)
    support = frame.loc[frame["Adv"].eq(1), outcome]
    oppose = frame.loc[frame["Adv"].eq(0), outcome]
    return {
        "n": int(result.nobs),
        "events": int(frame[outcome].sum()),
        "support_rate": float(support.mean()),
        "oppose_rate": float(oppose.mean()),
        "adjusted_assignment_difference": float(result.params["Adv"]),
        "adjusted_assignment_se": float(result.bse["Adv"]),
        "adjusted_assignment_p_two_sided": float(result.pvalues["Adv"]),
        "pro_count_coefficient": float(result.params["Pro_count"]),
        "pro_count_se": float(result.bse["Pro_count"]),
        "pro_count_p_two_sided": float(result.pvalues["Pro_count"]),
        "con_count_coefficient": float(result.params["Con_count"]),
        "con_count_se": float(result.bse["Con_count"]),
        "con_count_p_two_sided": float(result.pvalues["Con_count"]),
        "joint_evidence_exposure_p_two_sided": float(np.asarray(joint.pvalue).item()),
    }


def write_study4(study_folder: Path, output_folder: Path) -> pd.DataFrame:
    sessions = pd.read_csv(study_folder / "data" / "study4_reviewer_completion_balance_data.csv")
    dossiers = pd.read_csv(study_folder / "data" / "study4_dossier_review_coverage_data.csv")
    result = pd.DataFrame([
        {"analysis": "assigned reviewer sessions", **fit_lpm(sessions, "completed", "dossier_cluster")},
        {"analysis": "randomized dossiers reviewed", **fit_lpm(dossiers, "reviewed")},
    ])
    result.to_csv(output_folder / "completion_balance.csv", index=False)
    return result


def write_study6(study_folder: Path, output_folder: Path) -> pd.DataFrame:
    completion = pd.read_csv(study_folder / "data" / "study6_completion_balance_data.csv")
    result = pd.DataFrame([
        {"analysis": "identified non-preview exposures", **fit_lpm(completion, "completed")}
    ])
    result.to_csv(output_folder / "completion_balance.csv", index=False)
    return result
