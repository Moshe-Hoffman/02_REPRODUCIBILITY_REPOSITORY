
"""Internal statistical functions used by the Study 5 reproduction scripts.

Readers should run ``reproduce_main_results.py`` or
``reproduce_si_results.py`` rather than opening this supporting module.

The module implements:

1. Claim-level updating regressions
2. Verdict-level updating regressions
3. Claim-level and verdict-level asymmetric-updating regressions
4. Process-as-outcome regressions
5. Attenuation analyses that add process measures to the updating regressions
6. Main Figure 5A--5D and compact process/attenuation tables, saved to output files and printed
7. Mechanism tests: selective congenial-vs-uncongenial processing predicting advocacy-consistent updating

Expected input
--------------
A jsPsych / cognition.run CSV with one row per trial. The script is written to
handle the page types used in the clean rebuild:

- assignment
- pre_disputed_issue_judgment_row
- post_disputed_issue_judgment_row
- pre_verdict_judgment
- post_verdict_judgment
- dossier
- dossier_fact_process
- activation_check

The script also accepts the cleaned stimuli JSON, which is strongly recommended
because it gives a stable map from fact_id -> claim_id and fact side.

Dependencies
------------
pandas, numpy, scipy, statsmodels, matplotlib

Notes
-----
- Outcomes are constructed as logit(post) - logit(pre), after converting 0-100
  probability responses to [0, 1] and bounding to [0.005, 0.995].
- Claim-level models cluster SEs by participant.
- The process-as-outcome model includes advocate side, evidence side, and their
  interaction; the interaction is the selective-processing contrast.
- Reference is coded as 1 if the evidence item was either inserted/cited in the
  written argument or attached in the dossier interface. Raw inserted/attached
  indicators are retained when available.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import os
import re
import sys
import warnings
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from patsy import build_design_matrices
from scipy import stats as st

# Suppress noisy numerical RuntimeWarnings from statsmodels/NumPy linear algebra.
# These warnings can appear with rank-deficient design matrices in exploratory
# robustness models. Hard errors and explicit MixedLM failure messages are still
# printed.
warnings.filterwarnings("ignore", category=RuntimeWarning)

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except Exception:  # plotting remains optional
    plt = None


# The manuscript reports a completion-first analysis: retain the earliest
# completed exposure for each Prolific participant, then apply the two
# external-assistance/template exclusions.  Store hashes instead of raw
# Prolific identifiers so the reproduction script does not expose them.
LEGAL_ASSISTANCE_EXCLUSION_SHA256 = {
    "5d77a0db45361ffc45de6d2c8f182b17eebfcaae5336ac4fc7ec6149a6c93dce",
    "cc177bb96cc139dc6def18012a79739abd2c12d2f305662a869e684a6c91f34e",
}


# ---------------------------------------------------------------------
# General parsing helpers
# ---------------------------------------------------------------------


def parse_obj(x: Any, default: Any = None) -> Any:
    """Parse JSON-like strings from jsPsych/cognition.run exports."""
    if default is None:
        default = None
    if x is None:
        return default
    if isinstance(x, float) and np.isnan(x):
        return default
    if isinstance(x, (dict, list, tuple, int, float, bool)):
        return x
    s = str(x).strip()
    if s == "" or s.lower() in {"nan", "none", "null", "undefined"}:
        return default
    try:
        return json.loads(s)
    except Exception:
        pass
    try:
        return ast.literal_eval(s)
    except Exception:
        return default


def parse_list(x: Any) -> List[Any]:
    obj = parse_obj(x, default=[])
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    if isinstance(obj, tuple):
        return list(obj)
    if isinstance(obj, set):
        return list(obj)
    if isinstance(obj, str):
        s = obj.strip()
        if not s:
            return []
        return [z.strip() for z in s.split(",") if z.strip()]
    return [obj]


def parse_dict(x: Any) -> Dict[str, Any]:
    obj = parse_obj(x, default={})
    return obj if isinstance(obj, dict) else {}


def first_existing(df: pd.DataFrame, cols: Iterable[str]) -> Optional[str]:
    for c in cols:
        if c in df.columns:
            return c
    return None


def coerce_numeric(x: Any) -> float:
    if x is None:
        return np.nan
    if isinstance(x, float) and np.isnan(x):
        return np.nan
    if isinstance(x, (int, float)):
        return float(x)
    s = str(x).strip()
    if s == "":
        return np.nan
    # handle strings like "50%"
    s = s.replace("%", "")
    try:
        return float(s)
    except Exception:
        return np.nan


def bounded_prob_0_100(x: Any, lo: float = 0.005, hi: float = 0.995) -> float:
    v = coerce_numeric(x)
    if np.isnan(v):
        return np.nan
    # If export is already 0-1, allow it; otherwise assume 0-100.
    p = v if 0 <= v <= 1 else v / 100.0
    return float(np.clip(p, lo, hi))


def logit(p: Any) -> float:
    p = bounded_prob_0_100(p)
    if np.isnan(p):
        return np.nan
    return float(np.log(p / (1.0 - p)))


def clean_page_type(x: Any) -> str:
    if x is None or (isinstance(x, float) and np.isnan(x)):
        return ""
    return str(x).strip()


# ---------------------------------------------------------------------
# Loading and canonicalizing raw exports
# ---------------------------------------------------------------------


def load_raw_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    if "page_type" not in df.columns:
        # Some jsPsych exports use trial_type or data.page_type after flattening.
        alt = first_existing(df, ["data.page_type", "trial_type", "page", "screen"])
        if alt:
            df["page_type"] = df[alt]
        else:
            raise ValueError("Could not find a page_type column. Please inspect the CSV export.")
    df["page_type"] = df["page_type"].map(clean_page_type)
    return df


def infer_participant_id(df: pd.DataFrame) -> pd.Series:
    candidates = [
        "participant_id", "participant", "subject_id", "worker_id", "PROLIFIC_PID",
        "prolific_pid", "run_id", "session_id", "interaction_id", "cognition_run_id"
    ]
    col = first_existing(df, candidates)
    if col is not None:
        ids = df[col].astype(str)
        # If the column is empty in many rows, fall back to run/session if available.
        if ids.replace({"nan": "", "None": ""}).str.len().gt(0).any():
            return ids
    # Last-resort: infer a single participant per file.
    return pd.Series(["participant_1"] * len(df), index=df.index)


def normalize_raw(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["pid"] = infer_participant_id(df)
    if "PROLIFIC_PID" in df.columns and "run_id" in df.columns:
        df["pid"] = df["PROLIFIC_PID"].astype(str).str.strip() + "__run" + df["run_id"].astype(str).str.strip()
    for col in ["case_id", "claim_id", "fact_id", "advocate_side", "phase"]:
        if col not in df.columns:
            df[col] = np.nan
    if "advocate_plaintiff" not in df.columns:
        df["advocate_plaintiff"] = np.where(
            df["advocate_side"].astype(str).str.lower().eq("plaintiff"), 1,
            np.where(df["advocate_side"].astype(str).str.lower().eq("defendant"), 0, np.nan)
        )
    return df


def _coalesced_text(df: pd.DataFrame, columns: Iterable[str]) -> pd.Series:
    out = pd.Series("", index=df.index, dtype=object)
    for col in columns:
        if col not in df.columns:
            continue
        values = df[col].fillna("").astype(str).str.strip()
        valid = values.ne("") & ~values.str.lower().isin({"nan", "none", "null"})
        out.loc[out.eq("") & valid] = values.loc[out.eq("") & valid]
    return out


def filter_final_legal_sample(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """Apply the finalized manuscript's completion-first cleaning rules."""
    work = df.copy()
    work["__pid"] = _coalesced_text(
        work,
        ["PROLIFIC_PID", "prolific_pid", "participant_id", "subject_id"],
    )
    work["__recorded_at"] = _coalesced_text(work, ["recorded_at"])
    work["__recorded_dt"] = pd.to_datetime(work["__recorded_at"], errors="coerce", utc=True)
    work["__run"] = _coalesced_text(work, ["run_id"])
    work["__exposure"] = (
        work["__pid"] + "::" + work["__recorded_at"] + "::" + work["__run"]
    )

    completion = work.loc[
        work["page_type"].eq("post_verdict_judgment") & work["__pid"].ne(""),
        ["__pid", "__exposure", "__recorded_dt", "__run"],
    ].drop_duplicates("__exposure")
    eligible_completed = int(len(completion))
    unique_completed = int(completion["__pid"].nunique())

    completion = completion.sort_values(
        ["__pid", "__recorded_dt", "__run", "__exposure"],
        na_position="last",
    )
    completion["__completed_rank"] = completion.groupby("__pid").cumcount() + 1
    retained_exposures = set(
        completion.loc[completion["__completed_rank"].eq(1), "__exposure"].astype(str)
    )
    work = work.loc[work["__exposure"].isin(retained_exposures)].copy()

    work["__pid_hash"] = work["__pid"].map(
        lambda value: hashlib.sha256(value.encode("utf-8")).hexdigest()
    )
    excluded_present = sorted(
        set(work["__pid_hash"]) & LEGAL_ASSISTANCE_EXCLUSION_SHA256
    )
    work = work.loc[~work["__pid_hash"].isin(LEGAL_ASSISTANCE_EXCLUSION_SHA256)].copy()

    final_n = int(
        work.loc[work["page_type"].eq("post_verdict_judgment"), "__pid"].nunique()
    )
    audit = {
        "eligible_completed_runs": eligible_completed,
        "unique_completed_participants_before_assistance_screen": unique_completed,
        "later_completed_repeats_removed": eligible_completed - unique_completed,
        "assistance_screen_participants_removed": len(excluded_present),
        "final_participants": final_n,
    }
    return work.drop(
        columns=[
            "__pid", "__recorded_at", "__recorded_dt", "__run",
            "__exposure", "__pid_hash",
        ],
        errors="ignore",
    ), audit


# ---------------------------------------------------------------------
# Stimulus map
# ---------------------------------------------------------------------


