# Cognitive Explanation for Advocacy Bias: Reproduction Repository

This repository reproduces the analyses and figures reported in the main text
and the analyses reported in the Supplementary Information.

## Validation status

The repository was validated in a Python 3.13.5 environment using
`requirements-lock.txt`: all 182 main-text checks and all 648 displayed SI
values passed. The final cross-study sensitivity analysis is the only reported
analysis that requires restricted restored-case inputs and therefore is
documented but not rerunnable from the public repository.

## Repository organization

Each study has the same structure:

```text
studies/study_N_name/
├── README.md                    # Design, inputs, exclusions, and outputs
├── reproduce_main_results.py    # Double-clickable main-text reproduction script
├── reproduce_si_results.py      # Double-clickable supplementary-analysis script
├── _analysis_functions.py       # Supporting statistical code; not a launcher
├── data/                        # De-identified canonical analysis input
├── experiment/                  # Task source, stimulus files, and figure assets
└── output/                      # Regenerated reports, tables, checks, and figures
```

The main-text entry point is `reproduce_main_results.py`. It requires no command-line arguments and resolves every path relative to its own location, so it can be run from Python Launcher or an editor without changing the working directory. Files beginning with an underscore contain supporting code used by the reproduction scripts and are not intended to be opened separately.

For a first-time setup, install the packages in `requirements.txt`. The
separate `requirements-lock.txt` records the exact versions used to validate
this release. Python Launcher must be configured to use the Python
installation in which those packages were installed.

Each script will create:

- `output/main_text_results.txt`: a readable report ordered like the corresponding Results section;
- `output/main_text_results.csv`: the same reported quantities in machine-readable form;
- `output/manuscript_checks.csv`: comparisons against the values reported in the manuscript;
- regenerated statistical figure panels in PDF and PNG form, including every data-driven panel appearing in the main-text figure;
- supporting plot-data and model-output files for inspecting the displayed results.

## Data policy

The public canonical inputs are de-identified, analysis-ready datasets. Untouched platform exports are not included when they contain participant identifiers, IP addresses, free-text responses, timestamps, or operational metadata. Cleaning and provenance are documented so that authorized researchers with access to the restricted exports can reconstruct the public inputs.

The analysis-ready data are not precomputed result tables: each study script fits the main-text models and regenerates the figure from participant- or trial-level observations.

## Python environment

Python 3.11 or newer is recommended. Install the dependencies listed in `requirements.txt` before running a study script.

```bash
python3 -m pip install -r requirements.txt
```

## What the reproduction scripts verify

Each study script:

1. starts from its canonical de-identified dataset;
2. reproduces every numerical result reported in that study's main-text Results section;
3. regenerates every data-driven main-text panel from participant-level data;
4. writes results in manuscript order with clear labels;
5. passes automated numerical checks against `manuscript_targets/`.

Screenshots embedded in the figures are documented experiment assets under each study's `experiment/assets/` folder. Statistical panels are regenerated from data.

The Study 1 experiment folder includes its required browser libraries and task
source. Its institution-specific consent document and operational Firebase
configuration are intentionally omitted or redacted; the study README explains
what must be supplied before redeployment. This does not affect analysis
reproduction.

`reproduce_all_main_results.py` verifies both the manuscript targets and the presence of the required data-driven panels, then writes `main_results_reproduction_summary.csv`.

## Running everything

Double-click `reproduce_all_main_results.py` in Python Launcher, or run:

```bash
python3 reproduce_all_main_results.py
```

Study 2 is the slowest because it recomputes record-specific Bayesian probabilities. Individual studies can be run independently through their own `reproduce_main_results.py` entry point.

See `DATA_AND_PRIVACY.md` for the de-identification and source-selection policy.

`RESULTS_INDEX.md` maps manuscript and SI result families to their readable
and machine-readable outputs. After running the analyses, double-click
`find_reported_result.py` to search the generated outputs by a reported number
or phrase.

## Supplementary Information

Run `python3 reproduce_all_si_results.py` to reproduce the full supplementary-analysis
battery for all six studies. See `SUPPLEMENTARY_REPRODUCTION.md` for the
section-to-output map. SI outputs are written to each study's `output_si/`
folder and do not overwrite the shorter main-text reports.

The frozen `si_targets/reported_values.csv` manifest records the 648 displayed
analysis values in the six study-specific SI results sections and the generated
output supporting each value. `reproduce_all_si_results.py` validates that manifest after all
six SI runners finish and writes `si_reported_value_checks.csv`. The final cross-study
sensitivity table restores excluded or repeated cases that are not included in
the deposited final-sample datasets. Its reported values were checked against
restricted source exports, but it is not rerunnable from this repository. Those
restricted restored-case inputs are intentionally not deposited because they
retain source information excluded by the public-data minimization process.
