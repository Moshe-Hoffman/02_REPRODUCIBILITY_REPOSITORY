# Study 4: Policy-dossier audiences

Run `reproduce_main_results.py` with Python Launcher or `python3 reproduce_main_results.py`. It links each reviewer to the final dossier they saw, reconstructs claim, quantitative, and policy-support updating, fits the main advocacy models, and reproduces both the main statistical panel and the sharing-adjusted attenuation panel used in Figure 4.

Run `reproduce_si_results.py` for the complete H1--H4 directional-test battery and the
preregistered mixed-effects robustness specifications.

`data/study4_main_analysis_data.csv` contains the first complete eligible exposure for each of 288 reviewers. `reviewer_id` and `dossier_id` are repository-local anonymous keys. IDs embedded inside response JSON were remapped consistently. Account/session/study IDs, advocate IDs, network/device fields, timestamps, arguments, and feedback are excluded.

Two additional minimized inputs reproduce the SI completion diagnostics.
`study4_reviewer_completion_balance_data.csv` contains only completion, randomized
assignment/exposure predictors, policy, and an anonymous dossier-cluster key
for the 323 assigned reviewer sessions. `study4_dossier_review_coverage_data.csv`
contains the corresponding predictors and review status for all 304 eligible
randomized advocate dossiers. Neither file contains participant or platform
identifiers.

The `carbon_pricing_advocate_dossiers.json` and `minimum_wage_advocate_dossiers.json` files are public analysis dossiers
restricted to those 288 exposures. Their anonymous dossier IDs match the CSV;
they retain randomized exposure and derived process fields but exclude advocate
identifiers, free-text arguments, feedback, timestamps, IP/browser metadata,
and other raw export fields. The two JavaScript files preserve the final
policy-specific interfaces, but the operational Google Apps Script assignment
endpoint has been replaced with a placeholder for public release. A new
deployment URL would be required to redeploy these interfaces.
`policy_advocacy_stimuli.json` supplies the shared final stimulus definitions. The Figure 4 screen is
`experiment/assets/figure_4_interface_screenshot.png`.

The default entry point covers the main-text models and process attenuation;
the separate SI runner executes the larger preregistered robustness battery.
