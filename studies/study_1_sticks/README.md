# Study 1: Selectively displayed sticks

Run `reproduce_main_results.py` with Python Launcher or `python3 reproduce_main_results.py`. The script starts from `data/study1_main_analysis_data.csv`, recomputes the exact discrete Bayesian benchmark, fits the manuscript mixed models and proportional-adjustment model, and regenerates the statistical panels in `output/`.

Run `reproduce_si_results.py` for the preregistered condition-specific models, clustered
participant-FE robustness checks, benchmark comparisons, and the complete
proportional-adjustment/exact-Bayes diagnostic battery reported in the SI.

The canonical file contains the 50 participants and 1,350 analyzable stick trials (plus quiz rows needed for the preregistered exclusion rule). `participant_id` is a study-specific anonymous code. Platform identifiers, session identifiers, network/device metadata, timestamps, and free text are excluded. Array-valued stick fields are JSON arrays so the CSV is portable.

The `experiment/` folder contains the final task logic, instructions, styling,
custom stick-trial plugin, and the required jsPsych 7.3.4 browser files. The
institution-specific consent form is not deposited; `consent.js` supplies an
explicit archive/test placeholder. The original Firebase project configuration
is also redacted; supply a new configuration in `firebaseSetup.js` and apply
appropriate database security rules before redeploying the task. Neither item
is needed to reproduce the analyses. The two high-resolution screens used in
Figure 1 are in `experiment/assets/`.

Key outputs are `main_text_results.txt`, the corresponding CSV, model tables, lambda estimates, plot data, and `Figure_1_statistical_panels.pdf`. Error bars in the regenerated panels are 95% confidence intervals, as stated in the manuscript.
