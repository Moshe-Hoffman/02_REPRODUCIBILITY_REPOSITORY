"""Run every study's supplementary analyses and verify reported SI values."""
from pathlib import Path
import csv, subprocess, sys, time

ROOT=Path(__file__).resolve().parent
STUDIES=sorted((ROOT/"studies").glob("study_*"))
def main():
    rows=[]
    for study in STUDIES:
        runner=study/"reproduce_si_results.py"; start=time.time()
        result=subprocess.run([sys.executable,str(runner)],cwd=study,text=True,capture_output=True)
        rows.append({"study":study.name,"status":"PASS" if result.returncode==0 else "FAIL","seconds":round(time.time()-start,2),"message":(result.stdout+result.stderr)[-1000:]})
        print(f"{study.name}: {rows[-1]['status']}")
    with (ROOT/"si_reproduction_summary.csv").open("w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
    if any(r["status"]=="FAIL" for r in rows): raise SystemExit(1)
    audit = subprocess.run([sys.executable, str(ROOT / "_verify_si_reported_values.py")], cwd=ROOT)
    if audit.returncode:
        raise SystemExit(audit.returncode)
if __name__=="__main__": main()
