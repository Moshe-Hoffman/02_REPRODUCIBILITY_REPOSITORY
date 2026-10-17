"""
Truncation Study Pilot Analysis
Reproduces benchmark construction and preregistered tests.

What this script does:
1. Loads a cognition.run / jsPsych CSV.
2. Identifies completed participants.
3. Parses round-level data.
4. Computes naive and Bayesian benchmarks.
5. Runs:
   - primary block × rule lambda regression
   - primary pooled lambda regression
   - secondary ordering tests
   - pooled deviation-from-Bayes test
   - block-specific deviation-from-Bayes test
   - participant-level lambda estimates and histogram

Assumptions:
- One row per trial/page.
- Round rows have trial_tag == "round".
- Participant/session identifier is run_id.
- Completed participants are those with exactly 30 round rows.
- response_prob is preferred if present; otherwise response_percent / 100 is used.
"""

import json
import math
import os
from pathlib import Path
import numpy as np
import pandas as pd
import statsmodels.formula.api as smf
from scipy.stats import norm, t


# ============================================================
# CONFIG
# ============================================================

CSV_PATHS = [
    "data/study2_main_analysis_data.csv",
]

RAW_PARTICIPANT_COL = "run_id"
PARTICIPANT_COL = "participant_uid"
REQUIRE_COMPLETED = True

EXPECTED_ROUNDS = 30

HIGH_MEAN = 270
LOW_MEAN = 230
SD = 50

BLOCKS = {
    1: {"n_fixed": 5, "cutoff_fixed": 250},
    2: {"geom_p": 0.2, "cutoff_fixed": 250},
    3: {"geom_p": 0.2, "cutoff_min": 230, "cutoff_max": 270},
}

ONLY_HIGH = "Only High"
ONLY_LOW = "Only Low"
RANDOM_DROP = "Random Drop"


# ============================================================
# HELPER FUNCTIONS
# ============================================================

def parse_array(x):
    """Parse JSON/stringified arrays from jsPsych exports."""
    if pd.isna(x):
        return []
    if isinstance(x, list):
        return [float(v) for v in x]
    s = str(x).strip()
    if not s:
        return []
    try:
        out = json.loads(s)
        if isinstance(out, list):
            return [float(v) for v in out]
    except Exception:
        pass
    return []


def log_prod_pdf(values, mean, sd):
    """Sum of log normal densities for a list of observed values."""
    return sum(norm.logpdf(v, loc=mean, scale=sd) for v in values)


def posterior_from_logs(log_h, log_l):
    """Stable conversion from log likelihoods to posterior P(H)."""
    if not np.isfinite(log_h) and not np.isfinite(log_l):
        return np.nan
    m = max(log_h, log_l)
    eh = math.exp(log_h - m)
    el = math.exp(log_l - m)
    return eh / (eh + el)


def log_choose(n, k):
    """Log binomial coefficient."""
    if k < 0 or k > n:
        return -np.inf
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)


def logsumexp(vals):
    """Stable log-sum-exp."""
    vals = np.asarray(vals, dtype=float)
    vals = vals[np.isfinite(vals)]
    if len(vals) == 0:
        return -np.inf
    m = vals.max()
    return m + np.log(np.exp(vals - m).sum())


def log_hidden_n_factor(m, a, p, n_max=200):
    """
    Hidden-N likelihood factor for Blocks 2/3:

      sum_n P(N=n) * choose(n,m) * a^(n-m)

    N = 1 + Geometric(p), support n = 1,2,...
    a is the probability that an unrecorded draw falls on the censored side.
    """
    a = min(1 - 1e-12, max(1e-12, a))
    start_n = max(1, m)
    terms = []

    for n in range(start_n, n_max + 1):
        log_pn = math.log(p) + (n - 1) * math.log(1 - p)
        log_comb = log_choose(n, m)
        log_censor = (n - m) * math.log(a)
        terms.append(log_pn + log_comb + log_censor)

    return logsumexp(terms)


