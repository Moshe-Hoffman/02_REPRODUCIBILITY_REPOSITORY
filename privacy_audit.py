"""Fail-closed privacy/disclosure audit for prospective public files."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "privacy_audit_report.csv"
SUMMARY = ROOT / "privacy_audit_summary.txt"

PROHIBITED_KEYS = re.compile(
    r"(^|_)(prolific|session_id|study_id|ip|browser|device|user_agent|referer|"
    r"recorded_at|timestamp|feedback|argument_text|completion_code|source_file|"
    r"worker_id|email)($|_)", re.I
)
EMAIL = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
IPV4 = re.compile(r"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)")
PROLIFIC_LIKE = re.compile(r"\b[0-9a-f]{24}\b", re.I)


def add(rows: list[dict], path: Path, location: str, issue: str, severity: str) -> None:
    rows.append({
        "file": str(path.relative_to(ROOT)), "location": location,
        "issue": issue, "severity": severity,
    })


def scan_text(rows: list[dict], path: Path, location: str, text: str,
              *, allow_urls: bool = False) -> None:
    if EMAIL.search(text):
        add(rows, path, location, "email-like value", "high")
    if IPV4.search(text):
        add(rows, path, location, "IPv4-like value", "high")
    if PROLIFIC_LIKE.search(text):
        add(rows, path, location, "24-character hexadecimal identifier", "high")


def scan_json_value(rows: list[dict], path: Path, value, trail: str = "$",
                    *, stimulus_file: bool = False) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_trail = f"{trail}.{key}"
            if PROHIBITED_KEYS.search(str(key)):
                add(rows, path, child_trail, "prohibited sensitive/operational key", "high")
            scan_json_value(rows, path, child, child_trail, stimulus_file=stimulus_file)
    elif isinstance(value, list):
        for i, child in enumerate(value):
            scan_json_value(rows, path, child, f"{trail}[{i}]", stimulus_file=stimulus_file)
    elif isinstance(value, str):
        # Public source URLs in stimulus definitions are intentional and not PII.
        scan_text(rows, path, trail, value, allow_urls=stimulus_file)


def audit_csv(rows: list[dict], path: Path) -> None:
    data = pd.read_csv(path, dtype=str, keep_default_na=False, low_memory=False)
    for column in data.columns:
        if PROHIBITED_KEYS.search(column):
            add(rows, path, f"column:{column}", "prohibited sensitive/operational column", "high")
        for value in data[column]:
            if not value:
                continue
            scan_text(rows, path, f"column:{column}", value)


def audit_source(rows: list[dict], path: Path) -> None:
    text = path.read_text(encoding="utf-8", errors="replace")
    # Deployed completion codes and researcher contact addresses are task
    # materials, not participant data; flag them for explicit author awareness.
    if EMAIL.search(text):
        add(rows, path, "source", "researcher/contact email present", "review")
    api_key_matches = re.findall(
        r"api[_-]?key\s*[:=]\s*['\"]([^'\"]+)", text, re.I
    )
    for value in api_key_matches:
        if not value.upper().startswith(("REPLACE_WITH_", "PASTE_YOUR_")):
            add(rows, path, "source", "possible embedded API key", "high")
    if re.search(r"(?:secret|access[_-]?token|private[_-]?key)\s*[:=]\s*['\"][^'\"]+", text, re.I):
        add(rows, path, "source", "possible embedded secret/token", "high")


def main() -> int:
    rows: list[dict] = []
    for path in sorted((ROOT / "studies").glob("*/data/*.csv")):
        audit_csv(rows, path)
    for path in sorted((ROOT / "studies").glob("*/experiment/*.json")):
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            add(rows, path, "$", f"invalid JSON: {exc}", "high")
            continue
        scan_json_value(rows, path, obj, stimulus_file="stimuli" in path.name)
    for path in sorted((ROOT / "studies").glob("*/experiment/**/*")):
        # Bundled third-party browser libraries retain their upstream notices;
        # audit the study-authored source rather than vendor code.
        if "jspsych" in path.parts:
            continue
        if path.is_file() and path.suffix.lower() in {".js", ".html", ".css"}:
            audit_source(rows, path)

    with REPORT.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=["file", "location", "issue", "severity"])
        writer.writeheader()
        writer.writerows(rows)
    high = sum(row["severity"] == "high" for row in rows)
    review = sum(row["severity"] == "review" for row in rows)
    SUMMARY.write_text(
        "PUBLIC DISCLOSURE AUDIT\n"
        "=======================\n"
        f"High-risk findings: {high}\n"
        f"Author-review findings: {review}\n"
        f"Machine-readable report: {REPORT.name}\n\n"
        "The scan covers public CSV values, all nested public JSON fields, and "
        "common secret/contact patterns in deployed source files. Researcher "
        "contact emails in task code are review-only findings; they are not "
        "participant identifiers.\n",
        encoding="utf-8",
    )
    print(SUMMARY.read_text(encoding="utf-8"))
    return 1 if high else 0


if __name__ == "__main__":
    raise SystemExit(main())
