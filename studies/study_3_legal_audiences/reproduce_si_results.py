"""Reproduce Study 3 supplementary analyses."""
from pathlib import Path
from contextlib import redirect_stdout
import sys
import pandas as pd

HERE=Path(__file__).resolve().parent; OUT=HERE/"output_si"; DATA=HERE/"data"/"study3_main_analysis_data.csv"; STIM=HERE/"experiment"/"stimuli.json"
def main():
    OUT.mkdir(exist_ok=True); sys.path.insert(0,str(HERE)); import _analysis_functions as analysis
    with (OUT/"si_results.txt").open("w",encoding="utf-8") as f, redirect_stdout(f): analysis.run_analysis([DATA],STIM,OUT)
    required=["contrasts_claim_delta.csv","contrasts_case_delta.csv","contrasts_claim_ancova.csv","contrasts_case_ancova.csv","figure_by_case_plot_data.csv"]
    checks=pd.DataFrame([{"check":f"created {n}","expected":1,"observed":int((OUT/n).exists()),"pass":(OUT/n).exists()} for n in required]); checks.to_csv(OUT/"si_checks.csv",index=False)
    if not checks["pass"].all(): raise RuntimeError("Study 3 SI validation failed")
    print(f"Study 3 SI analyses complete: {OUT}")
if __name__=="__main__": main()
