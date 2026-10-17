"""Apply the repository's documented public-data minimization rules.

This script operates only on the prospective public repository copies.  The
restricted source exports are not part of this repository and are not touched.
It is idempotent so authors can rerun it before a public release.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
STUDIES = ROOT / "studies"


def rewrite_csv(path: Path, *, rename: dict[str, str] | None = None,
                drop: list[str] | None = None, keep: list[str] | None = None) -> None:
    data = pd.read_csv(path, low_memory=False)
    if rename:
        data = data.rename(columns={k: v for k, v in rename.items() if k in data})
    if keep is not None:
        data = data[[c for c in keep if c in data]].copy()
    if drop:
        data = data.drop(columns=[c for c in drop if c in data], errors="ignore")
    data.to_csv(path, index=False)


def minimize_study_1() -> None:
    path = STUDIES / "study_1_sticks" / "data" / "study1_main_analysis_data.csv"
    rewrite_csv(
        path,
        rename={"prolific_pid": "participant_id"},
        keep=[
            "trial_type", "participant_id", "censored_direction",
            "N_Sticks_Covered", "estimate", "stick_lengths", "stick_covered",
        ],
    )


def minimize_study_4_csv() -> None:
    path = STUDIES / "study_4_policy_audiences" / "data" / "study4_main_analysis_data.csv"
    rewrite_csv(
        path,
        drop=[
            "PROLIFIC_PID", "SESSION_ID", "STUDY_ID", "run_id", "stimulus",
            "source_file", "recorded_at", "ip", "browser", "browser_version",
            "device", "platform", "platform_version", "user_agent", "referer",
            "feedback", "argument_text", "prolific_completion_code",
            "assignment_service_error",
        ],
    )


def minimize_study_4_dossiers() -> None:
    folder = STUDIES / "study_4_policy_audiences" / "experiment"
    names = [
        "carbon_pricing_advocate_dossiers.json",
        "minimum_wage_advocate_dossiers.json",
    ]
    fact_fields = [
        "fact_id", "fact_relation_to_policy", "open_count", "total_open_ms",
        "source_open_count", "source_total_open_ms", "used", "attached",
        "inserted", "activated",
    ]
    sampler_fields = [
        "claim_id", "supports_claim_seen", "opposes_claim_seen",
        "supports_claim_fact_ids", "opposes_claim_fact_ids",
    ]
    for name in names:
        path = folder / name
        source = json.loads(path.read_text(encoding="utf-8"))
        dossiers = []
        for dossier in source.get("dossiers", []):
            exposure = dossier.get("evidence_exposure", {}) or {}
            fact_level = (dossier.get("advocate_process", {}) or {}).get("fact_level", []) or []
            dossiers.append(
                {
                    "dossier_id": dossier.get("dossier_id"),
                    "policy_id": dossier.get("policy_id"),
                    "policy_name": dossier.get("policy_name"),
                    "advocate_position": dossier.get("advocate_position"),
                    "argument_word_count": dossier.get("argument_word_count"),
                    "evidence_exposure": {
                        "facts_shown_ids": exposure.get("facts_shown_ids", []),
                        "sampler_side_selections": [
                            {k: item.get(k) for k in sampler_fields}
                            for item in (exposure.get("sampler_side_selections", []) or [])
                        ],
                    },
                    "advocate_process": {
                        "fact_level": [
                            {k: row.get(k) for k in fact_fields}
                            for row in fact_level
                        ]
                    },
                }
            )
        public = {
            "schema": "public-analysis-dossiers-v1",
            "privacy_note": (
                "Contains only anonymous dossier keys, randomized exposure, and "
                "derived behavioral process fields required by the analysis."
            ),
            "dossiers": dossiers,
        }
        path.write_text(json.dumps(public, indent=2) + "\n", encoding="utf-8")


def minimize_studies_5_and_6() -> None:
    s5 = STUDIES / "study_5_legal_advocates" / "data" / "study5_main_analysis_data.csv"
    rewrite_csv(s5, drop=["stimulus", "source_file"])
    s6 = STUDIES / "study_6_policy_advocates" / "data" / "study6_main_analysis_data.csv"
    rewrite_csv(
        s6,
        drop=[
            "PROLIFIC_PID", "SESSION_ID", "STUDY_ID", "run_id", "stimulus",
            "source_file", "recorded_at", "ip", "browser", "browser_version",
            "device", "platform", "platform_version", "user_agent", "referer",
            "feedback", "argument_text", "prolific_completion_code",
        ],
    )


def main() -> None:
    minimize_study_1()
    minimize_study_4_csv()
    minimize_study_4_dossiers()
    minimize_studies_5_and_6()
    print("Public analysis files minimized. Run privacy_audit.py and reproduce_all_main_results.py next.")


if __name__ == "__main__":
    main()