def naive_posterior(recorded):
    """
    Naive benchmark:
    Treat recorded values as if they were uncensored direct samples.
    """
    log_h = log_prod_pdf(recorded, HIGH_MEAN, SD)
    log_l = log_prod_pdf(recorded, LOW_MEAN, SD)
    return posterior_from_logs(log_h, log_l)


def log_lik_block1(recorded, rule, n, cutoff, mean):
    """
    Block 1 likelihood.
    N and cutoff are known.
    """
    m = len(recorded)
    lp = log_prod_pdf(recorded, mean, SD)

    if rule == RANDOM_DROP:
        # Random-drop constants cancel between High and Low.
        return lp

    if rule == ONLY_HIGH:
        if any(v <= cutoff for v in recorded):
            return -np.inf
        a = norm.cdf(cutoff, loc=mean, scale=SD)  # P(X <= c)
        return lp + (n - m) * math.log(max(a, 1e-12))

    if rule == ONLY_LOW:
        if any(v >= cutoff for v in recorded):
            return -np.inf
        a = 1 - norm.cdf(cutoff, loc=mean, scale=SD)  # P(X >= c)
        return lp + (n - m) * math.log(max(a, 1e-12))

    return np.nan


def log_lik_block2(recorded, rule, cutoff, mean, p):
    """
    Block 2 likelihood.
    Cutoff known, N hidden and integrated out.
    """
    m = len(recorded)
    lp = log_prod_pdf(recorded, mean, SD)

    if rule == RANDOM_DROP:
        return lp

    if rule == ONLY_HIGH:
        if any(v <= cutoff for v in recorded):
            return -np.inf
        a = norm.cdf(cutoff, loc=mean, scale=SD)  # P(X <= c)
        return lp + log_hidden_n_factor(m, a, p)

    if rule == ONLY_LOW:
        if any(v >= cutoff for v in recorded):
            return -np.inf
        a = 1 - norm.cdf(cutoff, loc=mean, scale=SD)  # P(X >= c)
        return lp + log_hidden_n_factor(m, a, p)

    return np.nan


def log_lik_block3(recorded, rule, mean, p, c_min=230, c_max=270, grid_n=401):
    """
    Block 3 likelihood.
    N hidden and cutoff hidden.
    Cutoff is integrated over c ~ Uniform(c_min, c_max).
    """
    m = len(recorded)
    lp = log_prod_pdf(recorded, mean, SD)

    if rule == RANDOM_DROP:
        return lp

    cs = np.linspace(c_min, c_max, grid_n)
    step = (c_max - c_min) / (grid_n - 1)
    terms = []

    for i, c in enumerate(cs):
        weight = 0.5 if i in (0, grid_n - 1) else 1.0

        if rule == ONLY_HIGH:
            if any(v <= c for v in recorded):
                continue
            a = norm.cdf(c, loc=mean, scale=SD)

        elif rule == ONLY_LOW:
            if any(v >= c for v in recorded):
                continue
            a = 1 - norm.cdf(c, loc=mean, scale=SD)

        else:
            continue

        terms.append(math.log(weight) + log_hidden_n_factor(m, a, p))

    if not terms:
        return -np.inf

    # Trapezoidal integral divided by interval length.
    # This is the expectation over Uniform(c_min, c_max).
    log_integral_avg = math.log(step / (c_max - c_min)) + logsumexp(terms)
    return lp + log_integral_avg


