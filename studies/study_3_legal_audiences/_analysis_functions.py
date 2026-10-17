#!/usr/bin/env python3
"""
Preregistered analysis for Judge Study pilot/main data.

Works in either mode:
  1. Command line:
       python analyze_judge_study_prereg.py --data file1.csv file2.csv --stimuli stimuli.json
  2. Python Launcher / double-click:
       Put this script in the same folder as the Cognition CSV export(s) and stimuli JSON.
       It will merge all CSV files in that folder except previously merged/output files, auto-detect the JSON,
       and write outputs to analysis_outputs.

Expected current JS page_type values:
  - s1_layer2_priors        claim priors; answers stored as JSON in rows
  - s3_layer2_post          claim posteriors; answers stored as JSON in rows
  - s1_case_outcome_prior   verdict prior; answer stored in probability
  - s3_case_outcome_post    verdict posterior; answer stored in probability
  - judge_record_review     treatment fields
"""

from __future__ import annotations

import argparse, json, math, os, re, sys
from pathlib import Path
from typing import Any, Iterable, Optional, List, Dict, Tuple

import numpy as np
import pandas as pd
from scipy import stats
import statsmodels.formula.api as smf

PID_CANDIDATES = [
    "participant_key", "participant_id", "participant", "PROLIFIC_PID", "prolific_pid",
    "worker_id", "workerId", "subject_id", "subject", "pid", "session_id", "SESSION_ID",
    "run_id", "interaction_id"
]
TREATMENT_ORDER = [
    "T5_defendant_only_undisclosed",
    "T3_defendant_only_disclosed",
    "T1_both_sides",
    "T2_plaintiff_only_disclosed",
    "T4_plaintiff_only_undisclosed",
]


def coerce_num(x: Any) -> float:
    if pd.isna(x): return np.nan
    if isinstance(x, (int, float, np.number)): return float(x)
    s = str(x).strip().strip('"\'')
    if not s: return np.nan
    m = re.search(r"-?\d+(?:\.\d+)?", s)
    return float(m.group(0)) if m else np.nan


def first_existing_col(df: pd.DataFrame, candidates: Iterable[str]) -> Optional[str]:
    return next((c for c in candidates if c in df.columns), None)


def looks_like_judge_csv(path: Path) -> bool:
    """Return True if a CSV appears to be from the judge study rather than another project.

    This prevents Python Launcher / double-click mode from accidentally merging unrelated
    CSVs in the same folder, such as policy-validation-study.csv.
    """
    try:
        sample = pd.read_csv(path, nrows=200, low_memory=False)
    except Exception:
        return False
    cols = set(sample.columns.astype(str))
    if "page_type" not in cols:
        return False
    page_types = set(sample["page_type"].dropna().astype(str).unique())
    judge_page_types = {
        "s1_layer2_priors", "s3_layer2_post",
        "s1_case_outcome_prior", "s3_case_outcome_post",
        "judge_record_review", "pre_claim_belief", "post_claim_belief",
        "pre_verdict", "post_verdict",
    }
    if page_types.intersection(judge_page_types):
        return True
    # Fallback: some exports may have only metadata columns in the first 200 rows.
    return bool({"case_id", "claim_id"}.intersection(cols)) and any("judge" in str(x).lower() for x in page_types)


def find_default_files(folder: Path) -> Tuple[List[Path], Path]:
    csvs = []
    skipped = []
    for p in sorted(folder.glob("*.csv")):
        name = p.name.lower()
        if "analysis_outputs" in name or name.startswith("claim_") or name.startswith("case_"):
            continue
        if "analysis_data" in name or "participant_case_treatments" in name or "rough_power" in name:
            continue
        if looks_like_judge_csv(p):
            csvs.append(p)
        else:
            skipped.append(p.name)
    jsons = [p for p in sorted(folder.glob("*.json")) if "cleaned" in p.name.lower() or "validation" in p.name.lower()]
    if not jsons:
        jsons = sorted(folder.glob("*.json"))
    if not csvs:
        msg = "No Judge Study CSV files found in the script folder. Use --data path/to/file.csv"
        if skipped:
            msg += "\nSkipped non-judge CSV files: " + ", ".join(skipped)
        raise FileNotFoundError(msg)
    if not jsons:
        raise FileNotFoundError("No JSON stimuli file found in the script folder. Use --stimuli path/to/stimuli.json")
    if skipped:
        print("Skipped non-judge CSV files:", ", ".join(skipped))
    if len(jsons) > 1:
        print("WARNING: multiple JSON files found; using:", jsons[0].name)
    return csvs, jsons[0]


