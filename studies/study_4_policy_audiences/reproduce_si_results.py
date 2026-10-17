"""Reproduce the full Study 4 preregistered and robustness battery."""
from pathlib import Path
from contextlib import redirect_stdout, redirect_stderr
import sys
import pandas as pd

HERE=Path(__file__).resolve().parent; OUT=HERE/"output_si"
def main():
    OUT.mkdir(exist_ok=True); sys.path.insert(0,str(HERE)); import _analysis_functions as analysis
    report=OUT/"si_results.txt"
    with report.open("w",encoding="utf-8") as f, redirect_stdout(f), redirect_stderr(f): code=analysis.main()
    sys.path.insert(0, str(HERE.parents[1]))
    from common.completion_balance import write_study4
    completion = write_study4(HERE, OUT)
    with report.open("a", encoding="utf-8") as f:
        f.write("\n\nCompletion and dossier-coverage balance\n")
        f.write(completion.to_string(index=False))
        f.write("\n")
    text=report.read_text(encoding="utf-8")
    sections=["H1", "H2", "H3", "H4", "Mixed-effects robustness", "Completion and dossier-coverage balance"]
    checks=pd.DataFrame([{"check":f"report contains {s}","expected":1,"observed":int(s.lower() in text.lower()),"pass":s.lower() in text.lower()} for s in sections]); checks.to_csv(OUT/"si_checks.csv",index=False)
    if code or not checks["pass"].all(): raise RuntimeError("Study 4 SI validation failed; see output_si/si_results.txt")
    print(f"Study 4 SI analyses complete: {OUT}")
if __name__=="__main__": main()