def bayes_posterior(row):
    """Bayesian benchmark posterior for one round row."""
    recorded = row["recorded_list"]
    rule = row["censoring_rule"]
    block = int(row["block"])

    if block == 1:
        n = int(row["sample_size_true"])
        cutoff = float(row["cutoff_value"])
        log_h = log_lik_block1(recorded, rule, n, cutoff, HIGH_MEAN)
        log_l = log_lik_block1(recorded, rule, n, cutoff, LOW_MEAN)

    elif block == 2:
        cutoff = BLOCKS[2]["cutoff_fixed"]
        p = BLOCKS[2]["geom_p"]
        log_h = log_lik_block2(recorded, rule, cutoff, HIGH_MEAN, p)
        log_l = log_lik_block2(recorded, rule, cutoff, LOW_MEAN, p)

    elif block == 3:
        p = BLOCKS[3]["geom_p"]
        log_h = log_lik_block3(recorded, rule, HIGH_MEAN, p)
        log_l = log_lik_block3(recorded, rule, LOW_MEAN, p)

    else:
        return np.nan

    return posterior_from_logs(log_h, log_l)


def one_sided_p_greater(coef, se, df):
    """One-sided p-value for H1: coef > 0."""
    stat = coef / se
    return 1 - t.cdf(stat, df=df)


def one_sided_p_less_than_one(coef, se, df):
    """One-sided p-value for H1: coef < 1."""
    stat = (coef - 1) / se
    return t.cdf(stat, df=df)


def one_sided_p_less(coef, se, df):
    """One-sided p-value for H1: coef < 0."""
    stat = coef / se
    return t.cdf(stat, df=df)


def clustered_model(formula, data):
    """OLS with standard errors clustered by participant."""
    return smf.ols(formula, data=data).fit(
        cov_type="cluster",
        cov_kwds={"groups": data[PARTICIPANT_COL]}
    )

def demean_within(data, cols, group_col=PARTICIPANT_COL, suffix="_dm"):
    """
    Within-participant demeaning for fixed-effects regressions.

    This is algebraically equivalent to including participant fixed effects,
    but avoids high-dimensional dummy-variable numerical warnings.
    """
    out = data.copy()
    group_means = out.groupby(group_col)[cols].transform("mean")

    for col in cols:
        out[f"{col}{suffix}"] = out[col] - group_means[col]

    return out


def print_header(txt):
    print("\n" + "=" * 72)
    print(txt)
    print("=" * 72)


# ============================================================
# LOAD + PREP
# ============================================================

dfs = []

for batch_num, path in enumerate(CSV_PATHS, start=1):
    temp = pd.read_csv(path)
    temp["batch_id"] = batch_num
    temp["source_file"] = path

    # Important: run_id may repeat across batch files.
    temp[PARTICIPANT_COL] = (
        "batch" + temp["batch_id"].astype(str)
        + "_run" + temp[RAW_PARTICIPANT_COL].astype(str)
    )

    dfs.append(temp)

df = pd.concat(dfs, ignore_index=True)

required_cols = [
    RAW_PARTICIPANT_COL,
    PARTICIPANT_COL,
    "batch_id",
    "trial_tag",
    "block",
    "round_global",
    "censoring_rule",
    "recorded_values",
    "sample_size_true",
    "cutoff_value",
]

missing = [c for c in required_cols if c not in df.columns]
if missing:
    raise ValueError(f"Missing required columns: {missing}")

rounds_all = df[df["trial_tag"].eq("round")].copy()

round_counts = rounds_all.groupby(PARTICIPANT_COL).size()
completed_ids = round_counts[round_counts == EXPECTED_ROUNDS].index.tolist()

print_header("Completion check")
print(f"Completed participants: {len(completed_ids)}")
print("Completed run_ids:", completed_ids)
print("\nRound counts by participant:")
print(round_counts.to_string())

if REQUIRE_COMPLETED:
    rounds = rounds_all[rounds_all[PARTICIPANT_COL].isin(completed_ids)].copy()

    if len(completed_ids) == 0:
        print("\nNo completed participants found under the 30-round completion rule.")
        raise SystemExit
else:
    print("\nWARNING: using incomplete participants for testing only.")
    rounds = rounds_all.copy()

if len(rounds) == 0:
    raise ValueError("No round rows available after filtering.")

# Response scale
if "response_prob" in rounds.columns and rounds["response_prob"].notna().any():
    rounds["p_hat"] = pd.to_numeric(rounds["response_prob"], errors="coerce")
