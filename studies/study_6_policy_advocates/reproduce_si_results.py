"""Reproduce the complete Study 6 preregistered/SI analysis battery."""
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
import os, sys
import pandas as pd

HERE=Path(__file__).resolve().parent; OUT=HERE/"output_si"; DATA=HERE/"data"/"study6_main_analysis_data.csv"; STIM=HERE/"experiment"/"stimuli.json"
def main():
    os.environ.setdefault("MPLBACKEND","Agg"); os.environ.setdefault("MPLCONFIGDIR",str(HERE/".matplotlib_cache"))
    OUT.mkdir(exist_ok=True); sys.path.insert(0,str(HERE)); import _analysis_functions as analysis
    with (OUT/"si_results.txt").open("w",encoding="utf-8") as f, redirect_stdout(f), redirect_stderr(f): analysis.run_all(STIM,[DATA],OUT)
    sys.path.insert(0, str(HERE.parents[1]))
    from common.completion_balance import write_study6
    completion = write_study6(HERE, OUT)
    with (OUT/"si_results.txt").open("a", encoding="utf-8") as f:
        f.write("\n\nCompletion balance\n")
        f.write(completion.to_string(index=False))
        f.write("\n")
    _, claims, facts, _ = analysis.load_stimuli(STIM)
    raw = analysis.load_advocate_csvs([DATA])
    participants = analysis.participant_table(raw)
    completed = participants.loc[participants["completed_primary"]].copy()
    claim_process, _, bundle_process = analysis.build_predictors(raw, completed, claims, facts)
    shown = bundle_process.loc[bundle_process["shown"].eq(1)].copy()
    bundle_means = shown.groupby("EvidenceCongenial")[["attention_open_count", "sharing_any", "activation_any"]].mean().reset_index()
    bundle_means.insert(0, "level", "shown evidence bundle")
    claim_process["any_sharing"] = claim_process[["ProProc_sharing_any", "ConProc_sharing_any"]].max(axis=1)
    claim_means = claim_process.groupby("ClaimCongenial")[["ClaimProc_attention_open_count", "any_sharing"]].mean().reset_index()
    claim_means.insert(0, "level", "claim")
    descriptives = pd.concat([bundle_means, claim_means], ignore_index=True, sort=False)
    descriptives.to_csv(OUT / "process_descriptive_means.csv", index=False)
    with (OUT/"si_results.txt").open("a", encoding="utf-8") as f:
        f.write("\nStudy 6 process descriptive means\n")
        f.write(descriptives.to_string(index=False))
        f.write("\n")
    required=["figure_6_attenuation_estimates_values.csv","figure_6_aligned_claim_asymmetry_attenuation_values.csv","figure_6_aligned_claim_asymmetry_attenuation_tests.csv","diagnostics.json","completion_balance.csv","process_descriptive_means.csv"]
    checks=pd.DataFrame([{"check":f"created {n}","expected":1,"observed":int((OUT/n).exists()),"pass":(OUT/n).exists()} for n in required]); checks.to_csv(OUT/"si_checks.csv",index=False)
    if not checks["pass"].all(): raise RuntimeError("Study 6 SI validation failed")
    print(f"Study 6 SI analyses complete: {OUT}")
if __name__=="__main__": main()