def load_stimuli(stimuli_path: Optional[Path]) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Return claim_map and fact_map."""
    if stimuli_path is None:
        return pd.DataFrame(), pd.DataFrame()
    data = json.loads(stimuli_path.read_text(encoding="utf-8"))
    cases = data.get("cases", []) if isinstance(data, dict) else []
    claim_rows = []
    fact_rows = []
    for c in cases:
        case_id = c.get("case_id") or c.get("case_id_canonical") or c.get("case_label")
        case_label = c.get("case_label", case_id)
        for cl in c.get("claims", []) or []:
            claim_rows.append({
                "case_id": case_id,
                "case_label": case_label,
                "claim_id": cl.get("claim_id"),
                "claim_text": cl.get("claim_text") or cl.get("text") or cl.get("claim"),
            })
        for f in c.get("facts", []) or []:
            side = (f.get("fact_helps_side") or f.get("direction") or "").lower()
            if not side:
                if f.get("supports_plaintiff"):
                    side = "plaintiff"
                elif f.get("supports_defendant"):
                    side = "defendant"
            fact_rows.append({
                "case_id": case_id,
                "case_label": case_label,
                "claim_id": f.get("claim_id"),
                "fact_id": f.get("fact_id"),
                "fact_text": f.get("fact_text") or f.get("text"),
                "fact_side": side,
                "S_plaintiff": 1 if side == "plaintiff" else 0 if side == "defendant" else np.nan,
            })
    return pd.DataFrame(claim_rows), pd.DataFrame(fact_rows)


# ---------------------------------------------------------------------
# Extracting analysis tables
# ---------------------------------------------------------------------


def assignment_table(df: pd.DataFrame) -> pd.DataFrame:
    rows = df[df["page_type"].eq("assignment")].copy()
    if rows.empty:
        # Fallback: first non-missing case/side row per participant.
        tmp = df.dropna(subset=["case_id", "advocate_side"], how="all").copy()
        if tmp.empty:
            return pd.DataFrame(columns=["pid", "case_id", "advocate_side", "advocate_plaintiff"])
        rows = tmp.sort_index().groupby("pid", as_index=False).first()
    keep = [c for c in ["pid", "case_id", "case_label", "advocate_side", "advocate_plaintiff", "claim_order", "facts_shown_ids", "shown_facts_by_claim"] if c in rows.columns]
    out = rows[keep].copy()
    out = out.sort_index().drop_duplicates("pid", keep="first")
    out["advocate_side"] = out["advocate_side"].astype(str).str.lower()
    out["advocate_plaintiff"] = np.where(out["advocate_side"].eq("plaintiff"), 1,
                                         np.where(out["advocate_side"].eq("defendant"), 0, out.get("advocate_plaintiff", np.nan)))
    return out


def explode_judgment_rows(df: pd.DataFrame, phase: str) -> pd.DataFrame:
    """Return one row per claim judgment for pre or post."""
    direct_type = f"{phase}_disputed_issue_judgment_row"
    direct = df[df["page_type"].eq(direct_type)].copy()
    if not direct.empty:
        value_col = first_existing(direct, ["response", "value", "probability", "answer"])
        if value_col is None:
            raise ValueError(f"Found {direct_type} rows but no response column.")
        out = direct[["pid", "case_id", "advocate_side", "advocate_plaintiff", "claim_id", value_col]].copy()
        out = out.rename(columns={value_col: f"Y_{phase}"})
        out["phase"] = phase
        return out

    # Fallback: page row contains a `responses` list.
    page_type = f"{phase}_disputed_issue_judgments"
    pages = df[df["page_type"].eq(page_type)].copy()
    rows = []
    for _, r in pages.iterrows():
        responses = parse_list(r.get("responses"))
        for obj in responses:
            if not isinstance(obj, dict):
                continue
            rows.append({
                "pid": r["pid"],
                "case_id": obj.get("case_id", r.get("case_id")),
                "advocate_side": obj.get("advocate_side", r.get("advocate_side")),
                "advocate_plaintiff": r.get("advocate_plaintiff"),
                "claim_id": obj.get("claim_id"),
                f"Y_{phase}": obj.get("response"),
                "phase": phase,
            })
    return pd.DataFrame(rows)


def claim_update_table(df: pd.DataFrame, fact_map: pd.DataFrame) -> pd.DataFrame:
    pre = explode_judgment_rows(df, "pre")
    post = explode_judgment_rows(df, "post")
    if pre.empty or post.empty:
        raise ValueError("Could not construct pre/post claim judgments. Check page_type names.")
    keys = ["pid", "case_id", "claim_id"]
    claim = pre.merge(post, on=keys, suffixes=("_pre_row", "_post_row"), how="inner")

    # Pull stable assignment fields.
    assign = assignment_table(df)
    claim = claim.merge(assign[[c for c in ["pid", "case_id", "advocate_side", "advocate_plaintiff"] if c in assign.columns]],
                        on=["pid", "case_id"], how="left", suffixes=("", "_assign"))
    for col in ["advocate_side", "advocate_plaintiff"]:
        alt = f"{col}_assign"
        if alt in claim.columns:
            claim[col] = claim[col].combine_first(claim[alt]) if col in claim.columns else claim[alt]
            claim = claim.drop(columns=[alt])

    claim["pre_p"] = claim["Y_pre"].map(bounded_prob_0_100)
    claim["post_p"] = claim["Y_post"].map(bounded_prob_0_100)
    claim["pre_logit"] = claim["pre_p"].map(lambda p: np.log(p / (1 - p)) if pd.notna(p) else np.nan)
    claim["post_logit"] = claim["post_p"].map(lambda p: np.log(p / (1 - p)) if pd.notna(p) else np.nan)
    claim["dlogit"] = claim["post_logit"] - claim["pre_logit"]

    exposure = exposure_table(df, fact_map)
    claim = claim.merge(exposure, on=["pid", "case_id", "claim_id"], how="left")
    for col in ["P_shown", "D_shown", "N_claim"]:
        if col not in claim.columns:
            claim[col] = 0
        claim[col] = claim[col].fillna(0).astype(int)
    claim["advocate_plaintiff"] = claim["advocate_plaintiff"].astype(float)
    claim["adv_x_P"] = claim["advocate_plaintiff"] * claim["P_shown"]
    claim["adv_x_D"] = claim["advocate_plaintiff"] * claim["D_shown"]
    return claim


def verdict_table(df: pd.DataFrame, fact_map: pd.DataFrame) -> pd.DataFrame:
    pre = df[df["page_type"].eq("pre_verdict_judgment")].copy()
    post = df[df["page_type"].eq("post_verdict_judgment")].copy()
    if pre.empty or post.empty:
        raise ValueError("Could not find pre/post verdict rows. Check page_type names.")
    value_col_pre = first_existing(pre, ["response", "value", "probability", "answer"])
    value_col_post = first_existing(post, ["response", "value", "probability", "answer"])
    pre = pre[["pid", "case_id", value_col_pre]].rename(columns={value_col_pre: "Y_pre_verdict"})
    post = post[["pid", "case_id", value_col_post]].rename(columns={value_col_post: "Y_post_verdict"})
    out = pre.merge(post, on=["pid", "case_id"], how="inner")
    assign = assignment_table(df)
    out = out.merge(assign[[c for c in ["pid", "case_id", "advocate_side", "advocate_plaintiff"] if c in assign.columns]],
                    on=["pid", "case_id"], how="left")
    out["pre_p"] = out["Y_pre_verdict"].map(bounded_prob_0_100)
    out["post_p"] = out["Y_post_verdict"].map(bounded_prob_0_100)
    out["pre_logit"] = out["pre_p"].map(lambda p: np.log(p / (1 - p)) if pd.notna(p) else np.nan)
    out["post_logit"] = out["post_p"].map(lambda p: np.log(p / (1 - p)) if pd.notna(p) else np.nan)
    out["dlogit"] = out["post_logit"] - out["pre_logit"]

    exp = exposure_table(df, fact_map)
    counts = exp.groupby(["pid", "case_id"], as_index=False).agg(
        P_count=("P_shown", "sum"),
        D_count=("D_shown", "sum"),
        N_case=("N_claim", "sum"),
    )
    out = out.merge(counts, on=["pid", "case_id"], how="left")
    for col in ["P_count", "D_count", "N_case"]:
        out[col] = out[col].fillna(0).astype(int)
    out["adv_x_P_count"] = out["advocate_plaintiff"] * out["P_count"]
    out["adv_x_D_count"] = out["advocate_plaintiff"] * out["D_count"]
    return out


def exposure_table(df: pd.DataFrame, fact_map: pd.DataFrame) -> pd.DataFrame:
    """One row per pid-case-claim with P/D shown indicators."""
    proc = process_table_base(df, fact_map)
    if proc.empty:
        return pd.DataFrame(columns=["pid", "case_id", "claim_id", "P_shown", "D_shown", "N_claim"])
    exp = proc.groupby(["pid", "case_id", "claim_id"], as_index=False).agg(
        P_shown=("S_plaintiff", lambda x: int(np.any(pd.Series(x).eq(1)))),
        D_shown=("S_plaintiff", lambda x: int(np.any(pd.Series(x).eq(0)))),
        N_claim=("fact_id", "nunique"),
    )
    return exp


# ---------------------------------------------------------------------
# Process table construction
# ---------------------------------------------------------------------


def process_table_base(df: pd.DataFrame, fact_map: pd.DataFrame) -> pd.DataFrame:
    """Construct shown fact rows from dossier_fact_process rows or dossier arrays."""
    rows = df[df["page_type"].eq("dossier_fact_process")].copy()
    if not rows.empty:
        rows["__row_order"] = rows.index
        keep = [c for c in ["pid", "case_id", "advocate_side", "advocate_plaintiff", "claim_id", "fact_id", "fn",
                            "picked_side", "shown", "opened", "open_count", "total_open_ms",
                            "inserted", "attached", "used", "reference", "insertion_count", "__row_order"] if c in rows.columns]
        out = rows[keep].copy()
    else:
        # Fallback: construct from dossier_fact_process list inside dossier row.
        out_rows = []
        dossiers = df[df["page_type"].eq("dossier")].copy()
        for dossier_order, r in dossiers.iterrows():
            arr = parse_list(r.get("dossier_fact_process"))
            for obj in arr:
                if not isinstance(obj, dict):
                    continue
                z = {"pid": r["pid"], "case_id": r.get("case_id"), "advocate_side": r.get("advocate_side"),
                     "advocate_plaintiff": r.get("advocate_plaintiff"), "__row_order": dossier_order}
                z.update(obj)
                out_rows.append(z)
        out = pd.DataFrame(out_rows)

    if out.empty:
        return out

    # Merge fact metadata from stimuli if available.
    if not fact_map.empty and "fact_id" in out.columns:
        meta_cols = [c for c in ["case_id", "claim_id", "fact_id", "fact_side", "S_plaintiff", "fact_text"] if c in fact_map.columns]
        out = out.merge(fact_map[meta_cols].drop_duplicates("fact_id"), on="fact_id", how="left", suffixes=("", "_stim"))
        for col in ["case_id", "claim_id"]:
            stim_col = f"{col}_stim"
            if stim_col in out.columns:
                out[col] = out[col].combine_first(out[stim_col]) if col in out.columns else out[stim_col]
                out = out.drop(columns=[stim_col])

    if "S_plaintiff" not in out.columns or out["S_plaintiff"].isna().all():
        side_col = first_existing(out, ["picked_side", "fact_side", "direction", "fact_helps_side"])
        if side_col:
            side = out[side_col].astype(str).str.lower()
            out["S_plaintiff"] = np.where(side.eq("plaintiff"), 1, np.where(side.eq("defendant"), 0, np.nan))
        else:
            out["S_plaintiff"] = np.nan

    # Ensure advocate coding.
    if "advocate_plaintiff" not in out.columns or out["advocate_plaintiff"].isna().all():
        assign = assignment_table(df)
        out = out.merge(assign[["pid", "case_id", "advocate_side", "advocate_plaintiff"]], on=["pid", "case_id"], how="left", suffixes=("", "_assign"))
        if "advocate_plaintiff_assign" in out.columns:
            out["advocate_plaintiff"] = out["advocate_plaintiff"].combine_first(out["advocate_plaintiff_assign"])
            out = out.drop(columns=["advocate_plaintiff_assign"])

    # Standardize process variables.
    for col in ["open_count", "total_open_ms", "inserted", "attached", "used", "reference", "insertion_count", "activation"]:
        if col not in out.columns:
            out[col] = 0
        out[col] = pd.to_numeric(out[col], errors="coerce").fillna(0)

    if "__row_order" not in out.columns:
        out["__row_order"] = np.arange(len(out))

    # Collapse repeated dossier attempts to one row per participant-case-fact.
    # Attention measures are cumulative across attempts; final-use measures come from the final attempt.
    if {"pid", "case_id", "fact_id"}.issubset(out.columns):
        out = out.sort_values(["pid", "case_id", "fact_id", "__row_order"])

        agg = {}
        for col in out.columns:
            if col in ["open_count", "total_open_ms"]:
                agg[col] = "sum"
            elif col == "opened":
                agg[col] = "max"
            elif col in ["inserted", "attached", "used", "reference", "insertion_count"]:
                agg[col] = "last"
            elif col == "__row_order":
                agg[col] = "last"
            elif col not in ["pid", "case_id", "fact_id"]:
                agg[col] = "last"

        out = out.groupby(["pid", "case_id", "fact_id"], as_index=False).agg(agg)

    # Recompute final reference from the final inserted/attached/used values.
    out["reference"] = ((out["inserted"] > 0) | (out["attached"] > 0) | (out["used"] > 0)).astype(int)

    # Recompute opened from cumulative open_count.
    out["opened"] = (out["open_count"] > 0).astype(int)
    out["log1p_total_view_ms"] = np.log1p(out["total_open_ms"].clip(lower=0))

    out = out.drop(columns=["__row_order"], errors="ignore")
    return out


def add_activation(df: pd.DataFrame, proc: pd.DataFrame) -> pd.DataFrame:
    if proc.empty:
        return proc
    activation_rows = df[df["page_type"].eq("activation_check")].copy()
    activated_records = []
    for _, r in activation_rows.iterrows():
        ids = set(parse_list(r.get("activated_fact_ids")))
        details = parse_list(r.get("activated_fact_details"))
        if details:
            for obj in details:
                if not isinstance(obj, dict):
                    continue
                activated_records.append({
                    "pid": r["pid"],
                    "case_id": r.get("case_id"),
                    "fact_id": obj.get("fact_id"),
                    "activation": int(bool(obj.get("activated")))
                })
        else:
            for fid in ids:
                activated_records.append({"pid": r["pid"], "case_id": r.get("case_id"), "fact_id": fid, "activation": 1})
    if activated_records:
        act = pd.DataFrame(activated_records).drop_duplicates(["pid", "case_id", "fact_id"], keep="last")
        proc = proc.drop(columns=["activation"], errors="ignore").merge(act, on=["pid", "case_id", "fact_id"], how="left")
        proc["activation"] = proc["activation"].fillna(0).astype(int)
    else:
        proc["activation"] = 0
    return proc


def process_table(df: pd.DataFrame, fact_map: pd.DataFrame) -> pd.DataFrame:
    proc = process_table_base(df, fact_map)
    proc = add_activation(df, proc)
    if proc.empty:
        return proc
    exp_counts = proc.groupby(["pid", "case_id", "claim_id"], as_index=False).agg(N_claim=("fact_id", "nunique"))
    case_counts = proc.groupby(["pid", "case_id"], as_index=False).agg(N_case=("fact_id", "nunique"))
    proc = proc.merge(exp_counts, on=["pid", "case_id", "claim_id"], how="left")
    proc = proc.merge(case_counts, on=["pid", "case_id"], how="left")
    proc["adv_x_S"] = proc["advocate_plaintiff"].astype(float) * proc["S_plaintiff"].astype(float)
    return proc


# ---------------------------------------------------------------------
# Modeling helpers
# ---------------------------------------------------------------------


def fit_ols(formula: str, data: pd.DataFrame, cluster: Optional[str] = "pid"):
    d = data.copy()
    # statsmodels cannot handle missing values in cluster vector cleanly.
    needed = [cluster] if cluster and cluster in d.columns else []
    d = d.dropna(subset=needed) if needed else d
    model = smf.ols(formula=formula, data=d, missing="drop").fit()
    if cluster and cluster in d.columns:
        used = d.loc[model.model.data.row_labels]
        return model.get_robustcov_results(cov_type="cluster", groups=used[cluster])
    return model


def coef_table(model, name: str) -> pd.DataFrame:
    params = pd.Series(model.params, index=model.model.exog_names, name="coef")
    bse = pd.Series(model.bse, index=model.model.exog_names, name="se")
    tvals = pd.Series(model.tvalues, index=model.model.exog_names, name="t")
    pvals = pd.Series(model.pvalues, index=model.model.exog_names, name="p_two_sided")
    out = pd.concat([params, bse, tvals, pvals], axis=1).reset_index().rename(columns={"index": "term"})
    out.insert(0, "model", name)
    out["nobs"] = model.nobs
    return out


def one_sided_p_from_t(t: float, direction: str = ">") -> float:
    # normal approximation; good enough for summary table, model table contains robust t.
    from scipy.stats import norm
    if direction == ">":
        return float(1 - norm.cdf(t))
    return float(norm.cdf(t))


def add_one_sided_pvals(coef: pd.DataFrame) -> pd.DataFrame:
    out = coef.copy()
    if out.empty or "t" not in out.columns:
        return out
    out["p_one_sided_gt0"] = out["t"].map(lambda t: one_sided_p_from_t(t, ">") if pd.notna(t) else np.nan)
    out["p_one_sided_lt0"] = out["t"].map(lambda t: one_sided_p_from_t(t, "<") if pd.notna(t) else np.nan)
    return out


def fit_mixedlm(formula: str, data: pd.DataFrame, group: str = "pid", re_formula: Optional[str] = None):
    d = data.dropna(subset=[group]).copy()
    try:
        return smf.mixedlm(
            formula=formula,
            data=d,
            groups=d[group],
            re_formula=re_formula,
            missing="drop"
        ).fit(reml=False, method="lbfgs")
    except Exception as e:
        print(f"[MixedLM failed] {formula}\nre_formula={re_formula}\n{e}")
        return None


def coef_table_mixed(model, name: str) -> pd.DataFrame:
    params = pd.Series(model.params, name="coef")
    bse = pd.Series(model.bse, name="se")
    tvals = pd.Series(model.tvalues, name="t")
    pvals = pd.Series(model.pvalues, name="p_two_sided")
    out = pd.concat([params, bse, tvals, pvals], axis=1).reset_index().rename(columns={"index": "term"})
    out.insert(0, "model", name)
    out["nobs"] = model.nobs
    return out


def contrast_diff(model, term_a: str, term_b: str, name: str, direction: str = ">") -> pd.DataFrame:
    names = model.model.exog_names
    if term_a not in names or term_b not in names:
        return pd.DataFrame([{"contrast": name, "term_a": term_a, "term_b": term_b, "estimate": np.nan, "se": np.nan, "t": np.nan, "p_one_sided": np.nan, "note": "missing term"}])
    L = np.zeros(len(names))
    L[names.index(term_a)] = 1
    L[names.index(term_b)] = -1
    ct = model.t_test(L)
    est = float(np.asarray(ct.effect).ravel()[0])
    se = float(np.asarray(ct.sd).ravel()[0])
    t = float(np.asarray(ct.tvalue).ravel()[0])
    return pd.DataFrame([{"contrast": name, "term_a": term_a, "term_b": term_b, "estimate": est, "se": se, "t": t, "p_one_sided": one_sided_p_from_t(t, direction), "note": ""}])


def contrast_sum(model, term_a: str, term_b: str, name: str, direction: str = ">") -> pd.DataFrame:
    """Test term_a + term_b.

    Used for the corrected asymmetric-updating contrast. With outcomes coded so
    higher values are more pro-Plaintiff and Adv=1 for Plaintiff advocate:
      - adv_x_P > 0 means Plaintiff advocates respond more to Plaintiff evidence.
      - adv_x_D > 0 means Plaintiff advocates respond less negatively to Defendant evidence.
    Therefore adv_x_P + adv_x_D > 0 is the pooled directional asymmetric-updating test.
    """
    names = model.model.exog_names
    if term_a not in names or term_b not in names:
        return pd.DataFrame([{"contrast": name, "term_a": term_a, "term_b": term_b, "estimate": np.nan, "se": np.nan, "t": np.nan, "p_one_sided": np.nan, "note": "missing term"}])
    L = np.zeros(len(names))
    L[names.index(term_a)] = 1
    L[names.index(term_b)] = 1
    ct = model.t_test(L)
    est = float(np.asarray(ct.effect).ravel()[0])
    se = float(np.asarray(ct.sd).ravel()[0])
    t = float(np.asarray(ct.tvalue).ravel()[0])
    return pd.DataFrame([{"contrast": name, "term_a": term_a, "term_b": term_b, "estimate": est, "se": se, "t": t, "p_one_sided": one_sided_p_from_t(t, direction), "note": ""}])


def stacked_attenuation_test(
    data: pd.DataFrame,
    outcome: str,
    baseline_rhs: str,
    augmented_rhs: str,
    target_weights: Dict[str, float],
    quantity: str,
    model_label: str,
    cluster: str = "pid",
) -> Dict[str, float]:
    """Jointly estimate matched baseline and augmented models and test attenuation.

    This mirrors the stacked-equation procedure used in the Study 6 analysis.
    The coefficient difference is estimated directly, preserving the covariance
    between specifications and clustering the joint model by participant.
    All displayed Study 5 estimands have a preregistered positive direction, so
    attenuation toward zero is baseline minus augmented greater than zero.
    """
    d0 = data.copy()
    d1 = data.copy()
    d0["_model"] = "baseline"
    d1["_model"] = "augmented"
    stacked = pd.concat([d0, d1], ignore_index=True, sort=False)
    stacked["_aug"] = stacked["_model"].eq("augmented").astype(int)
    formula = f"{outcome} ~ ({baseline_rhs}) + _aug:({augmented_rhs})"
    fit = fit_ols(formula, stacked, cluster=cluster)
    names = list(fit.model.exog_names)

    def interaction_name(term: str) -> str:
        preferred = f"_aug:{term}"
        alternate = f"{term}:_aug"
        if preferred in names:
            return preferred
        if alternate in names:
            return alternate
        raise KeyError(f"Stacked attenuation model omitted interaction for {term}")

    base_L = np.zeros(len(names))
    increment_L = np.zeros(len(names))
    for term, weight in target_weights.items():
        if term not in names:
            raise KeyError(f"Stacked attenuation model omitted baseline term {term}")
        base_L[names.index(term)] = weight
        increment_L[names.index(interaction_name(term))] = weight

    base_est = float(base_L @ np.asarray(fit.params))
    increment_est = float(increment_L @ np.asarray(fit.params))
    augmented_est = base_est + increment_est
    attenuation_L = -increment_L
    attenuation_est = -increment_est
    covariance = np.asarray(fit.cov_params())
    attenuation_se = float(np.sqrt(max(0.0, attenuation_L @ covariance @ attenuation_L)))
    t_value = attenuation_est / attenuation_se if attenuation_se > 0 else np.nan
    p_two = 2 * (1 - st.t.cdf(abs(t_value), fit.df_resid)) if np.isfinite(t_value) else np.nan
    p_one = p_two / 2 if attenuation_est >= 0 else 1 - p_two / 2

    return {
        "quantity": quantity,
        "model": model_label,
        "stacked_baseline": base_est,
        "stacked_augmented": augmented_est,
        "attenuation": attenuation_est,
        "attenuation_se": attenuation_se,
        "t": t_value,
        "p_one_sided": p_one,
        "p_two_sided": p_two,
        "nobs_stacked": float(fit.nobs),
        "n_clusters": float(stacked.loc[fit.model.data.row_labels, cluster].nunique()),
    }


# ---------------------------------------------------------------------
# Attenuation aggregation
# ---------------------------------------------------------------------


def aggregate_process_claim(proc: pd.DataFrame) -> pd.DataFrame:
    if proc.empty:
        return pd.DataFrame()
    d = proc.copy()
    d["side"] = np.where(d["S_plaintiff"].eq(1), "P", "D")
    agg = d.groupby(["pid", "case_id", "claim_id", "side"], as_index=False).agg(
        open_count_total=("open_count", "sum"),
        total_view_ms_total=("total_open_ms", "sum"),
        reference_total=("reference", "sum"),
        activation_total=("activation", "sum"),
    )
    agg["log1p_total_view_ms_total"] = np.log1p(agg["total_view_ms_total"].clip(lower=0))
    wide = agg.pivot_table(index=["pid", "case_id", "claim_id"], columns="side", values=["open_count_total", "log1p_total_view_ms_total", "reference_total", "activation_total"], fill_value=0, aggfunc="first")
    wide.columns = [f"{side}_{var}" for var, side in wide.columns]
    wide = wide.reset_index()
    # Ensure both side columns exist.
    for side in ["P", "D"]:
        for var in ["open_count_total", "log1p_total_view_ms_total", "reference_total", "activation_total"]:
            col = f"{side}_{var}"
            if col not in wide.columns:
                wide[col] = 0
    return wide


def aggregate_process_case(proc: pd.DataFrame) -> pd.DataFrame:
    if proc.empty:
        return pd.DataFrame()
    d = proc.copy()
    d["side"] = np.where(d["S_plaintiff"].eq(1), "P", "D")
    agg = d.groupby(["pid", "case_id", "side"], as_index=False).agg(
        open_count_total=("open_count", "sum"),
        total_view_ms_total=("total_open_ms", "sum"),
        reference_total=("reference", "sum"),
        activation_total=("activation", "sum"),
    )
    agg["log1p_total_view_ms_total"] = np.log1p(agg["total_view_ms_total"].clip(lower=0))
    wide = agg.pivot_table(index=["pid", "case_id"], columns="side", values=["open_count_total", "log1p_total_view_ms_total", "reference_total", "activation_total"], fill_value=0, aggfunc="first")
    wide.columns = [f"{side}_{var}" for var, side in wide.columns]
    wide = wide.reset_index()
    for side in ["P", "D"]:
        for var in ["open_count_total", "log1p_total_view_ms_total", "reference_total", "activation_total"]:
            col = f"{side}_{var}"
            if col not in wide.columns:
                wide[col] = 0
    return wide




# ---------------------------------------------------------------------
# Display helpers: main figure and compact tables
# ---------------------------------------------------------------------


def advocate_label(x: Any) -> str:
    try:
        return "Plaintiff advocate" if float(x) == 1 else "Defendant advocate"
    except Exception:
        return "Unknown"


def claim_exposure_condition(row: pd.Series) -> str:
    p = int(row.get("P_shown", 0) or 0)
    d = int(row.get("D_shown", 0) or 0)
    if p == 1 and d == 0:
        return "Plaintiff-only"
    if p == 0 and d == 1:
        return "Defendant-only"
    if p == 1 and d == 1:
        return "Both"
    return "No evidence"


def verdict_balance_condition(row: pd.Series) -> str:
    p = float(row.get("P_count", 0) or 0)
    d = float(row.get("D_count", 0) or 0)
    if p > d:
        return "More Plaintiff"
    if d > p:
        return "More Defendant"
    return "Equal"


def add_visual_columns(claim: pd.DataFrame, verdict: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    claim_v = claim.copy()
    verdict_v = verdict.copy()
    claim_v["delta_pp"] = (claim_v["post_p"] - claim_v["pre_p"]) * 100.0
    verdict_v["delta_pp"] = (verdict_v["post_p"] - verdict_v["pre_p"]) * 100.0
    claim_v["advocate_label"] = claim_v["advocate_plaintiff"].map(advocate_label)
    verdict_v["advocate_label"] = verdict_v["advocate_plaintiff"].map(advocate_label)
    claim_v["exposure_condition"] = claim_v.apply(claim_exposure_condition, axis=1)
    verdict_v["evidence_balance"] = verdict_v.apply(verdict_balance_condition, axis=1)
    return claim_v, verdict_v


def clustered_summary(data: pd.DataFrame, y: str, group_cols: List[str], cluster: str = "pid") -> pd.DataFrame:
    """Mean and cluster-level CI for raw visual summaries."""
    cols = group_cols + [cluster, y]
    d = data[cols].dropna().copy()
    if d.empty:
        return pd.DataFrame(columns=group_cols + ["mean", "se", "ci95", "n_clusters", "n_obs"])
    # One cluster contributes one mean per plotted cell.
    cluster_means = d.groupby(group_cols + [cluster], as_index=False)[y].mean()
    summ = cluster_means.groupby(group_cols, as_index=False).agg(
        mean=(y, "mean"),
        sd=(y, "std"),
        n_clusters=(cluster, "nunique"),
    )
    obs = d.groupby(group_cols, as_index=False).size().rename(columns={"size": "n_obs"})
    summ = summ.merge(obs, on=group_cols, how="left")
    summ["se"] = summ["sd"] / np.sqrt(summ["n_clusters"].clip(lower=1))
    summ.loc[summ["n_clusters"] < 2, "se"] = np.nan
    summ["ci95"] = 1.96 * summ["se"]
    return summ.drop(columns=["sd"])


def plot_single_group(ax, summ: pd.DataFrame, x_col: str, order: List[str], title: str, ylabel: str = "Post − pre change\n(probability points)") -> None:
    x = np.arange(len(order))
    means = []
    errs = []
    for cat in order:
        row = summ[summ[x_col].eq(cat)]
        means.append(float(row["mean"].iloc[0]) if not row.empty else np.nan)
        errs.append(float(row["ci95"].iloc[0]) if not row.empty else np.nan)
    ax.bar(x, means, yerr=errs, capsize=4)
    ax.axhline(0, linewidth=1)
    ax.set_xticks(x)
    ax.set_xticklabels(order, rotation=0)
    ax.set_title(title)
    ax.set_ylabel(ylabel)


def plot_grouped(ax, summ: pd.DataFrame, x_col: str, hue_col: str, x_order: List[str], hue_order: List[str], title: str, ylabel: str = "Post − pre change\n(probability points)") -> None:
    x = np.arange(len(x_order))
    width = 0.38 if len(hue_order) == 2 else 0.8 / max(len(hue_order), 1)
    offsets = np.linspace(-width * (len(hue_order) - 1) / 2, width * (len(hue_order) - 1) / 2, len(hue_order))
    for h, off in zip(hue_order, offsets):
        means = []
        errs = []
        for cat in x_order:
            row = summ[summ[x_col].eq(cat) & summ[hue_col].eq(h)]
            means.append(float(row["mean"].iloc[0]) if not row.empty else np.nan)
            errs.append(float(row["ci95"].iloc[0]) if not row.empty else np.nan)
        ax.bar(x + off, means, width=width, yerr=errs, capsize=4, label=h)
    ax.axhline(0, linewidth=1)
    ax.set_xticks(x)
    ax.set_xticklabels(x_order, rotation=0)
    ax.set_title(title)
    ax.set_ylabel(ylabel)
    ax.legend(frameon=False, fontsize=8)


def show_main_figure(claim: pd.DataFrame, verdict: pd.DataFrame, outdir: Optional[Path] = None) -> None:
    """Create Figure 5A--5D and save it to outdir when provided."""
    if plt is None:
        print("\n[Skipping Figure 5: matplotlib is not available.]\n")
        return
    claim_v, verdict_v = add_visual_columns(claim, verdict)
    adv_order = ["Defendant advocate", "Plaintiff advocate"]
    claim_exposure_order = ["Defendant-only", "Both", "Plaintiff-only"]
    verdict_balance_order = ["More Defendant", "Equal", "More Plaintiff"]

    fig, axes = plt.subplots(2, 2, figsize=(12, 8), constrained_layout=True)

    s1 = clustered_summary(claim_v, "delta_pp", ["advocate_label"])
    plot_single_group(axes[0, 0], s1, "advocate_label", adv_order, "A. Claim-level advocacy effect")

    s2 = clustered_summary(claim_v[claim_v["exposure_condition"].isin(claim_exposure_order)], "delta_pp", ["exposure_condition", "advocate_label"])
    plot_grouped(axes[0, 1], s2, "exposure_condition", "advocate_label", claim_exposure_order, adv_order, "B. Claim-level updating by evidence shown")

    s3 = clustered_summary(verdict_v, "delta_pp", ["advocate_label"])
    plot_single_group(axes[1, 0], s3, "advocate_label", adv_order, "C. Verdict-level advocacy effect")

    s4 = clustered_summary(verdict_v[verdict_v["evidence_balance"].isin(verdict_balance_order)], "delta_pp", ["evidence_balance", "advocate_label"])
    plot_grouped(axes[1, 1], s4, "evidence_balance", "advocate_label", verdict_balance_order, adv_order, "D. Verdict-level updating by evidence balance")

    fig.suptitle("Figure 5. Belief updating toward the Plaintiff", fontsize=14)
    if outdir is not None:
        outdir.mkdir(parents=True, exist_ok=True)
        fig_path = outdir / "figure_5_raw_scale_main_results.png"
        fig.savefig(fig_path, dpi=300, bbox_inches="tight")
        plt.close(fig)
        print(f"Saved Figure 5 to: {fig_path}")
    else:
        # Non-blocking display to avoid IDLE/Python Launcher freezes after closing.
        plt.show(block=False)
        plt.pause(0.001)




def _linear_combo_from_model(model, weights: Dict[str, float], name: str) -> Dict[str, Any]:
    """Estimate a linear combination of model coefficients with robust SE."""
    names = list(model.model.exog_names)
    L = np.zeros(len(names))
    missing = []
    for term, weight in weights.items():
        if term in names:
            L[names.index(term)] = weight
        else:
            missing.append(term)
    if missing:
        return {"quantity": name, "estimate": np.nan, "se": np.nan, "ci95": np.nan, "missing_terms": ";".join(missing)}
    ct = model.t_test(L)
    est = float(np.asarray(ct.effect).ravel()[0])
    se = float(np.asarray(ct.sd).ravel()[0])
    return {"quantity": name, "estimate": est, "se": se, "ci95": 1.96 * se, "missing_terms": ""}


def _evidence_responsiveness_values(claim: pd.DataFrame, verdict: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Estimate evidence-response effects by advocacy role.

    Values are marginal effects of evidence exposure on post-pre probability-point
    updating. For Plaintiff evidence, positive values mean movement toward the
    Plaintiff. For Defendant evidence, negative values mean movement toward the
    Defendant; asymmetric updating predicts that this negative effect is larger
    in magnitude for Defendant advocates than for Plaintiff advocates.
    """
    claim_v, verdict_v = add_visual_columns(claim, verdict)

    claim_model = fit_ols(
        "delta_pp ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)",
        claim_v,
        cluster="pid",
    )
    verdict_model = fit_ols(
        "delta_pp ~ advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id)",
        verdict_v,
        cluster="pid",
    )

    claim_rows = []
    claim_specs = [
        ("Plaintiff evidence", "Defendant advocate", {"P_shown": 1.0}),
        ("Plaintiff evidence", "Plaintiff advocate", {"P_shown": 1.0, "adv_x_P": 1.0}),
        ("Defendant evidence", "Defendant advocate", {"D_shown": 1.0}),
        ("Defendant evidence", "Plaintiff advocate", {"D_shown": 1.0, "adv_x_D": 1.0}),
    ]
    for evidence, advocate, weights in claim_specs:
        row = _linear_combo_from_model(claim_model, weights, f"{advocate}: {evidence}")
        row.update({"level": "Claim-level", "evidence": evidence, "advocate": advocate})
        claim_rows.append(row)

    verdict_rows = []
    verdict_specs = [
        ("Plaintiff evidence count", "Defendant advocate", {"P_count": 1.0}),
        ("Plaintiff evidence count", "Plaintiff advocate", {"P_count": 1.0, "adv_x_P_count": 1.0}),
        ("Defendant evidence count", "Defendant advocate", {"D_count": 1.0}),
        ("Defendant evidence count", "Plaintiff advocate", {"D_count": 1.0, "adv_x_D_count": 1.0}),
    ]
    for evidence, advocate, weights in verdict_specs:
        row = _linear_combo_from_model(verdict_model, weights, f"{advocate}: {evidence}")
        row.update({"level": "Verdict-level", "evidence": evidence, "advocate": advocate})
        verdict_rows.append(row)

    return pd.DataFrame(claim_rows), pd.DataFrame(verdict_rows)


