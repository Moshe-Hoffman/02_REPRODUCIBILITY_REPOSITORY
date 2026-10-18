# Study 2: Threshold-censored observations

Run `reproduce_main_results.py` with Python Launcher or `python3 reproduce_main_results.py`. The calculation takes roughly one minute because the Bayesian benchmark is recomputed for each realized record.

Run `reproduce_si_results.py` to regenerate the full benchmark-gap, mixed-effects,
ordering, and deviation-from-Bayes analysis outputs in `output_si/`.

`data/study2_main_analysis_data.csv` consolidates the final exports and retains the first complete 30-round exposure for each of 116 participants. Repeated cumulative-export copies and three repeat exposures are removed. `run_id` is a repository-local sequential identifier; account, study, and session identifiers and operational metadata are excluded.

`experiment/study.js` is the final deployed task code. `experiment/assets/figure_2_interface_screenshots.png` contains the two Figure 2 judgment screens at publication resolution.

The readable report follows the Results section: six block-by-rule lambda estimates, the pooled lambda, judgment-ordering contrasts, and deviations from the Bayesian benchmark. The statistical PDF/PNG contains participant means with 95% confidence intervals and the Naive and Bayesian benchmark values for the same realized records. The verbose source-analysis transcript is retained separately as `full_analysis_log.txt`.