else:
    rounds["p_hat"] = pd.to_numeric(rounds["response_percent"], errors="coerce") / 100

# Parse recorded values
rounds["recorded_list"] = rounds["recorded_values"].apply(parse_array)

# Numeric coercions
for col in ["block", "round_global", "sample_size_true", "cutoff_value"]:
    if col in rounds.columns:
        rounds[col] = pd.to_numeric(rounds[col], errors="coerce")

# Compute benchmarks
rounds["naive_calc"] = rounds["recorded_list"].apply(naive_posterior)
rounds["bayes_calc"] = rounds.apply(lambda row: bayes_posterior(row), axis=1)

# Use computed values as authoritative
rounds["naive"] = rounds["naive_calc"]
rounds["bayes"] = rounds["bayes_calc"]

rounds["gap"] = rounds["bayes"] - rounds["naive"]
rounds["response_minus_naive"] = rounds["p_hat"] - rounds["naive"]
rounds["dev_from_bayes"] = (rounds["p_hat"] - rounds["bayes"]).abs()

# Rule indicators
rounds["only_high"] = (rounds["censoring_rule"] == ONLY_HIGH).astype(int)
rounds["only_low"] = (rounds["censoring_rule"] == ONLY_LOW).astype(int)
rounds["random_drop"] = (rounds["censoring_rule"] == RANDOM_DROP).astype(int)

# Clean
rounds = rounds.dropna(subset=["p_hat", "naive", "bayes", "gap"]).copy()

print_header("Round-level analytic sample")
print(f"Round observations after cleaning: {len(rounds)}")
print("\nRows by block × rule:")
print(pd.crosstab(rounds["block"], rounds["censoring_rule"]))


# ============================================================
# FEEDBACK + COMPLETION TIME
# ============================================================

print_header("Feedback")

if "feedback_text" in df.columns:
    fb = df[df["feedback_text"].notna()].copy()
    fb["feedback_text"] = fb["feedback_text"].astype(str).str.strip()
    fb = fb[fb["feedback_text"].ne("")]
    fb = fb[[PARTICIPANT_COL, "feedback_text"]].drop_duplicates()

    if len(fb) == 0:
        print("No non-empty feedback.")
    else:
        print(fb.to_string(index=False))
else:
    print("No feedback_text column found.")

print_header("Completion time")

if "time_elapsed" in df.columns:
    comp_df = df[df[PARTICIPANT_COL].isin(completed_ids)].copy()
    comp_time = comp_df.groupby(PARTICIPANT_COL)["time_elapsed"].max() / 60000
    print(comp_time.describe())
else:
    print("No time_elapsed column found.")


# ============================================================
# PRIMARY TEST: BLOCK × RULE LAMBDA
# ============================================================

print_header("Primary lambda: block × rule estimates")

primary = rounds[rounds["censoring_rule"].isin([ONLY_HIGH, ONLY_LOW])].copy()

if primary.empty:
    raise ValueError("No Only High / Only Low rows available for primary analysis.")

# Create cell-specific gap variables
for b in [1, 2, 3]:
    for rule_name, short in [(ONLY_HIGH, "OH"), (ONLY_LOW, "OL")]:
        col = f"gap_B{b}_{short}"
        primary[col] = np.where(
            (primary["block"] == b) & (primary["censoring_rule"] == rule_name),
            primary["gap"],
            0.0
        )

cell_terms = " + ".join([f"gap_B{b}_{s}" for b in [1, 2, 3] for s in ["OH", "OL"]])

# Participant fixed effects via within-participant demeaning.
# This is equivalent to including C(participant_uid), but numerically cleaner.
cell_cols = [f"gap_B{b}_{s}" for b in [1, 2, 3] for s in ["OH", "OL"]]

primary_dm = demean_within(
    primary,
    cols=["response_minus_naive"] + cell_cols,
    group_col=PARTICIPANT_COL
)

cell_terms_dm = " + ".join([f"{c}_dm" for c in cell_cols])

