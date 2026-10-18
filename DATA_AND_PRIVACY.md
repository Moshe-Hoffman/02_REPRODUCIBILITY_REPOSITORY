# Data and privacy notes

The repository includes analysis-ready participant/trial-level data because those data are necessary to reproduce the reported results. It does not include untouched platform exports.

Each study uses a new study-specific anonymous participant key. The public files exclude Prolific IDs, session and study IDs, IP and browser/device metadata, timestamps, free-text feedback, completion codes, and internal source-file identifiers. Anonymous keys cannot be linked across studies, and no lookup table is included.

Study 4 additionally replaces dossier identifiers everywhere they occur, including inside nested response JSON and advocate-analysis JSON, and removes advocate identifiers. Its analysis-dossier JSON retains randomized exposure and behavioral process fields required by the analysis. Separate reviewer-runtime JSON files contain the screened advocate arguments and attached facts required to run the archived reviewer interfaces.

The Study 4 analysis-dossier JSON contains only anonymous dossier keys,
randomized evidence exposure, and derived behavioral process fields required
by the analysis. The reviewer-runtime JSON contains the screened arguments and
display fields required by the experimental interface, but no participant or
platform identifiers. The public CSV inputs likewise omit redundant platform
aliases and nonessential rendered HTML and source-file fields.

The data are "cleaned" in the sense that final-study exports are consolidated, duplicate/repeat exposures are resolved according to the documented analysis rules, and private fields are removed. They are not aggregate result tables: each `reproduce_main_results.py` starts from participant- or trial-level observations and refits the statistical models.

The deposited inputs correspond to the samples analyzed in the manuscript.
Study-level READMEs document the canonical input files, exclusions, and any
analysis-specific provenance details.

The separate `sensitivity_data/` directory contains minimized, model-ready
inputs for the SI's cross-study restored-case sensitivity table. Those files
include only the variables required for the specified regressions and
repository-local anonymous keys. They omit participant and platform
identifiers, timestamps, arguments, feedback, and device or network metadata.
