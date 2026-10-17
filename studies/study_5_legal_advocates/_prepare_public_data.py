"""Create the de-identified canonical Study 5 input from a restricted export.

This script is not needed to reproduce the published results because the public
analysis-ready file is included. It documents the privacy transformation applied
after the manuscript's completion-first and assistance-screen exclusions.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


DROP_COLUMNS = {
    "recorded_at",
    "ip",
    "user_agent",
    "device",
    "browser",
    "browser_version",
    "platform",
    "platform_version",
    "referer",
    "accept_language",
    "STUDY_ID",
    "SESSION_ID",
    "study_id",
    "PROLIFIC_PID",
    "prolific_pid",
    "study_id_param",
    "session_id_param",
    "run_id",
    "prolific_completion_code",
    "prolific_redirect_url",
    "argument_text",
    "feedback",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("restricted_csv", type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "data" / "study5_main_analysis_data.csv",
    )
    args = parser.parse_args()

    data = pd.read_csv(args.restricted_csv, low_memory=False)
    pid_source = data.get("PROLIFIC_PID", data.get("prolific_pid"))
    if pid_source is None:
        raise ValueError("The restricted export has no participant identifier column.")

    original_ids = pid_source.astype(str).str.strip()
    unique_ids = sorted(original_ids.dropna().unique())
    id_map = {value: f"S5P{index:03d}" for index, value in enumerate(unique_ids, start=1)}
    anonymous_ids = original_ids.map(id_map)
    data["participant_id"] = anonymous_ids
    data = data.drop(columns=[column for column in DROP_COLUMNS if column in data], errors="ignore")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(args.output, index=False)
    print(f"Wrote {len(data):,} rows for {anonymous_ids.nunique():,} participants to {args.output}")


if __name__ == "__main__":
    main()
