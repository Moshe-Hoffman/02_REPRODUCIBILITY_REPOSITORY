# Supplementary-analysis reproduction

Each study has a separate no-argument `reproduce_si_results.py` entry point. It writes to
`output_si/`, leaving the shorter main-text report in `output/` untouched.
Run every SI analysis with:

```bash
python3 reproduce_all_si_results.py
```

The SI runners use the same data preparation and model functions as the
main-text runners. This avoids parallel implementations of the same estimand.
Each produces a readable `si_results.txt`, machine-readable model/table files,
and `si_checks.csv`. The repository-wide status file is
`si_reproduction_summary.csv`.

After the six study runners complete, `reproduce_all_si_results.py` also checks the frozen
manifest at `si_targets/reported_values.csv`. The manifest records all 648
displayed analysis values in the six study-specific SI results sections, each
value's SI line and context, and the generated output containing the
corresponding unrounded value. The result is written to
`si_reported_value_checks.csv`; any mismatch makes the repository-wide SI run fail.

Mapping to the Supplementary Information:

| Study | SI material reproduced |
|---|---|
| 1 | benchmark construction and comparison; preregistered mixed models; condition-specific tests; participant-FE robustness; proportional-adjustment, exact-Bayes, and fixed-center diagnostics |
| 2 | block/rule and pooled benchmark-gap models; mixed-effects robustness; ordering tests; deviation-from-Bayes tests |
| 3 | claim and verdict models; ANCOVA and logit robustness; raw treatment means and case-specific results |
| 4 | H1 advocacy effects; H2/H3 directional tests; process adjustment/attenuation; mixed-effects robustness |
| 5 | main updating models; process-as-outcome models; attenuation and cross-model tests; exploratory process specifications; mixed-effects robustness |
| 6 | H1–H6 battery; claim/evidence alignment moderators; all process-to-judgment models; process-family and complete-process attenuation |

The study-level compact checks verify samples and expected analysis artifacts.
The repository-wide SI manifest additionally locks the displayed numerical
results to the generated outputs. Full coefficient tables and complete
analysis transcripts remain available for auditing results not summarized in
the prose.

The final cross-study sensitivity table is outside the scope of the public rerun. Those
analyses deliberately restore cases omitted from the canonical final-sample
datasets, including repeated participation and failed attention checks. The
reported values have been independently audited against the restricted source
exports, but the restored-case inputs required to rerun them are not deposited
because they retain source information excluded by the public-data minimization
process. Accordingly, the present 648-value lock reproduces the six
study-specific SI results sections but not that final cross-study table.
