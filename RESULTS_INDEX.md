# Results index

Run `reproduce_all_main_results.py` and `reproduce_all_si_results.py` before using this index. Every path below
is relative to the repository root.

## Main text

For Study N, begin with:

- `studies/study_N_name/output/main_text_results.txt` for a readable report in
  manuscript order;
- `studies/study_N_name/output/main_text_results.csv` for the same quantities
  in machine-readable form;
- `studies/study_N_name/output/manuscript_checks.csv` for the comparison with
  the frozen main-text targets;
- the study README for the names of the figure-value and model files.

The frozen expected values are in `manuscript_targets/study_N.csv`.

## Supplementary Information

| SI section | First readable output | Principal machine-readable outputs |
|---|---|---|
| Study 1 | `studies/study_1_sticks/output_si/si_results.txt` | condition-specific models, benchmark comparisons, exact-Bayes and proportional-adjustment CSVs in the same folder |
| Study 2 | `studies/study_2_truncation/output_si/si_results.txt` | `lambda_by_block_and_rule.csv`, `lambda_pooled.csv`, `ordering_contrasts.csv`, `deviation_from_bayes_contrasts.csv` |
| Study 3 | `studies/study_3_legal_audiences/output_si/si_results.txt` | `contrasts_claim_*.csv`, `contrasts_case_*.csv`, treatment means, and case-specific plot data |
| Study 4 | `studies/study_4_policy_audiences/output_si/si_results.txt` | the complete labeled H1--H4 and mixed-effects transcript; compact main-text/attenuation CSVs are also in `output/` |
| Study 5 | `studies/study_5_legal_advocates/output_si/si_results.txt` | `table_1_*.csv` through `table_7_*.csv`, model/contrast CSVs, and attenuation files |
| Study 6 | `studies/study_6_policy_advocates/output_si/si_results.txt` | the complete labeled H1--H6 transcript plus the Figure 6 attenuation value/test CSVs |

`si_targets/reported_values.csv` provides a row-level bridge from displayed SI
values to the generated files containing their unrounded counterparts.
`si_reported_value_checks.csv` records the result of validating every row.

These files cover all 648 displayed values in the six study-specific SI
results sections. The final cross-study sensitivity table restores cases that
are absent from the deposited final-sample datasets. It is reproduced by
`reproduce_sensitivity_results.py` from the anonymous model-ready files in
`sensitivity_data/`; its estimates and validation checks are written to
`sensitivity_output/`.

## Searching for one reported number

Double-click `find_reported_result.py`, enter a number or phrase from the paper,
and the script will print every matching generated output with line numbers.
For rounded numbers, it also performs a numerical search allowing for the
displayed rounding precision and direction/percentage transformations used in
the prose.
