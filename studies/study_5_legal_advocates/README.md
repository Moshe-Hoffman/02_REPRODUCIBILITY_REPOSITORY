# Study 5: Legal advocates

## Run

Double-click `reproduce_main_results.py` in Python Launcher, or run:

```bash
python3 reproduce_main_results.py
```

The script reads `data/study5_main_analysis_data.csv`, fits the main-text models, and writes all outputs to `output/`.

Run `reproduce_si_results.py` to regenerate the seven SI tables and mixed-effects robustness
coefficients in `output_si/`.

## Canonical data

`study5_main_analysis_data.csv` is a de-identified version of the final, already-filtered trial-level export. It contains the 204 participants in the manuscript analysis. Prolific, study, session, and run identifiers; IP and browser metadata; timestamps; free-text arguments; and feedback have been removed. The replacement `participant_id` codes are study-specific, and no public mapping connects them to Prolific accounts or to participants in another study.

## Experiment materials

- `experiment/study.js`: final legal-advocacy task code;
- `experiment/stimuli.json`: final cleaned/pruned legal-case stimuli;
- `experiment/assets/figure_5_interface_screenshot.jpg`: interface screenshot embedded in Figure 5.

## Main-text estimands

The output covers, in manuscript order:

1. claim- and verdict-level advocacy effects;
2. claim- and verdict-level asymmetric updating;
3. selective processing of advocacy-aligned evidence;
4. process-adjusted attenuation, including participant-clustered cross-model tests.

For direct comparability with Study 3, the readable main-text report and Figure 5 use raw percentage-point changes. The script also reproduces the preregistered log-odds specifications, which are reported in the Supplementary Information. The advocacy and claim-level asymmetric-updating conclusions are robust across the two scales; the verdict-level asymmetric-updating result is positive but scale-sensitive.

`Figure_5_statistical_panels.pdf` regenerates panels b--d in their manuscript order. Its bar-chart error bars are normal-approximation 95% confidence intervals calculated after the participant-level averaging described in the legend. Panel d contains point estimates only, matching the manuscript.