def _plot_evidence_responsiveness_panel(ax, vals: pd.DataFrame, title: str, evidence_order: List[str]) -> None:
    advocate_order = ["Defendant advocate", "Plaintiff advocate"]
    x = np.arange(len(evidence_order))
    width = 0.38
    offsets = [-width / 2, width / 2]
    for advocate, offset in zip(advocate_order, offsets):
        means, errs = [], []
        for evidence in evidence_order:
            row = vals[vals["evidence"].eq(evidence) & vals["advocate"].eq(advocate)]
            means.append(float(row["estimate"].iloc[0]) if not row.empty else np.nan)
            errs.append(float(row["ci95"].iloc[0]) if not row.empty else np.nan)
        ax.bar(x + offset, means, width=width, yerr=errs, capsize=5, label=advocate)
    ax.axhline(0, linewidth=1)
    ax.set_xticks(x)
    ax.set_xticklabels(evidence_order, rotation=0)
    ax.set_title(title)
    ax.set_ylabel("Estimated evidence effect\n(probability points)")
    ax.legend(frameon=False, fontsize=8)


def show_model_adjusted_figure(claim: pd.DataFrame, verdict: pd.DataFrame, outdir: Optional[Path] = None) -> None:
    """Create a model-estimated evidence-responsiveness figure.

    This figure plots the estimated marginal effect of Plaintiff-favoring and Defendant-favoring
    evidence separately for Defendant and Plaintiff advocates, using the same
    participant-clustered covariance logic as the regressions. This directly
    visualizes the quantities underlying gamma_P and gamma_D.
    """
    if plt is None:
        print("\n[Skipping evidence-responsiveness figure: matplotlib is not available.]\n")
        return

    claim_vals, verdict_vals = _evidence_responsiveness_values(claim, verdict)
    if claim_vals.empty and verdict_vals.empty:
        print("\n[Skipping evidence-responsiveness figure: no values available.]\n")
        return

    fig, axes = plt.subplots(1, 2, figsize=(12, 4.8), constrained_layout=True)

    _plot_evidence_responsiveness_panel(
        axes[0],
        claim_vals,
        "A. Claim-level evidence responsiveness",
        ["Plaintiff evidence", "Defendant evidence"],
    )
    _plot_evidence_responsiveness_panel(
        axes[1],
        verdict_vals,
        "B. Verdict-level evidence-count responsiveness",
        ["Plaintiff evidence count", "Defendant evidence count"],
    )

    fig.suptitle("Figure 2. Model-estimated evidence responsiveness by advocacy role", fontsize=14)

    if outdir is not None:
        outdir.mkdir(parents=True, exist_ok=True)
        fig_path = outdir / "figure_5_model_adjusted_evidence_responsiveness.png"
        fig.savefig(fig_path, dpi=300, bbox_inches="tight")
        plt.close(fig)
        claim_vals.to_csv(outdir / "figure_5_evidence_responsiveness_claim_values.csv", index=False)
        verdict_vals.to_csv(outdir / "figure_5_evidence_responsiveness_verdict_values.csv", index=False)
        print(f"Saved evidence-responsiveness figure to: {fig_path}")
        print(f"Saved evidence-responsiveness values to: {outdir / 'figure_5_evidence_responsiveness_claim_values.csv'} and {outdir / 'figure_5_evidence_responsiveness_verdict_values.csv'}")
    else:
        plt.show(block=False)
        plt.pause(0.001)