m_primary_cells = smf.ols(
    f"response_minus_naive_dm ~ 0 + {cell_terms_dm}",
    data=primary_dm
).fit(
    cov_type="cluster",
    cov_kwds={"groups": primary_dm[PARTICIPANT_COL]}
)

df_cluster = max(len(primary[PARTICIPANT_COL].unique()) - 1, 1)

rows = []
for b in [1, 2, 3]:
    for s, label in [("OH", "Only High"), ("OL", "Only Low")]:
        name = f"gap_B{b}_{s}_dm"
        coef = m_primary_cells.params[name]
        se = m_primary_cells.bse[name]
        rows.append({
            "cell": f"B{b} × {label}",
            "lambda": coef,
            "clustered_se": se,
            "p_lambda_gt_0": one_sided_p_greater(coef, se, df_cluster),
            "p_lambda_lt_1": one_sided_p_less_than_one(coef, se, df_cluster),
        })

primary_cells_table = pd.DataFrame(rows)
print(primary_cells_table.to_string(index=False))


# ============================================================
# PRIMARY TEST: POOLED LAMBDA
# ============================================================

print_header("Primary pooled lambda")

primary_pooled_dm = demean_within(
    primary,
    cols=["response_minus_naive", "gap"],
    group_col=PARTICIPANT_COL
)

m_primary_pooled = smf.ols(
    "response_minus_naive_dm ~ 0 + gap_dm",
    data=primary_pooled_dm
).fit(
    cov_type="cluster",
    cov_kwds={"groups": primary_pooled_dm[PARTICIPANT_COL]}
)

coef = m_primary_pooled.params["gap_dm"]
se = m_primary_pooled.bse["gap_dm"]

primary_pooled = {
    "lambda": coef,
    "clustered_se": se,
    "p_lambda_gt_0": one_sided_p_greater(coef, se, df_cluster),
    "p_lambda_lt_1": one_sided_p_less_than_one(coef, se, df_cluster),
}
print(primary_pooled)


# ============================================================
# ROBUSTNESS: MIXED-EFFECTS MODEL
# ============================================================

print_header("Mixed-effects robustness: pooled lambda")

# Random intercept and random slope on the Bayes-minus-Naive gap by participant.
# This corresponds to the preregistered robustness model.
#
# Note: MixedLM does not use clustered SEs in the same way as OLS.
# Treat this as a robustness/descriptive model, not a replacement for
# the preregistered clustered-FE primary model.

try:
    m_mixed_pooled = smf.mixedlm(
        "response_minus_naive ~ gap",
        data=primary,
        groups=primary[PARTICIPANT_COL],
        re_formula="~gap"
    ).fit(method="lbfgs", reml=False)

    mixed_coef = m_mixed_pooled.params["gap"]
    mixed_se = m_mixed_pooled.bse["gap"]

    mixed_pooled = {
        "lambda": mixed_coef,
        "se": mixed_se,
        "p_lambda_gt_0": one_sided_p_greater(mixed_coef, mixed_se, df_cluster),
        "p_lambda_lt_1": one_sided_p_less_than_one(mixed_coef, mixed_se, df_cluster),
    }

    print(mixed_pooled)
    print("\nRandom-effects covariance:")
    print(m_mixed_pooled.cov_re)

except Exception as e:
    print("Mixed-effects pooled model failed to converge or estimate.")
    print(repr(e))

print_header("Mixed-effects robustness: block × rule lambdas")

# Fixed effects: six cell-specific gap coefficients.
# Random effects: participant-level random intercept plus random slope on pooled gap.
# This is usually more stable than random slopes for all six sparse cell-specific gaps.

