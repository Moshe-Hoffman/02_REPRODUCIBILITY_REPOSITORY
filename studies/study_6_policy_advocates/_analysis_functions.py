#!/usr/bin/env python3
"""
Policy advocacy preregistration analysis runner.

Put this script in the same folder as:
  - the policy_advocacy_stimuli JSON, and
  - one or more advocate jsPsych CSV exports.

Then run:
  python policy_advocacy_preregistration_July17_updated.py

The script prints a readable report to the terminal. To save it:
  python policy_advocacy_preregistration_July17_updated.py > advocacy_prereg_results.txt
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import sys
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd
import patsy
import scipy.stats as st
import statsmodels.formula.api as smf

try:
    import matplotlib.pyplot as plt
except Exception:
    plt = None


SCRIPT_DIR = Path(__file__).resolve().parent
PROCESS_MEASURES = [
    "attention_open_count",
    "attention_time",
    "source_open_count",
    "source_time",
    "sharing_any",
    "sharing_count",
    "activation_any",
    "activation_count",
]
PROCESS_LABELS = {
    "attention_open_count": "attention open count",
    "attention_time": "attention time, log ms",
    "source_open_count": "source open count",
    "source_time": "source time, log ms",
    "sharing_any": "shared any",
    "sharing_count": "sharing count",
    "activation_any": "activation any",
    "activation_count": "activation count",
}
PROCESS_SUBSETS = {
    "all process measures": PROCESS_MEASURES,
    "attention only": ["attention_open_count", "attention_time"],
    "source consultation only": ["source_open_count", "source_time"],
    "sharing only": ["sharing_any", "sharing_count"],
    "activation only": ["activation_any", "activation_count"],
}

# -----------------------------------------------------------------------------
# Data-cleaning rules
# -----------------------------------------------------------------------------
# The pooled analysis treats the Prolific PID as the person-level identifier and
# retains only that person's earliest observed Cognition.run exposure. This
# prevents duplicate/re-entry runs and later cross-batch participation from
# contributing more than once. Overlapping CSV exports of the same run are
# collapsed automatically before the first-exposure rule is applied.
EXCLUDE_PREVIEW_EXPOSURES = True
APPLY_BROAD_LLM_EXCLUSIONS = True

# Broad LLM/paste-assistance screen agreed during pilot review. These exclusions
# are intentionally explicit rather than inferred from prose style. The first,
# fourth, and sixth PIDs contain prompt/meta-instruction leakage in the submitted
# argument; the remaining PIDs were flagged by the agreed broad timing/paste
# screen. Keep this list fixed for the preregistered analysis unless the
# preregistration is amended before looking at additional outcomes.
BROAD_LLM_EXCLUSION_SHA256 = {
    "cde17446cb1fe2dad19f0133ecec4999ad3b08a3f29e365eba160ed6db1dc1d0": "prompt/meta-instruction leakage in argument",
    "32b47e984f7e4d19bce8d6a2dab42442f47d831bb0c81ba0ea05cca7ed51239f": "extreme completion/composition timing; likely pasted/generated",
    "78b3759113f1fa27e29afc544dbefed3385dfb71b214013149ac91204bea5351": "broad-screen rapid polished composition/paste flag",
    "4498384838b3bf3bc12e7765e35e2884d8876b02e22ee3232c7b0b9f53458f19": "prompt/meta-instruction leakage in argument",
    "190c03b108c61652ca6384df2f6ac9336326f1b13c4c4607324bb683640b7487": "broad-screen rapid polished composition/paste flag",
    "6b7145df0f01159ccd59dfb066c3a925cf9faa1f7ee266dd6bf3a94faabcdb2a": "prompt/meta-instruction leakage in argument",
}


@dataclass
class TestSpec:
    label: str
    term: str | None = None
    direction: str = "positive"
    contrast: dict[str, float] | None = None


def print_header(title: str) -> None:
    print("\n" + "=" * 96)
    print(title)
    print("=" * 96)


def print_subhead(title: str) -> None:
    print("\n" + "-" * 96)
    print(title)
    print("-" * 96)


def parse_json_cell(x: object) -> object:
    if x is None:
        return None
    try:
        if pd.isna(x):
            return None
    except Exception:
        pass
    if isinstance(x, (list, dict)):
        return x
    s = str(x).strip()
    if not s:
        return None
    try:
        return json.loads(s)
    except Exception:
        return None


def as_number(x: object) -> float:
    if x is None:
        return np.nan
    try:
        if pd.isna(x):
            return np.nan
    except Exception:
        pass
    try:
        return float(x)
    except Exception:
        return np.nan


def finite_or_zero(x: object) -> float:
    v = as_number(x)
    return float(v) if np.isfinite(v) else 0.0


def first_nonblank_series(df: pd.DataFrame, columns: list[str]) -> pd.Series:
    out = pd.Series(np.nan, index=df.index, dtype=object)
    for col in columns:
        if col not in df:
            continue
        vals = df[col].astype(object)
        text = vals.fillna("").astype(str).str.strip()
        valid = text.ne("") & ~text.str.lower().isin({"nan", "none", "null"})
        take = out.isna() & valid
        out.loc[take] = text.loc[take]
    return out


def boolish(x: object) -> bool:
    if isinstance(x, bool):
        return x
    s = str(x or "").strip().lower()
    return s in {"1", "true", "yes", "y", "t"}


def side_to_adv(x: object) -> float:
    s = str(x or "").strip().lower()
    if s in {"support", "pro", "for", "favor", "in_favor"}:
        return 1.0
    if s in {"oppose", "con", "against", "anti"}:
        return 0.0
    return np.nan


def claim_valence_to_v(x: object) -> float:
    s = str(x or "").strip().lower()
    if s.startswith("pro") or "support" in s:
        return 1.0
    if s.startswith("con") or "oppose" in s or "against" in s:
        return -1.0
    return np.nan


def higher_supports_policy_to_s(x: object) -> float:
    if isinstance(x, bool):
        return 1.0 if x else -1.0
    s = str(x).strip().lower()
    if s in {"true", "1", "yes", "y"}:
        return 1.0
    if s in {"false", "0", "no", "n"}:
        return -1.0
    return np.nan


def direction_from_policy_relation(x: object) -> str | None:
    s = str(x or "").strip().lower()
    if "support" in s or s == "pro":
        return "pro"
    if "oppose" in s or "against" in s or s == "con":
        return "con"
    return None


def clean_term(x: object) -> str:
    out = str(x)
    for a in [" ", "-", ":", "/", "(", ")", "[", "]", ".", ","]:
        out = out.replace(a, "_")
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


def find_input_files(folder: Path) -> tuple[Path, list[Path]]:
    stimuli = []
    advocate_csvs = []
    for path in sorted(folder.glob("*.json")):
        try:
            obj = json.loads(path.read_text())
        except Exception:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("policies"), list):
            stimuli.append(path)
    for path in sorted(folder.glob("*.csv")):
        try:
            cols = set(pd.read_csv(path, nrows=0).columns)
        except Exception:
            continue
        if "page_type" in cols and ("advocate_position" in cols or "dossier_fact_process" in cols):
            advocate_csvs.append(path)
    if not stimuli:
        raise FileNotFoundError("No stimulus JSON found. Expected a JSON with a top-level 'policies' list.")
    if len(stimuli) > 1:
        print("Multiple stimulus JSON files found; using the first one alphabetically:")
        for path in stimuli:
            print(f"  - {path.name}")
    if not advocate_csvs:
        raise FileNotFoundError("No advocate jsPsych CSV found. Expected CSV files with page_type and advocate data columns.")
    return stimuli[0], advocate_csvs


def load_stimuli(path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    obj = json.loads(path.read_text())
    policy_rows, claim_rows, fact_rows, quant_rows = [], [], [], []
    for policy in obj.get("policies", []) or []:
        pid = policy.get("policy_id")
        policy_rows.append({"policy_id": pid, "policy_name": policy.get("policy_name", pid)})
        for claim in policy.get("claims", []) or []:
            cid = claim.get("claim_id")
            v = claim_valence_to_v(claim.get("claim_valence_for_policy"))
            claim_rows.append(
                {
                    "policy_id": pid,
                    "claim_id": cid,
                    "policy_claim": f"{pid}:{cid}",
                    "claim_text": claim.get("claim_text", ""),
                    "claim_v": v,
                }
            )
            for fact in claim.get("facts", []) or []:
                direction = direction_from_policy_relation(fact.get("fact_relation_to_policy"))
                if direction is None:
                    supports_claim = "support" in str(fact.get("side_relative_to_claim", "")).lower()
                    direction = "pro" if (supports_claim and v == 1) or ((not supports_claim) and v == -1) else "con"
                fact_rows.append(
                    {
                        "policy_id": pid,
                        "claim_id": cid,
                        "policy_claim": f"{pid}:{cid}",
                        "fact_id": fact.get("fact_id"),
                        "policy_direction": direction,
                    }
                )
            for q in claim.get("quantitative_questions", []) or []:
                qid = q.get("question_id")
                quant_rows.append(
                    {
                        "policy_id": pid,
                        "claim_id": cid,
                        "policy_claim": f"{pid}:{cid}",
                        "question_id": qid,
                        "policy_question": f"{pid}:{qid}",
                        "quant_s": higher_supports_policy_to_s(q.get("higher_value_supports_policy")),
                    }
                )
    return pd.DataFrame(policy_rows), pd.DataFrame(claim_rows), pd.DataFrame(fact_rows), pd.DataFrame(quant_rows)


def load_advocate_csvs(paths: list[Path]) -> pd.DataFrame:
    frames = []
    for file_order, path in enumerate(paths):
        df = pd.read_csv(path)
        df["source_csv"] = path.name
        df["_file_order"] = file_order
        df["_row_in_file"] = np.arange(len(df))
        frames.append(df)
    raw = pd.concat(frames, ignore_index=True, sort=False)

    # Public-release inputs have already applied the documented completion,
    # repeat-exposure, preview, and assistance-screen rules.  They contain only
    # a study-specific anonymous participant_id, not platform identifiers.
    if "participant_id" in raw.columns and not any(
        col in raw.columns for col in ["PROLIFIC_PID", "prolific_pid", "SESSION_ID", "session_id_param"]
    ):
        raw["participant_id"] = raw["participant_id"].astype(str).str.strip()
        raw["person_id"] = raw["participant_id"]
        raw["exposure_id"] = raw["participant_id"]
        raw["policy_id_any"] = raw.get("policy_id", pd.Series(index=raw.index, dtype=object)).fillna(
            raw.get("selected_policy_id", pd.Series(index=raw.index, dtype=object))
        )
        raw["Adv"] = raw["advocate_position"].map(side_to_adv)
        raw.attrs["cleaning_audit"] = {
            "csv_files": [p.name for p in paths],
            "input_type": "precleaned_public_release",
            "final_participants": int(raw["participant_id"].nunique()),
        }
        return raw

    for col in [
        "SESSION_ID", "session_id_param", "PROLIFIC_PID", "prolific_pid",
        "STUDY_ID", "study_id_param", "policy_id", "selected_policy_id",
        "advocate_position", "run_id", "recorded_at", "trial_index",
        "time_elapsed", "preview_mode", "page_type", "phase", "dossier_pass",
    ]:
        if col not in raw:
            raw[col] = np.nan

    raw["prolific_id"] = first_nonblank_series(raw, ["PROLIFIC_PID", "prolific_pid"])
    raw["session_id"] = first_nonblank_series(raw, ["SESSION_ID", "session_id_param"])
    raw["study_param"] = first_nonblank_series(raw, ["STUDY_ID", "study_id_param", "study_id"])

    def normalize_run_id(x: object) -> str:
        v = as_number(x)
        if np.isfinite(v):
            return str(int(v)) if float(v).is_integer() else str(v)
        s = str(x or "").strip()
        return s if s and s.lower() not in {"nan", "none", "null"} else ""

    raw["run_key"] = raw["run_id"].map(normalize_run_id)
    raw["recorded_at_dt"] = pd.to_datetime(raw["recorded_at"], errors="coerce", utc=True)

    # A few opening rows were recorded before URL identifiers populated. Recover
    # their identifiers from later rows in the same source-file/run so they do
    # not appear as separate anonymous exposures in the audit count.
    def first_valid(values: pd.Series):
        text = values.dropna().astype(str).str.strip()
        text = text.loc[~text.str.lower().isin({"", "nan", "none", "null"})]
        return text.iloc[0] if not text.empty else np.nan

    run_groups = raw.groupby(["source_csv", "run_key"], dropna=False)
    for column in ["prolific_id", "session_id", "study_param"]:
        recovered = run_groups[column].transform(first_valid)
        current = raw[column].fillna("").astype(str).str.strip()
        missing = current.eq("") | current.str.lower().isin({"nan", "none", "null"})
        raw.loc[missing, column] = recovered.loc[missing]

    # Cognition.run can issue a new run_id even when the same Prolific SESSION_ID
    # is reused after re-entry. Therefore exposure_id includes both session and
    # run whenever both are available.
    exposure_ids = []
    person_ids = []
    for idx, row in raw.iterrows():
        pid = row.get("prolific_id")
        sid = row.get("session_id")
        run = row.get("run_key", "")
        study = row.get("study_param")
        pid_ok = pd.notna(pid) and str(pid).strip() != ""
        sid_ok = pd.notna(sid) and str(sid).strip() != ""
        study_txt = str(study).strip() if pd.notna(study) else ""
        if sid_ok:
            exposure = f"session:{sid}" + (f"::run:{run}" if run else "")
        elif pid_ok and run:
            exposure = f"pid:{pid}::study:{study_txt}::run:{run}"
        elif pid_ok:
            exposure = f"pid:{pid}::study:{study_txt}::source:{row['source_csv']}"
        else:
            exposure = f"anon:{row['source_csv']}::run:{run or row['_row_in_file']}"
        person = str(pid) if pid_ok else (f"session:{sid}" if sid_ok else exposure)
        exposure_ids.append(exposure)
        person_ids.append(person)
    raw["exposure_id"] = exposure_ids
    raw["person_id"] = person_ids

    # Remove duplicated copies of the same jsPsych trial caused by loading an
    # earlier export together with a later/expanded export of the same run.
    raw = raw.sort_values(["_file_order", "_row_in_file"]).copy()
    dedup_subset = ["exposure_id", "trial_index", "page_type", "phase", "dossier_pass", "time_elapsed"]
    rows_before_export_dedup = len(raw)
    raw = raw.drop_duplicates(subset=dedup_subset, keep="last").copy()
    duplicate_export_rows_removed = rows_before_export_dedup - len(raw)

    # Exposure-level metadata. The finalized manuscript applies completion first,
    # then retains each person's earliest eligible completed exposure. This order
    # matters for one participant whose first exposure was incomplete.
    exposure_meta = raw.groupby("exposure_id", dropna=False).agg(
        person_id=("person_id", "first"),
        prolific_id=("prolific_id", "first"),
        session_id=("session_id", "first"),
        exposure_start=("recorded_at_dt", "min"),
        first_file_order=("_file_order", "min"),
        first_row=("_row_in_file", "min"),
        preview=("preview_mode", lambda x: any(boolish(v) for v in x)),
        completed=("page_type", lambda x: "post_quant_beliefs" in set(x.dropna().astype(str))),
    ).reset_index()

    def nonblank(series: pd.Series) -> pd.Series:
        text = series.fillna("").astype(str).str.strip()
        return text.ne("") & ~text.str.lower().isin({"nan", "none", "null"})

    identified = nonblank(exposure_meta["prolific_id"]) | nonblank(exposure_meta["session_id"])
    unidentified_exposures_removed = int((~identified).sum())
    identified_meta = exposure_meta.loc[identified].copy()

    preview_exposures_removed: set[str] = set()
    eligible = identified_meta.loc[identified_meta["completed"]].copy()
    if EXCLUDE_PREVIEW_EXPOSURES:
        preview_exposures_removed = set(
            eligible.loc[eligible["preview"], "exposure_id"].astype(str)
        )
        eligible = eligible.loc[~eligible["preview"]].copy()

    eligible["start_missing"] = eligible["exposure_start"].isna()
    eligible = eligible.sort_values(
        ["person_id", "start_missing", "exposure_start", "first_file_order", "first_row", "exposure_id"],
        na_position="last",
    )
    eligible["exposure_rank"] = eligible.groupby("person_id").cumcount() + 1

    repeated_people = eligible.groupby("person_id").size()
    repeated_people = repeated_people[repeated_people > 1]
    later_exposures = set(eligible.loc[eligible["exposure_rank"] > 1, "exposure_id"].astype(str))
    first_exposures = set(eligible.loc[eligible["exposure_rank"] == 1, "exposure_id"].astype(str))
    raw = raw.loc[raw["exposure_id"].astype(str).isin(first_exposures)].copy()

    llm_hashes_present: list[str] = []
    if APPLY_BROAD_LLM_EXCLUSIONS:
        raw["_prolific_hash"] = raw["prolific_id"].fillna("").astype(str).map(
            lambda value: hashlib.sha256(value.encode("utf-8")).hexdigest()
            if value else ""
        )
        llm_hashes_present = sorted(
            set(raw["_prolific_hash"]) & set(BROAD_LLM_EXCLUSION_SHA256)
        )
        if llm_hashes_present:
            raw = raw.loc[
                ~raw["_prolific_hash"].isin(BROAD_LLM_EXCLUSION_SHA256)
            ].copy()
        raw = raw.drop(columns=["_prolific_hash"], errors="ignore")

    # participant_id is now person-level and therefore stable across source CSVs.
    raw["participant_id"] = raw["person_id"].astype(str)
    raw["policy_id_any"] = raw["policy_id"].fillna(raw["selected_policy_id"])
    raw["Adv"] = raw["advocate_position"].map(side_to_adv)

    raw.attrs["cleaning_audit"] = {
        "csv_files": [p.name for p in paths],
        "rows_before_export_dedup": rows_before_export_dedup,
        "duplicate_export_rows_removed": duplicate_export_rows_removed,
        "unique_exposures_before_first_exposure_rule": int(identified_meta.shape[0]),
        "unidentified_test_or_partial_exposures_removed": unidentified_exposures_removed,
        "eligible_completed_exposures": int(eligible.shape[0]),
        "people_with_multiple_exposures": int(repeated_people.shape[0]),
        "later_exposures_removed": int(len(later_exposures)),
        "preview_exposures_removed": int(len(preview_exposures_removed)),
        "broad_llm_exclusions_removed": int(len(llm_hashes_present)),
    }
    return raw


def participant_table(raw: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for pid, g in raw.groupby("participant_id", dropna=False):
        pages = set(g["page_type"].dropna().astype(str))
        first = g.iloc[0]
        rows.append(
            {
                "participant_id": pid,
                "source_csv": first.get("source_csv"),
                "policy_id": g["policy_id_any"].dropna().iloc[0] if g["policy_id_any"].notna().any() else np.nan,
                "advocate_position": g["advocate_position"].dropna().iloc[0] if g["advocate_position"].notna().any() else np.nan,
                "Adv": g["Adv"].dropna().iloc[0] if g["Adv"].notna().any() else np.nan,
                "completed_primary": "post_quant_beliefs" in pages,
            }
        )
    return pd.DataFrame(rows)


def completed_participants(raw: pd.DataFrame) -> pd.DataFrame:
    return participant_table(raw).loc[lambda d: d["completed_primary"], ["participant_id"]].drop_duplicates()


def explode_response_rows(raw: pd.DataFrame, page_types: Iterable[str]) -> pd.DataFrame:
    out = []
    for _, row in raw.loc[raw["page_type"].isin(page_types)].iterrows():
        parsed = parse_json_cell(row.get("responses"))
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            rec = dict(item)
            rec["participant_id"] = row["participant_id"]
            rec["source_csv"] = row["source_csv"]
            rec["policy_id"] = rec.get("policy_id") or row.get("policy_id_any")
            out.append(rec)
    return pd.DataFrame(out)


def standardize_change(df: pd.DataFrame, raw_col: str, unit_cols: list[str], out_col: str) -> pd.DataFrame:
    out = df.copy()

    def z(x: pd.Series) -> pd.Series:
        sd = x.std(ddof=1)
        if x.notna().sum() < 2 or not np.isfinite(sd) or sd <= 0:
            return pd.Series(np.nan, index=x.index)
        return (x - x.mean()) / sd

    out[out_col] = out.groupby(unit_cols, dropna=False)[raw_col].transform(z)
    return out


def build_outcomes(raw: pd.DataFrame, claims: pd.DataFrame, quants: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    keep = completed_participants(raw)

    claim_rows = explode_response_rows(raw, ["pre_claim_warranted", "post_claim_warranted"])
    if not claim_rows.empty:
        claim_rows["response"] = claim_rows["response"].map(as_number)
        claim_rows = claim_rows.merge(claims[["policy_id", "claim_id", "claim_v", "policy_claim"]], on=["policy_id", "claim_id"], how="left")
        claim_rows["oriented"] = claim_rows["response"] * claim_rows["claim_v"]
        claim = claim_rows.pivot_table(
            index=["participant_id", "policy_id", "claim_id", "policy_claim"],
            columns="phase",
            values="oriented",
            aggfunc="first",
        ).reset_index()
        claim["delta_w_raw"] = claim.get("post") - claim.get("pre")
        claim = claim.merge(keep, on="participant_id", how="inner")
        claim = standardize_change(claim, "delta_w_raw", ["policy_id", "claim_id"], "delta_w")
    else:
        claim = pd.DataFrame()

    quant_rows = explode_response_rows(raw, ["pre_quant_beliefs", "post_quant_beliefs"])
    if not quant_rows.empty:
        quant_rows["response"] = quant_rows["response"].map(as_number)
        quant_rows = quant_rows.merge(
            quants[["policy_id", "claim_id", "question_id", "quant_s", "policy_claim", "policy_question"]],
            on=["policy_id", "claim_id", "question_id"],
            how="left",
        )
        quant_rows["oriented"] = quant_rows["response"] * quant_rows["quant_s"]
        qwide = quant_rows.pivot_table(
            index=["participant_id", "policy_id", "claim_id", "question_id", "policy_claim", "policy_question"],
            columns="phase",
            values="oriented",
            aggfunc="first",
        ).reset_index()
        qwide["delta_b_raw"] = qwide.get("post") - qwide.get("pre")
        qwide = qwide.merge(keep, on="participant_id", how="inner")
        qwide = standardize_change(qwide, "delta_b_raw", ["policy_id", "question_id"], "delta_b_question")
        quant = qwide.groupby(["participant_id", "policy_id", "claim_id", "policy_claim"], dropna=False)["delta_b_question"].mean().reset_index(name="delta_b")
    else:
        quant = pd.DataFrame()

    support_rows = raw.loc[raw["page_type"].isin(["pre_policy_support", "post_policy_support"])].copy()
    if not support_rows.empty:
        support_rows["phase"] = support_rows["page_type"].str.replace("_policy_support", "", regex=False)
        support_rows["support"] = support_rows["own_policy_support"].map(as_number)
        support = support_rows.pivot_table(
            index=["participant_id", "policy_id_any"],
            columns="phase",
            values="support",
            aggfunc="first",
        ).reset_index().rename(columns={"policy_id_any": "policy_id"})
        support["delta_support_raw"] = support.get("post") - support.get("pre")
        support = support.merge(keep, on="participant_id", how="inner")
        support = standardize_change(support, "delta_support_raw", ["policy_id"], "delta_support")
    else:
        support = pd.DataFrame()
    return claim, quant, support


def collect_first_json(raw: pd.DataFrame, participant_id: str, col: str) -> object:
    vals = raw.loc[raw["participant_id"].eq(participant_id), col].dropna() if col in raw else pd.Series(dtype=object)
    for val in vals:
        parsed = parse_json_cell(val)
        if parsed not in (None, [], {}):
            return parsed
    return None


def collect_last_json(raw: pd.DataFrame, participant_id: str, col: str, page_type: str | None = None) -> object:
    d = raw.loc[raw["participant_id"].eq(participant_id)].copy()
    if page_type is not None and "page_type" in d:
        d = d.loc[d["page_type"].eq(page_type)].copy()
    if col not in d or d.empty:
        return None
    sort_cols = [c for c in ["dossier_pass", "trial_index", "time_elapsed"] if c in d]
    if sort_cols:
        d = d.sort_values(sort_cols, na_position="last")
    for val in reversed(d[col].tolist()):
        parsed = parse_json_cell(val)
        if parsed is not None:
            return parsed
    return None


def build_predictors(raw: pd.DataFrame, participants: pd.DataFrame, claims: pd.DataFrame, facts: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    fact_lookup = facts.set_index("fact_id").to_dict("index") if not facts.empty else {}
    claim_base = claims[["policy_id", "claim_id", "policy_claim", "claim_v"]].copy()
    claim_rows, bundle_rows = [], []

    for _, p in participants.iterrows():
        pid = p["participant_id"]
        policy_id = p["policy_id"]
        adv = p["Adv"]
        person_raw = raw.loc[raw["participant_id"].eq(pid)].copy()

        # Facts shown are fixed within a run. Union all recorded copies so that an
        # empty/missing value on one page cannot erase the randomized exposure.
        shown_ids: set[str] = set()
        if "facts_shown_ids" in person_raw:
            for val in person_raw["facts_shown_ids"].dropna():
                parsed = parse_json_cell(val)
                if isinstance(parsed, list):
                    shown_ids.update(str(x) for x in parsed)

        # The JS resets open/source counters on each dossier visit but persists
        # the draft, attached facts, and inserted-reference state. Therefore we
        # sum raw opening/source activity across every dossier pass, then apply
        # log(1 + total time) once per fact; sharing comes from the FINAL dossier.
        dossier_visits = person_raw.loc[person_raw["page_type"].eq("dossier")].copy() if "page_type" in person_raw else pd.DataFrame()
        if not dossier_visits.empty:
            sort_cols = [c for c in ["dossier_pass", "trial_index", "time_elapsed"] if c in dossier_visits]
            dossier_visits = dossier_visits.sort_values(sort_cols, na_position="last") if sort_cols else dossier_visits

        fact_totals: dict[str, dict[str, float]] = {}
        final_process_rows: list[dict] = []
        for visit_idx, (_, visit) in enumerate(dossier_visits.iterrows()):
            parsed = parse_json_cell(visit.get("dossier_fact_process"))
            if not isinstance(parsed, list):
                parsed = []
            if visit_idx == len(dossier_visits) - 1:
                final_process_rows = [r for r in parsed if isinstance(r, dict)]
            for rec in parsed:
                if not isinstance(rec, dict) or not rec.get("fact_id"):
                    continue
                fid = str(rec["fact_id"])
                shown_ids.add(fid)
                acc = fact_totals.setdefault(
                    fid,
                    {
                        "open_count": 0.0, "total_open_ms": 0.0,
                        "source_open_count": 0.0, "source_total_open_ms": 0.0,
                    },
                )
                acc["open_count"] += finite_or_zero(rec.get("open_count"))
                acc["total_open_ms"] += max(0.0, finite_or_zero(rec.get("total_open_ms")))
                acc["source_open_count"] += finite_or_zero(rec.get("source_open_count"))
                acc["source_total_open_ms"] += max(0.0, finite_or_zero(rec.get("source_total_open_ms")))

        final_share: dict[str, float] = {}
        for rec in final_process_rows:
            fid = str(rec.get("fact_id", ""))
            if not fid:
                continue
            shared = max(
                finite_or_zero(rec.get("used")),
                finite_or_zero(rec.get("attached")),
                finite_or_zero(rec.get("inserted")),
            )
            final_share[fid] = float(shared > 0)

        act = collect_last_json(raw, pid, "activated_fact_ids", page_type="activation_check")
        activation_set = set(str(x) for x in act) if isinstance(act, list) else set()

        policy_claims = claim_base.loc[claim_base["policy_id"].eq(policy_id)]
        for _, cl in policy_claims.iterrows():
            cid = cl["claim_id"]
            claim_congenial = int((adv == 1 and cl["claim_v"] == 1) or (adv == 0 and cl["claim_v"] == -1)) if np.isfinite(adv) and np.isfinite(cl["claim_v"]) else np.nan
            shown_by_dir = {"pro": 0, "con": 0}
            for fid in shown_ids:
                meta = fact_lookup.get(fid, {})
                if meta.get("claim_id") == cid and meta.get("policy_direction") in shown_by_dir:
                    shown_by_dir[meta["policy_direction"]] = 1

            row = {
                "participant_id": pid,
                "policy_id": policy_id,
                "claim_id": cid,
                "policy_claim": cl["policy_claim"],
                "Adv": adv,
                "Pro_shown": shown_by_dir["pro"],
                "Con_shown": shown_by_dir["con"],
                "ClaimCongenial": claim_congenial,
            }
            row["Pro_CC"] = row["Pro_shown"] * row["ClaimCongenial"]
            row["Con_CC"] = row["Con_shown"] * row["ClaimCongenial"]

            # Preregistered H3 parameterization: BOTH interactions are Adv ×
            # evidence-direction. gamma_Con > 0 means anti-policy evidence has a
            # less negative effect among pro advocates than among anti advocates.
            row["Adv_Pro"] = row["Adv"] * row["Pro_shown"]
            row["Adv_Con"] = row["Adv"] * row["Con_shown"]
            row["Adv_Pro_CC"] = row["Adv"] * row["Pro_shown"] * row["ClaimCongenial"]
            row["Adv_Con_CC"] = row["Adv"] * row["Con_shown"] * row["ClaimCongenial"]

            for direction, prefix in [("pro", "ProProc"), ("con", "ConProc")]:
                vals = {m: 0.0 for m in PROCESS_MEASURES}
                for fid in shown_ids:
                    meta = fact_lookup.get(fid, {})
                    if meta.get("claim_id") != cid or meta.get("policy_direction") != direction:
                        continue
                    acc = fact_totals.get(fid, {})
                    vals["attention_open_count"] += finite_or_zero(acc.get("open_count"))
                    vals["attention_time"] += math.log1p(max(0.0, finite_or_zero(acc.get("total_open_ms"))))
                    vals["source_open_count"] += finite_or_zero(acc.get("source_open_count"))
                    vals["source_time"] += math.log1p(max(0.0, finite_or_zero(acc.get("source_total_open_ms"))))
                    shared = final_share.get(fid, 0.0)
                    activated = float(fid in activation_set)
                    vals["sharing_any"] = max(vals["sharing_any"], shared)
                    vals["sharing_count"] += shared
                    vals["activation_any"] = max(vals["activation_any"], activated)
                    vals["activation_count"] += activated

                for m in PROCESS_MEASURES:
                    row[f"{prefix}_{m}"] = vals[m]
                bundle_rows.append(
                    {
                        "participant_id": pid,
                        "policy_id": policy_id,
                        "claim_id": cid,
                        "policy_claim": cl["policy_claim"],
                        "policy_direction": direction,
                        "Adv": adv,
                        "shown": shown_by_dir[direction],
                        "EvidenceCongenial": int((direction == "pro" and adv == 1) or (direction == "con" and adv == 0)) if np.isfinite(adv) else np.nan,
                        "N_bundles": shown_by_dir["pro"] + shown_by_dir["con"],
                        **vals,
                    }
                )

            for m in PROCESS_MEASURES:
                row[f"ClaimProc_{m}"] = row[f"ProProc_{m}"] + row[f"ConProc_{m}"]
            row["N_bundles"] = row["Pro_shown"] + row["Con_shown"]
            claim_rows.append(row)

    claim_pred = pd.DataFrame(claim_rows)
    bundle_pred = pd.DataFrame(bundle_rows)

    agg = {"Pro_shown": "sum", "Con_shown": "sum", "Adv": "first"}
    for prefix in ["ProProc", "ConProc", "ClaimProc"]:
        for m in PROCESS_MEASURES:
            agg[f"{prefix}_{m}"] = "sum"
    policy_pred = claim_pred.groupby(["participant_id", "policy_id"], dropna=False).agg(agg).reset_index()
    policy_pred = policy_pred.rename(columns={"Pro_shown": "Pro_count", "Con_shown": "Con_count"})
    policy_pred["Adv_Pro_count"] = policy_pred["Adv"] * policy_pred["Pro_count"]
    policy_pred["Adv_Con_count"] = policy_pred["Adv"] * policy_pred["Con_count"]
    congenial = claim_pred.groupby(["participant_id", "policy_id"], dropna=False).apply(
        lambda d: pd.Series(
            {
                "Pro_cong": (d["Pro_shown"] * d["ClaimCongenial"]).sum(),
                "Con_cong": (d["Con_shown"] * d["ClaimCongenial"]).sum(),
            }
        ),
        include_groups=False,
    ).reset_index()
    policy_pred = policy_pred.merge(congenial, on=["participant_id", "policy_id"], how="left")
    return claim_pred, policy_pred, bundle_pred


def fit_model(df: pd.DataFrame, formula: str, cluster_col: str = "participant_id"):
    needed = set()
    try:
        y, x = patsy.dmatrices(formula, df, return_type="dataframe")
        needed = set(y.columns).union(x.columns)
    except Exception:
        pass
    model_df = df.copy()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = smf.ols(formula, data=model_df).fit()
    if cluster_col in model_df and model_df[cluster_col].nunique(dropna=True) > 1:
        try:
            fit = fit.get_robustcov_results(cov_type="cluster", groups=model_df.loc[fit.model.data.row_labels, cluster_col])
        except Exception:
            pass
    return fit


def coef_table(fit, terms: list[str] | None = None) -> pd.DataFrame:
    params = pd.Series(fit.params, index=fit.model.exog_names)
    bse = pd.Series(fit.bse, index=fit.model.exog_names)
    pvals = pd.Series(fit.pvalues, index=fit.model.exog_names)
    out = pd.DataFrame({"term": params.index, "estimate": params.values, "se": bse.values, "p_two_sided": pvals.values})
    if terms is not None:
        out = out.loc[out["term"].isin(terms)]
    return out


def contrast_stat(fit, weights: dict[str, float]) -> tuple[float, float, float, float]:
    names = list(fit.model.exog_names)
    beta = np.asarray(fit.params)
    cov = np.asarray(fit.cov_params())
    w = np.zeros(len(names))
    for term, weight in weights.items():
        if term in names:
            w[names.index(term)] = weight
    est = float(w @ beta)
    se = float(np.sqrt(max(0.0, w @ cov @ w)))
    tval = est / se if se > 0 else np.nan
    p_two = 2 * (1 - st.t.cdf(abs(tval), fit.df_resid)) if np.isfinite(tval) else np.nan
    return est, se, tval, p_two


def one_sided_p(est: float, p_two: float, direction: str) -> float:
    if not np.isfinite(est) or not np.isfinite(p_two):
        return np.nan
    if direction == "positive":
        return p_two / 2 if est >= 0 else 1 - p_two / 2
    if direction == "negative":
        return p_two / 2 if est <= 0 else 1 - p_two / 2
    return p_two


def report_model(title: str, df: pd.DataFrame, formula: str, tests: list[TestSpec], cluster_col: str = "participant_id") -> object | None:
    print_subhead(title)
    if df.empty:
        print("Skipped: no analyzable rows.")
        return None
    try:
        fit = fit_model(df, formula, cluster_col)
    except Exception as exc:
        print(f"Skipped: model could not be estimated ({exc}).")
        return None
    print(f"N rows = {int(fit.nobs)}; clusters = {df.loc[fit.model.data.row_labels, cluster_col].nunique(dropna=True) if cluster_col in df else 'n/a'}")
    rows = []
    for spec in tests:
        if spec.contrast:
            est, se, _, p_two = contrast_stat(fit, spec.contrast)
        elif spec.term in fit.model.exog_names:
            est, se, _, p_two = contrast_stat(fit, {spec.term: 1.0})
        else:
            rows.append({"test": spec.label, "estimate": np.nan, "se": np.nan, "p_one_sided": np.nan, "note": "term absent"})
            continue
        rows.append(
            {
                "test": spec.label,
                "estimate": est,
                "se": se,
                "p_one_sided": one_sided_p(est, p_two, spec.direction),
                "p_two_sided": p_two,
            }
        )
    print(pd.DataFrame(rows).to_string(index=False, float_format=lambda x: f"{x: .4f}"))
    return fit


def print_summary(raw: pd.DataFrame, participants: pd.DataFrame, claim: pd.DataFrame, quant: pd.DataFrame, support: pd.DataFrame, claim_pred: pd.DataFrame) -> None:
    print_header("Inputs and Constructed Variables")
    print(f"Script folder: {SCRIPT_DIR}")
    audit = raw.attrs.get("cleaning_audit", {})
    csv_names = audit.get("csv_files", sorted(raw["source_csv"].unique()))
    print(f"CSV files read: {', '.join(csv_names)}")
    if audit:
        print(
            "Cleaning: "
            f"{audit.get('duplicate_export_rows_removed', 0)} overlapping-export rows collapsed; "
            f"{audit.get('unidentified_test_or_partial_exposures_removed', 0)} identifier-free test/partial exposures ignored; "
            f"{audit.get('people_with_multiple_exposures', 0)} PIDs/persons had multiple exposures; "
            f"{audit.get('later_exposures_removed', 0)} later exposures removed; "
            f"{audit.get('preview_exposures_removed', 0)} preview exposures removed; "
            f"{audit.get('broad_llm_exclusions_removed', 0)} broad-screen assistance/template cases removed."
        )
    print(f"Participants found after cleaning: {participants.shape[0]}; completed through post quantitative questions: {participants['completed_primary'].sum()}")
    print("\nParticipants by policy and assigned side:")
    print(participants.groupby(["policy_id", "advocate_position"], dropna=False).size().reset_index(name="n").to_string(index=False))
    print("\nOutcome rows after inclusion:")
    print(pd.DataFrame([
        {"outcome": "claim warrantedness change", "rows": len(claim), "participants": claim["participant_id"].nunique() if not claim.empty else 0},
        {"outcome": "quantitative-estimate change", "rows": len(quant), "participants": quant["participant_id"].nunique() if not quant.empty else 0},
        {"outcome": "overall policy-support change", "rows": len(support), "participants": support["participant_id"].nunique() if not support.empty else 0},
    ]).to_string(index=False))
    if not claim_pred.empty:
        print("\nEvidence exposure per participant-claim:")
        cols = ["Pro_shown", "Con_shown", "ClaimCongenial", "N_bundles"]
        print(claim_pred[cols].describe().T[["mean", "std", "min", "max"]].to_string(float_format=lambda x: f"{x: .3f}"))


def merge_claim_outcome(outcome: pd.DataFrame, claim_pred: pd.DataFrame) -> pd.DataFrame:
    if outcome.empty:
        return pd.DataFrame()
    return outcome.merge(claim_pred, on=["participant_id", "policy_id", "claim_id", "policy_claim"], how="inner")


def merge_support_outcome(support: pd.DataFrame, policy_pred: pd.DataFrame) -> pd.DataFrame:
    if support.empty:
        return pd.DataFrame()
    return support.merge(policy_pred, on=["participant_id", "policy_id"], how="inner")


def process_cols(prefixes: list[str], measures: list[str]) -> list[str]:
    return [f"{prefix}_{m}" for prefix in prefixes for m in measures]


def stacked_attenuation(
    df: pd.DataFrame,
    outcome: str,
    baseline_rhs: str,
    augmented_rhs: str,
    target_term: str,
    label: str,
    cluster_col: str = "participant_id",
    target_direction: str = "positive",
) -> None:
    print_subhead(label)
    if df.empty:
        print("Skipped: no analyzable rows.")
        return
    needed = [outcome, target_term, cluster_col]
    if any(col not in df for col in needed):
        print("Skipped: required columns absent.")
        return
    d0 = df.copy()
    d1 = df.copy()
    d0["_model"] = "baseline"
    d1["_model"] = "augmented"
    stacked = pd.concat([d0, d1], ignore_index=True, sort=False)
    stacked["_aug"] = (stacked["_model"] == "augmented").astype(int)
    formula = f"{outcome} ~ ({baseline_rhs}) + _aug:({augmented_rhs})"
    try:
        fit = fit_model(stacked, formula, cluster_col)
    except Exception as exc:
        print(f"Skipped: stacked model could not be estimated ({exc}).")
        return
    base_name = target_term
    aug_increment_name = f"_aug:{target_term}"
    if aug_increment_name not in fit.model.exog_names:
        alt = f"{target_term}:_aug"
        if alt in fit.model.exog_names:
            aug_increment_name = alt
    if base_name not in fit.model.exog_names or aug_increment_name not in fit.model.exog_names:
        print("Skipped: target coefficient was not present in both equations.")
        return

    base_est, _, _, _ = contrast_stat(fit, {base_name: 1})
    aug_est, _, _, _ = contrast_stat(fit, {base_name: 1, aug_increment_name: 1})

    # For an expected-positive coefficient, attenuation toward zero is base-aug > 0.
    # For an expected-negative coefficient, attenuation toward zero is aug-base > 0.
    if target_direction == "negative":
        attenuation_weights = {aug_increment_name: 1}
    else:
        attenuation_weights = {aug_increment_name: -1}
    diff_est, diff_se, _, p_two = contrast_stat(fit, attenuation_weights)
    p_one = one_sided_p(diff_est, p_two, "positive")
    expected_sign_matches = (target_direction == "positive" and base_est > 0) or (target_direction == "negative" and base_est < 0)
    pct = 100 * diff_est / abs(base_est) if expected_sign_matches and abs(base_est) > 1e-8 else np.nan
    print(pd.DataFrame([{
        "baseline_coef": base_est,
        "augmented_coef": aug_est,
        "preregistered_attenuation_contrast": diff_est,
        "attenuation_percent_if_baseline_has_predicted_sign": pct,
        "se": diff_se,
        "p_one_sided": p_one,
        "p_two_sided": p_two,
    }]).to_string(index=False, float_format=lambda x: f"{x: .4f}"))
    # statsmodels retains large design matrices on each fitted result.  This
    # function is called dozens of times in the SI battery, so release each
    # stacked system promptly instead of letting memory accumulate.
    del fit, stacked, d0, d1
    gc.collect()


def matched_contrast_attenuation(
    df: pd.DataFrame,
    outcome: str,
    baseline_rhs: str,
    augmented_rhs: str,
    target_weights: dict[str, float],
    cluster_col: str = "participant_id",
) -> dict[str, float] | None:
    """Compare the same linear contrast across nested, clustered models.

    The equations are estimated in one stacked system so the attenuation-test
    standard error accounts for covariance between their estimates. Positive
    ``difference`` values indicate movement toward zero for the
    expected-positive contrasts used here.
    """
    if df.empty:
        return None
    needed = [outcome, cluster_col, *target_weights]
    if any(col not in df for col in needed):
        return None

    d0 = df.copy()
    d1 = df.copy()
    d0["_model"] = "baseline"
    d1["_model"] = "augmented"
    stacked = pd.concat([d0, d1], ignore_index=True, sort=False)
    stacked["_aug"] = stacked["_model"].eq("augmented").astype(int)
    fit = fit_model(
        stacked,
        f"{outcome} ~ ({baseline_rhs}) + _aug:({augmented_rhs})",
        cluster_col,
    )

    increment_weights: dict[str, float] = {}
    for term, weight in target_weights.items():
        increment = f"_aug:{term}"
        if increment not in fit.model.exog_names:
            alternate = f"{term}:_aug"
            if alternate in fit.model.exog_names:
                increment = alternate
        if term not in fit.model.exog_names or increment not in fit.model.exog_names:
            return None
        increment_weights[increment] = weight

    baseline_est, _, _, _ = contrast_stat(fit, target_weights)
    augmented_weights = dict(target_weights)
    augmented_weights.update(increment_weights)
    augmented_est, _, _, _ = contrast_stat(fit, augmented_weights)
    difference_weights = {term: -weight for term, weight in increment_weights.items()}
    difference, difference_se, _, p_two = contrast_stat(fit, difference_weights)
    p_one = one_sided_p(difference, p_two, "positive")
    attenuation_percent = (
        100.0 * difference / baseline_est if baseline_est > 1e-8 else np.nan
    )
    return {
        "baseline_coef": baseline_est,
        "augmented_coef": augmented_est,
        "difference": difference,
        "attenuation_percent": attenuation_percent,
        "se": difference_se,
        "p_one_sided": p_one,
        "p_two_sided": p_two,
    }


def run_process_models(bundle_pred: pd.DataFrame, claim_pred: pd.DataFrame) -> None:
    print_header("H4. Evidence-Congenial Selective Processing")
    shown = bundle_pred.loc[bundle_pred["shown"].eq(1)].copy() if not bundle_pred.empty else pd.DataFrame()
    for m in PROCESS_MEASURES:
        report_model(
            PROCESS_LABELS[m],
            shown,
            f"{m} ~ EvidenceCongenial + N_bundles + C(policy_claim)",
            [TestSpec("evidence-congenial process > 0", "EvidenceCongenial", "positive")],
        )

    print_header("H5. Claim-Congenial Selective Processing")
    for m in PROCESS_MEASURES:
        report_model(
            PROCESS_LABELS[m],
            claim_pred,
            f"ClaimProc_{m} ~ ClaimCongenial + N_bundles + C(policy_claim)",
            [TestSpec("claim-congenial process > 0", "ClaimCongenial", "positive")],
        )


def run_process_to_judgment(claim_df: pd.DataFrame, quant_df: pd.DataFrame, support_df: pd.DataFrame) -> None:
    print_header("Process-to-Judgment Associations")
    for subset_label, measures in PROCESS_SUBSETS.items():
        claim_proc = " + ".join(process_cols(["ProProc", "ConProc"], measures))
        support_proc = claim_proc
        tests = [TestSpec("residual advocacy effect", "Adv", "positive")]
        for m in measures:
            tests.append(TestSpec(f"pro-policy {PROCESS_LABELS[m]} predicts supportive updating", f"ProProc_{m}", "positive"))
            tests.append(TestSpec(f"anti-policy {PROCESS_LABELS[m]} predicts less-supportive updating", f"ConProc_{m}", "negative"))
        report_model(
            f"Claim warrantedness, adding {subset_label}",
            claim_df,
            f"delta_w ~ Adv + Pro_shown + Con_shown + {claim_proc} + C(policy_claim)",
            tests,
        )
        report_model(
            f"Quantitative estimates, adding {subset_label}",
            quant_df,
            f"delta_b ~ Adv + Pro_shown + Con_shown + {claim_proc} + C(policy_claim)",
            tests,
        )
        report_model(
            f"Policy support, adding {subset_label}",
            support_df,
            f"delta_support ~ Adv + Pro_count + Con_count + {support_proc} + C(policy_id)",
            tests,
        )


def save_attenuation_estimates(
    claim_df: pd.DataFrame,
    quant_df: pd.DataFrame,
    support_df: pd.DataFrame,
    outdir: Path,
) -> pd.DataFrame:
    """Save baseline and process-adjusted effects with participant-clustered CIs."""
    outdir.mkdir(parents=True, exist_ok=True)
    process_rhs = " + ".join(process_cols(["ProProc", "ConProc"], PROCESS_MEASURES))
    sharing_rhs = " + ".join(
        process_cols(["ProProc", "ConProc"], PROCESS_SUBSETS["sharing only"])
    )
    aligned_claims = claim_df.loc[claim_df["ClaimCongenial"].eq(1)].copy()

    model_specs = {
        "Claim advocacy": (
            claim_df,
            "delta_w ~ Adv + Pro_shown + Con_shown + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + {sharing_rhs} + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + {process_rhs} + C(policy_claim)",
            {"Adv": 1.0},
            "A",
        ),
        "Quantitative advocacy": (
            quant_df,
            "delta_b ~ Adv + Pro_shown + Con_shown + C(policy_claim)",
            f"delta_b ~ Adv + Pro_shown + Con_shown + {sharing_rhs} + C(policy_claim)",
            f"delta_b ~ Adv + Pro_shown + Con_shown + {process_rhs} + C(policy_claim)",
            {"Adv": 1.0},
            "A",
        ),
        "Policy-support advocacy": (
            support_df,
            "delta_support ~ Adv + Pro_count + Con_count + C(policy_id)",
            f"delta_support ~ Adv + Pro_count + Con_count + {sharing_rhs} + C(policy_id)",
            f"delta_support ~ Adv + Pro_count + Con_count + {process_rhs} + C(policy_id)",
            {"Adv": 1.0},
            "A",
        ),
        "Pro-evidence responsiveness": (
            claim_df,
            "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {sharing_rhs} + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {process_rhs} + C(policy_claim)",
            {"Adv_Pro": 1.0},
            "SI",
        ),
        "Anti-evidence responsiveness": (
            claim_df,
            "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {sharing_rhs} + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {process_rhs} + C(policy_claim)",
            {"Adv_Con": 1.0},
            "SI",
        ),
        "Pooled asymmetric updating, advocacy-aligned claims": (
            aligned_claims,
            "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {sharing_rhs} + C(policy_claim)",
            f"delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {process_rhs} + C(policy_claim)",
            {"Adv_Pro": 1.0, "Adv_Con": 1.0},
            "B",
        ),
    }

    rows = []
    for estimand, (data, baseline_formula, sharing_formula, adjusted_formula, weights, panel) in model_specs.items():
        models = {
            "Baseline": fit_model(data, baseline_formula),
            "Sharing only": fit_model(data, sharing_formula),
            "All process measures": fit_model(data, adjusted_formula),
        }
        for specification, model in models.items():
            estimate, se, _, p_two = contrast_stat(model, weights)
            rows.append(
                {
                    "panel": panel,
                    "estimand": estimand,
                    "specification": specification,
                    "estimate": estimate,
                    "se": se,
                    "ci_low": estimate - 1.96 * se,
                    "ci_high": estimate + 1.96 * se,
                    "p_two_sided": p_two,
                    "n_rows": int(model.nobs),
                    "n_participants": int(data["participant_id"].nunique()),
                }
            )
    values = pd.DataFrame(rows)
    for estimand, group in values.groupby("estimand"):
        base = float(group.loc[group["specification"].eq("Baseline"), "estimate"].iloc[0])
        adjusted = float(group.loc[group["specification"].eq("All process measures"), "estimate"].iloc[0])
        attenuation = 100.0 * (base - adjusted) / base if abs(base) > 1e-12 else np.nan
        values.loc[values["estimand"].eq(estimand), "attenuation_percent"] = attenuation
    values.to_csv(outdir / "figure_6_attenuation_estimates_values.csv", index=False)

    aligned_values = values.loc[
        values["estimand"].eq("Pooled asymmetric updating, advocacy-aligned claims")
    ].copy()
    aligned_values["specification"] = aligned_values["specification"].replace(
        {"Baseline": "No process measures"}
    )
    aligned_values.drop(columns=["panel", "estimand", "attenuation_percent"]).to_csv(
        outdir / "figure_6_aligned_claim_asymmetry_attenuation_values.csv",
        index=False,
    )

    aligned_base_rhs = "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)"
    matched_rows = []
    for comparison, measures in [
        ("Sharing only", PROCESS_SUBSETS["sharing only"]),
        ("All process measures", PROCESS_MEASURES),
    ]:
        proc = " + ".join(process_cols(["ProProc", "ConProc"], measures))
        result = matched_contrast_attenuation(
            aligned_claims,
            "delta_w",
            aligned_base_rhs,
            f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {proc} + C(policy_claim)",
            {"Adv_Pro": 1.0, "Adv_Con": 1.0},
        )
        if result is not None:
            matched_rows.append({"comparison": comparison, **result})
    pd.DataFrame(matched_rows).to_csv(
        outdir / "figure_6_aligned_claim_asymmetry_attenuation_tests.csv",
        index=False,
    )

    if plt is None:
        return values

    panel_orders = {
        "A": ["Claim advocacy", "Quantitative advocacy", "Policy-support advocacy"],
        "B": ["Pooled asymmetric updating, advocacy-aligned claims"],
    }
    panel_titles = {
        "A": "Advocacy effects",
        "B": "Asymmetric updating",
    }
    # Keep all three specifications used in the manuscript attenuation display.
    # The previous plotting code still looked for an obsolete two-specification
    # label ("Process-adjusted"), even though the fitted models and saved values
    # use "Sharing only" and "All process measures".  That mismatch caused the
    # script to fail after all models had been estimated.
    specifications = ["Baseline", "Sharing only", "All process measures"]
    colors = {
        "Baseline": "#4C4C4C",
        "Sharing only": "#7A68A6",
        "All process measures": "#55A868",
    }
    offsets = {"Baseline": 0.18, "Sharing only": 0.0, "All process measures": -0.18}
    fig, axes = plt.subplots(1, 2, figsize=(11.5, 3.7), constrained_layout=True)
    for ax, panel in zip(axes, ["A", "B"]):
        order = panel_orders[panel]
        panel_values = values.loc[values["panel"].eq(panel)]
        for specification in specifications:
            subset = panel_values.loc[
                panel_values["specification"].eq(specification)
            ].set_index("estimand")
            y = np.arange(len(order), dtype=float) + offsets[specification]
            estimates = np.array([subset.loc[name, "estimate"] for name in order], dtype=float)
            errors = np.array([1.96 * subset.loc[name, "se"] for name in order], dtype=float)
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
        ax.set_title(panel_titles[panel])
        ax.spines[["top", "right"]].set_visible(False)
    axes[0].set_xlabel("Estimated effect on standardized belief change (95% CI)")
    axes[1].set_xlabel("Advocacy × evidence interaction (95% CI)")
    handles, labels = axes[1].get_legend_handles_labels()
    fig.legend(
        handles,
        labels,
        frameon=False,
        loc="lower center",
        bbox_to_anchor=(0.5, -0.14),
        ncol=2,
    )
    for suffix in ["pdf", "png"]:
        fig.savefig(
            outdir / f"figure_6_attenuation_estimates.{suffix}",
            dpi=300 if suffix == "png" else None,
            bbox_inches="tight",
        )
    plt.close(fig)
    return values


def run_all(
    stimuli_path: Path | None = None,
    csv_paths: list[Path] | None = None,
    outdir: Path | None = None,
) -> None:
    pd.set_option("display.width", 180)
    pd.set_option("display.max_columns", 80)
    warnings.filterwarnings("ignore", category=FutureWarning)
    warnings.filterwarnings("ignore", category=RuntimeWarning)
    np.seterr(all="ignore")
    if stimuli_path is None or csv_paths is None:
        stimuli_path, csv_paths = find_input_files(SCRIPT_DIR)
    policies, claims, facts, quants = load_stimuli(stimuli_path)
    raw = load_advocate_csvs(csv_paths)
    participants = participant_table(raw)
    completed = participants.loc[participants["completed_primary"]].copy()
    claim, quant, support = build_outcomes(raw, claims, quants)
    claim_pred, policy_pred, bundle_pred = build_predictors(raw, completed, claims, facts)
    claim_df = merge_claim_outcome(claim, claim_pred)
    quant_df = merge_claim_outcome(quant, claim_pred)
    support_df = merge_support_outcome(support, policy_pred)

    print_header("Policy Advocacy Preregistration Analysis")
    print(f"Stimulus file: {stimuli_path.name}")
    print_summary(raw, participants, claim, quant, support, claim_pred)

    print_header("H1. Advocacy Effect")
    report_model("Claim warrantedness", claim_df, "delta_w ~ Adv + Pro_shown + Con_shown + C(policy_claim)", [TestSpec("advocacy effect > 0", "Adv", "positive")])
    report_model("Quantitative estimates", quant_df, "delta_b ~ Adv + Pro_shown + Con_shown + C(policy_claim)", [TestSpec("advocacy effect > 0", "Adv", "positive")])
    report_model("Overall policy support", support_df, "delta_support ~ Adv + Pro_count + Con_count + C(policy_id)", [TestSpec("advocacy effect > 0", "Adv", "positive")])

    print_header("H2. Claim-Congenial Asymmetric Updating")
    h2_tests = [
        TestSpec("pro-policy evidence on congenial claims > 0", "Pro_CC", "positive"),
        TestSpec("anti-policy evidence on congenial claims < 0", "Con_CC", "negative"),
        TestSpec("composite: Pro_CC - Con_CC > 0", contrast={"Pro_CC": 1, "Con_CC": -1}, direction="positive"),
    ]
    report_model("Claim warrantedness", claim_df, "delta_w ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", h2_tests)
    report_model("Quantitative estimates", quant_df, "delta_b ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", h2_tests)
    report_model(
        "Overall policy support",
        support_df,
        "delta_support ~ Adv + Pro_count + Con_count + Pro_cong + Con_cong + C(policy_id)",
        [
            TestSpec("pro-policy evidence on congenial claims > 0", "Pro_cong", "positive"),
            TestSpec("anti-policy evidence on congenial claims < 0", "Con_cong", "negative"),
            TestSpec("composite: Pro_cong - Con_cong > 0", contrast={"Pro_cong": 1, "Con_cong": -1}, direction="positive"),
        ],
    )

    print_header("H3. Evidence-Congenial Asymmetric Updating")
    h3_tests = [
        TestSpec("pro-vs-anti advocates: pro-policy evidence response difference > 0", "Adv_Pro", "positive"),
        TestSpec("pro-vs-anti advocates: anti-policy evidence response difference > 0", "Adv_Con", "positive"),
        TestSpec("composite: Adv_Pro + Adv_Con > 0", contrast={"Adv_Pro": 1, "Adv_Con": 1}, direction="positive"),
    ]
    report_model("Claim warrantedness", claim_df, "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", h3_tests)
    report_model("Quantitative estimates", quant_df, "delta_b ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", h3_tests)
    report_model(
        "Overall policy support",
        support_df,
        "delta_support ~ Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + C(policy_id)",
        [
            TestSpec("pro-vs-anti advocates: pro-policy evidence-count response difference > 0", "Adv_Pro_count", "positive"),
            TestSpec("pro-vs-anti advocates: anti-policy evidence-count response difference > 0", "Adv_Con_count", "positive"),
            TestSpec("composite > 0", contrast={"Adv_Pro_count": 1, "Adv_Con_count": 1}, direction="positive"),
        ],
    )

    print_header("H3 Moderator: Especially Congenial Claims")
    report_model("Claim warrantedness, congenial claims only", claim_df.loc[claim_df["ClaimCongenial"].eq(1)], "delta_w ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", h3_tests)
    report_model("Quantitative estimates, congenial claims only", quant_df.loc[quant_df["ClaimCongenial"].eq(1)], "delta_b ~ Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", h3_tests)
    moderator_tests = [
        TestSpec("extra pro-advocate/pro-evidence effect on congenial claims > 0", "Adv_Pro_CC", "positive"),
        TestSpec("extra advocacy-by-anti-evidence effect on congenial claims > 0", "Adv_Con_CC", "positive"),
    ]
    report_model("Claim warrantedness, triple-interaction check", claim_df, "delta_w ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Adv_Pro + Adv_Con + Adv_Pro_CC + Adv_Con_CC + C(policy_claim)", moderator_tests)
    report_model("Quantitative estimates, triple-interaction check", quant_df, "delta_b ~ Adv + Pro_shown + Con_shown + ClaimCongenial + Adv_Pro + Adv_Con + Adv_Pro_CC + Adv_Con_CC + C(policy_claim)", moderator_tests)

    run_process_models(bundle_pred, claim_pred)
    run_process_to_judgment(claim_df, quant_df, support_df)

    print_header("H6. Process Attenuation")
    for subset_label, measures in PROCESS_SUBSETS.items():
        proc = " + ".join(process_cols(["ProProc", "ConProc"], measures))
        stacked_attenuation(claim_df, "delta_w", "Adv + Pro_shown + Con_shown + C(policy_claim)", f"Adv + Pro_shown + Con_shown + {proc} + C(policy_claim)", "Adv", f"Advocacy attenuation, claim warrantedness, {subset_label}")
        stacked_attenuation(quant_df, "delta_b", "Adv + Pro_shown + Con_shown + C(policy_claim)", f"Adv + Pro_shown + Con_shown + {proc} + C(policy_claim)", "Adv", f"Advocacy attenuation, quantitative estimates, {subset_label}")
        stacked_attenuation(support_df, "delta_support", "Adv + Pro_count + Con_count + C(policy_id)", f"Adv + Pro_count + Con_count + {proc} + C(policy_id)", "Adv", f"Advocacy attenuation, policy support, {subset_label}")
        stacked_attenuation(claim_df, "delta_w", "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {proc} + C(policy_claim)", "Adv_Pro", f"Evidence-congenial attenuation, pro side, claim warrantedness, {subset_label}")
        stacked_attenuation(claim_df, "delta_w", "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {proc} + C(policy_claim)", "Adv_Con", f"Evidence-congenial attenuation, con side, claim warrantedness, {subset_label}")
        stacked_attenuation(quant_df, "delta_b", "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {proc} + C(policy_claim)", "Adv_Pro", f"Evidence-congenial attenuation, pro side, quantitative estimates, {subset_label}")
        stacked_attenuation(quant_df, "delta_b", "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)", f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {proc} + C(policy_claim)", "Adv_Con", f"Evidence-congenial attenuation, con side, quantitative estimates, {subset_label}")
        stacked_attenuation(support_df, "delta_support", "Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + C(policy_id)", f"Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + {proc} + C(policy_id)", "Adv_Pro_count", f"Evidence-congenial attenuation, pro side, policy support, {subset_label}")
        stacked_attenuation(support_df, "delta_support", "Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + C(policy_id)", f"Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + {proc} + C(policy_id)", "Adv_Con_count", f"Evidence-congenial attenuation, con side, policy support, {subset_label}")
        stacked_attenuation(claim_df, "delta_w", "Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", f"Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + {proc} + C(policy_claim)", "Pro_CC", f"Claim-congenial attenuation, pro evidence, claim warrantedness, {subset_label}")
        stacked_attenuation(claim_df, "delta_w", "Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", f"Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + {proc} + C(policy_claim)", "Con_CC", f"Claim-congenial attenuation, con evidence, claim warrantedness, {subset_label}", target_direction="negative")
        stacked_attenuation(quant_df, "delta_b", "Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", f"Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + {proc} + C(policy_claim)", "Pro_CC", f"Claim-congenial attenuation, pro evidence, quantitative estimates, {subset_label}")
        stacked_attenuation(quant_df, "delta_b", "Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + C(policy_claim)", f"Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + {proc} + C(policy_claim)", "Con_CC", f"Claim-congenial attenuation, con evidence, quantitative estimates, {subset_label}", target_direction="negative")
        stacked_attenuation(support_df, "delta_support", "Adv + Pro_count + Con_count + Pro_cong + Con_cong + C(policy_id)", f"Adv + Pro_count + Con_count + Pro_cong + Con_cong + {proc} + C(policy_id)", "Pro_cong", f"Claim-congenial attenuation, pro evidence, policy support, {subset_label}")
        stacked_attenuation(support_df, "delta_support", "Adv + Pro_count + Con_count + Pro_cong + Con_cong + C(policy_id)", f"Adv + Pro_count + Con_count + Pro_cong + Con_cong + {proc} + C(policy_id)", "Con_cong", f"Claim-congenial attenuation, con evidence, policy support, {subset_label}", target_direction="negative")

    print_header("Figure 6d. Pooled Asymmetric-Updating Attenuation on Advocacy-Aligned Claims")
    aligned_claims = claim_df.loc[claim_df["ClaimCongenial"].eq(1)].copy()
    aligned_base_rhs = "Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + C(policy_claim)"
    for comparison, measures in [
        ("Sharing only", PROCESS_SUBSETS["sharing only"]),
        ("All process measures", PROCESS_MEASURES),
    ]:
        proc = " + ".join(process_cols(["ProProc", "ConProc"], measures))
        result = matched_contrast_attenuation(
            aligned_claims,
            "delta_w",
            aligned_base_rhs,
            f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {proc} + C(policy_claim)",
            {"Adv_Pro": 1.0, "Adv_Con": 1.0},
        )
        print_subhead(comparison)
        if result is None:
            print("Skipped: matched contrast could not be estimated.")
        else:
            print(pd.DataFrame([result]).to_string(index=False, float_format=lambda x: f"{x: .4f}"))

    if outdir is not None:
        save_attenuation_estimates(claim_df, quant_df, support_df, outdir)
        diagnostics = {
            "n_participants": int(completed.shape[0]),
            "n_claim_rows": int(len(claim_df)),
            "n_quant_rows": int(len(quant_df)),
            "n_support_rows": int(len(support_df)),
            "cleaning": raw.attrs.get("cleaning_audit", {}),
            "stimuli_file": stimuli_path.name,
            "csv_files": [path.name for path in csv_paths],
        }
        (outdir / "diagnostics.json").write_text(
            json.dumps(diagnostics, indent=2), encoding="utf-8"
        )
        print(f"\nReproduction outputs written to: {outdir}")


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser()
        parser.add_argument(
            "--data-dir",
            type=Path,
            required=True,
            help="Directory containing only the ten final-study CSV exports.",
        )
        parser.add_argument(
            "--stimuli",
            type=Path,
            required=True,
            help="Path to the final policy_advocacy_stimuli.json file.",
        )
        parser.add_argument(
            "--outdir",
            type=Path,
            required=True,
            help="Directory for diagnostics, coefficient values, and figures.",
        )
        args = parser.parse_args()
        csv_paths = sorted(args.data_dir.glob("*.csv"))
        if not csv_paths:
            raise FileNotFoundError(f"No CSV files found in {args.data_dir}")
        run_all(args.stimuli, csv_paths, args.outdir)
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        sys.exit(1)