def show_attenuation_estimates_figure(
    claim_base,
    claim_adjusted,
    claim_asymmetry_base,
    claim_asymmetry_adjusted,
    verdict_base,
    verdict_adjusted,
    outdir: Path,
) -> pd.DataFrame:
    """Plot the actual baseline and process-adjusted estimands with 95% CIs."""
    specs = [
        ("Claim advocacy", "Baseline", claim_base, {"advocate_plaintiff": 1.0}),
        ("Claim advocacy", "Process-adjusted", claim_adjusted, {"advocate_plaintiff": 1.0}),
        ("Verdict advocacy", "Baseline", verdict_base, {"advocate_plaintiff": 1.0}),
        ("Verdict advocacy", "Process-adjusted", verdict_adjusted, {"advocate_plaintiff": 1.0}),
        ("Claim asymmetry", "Baseline", claim_asymmetry_base, {"adv_x_P": 1.0, "adv_x_D": 1.0}),
        ("Claim asymmetry", "Process-adjusted", claim_asymmetry_adjusted, {"adv_x_P": 1.0, "adv_x_D": 1.0}),
    ]
    rows = []
    for estimand, specification, model, weights in specs:
        row = _linear_combo_from_model(model, weights, estimand)
        row.update({"estimand": estimand, "specification": specification})
        row["ci_low"] = row["estimate"] - row["ci95"]
        row["ci_high"] = row["estimate"] + row["ci95"]
        rows.append(row)
    values = pd.DataFrame(rows)

    baseline = values.loc[values["specification"].eq("Baseline")].set_index("estimand")
    adjusted = values.loc[values["specification"].eq("Process-adjusted")].set_index("estimand")
    for estimand in baseline.index.intersection(adjusted.index):
        base = float(baseline.loc[estimand, "estimate"])
        aug = float(adjusted.loc[estimand, "estimate"])
        values.loc[values["estimand"].eq(estimand), "attenuation_percent"] = (
            100.0 * (base - aug) / base if abs(base) > 1e-12 else np.nan
        )

    outdir.mkdir(parents=True, exist_ok=True)
    values.to_csv(outdir / "figure_5_attenuation_estimates_values.csv", index=False)
    if plt is None:
        return values

    order = ["Claim advocacy", "Verdict advocacy", "Claim asymmetry"]
    colors = {"Baseline": "#2878B5", "Process-adjusted": "#F27C0E"}
    offsets = {"Baseline": 0.12, "Process-adjusted": -0.12}
    fig, ax = plt.subplots(figsize=(8.4, 3.0), constrained_layout=True)
    for specification in ["Baseline", "Process-adjusted"]:
        subset = values.loc[values["specification"].eq(specification)].set_index("estimand")
        y = np.arange(len(order), dtype=float) + offsets[specification]
        estimates = np.array([subset.loc[name, "estimate"] for name in order], dtype=float)
        errors = np.array([subset.loc[name, "ci95"] for name in order], dtype=float)
        ax.errorbar(
            estimates,
            y,
            xerr=errors,
            fmt="o",
            markersize=6,
            capsize=3,
            linewidth=1.5,
            color=colors[specification],
            label=specification,
        )
    ax.axvline(0, color="#555555", linewidth=1, linestyle="--")
    ax.set_yticks(np.arange(len(order)))
    ax.set_yticklabels(order)
    ax.invert_yaxis()
    ax.set_xlabel("Estimated effect on logit belief change (95% CI)")
    ax.legend(frameon=False, loc="upper right")
    ax.spines[["top", "right"]].set_visible(False)
    for suffix in ["pdf", "png"]:
        fig.savefig(
            outdir / f"figure_5_attenuation_estimates.{suffix}",
            dpi=300 if suffix == "png" else None,
            bbox_inches="tight",
        )
    plt.close(fig)
    return values