try:
    m_mixed_cells = smf.mixedlm(
        f"response_minus_naive ~ 0 + {cell_terms}",
        data=primary,
        groups=primary[PARTICIPANT_COL],
        re_formula="~gap"
    ).fit(method="lbfgs", reml=False)

    mixed_cell_rows = []

    for b in [1, 2, 3]:
        for s, label in [("OH", "Only High"), ("OL", "Only Low")]:
            name = f"gap_B{b}_{s}"
            coef = m_mixed_cells.params[name]
            se = m_mixed_cells.bse[name]
            mixed_cell_rows.append({
                "cell": f"B{b} × {label}",
                "lambda": coef,
                "se": se,
                "p_lambda_gt_0": one_sided_p_greater(coef, se, df_cluster),
                "p_lambda_lt_1": one_sided_p_less_than_one(coef, se, df_cluster),
            })

    mixed_cells_table = pd.DataFrame(mixed_cell_rows)
    print(mixed_cells_table.to_string(index=False))

except Exception as e:
    print("Mixed-effects block × rule model failed to converge or estimate.")
    print(repr(e))

    
# ============================================================
# SECONDARY 1: ORDERING TESTS
# ============================================================

print_header("Secondary ordering: pooled")

# Random Drop omitted; block FE included.
m_order_pooled = clustered_model(
    "p_hat ~ C(block) + only_high + only_low",
    rounds
)

ordering_pooled_rows = []

# Prediction: Only High > Random Drop
coef = m_order_pooled.params["only_high"]
se = m_order_pooled.bse["only_high"]
ordering_pooled_rows.append({
    "contrast": "Only High − Random Drop",
    "estimate": coef,
    "clustered_se": se,
    "one_sided_p": one_sided_p_greater(coef, se, df_cluster),
})

# Prediction: Random Drop > Only Low, so Only Low − Random Drop < 0
coef = m_order_pooled.params["only_low"]
se = m_order_pooled.bse["only_low"]
ordering_pooled_rows.append({
    "contrast": "Only Low − Random Drop",
    "estimate": coef,
    "clustered_se": se,
    "one_sided_p_for_RandomDrop_gt_OnlyLow": one_sided_p_less(coef, se, df_cluster),
})

print(pd.DataFrame(ordering_pooled_rows).to_string(index=False))


print_header("Secondary ordering: by block")

ordering_block_rows = []

for b in [1, 2, 3]:
    sub = rounds[rounds["block"] == b].copy()
    if sub.empty:
        continue

    m = clustered_model("p_hat ~ only_high + only_low", sub)

    oh = m.params["only_high"]
    oh_se = m.bse["only_high"]

    ol = m.params["only_low"]
    ol_se = m.bse["only_low"]

    ordering_block_rows.append({
        "block": b,
        "OnlyHigh_minus_RandomDrop": oh,
        "p_OnlyHigh_gt_RandomDrop": one_sided_p_greater(oh, oh_se, df_cluster),
        "OnlyLow_minus_RandomDrop": ol,
        "p_RandomDrop_gt_OnlyLow": one_sided_p_less(ol, ol_se, df_cluster),
    })

print(pd.DataFrame(ordering_block_rows).to_string(index=False))


# ============================================================
# SECONDARY 2: DEVIATION FROM BAYES
# ============================================================

print_header("Secondary deviation-from-Bayes: pooled")

m_dev_pooled = clustered_model(
    "dev_from_bayes ~ C(block) + only_high + only_low",
    rounds
)

dev_pooled_rows = []
for term, interpretation in [
    ("only_high", "Only High − Random Drop"),
    ("only_low", "Only Low − Random Drop"),
]:
    coef = m_dev_pooled.params[term]
    se = m_dev_pooled.bse[term]
    dev_pooled_rows.append({
        "contrast": interpretation,
        "estimate": coef,
        "clustered_se": se,
        "one_sided_p_gt_0": one_sided_p_greater(coef, se, df_cluster),
    })

print(pd.DataFrame(dev_pooled_rows).to_string(index=False))


print_header("Secondary deviation-from-Bayes: block-specific")

