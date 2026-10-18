# Study 3: Legal audiences

Run `reproduce_main_results.py` with Python Launcher or `python3 reproduce_main_results.py`. It reconstructs claim- and verdict-level pre-to-post changes for the 399 participants, fits the preregistered participant-clustered models, evaluates the directional contrasts, and regenerates Figure 3's statistical panels.

Run `reproduce_si_results.py` for the logit-change and ANCOVA robustness specifications,
case-specific results, and the full model/contrast tables.

`data/study3_main_analysis_data.csv` is the final de-identified trial-level input. `participant_key` is a study-specific anonymous code. Prolific, study, session, run, browser, source-file, stimulus-HTML, timestamp, and free-text fields are excluded.

`experiment/study.js` and `experiment/stimuli.json` are the final legal-review task and stimuli. The high-resolution evidence-review image is in `experiment/assets/figure_3_interface_screenshot.png`.

The main report is ordered as claim tests followed by verdict tests. The figure uses participant-level cell means and normal-approximation 95% confidence intervals, matching the convention used throughout the main-text figures.
