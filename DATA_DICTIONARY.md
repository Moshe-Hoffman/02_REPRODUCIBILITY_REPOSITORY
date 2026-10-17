# Data dictionary

The CSVs retain the final task's original field names wherever possible so the analysis code is auditable against the JavaScript. Empty fields on rows for other page/trial types are expected. This file documents the cross-study structure; study-specific constructed variables are defined next to their formulas in each `_analysis_functions.py`.

| Study | Anonymous unit key | Main row types | Primary raw outcomes | Randomized/design fields |
|---|---|---|---|---|
| 1 | `participant_id` | stick trials and task metadata | `estimate` | `censored_direction`, `N_Sticks_Covered`, `stick_lengths`, `stick_covered` |
| 2 | `run_id` | 30 analysis rounds plus instructions/examples | `response_prob` (with the corresponding percent response fields) | `block`, `censoring_rule`, generated/recorded values and cutoff fields |
| 3 | `participant_key` | legal-review task pages | pre/post claim responses and verdict responses | `treatment`, `case_id`, claim/evidence fields |
| 4 | `reviewer_id` | policy-review task pages | nested `responses`, `own_policy_support` | `dossier_id`, `policy_id`, `advocate_position`, randomized dossier exposure fields |
| 5 | `participant_id` | legal-advocacy task pages | pre/post claim and verdict responses | advocacy side, case, claim, randomized evidence, fact-level process logs |
| 6 | `participant_id` | policy-advocacy task pages | pre/post claim, quantitative, and policy-support responses | advocacy side, policy, claim, randomized evidence bundles, fact/source process logs |

Study 4 also includes two minimized diagnostic files. The session-completion
file contains the binary completion outcome, randomized assignment/exposure
predictors, policy, and a repository-local anonymous dossier cluster for 323
assigned reviewer sessions. The dossier-coverage file contains the same
randomized predictors and review status for all 304 eligible dossiers.

Study 6 additionally includes `study6_completion_balance_data.csv`, containing only
completion, advocacy assignment, policy, whether evidence exposure was
recorded, and the randomized pro- and anti-policy bundle counts for 384
identified non-preview exposures. It contains no participant or session key.

Common jsPsych fields such as `page_type`, `trial_type`, `trial_index`, `time_elapsed`, and `rt` describe the task row rather than a separate observation in the statistical model. JSON-valued cells (`responses`, fact-review summaries, activation sets, and Study 1 arrays) are parsed by the study analysis script.

Outcome orientation and standardization:

- Study 1 retains the original 1-100 stick-height estimate and computes visible-mean and Bayesian residuals during analysis.
- Study 2 expresses probabilities on the 0-1 scale and computes Naive and Bayesian benchmarks during analysis.
- Study 3 expresses pre-to-post changes in percentage points toward the Plaintiff.
- Studies 4 and 6 orient changes toward policy support and standardize them within the policy/claim or policy/outcome units specified in the manuscript.
- Study 5 reports raw percentage-point changes in the main text for
  comparability with Study 3 and reproduces the preregistered log-odds models
  in the Supplementary Information.

The analysis tables written to `output/` are derived files, not source data. Their `estimate`/`value`, `se`, and `p` columns use the directional or two-sided tests explicitly named in the associated scripts and readable reports.