def extract_coef(coef: pd.DataFrame, model: str, term_options: List[str]) -> Tuple[float, float, float]:
    d = coef[coef["model"].eq(model)]
    for term in term_options:
        row = d[d["term"].eq(term)]
        if not row.empty:
            return float(row["coef"].iloc[0]), float(row["se"].iloc[0]), float(row["p_two_sided"].iloc[0])
    return np.nan, np.nan, np.nan


def display_table(title: str, table: pd.DataFrame, digits: int = 3) -> None:
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)
    if table is None or table.empty:
        print("[No rows]")
        return
    out = table.copy()
    for c in out.columns:
        if pd.api.types.is_numeric_dtype(out[c]):
            out[c] = out[c].map(lambda x: "" if pd.isna(x) else f"{x:.{digits}f}")
    print(out.to_string(index=False))


def save_display_table(title: str, table: pd.DataFrame, outdir: Path, filename_stem: str, digits: int = 3) -> None:
    """Save a compact displayed table as both CSV and readable TXT."""
    outdir.mkdir(parents=True, exist_ok=True)
    if table is None:
        table = pd.DataFrame()
    csv_path = outdir / f"{filename_stem}.csv"
    txt_path = outdir / f"{filename_stem}.txt"
    table.to_csv(csv_path, index=False)

    display_copy = table.copy()
    for c in display_copy.columns:
        if pd.api.types.is_numeric_dtype(display_copy[c]):
            display_copy[c] = display_copy[c].map(lambda x: "" if pd.isna(x) else f"{x:.{digits}f}")
    body = "[No rows]" if display_copy.empty else display_copy.to_string(index=False)
    txt_path.write_text(f"{title}\n{'=' * len(title)}\n{body}\n", encoding="utf-8")
    print(f"Saved {title} to: {csv_path} and {txt_path}")


def make_main_results_table(coef: pd.DataFrame, contrasts: pd.DataFrame) -> pd.DataFrame:
    rows = []

    def add_coef_row(quantity: str, model: str, terms: List[str], direction: str = ">"):
        b, se, _p2 = extract_coef(coef, model, terms)
        p1 = one_sided_p_from_t(b / se, direction) if pd.notna(b) and pd.notna(se) and se > 0 else np.nan
        rows.append({"Quantity": quantity, "Estimate": b, "SE": se, "p(one-sided, >0)": p1})

    def add_contrast_row(quantity: str, contrast_name: str):
        row = contrasts[contrasts["contrast"].eq(contrast_name)]
        if not row.empty:
            rows.append({
                "Quantity": quantity,
                "Estimate": row["estimate"].iloc[0],
                "SE": row["se"].iloc[0],
                "p(one-sided)": row["p_one_sided"].iloc[0],
            })

    # Claim-level updating.
    add_coef_row(
        "H1: claim-level total advocacy effect",
        "claim_update_base",
        ["advocate_plaintiff"],
    )
    add_coef_row(
        "Secondary: claim-level residual/direct advocacy effect after H2 terms",
        "claim_asymmetry",
        ["advocate_plaintiff"],
    )
    add_coef_row(
        "H2 component: claim-level gamma_P = Adv × Plaintiff evidence",
        "claim_asymmetry",
        ["adv_x_P"],
    )
    add_coef_row(
        "H2 component: claim-level gamma_D = Adv × Defendant evidence",
        "claim_asymmetry",
        ["adv_x_D"],
    )
    add_contrast_row(
        "H2: claim-level asymmetry (gamma_P + gamma_D)",
        "claim_asymmetry_gamma_P_plus_gamma_D",
    )

    # Verdict-level updating.
    add_coef_row(
        "H1: verdict-level total advocacy effect",
        "verdict_update_base",
        ["advocate_plaintiff"],
    )
    add_coef_row(
        "Secondary: verdict-level residual/direct advocacy effect after H2 terms",
        "verdict_asymmetry",
        ["advocate_plaintiff"],
    )
    add_coef_row(
        "H2 component: verdict-level gamma_P = Adv × Plaintiff evidence count",
        "verdict_asymmetry",
        ["adv_x_P_count"],
    )
    add_coef_row(
        "H2 component: verdict-level gamma_D = Adv × Defendant evidence count",
        "verdict_asymmetry",
        ["adv_x_D_count"],
    )
    add_contrast_row(
        "H2: verdict-level asymmetry (gamma_P + gamma_D)",
        "verdict_asymmetry_gamma_P_plus_gamma_D",
    )

    return pd.DataFrame(rows)


