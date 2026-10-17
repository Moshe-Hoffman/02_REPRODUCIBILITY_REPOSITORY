# Study 6: Policy advocates

Run `reproduce_main_results.py` with Python Launcher or `python3 reproduce_main_results.py`. It reconstructs the 304-participant analysis, fits the advocacy, asymmetric-updating, selective-processing, moderator, and matched process-adjustment models, and regenerates the advocacy and attenuation panels.

Run `reproduce_si_results.py` for the complete H1--H6 battery, including every
process-to-judgment specification and the process-family attenuation analyses.

`data/study6_main_analysis_data.csv` combines only the ten final-study exports after the audited cleaning rules. `participant_id` is a study-specific anonymous code. Account, study, session, exposure, source-file, network/device, timestamp, argument, and feedback fields are excluded.

`data/study6_completion_balance_data.csv` is a separate minimized session-level input
for the SI completion-balance check. It contains only completion, randomized
assignment/exposure predictors, and policy for the 384 identified non-preview
exposures; it contains no participant, session, or platform identifiers.

`experiment/study.js` and `experiment/stimuli.json` are the final deployed policy-advocacy task and final stimulus definitions. `experiment/assets/figure_6_interface_screenshot.png` is the high-resolution Figure 6 interface panel; the approved full figure is retained as `manuscript_figure_reference.pdf`.

`main_text_results.txt` is organized in manuscript order and includes the descriptive percentage-point changes, complementary H2/H3 tests, the eight selective-processing outcomes, and the all-process/sharing attenuation quantities. The runner regenerates both descriptive bar panels (b--c) with the participant-level 95% confidence intervals stated in the legend, as well as the attenuation panel inputs. The Figure 6 asymmetric-updating row and its matched attenuation tests use the preregistered pooled contrast among advocacy-aligned claims; the separate all-claims interaction attenuations are retained as secondary SI results. `full_analysis_report.txt` preserves the complete analysis transcript.
