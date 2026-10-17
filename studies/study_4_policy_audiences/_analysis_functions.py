#!/usr/bin/env python3
"""Internal statistical functions used by the Study 4 reproduction scripts.

Readers should run ``reproduce_main_results.py`` or
``reproduce_si_results.py`` rather than opening this supporting module.
"""

from __future__ import annotations

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
import statsmodels.api as sm
import statsmodels.formula.api as smf


SCRIPT_DIR = Path(__file__).resolve().parent
PDISPLAY = {"display.width": 160, "display.max_columns": 80}
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
PROCESS_SUBSETS = {
    "all process measures": PROCESS_MEASURES,
    "attention only": ["attention_open_count", "attention_time"],
    "source consultation only": ["source_open_count", "source_time"],
    "sharing only": ["sharing_any", "sharing_count"],
    "activation only": ["activation_any", "activation_count"],
}


@dataclass
class TestSpec:
    label: str
    term: str | None = None
    direction: str = "positive"
    contrast: dict[str, float] | None = None


def print_header(title: str) -> None:
    print("\n" + "=" * 92)
    print(title)
    print("=" * 92)


def print_subhead(title: str) -> None:
    print("\n" + "-" * 92)
    print(title)
    print("-" * 92)


def clean_name(x: object) -> str:
    out = str(x)
    for a, b in [
        (" ", "_"),
        ("-", "_"),
        (":", "_"),
        ("/", "_"),
        ("(", "_"),
        (")", "_"),
        ("[", "_"),
        ("]", "_"),
        (".", "_"),
    ]:
        out = out.replace(a, b)
    while "__" in out:
        out = out.replace("__", "_")
    return out.strip("_")


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


def side_to_adv(x: object) -> float:
    s = str(x or "").strip().lower()
    if s in {"support", "pro", "for", "favor", "in_favor"}:
        return 1.0
    if s in {"oppose", "con", "against", "anti"}:
        return 0.0
    return np.nan


def direction_from_policy_relation(x: object) -> str | None:
    s = str(x or "").lower()
    if "support" in s or s == "pro":
        return "pro"
    if "oppose" in s or "against" in s or s == "con":
        return "con"
    return None


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


def find_input_files(folder: Path) -> tuple[Path, list[Path], list[Path]]:
    json_paths = sorted((folder / "experiment").glob("*.json"))
    csv_paths = sorted((folder / "data").glob("*.csv"))
    stimuli_candidates: list[Path] = []
    analysis_dossier_candidates: list[Path] = []
    ignored_runtime_dossiers: list[Path] = []

    for path in json_paths:
        try:
            obj = json.loads(path.read_text())
        except Exception:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("policies"), list):
            stimuli_candidates.append(path)
        if isinstance(obj, dict) and isinstance(obj.get("dossiers"), list):
            dossiers = obj.get("dossiers", []) or []
            has_process = any(bool((d or {}).get("advocate_process", {}).get("fact_level")) for d in dossiers)
            if has_process:
                analysis_dossier_candidates.append(path)
            else:
                ignored_runtime_dossiers.append(path)

    reviewer_csvs = []
    for path in csv_paths:
        try:
            cols = pd.read_csv(path, nrows=0).columns
        except Exception:
            continue
        if {"page_type", "dossier_id"}.issubset(set(cols)):
            reviewer_csvs.append(path)

    if not stimuli_candidates:
        raise FileNotFoundError("No stimulus JSON found. Expected a JSON with a top-level 'policies' list.")
    exact_stimuli = [p for p in stimuli_candidates if p.name == "policy_advocacy_stimuli.json"]
    if exact_stimuli:
        stimuli_path = exact_stimuli[0]
    elif len(stimuli_candidates) == 1:
        stimuli_path = stimuli_candidates[0]
    else:
        names = "\n".join(f"  - {p.name}" for p in stimuli_candidates)
        raise RuntimeError(
            "Multiple stimulus JSON files found and none is named policy_advocacy_stimuli.json. "
            "Keep only the final stimulus file or rename the intended one.\n" + names
        )

    expected_analysis_names = {
        "minimum_wage_advocate_dossiers.json",
        "carbon_pricing_advocate_dossiers.json",
    }
    exact_analysis = [p for p in analysis_dossier_candidates if p.name in expected_analysis_names]
    if len(exact_analysis) == len(expected_analysis_names):
        dossier_paths = sorted(exact_analysis)
    else:
        dossier_paths = sorted(analysis_dossier_candidates)

    if not dossier_paths:
        ignored = "\n".join(f"  - {p.name}" for p in ignored_runtime_dossiers)
        msg = (
            "No full reviewer analysis JSON found. The preregistered H1-H4 analyses require advocate "
            "evidence-exposure and fact-level process data. Put minimum_wage_advocate_dossiers.json "
            "and carbon_pricing_advocate_dossiers.json in this folder."
        )
        if ignored:
            msg += "\nRuntime-only dossier files were found but are insufficient for the preregistered analysis:\n" + ignored
        raise FileNotFoundError(msg)
    if not reviewer_csvs:
        raise FileNotFoundError("No reviewer jsPsych CSV found. Expected CSV files with page_type and dossier_id columns.")

    return stimuli_path, dossier_paths, reviewer_csvs


def load_stimuli(path: Path) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    obj = json.loads(path.read_text())
    policy_rows, claim_rows, fact_rows, quant_rows = [], [], [], []
    for policy in obj.get("policies", []):
        policy_id = policy.get("policy_id")
        policy_rows.append(
            {
                "policy_id": policy_id,
                "policy_name": policy.get("policy_name", policy_id),
                "n_claims": len(policy.get("claims", []) or []),
            }
        )
        for claim in policy.get("claims", []) or []:
            claim_id = claim.get("claim_id")
            v = claim_valence_to_v(claim.get("claim_valence_for_policy"))
            claim_rows.append(
                {
                    "policy_id": policy_id,
                    "claim_id": claim_id,
                    "policy_claim": f"{policy_id}:{claim_id}",
                    "claim_text": claim.get("claim_text", ""),
                    "claim_valence_for_policy": claim.get("claim_valence_for_policy"),
                    "claim_v": v,
                }
            )
            for fact in claim.get("facts", []) or []:
                rel = direction_from_policy_relation(fact.get("fact_relation_to_policy"))
                if rel is None:
                    side = str(fact.get("side_relative_to_claim", "")).lower()
                    supports_claim = "support" in side
                    if np.isfinite(v):
                        rel = "pro" if (supports_claim and v == 1) or ((not supports_claim) and v == -1) else "con"
                fact_rows.append(
                    {
                        "policy_id": policy_id,
                        "claim_id": claim_id,
                        "policy_claim": f"{policy_id}:{claim_id}",
                        "fact_id": fact.get("fact_id"),
                        "policy_direction": rel,
                    }
                )
            for q in claim.get("quantitative_questions", []) or []:
                quant_rows.append(
                    {
                        "policy_id": policy_id,
                        "claim_id": claim_id,
                        "policy_claim": f"{policy_id}:{claim_id}",
                        "question_id": q.get("question_id"),
                        "policy_question": f"{policy_id}:{q.get('question_id')}",
                        "question_text": q.get("question_text", ""),
                        "quant_s": higher_supports_policy_to_s(q.get("higher_value_supports_policy")),
                    }
                )
    return pd.DataFrame(policy_rows), pd.DataFrame(claim_rows), pd.DataFrame(fact_rows), pd.DataFrame(quant_rows)