def make_process_results_table(coef: pd.DataFrame) -> pd.DataFrame:
    labels = {
        "process_outcome_open_count": "Open count",
        "process_outcome_log1p_total_view_ms": "Log(1 + viewing time)",
        "process_outcome_reference": "Reference",
        "process_outcome_activation": "Activation",
    }
    rows = []
    interaction_terms = ["advocate_plaintiff:S_plaintiff", "S_plaintiff:advocate_plaintiff"]
    for model, label in labels.items():
        b, se, p = extract_coef(coef, model, interaction_terms)
        p1 = one_sided_p_from_t(b / se, ">") if pd.notna(b) and pd.notna(se) and se > 0 else np.nan
        rows.append({"Process outcome": label, "Advocacy × Plaintiff evidence": b, "SE": se, "p(one-sided, >0)": p1})
    return pd.DataFrame(rows)


def make_attenuation_display_table(att: pd.DataFrame) -> pd.DataFrame:
    if att is None or att.empty:
        return pd.DataFrame()
    renamed = att.rename(columns={
        "quantity": "Quantity",
        "model": "Process controls",
        "base": "Baseline",
        "augmented": "Augmented",
        "attenuation": "Attenuation",
        "percent_attenuation": "% attenuation",
        "attenuation_se": "Attenuation SE",
        "p_one_sided": "p (one-sided)",
        "p_two_sided": "p (two-sided)",
    })
    columns = ["Quantity", "Process controls", "Baseline", "Augmented", "Attenuation", "% attenuation"]
    columns += [c for c in ["Attenuation SE", "p (one-sided)", "p (two-sided)"] if c in renamed.columns]
    return renamed[columns]


def make_mechanism_results_table(coef: pd.DataFrame) -> pd.DataFrame:
    """Compact display for selective-processing mechanism regressions.

    Outcome in these models is toward_assigned_update, so positive coefficients mean
    more movement toward the participant's assigned advocacy side.
    """
    rows = []
    specs = [
        ("mechanism_selective_open", "Selective open count", "selective_open"),
        ("mechanism_selective_view", "Selective log viewing time", "selective_view"),
        ("mechanism_selective_reference", "Selective reference", "selective_reference"),
        ("mechanism_selective_activation", "Selective activation", "selective_activation"),
        ("mechanism_selective_all", "Selective processing: all measures", "selective_index"),
    ]
    for model, label, term in specs:
        b, se, p = extract_coef(coef, model, [term])
        if not pd.isna(b):
            rows.append({
                "Mechanism predictor": label,
                "Coef": b,
                "SE": se,
                "p(two-sided)": p,
                "p(one-sided, >0)": p / 2 if b > 0 and pd.notna(p) else (1 - p / 2 if pd.notna(p) else np.nan),
            })
    return pd.DataFrame(rows)


def make_asymmetry_mechanism_results_table(contrasts: pd.DataFrame) -> pd.DataFrame:
    """Compact display for selective-processing moderation of asymmetric updating.

    These models ask whether selective processing strengthens the corrected H2
    asymmetric-updating contrast. The displayed contrast is:
        selective_process × Adv × P_shown
        plus
        selective_process × Adv × D_shown
    so positive values mean that selective processing is associated with stronger
    advocacy-congenial evidence responsiveness in the predicted direction.
    """
    rows = []
    specs = [
        ("asymmetry_mechanism_selective_open", "Selective open count"),
        ("asymmetry_mechanism_selective_view", "Selective log viewing time"),
        ("asymmetry_mechanism_selective_reference", "Selective reference"),
        ("asymmetry_mechanism_selective_activation", "Selective activation"),
        ("asymmetry_mechanism_selective_all", "Selective processing: all measures"),
    ]
    for contrast_name, label in specs:
        row = contrasts[contrasts["contrast"].eq(contrast_name)]
        if not row.empty:
            rows.append({
                "Mechanism predictor": label,
                "Interaction contrast": row["estimate"].iloc[0],
                "SE": row["se"].iloc[0],
                "p(one-sided, >0)": row["p_one_sided"].iloc[0],
            })
    return pd.DataFrame(rows)


def make_raw_change_robustness_table(coef: pd.DataFrame, contrasts: pd.DataFrame) -> pd.DataFrame:
    """Compact non-preregistered robustness results on the raw 0--100 scale."""
    rows = []

    def add_coef_row(quantity: str, model: str):
        b, se, _p2 = extract_coef(coef, model, ["advocate_plaintiff"])
        p1 = one_sided_p_from_t(b / se, ">") if pd.notna(b) and pd.notna(se) and se > 0 else np.nan
        rows.append({
            "Quantity": quantity,
            "Estimate (percentage points)": b,
            "SE": se,
            "p(one-sided, >0)": p1,
        })

    def add_contrast_row(quantity: str, contrast_name: str):
        row = contrasts[contrasts["contrast"].eq(contrast_name)]
        if not row.empty:
            rows.append({
                "Quantity": quantity,
                "Estimate (percentage points)": row["estimate"].iloc[0],
                "SE": row["se"].iloc[0],
                "p(one-sided, >0)": row["p_one_sided"].iloc[0],
            })

    add_coef_row("Claim-level total advocacy effect", "claim_update_raw_change")
    add_coef_row("Verdict-level total advocacy effect", "verdict_update_raw_change")
    add_contrast_row("Claim-level pooled asymmetry", "claim_asymmetry_raw_change_gamma_P_plus_gamma_D")
    add_contrast_row("Verdict-level pooled asymmetry", "verdict_asymmetry_raw_change_gamma_P_plus_gamma_D")
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------
# Main analysis
# ---------------------------------------------------------------------


