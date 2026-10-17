# Data and privacy notes

The repository includes analysis-ready participant/trial-level data because those data are necessary to reproduce the reported results. It does not include untouched platform exports.

Each study uses a new study-specific anonymous participant key. The public files exclude Prolific IDs, session and study IDs, IP and browser/device metadata, timestamps, free-text arguments and feedback, completion codes, and internal source-file identifiers. Anonymous keys cannot be linked across studies, and no lookup table is included.

Study 4 additionally replaces dossier identifiers everywhere they occur, including inside nested response JSON and advocate-analysis JSON, and removes advocate identifiers. The included dossier JSON retains randomized exposure and behavioral process fields required by the analysis but not the advocates' free-text arguments.

`sanitize_public_release.py` documents and reapplies the final minimization of
the prospective public copies. It never reads or modifies the restricted source
exports. `privacy_audit.py` then performs a fail-closed field- and content-level
scan of all public CSV and JSON inputs, plus a source-code secret/contact scan.
The current audit reports zero high-risk findings. Three deployed task files
contain intentional researcher contact addresses; these are recorded as
review-only findings rather than participant-data risks.

The final disclosure review identified and removed a previously overlooked set
of raw fields inside the Study 4 analysis-dossier JSON, including platform and
session identifiers, IP/browser metadata, timestamps, free-text arguments, and
feedback. The public dossier JSON now contains only anonymous dossier keys,
randomized evidence exposure, and derived behavioral process fields required by
the analysis. Redundant platform-named alias columns and nonessential rendered
HTML/source-file fields were also removed from the public CSV inputs.

The data are "cleaned" in the sense that final-study exports are consolidated, duplicate/repeat exposures are resolved according to the documented analysis rules, and private fields are removed. They are not aggregate result tables: each `reproduce_main_results.py` starts from participant- or trial-level observations and refits the statistical models.

The deposited inputs come from the final study waves used for the manuscript,
not pilot or obsolete task versions. Study-level READMEs document the canonical
input files, exclusions, and any analysis-specific provenance details.