def read_csvs(paths: List[Path]) -> pd.DataFrame:
    frames = []
    for p in paths:
        df = pd.read_csv(p, low_memory=False)
        df["__source_file"] = p.name
        frames.append(df)
    return pd.concat(frames, ignore_index=True, sort=False)


def add_row_order(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "trial_index" in df.columns:
        df["__row_order"] = pd.to_numeric(df["trial_index"], errors="coerce")
        if df["__row_order"].isna().all(): df["__row_order"] = np.arange(len(df))
    else:
        df["__row_order"] = np.arange(len(df))
    return df


def ensure_participant_key(df: pd.DataFrame) -> Tuple[pd.DataFrame, str]:
    df = df.copy()
    pid = first_existing_col(df, PID_CANDIDATES)
    if pid is None:
        df["participant_key"] = df.get("run_id", pd.Series(np.arange(len(df)))).astype(str)
    else:
        df["participant_key"] = df[pid].astype(str)
    # Cognition sometimes leaves literal placeholders in local/preview rows; fall back to SESSION_ID/run_id.
    bad = df["participant_key"].isin(["", "nan", "None", "{{%PROLIFIC_PID%}}"])
    if bad.any():
        if "SESSION_ID" in df.columns:
            df.loc[bad, "participant_key"] = df.loc[bad, "SESSION_ID"].astype(str)
        elif "run_id" in df.columns:
            df.loc[bad, "participant_key"] = df.loc[bad, "run_id"].astype(str)
    return df, "participant_key"


def load_stimuli(stimuli_path: Path) -> Tuple[pd.DataFrame, pd.DataFrame]:
    with open(stimuli_path, "r", encoding="utf-8") as f: stim = json.load(f)
    cases, claims = [], []
    for case in stim.get("cases", []):
        cases.append({
            "case_id": case.get("case_id"),
            "case_label": case.get("case_label", case.get("case_id")),
            "plaintiff_descriptor": case.get("plaintiff_descriptor"),
            "defendant_descriptor": case.get("defendant_descriptor"),
        })
        for cl in case.get("claims", []):
            claims.append({
                "case_id": cl.get("case_id", case.get("case_id")),
                "claim_id": cl.get("claim_id"),
                "claim_text_stimuli": cl.get("claim_text"),
            })
    return pd.DataFrame(cases), pd.DataFrame(claims)


def infer_treatment(row: pd.Series) -> Optional[str]:
    arm = str(row.get("evidence_exposure_arm", "") or "").strip().lower()
    side = str(row.get("record_side", row.get("advocate_side", "")) or "").strip().lower()
    both = coerce_num(row.get("both_sides_shown", np.nan))
    disclosed = coerce_num(row.get("side_disclosed", np.nan))
    if arm == "both_sides_disclosed" or both == 1:
        return "T1_both_sides"
    if arm == "one_side_disclosed" or disclosed == 1:
        if side == "plaintiff": return "T2_plaintiff_only_disclosed"
        if side == "defendant": return "T3_defendant_only_disclosed"
    if arm == "one_side_undisclosed" or disclosed == 0:
        if side == "plaintiff": return "T4_plaintiff_only_undisclosed"
        if side == "defendant": return "T5_defendant_only_undisclosed"
    return None


def participant_case_treatments(df: pd.DataFrame, pid_col: str) -> pd.DataFrame:
    """Reconstruct participant-by-case treatment assignment.

    The current JS usually writes treatment metadata on judge_record_review rows, but
    Cognition exports can be sparse: some metadata fields may appear only on other rows
    or may be absent from older pilot batches. This function therefore searches all
    rows within each participant-case group and uses the last row that contains useful
    treatment information. Missing optional columns are created as NA instead of
    causing a KeyError.
    """
    if "case_id" not in df.columns:
        raise ValueError("No case_id column found; cannot reconstruct treatment assignments.")

    sub = df.copy()
    sub = sub.dropna(subset=["case_id"])
    sort_cols = [pid_col, "case_id", "__row_order"]
    if "time_elapsed" in sub.columns:
        sort_cols.append("time_elapsed")
    sub = sub.sort_values(sort_cols)

    treatment_fields = ["evidence_exposure_arm", "record_side", "advocate_side", "side_disclosed", "both_sides_shown"]
    rows = []
    for (pid, case_id), g in sub.groupby([pid_col, "case_id"], dropna=False):
        # Prefer judge_record_review rows, but only if they contain usable metadata.
        candidates = g
        if "page_type" in g.columns and (g["page_type"].astype(str) == "judge_record_review").any():
            jr = g[g["page_type"].astype(str) == "judge_record_review"]
            if any((c in jr.columns and jr[c].notna().any()) for c in treatment_fields):
                candidates = jr

        best = None
        for _, rr in candidates.iterrows():
            has_any = any((c in candidates.columns and str(rr.get(c, "") or "").strip() not in ["", "nan", "None"]) for c in treatment_fields)
            if has_any:
                best = rr
        if best is None:
            best = candidates.tail(1).iloc[0]

        d = {pid_col: pid, "case_id": case_id}
        for c in treatment_fields:
            d[c] = best.get(c, np.nan)
        d["treatment"] = infer_treatment(pd.Series(d))
        rows.append(d)

    out = pd.DataFrame(rows)
    keep = [pid_col, "case_id", "treatment", "record_side", "side_disclosed", "both_sides_shown", "evidence_exposure_arm"]
    for c in keep:
        if c not in out.columns:
            out[c] = np.nan
    if out["treatment"].isna().any():
        n_bad = int(out["treatment"].isna().sum())
        print(f"WARNING: treatment could not be reconstructed for {n_bad} participant-case row(s).")
    return out[keep].drop_duplicates()


def parse_rows_json(x: Any) -> list:
    if pd.isna(x): return []
    try: return json.loads(str(x))
    except Exception: return []


def extract_claim_rows(df: pd.DataFrame, pid_col: str, phase: str) -> pd.DataFrame:
    if phase == "pre":
        possible = ["pre_claim_belief", "s1_layer2_priors"]
        value_col = "Y_pre"
    else:
        possible = ["post_claim_belief", "s3_layer2_post"]
        value_col = "Y_post"
    rows = []
    if "page_type" not in df.columns: raise ValueError("Expected page_type column.")
    sub = df[df["page_type"].astype(str).isin(possible)].copy()
    if sub.empty:
        print(f"WARNING: no claim rows found for {phase}; looked for {possible}")
        return pd.DataFrame(columns=[pid_col, "case_id", "claim_id", value_col])
    # Current JS stores all claim answers for a page in rows JSON.
    for _, r in sub.sort_values("__row_order").iterrows():
        arr = parse_rows_json(r.get("rows"))
        if arr:
            for item in arr:
                rows.append({
                    pid_col: r[pid_col],
                    "case_id": r.get("case_id", item.get("case_id")),
                    "claim_id": item.get("claim_id"),
                    value_col: coerce_num(item.get("probability", item.get("response"))),
                    "__row_order": r.get("__row_order", np.nan),
                    "time_elapsed": r.get("time_elapsed", np.nan),
                })
        elif pd.notna(r.get("claim_id", np.nan)):
            rows.append({
                pid_col: r[pid_col], "case_id": r.get("case_id"), "claim_id": r.get("claim_id"),
                value_col: coerce_num(r.get("probability", r.get("response"))),
                "__row_order": r.get("__row_order", np.nan), "time_elapsed": r.get("time_elapsed", np.nan),
            })
    out = pd.DataFrame(rows)
    if out.empty: return pd.DataFrame(columns=[pid_col, "case_id", "claim_id", value_col])
    out = out.dropna(subset=["case_id", "claim_id"])
    out = out.sort_values([pid_col, "case_id", "claim_id", "__row_order", "time_elapsed"])
    out = out.groupby([pid_col, "case_id", "claim_id"], as_index=False).tail(1)
    return out[[pid_col, "case_id", "claim_id", value_col]]


def extract_verdict_rows(df: pd.DataFrame, pid_col: str, phase: str) -> pd.DataFrame:
    if phase == "pre":
        possible = ["pre_verdict", "s1_case_outcome_prior"]; value_col = "Y_pre"
    else:
        possible = ["post_verdict", "s3_case_outcome_post"]; value_col = "Y_post"
    sub = df[df["page_type"].astype(str).isin(possible)].copy()
    if sub.empty:
        print(f"WARNING: no verdict rows found for {phase}; looked for {possible}")
        return pd.DataFrame(columns=[pid_col, "case_id", value_col])
    sub[value_col] = sub.apply(lambda r: coerce_num(r.get("probability", r.get("response"))), axis=1)
    sub = sub.dropna(subset=["case_id"])
    sub = sub.sort_values([pid_col, "case_id", "__row_order", "time_elapsed"] if "time_elapsed" in sub.columns else [pid_col, "case_id", "__row_order"])
    sub = sub.groupby([pid_col, "case_id"], as_index=False).tail(1)
    return sub[[pid_col, "case_id", value_col]]


def logit_update(pre: pd.Series, post: pd.Series) -> pd.Series:
    p0 = np.clip(pd.to_numeric(pre, errors="coerce")/100, .01, .99)
    p1 = np.clip(pd.to_numeric(post, errors="coerce")/100, .01, .99)
    return np.log(p1/(1-p1)) - np.log(p0/(1-p0))


def add_treatment_dummies(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    for t in ["T2", "T3", "T4", "T5"]:
        full = {
            "T2":"T2_plaintiff_only_disclosed", "T3":"T3_defendant_only_disclosed",
            "T4":"T4_plaintiff_only_undisclosed", "T5":"T5_defendant_only_undisclosed"
        }[t]
        df[t] = (df["treatment"] == full).astype(int)
    df["T1"] = (df["treatment"] == "T1_both_sides").astype(int)
    return df


def fit_ols(formula: str, df: pd.DataFrame, cluster: Optional[pd.Series] = None):
    res = smf.ols(formula, data=df).fit()
    if cluster is not None and pd.Series(cluster).nunique() > 1:
        return res.get_robustcov_results(cov_type="cluster", groups=cluster)
    return res.get_robustcov_results(cov_type="HC1")


def coef_series(res): return pd.Series(np.asarray(res.params), index=list(res.model.exog_names))
def cov_df(res): return pd.DataFrame(np.asarray(res.cov_params()), index=list(res.model.exog_names), columns=list(res.model.exog_names))


def linear_contrast(res, weights: Dict[str,float], alternative="greater"):
    b, V = coef_series(res), cov_df(res)
    est = sum(w*b[k] for k,w in weights.items())
    var = sum(weights[k1]*weights[k2]*V.loc[k1,k2] for k1 in weights for k2 in weights)
    se = math.sqrt(max(var, 0.0)); t = est/se if se > 0 else np.nan
    df = getattr(res, "df_resid", np.inf)
    p = stats.t.sf(t, df) if alternative == "greater" else stats.t.cdf(t, df)
    return {"estimate":est,"se":se,"t":t,"df":df,"p":p,"alternative":alternative}


def prereg_contrasts(res):
    tests = {
        "H1_T5_lt_T3": ({"T3":1,"T5":-1}, "greater"),
        "H1_T3_lt_T1": ({"T3":-1}, "greater"),
        "H1_T1_lt_T2": ({"T2":1}, "greater"),
        "H1_T2_lt_T4": ({"T4":1,"T2":-1}, "greater"),
        "H2_plaintiff_disclosure_T4_gt_T2": ({"T4":1,"T2":-1}, "greater"),
        "H2_defendant_disclosure_T3_gt_T5": ({"T3":1,"T5":-1}, "greater"),
        "H3_insufficient_plaintiff_T2_gt_T1": ({"T2":1}, "greater"),
        "H3_insufficient_defendant_T1_gt_T3": ({"T3":-1}, "greater"),
    }
    rows=[]
    for name,(w,alt) in tests.items():
        d=linear_contrast(res,w,alt); d["test"]=name; d["contrast"]=" + ".join(f"{v:g}*{k}" for k,v in w.items()); rows.append(d)
    return pd.DataFrame(rows)[["test","contrast","estimate","se","t","df","p","alternative"]]


def model_table(res):
    b=coef_series(res)
    return pd.DataFrame({"term":b.index,"estimate":b.values,"se":np.asarray(res.bse),"t":np.asarray(res.tvalues),"p_two_sided":np.asarray(res.pvalues)})


def means_by_treatment(df, outcome, pid_col):
    g = df.groupby("treatment", dropna=False).agg(
        n_participants=(pid_col, pd.Series.nunique), n_rows=(outcome,"size"),
        mean=(outcome,"mean"), sd=(outcome,"std")
    ).reset_index()
    g["order"] = g["treatment"].map({v:i for i,v in enumerate(TREATMENT_ORDER)})
    return g.sort_values(["order","treatment"]).drop(columns="order")


def power_table_from_means(means: pd.DataFrame, outcome_label: str) -> pd.DataFrame:
    # rough independent-groups one-sided alpha=.05 normal approximation; intended for planning, not final inference.
    m = means.set_index("treatment")
    rows=[]
    for a,b in zip(TREATMENT_ORDER[:-1], TREATMENT_ORDER[1:]):
        if a not in m.index or b not in m.index: continue
        diff = m.loc[b,"mean"] - m.loc[a,"mean"]
        sp = math.sqrt((m.loc[a,"sd"]**2 + m.loc[b,"sd"]**2)/2) if pd.notna(m.loc[a,"sd"]) and pd.notna(m.loc[b,"sd"]) else np.nan
        if pd.isna(sp) or diff == 0: n80=n90=np.nan; d=np.nan
        else:
            d = diff/sp
            n80 = math.ceil(2*sp**2*(stats.norm.ppf(.95)+stats.norm.ppf(.80))**2/(diff**2))
            n90 = math.ceil(2*sp**2*(stats.norm.ppf(.95)+stats.norm.ppf(.90))**2/(diff**2))
        rows.append({"outcome":outcome_label,"contrast":f"{b} - {a}","diff":diff,"pooled_sd":sp,"cohens_d":d,"approx_n_per_arm_80pct":n80,"approx_n_per_arm_90pct":n90})
    return pd.DataFrame(rows)




def treatment_plot_label(t: str) -> str:
    labels = {
        "T5_defendant_only_undisclosed": "T5\nD-undisc.",
        "T3_defendant_only_disclosed": "T3\nD-disc.",
        "T1_both_sides": "T1\nBoth",
        "T2_plaintiff_only_disclosed": "T2\nP-disc.",
        "T4_plaintiff_only_undisclosed": "T4\nP-undisc.",
    }
    return labels.get(str(t), str(t))


def make_mean_se_table(df: pd.DataFrame, outcome: str, pid_col: str, by_case: bool = False) -> pd.DataFrame:
    """Return treatment means and SEs. For claim data, pass participant-averaged rows."""
    group_cols = (["case_id"] if by_case else []) + ["treatment"]
    g = df.groupby(group_cols, dropna=False).agg(
        n_participants=(pid_col, pd.Series.nunique),
        n_rows=(outcome, "size"),
        mean=(outcome, "mean"),
        sd=(outcome, "std"),
    ).reset_index()
    g["se"] = g["sd"] / np.sqrt(g["n_rows"])
    # Use the same normal-approximation 95% confidence intervals as the other
    # main-text figures (and the corresponding descriptive SI figure).
    g["ci95"] = 1.96 * g["se"]
    g["order"] = g["treatment"].map({v:i for i,v in enumerate(TREATMENT_ORDER)})
    sort_cols = (["case_id"] if by_case else []) + ["order", "treatment"]
    return g.sort_values(sort_cols).drop(columns="order")


def generate_treatment_figures(claim_pa: pd.DataFrame, case_ana: pd.DataFrame, pid_col: str, outdir: Path) -> None:
    """Create overall and by-case mean ± SE figures for claim and verdict updating."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except Exception as e:
        print(f"WARNING: Could not generate figures because matplotlib is unavailable: {e}")
        return

    order = TREATMENT_ORDER
    labels = [treatment_plot_label(t) for t in order]

    def skeleton_merge(tab: pd.DataFrame) -> pd.DataFrame:
        sk = pd.DataFrame({"treatment": order, "_x": range(len(order))})
        return sk.merge(tab, on="treatment", how="left")

    # Overall figure: claim participant-average and verdict.
    claim_overall = skeleton_merge(make_mean_se_table(claim_pa, "delta", pid_col, by_case=False))
    verdict_overall = skeleton_merge(make_mean_se_table(case_ana, "delta", pid_col, by_case=False))

    vals = []
    for tab in [claim_overall, verdict_overall]:
        tmp = tab.dropna(subset=["mean"])
        vals.extend((tmp["mean"] - tmp["ci95"]).dropna().tolist())
        vals.extend((tmp["mean"] + tmp["ci95"]).dropna().tolist())
    if vals:
        ymin, ymax = min(vals), max(vals)
        pad = max(5, 0.12 * (ymax - ymin))
        ylim = (ymin - pad, ymax + pad)
    else:
        ylim = (-50, 50)

    fig, axes = plt.subplots(1, 2, figsize=(10.5, 4.2), squeeze=False)
    for ax, tab, title in [(axes[0,0], claim_overall, "Claim updating"), (axes[0,1], verdict_overall, "Verdict updating")]:
        ax.axhline(0, linewidth=1, alpha=.45)
        ax.errorbar(tab["_x"], tab["mean"], yerr=tab["ci95"], fmt="o", capsize=4)
        ax.set_xticks(range(len(order)))
        ax.set_xticklabels(labels)
        ax.set_ylim(*ylim)
        ax.set_title(title)
        ax.set_ylabel("Mean updating (post − pre)")
        ax.set_xlabel("Treatment order: predicted low → high")
        ax.grid(axis="y", alpha=.25)
    fig.suptitle("Treatment means ordered by preregistered prediction: T5 < T3 < T1 < T2 < T4", y=1.03, fontsize=12)
    fig.tight_layout()
    fig.savefig(outdir / "Figure_3_statistical_panels.png", dpi=300, bbox_inches="tight")
    fig.savefig(outdir / "Figure_3_statistical_panels.pdf", bbox_inches="tight")
    plt.close(fig)

    # By-case figure.
    claim_case = make_mean_se_table(claim_pa, "delta", pid_col, by_case=True)
    verdict_case = make_mean_se_table(case_ana, "delta", pid_col, by_case=True)
    plot_data = pd.concat([
        claim_case.assign(dv="claim"),
        verdict_case.assign(dv="verdict"),
    ], ignore_index=True)
    plot_data.to_csv(outdir / "figure_by_case_plot_data.csv", index=False)

    cases = sorted(set(plot_data["case_id"].dropna().astype(str)))
    if not cases:
        print("WARNING: Could not generate by-case figure because no case_id values were available.")
        return

    vals = []
    for tab in [claim_case, verdict_case]:
        tmp = tab.dropna(subset=["mean"])
        vals.extend((tmp["mean"] - tmp["ci95"]).dropna().tolist())
        vals.extend((tmp["mean"] + tmp["ci95"]).dropna().tolist())
    if vals:
        ymin, ymax = min(vals), max(vals)
        pad = max(5, 0.12 * (ymax - ymin))
        ylim = (ymin - pad, ymax + pad)
    else:
        ylim = (-50, 50)

    fig, axes = plt.subplots(len(cases), 2, figsize=(11, 3.6 * len(cases)), squeeze=False)
    for r, case_id in enumerate(cases):
        ctab = skeleton_merge(claim_case[claim_case["case_id"].astype(str) == case_id])
        vtab = skeleton_merge(verdict_case[verdict_case["case_id"].astype(str) == case_id])
        for ax, tab, title in [(axes[r,0], ctab, f"{case_id}: claim updating"), (axes[r,1], vtab, f"{case_id}: verdict updating")]:
            ax.axhline(0, linewidth=1, alpha=.45)
            ax.errorbar(tab["_x"], tab["mean"], yerr=tab["ci95"], fmt="o", capsize=4)
            ax.set_xticks(range(len(order)))
            ax.set_xticklabels(labels)
            ax.set_ylim(*ylim)
            ax.set_title(title)
            ax.set_ylabel("Mean updating (post − pre)")
            ax.set_xlabel("Treatment order: predicted low → high")
            ax.grid(axis="y", alpha=.25)
    fig.suptitle("Treatment means by case, ordered by preregistered prediction: T5 < T3 < T1 < T2 < T4", y=1.005, fontsize=12)
    fig.tight_layout()
    fig.savefig(outdir / "figure_by_case_treatment_means_claim_and_verdict_se.png", dpi=300, bbox_inches="tight")
    fig.savefig(outdir / "figure_by_case_treatment_means_claim_and_verdict_se.pdf", bbox_inches="tight")
    plt.close(fig)
    print("Figures written:")
    print("  figure_treatment_means_claim_and_verdict_se.png/.pdf")
    print("  figure_by_case_treatment_means_claim_and_verdict_se.png/.pdf")


def run_analysis(data_paths: List[Path], stimuli_path: Path, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    raw = read_csvs(data_paths)
    raw, pid_col = ensure_participant_key(raw)
    raw = add_row_order(raw)
    cases_meta, claims_meta = load_stimuli(stimuli_path)
    raw.to_csv(outdir/"merged_raw_data.csv", index=False)

    treatments = participant_case_treatments(raw, pid_col)
    treatments.to_csv(outdir/"participant_case_treatments.csv", index=False)

    pre_c, post_c = extract_claim_rows(raw,pid_col,"pre"), extract_claim_rows(raw,pid_col,"post")
    claim = pre_c.merge(post_c, on=[pid_col,"case_id","claim_id"], how="inner").merge(treatments[[pid_col,"case_id","treatment"]], on=[pid_col,"case_id"], how="left")
    if not claims_meta.empty: claim = claim.merge(claims_meta, on=["case_id","claim_id"], how="left")
    claim["delta"] = claim["Y_post"] - claim["Y_pre"]; claim["delta_logit"] = logit_update(claim.Y_pre, claim.Y_post); claim = add_treatment_dummies(claim)
    claim_ana = claim.dropna(subset=["Y_pre","Y_post","delta","treatment"]).copy()
    claim_ana.to_csv(outdir/"claim_level_analysis_data.csv", index=False)

    pre_v, post_v = extract_verdict_rows(raw,pid_col,"pre"), extract_verdict_rows(raw,pid_col,"post")
    case = pre_v.merge(post_v, on=[pid_col,"case_id"], how="inner").merge(treatments[[pid_col,"case_id","treatment"]], on=[pid_col,"case_id"], how="left")
    if not cases_meta.empty: case = case.merge(cases_meta, on="case_id", how="left")
    case["delta"] = case["Y_post"] - case["Y_pre"]; case["delta_logit"] = logit_update(case.Y_pre, case.Y_post); case = add_treatment_dummies(case)
    case_ana = case.dropna(subset=["Y_pre","Y_post","delta","treatment"]).copy()
    case_ana.to_csv(outdir/"case_level_analysis_data.csv", index=False)

    summary = pd.DataFrame([
        {"quantity":"input_csv_files","value":len(data_paths)},
        {"quantity":"raw_rows","value":len(raw)},
        {"quantity":"participants_raw","value":raw[pid_col].nunique()},
        {"quantity":"participants_with_verdict_post","value":raw.loc[raw.page_type.astype(str).isin(["post_verdict","s3_case_outcome_post"]),pid_col].nunique()},
        {"quantity":"claim_level_rows_included","value":len(claim_ana)},
        {"quantity":"claim_level_participants_included","value":claim_ana[pid_col].nunique()},
        {"quantity":"case_level_rows_included","value":len(case_ana)},
        {"quantity":"case_level_participants_included","value":case_ana[pid_col].nunique()},
    ])
    summary.to_csv(outdir/"sample_summary.csv", index=False)

    claim_means = means_by_treatment(claim_ana, "delta", pid_col); claim_means.to_csv(outdir/"claim_delta_means_by_treatment.csv", index=False)
    # Also participant-averaged claim DV for readable diagnostics/power planning.
    claim_pa = claim_ana.groupby([pid_col,"case_id","treatment"], as_index=False).agg(delta=("delta","mean"))
    claim_pa_means = means_by_treatment(claim_pa, "delta", pid_col); claim_pa_means.to_csv(outdir/"claim_participant_avg_delta_means_by_treatment.csv", index=False)
    case_means = means_by_treatment(case_ana, "delta", pid_col); case_means.to_csv(outdir/"case_delta_means_by_treatment.csv", index=False)
    pd.concat([power_table_from_means(case_means,"verdict_delta"), power_table_from_means(claim_pa_means,"claim_participant_avg_delta")]).to_csv(outdir/"rough_power_from_pilot_means.csv", index=False)

    # Figures: overall and by-case treatment means with participant-level SE bars.
    generate_treatment_figures(claim_pa, case_ana, pid_col, outdir)

    model_specs=[]
    if len(claim_ana):
        for name, formula, dv in [
            ("claim_delta", "delta ~ T2 + T3 + T4 + T5 + C(claim_id)", "delta"),
            ("claim_delta_logit", "delta_logit ~ T2 + T3 + T4 + T5 + C(claim_id)", "delta_logit"),
            ("claim_ancova", "Y_post ~ T2 + T3 + T4 + T5 + Y_pre + C(case_id)", "Y_post"),
        ]:
            dat=claim_ana.dropna(subset=[dv]).copy()
            if len(dat):
                res=fit_ols(formula, dat, cluster=dat[pid_col])
                model_table(res).to_csv(outdir/f"model_{name}.csv", index=False)
                prereg_contrasts(res).to_csv(outdir/f"contrasts_{name}.csv", index=False)
                model_specs.append((name, formula, str(res.summary())))
    if len(case_ana):
        for name, formula, dv in [
            ("case_delta", "delta ~ T2 + T3 + T4 + T5 + C(case_id)", "delta"),
            ("case_delta_logit", "delta_logit ~ T2 + T3 + T4 + T5 + C(case_id)", "delta_logit"),
            ("case_ancova", "Y_post ~ T2 + T3 + T4 + T5 + Y_pre + C(case_id)", "Y_post"),
        ]:
            dat=case_ana.dropna(subset=[dv]).copy()
            if len(dat):
                res=fit_ols(formula, dat, cluster=None)
                model_table(res).to_csv(outdir/f"model_{name}.csv", index=False)
                prereg_contrasts(res).to_csv(outdir/f"contrasts_{name}.csv", index=False)
                model_specs.append((name, formula, str(res.summary())))

    # Completion time and feedback diagnostics.
    diag=[]
    for pt in ["s3_case_outcome_post","end_feedback","prolific_end"]:
        if "time_elapsed" in raw.columns:
            sub=raw[raw.page_type.astype(str)==pt].sort_values("time_elapsed").groupby(pid_col,as_index=False).tail(1)
            diag.append({"page_type":pt,"n":len(sub),"mean_minutes":sub.time_elapsed.mean()/60000,"median_minutes":sub.time_elapsed.median()/60000})
    pd.DataFrame(diag).to_csv(outdir/"completion_time_summary.csv", index=False)
    if "feedback" in raw.columns:
        fb=raw[raw.page_type.astype(str)=="end_feedback"][[pid_col,"feedback"]].dropna()
        fb=fb[fb.feedback.astype(str).str.strip().str.len()>0]
        fb.to_csv(outdir/"participant_feedback.csv", index=False)

    with open(outdir/"model_summaries.txt","w",encoding="utf-8") as f:
        for name, formula, summary_text in model_specs:
            f.write("\n"+"="*90+f"\nMODEL: {name}\nFORMULA: {formula}\n"+"="*90+"\n")
            f.write(summary_text+"\n")
    print(f"Analysis complete. Outputs written to: {outdir.resolve()}")
    print(summary.to_string(index=False))
    print("\nVerdict means:"); print(case_means.to_string(index=False))
    print("\nClaim participant-average means:"); print(claim_pa_means.to_string(index=False))


def main():
    parser=argparse.ArgumentParser(description="Run preregistered Judge Study analyses.")
    parser.add_argument("--data", nargs="*", help="One or more Cognition/jsPsych CSV files.")
    parser.add_argument("--stimuli", help="Stimuli JSON file.")
    parser.add_argument("--outdir", default="analysis_outputs", help="Output directory.")
    args=parser.parse_args()
    script_dir=Path(__file__).resolve().parent
    if args.data:
        data_paths=[Path(p).expanduser().resolve() for p in args.data]
        stimuli_path=Path(args.stimuli).expanduser().resolve() if args.stimuli else find_default_files(script_dir)[1]
    else:
        data_paths, stimuli_path = find_default_files(script_dir)
        print("Auto-detected CSV files:", ", ".join(p.name for p in data_paths))
        print("Auto-detected stimuli JSON:", stimuli_path.name)
    outdir=Path(args.outdir).expanduser().resolve() if args.outdir else script_dir/"analysis_outputs"
    if not outdir.is_absolute(): outdir=(Path.cwd()/outdir).resolve()
    run_analysis(data_paths, stimuli_path, outdir)

if __name__ == "__main__":
    main()