def run_analysis(
    data_path: Path,
    stimuli_path: Optional[Path],
    outdir: Path,
    apply_final_cleaning: bool = True,
) -> None:
    outdir.mkdir(parents=True, exist_ok=True)

    loaded = load_raw_csv(data_path)
    if apply_final_cleaning:
        loaded, cleaning_audit = filter_final_legal_sample(loaded)
    else:
        cleaning_audit = {"final_cleaning_applied": False}
    raw = normalize_raw(loaded)
    claim_map, fact_map = load_stimuli(stimuli_path)

    claim = claim_update_table(raw, fact_map)
    verdict = verdict_table(raw, fact_map)
    proc = process_table(raw, fact_map)

    # Raw percentage-point changes used for the non-preregistered common-scale
    # robustness analysis reported in the Supplementary Information.
    claim["delta_pp"] = claim["Y_post"] - claim["Y_pre"]
    verdict["delta_pp"] = verdict["Y_post_verdict"] - verdict["Y_pre_verdict"]

    claim.to_csv(outdir / "claim_update_table.csv", index=False)
    verdict.to_csv(outdir / "verdict_update_table.csv", index=False)
    proc.to_csv(outdir / "process_fact_table.csv", index=False)

    tables = []
    contrasts = []

    # 4.1 Updating regressions
    claim_base = fit_ols("dlogit ~ advocate_plaintiff + P_shown + D_shown + C(claim_id)", claim, cluster="pid")
    tables.append(coef_table(claim_base, "claim_update_base"))

    verdict_base = fit_ols("dlogit ~ advocate_plaintiff + P_count + D_count + C(case_id)", verdict, cluster="pid")
    tables.append(coef_table(verdict_base, "verdict_update_base"))

    # Secondary ANCOVA specifications.
    # These use post-review logit judgments as the outcome while controlling for pre-review logit judgments.
    claim_ancova = fit_ols(
        "post_logit ~ pre_logit + advocate_plaintiff + P_shown + D_shown + C(claim_id)",
        claim,
        cluster="pid"
    )
    tables.append(coef_table(claim_ancova, "claim_update_ancova"))

    verdict_ancova = fit_ols(
        "post_logit ~ pre_logit + advocate_plaintiff + P_count + D_count + C(case_id)",
        verdict,
        cluster="pid"
    )
    tables.append(coef_table(verdict_ancova, "verdict_update_ancova"))

    # 4.2 Asymmetric updating
    claim_asym = fit_ols("dlogit ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)", claim, cluster="pid")
    tables.append(coef_table(claim_asym, "claim_asymmetry"))
    contrasts.append(contrast_sum(claim_asym, "adv_x_P", "adv_x_D", "claim_asymmetry_gamma_P_plus_gamma_D", direction=">"))

    verdict_asym = fit_ols("dlogit ~ advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id)", verdict, cluster="pid")
    tables.append(coef_table(verdict_asym, "verdict_asymmetry"))
    contrasts.append(contrast_sum(verdict_asym, "adv_x_P_count", "adv_x_D_count", "verdict_asymmetry_gamma_P_plus_gamma_D", direction=">"))

    # Non-preregistered scale-harmonization robustness checks. These repeat the
    # H1 and H2 specifications using raw post-minus-pre percentage-point changes,
    # matching the primary outcome scale used in Study 3.
    claim_base_raw = fit_ols("delta_pp ~ advocate_plaintiff + P_shown + D_shown + C(claim_id)", claim, cluster="pid")
    tables.append(coef_table(claim_base_raw, "claim_update_raw_change"))

    verdict_base_raw = fit_ols("delta_pp ~ advocate_plaintiff + P_count + D_count + C(case_id)", verdict, cluster="pid")
    tables.append(coef_table(verdict_base_raw, "verdict_update_raw_change"))

    claim_asym_raw = fit_ols("delta_pp ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)", claim, cluster="pid")
    tables.append(coef_table(claim_asym_raw, "claim_asymmetry_raw_change"))
    contrasts.append(contrast_sum(
        claim_asym_raw,
        "adv_x_P",
        "adv_x_D",
        "claim_asymmetry_raw_change_gamma_P_plus_gamma_D",
        direction=">",
    ))

    verdict_asym_raw = fit_ols("delta_pp ~ advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id)", verdict, cluster="pid")
    tables.append(coef_table(verdict_asym_raw, "verdict_asymmetry_raw_change"))
    contrasts.append(contrast_sum(
        verdict_asym_raw,
        "adv_x_P_count",
        "adv_x_D_count",
        "verdict_asymmetry_raw_change_gamma_P_plus_gamma_D",
        direction=">",
    ))

    # Secondary mixed-effects regressions.
    # No participant random intercept is included because advocacy is between-subject.
    # Random slopes are allowed only for within-participant evidence exposure variables.
    mixed_tables = []

    claim_base_mixed_slopes = fit_mixedlm(
        "dlogit ~ advocate_plaintiff + P_shown + D_shown + C(claim_id)",
        claim,
        group="pid",
        re_formula="0 + P_shown + D_shown",
    )
    if claim_base_mixed_slopes is not None:
        mixed_tables.append(coef_table_mixed(claim_base_mixed_slopes, "mixed_claim_update_random_evidence_slopes"))

    claim_asym_mixed_slopes = fit_mixedlm(
        "dlogit ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)",
        claim,
        group="pid",
        re_formula="0 + P_shown + D_shown",
    )
    if claim_asym_mixed_slopes is not None:
        mixed_tables.append(coef_table_mixed(claim_asym_mixed_slopes, "mixed_claim_asymmetry_random_evidence_slopes"))

    print("[MixedLM note] Claim-level mixed models include participant-level random slopes for P_shown and D_shown, but no participant random intercept.")
    print("[MixedLM note] Verdict-level mixed model omitted because each participant has one verdict row.")

    # 4.3 Process-as-outcome analyses.
    process_outcomes = {
        "open_count": "open_count",
        "log1p_total_view_ms": "log1p_total_view_ms",
        "reference": "reference",
        "activation": "activation",
    }
    for label, y in process_outcomes.items():
        d = proc.dropna(subset=[y, "advocate_plaintiff", "S_plaintiff", "N_claim", "N_case", "claim_id"]).copy()
        if d.empty:
            continue
        # Difference-in-differences form; interaction is the selective-processing estimand.
        formula = f"{y} ~ advocate_plaintiff * S_plaintiff + N_claim + N_case + C(claim_id)"
        m = fit_ols(formula, d, cluster="pid")
        tables.append(coef_table(m, f"process_outcome_{label}"))

    # 4.4 Attenuation analyses.
    proc_claim = aggregate_process_claim(proc)
    proc_case = aggregate_process_case(proc)
    claim_aug = claim.merge(proc_claim, on=["pid", "case_id", "claim_id"], how="left")
    verdict_aug = verdict.merge(proc_case, on=["pid", "case_id"], how="left")
    process_cols = [
        "P_open_count_total", "D_open_count_total",
        "P_log1p_total_view_ms_total", "D_log1p_total_view_ms_total",
        "P_reference_total", "D_reference_total",
        "P_activation_total", "D_activation_total",
    ]
    for d in [claim_aug, verdict_aug]:
        for col in process_cols:
            if col not in d.columns:
                d[col] = 0
            d[col] = d[col].fillna(0)

    # Mechanism test: do participants who selectively process congenial evidence
    # show greater updating toward their assigned side?
    #
    # These analyses are not a replacement for preregistered attenuation; they are
    # an additional, more direct process-outcome association test.
    # Positive outcome values mean movement toward the assigned advocacy side.
    direction = 2 * claim_aug["advocate_plaintiff"].astype(float) - 1
    claim_aug["toward_assigned_update"] = direction * claim_aug["dlogit"]

    mechanism_pairs = {
        "open": ("P_open_count_total", "D_open_count_total"),
        "view": ("P_log1p_total_view_ms_total", "D_log1p_total_view_ms_total"),
        "reference": ("P_reference_total", "D_reference_total"),
        "activation": ("P_activation_total", "D_activation_total"),
    }
    for label, (p_col, d_col) in mechanism_pairs.items():
        claim_aug[f"selective_{label}"] = direction * (claim_aug[p_col] - claim_aug[d_col])
        claim_aug[f"total_{label}"] = claim_aug[p_col] + claim_aug[d_col]

    # Standardized combined selective-processing index, constructed across claim rows.
    selective_components = [
        "selective_open",
        "selective_view",
        "selective_reference",
        "selective_activation",
    ]
    for col in selective_components:
        sd = claim_aug[col].std(skipna=True)
        if pd.notna(sd) and sd > 0:
            claim_aug[f"z_{col}"] = (claim_aug[col] - claim_aug[col].mean(skipna=True)) / sd
        else:
            claim_aug[f"z_{col}"] = 0.0
    claim_aug["selective_index"] = claim_aug[[f"z_{c}" for c in selective_components]].mean(axis=1)

    mechanism_specs = {
        "mechanism_selective_open": "toward_assigned_update ~ selective_open + total_open + P_shown + D_shown + C(claim_id)",
        "mechanism_selective_view": "toward_assigned_update ~ selective_view + total_view + P_shown + D_shown + C(claim_id)",
        "mechanism_selective_reference": "toward_assigned_update ~ selective_reference + total_reference + P_shown + D_shown + C(claim_id)",
        "mechanism_selective_activation": "toward_assigned_update ~ selective_activation + total_activation + P_shown + D_shown + C(claim_id)",
        "mechanism_selective_all": "toward_assigned_update ~ selective_index + total_open + total_view + total_reference + total_activation + P_shown + D_shown + C(claim_id)",
    }
    for model_name, formula in mechanism_specs.items():
        m = fit_ols(formula, claim_aug, cluster="pid")
        tables.append(coef_table(m, model_name))

    # Mechanism test 2: selective processing as a moderator of asymmetric updating.
    # This asks whether the corrected H2 evidence-asymmetry contrast is larger
    # among rows with more selective processing. For each selective-processing
    # measure, we test:
    #   (selective_process × Adv × P_shown) +
    #   (selective_process × Adv × D_shown) > 0.
    asymmetry_mechanism_specs = {
        "asymmetry_mechanism_selective_open": "selective_open",
        "asymmetry_mechanism_selective_view": "selective_view",
        "asymmetry_mechanism_selective_reference": "selective_reference",
        "asymmetry_mechanism_selective_activation": "selective_activation",
        "asymmetry_mechanism_selective_all": "selective_index",
    }

    for model_name, pred in asymmetry_mechanism_specs.items():
        p_int = f"{pred}_x_adv_x_P"
        d_int = f"{pred}_x_adv_x_D"
        claim_aug[p_int] = claim_aug[pred] * claim_aug["adv_x_P"]
        claim_aug[d_int] = claim_aug[pred] * claim_aug["adv_x_D"]

        # For the single-process models, include the matching total-process control.
        # For the combined index, include all total-process controls.
        if pred == "selective_index":
            total_terms = "total_open + total_view + total_reference + total_activation"
        else:
            total_terms = "total_" + pred.replace("selective_", "")

        formula = (
            f"dlogit ~ advocate_plaintiff + P_shown + D_shown + "
            f"adv_x_P + adv_x_D + {pred} + {p_int} + {d_int} + "
            f"{total_terms} + C(claim_id)"
        )
        m = fit_ols(formula, claim_aug, cluster="pid")
        tables.append(coef_table(m, model_name))
        contrasts.append(
            contrast_sum(
                m,
                p_int,
                d_int,
                model_name,
                direction=">",
            )
        )

    claim_aug.to_csv(outdir / "claim_update_with_process_mechanism_table.csv", index=False)

    proc_formula = " + ".join(process_cols)
    claim_aug_base = fit_ols(f"dlogit ~ advocate_plaintiff + P_shown + D_shown + C(claim_id) + {proc_formula}", claim_aug, cluster="pid")
    claim_aug_asym = fit_ols(f"dlogit ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id) + {proc_formula}", claim_aug, cluster="pid")
    verdict_aug_base = fit_ols(f"dlogit ~ advocate_plaintiff + P_count + D_count + C(case_id) + {proc_formula}", verdict_aug, cluster="pid")
    verdict_aug_asym = fit_ols(f"dlogit ~ advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id) + {proc_formula}", verdict_aug, cluster="pid")
    tables.extend([
        coef_table(claim_aug_base, "claim_update_aug_all_process"),
        coef_table(claim_aug_asym, "claim_asymmetry_aug_all_process"),
        coef_table(verdict_aug_base, "verdict_update_aug_all_process"),
        coef_table(verdict_aug_asym, "verdict_asymmetry_aug_all_process"),
    ])
    contrasts.append(contrast_sum(claim_aug_asym, "adv_x_P", "adv_x_D", "claim_asymmetry_aug_gamma_P_plus_gamma_D", direction=">"))
    contrasts.append(contrast_sum(verdict_aug_asym, "adv_x_P_count", "adv_x_D_count", "verdict_asymmetry_aug_gamma_P_plus_gamma_D", direction=">"))

    # Subset attenuation: attention only, reference only, activation only.
    subsets = {
        "attention_only": [
            "P_open_count_total", "D_open_count_total",
            "P_log1p_total_view_ms_total", "D_log1p_total_view_ms_total",
        ],
        "reference_only": [
            "P_reference_total", "D_reference_total",
        ],
        "activation_only": [
            "P_activation_total", "D_activation_total",
        ],
    }

    subset_models = {}
    for name, cols in subsets.items():
        f = " + ".join(cols)

        claim_aug_base_subset = fit_ols(
            f"dlogit ~ advocate_plaintiff + P_shown + D_shown + C(claim_id) + {f}",
            claim_aug,
            cluster="pid",
        )
        claim_aug_asym_subset = fit_ols(
            f"dlogit ~ advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id) + {f}",
            claim_aug,
            cluster="pid",
        )
        verdict_aug_base_subset = fit_ols(
            f"dlogit ~ advocate_plaintiff + P_count + D_count + C(case_id) + {f}",
            verdict_aug,
            cluster="pid",
        )
        verdict_aug_asym_subset = fit_ols(
            f"dlogit ~ advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id) + {f}",
            verdict_aug,
            cluster="pid",
        )

        subset_models[name] = {
            "claim_base": claim_aug_base_subset,
            "claim_asym": claim_aug_asym_subset,
            "verdict_base": verdict_aug_base_subset,
            "verdict_asym": verdict_aug_asym_subset,
        }

        tables.extend([
            coef_table(claim_aug_base_subset, f"claim_update_aug_{name}"),
            coef_table(claim_aug_asym_subset, f"claim_asymmetry_aug_{name}"),
            coef_table(verdict_aug_base_subset, f"verdict_update_aug_{name}"),
            coef_table(verdict_aug_asym_subset, f"verdict_asymmetry_aug_{name}"),
        ])
        contrasts.append(
            contrast_sum(
                claim_aug_asym_subset,
                "adv_x_P",
                "adv_x_D",
                f"claim_asymmetry_aug_{name}_gamma_P_plus_gamma_D",
                direction=">",
            )
        )
        contrasts.append(
            contrast_sum(
                verdict_aug_asym_subset,
                "adv_x_P_count",
                "adv_x_D_count",
                f"verdict_asymmetry_aug_{name}_gamma_P_plus_gamma_D",
                direction=">",
            )
        )

    coef = pd.concat(tables, ignore_index=True) if tables else pd.DataFrame()
    coef = add_one_sided_pvals(coef)
    coef.to_csv(outdir / "model_coefficients.csv", index=False)

    if mixed_tables:
        mixed_coef = pd.concat(mixed_tables, ignore_index=True)
        mixed_coef = add_one_sided_pvals(mixed_coef)
        mixed_coef.to_csv(outdir / "mixed_effects_coefficients.csv", index=False)

    con = pd.concat(contrasts, ignore_index=True) if contrasts else pd.DataFrame()
    con.to_csv(outdir / "model_contrasts.csv", index=False)

    # Compact attenuation summary for core coefficients.
    def get_coef(model, term):
        names = list(model.model.exog_names)
        return float(pd.Series(model.params, index=names).loc[term]) if term in names else np.nan

    def asym_contrast_value(model, verdict_level=False):
        suffix = "_count" if verdict_level else ""
        return get_coef(model, f"adv_x_P{suffix}") + get_coef(model, f"adv_x_D{suffix}")

    att_rows = []

    def add_att_row(quantity, model_label, base_value, aug_value):
        attenuation = base_value - aug_value
        pct = 100.0 * attenuation / base_value if abs(base_value) > 1e-12 else np.nan
        att_rows.append({
            "quantity": quantity,
            "model": model_label,
            "base": base_value,
            "augmented": aug_value,
            "attenuation": attenuation,
            "percent_attenuation": pct,
        })

    # All-process attenuation.
    add_att_row(
        "claim_advocacy_beta_MR",
        "all_process",
        get_coef(claim_base, "advocate_plaintiff"),
        get_coef(claim_aug_base, "advocate_plaintiff"),
    )
    add_att_row(
        "claim_asymmetry_gamma_P_plus_gamma_D",
        "all_process",
        asym_contrast_value(claim_asym),
        asym_contrast_value(claim_aug_asym),
    )
    add_att_row(
        "verdict_advocacy_beta_MR",
        "all_process",
        get_coef(verdict_base, "advocate_plaintiff"),
        get_coef(verdict_aug_base, "advocate_plaintiff"),
    )
    add_att_row(
        "verdict_asymmetry_gamma_P_plus_gamma_D",
        "all_process",
        asym_contrast_value(verdict_asym, verdict_level=True),
        asym_contrast_value(verdict_aug_asym, verdict_level=True),
    )

    # Subset-process attenuation.
    for name, mods in subset_models.items():
        add_att_row(
            "claim_advocacy_beta_MR",
            name,
            get_coef(claim_base, "advocate_plaintiff"),
            get_coef(mods["claim_base"], "advocate_plaintiff"),
        )
        add_att_row(
            "claim_asymmetry_gamma_P_plus_gamma_D",
            name,
            asym_contrast_value(claim_asym),
            asym_contrast_value(mods["claim_asym"]),
        )
        add_att_row(
            "verdict_advocacy_beta_MR",
            name,
            get_coef(verdict_base, "advocate_plaintiff"),
            get_coef(mods["verdict_base"], "advocate_plaintiff"),
        )
        add_att_row(
            "verdict_asymmetry_gamma_P_plus_gamma_D",
            name,
            asym_contrast_value(verdict_asym, verdict_level=True),
            asym_contrast_value(mods["verdict_asym"], verdict_level=True),
        )

    att = pd.DataFrame(att_rows)

    # Preregistered cross-model attenuation tests, implemented with the same
    # participant-clustered stacked-equation procedure used for Study 6.
    attenuation_test_rows = []
    process_sets = {"all_process": process_cols, **subsets}
    for model_label, cols in process_sets.items():
        proc_terms = " + ".join(cols)
        attenuation_test_rows.extend([
            stacked_attenuation_test(
                claim_aug,
                "dlogit",
                "advocate_plaintiff + P_shown + D_shown + C(claim_id)",
                f"advocate_plaintiff + P_shown + D_shown + C(claim_id) + {proc_terms}",
                {"advocate_plaintiff": 1.0},
                "claim_advocacy_beta_MR",
                model_label,
            ),
            stacked_attenuation_test(
                verdict_aug,
                "dlogit",
                "advocate_plaintiff + P_count + D_count + C(case_id)",
                f"advocate_plaintiff + P_count + D_count + C(case_id) + {proc_terms}",
                {"advocate_plaintiff": 1.0},
                "verdict_advocacy_beta_MR",
                model_label,
            ),
            stacked_attenuation_test(
                claim_aug,
                "dlogit",
                "advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)",
                f"advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id) + {proc_terms}",
                {"adv_x_P": 1.0, "adv_x_D": 1.0},
                "claim_asymmetry_gamma_P_plus_gamma_D",
                model_label,
            ),
            stacked_attenuation_test(
                verdict_aug,
                "dlogit",
                "advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id)",
                f"advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id) + {proc_terms}",
                {"adv_x_P_count": 1.0, "adv_x_D_count": 1.0},
                "verdict_asymmetry_gamma_P_plus_gamma_D",
                model_label,
            ),
        ])
    attenuation_tests = pd.DataFrame(attenuation_test_rows)
    attenuation_tests.to_csv(outdir / "attenuation_cross_model_tests.csv", index=False)
    att = att.merge(
        attenuation_tests[[
            "quantity", "model", "attenuation_se", "t",
            "p_one_sided", "p_two_sided", "nobs_stacked", "n_clusters",
        ]],
        on=["quantity", "model"],
        how="left",
    )
    att.to_csv(outdir / "attenuation_summary.csv", index=False)

    # Common-scale attenuation checks. These repeat the matched H1/H2
    # comparisons using raw post-minus-pre percentage-point changes, matching
    # the Study 3 outcome scale and the descriptive panels in Figure 5.
    raw_attenuation_rows = []
    for model_label, cols in process_sets.items():
        proc_terms = " + ".join(cols)
        raw_attenuation_rows.extend([
            stacked_attenuation_test(
                claim_aug,
                "delta_pp",
                "advocate_plaintiff + P_shown + D_shown + C(claim_id)",
                f"advocate_plaintiff + P_shown + D_shown + C(claim_id) + {proc_terms}",
                {"advocate_plaintiff": 1.0},
                "claim_advocacy_beta_MR",
                model_label,
            ),
            stacked_attenuation_test(
                verdict_aug,
                "delta_pp",
                "advocate_plaintiff + P_count + D_count + C(case_id)",
                f"advocate_plaintiff + P_count + D_count + C(case_id) + {proc_terms}",
                {"advocate_plaintiff": 1.0},
                "verdict_advocacy_beta_MR",
                model_label,
            ),
            stacked_attenuation_test(
                claim_aug,
                "delta_pp",
                "advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id)",
                f"advocate_plaintiff + P_shown + D_shown + adv_x_P + adv_x_D + C(claim_id) + {proc_terms}",
                {"adv_x_P": 1.0, "adv_x_D": 1.0},
                "claim_asymmetry_gamma_P_plus_gamma_D",
                model_label,
            ),
            stacked_attenuation_test(
                verdict_aug,
                "delta_pp",
                "advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id)",
                f"advocate_plaintiff + P_count + D_count + adv_x_P_count + adv_x_D_count + C(case_id) + {proc_terms}",
                {"adv_x_P_count": 1.0, "adv_x_D_count": 1.0},
                "verdict_asymmetry_gamma_P_plus_gamma_D",
                model_label,
            ),
        ])
    raw_attenuation = pd.DataFrame(raw_attenuation_rows)
    raw_attenuation["percent_attenuation"] = np.where(
        raw_attenuation["stacked_baseline"].abs() > 1e-12,
        100.0 * raw_attenuation["attenuation"] / raw_attenuation["stacked_baseline"],
        np.nan,
    )
    raw_attenuation.to_csv(outdir / "raw_change_attenuation_summary.csv", index=False)

    # Compact display tables: print to console and save as CSV/TXT so closing
    # the figure window cannot prevent access to the regression summaries.
    display_tables = [
        ("Table 1. Main updating results", make_main_results_table(coef, con), "table_1_main_updating_results"),
        ("Table 2. Process-as-outcome results", make_process_results_table(coef), "table_2_process_as_outcome_results"),
        ("Table 3. Attenuation summary", make_attenuation_display_table(att), "table_3_attenuation_summary"),
        ("Table 4. Selective-processing mechanism tests", make_mechanism_results_table(coef), "table_4_selective_processing_mechanism_tests"),
        ("Table 5. Selective-processing moderation of asymmetric updating", make_asymmetry_mechanism_results_table(con), "table_5_selective_processing_moderation_of_asymmetry"),
        ("Table 6. Raw percentage-point robustness analyses", make_raw_change_robustness_table(coef, con), "table_6_raw_change_robustness"),
        ("Table 7. Raw percentage-point attenuation analyses", make_attenuation_display_table(
            raw_attenuation.rename(columns={
                "stacked_baseline": "base",
                "stacked_augmented": "augmented",
            })
        ), "table_7_raw_change_attenuation"),
    ]
    for title, table, stem in display_tables:
        display_table(title, table)
        save_display_table(title, table, outdir, stem)

    # Save the figure to disk instead of showing an interactive window. This avoids
    # IDLE/Python Launcher freezes when the matplotlib window is closed.
    show_main_figure(claim, verdict, outdir=outdir)
    show_model_adjusted_figure(claim, verdict, outdir=outdir)
    show_attenuation_estimates_figure(
        claim_base=claim_base,
        claim_adjusted=claim_aug_base,
        claim_asymmetry_base=claim_asym,
        claim_asymmetry_adjusted=claim_aug_asym,
        verdict_base=verdict_base,
        verdict_adjusted=verdict_aug_base,
        outdir=outdir,
    )

    # Basic diagnostics.
    diag = {
        "n_raw_rows": len(raw),
        "n_participants_raw": raw["pid"].nunique(),
        "n_claim_update_rows": len(claim),
        "n_verdict_rows": len(verdict),
        "n_process_fact_rows": len(proc),
        "n_participants_claim": claim["pid"].nunique() if not claim.empty else 0,
        "n_participants_verdict": verdict["pid"].nunique() if not verdict.empty else 0,
        "n_participants_process": proc["pid"].nunique() if not proc.empty else 0,
        "cleaning": cleaning_audit,
    }
    (outdir / "diagnostics.json").write_text(json.dumps(diag, indent=2), encoding="utf-8")

    print("Analysis complete.")
    print(json.dumps(diag, indent=2))
    print(f"Outputs written to: {outdir}")


