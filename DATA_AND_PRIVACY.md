# Data and privacy notes

The repository includes analysis-ready participant/trial-level data because those data are necessary to reproduce the reported results. It does not include untouched platform exports.

Each study uses a new study-specific anonymous participant key. The public files exclude Prolific IDs, session and study IDs, IP and browser/device metadata, timestamps, free-text arguments and feedback, completion codes, and internal source-file identifiers. Anonymous keys cannot be linked across studies, and no lookup table is included.

Study 4 additionally replaces dossier identifiers everywhere they occur, including inside nested response JSON and advocate-analysis JSON, and removes advocate identifiers. The included dossier JSON retains randomized exposure and behavioral process fields required by the analysis but not the advocates' free-text arguments.

The Study 4 dossier JSON contains only anonymous dossier keys, randomized
evidence exposure, and derived behavioral process fields required by the
analysis. The public CSV inputs likewise omit redundant platform aliases and
nonessential rendered HTML and source-file fields.

The data are "cleaned" in the sense that final-study exports are consolidated, duplicate/repeat exposures are resolved according to the documented analysis rules, and private fields are removed. They are not aggregate result tables: each `reproduce_main_results.py` starts from participant- or trial-level observations and refits the statistical models.

The deposited inputs correspond to the samples analyzed in the manuscript.
Study-level READMEs document the canonical input files, exclusions, and any
analysis-specific provenance details.