def load_dossiers(paths: list[Path], fact_map: pd.DataFrame, claims: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    fact_lookup = fact_map.set_index("fact_id").to_dict("index") if not fact_map.empty else {}
    claim_lookup = claims.set_index(["policy_id", "claim_id"]).to_dict("index") if not claims.empty else {}
    dossier_by_id: dict[str, dict] = {}
    source_by_id: dict[str, str] = {}
    for path in paths:
        obj = json.loads(path.read_text())
        for d in obj.get("dossiers", []) or []:
            did = d.get("dossier_id")
            if not did:
                continue
            old = dossier_by_id.get(did)
            old_has_process = bool((old or {}).get("advocate_process", {}).get("fact_level"))
            new_has_process = bool((d or {}).get("advocate_process", {}).get("fact_level"))
            if old is None or (new_has_process and not old_has_process):
                dossier_by_id[did] = d
                source_by_id[did] = path.name

    dossier_rows, exposure_rows, process_rows = [], [], []
    for did, d in dossier_by_id.items():
        policy_id = d.get("policy_id")
        adv = side_to_adv(d.get("advocate_position"))
        dossier_rows.append(
            {
                "dossier_id": did,
                "policy_id": policy_id,
                "policy_name": d.get("policy_name", policy_id),
                "Adv": adv,
                "advocate_position": d.get("advocate_position"),
                "argument_word_count": as_number(d.get("argument_word_count")),
                "dossier_source_file": source_by_id.get(did),
            }
        )

        shown_fact_ids = set()
        exp = d.get("evidence_exposure", {}) or {}
        shown_fact_ids.update(exp.get("facts_shown_ids", []) or [])
        for row in d.get("advocate_process", {}).get("fact_level", []) or []:
            if row.get("fact_id"):
                shown_fact_ids.add(row.get("fact_id"))
        for item in exp.get("sampler_side_selections", []) or []:
            claim_id = item.get("claim_id")
            for fact_id in item.get("supports_claim_fact_ids", []) or []:
                if item.get("supports_claim_seen"):
                    shown_fact_ids.add(fact_id)
            for fact_id in item.get("opposes_claim_fact_ids", []) or []:
                if item.get("opposes_claim_seen"):
                    shown_fact_ids.add(fact_id)

        exposure = {}
        for fact_id in shown_fact_ids:
            meta = fact_lookup.get(fact_id)
            if not meta:
                continue
            key = (meta["policy_id"], meta["claim_id"], meta["policy_direction"])
            exposure[key] = 1

        policy_claims = claims.loc[claims["policy_id"].eq(policy_id), ["policy_id", "claim_id", "claim_v"]]
        for _, cl in policy_claims.iterrows():
            for direction in ["pro", "con"]:
                exposure_rows.append(
                    {
                        "dossier_id": did,
                        "policy_id": policy_id,
                        "claim_id": cl["claim_id"],
                        "policy_claim": f"{policy_id}:{cl['claim_id']}",
                        "policy_direction": direction,
                        "shown": exposure.get((policy_id, cl["claim_id"], direction), 0),
                    }
                )
            claim_congenial = int((adv == 1 and cl["claim_v"] == 1) or (adv == 0 and cl["claim_v"] == -1)) if np.isfinite(adv) and np.isfinite(cl["claim_v"]) else np.nan
            exposure_rows.append(
                {
                    "dossier_id": did,
                    "policy_id": policy_id,
                    "claim_id": cl["claim_id"],
                    "policy_claim": f"{policy_id}:{cl['claim_id']}",
                    "policy_direction": "claim_marker",
                    "shown": np.nan,
                    "ClaimCongenial": claim_congenial,
                }
            )

        proc_accum: dict[tuple[str, str], dict[str, float]] = {}
        for row in d.get("advocate_process", {}).get("fact_level", []) or []:
            fact_id = row.get("fact_id")
            meta = fact_lookup.get(fact_id, {})
            claim_id = meta.get("claim_id")
            direction = meta.get("policy_direction") or direction_from_policy_relation(row.get("fact_relation_to_policy"))
            if not claim_id or direction not in {"pro", "con"}:
                continue
            key = (claim_id, direction)
            vals = proc_accum.setdefault(key, {m: 0.0 for m in PROCESS_MEASURES})
            vals["attention_open_count"] += as_number(row.get("open_count"))
            vals["attention_time"] += math.log1p(max(0.0, as_number(row.get("total_open_ms")) or 0.0))
            vals["source_open_count"] += as_number(row.get("source_open_count"))
            vals["source_time"] += math.log1p(max(0.0, as_number(row.get("source_total_open_ms")) or 0.0))
            shared = max(as_number(row.get("used")), as_number(row.get("attached")), as_number(row.get("inserted")))
            shared = 0.0 if not np.isfinite(shared) else float(shared > 0)
            activated = as_number(row.get("activated"))
            activated = 0.0 if not np.isfinite(activated) else float(activated > 0)
            vals["sharing_any"] = max(vals["sharing_any"], shared)
            vals["sharing_count"] += shared
            vals["activation_any"] = max(vals["activation_any"], activated)
            vals["activation_count"] += activated

        for _, cl in policy_claims.iterrows():
            for direction in ["pro", "con"]:
                vals = proc_accum.get((cl["claim_id"], direction), {m: 0.0 for m in PROCESS_MEASURES})
                process_rows.append(
                    {
                        "dossier_id": did,
                        "policy_id": policy_id,
                        "claim_id": cl["claim_id"],
                        "policy_claim": f"{policy_id}:{cl['claim_id']}",
                        "policy_direction": direction,
                        **vals,
                    }
                )

    dossiers = pd.DataFrame(dossier_rows)
    exposure_long = pd.DataFrame(exposure_rows)
    process_long = pd.DataFrame(process_rows)
    return dossiers, exposure_long, process_long


def load_reviewer_csvs(paths: list[Path]) -> pd.DataFrame:
    frames = []
    for path in paths:
        df = pd.read_csv(path)
        df["source_csv"] = path.name
        frames.append(df)
    out = pd.concat(frames, ignore_index=True, sort=False)

    if "reviewer_id" in out.columns:
        out["reviewer_id"] = out["reviewer_id"].fillna("").astype(str).str.strip()
    for col in ["SESSION_ID", "run_id", "PROLIFIC_PID"]:
        if col not in out:
            out[col] = np.nan

    def usable_string(series: pd.Series) -> pd.Series:
        s = series.fillna("").astype(str).str.strip()
        return s.mask(s.str.lower().isin({"", "nan", "none", "null"}), "")

    session = usable_string(out["SESSION_ID"])
    run_id = usable_string(out["run_id"])
    prolific = usable_string(out["PROLIFIC_PID"])
    if "reviewer_id" not in out.columns:
        out["reviewer_id"] = session
    blank = out["reviewer_id"].eq("")
    out.loc[blank, "reviewer_id"] = run_id.loc[blank]
    blank = out["reviewer_id"].eq("")
    out.loc[blank, "reviewer_id"] = prolific.loc[blank]
    blank = out["reviewer_id"].eq("")
    out.loc[blank, "reviewer_id"] = [f"unidentified::{i}" for i in out.index[blank]]

    # Cognition.run exports may be cumulative. Do not make source_csv part of reviewer identity;
    # instead collapse the same trial if it appears in multiple downloaded exports.
    before = len(out)
    dedupe_keys = [c for c in ["reviewer_id", "trial_index", "page_type", "dossier_id"] if c in out.columns]
    if {"reviewer_id", "trial_index", "page_type"}.issubset(dedupe_keys):
        sort_cols = [c for c in ["recorded_at", "source_csv"] if c in out.columns]
        if sort_cols:
            out = out.sort_values(sort_cols)
        out = out.drop_duplicates(subset=dedupe_keys, keep="last").copy()
    out.attrs["duplicate_rows_removed"] = before - len(out)

    if "policy_id" in out and "selected_policy_id" in out:
        out["policy_id_any"] = out["policy_id"].fillna(out["selected_policy_id"])
    elif "policy_id" in out:
        out["policy_id_any"] = out["policy_id"]
    elif "selected_policy_id" in out:
        out["policy_id_any"] = out["selected_policy_id"]
    else:
        out["policy_id_any"] = np.nan
    return out


def completed_reviewers(raw: pd.DataFrame) -> pd.DataFrame:
    key_cols = ["reviewer_id", "dossier_id"]
    pages = raw.groupby(key_cols, dropna=False)["page_type"].apply(lambda x: set(x.dropna().astype(str))).reset_index()
    pages["completed_primary"] = pages["page_type"].apply(lambda s: "post_quant_beliefs" in s)
    return pages.loc[pages["completed_primary"], key_cols].drop_duplicates()


def explode_response_rows(raw: pd.DataFrame, page_types: Iterable[str]) -> pd.DataFrame:
    rows = []
    for _, row in raw.loc[raw["page_type"].isin(page_types)].iterrows():
        parsed = parse_json_cell(row.get("responses"))
        if not isinstance(parsed, list):
            continue
        for item in parsed:
            if not isinstance(item, dict):
                continue
            out = dict(item)
            out["reviewer_id"] = row.get("reviewer_id")
            out["source_csv"] = row.get("source_csv")
            out["dossier_id"] = out.get("dossier_id") or row.get("dossier_id")
            out["policy_id"] = out.get("policy_id") or row.get("policy_id_any")
            rows.append(out)
    return pd.DataFrame(rows)


def standardize_change(df: pd.DataFrame, raw_col: str, unit_cols: list[str], out_col: str) -> pd.DataFrame:
    out = df.copy()
    grouped = out.groupby(unit_cols, dropna=False)[raw_col]
    out[out_col] = grouped.transform(lambda x: (x - x.mean()) / x.std(ddof=1) if x.notna().sum() > 1 and x.std(ddof=1) > 0 else np.nan)
    return out


def build_outcomes(raw: pd.DataFrame, claims: pd.DataFrame, quants: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    keep = completed_reviewers(raw)
    # Preregistered inclusion rule: define the analysis sample first, then construct and standardize
    # all outcomes within that included sample.
    eligible_raw = raw.merge(keep.assign(_eligible=1), on=["reviewer_id", "dossier_id"], how="inner")
    eligible_raw = eligible_raw.drop(columns="_eligible")

    claim_rows = explode_response_rows(eligible_raw, ["pre_claim_warranted", "post_claim_warranted"])
    if not claim_rows.empty:
        claim_rows["response"] = claim_rows["response"].map(as_number)
        claim_rows = claim_rows.merge(claims[["policy_id", "claim_id", "claim_v", "policy_claim"]], on=["policy_id", "claim_id"], how="left")
        claim_rows["oriented"] = claim_rows["response"] * claim_rows["claim_v"]
        claim_wide = claim_rows.pivot_table(
            index=["reviewer_id", "dossier_id", "policy_id", "claim_id", "policy_claim"],
            columns="phase",
            values="oriented",
            aggfunc="first",
        ).reset_index()
        claim_wide["delta_w_raw"] = claim_wide.get("post") - claim_wide.get("pre")
        claim_wide = standardize_change(claim_wide, "delta_w_raw", ["policy_id", "claim_id"], "delta_w")
    else:
        claim_wide = pd.DataFrame()

    quant_rows = explode_response_rows(eligible_raw, ["pre_quant_beliefs", "post_quant_beliefs"])
    if not quant_rows.empty:
        quant_rows["response"] = quant_rows["response"].map(as_number)
        quant_rows = quant_rows.merge(
            quants[["policy_id", "claim_id", "question_id", "quant_s", "policy_claim", "policy_question"]],
            on=["policy_id", "claim_id", "question_id"],
            how="left",
        )
        quant_rows["oriented"] = quant_rows["response"] * quant_rows["quant_s"]
        quant_wide = quant_rows.pivot_table(
            index=["reviewer_id", "dossier_id", "policy_id", "claim_id", "question_id", "policy_claim", "policy_question"],
            columns="phase",
            values="oriented",
            aggfunc="first",
        ).reset_index()
        quant_wide["delta_b_raw"] = quant_wide.get("post") - quant_wide.get("pre")
        quant_wide = standardize_change(quant_wide, "delta_b_raw", ["policy_id", "question_id"], "delta_b_question")
        quant_claim = (
            quant_wide.groupby(["reviewer_id", "dossier_id", "policy_id", "claim_id", "policy_claim"], dropna=False)["delta_b_question"]
            .mean()
            .reset_index(name="delta_b")
        )
    else:
        quant_wide = pd.DataFrame()
        quant_claim = pd.DataFrame()

    support_rows = eligible_raw.loc[eligible_raw["page_type"].isin(["pre_policy_support", "post_policy_support"])].copy()
    if not support_rows.empty:
        support_rows["phase"] = support_rows["page_type"].str.replace("_policy_support", "", regex=False)
        support_rows["support_oriented"] = support_rows["own_policy_support"].map(as_number)
        support_wide = support_rows.pivot_table(
            index=["reviewer_id", "dossier_id", "policy_id_any"],
            columns="phase",
            values="support_oriented",
            aggfunc="first",
        ).reset_index().rename(columns={"policy_id_any": "policy_id"})
        support_wide["delta_support_raw"] = support_wide.get("post") - support_wide.get("pre")
        support_wide = standardize_change(support_wide, "delta_support_raw", ["policy_id"], "delta_support")
    else:
        support_wide = pd.DataFrame()

    return claim_wide, quant_claim, support_wide


def build_predictors(
    dossiers: pd.DataFrame,
    exposure_long: pd.DataFrame,
    process_long: pd.DataFrame,
    claims: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    exp = exposure_long.loc[exposure_long["policy_direction"].isin(["pro", "con"])].copy()
    exp_wide = exp.pivot_table(
        index=["dossier_id", "policy_id", "claim_id", "policy_claim"],
        columns="policy_direction",
        values="shown",
        aggfunc="max",
        fill_value=0,
    ).reset_index().rename(columns={"pro": "Pro_shown", "con": "Con_shown"})
    markers = exposure_long.loc[exposure_long["policy_direction"].eq("claim_marker"), ["dossier_id", "policy_id", "claim_id", "ClaimCongenial"]]
    exp_wide = exp_wide.merge(markers, on=["dossier_id", "policy_id", "claim_id"], how="left")
    exp_wide = exp_wide.merge(dossiers[["dossier_id", "Adv", "advocate_position"]], on="dossier_id", how="left")
    exp_wide = exp_wide.merge(claims[["policy_id", "claim_id", "claim_v"]], on=["policy_id", "claim_id"], how="left")
    exp_wide["Adv_Pro"] = exp_wide["Adv"] * exp_wide["Pro_shown"]
    exp_wide["Adv_Con"] = exp_wide["Adv"] * exp_wide["Con_shown"]
    exp_wide["Pro_CC"] = exp_wide["Pro_shown"] * exp_wide["ClaimCongenial"]
    exp_wide["Con_CC"] = exp_wide["Con_shown"] * exp_wide["ClaimCongenial"]
    exp_wide["Adv_Pro_CC"] = exp_wide["Adv"] * exp_wide["Pro_shown"] * exp_wide["ClaimCongenial"]
    exp_wide["Adv_Con_CC"] = exp_wide["Adv"] * exp_wide["Con_shown"] * exp_wide["ClaimCongenial"]

    proc_parts = []
    if not process_long.empty:
        for direction, prefix in [("pro", "ProProc"), ("con", "ConProc")]:
            part = process_long.loc[process_long["policy_direction"].eq(direction)].copy()
            cols = ["dossier_id", "policy_id", "claim_id"] + PROCESS_MEASURES
            part = part[cols].rename(columns={m: f"{prefix}_{m}" for m in PROCESS_MEASURES})
            proc_parts.append(part)
        proc_wide = proc_parts[0].merge(proc_parts[1], on=["dossier_id", "policy_id", "claim_id"], how="outer") if len(proc_parts) == 2 else pd.DataFrame()
        exp_wide = exp_wide.merge(proc_wide, on=["dossier_id", "policy_id", "claim_id"], how="left")
    for col in process_cols():
        if col not in exp_wide:
            exp_wide[col] = 0.0
        exp_wide[col] = exp_wide[col].fillna(0.0)

    policy = exp_wide.groupby(["dossier_id", "policy_id"], dropna=False).agg(
        Adv=("Adv", "first"),
        advocate_position=("advocate_position", "first"),
        Pro_count=("Pro_shown", "sum"),
        Con_count=("Con_shown", "sum"),
        Pro_cong=("Pro_CC", "sum"),
        Con_cong=("Con_CC", "sum"),
    ).reset_index()
    policy["Adv_Pro_count"] = policy["Adv"] * policy["Pro_count"]
    policy["Adv_Con_count"] = policy["Adv"] * policy["Con_count"]
    for col in process_cols():
        policy[col.replace("Proc_", "ProcPolicy_")] = exp_wide.groupby(["dossier_id", "policy_id"], dropna=False)[col].sum().values
    return exp_wide, policy


def process_cols(measures: list[str] | None = None, policy: bool = False) -> list[str]:
    measures = measures or PROCESS_MEASURES
    mid = "ProcPolicy" if policy else "Proc"
    return [f"Pro{mid}_{m}" for m in measures] + [f"Con{mid}_{m}" for m in measures]


def merge_analysis_frames(
    claim_outcomes: pd.DataFrame,
    quant_outcomes: pd.DataFrame,
    support_outcomes: pd.DataFrame,
    claim_predictors: pd.DataFrame,
    policy_predictors: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    claim = claim_outcomes.merge(claim_predictors, on=["dossier_id", "policy_id", "claim_id", "policy_claim"], how="inner") if not claim_outcomes.empty else pd.DataFrame()
    quant = quant_outcomes.merge(claim_predictors, on=["dossier_id", "policy_id", "claim_id", "policy_claim"], how="inner") if not quant_outcomes.empty else pd.DataFrame()
    support = support_outcomes.merge(policy_predictors, on=["dossier_id", "policy_id"], how="inner") if not support_outcomes.empty else pd.DataFrame()
    return claim, quant, support


def fit_model(df: pd.DataFrame, formula: str, cluster: str = "dossier_id"):
    use = df.copy()
    needed = set()
    try:
        y, x = patsy.dmatrices(formula, use, return_type="dataframe")
        used_index = y.index.intersection(x.index)
        y = y.loc[used_index]
        x = x.loc[used_index]
    except Exception as exc:
        return None, f"Could not build model matrix: {exc}"
    if len(y) < 8:
        return None, f"Too few usable observations ({len(y)})."
    groups = use.loc[y.index, cluster].astype(str) if cluster in use else pd.Series(np.arange(len(y)), index=y.index).astype(str)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = sm.OLS(y, x).fit(cov_type="cluster", cov_kwds={"groups": groups, "use_correction": True})
        return model, None
    except Exception as exc:
        return None, f"Regression failed: {exc}"


def one_sided_p(estimate: float, se: float, direction: str) -> tuple[float, float]:
    if not np.isfinite(estimate) or not np.isfinite(se) or se <= 0:
        return np.nan, np.nan
    z = estimate / se
    if direction == "negative":
        p = st.norm.cdf(z)
    else:
        p = 1 - st.norm.cdf(z)
    return z, p


def contrast_from_model(model, weights: dict[str, float]) -> tuple[float, float]:
    names = list(model.params.index)
    w = np.zeros(len(names))
    for term, val in weights.items():
        if term not in names:
            return np.nan, np.nan
        w[names.index(term)] = val
    params = np.asarray(model.params.values, dtype=float)
    cov = np.asarray(model.cov_params(), dtype=float)
    with np.errstate(all="ignore"):
        estimate = float(np.dot(w, params))
        var = float(np.dot(w, np.dot(cov, w)))
    se = math.sqrt(var) if np.isfinite(var) and var >= 0 else np.nan
    return estimate, se


def report_model(title: str, df: pd.DataFrame, formula: str, tests: list[TestSpec], cluster: str = "dossier_id"):
    print_subhead(title)
    print(f"Formula: {formula}")
    print(f"Usable rows before listwise deletion: {len(df)}")
    model, err = fit_model(df, formula, cluster=cluster)
    if err:
        print(f"Skipped: {err}")
        return None
    print(f"Usable rows in model: {int(model.nobs)}")
    print(f"Clusters: {df.loc[model.model.data.row_labels, cluster].nunique() if cluster in df else 'not used'}")
    rows = []
    for test in tests:
        if test.contrast:
            est, se = contrast_from_model(model, test.contrast)
        elif test.term and test.term in model.params.index:
            est = float(model.params[test.term])
            se = float(model.bse[test.term])
        else:
            rows.append({"test": test.label, "estimate": np.nan, "se": np.nan, "z": np.nan, "one_sided_p": np.nan, "note": "term not estimable"})
            continue
        z, p = one_sided_p(est, se, test.direction)
        rows.append({"test": test.label, "estimate": est, "se": se, "z": z, "one_sided_p": p, "note": ""})
    print(pd.DataFrame(rows).to_string(index=False, float_format=lambda x: f"{x: .4f}"))
    return model


def fit_mixed_model(df: pd.DataFrame, formula: str, group: str = "reviewer_id"):
    if df.empty:
        return None, "No observations."
    if group not in df:
        return None, f"Grouping variable {group!r} is missing."
    try:
        y, x = patsy.dmatrices(formula, df, return_type="dataframe")
        idx = y.index.intersection(x.index)
    except Exception as exc:
        return None, f"Could not build model matrix: {exc}"
    use = df.loc[idx].copy()
    if len(use) < 20:
        return None, f"Too few usable observations ({len(use)})."
    if use[group].nunique() < 5:
        return None, f"Too few {group} groups ({use[group].nunique()})."
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            md = smf.mixedlm(formula, data=use, groups=use[group], re_formula="1", missing="drop")
            candidates = []
            for method, maxiter in [("lbfgs", 1000), ("powell", 2000)]:
                try:
                    fitted = md.fit(reml=False, method=method, maxiter=maxiter, disp=False)
                    if bool(getattr(fitted, "converged", False)) and np.isfinite(fitted.llf):
                        candidates.append(fitted)
                except Exception:
                    pass
            if not candidates:
                raise RuntimeError("No mixed-model optimizer converged.")
            model = max(candidates, key=lambda fitted: fitted.llf)
        return model, None
    except Exception as exc:
        return None, f"Mixed-effects regression failed: {exc}"


def report_mixed_model(title: str, df: pd.DataFrame, formula: str, tests: list[TestSpec], group: str = "reviewer_id"):
    print_subhead(title)
    print(f"Formula: {formula}")
    print(f"Random effect: intercept for {group}")
    model, err = fit_mixed_model(df, formula, group=group)
    if err:
        print(f"Skipped: {err}")
        return None
    print(f"Usable rows in model: {int(model.nobs)}")
    print(f"Groups: {df.loc[model.model.data.row_labels, group].nunique() if hasattr(model.model.data, 'row_labels') else df[group].nunique()}")
    rows = []
    for test in tests:
        if test.contrast:
            est, se = contrast_from_model(model, test.contrast)
        elif test.term and test.term in model.params.index:
            est = float(model.params[test.term])
            se = float(model.bse[test.term])
        else:
            rows.append({"test": test.label, "estimate": np.nan, "se": np.nan, "z": np.nan, "one_sided_p": np.nan, "note": "term not estimable"})
            continue
        z, p = one_sided_p(est, se, test.direction)
        rows.append({"test": test.label, "estimate": est, "se": se, "z": z, "one_sided_p": p, "note": ""})
    print(pd.DataFrame(rows).to_string(index=False, float_format=lambda x: f"{x: .4f}"))
    return model


def stacked_attenuation(
    title: str,
    df: pd.DataFrame,
    y: str,
    base_rhs: str,
    aug_rhs: str,
    contrasts: list[TestSpec],
    cluster: str = "dossier_id",
):
    print_subhead(title)
    print(f"Baseline:  {y} ~ {base_rhs}")
    print(f"Augmented: {y} ~ {aug_rhs}")
    try:
        yb, xb = patsy.dmatrices(f"{y} ~ {base_rhs}", df, return_type="dataframe")
        ya, xa = patsy.dmatrices(f"{y} ~ {aug_rhs}", df, return_type="dataframe")
        common_idx = yb.index.intersection(ya.index)
        yb, xb = yb.loc[common_idx], xb.loc[common_idx]
        ya, xa = ya.loc[common_idx], xa.loc[common_idx]
        if len(common_idx) < 8:
            print(f"Skipped: too few usable observations ({len(common_idx)}).")
            return None
        xb.columns = [f"base::{c}" for c in xb.columns]
        xa.columns = [f"aug::{c}" for c in xa.columns]
        top = pd.concat([xb, pd.DataFrame(0.0, index=xb.index, columns=xa.columns)], axis=1)
        bottom = pd.concat([pd.DataFrame(0.0, index=xa.index, columns=xb.columns), xa], axis=1)
        xstack = pd.concat([top, bottom], axis=0)
        ystack = pd.concat([yb, ya], axis=0)
        groups = pd.concat([df.loc[common_idx, cluster].astype(str), df.loc[common_idx, cluster].astype(str)], axis=0)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = sm.OLS(ystack, xstack).fit(cov_type="cluster", cov_kwds={"groups": groups, "use_correction": True})
    except Exception as exc:
        print(f"Skipped: stacked regression failed: {exc}")
        return None
    print(f"Usable rows per equation: {len(common_idx)}")
    print(f"Clusters: {df.loc[common_idx, cluster].nunique()}")
    rows = []
    for test in contrasts:
        weights = {f"base::{k}" if not k.startswith(("base::", "aug::")) else k: v for k, v in (test.contrast or {}).items()}
        est, se = contrast_from_model(model, weights)
        z, p = one_sided_p(est, se, test.direction)
        rows.append({"test": test.label, "estimate": est, "se": se, "z": z, "one_sided_p": p})
    print(pd.DataFrame(rows).to_string(index=False, float_format=lambda x: f"{x: .4f}"))
    return model


def summarize_inputs(stimuli_path, dossier_paths, csv_paths, policies, claims, dossiers, raw, claim, quant, support):
    print_header("Policy Reviewer Preregistration Analysis")
    print("This report is generated from files in the same folder as the Python script.")
    print(f"Folder: {SCRIPT_DIR}")
    print("\nFiles used:")
    print(f"  Stimuli JSON: {stimuli_path.name}")
    print("  Dossier JSON files:")
    for p in dossier_paths:
        print(f"    - {p.name}")
    print("  Reviewer CSV files:")
    for p in csv_paths:
        print(f"    - {p.name}")

    print_header("Variable Construction")
    print("Reviewer outcomes are oriented so higher values mean more policy-supportive beliefs.")
    print("Raw change = post-review oriented response minus pre-review oriented response.")
    print("Primary outcomes are z-scores of raw change scores within the relevant unit:")
    print("  claim warrantedness: within policy-claim")
    print("  quantitative beliefs: within policy-question, then averaged to policy-claim")
    print("  policy support: within policy")
    print("Adv = 1 for pro-policy advocates and 0 for anti-policy advocates.")
    print("Pro_shown and Con_shown indicate whether the advocate was shown pro-policy or anti-policy evidence for a claim.")
    print("ClaimCongenial = 1 when accepting the claim supports the advocate's assigned side.")
    print("Process variables are built from advocate fact-level behavior, separately for pro-policy and anti-policy evidence.")

    print_header("Basic Summary")
    print("\nPolicies:")
    print(policies.to_string(index=False))
    print("\nReviewer log rows by CSV after cross-export deduplication:")
    print(raw.groupby("source_csv").size().reset_index(name="rows").to_string(index=False))
    print(f"Duplicate trial rows removed across cumulative/overlapping exports: {raw.attrs.get('duplicate_rows_removed', 0)}")
    print("\nReviewer page counts:")
    print(raw["page_type"].value_counts().head(40).to_string())
    print("\nDossiers:")
    print(dossiers.groupby(["policy_id", "advocate_position"], dropna=False).size().reset_index(name="n_dossiers").to_string(index=False))
    print("\nAnalysis rows:")
    rows = [
        {"frame": "claim warrantedness updating", "rows": len(claim), "reviewers": claim["reviewer_id"].nunique() if not claim.empty else 0, "dossiers": claim["dossier_id"].nunique() if not claim.empty else 0},
        {"frame": "quantitative updating", "rows": len(quant), "reviewers": quant["reviewer_id"].nunique() if not quant.empty else 0, "dossiers": quant["dossier_id"].nunique() if not quant.empty else 0},
        {"frame": "policy support updating", "rows": len(support), "reviewers": support["reviewer_id"].nunique() if not support.empty else 0, "dossiers": support["dossier_id"].nunique() if not support.empty else 0},
    ]
    print(pd.DataFrame(rows).to_string(index=False))
    for name, df, y in [("Claim warrantedness", claim, "delta_w"), ("Quantitative beliefs", quant, "delta_b"), ("Policy support", support, "delta_support")]:
        if not df.empty and y in df:
            print(f"\n{name} outcome summary:")
            print(df.groupby("policy_id")[y].agg(["count", "mean", "std", "min", "max"]).to_string(float_format=lambda x: f"{x: .4f}"))


def run_primary_models(claim, quant, support):
    fe_claim = "C(policy_claim)"
    fe_policy = "C(policy_id)"
    base_claim_rhs = f"Adv + Pro_shown + Con_shown + {fe_claim}"
    base_policy_rhs = f"Adv + Pro_count + Con_count + {fe_policy}"
    cc_claim_rhs = f"Adv + Pro_shown + Con_shown + ClaimCongenial + Pro_CC + Con_CC + {fe_claim}"
    cc_policy_rhs = f"Adv + Pro_count + Con_count + Pro_cong + Con_cong + {fe_policy}"
    ev_claim_rhs = f"Adv + Pro_shown + Con_shown + Adv_Pro + Adv_Con + {fe_claim}"
    ev_policy_rhs = f"Adv + Pro_count + Con_count + Adv_Pro_count + Adv_Con_count + {fe_policy}"
    mod_claim_rhs = f"Adv + Pro_shown + Con_shown + ClaimCongenial + Adv_Pro + Adv_Con + Adv_Pro_CC + Adv_Con_CC + {fe_claim}"

    print_header("H1. Advocacy Effects")
    tests_base_claim = [
        TestSpec("Advocacy effect: beta_A > 0", "Adv", "positive"),
        TestSpec("Pro evidence: beta_Pro > 0", "Pro_shown", "positive"),
        TestSpec("Con evidence: beta_Con < 0", "Con_shown", "negative"),
    ]
    report_model("Claim warrantedness updating", claim, f"delta_w ~ {base_claim_rhs}", tests_base_claim)
    report_model("Quantitative updating", quant, f"delta_b ~ {base_claim_rhs}", tests_base_claim)
    tests_base_policy = [
        TestSpec("Advocacy effect: beta_A > 0", "Adv", "positive"),
        TestSpec("Pro evidence count: beta_Pro > 0", "Pro_count", "positive"),
        TestSpec("Con evidence count: beta_Con < 0", "Con_count", "negative"),
    ]
    report_model("Policy-support updating", support, f"delta_support ~ {base_policy_rhs}", tests_base_policy)

    print_header("H2. Claim-Congenial Asymmetric Updating")
    tests_cc_claim = [
        TestSpec("Pro claim-congenial interaction: gamma_ProCC > 0", "Pro_CC", "positive"),
        TestSpec("Con claim-congenial interaction: gamma_ConCC < 0", "Con_CC", "negative"),
        TestSpec("Composite: gamma_ProCC - gamma_ConCC > 0", contrast={"Pro_CC": 1, "Con_CC": -1}, direction="positive"),
    ]
    report_model("Claim warrantedness updating", claim, f"delta_w ~ {cc_claim_rhs}", tests_cc_claim)
    report_model("Quantitative updating", quant, f"delta_b ~ {cc_claim_rhs}", tests_cc_claim)
    tests_cc_policy = [
        TestSpec("Pro claim-congenial count: gamma_ProCC > 0", "Pro_cong", "positive"),
        TestSpec("Con claim-congenial count: gamma_ConCC < 0", "Con_cong", "negative"),
        TestSpec("Composite: gamma_ProCC - gamma_ConCC > 0", contrast={"Pro_cong": 1, "Con_cong": -1}, direction="positive"),
    ]
    report_model("Policy-support updating", support, f"delta_support ~ {cc_policy_rhs}", tests_cc_policy)

    print_header("H3. Evidence-Congenial Asymmetric Updating")
    tests_ev_claim = [
        TestSpec("Pro evidence-congenial interaction: gamma_Pro > 0", "Adv_Pro", "positive"),
        TestSpec("Con evidence-congenial interaction: gamma_Con > 0", "Adv_Con", "positive"),
        TestSpec("Composite: gamma_Pro + gamma_Con > 0", contrast={"Adv_Pro": 1, "Adv_Con": 1}, direction="positive"),
    ]
    report_model("Claim warrantedness updating", claim, f"delta_w ~ {ev_claim_rhs}", tests_ev_claim)
    report_model("Quantitative updating", quant, f"delta_b ~ {ev_claim_rhs}", tests_ev_claim)
    tests_ev_policy = [
        TestSpec("Pro count evidence-congenial interaction: gamma_Pro > 0", "Adv_Pro_count", "positive"),
        TestSpec("Con count evidence-congenial interaction: gamma_Con > 0", "Adv_Con_count", "positive"),
        TestSpec("Composite: gamma_Pro + gamma_Con > 0", contrast={"Adv_Pro_count": 1, "Adv_Con_count": 1}, direction="positive"),
    ]
    report_model("Policy-support updating", support, f"delta_support ~ {ev_policy_rhs}", tests_ev_policy)

    print_header("H3 Moderator. Evidence-Congenial Updating Within Congenial Claims")
    report_model("Claim warrantedness, ClaimCongenial = 1", claim.loc[claim["ClaimCongenial"].eq(1)], f"delta_w ~ {ev_claim_rhs}", tests_ev_claim)
    report_model("Quantitative updating, ClaimCongenial = 1", quant.loc[quant["ClaimCongenial"].eq(1)], f"delta_b ~ {ev_claim_rhs}", tests_ev_claim)
    tests_mod = [
        TestSpec("Triple interaction: delta_Pro > 0", "Adv_Pro_CC", "positive"),
        TestSpec("Triple interaction: delta_Con > 0", "Adv_Con_CC", "positive"),
    ]
    report_model("Claim warrantedness full-sample moderation", claim, f"delta_w ~ {mod_claim_rhs}", tests_mod)
    report_model("Quantitative full-sample moderation", quant, f"delta_b ~ {mod_claim_rhs}", tests_mod)

    return {
        "base_claim_rhs": base_claim_rhs,
        "base_policy_rhs": base_policy_rhs,
        "cc_claim_rhs": cc_claim_rhs,
        "cc_policy_rhs": cc_policy_rhs,
        "ev_claim_rhs": ev_claim_rhs,
        "ev_policy_rhs": ev_policy_rhs,
    }


def run_mixed_effects_robustness(claim, quant, rhs):
    print_header("Mixed-Effects Robustness Checks (Preregistered Secondary Analyses)")
    print("Claim-level and quantitative models use a reviewer random intercept to account for repeated claims within reviewer.")
    print("Policy-support updating has one observation per reviewer, so no reviewer-level mixed model is informative for that outcome.")

    tests_base = [
        TestSpec("Advocacy effect: beta_A > 0", "Adv", "positive"),
        TestSpec("Pro evidence: beta_Pro > 0", "Pro_shown", "positive"),
        TestSpec("Con evidence: beta_Con < 0", "Con_shown", "negative"),
    ]
    tests_cc = [
        TestSpec("Pro claim-congenial interaction: gamma_ProCC > 0", "Pro_CC", "positive"),
        TestSpec("Con claim-congenial interaction: gamma_ConCC < 0", "Con_CC", "negative"),
        TestSpec("Composite: gamma_ProCC - gamma_ConCC > 0", contrast={"Pro_CC": 1, "Con_CC": -1}, direction="positive"),
    ]
    tests_ev = [
        TestSpec("Pro evidence-congenial interaction: gamma_Pro > 0", "Adv_Pro", "positive"),
        TestSpec("Con evidence-congenial interaction: gamma_Con > 0", "Adv_Con", "positive"),
        TestSpec("Composite: gamma_Pro + gamma_Con > 0", contrast={"Adv_Pro": 1, "Adv_Con": 1}, direction="positive"),
    ]
    mod_rhs = "Adv + Pro_shown + Con_shown + ClaimCongenial + Adv_Pro + Adv_Con + Adv_Pro_CC + Adv_Con_CC + C(policy_claim)"
    tests_mod = [
        TestSpec("Triple interaction: delta_Pro > 0", "Adv_Pro_CC", "positive"),
        TestSpec("Triple interaction: delta_Con > 0", "Adv_Con_CC", "positive"),
    ]

    for label, df, y in [("Claim warrantedness", claim, "delta_w"), ("Quantitative updating", quant, "delta_b")]:
        report_mixed_model(f"{label}: H1 advocacy model", df, f"{y} ~ {rhs['base_claim_rhs']}", tests_base)
        report_mixed_model(f"{label}: H2 claim-congenial model", df, f"{y} ~ {rhs['cc_claim_rhs']}", tests_cc)
        report_mixed_model(f"{label}: H3 evidence-congenial model", df, f"{y} ~ {rhs['ev_claim_rhs']}", tests_ev)
        congenial = df.loc[df["ClaimCongenial"].eq(1)] if not df.empty else df
        report_mixed_model(f"{label}: H3 within congenial claims", congenial, f"{y} ~ {rhs['ev_claim_rhs']}", tests_ev)
        report_mixed_model(f"{label}: H3 full-sample moderation", df, f"{y} ~ {mod_rhs}", tests_mod)


def process_directional_tests(measures: list[str], policy: bool = False) -> list[TestSpec]:
    mid = "ProcPolicy" if policy else "Proc"
    tests: list[TestSpec] = []
    for m in measures:
        tests.append(TestSpec(f"Pro-policy {m}: coefficient > 0", f"Pro{mid}_{m}", "positive"))
        tests.append(TestSpec(f"Anti-policy {m}: coefficient < 0", f"Con{mid}_{m}", "negative"))
    tests.append(TestSpec("Residual advocacy effect after process controls: beta_A > 0", "Adv", "positive"))
    return tests


def run_process_models(claim, quant, support, rhs):
    print_header("H4. Advocate Process as Mediator of Reviewer Updating")
    print("Process coefficients are included as pro-policy and anti-policy versions of each advocate process measure.")
    for subset_name, measures in PROCESS_SUBSETS.items():
        claim_proc = " + ".join(process_cols(measures))
        policy_proc = " + ".join(process_cols(measures, policy=True))
        print_header(f"Process Subset: {subset_name}")

        report_model(
            "Process-to-reviewer judgment: claim warrantedness",
            claim,
            f"delta_w ~ {rhs['base_claim_rhs']} + {claim_proc}",
            process_directional_tests(measures, policy=False),
        )
        report_model(
            "Process-to-reviewer judgment: quantitative updating",
            quant,
            f"delta_b ~ {rhs['base_claim_rhs']} + {claim_proc}",
            process_directional_tests(measures, policy=False),
        )
        report_model(
            "Process-to-reviewer judgment: policy support",
            support,
            f"delta_support ~ {rhs['base_policy_rhs']} + {policy_proc}",
            process_directional_tests(measures, policy=True),
        )

        stacked_attenuation(
            "Attenuation of advocacy effect: claim warrantedness",
            claim,
            "delta_w",
            rhs["base_claim_rhs"],
            f"{rhs['base_claim_rhs']} + {claim_proc}",
            [TestSpec("beta_A_base - beta_A_aug > 0", contrast={"base::Adv": 1, "aug::Adv": -1}, direction="positive")],
        )
        stacked_attenuation(
            "Attenuation of advocacy effect: quantitative updating",
            quant,
            "delta_b",
            rhs["base_claim_rhs"],
            f"{rhs['base_claim_rhs']} + {claim_proc}",
            [TestSpec("beta_A_base - beta_A_aug > 0", contrast={"base::Adv": 1, "aug::Adv": -1}, direction="positive")],
        )
        stacked_attenuation(
            "Attenuation of advocacy effect: policy support",
            support,
            "delta_support",
            rhs["base_policy_rhs"],
            f"{rhs['base_policy_rhs']} + {policy_proc}",
            [TestSpec("beta_A_base - beta_A_aug > 0", contrast={"base::Adv": 1, "aug::Adv": -1}, direction="positive")],
        )

        ev_contrasts = [
            TestSpec("gamma_Pro_base - gamma_Pro_aug > 0", contrast={"base::Adv_Pro": 1, "aug::Adv_Pro": -1}, direction="positive"),
            TestSpec("gamma_Con_base - gamma_Con_aug > 0", contrast={"base::Adv_Con": 1, "aug::Adv_Con": -1}, direction="positive"),
        ]
        stacked_attenuation(
            "Attenuation of evidence-congenial updating: claim warrantedness",
            claim,
            "delta_w",
            rhs["ev_claim_rhs"],
            f"{rhs['ev_claim_rhs']} + {claim_proc}",
            ev_contrasts,
        )
        stacked_attenuation(
            "Attenuation of evidence-congenial updating: quantitative updating",
            quant,
            "delta_b",
            rhs["ev_claim_rhs"],
            f"{rhs['ev_claim_rhs']} + {claim_proc}",
            ev_contrasts,
        )
        cc_contrasts = [
            TestSpec("gamma_ProCC_base - gamma_ProCC_aug > 0", contrast={"base::Pro_CC": 1, "aug::Pro_CC": -1}, direction="positive"),
            TestSpec("gamma_ConCC_aug - gamma_ConCC_base > 0", contrast={"aug::Con_CC": 1, "base::Con_CC": -1}, direction="positive"),
        ]
        stacked_attenuation(
            "Attenuation of claim-congenial updating: claim warrantedness",
            claim,
            "delta_w",
            rhs["cc_claim_rhs"],
            f"{rhs['cc_claim_rhs']} + {claim_proc}",
            cc_contrasts,
        )
        stacked_attenuation(
            "Attenuation of claim-congenial updating: quantitative updating",
            quant,
            "delta_b",
            rhs["cc_claim_rhs"],
            f"{rhs['cc_claim_rhs']} + {claim_proc}",
            cc_contrasts,
        )


def main() -> int:
    pd.set_option("display.width", PDISPLAY["display.width"])
    pd.set_option("display.max_columns", PDISPLAY["display.max_columns"])
    try:
        stimuli_path, dossier_paths, csv_paths = find_input_files(SCRIPT_DIR)
        policies, claims, facts, quants = load_stimuli(stimuli_path)
        dossiers, exposure_long, process_long = load_dossiers(dossier_paths, facts, claims)
        raw = load_reviewer_csvs(csv_paths)
        claim_outcomes, quant_outcomes, support_outcomes = build_outcomes(raw, claims, quants)
        claim_predictors, policy_predictors = build_predictors(dossiers, exposure_long, process_long, claims)
        claim, quant, support = merge_analysis_frames(claim_outcomes, quant_outcomes, support_outcomes, claim_predictors, policy_predictors)
        summarize_inputs(stimuli_path, dossier_paths, csv_paths, policies, claims, dossiers, raw, claim, quant, support)
        rhs = run_primary_models(claim, quant, support)
        run_process_models(claim, quant, support, rhs)
        run_mixed_effects_robustness(claim, quant, rhs)
        print_header("Done")
        print("Report complete. Review any skipped models above; skips usually mean too few rows or collinearity in a small pilot sample.")
        return 0
    except Exception as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