def main(argv: Optional[List[str]] = None) -> None:
    # By default, look for the CSV and stimuli JSON in the same folder as this script.
    # This makes Run -> Run Module work cleanly from IDLE.
    script_dir = Path(__file__).resolve().parent
    default_data = script_dir / "full_run_June8.csv"
    default_stimuli = script_dir / "cleaned_pruned_based_on_best_validation_facts.json"
    default_outdir = script_dir / "analysis_outputs"

    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=False, type=Path, default=default_data, help="Path to jsPsych/cognition.run CSV export")
    parser.add_argument("--stimuli", required=False, type=Path, default=default_stimuli, help="Path to cleaned stimuli JSON")
    parser.add_argument("--outdir", required=False, type=Path, default=default_outdir, help="Output directory")
    parser.add_argument(
        "--no-final-cleaning",
        action="store_true",
        help="Skip the manuscript's completion-first repeat and assistance-screen exclusions.",
    )
    args = parser.parse_args(argv)

    print(f"Using data file: {args.data}")
    print(f"Using stimuli file: {args.stimuli}")
    print(f"Writing outputs to: {args.outdir}")

    if not args.data.exists():
        raise FileNotFoundError(f"Could not find data file: {args.data}")
    if args.stimuli is not None and not args.stimuli.exists():
        raise FileNotFoundError(f"Could not find stimuli file: {args.stimuli}")

    run_analysis(
        args.data,
        args.stimuli,
        args.outdir,
        apply_final_cleaning=not args.no_final_cleaning,
    )


if __name__ == "__main__":
    main()