# Create block-specific indicators
for b in [1, 2, 3]:
    rounds[f"oh_B{b}"] = ((rounds["block"] == b) & (rounds["censoring_rule"] == ONLY_HIGH)).astype(int)
    rounds[f"ol_B{b}"] = ((rounds["block"] == b) & (rounds["censoring_rule"] == ONLY_LOW)).astype(int)

dev_terms = " + ".join([f"oh_B{b} + ol_B{b}" for b in [1, 2, 3]])

m_dev_cells = clustered_model(
    f"dev_from_bayes ~ C(block) + {dev_terms}",
    rounds
)

dev_cell_rows = []
for b in [1, 2, 3]:
    for prefix, label in [("oh", "Only High"), ("ol", "Only Low")]:
        name = f"{prefix}_B{b}"
        coef = m_dev_cells.params[name]
        se = m_dev_cells.bse[name]
        dev_cell_rows.append({
            "cell": f"B{b} × {label}",
            "estimate": coef,
            "clustered_se": se,
            "one_sided_p_gt_0": one_sided_p_greater(coef, se, df_cluster),
        })

dev_cells_table = pd.DataFrame(dev_cell_rows)
print(dev_cells_table.to_string(index=False))


# ============================================================
# PARTICIPANT-LEVEL LAMBDA HISTOGRAM
# ============================================================

print_header("Participant-level lambdas")

participant_lambdas = []

for pid, sub in primary.groupby(PARTICIPANT_COL):
    if sub["gap"].std() == 0 or len(sub) < 5:
        continue

    # Per-participant pooled lambda.
    # This is descriptive and noisy because each participant has few observations.
    model = smf.ols("response_minus_naive ~ gap", data=sub).fit()

    participant_lambdas.append({
        PARTICIPANT_COL: pid,
        "lambda_i": model.params["gap"],
        "n_obs": len(sub),
    })

pl = pd.DataFrame(participant_lambdas)

if len(pl) == 0:
    print("No participant-level lambdas could be estimated.")
else:
    print(pl.to_string(index=False))
    print("\nSummary:")
    print(pl["lambda_i"].describe())

    bins = [-np.inf, 0, .2, .4, .6, .8, 1.0, np.inf]
    labels = [
        "<0",
        "0–0.2",
        "0.2–0.4",
        "0.4–0.6",
        "0.6–0.8",
        "0.8–1.0",
        ">1.0",
    ]

    pl["lambda_bin"] = pd.cut(pl["lambda_i"], bins=bins, labels=labels, include_lowest=True)
    hist = pl["lambda_bin"].value_counts().sort_index()

    print("\nLambda histogram:")
    print(hist.to_string())



    # ============================================================
# PARTICIPANT-LEVEL LAMBDA HISTOGRAMS BY BLOCK
# ============================================================

print_header("Participant-level lambdas by block")

participant_block_lambdas = []

for (pid, b), sub in primary.groupby([PARTICIPANT_COL, "block"]):
    # Need at least some variation in the Bayes-Naive gap
    if sub["gap"].std() == 0 or len(sub) < 4:
        participant_block_lambdas.append({
            PARTICIPANT_COL: pid,
            "block": b,
            "lambda_i_block": np.nan,
            "n_obs": len(sub),
            "status": "not_estimated_low_variation_or_too_few_obs",
        })
        continue

    model = smf.ols("response_minus_naive ~ gap", data=sub).fit()

    participant_block_lambdas.append({
        PARTICIPANT_COL: pid,
        "block": b,
        "lambda_i_block": model.params["gap"],
        "n_obs": len(sub),
        "status": "estimated",
    })

pbl = pd.DataFrame(participant_block_lambdas)

print(pbl.to_string(index=False))

bins = [-np.inf, 0, .2, .4, .6, .8, 1.0, np.inf]
labels = ["<0", "0–0.2", "0.2–0.4", "0.4–0.6", "0.6–0.8", "0.8–1.0", ">1.0"]

estimated = pbl[pbl["status"].eq("estimated")].copy()
estimated["lambda_bin"] = pd.cut(
    estimated["lambda_i_block"],
    bins=bins,
    labels=labels,
    include_lowest=True
)

