"""Reproduce Study 5 supplementary tables and robustness models."""
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
import os, sys
import pandas as pd

HERE=Path(__file__).resolve().parent; OUT=HERE/"output_si"; DATA=HERE/"data"/"study5_main_analysis_data.csv"; STIM=HERE/"experiment"/"stimuli.json"
def main():
    os.environ.setdefault("MPLBACKEND","Agg"); os.environ.setdefault("MPLCONFIGDIR",str(HERE/".matplotlib_cache"))
    OUT.mkdir(exist_ok=True); sys.path.insert(0,str(HERE)); import _analysis_functions as analysis
    with (OUT/"si_results.txt").open("w",encoding="utf-8") as f, redirect_stdout(f), redirect_stderr(f): analysis.main(["--data",str(DATA),"--stimuli",str(STIM),"--outdir",str(OUT)])
    required=["table_1_main_updating_results.csv","table_2_process_as_outcome_results.csv","table_3_attenuation_summary.csv","table_4_selective_processing_mechanism_tests.csv","table_5_selective_processing_moderation_of_asymmetry.csv","table_6_raw_change_robustness.csv","table_7_raw_change_attenuation.csv","mixed_effects_coefficients.csv"]
    checks=pd.DataFrame([{"check":f"created {n}","expected":1,"observed":int((OUT/n).exists()),"pass":(OUT/n).exists()} for n in required]); checks.to_csv(OUT/"si_checks.csv",index=False)
    if not checks["pass"].all(): raise RuntimeError("Study 5 SI validation failed")
    print(f"Study 5 SI analyses complete: {OUT}")
if __name__=="__main__": main()