print("\nBlock-specific participant-level lambda summaries:")
for b in sorted(estimated["block"].dropna().unique()):
    sub = estimated[estimated["block"].eq(b)]
    print(f"\nBlock {int(b)}")
    print(sub["lambda_i_block"].describe())
    print("\nHistogram:")
    print(sub["lambda_bin"].value_counts().sort_index().to_string())


import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

# Ensure these columns exist
# rounds: block, censoring_rule, p_hat, naive, bayes

rules = ["Only High", "Only Low", "Random Drop"]
blocks = [1, 2, 3]

fig, axes = plt.subplots(3, 1, figsize=(7, 14))

for i, b in enumerate(blocks):
    ax = axes[i]

    sub = rounds[rounds["block"] == b].copy()

    # Collapse to participant-level means (important for correct SEs)
    pbr = sub.groupby(["participant_uid", "censoring_rule"]).agg(
        response=("p_hat", "mean"),
        naive=("naive", "mean"),
        bayes=("bayes", "mean"),
    ).reset_index()

    # Aggregate across participants
    summary = pbr.groupby("censoring_rule").agg(
        response_mean=("response", "mean"),
        response_se=("response", lambda x: x.std(ddof=1)/np.sqrt(len(x))),
        naive_mean=("naive", "mean"),
        bayes_mean=("bayes", "mean"),
    ).reindex(rules)

    x = np.arange(len(rules))

    # Naive (single point)
    ax.scatter(x, summary["naive_mean"], label="Naive Bayes", zorder=3)

    # Bayes (single point)
    ax.scatter(x, summary["bayes_mean"], label="Approx Bayes", zorder=3)

    # Response (with normal-approximation 95% confidence intervals)
    ax.errorbar(
        x,
        summary["response_mean"],
        yerr=1.96 * summary["response_se"],
        fmt='o',
        label="Response",
        capsize=4,
        zorder=4
    )

    ax.set_xticks(x)
    ax.set_xticklabels(rules)
    ax.set_ylabel("Probability (High Machine)")
    ax.set_title(f"Block {b}: Response vs Benchmarks (95% CI)")
    ax.legend()

plt.tight_layout()
OUTPUT_DIR = Path(os.environ.get(
    "STUDY2_OUTPUT_DIR", Path(__file__).resolve().parent / "output"
))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
fig.savefig(OUTPUT_DIR / "Figure_2_statistical_panels.pdf", bbox_inches="tight")
fig.savefig(OUTPUT_DIR / "Figure_2_statistical_panels.png", dpi=300, bbox_inches="tight")

primary_cells_table.to_csv(OUTPUT_DIR / "lambda_by_block_and_rule.csv", index=False)
pd.DataFrame([primary_pooled]).to_csv(OUTPUT_DIR / "lambda_pooled.csv", index=False)
pd.DataFrame(ordering_pooled_rows).to_csv(OUTPUT_DIR / "ordering_contrasts.csv", index=False)
pd.DataFrame(dev_pooled_rows).to_csv(OUTPUT_DIR / "deviation_from_bayes_contrasts.csv", index=False)

plot_rows = []
for b in blocks:
    sub = rounds[rounds["block"].eq(b)]
    pbr = sub.groupby([PARTICIPANT_COL, "censoring_rule"]).agg(
        participant=("p_hat", "mean"), naive=("naive", "mean"), bayesian=("bayes", "mean")
    ).reset_index()
    summary = pbr.groupby("censoring_rule").agg(
        participant=("participant", "mean"), participant_se=("participant", "sem"),
        naive=("naive", "mean"), bayesian=("bayesian", "mean"), n=(PARTICIPANT_COL, "nunique")
    ).reset_index()
    summary["block"] = b
    plot_rows.append(summary)
pd.concat(plot_rows, ignore_index=True).to_csv(OUTPUT_DIR / "figure_plot_data.csv", index=False)
