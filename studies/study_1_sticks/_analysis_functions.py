#!/usr/bin/env python3
"""Internal statistical functions used by the Study 1 reproduction scripts."""

from __future__ import annotations

import sys
import os
import subprocess
import importlib
import hashlib
import json
import math
import warnings
import logging
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(SCRIPT_DIR / ".matplotlib_cache"))

import pandas as pd


# ---------------------------------------------------------------------
# 0. Install/import dependencies
# ---------------------------------------------------------------------

REQUIRED_PACKAGES = [
    ("numpy", "numpy"),
    ("pandas", "pandas"),
    ("scipy", "scipy"),
    ("statsmodels", "statsmodels"),
    ("matplotlib", "matplotlib"),
    ("pyarrow", "pyarrow"),
]


def ensure_packages():
    for module_name, pip_name in REQUIRED_PACKAGES:
        try:
            importlib.import_module(module_name)
        except ImportError:
            print(f"\nInstalling missing package: {pip_name}")
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", pip_name]
            )


ensure_packages()

import numpy as np
import pandas as pd
from scipy.stats import norm
import statsmodels
import statsmodels.formula.api as smf

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

try:
    from statsmodels.tools.sm_exceptions import ConvergenceWarning
except Exception:
    ConvergenceWarning = Warning

# Suppress optimizer/numerical warning spam in the Python Launcher window.
# Important model-status information is checked explicitly below via
# result.converged and the random-effects singularity diagnostic.
np.seterr(all="ignore")
warnings.filterwarnings("ignore", category=RuntimeWarning)
warnings.filterwarnings("ignore", category=ConvergenceWarning)
logging.getLogger("statsmodels").setLevel(logging.ERROR)


# ---------------------------------------------------------------------
# 1. Analysis settings
# ---------------------------------------------------------------------

EXPECTED_FILENAME = "spin_task_july8 2.parquet"

# Compact user-facing output:
# By default this script writes ONE text file containing everything needed
# to share back for interpretation. It does not create the many intermediate
# CSVs/model-summary files or figures unless these are changed to True.
WRITE_DEBUG_FILES = False
GENERATE_FIGURES = True

LOW_ENDPOINT = 1.0
HIGH_ENDPOINT = 100.0
TOTAL_STICKS = 10

# Number hidden is used for model parameterization and figures. The midpoint is 5.
HIDDEN_CENTER = 5.0

CONDITION_ORDER = [
    "Tallest visible",
    "Random",
    "Shortest visible",
]

# Raw implementation labels describe WHICH STICKS WERE HIDDEN:
#   raw "high"   = tallest hidden  = shortest visible
#   raw "low"    = shortest hidden = tallest visible
#   raw "random" = random hidden
RAW_TO_CONDITION = {
    "low": "Tallest visible",
    "random": "Random",
    "high": "Shortest visible",
}

OUTCOME_SPECS = {
    "raw_estimate": {
        "label": "Raw estimates",
        # With number hidden on the x-axis:
        "directions": {
            "tall": "greater",
            "short": "less",
            "tall_hc": "greater",
            "short_hc": "less",
        },
    },
    "adjustment_visible": {
        "label": "Adjustment from visible mean",
        "directions": {
            "tall": "less",
            "short": "greater",
            "tall_hc": "less",
            "short_hc": "greater",
        },
    },
    "deviation_bayes": {
        "label": "Deviation from corrected-preregistered Bayesian baseline",
        "directions": {
            "tall": "greater",
            "short": "less",
            "tall_hc": "greater",
            "short_hc": "less",
        },
    },
    "deviation_bayes_exact": {
        "label": "Deviation from exact discrete Bayesian baseline (secondary)",
        "directions": {
            "tall": "greater",
            "short": "less",
            "tall_hc": "greater",
            "short_hc": "less",
        },
    },
}

FIXED_FORMULA_RHS = "tall + short + h_c + tall_hc + short_hc"

# Full correlated participant random-effects structure corresponding to all
# within-person fixed terms.
FULL_RE_FORMULA = "~ tall + short + h_c + tall_hc + short_hc"

# Optimizers are tried only if the preceding one fails to converge.
OPTIMIZERS = ["lbfgs", "bfgs", "cg", "powell"]


# ---------------------------------------------------------------------
# 2. Utility functions
# ---------------------------------------------------------------------

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def choose_input_file(folder: Path) -> Path:
    preferred = folder / EXPECTED_FILENAME
    if preferred.exists():
        return preferred

    candidates = sorted(folder.glob("*.parquet"))

    if len(candidates) == 1:
        return candidates[0]

    if len(candidates) == 0:
        raise FileNotFoundError(
            "No .parquet file was found in the same folder as this script."
        )

    print("\nMultiple Parquet files found:")
    for i, p in enumerate(candidates, start=1):
        print(f"  {i}. {p.name}")

    while True:
        ans = input("\nEnter the number of the file to analyze: ").strip()
        try:
            idx = int(ans)
            if 1 <= idx <= len(candidates):
                return candidates[idx - 1]
        except ValueError:
            pass
        print("Please enter one of the listed numbers.")


def normalize_list(x):
    """Convert ndarray/list/tuple/string representations to a Python list."""
    if x is None:
        return []

    if isinstance(x, np.ndarray):
        return x.tolist()

    if isinstance(x, list):
        return x

    if isinstance(x, tuple):
        return list(x)

    if isinstance(x, str):
        # JSON first, then literal_eval as a fallback.
        try:
            val = json.loads(x)
            if isinstance(val, list):
                return val
        except Exception:
            pass

        import ast
        val = ast.literal_eval(x)
        if isinstance(val, (list, tuple, np.ndarray)):
            return list(val)

    try:
        return list(x)
    except TypeError:
        raise ValueError(f"Could not interpret list-valued field: {x!r}")


def condition_from_raw(x):
    key = str(x).strip().lower()
    if key not in RAW_TO_CONDITION:
        raise ValueError(f"Unexpected censored_direction value: {x!r}")
    return RAW_TO_CONDITION[key]


def visible_values(row):
    lengths = [float(v) for v in normalize_list(row["stick_lengths"])]
    covered = [bool(v) for v in normalize_list(row["stick_covered"])]

    if len(lengths) != len(covered):
        raise ValueError(
            f"stick_lengths and stick_covered have different lengths "
            f"for participant {row['pid']}"
        )

    return [v for v, c in zip(lengths, covered) if not c]


def bayesian_benchmark(row):
    """
    Agreed trial-specific benchmark.

    Uses 1 and 100 as the support stated to participants (counterfactual to the deployed 1,...,99 generator).
    Random-treatment benchmark is the mean of the visible sticks.
    """
    m = int(row["m_revealed"])
    h = int(row["n_hidden"])
    mu = float(row["visible_mean"])
    vis = row["visible_values"]
    cond = row["condition"]

    if len(vis) == 0:
        raise ValueError("A trial has zero visible sticks.")

    if cond == "Random":
        return mu

    if cond == "Tallest visible":
        # Hidden sticks are the lower/shorter part of the sample.
        hidden_expectation = (LOW_ENDPOINT + min(vis)) / 2.0

    elif cond == "Shortest visible":
        # Hidden sticks are the upper/taller part of the sample.
        hidden_expectation = (max(vis) + HIGH_ENDPOINT) / 2.0

    else:
        raise ValueError(f"Unexpected condition: {cond}")

    return (m * mu + h * hidden_expectation) / TOTAL_STICKS



def exact_discrete_order_stat_mean(
    observed_by_position,
    n=TOTAL_STICKS,
    low=int(LOW_ENDPOINT),
    high=int(HIGH_ENDPOINT),
):
    """
    Exact posterior expected mean of n iid discrete-uniform draws after sorting,
    conditional on any subset of observed order statistics.

    Parameters
    ----------
    observed_by_position : dict
        1-indexed sorted position -> observed integer stick value.
        Example: {1: 12, 4: 37, 10: 91}.
    n : int
        Total number of draws.
    low, high : int
        Inclusive support of the discrete uniform generator.

    Method
    ------
    A sorted sample is uniquely described by counts c_v for each possible
    value v. Under iid discrete-uniform sampling, the probability of a sorted
    count vector is proportional to:

        1 / product_v c_v!

    because n! and (high-low+1)^(-n) are common constants.

    Dynamic programming sums these weights over all count vectors consistent
    with the observed order statistics while simultaneously accumulating the
    expected total stick sum. This handles ties exactly.

    The hiding mechanism itself contributes no additional value-dependent
    likelihood:
      * Tallest/Shortest hiding is deterministic conditional on h.
      * Random hiding chooses sorted positions independently of stick values.
    Thus conditioning on the observed values and observed covered-position
    pattern is sufficient.
    """
    observed_by_position = {
        int(pos): int(round(val))
        for pos, val in observed_by_position.items()
    }

    if any(pos < 1 or pos > n for pos in observed_by_position):
        raise ValueError("Observed order-statistic position outside 1..n.")

    if any(val < low or val > high for val in observed_by_position.values()):
        raise ValueError("Observed stick value outside the generator support.")

    # Check monotonicity of observed order statistics.
    ordered_obs = sorted(observed_by_position.items())
    for (p1, v1), (p2, v2) in zip(ordered_obs, ordered_obs[1:]):
        if p1 < p2 and v1 > v2:
            raise ValueError(
                "Observed order statistics are not nondecreasing."
            )

    # For each observed value v, record the minimum and maximum sorted
    # positions at which v is explicitly observed.
    positions_for_value = {}
    for pos, val in observed_by_position.items():
        positions_for_value.setdefault(val, []).append(pos)

    factorial = [math.factorial(i) for i in range(n + 1)]

    # Z[k] = total posterior weight after processing values up through v
    #        with exactly k sample positions filled.
    # S[k] = same weighted sum, but multiplied by total stick-sum accumulated.
    Z = np.zeros(n + 1, dtype=float)
    S = np.zeros(n + 1, dtype=float)
    Z[0] = 1.0

    for value in range(low, high + 1):
        obs_positions = positions_for_value.get(value, [])
        if obs_positions:
            min_pos = min(obs_positions)
            max_pos = max(obs_positions)
        else:
            min_pos = None
            max_pos = None

        new_Z = np.zeros(n + 1, dtype=float)
        new_S = np.zeros(n + 1, dtype=float)

        for k_prev in range(n + 1):
            if Z[k_prev] == 0:
                continue

            # If x_p == value for an observed position p, then fewer than p
            # observations can have values strictly below value.
            if min_pos is not None and k_prev >= min_pos:
                continue

            max_count = n - k_prev

            for count_here in range(max_count + 1):
                k_new = k_prev + count_here

                # All observed positions assigned this value must have been
                # reached after adding count_here copies of this value.
                if max_pos is not None and k_new < max_pos:
                    continue

                factor = 1.0 / factorial[count_here]

                new_Z[k_new] += Z[k_prev] * factor
                new_S[k_new] += (
                    S[k_prev] + Z[k_prev] * count_here * value
                ) * factor

        Z, S = new_Z, new_S

    if Z[n] <= 0 or not np.isfinite(Z[n]):
        raise RuntimeError(
            "Exact Bayesian dynamic program found no compatible samples."
        )

    expected_total_sum = S[n] / Z[n]
    return float(expected_total_sum / n)


def exact_discrete_bayesian_benchmark(row):
    """
    Exact E[full-sample mean | revealed values and covered-position pattern]
    under the participant-stated Uniform{1,...,100} support. The realized data still come from the deployed 1,...,99 generator.
    """
    lengths = [int(round(v)) for v in normalize_list(row["stick_lengths"])]
    covered = [bool(v) for v in normalize_list(row["stick_covered"])]

    if len(lengths) != TOTAL_STICKS or len(covered) != TOTAL_STICKS:
        raise ValueError(
            "Exact Bayesian benchmark expects exactly 10 stick positions."
        )

    observed_by_position = {
        pos + 1: lengths[pos]
        for pos in range(TOTAL_STICKS)
        if not covered[pos]
    }

    return exact_discrete_order_stat_mean(observed_by_position)


def validate_exact_bayes_engine():
    """
    Small deterministic self-tests for the exact Bayesian engine.
    These run before the real analysis and stop execution if the engine is
    altered in a way that breaks known cases.
    """
    # With nothing observed, the posterior is just the prior mean.
    prior = exact_discrete_order_stat_mean({}, n=4, low=1, high=4)
    assert abs(prior - 2.5) < 1e-12

    # With every order statistic observed, the posterior mean is known exactly.
    known = exact_discrete_order_stat_mean(
        {1: 1, 2: 2, 3: 3, 4: 4},
        n=4,
        low=1,
        high=4,
    )
    assert abs(known - 2.5) < 1e-12

    # Exact enumeration benchmark for observing the two largest order
    # statistics as 3 and 4 from 4 draws on support {1,2,3,4}.
    top_case = exact_discrete_order_stat_mean(
        {3: 3, 4: 4},
        n=4,
        low=1,
        high=4,
    )
    assert abs(top_case - 2.6578947368421053) < 1e-12

    # A non-contiguous/random-position case, also verified by exhaustive
    # enumeration over 4^4 raw draw sequences.
    random_case = exact_discrete_order_stat_mean(
        {2: 2, 4: 4},
        n=4,
        low=1,
        high=4,
    )
    assert abs(random_case - 2.585714285714286) < 1e-12


validate_exact_bayes_engine()


def directional_pvalue(beta, se, direction):
    z = beta / se

    if direction == "greater":
        return float(norm.sf(z))

    if direction == "less":
        return float(norm.cdf(z))

    raise ValueError(direction)


def random_covariance_is_singular(result, relative_tol=1e-6):
    """
    Diagnose a nearly singular correlated random-effects covariance matrix.
    """
    try:
        cov = np.asarray(result.cov_re, dtype=float)
        eigvals = np.linalg.eigvalsh(cov)
        largest = float(np.max(np.abs(eigvals)))

        if largest == 0:
            return True, eigvals

        singular = bool(np.min(eigvals) <= largest * relative_tol)
        return singular, eigvals

    except Exception:
        return True, np.array([])


def fit_full_correlated_mixed_model(data, outcome):
    formula = f"{outcome} ~ {FIXED_FORMULA_RHS}"

    diagnostics = []

    for optimizer in OPTIMIZERS:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")

            try:
                model = smf.mixedlm(
                    formula,
                    data=data,
                    groups=data["pid"],
                    re_formula=FULL_RE_FORMULA,
                )

                result = model.fit(
                    reml=True,
                    method=optimizer,
                    maxiter=3000,
                    disp=False,
                )

                diagnostics.append(
                    {
                        "optimizer": optimizer,
                        "converged": bool(result.converged),
                        "warning_count": len(caught),
                    }
                )

                if result.converged:
                    singular, eigvals = random_covariance_is_singular(result)

                    if not singular:
                        return result, {
                            "model_type": "full_correlated_random_slopes",
                            "optimizer": optimizer,
                            "singular": False,
                            "eigenvalues": eigvals.tolist(),
                            "attempts": diagnostics,
                        }

                    # Per the pre-specified hierarchy, a converged but singular
                    # full covariance triggers the independent-slopes fallback.
                    return None, {
                        "model_type": "full_correlated_random_slopes",
                        "optimizer": optimizer,
                        "singular": True,
                        "eigenvalues": eigvals.tolist(),
                        "attempts": diagnostics,
                    }

            except Exception as e:
                diagnostics.append(
                    {
                        "optimizer": optimizer,
                        "converged": False,
                        "error": repr(e),
                    }
                )

    return None, {
        "model_type": "full_correlated_random_slopes",
        "optimizer": None,
        "singular": None,
        "eigenvalues": [],
        "attempts": diagnostics,
    }


def fit_independent_random_slopes(data, outcome):
    """
    Same participant-level random slopes, but no estimated correlations among
    those slopes. A random intercept is retained.
    """
    formula = f"{outcome} ~ {FIXED_FORMULA_RHS}"

    vc_formula = {
        "tall": "0 + tall",
        "short": "0 + short",
        "h_c": "0 + h_c",
        "tall_hc": "0 + tall_hc",
        "short_hc": "0 + short_hc",
    }

    diagnostics = []

    for optimizer in OPTIMIZERS:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")

            try:
                model = smf.mixedlm(
                    formula,
                    data=data,
                    groups=data["pid"],
                    re_formula="1",
                    vc_formula=vc_formula,
                )

                result = model.fit(
                    reml=True,
                    method=optimizer,
                    maxiter=3000,
                    disp=False,
                )

                diagnostics.append(
                    {
                        "optimizer": optimizer,
                        "converged": bool(result.converged),
                        "warning_count": len(caught),
                    }
                )

                if result.converged:
                    return result, {
                        "model_type": "independent_random_slopes",
                        "optimizer": optimizer,
                        "attempts": diagnostics,
                    }

            except Exception as e:
                diagnostics.append(
                    {
                        "optimizer": optimizer,
                        "converged": False,
                        "error": repr(e),
                    }
                )

    return None, {
        "model_type": "independent_random_slopes",
        "optimizer": None,
        "attempts": diagnostics,
    }


def fit_preferred_mixed_model(data, outcome):
    """
    Locked hierarchy:
      1. Full correlated random-slopes model.
      2. If non-convergent or singular: same random slopes, independent.
      3. If both fail: no further mixed-model simplification is silently made.
         Participant-FE/clustered-SES remain available as robustness results.
    """
    full_result, full_diag = fit_full_correlated_mixed_model(data, outcome)

    if full_result is not None:
        return full_result, full_diag

    independent_result, independent_diag = fit_independent_random_slopes(
        data, outcome
    )

    combined_diag = {
        "full_correlated_attempt": full_diag,
        "independent_fallback": independent_diag,
    }

    if independent_result is not None:
        combined_diag["model_type"] = "independent_random_slopes"
        return independent_result, combined_diag

    combined_diag["model_type"] = "NO_CONVERGED_PRIMARY_MIXED_MODEL"
    return None, combined_diag


def mixed_result_table(result, outcome):
    label = OUTCOME_SPECS[outcome]["label"]
    directions = OUTCOME_SPECS[outcome]["directions"]

    rows = []

    for term in ["Intercept", "tall", "short", "h_c", "tall_hc", "short_hc"]:
        if term not in result.fe_params.index:
            continue

        beta = float(result.fe_params[term])
        se = float(result.bse_fe[term])
        z = beta / se
        p_two = float(2 * norm.sf(abs(z)))

        direction = directions.get(term)
        p_one = (
            directional_pvalue(beta, se, direction)
            if direction is not None
            else np.nan
        )

        rows.append(
            {
                "outcome": outcome,
                "outcome_label": label,
                "term": term,
                "beta": beta,
                "SE": se,
                "z": z,
                "p_two_sided": p_two,
                "preregistered_direction": direction or "",
                "p_one_sided_directional": p_one,
            }
        )

    return pd.DataFrame(rows)



def linear_combination_test(result, weights, direction=None):
    """
    Test a linear combination of fitted coefficients using the model's
    estimated covariance matrix.

    Works for both MixedLMResults (using fixed effects only) and OLS results.
    """
    if hasattr(result, "fe_params"):
        params = result.fe_params.copy()
        names = list(params.index)
        cov_full = result.cov_params()
        cov = np.asarray(cov_full.loc[names, names], dtype=float)
    else:
        params = result.params.copy()
        names = list(params.index)
        cov = np.asarray(result.cov_params().loc[names, names], dtype=float)

    c = np.array(
        [float(weights.get(name, 0.0)) for name in names],
        dtype=float,
    )

    beta = float(c @ np.asarray(params, dtype=float))
    variance = float(c @ cov @ c)
    variance = max(variance, 0.0)
    se = math.sqrt(variance)

    if se == 0:
        z = np.nan
        p_two = np.nan
        p_one = np.nan
    else:
        z = beta / se
        p_two = float(2 * norm.sf(abs(z)))
        p_one = (
            directional_pvalue(beta, se, direction)
            if direction is not None
            else np.nan
        )

    return {
        "estimate": beta,
        "SE": se,
        "z": z,
        "p_two_sided": p_two,
        "direction": direction or "",
        "p_one_sided_directional": p_one,
    }


def condition_specific_test_table(result, outcome, model_label):
    """
    Analyses 2 and 3: directly test the condition-specific outcomes against 0.

    Because h_c = number_hidden - 5:
      * 'level_at_5_hidden' is the fitted value at the midpoint of the design.
      * 'slope_per_hidden_stick' is the fitted change for one additional
        hidden stick.

    Random is retained descriptively with a two-sided test against 0.
    Directional one-sided tests are used only for the selective conditions.
    """
    if outcome not in [
        "adjustment_visible",
        "deviation_bayes",
        "deviation_bayes_exact",
    ]:
        return pd.DataFrame()

    if outcome == "adjustment_visible":
        level_directions = {
            "Tallest visible": "less",
            "Random": None,
            "Shortest visible": "greater",
        }
        slope_directions = {
            "Tallest visible": "less",
            "Random": None,
            "Shortest visible": "greater",
        }
    else:
        # For both Bayesian-deviation outcomes, insufficient correction means:
        # Tallest visible -> estimate above Bayes
        # Shortest visible -> estimate below Bayes
        # and these residuals grow in magnitude as more sticks are hidden.
        level_directions = {
            "Tallest visible": "greater",
            "Random": None,
            "Shortest visible": "less",
        }
        slope_directions = {
            "Tallest visible": "greater",
            "Random": None,
            "Shortest visible": "less",
        }

    specs = []

    # Fitted level at h_c = 0 (5 hidden sticks).
    level_weights = {
        "Random": {"Intercept": 1.0},
        "Tallest visible": {"Intercept": 1.0, "tall": 1.0},
        "Shortest visible": {"Intercept": 1.0, "short": 1.0},
    }

    # Fitted slope with respect to NUMBER HIDDEN.
    slope_weights = {
        "Random": {"h_c": 1.0},
        "Tallest visible": {"h_c": 1.0, "tall_hc": 1.0},
        "Shortest visible": {"h_c": 1.0, "short_hc": 1.0},
    }

    for condition in CONDITION_ORDER:
        specs.append(
            (
                condition,
                "level_at_5_hidden",
                level_weights[condition],
                level_directions[condition],
            )
        )
        specs.append(
            (
                condition,
                "slope_per_hidden_stick",
                slope_weights[condition],
                slope_directions[condition],
            )
        )

    rows = []

    for condition, quantity, weights, direction in specs:
        test = linear_combination_test(
            result,
            weights=weights,
            direction=direction,
        )

        rows.append(
            {
                "model": model_label,
                "outcome": outcome,
                "outcome_label": OUTCOME_SPECS[outcome]["label"],
                "condition": condition,
                "quantity": quantity,
                **test,
            }
        )

    return pd.DataFrame(rows)


def fit_clustered_participant_FE(data, outcome):
    """
    Robustness specification:
      OLS + participant fixed effects + participant-clustered SEs.
    """
    formula = (
        f"{outcome} ~ {FIXED_FORMULA_RHS} + C(pid)"
    )

    result = smf.ols(formula, data=data).fit(
        cov_type="cluster",
        cov_kwds={"groups": data["pid"]},
    )

    rows = []

    for term in ["Intercept", "tall", "short", "h_c", "tall_hc", "short_hc"]:
        if term not in result.params.index:
            continue

        beta = float(result.params[term])
        se = float(result.bse[term])
        stat = beta / se
        p_two = float(2 * norm.sf(abs(stat)))

        rows.append(
            {
                "outcome": outcome,
                "term": term,
                "beta": beta,
                "clustered_SE": se,
                "z_like_stat": stat,
                "p_two_sided_normal": p_two,
            }
        )

    return pd.DataFrame(rows), result


def fit_secondary_pooled_undercorrection(data):
    """
    Secondary, non-preregistered pooled summary.

    Direction-code the selective-censoring conditions so positive values always
    mean insufficient correction toward the visible evidence:

      Tallest visible:  U = estimate - Bayes
      Shortest visible: U = -(estimate - Bayes)

    Effect-code direction as +/- 0.5. Therefore the intercept at h_c = 0 is the
    average under-correction across Tallest-visible and Shortest-visible trials
    at the midpoint (5 hidden sticks).
    """
    s = data.loc[data["condition"] != "Random"].copy()

    s["under_correction"] = np.where(
        s["condition"].eq("Tallest visible"),
        s["deviation_bayes"],
        -s["deviation_bayes"],
    )

    s["direction_ec"] = np.where(
        s["condition"].eq("Tallest visible"),
        0.5,
        -0.5,
    )

    s["direction_hc"] = s["direction_ec"] * s["h_c"]

    formula = (
        "under_correction ~ h_c + direction_ec + direction_hc"
    )

    re_formula = "~ h_c + direction_ec + direction_hc"

    result = None
    diagnostics = []

    for optimizer in OPTIMIZERS:
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")

            try:
                model = smf.mixedlm(
                    formula,
                    data=s,
                    groups=s["pid"],
                    re_formula=re_formula,
                )

                candidate = model.fit(
                    reml=True,
                    method=optimizer,
                    maxiter=3000,
                    disp=False,
                )

                diagnostics.append(
                    {
                        "optimizer": optimizer,
                        "converged": bool(candidate.converged),
                        "warning_count": len(caught),
                    }
                )

                if candidate.converged:
                    result = candidate
                    break

            except Exception as e:
                diagnostics.append(
                    {
                        "optimizer": optimizer,
                        "converged": False,
                        "error": repr(e),
                    }
                )

    rows = []

    if result is not None:
        for term in ["Intercept", "h_c", "direction_ec", "direction_hc"]:
            beta = float(result.fe_params[term])
            se = float(result.bse_fe[term])
            z = beta / se
            p_two = float(2 * norm.sf(abs(z)))

            # The pooled substantive tests are:
            # Intercept > 0 and h_c > 0.
            direction = (
                "greater"
                if term in ["Intercept", "h_c"]
                else ""
            )

            p_one = (
                directional_pvalue(beta, se, "greater")
                if direction
                else np.nan
            )

            rows.append(
                {
                    "term": term,
                    "beta": beta,
                    "SE": se,
                    "z": z,
                    "p_two_sided": p_two,
                    "secondary_direction": direction,
                    "p_one_sided_directional": p_one,
                }
            )

    return pd.DataFrame(rows), diagnostics


def fit_benchmark_gap_lambda(data, benchmark_col, benchmark_label):
    """
    Secondary/exploratory Dot-style analysis for the existing Stick study.

    Restricts to the two selective-censoring conditions.

        A_it = estimate - visible_mean
        G_it = Bayesian_benchmark - visible_mean

    Fits:
        A_it ~ lambda * G_it + participant fixed effects

    with participant-clustered SEs.

    lambda = 0  -> no adjustment toward Bayes
    lambda = 1  -> full Bayesian adjustment
    0 < lambda < 1 -> partial / insufficient adjustment

    Also estimates lambda separately within Tallest-visible and
    Shortest-visible trials. This analysis was NOT preregistered for the
    original N=50 study; it is included to inform a possible replication.
    """
    s = data.loc[data["condition"] != "Random"].copy()
    s["bayes_gap"] = s[benchmark_col] - s["visible_mean"]

    rows = []

    def fit_one(d, scope_label):
        model = smf.ols(
            "adjustment_visible ~ bayes_gap + C(pid)",
            data=d,
        ).fit(
            cov_type="cluster",
            cov_kwds={"groups": d["pid"]},
        )

        lam = float(model.params["bayes_gap"])
        se = float(model.bse["bayes_gap"])
        z_vs_0 = lam / se
        p_gt_0 = float(norm.sf(z_vs_0))

        z_vs_1 = (lam - 1.0) / se
        p_lt_1 = float(norm.cdf(z_vs_1))

        rows.append(
            {
                "benchmark": benchmark_label,
                "scope": scope_label,
                "N_trials": int(len(d)),
                "N_participants": int(d["pid"].nunique()),
                "lambda": lam,
                "SE": se,
                "z_vs_0": z_vs_0,
                "p_lambda_gt_0": p_gt_0,
                "z_vs_1": z_vs_1,
                "p_lambda_lt_1": p_lt_1,
                "CI95_low": lam - 1.96 * se,
                "CI95_high": lam + 1.96 * se,
            }
        )

    fit_one(s, "Pooled selective conditions")

    for condition in ["Tallest visible", "Shortest visible"]:
        fit_one(
            s.loc[s["condition"].eq(condition)].copy(),
            condition,
        )

    # For the exact Bayesian benchmark only, Random trials also have a genuine
    # nonzero Bayesian gap because the displayed ranked positions of the hidden
    # sticks are informative. Estimate the same participant-FE / clustered-SE
    # lambda within Random as a generalization test.
    if benchmark_col == "bayes_exact_discrete":
        r = data.loc[data["condition"].eq("Random")].copy()
        r["bayes_gap"] = r[benchmark_col] - r["visible_mean"]
        fit_one(r, "Random")

    return pd.DataFrame(rows)




def fit_exact_lambda_m_and_treatment_comparisons(data):
    """
    Exploratory diagnostics for the exact-Bayes lambda.

    1) Compare treatment-specific lambdas while controlling flexibly for number
       hidden (C(n_hidden)), participant fixed effects, and treatment intercepts.

    2) Within each treatment, test whether lambda changes linearly with the
       number hidden:
           A ~ G + h_c + G:h_c + participant FE
       where the G coefficient is lambda at 5 hidden sticks and G:h_c is the
       change in lambda per additional hidden stick.

    All SEs are clustered by participant.
    """
    d = data.copy()
    d["bayes_gap_exact"] = (
        d["bayes_exact_discrete"] - d["visible_mean"]
    )
    d["h_c"] = d["n_hidden"] - 5

    condition_key = {
        "Tallest visible": "tall",
        "Random": "random",
        "Shortest visible": "short",
    }

    # ------------------------------------------------------------------
    # A. Treatment-specific lambdas, controlling for number hidden.
    # ------------------------------------------------------------------
    for condition, key in condition_key.items():
        d[f"g_{key}"] = np.where(
            d["condition"].astype(str).eq(condition),
            d["bayes_gap_exact"],
            0.0,
        )

    treatment_model = smf.ols(
        "adjustment_visible ~ C(pid) + C(condition) + C(n_hidden) "
        "+ g_tall + g_random + g_short",
        data=d,
    ).fit(
        cov_type="cluster",
        cov_kwds={"groups": d["pid"]},
    )

    treatment_rows = []
    for condition, key in condition_key.items():
        term = f"g_{key}"
        beta = float(treatment_model.params[term])
        se = float(treatment_model.bse[term])
        treatment_rows.append({
            "condition": condition,
            "lambda_m_controlled": beta,
            "SE": se,
            "p_lambda_gt_0": float(norm.sf(beta / se)),
            "p_lambda_lt_1": float(norm.cdf((beta - 1.0) / se)),
            "CI95_low": beta - 1.96 * se,
            "CI95_high": beta + 1.96 * se,
        })

    treatment_df = pd.DataFrame(treatment_rows)

    # Pairwise lambda differences from the same joint model.
    cov = treatment_model.cov_params()
    pair_rows = []
    pairs = [
        ("Random", "Tallest visible"),
        ("Random", "Shortest visible"),
        ("Shortest visible", "Tallest visible"),
    ]
    for a, b in pairs:
        ka = condition_key[a]
        kb = condition_key[b]
        ta, tb = f"g_{ka}", f"g_{kb}"
        diff = float(treatment_model.params[ta] - treatment_model.params[tb])
        var = float(
            cov.loc[ta, ta] + cov.loc[tb, tb] - 2.0 * cov.loc[ta, tb]
        )
        se = float(np.sqrt(max(var, 0.0)))
        z = diff / se if se > 0 else np.nan
        pair_rows.append({
            "contrast": f"{a} - {b}",
            "lambda_difference": diff,
            "SE": se,
            "z": z,
            "p_two_sided": float(2 * norm.sf(abs(z))) if np.isfinite(z) else np.nan,
        })
    pair_df = pd.DataFrame(pair_rows)

    # ------------------------------------------------------------------
    # B. Does lambda vary linearly with number hidden, within treatment?
    # ------------------------------------------------------------------
    trend_rows = []
    predicted_rows = []

    for condition in CONDITION_ORDER:
        s = d.loc[d["condition"].astype(str).eq(condition)].copy()
        model = smf.ols(
            "adjustment_visible ~ bayes_gap_exact * h_c + C(pid)",
            data=s,
        ).fit(
            cov_type="cluster",
            cov_kwds={"groups": s["pid"]},
        )

        lam5 = float(model.params["bayes_gap_exact"])
        slope = float(model.params["bayes_gap_exact:h_c"])
        se_slope = float(model.bse["bayes_gap_exact:h_c"])
        z_slope = slope / se_slope

        trend_rows.append({
            "condition": condition,
            "lambda_at_5_hidden": lam5,
            "lambda_change_per_additional_hidden": slope,
            "SE_change": se_slope,
            "z_change": z_slope,
            "p_two_sided_change": float(2 * norm.sf(abs(z_slope))),
        })

        covm = model.cov_params()
        for h in range(1, 10):
            hc = h - 5
            lam_h = lam5 + hc * slope
            var_h = float(
                covm.loc["bayes_gap_exact", "bayes_gap_exact"]
                + (hc ** 2) * covm.loc["bayes_gap_exact:h_c", "bayes_gap_exact:h_c"]
                + 2.0 * hc * covm.loc["bayes_gap_exact", "bayes_gap_exact:h_c"]
            )
            se_h = float(np.sqrt(max(var_h, 0.0)))
            predicted_rows.append({
                "condition": condition,
                "n_hidden": h,
                "n_revealed": 10 - h,
                "lambda_linear_fit": lam_h,
                "SE": se_h,
                "CI95_low": lam_h - 1.96 * se_h,
                "CI95_high": lam_h + 1.96 * se_h,
            })

    trend_df = pd.DataFrame(trend_rows)
    predicted_df = pd.DataFrame(predicted_rows)

    return treatment_df, pair_df, trend_df, predicted_df



def fit_center_heuristic_and_tracking(data, center=50.5):
    """
    Diagnose whether a simple fixed-center response can mechanically generate
    a high benchmark-gap lambda.

    For each scope:
      (1) Actual lambda:
          (estimate - visible_mean) ~ lambda * (Bayes_exact - visible_mean)
          + participant FE

      (2) Fixed-center heuristic lambda:
          (center - visible_mean) ~ lambda_center * (Bayes_exact - visible_mean)
          + participant FE

      (3) Trial-specific Bayes tracking around the center:
          (estimate - center) ~ beta_center * (Bayes_exact - center)
          + participant FE

    The third coefficient directly tests whether guesses covary with
    trial-specific deviations of the Bayesian benchmark around the known
    population center. A participant who always answers `center` has beta=0;
    a participant who exactly reports Bayes has beta=1.

    All SEs are clustered by participant.
    """
    d = data.copy()
    d["bayes_gap_exact"] = d["bayes_exact_discrete"] - d["visible_mean"]
    d["center_adjustment"] = center - d["visible_mean"]
    d["estimate_centered"] = d["raw_estimate"] - center
    d["bayes_centered"] = d["bayes_exact_discrete"] - center

    scopes = [
        ("Pooled selective conditions", d.loc[d["condition"] != "Random"].copy()),
        ("Tallest visible", d.loc[d["condition"].eq("Tallest visible")].copy()),
        ("Shortest visible", d.loc[d["condition"].eq("Shortest visible")].copy()),
        ("Random", d.loc[d["condition"].eq("Random")].copy()),
    ]

    lambda_rows = []
    tracking_rows = []

    def summarize_slope(model, term):
        beta = float(model.params[term])
        se = float(model.bse[term])
        return {
            "estimate": beta,
            "SE": se,
            "CI95_low": beta - 1.96 * se,
            "CI95_high": beta + 1.96 * se,
            "p_gt_0": float(norm.sf(beta / se)),
            "p_lt_1": float(norm.cdf((beta - 1.0) / se)),
        }

    for label, s in scopes:
        # Actual benchmark-gap lambda.
        actual_model = smf.ols(
            "adjustment_visible ~ bayes_gap_exact + C(pid)",
            data=s,
        ).fit(
            cov_type="cluster",
            cov_kwds={"groups": s["pid"]},
        )
        actual = summarize_slope(actual_model, "bayes_gap_exact")

        # Lambda produced by an artificial participant who always answers center.
        center_model = smf.ols(
            "center_adjustment ~ bayes_gap_exact + C(pid)",
            data=s,
        ).fit(
            cov_type="cluster",
            cov_kwds={"groups": s["pid"]},
        )
        center_lam = summarize_slope(center_model, "bayes_gap_exact")

        lambda_rows.append({
            "scope": label,
            "N_trials": int(len(s)),
            "actual_lambda": actual["estimate"],
            "actual_SE": actual["SE"],
            "fixed_center_lambda": center_lam["estimate"],
            "fixed_center_SE": center_lam["SE"],
            "actual_minus_fixed_center_lambda": (
                actual["estimate"] - center_lam["estimate"]
            ),
        })

        # Does the participant track trial-specific Bayes deviations around center?
        tracking_model = smf.ols(
            "estimate_centered ~ bayes_centered + C(pid)",
            data=s,
        ).fit(
            cov_type="cluster",
            cov_kwds={"groups": s["pid"]},
        )
        track = summarize_slope(tracking_model, "bayes_centered")

        tracking_rows.append({
            "scope": label,
            "N_trials": int(len(s)),
            "bayes_tracking_beta": track["estimate"],
            "SE": track["SE"],
            "CI95_low": track["CI95_low"],
            "CI95_high": track["CI95_high"],
            "p_beta_gt_0": track["p_gt_0"],
            "p_beta_lt_1": track["p_lt_1"],
        })

    dispersion = (
        d.groupby("condition", observed=True)
        .agg(
            N=("bayes_centered", "size"),
            mean_B_minus_center=("bayes_centered", "mean"),
            SD_B_minus_center=("bayes_centered", "std"),
            mean_abs_B_minus_center=(
                "bayes_centered",
                lambda x: np.mean(np.abs(x)),
            ),
            min_B_minus_center=("bayes_centered", "min"),
            max_B_minus_center=("bayes_centered", "max"),
        )
        .reset_index()
    )

    return (
        pd.DataFrame(lambda_rows),
        pd.DataFrame(tracking_rows),
        dispersion,
    )


def make_center_diagnostic_plots(data, outdir, center=50.5):
    """
    One plot per treatment.

    x = exact Bayesian benchmark - center
    y = participant guess

    Reference lines:
      horizontal y=center: fixed-center heuristic
      diagonal y=center+x: exact Bayesian response

    Also overlays decile-binned empirical means to make the trial-level trend
    visible without imposing a regression line.
    """
    for condition in CONDITION_ORDER:
        s = data.loc[data["condition"].eq(condition)].copy()
        s["x_bayes_centered"] = s["bayes_exact_discrete"] - center

        fig, ax = plt.subplots(figsize=(7.2, 5.4))

        ax.scatter(
            s["x_bayes_centered"],
            s["raw_estimate"],
            alpha=0.22,
            s=18,
            label="Participant trials",
        )

        x_min = float(s["x_bayes_centered"].min())
        x_max = float(s["x_bayes_centered"].max())
        pad = max(0.5, 0.05 * (x_max - x_min))
        x_line = np.linspace(x_min - pad, x_max + pad, 200)

        ax.axhline(
            center,
            linestyle="--",
            linewidth=1.5,
            label=f"Always answer {center:g}",
        )
        ax.plot(
            x_line,
            center + x_line,
            linestyle=":",
            linewidth=1.8,
            label="Exact Bayesian response",
        )

        # Quantile-binned empirical means.
        try:
            q = pd.qcut(
                s["x_bayes_centered"],
                q=10,
                duplicates="drop",
            )
            binned = (
                s.assign(_bin=q)
                .groupby("_bin", observed=True)
                .agg(
                    x_mean=("x_bayes_centered", "mean"),
                    y_mean=("raw_estimate", "mean"),
                    y_se=(
                        "raw_estimate",
                        lambda x: x.std(ddof=1) / np.sqrt(len(x)),
                    ),
                )
                .reset_index(drop=True)
            )
            ax.errorbar(
                binned["x_mean"],
                binned["y_mean"],
                yerr=binned["y_se"],
                fmt="o-",
                linewidth=1.8,
                capsize=3,
                label="Binned participant mean ± SE",
            )
        except Exception:
            pass

        ax.set_xlabel(f"Exact Bayesian benchmark − {center:g}")
        ax.set_ylabel("Participant guess")
        ax.set_title(f"{condition}: guesses vs trial-specific Bayesian benchmark")
        ax.legend(frameon=False)
        fig.tight_layout()

        safe = condition.lower().replace(" ", "_")
        fig.savefig(
            outdir / f"Figure_center_diagnostic_{safe}.png",
            dpi=220,
            bbox_inches="tight",
        )
        fig.savefig(
            outdir / f"Figure_center_diagnostic_{safe}.pdf",
            bbox_inches="tight",
        )
        plt.close(fig)


def empirical_cell_means(data):
    def se(x):
        x = pd.to_numeric(x, errors="coerce").dropna()
        return float(x.std(ddof=1) / math.sqrt(len(x)))

    rows = []

    for (condition, h), g in data.groupby(
        ["condition", "n_hidden"],
        observed=True,
        sort=False,
    ):
        row = {
            "condition": str(condition),
            "n_hidden": int(h),
            "m_revealed": int(TOTAL_STICKS - h),
            "N": int(len(g)),
            "raw_estimate_mean": float(g["raw_estimate"].mean()),
            "raw_estimate_SE": se(g["raw_estimate"]),
            "adjustment_visible_mean": float(g["adjustment_visible"].mean()),
            "adjustment_visible_SE": se(g["adjustment_visible"]),
            "deviation_bayes_mean": float(g["deviation_bayes"].mean()),
            "deviation_bayes_SE": se(g["deviation_bayes"]),
            "deviation_bayes_exact_mean": float(
                g["deviation_bayes_exact"].mean()
            ),
            "deviation_bayes_exact_SE": se(g["deviation_bayes_exact"]),
            "visible_mean_mean": float(g["visible_mean"].mean()),
            "bayes_mean": float(g["bayes"].mean()),
            "bayes_exact_discrete_mean": float(
                g["bayes_exact_discrete"].mean()
            ),
            "exact_minus_prereg_bayes_mean": float(
                g["exact_minus_prereg_bayes"].mean()
            ),
        }

        rows.append(row)

    out = pd.DataFrame(rows)

    out["condition"] = pd.Categorical(
        out["condition"],
        categories=CONDITION_ORDER,
        ordered=True,
    )

    return out.sort_values(["condition", "n_hidden"]).reset_index(drop=True)


def make_empirical_plot(
    cell_df,
    mean_col,
    se_col,
    ylabel,
    title,
    output_stem,
    outdir,
    ci_multiplier=1.0,
    interval_label="SEM",
    zero_line=False,
):
    """
    One standalone chart per output file. Points/lines are empirical cell means.
    There are NO fitted regression lines.
    """
    fig, ax = plt.subplots(figsize=(7.2, 4.8))

    markers = {
        "Tallest visible": "o",
        "Random": "s",
        "Shortest visible": "^",
    }

    for condition in CONDITION_ORDER:
        s = cell_df.loc[cell_df["condition"].eq(condition)].sort_values(
            "n_hidden"
        )

        ax.errorbar(
            s["n_hidden"],
            s[mean_col],
            yerr=ci_multiplier * s[se_col],
            marker=markers[condition],
            linewidth=1.5,
            capsize=3,
            label=condition,
        )

    if zero_line:
        ax.axhline(0, linewidth=0.8, linestyle="--")

    ax.set_xticks(range(1, 10))
    ax.set_xlabel("Number of sticks hidden")
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.legend(frameon=False)

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)

    fig.tight_layout()

    png = outdir / f"{output_stem}_{interval_label}.png"
    pdf = outdir / f"{output_stem}_{interval_label}.pdf"

    fig.savefig(png, dpi=300, bbox_inches="tight")
    fig.savefig(pdf, bbox_inches="tight")
    plt.close(fig)


# ---------------------------------------------------------------------
# 3. Load and audit data
# ---------------------------------------------------------------------

def prepare_analysis_data(df):
    required = [
        "trial_type",
        "participant_id",
        "censored_direction",
        "N_Sticks_Covered",
        "estimate",
        "stick_lengths",
        "stick_covered",
    ]

    missing = [c for c in required if c not in df.columns]

    if missing:
        raise ValueError(
            "The input data are missing required columns:\n  "
            + "\n  ".join(missing)
        )

    raw_n_pids = int(df["participant_id"].nunique(dropna=True))

    stick_all = df.loc[df["trial_type"].eq("stick-trial")].copy()

    if stick_all["participant_id"].isna().any():
        raise ValueError(
            "At least one stick trial is missing participant_id."
        )

    stick_all["pid"] = stick_all["participant_id"].astype(str)

    # ---- Repeat-participation audit ----
    repeated_pid_message = "session_id not available"

    if "session_id" in df.columns:
        pid_sessions = (
            df.dropna(subset=["prolific_pid"])
            .assign(pid=lambda x: x["prolific_pid"].astype(str))
            .groupby("pid")["session_id"]
            .nunique(dropna=True)
        )

        repeated = pid_sessions[pid_sessions > 1]

        if len(repeated):
            repeated_pid_message = (
                f"{len(repeated)} Prolific IDs appear in more than one "
                f"session_id: {list(repeated.index)}"
            )
        else:
            repeated_pid_message = (
                "No Prolific ID appears in more than one session_id."
            )

    # ---- Quiz attempts / preregistered comprehension exclusion ----
    quiz = df.loc[df["trial_type"].eq("survey-multi-choice")].copy()

    if len(quiz):
        quiz["pid"] = quiz["participant_id"].astype(str)

        quiz_attempts = (
            quiz.groupby("pid")
            .size()
            .rename("n_quiz_attempts")
            .reset_index()
        )

        quiz_attempts["n_failed_attempts"] = (
            quiz_attempts["n_quiz_attempts"] - 1
        ).clip(lower=0)

        quiz_attempts["exclude_fail_3plus"] = (
            quiz_attempts["n_failed_attempts"] >= 3
        )

    else:
        quiz_attempts = pd.DataFrame(
            columns=[
                "pid",
                "n_quiz_attempts",
                "n_failed_attempts",
                "exclude_fail_3plus",
            ]
        )

    excluded_quiz = set(
        quiz_attempts.loc[
            quiz_attempts["exclude_fail_3plus"], "pid"
        ].astype(str)
    )

    # ---- Reconstruct condition and visible/hidden counts ----
    stick_all["condition"] = stick_all["censored_direction"].apply(
        condition_from_raw
    )

    stick_all["estimate"] = pd.to_numeric(
        stick_all["estimate"], errors="coerce"
    )

    stick_all["n_hidden"] = pd.to_numeric(
        stick_all["N_Sticks_Covered"], errors="coerce"
    )

    if stick_all["n_hidden"].isna().any():
        raise ValueError("N_Sticks_Covered contains non-numeric values.")

    stick_all["n_hidden"] = stick_all["n_hidden"].astype(int)
    stick_all["m_revealed"] = TOTAL_STICKS - stick_all["n_hidden"]

    stick_all["visible_values"] = stick_all.apply(
        visible_values, axis=1
    )

    stick_all["visible_count_from_array"] = stick_all[
        "visible_values"
    ].apply(len)

    count_mismatch = stick_all.loc[
        stick_all["visible_count_from_array"]
        != stick_all["m_revealed"]
    ]

    if len(count_mismatch):
        raise ValueError(
            f"{len(count_mismatch)} trials disagree about the number "
            f"revealed between N_Sticks_Covered and stick_covered."
        )

    stick_all["visible_mean"] = stick_all["visible_values"].apply(np.mean)

    # ---- Completion audit ----
    # Complete = exactly one valid response in every one of the intended
    # 3 conditions x 9 hidden-count cells.
    cell_counts = (
        stick_all.dropna(subset=["estimate"])
        .groupby(["pid", "condition", "n_hidden"])
        .size()
        .rename("n")
        .reset_index()
    )

    n_valid_trials = (
        stick_all.dropna(subset=["estimate"])
        .groupby("pid")
        .size()
    )

    n_unique_cells = cell_counts.groupby("pid").size()

    each_cell_once = (
        cell_counts.groupby("pid")["n"]
        .apply(lambda x: bool((x == 1).all()))
    )

    intended_hidden = set(range(1, 10))

    correct_hidden_values = (
        stick_all.dropna(subset=["estimate"])
        .groupby("pid")["n_hidden"]
        .apply(lambda x: set(x.astype(int)) == intended_hidden)
    )

    complete_ids = []

    for pid in n_valid_trials.index:
        if (
            int(n_valid_trials.get(pid, 0)) == 27
            and int(n_unique_cells.get(pid, 0)) == 27
            and bool(each_cell_once.get(pid, False))
            and bool(correct_hidden_values.get(pid, False))
        ):
            complete_ids.append(str(pid))

    analytic_ids = [
        pid for pid in complete_ids
        if pid not in excluded_quiz
    ]

    data = stick_all.loc[
        stick_all["pid"].isin(analytic_ids)
    ].copy()

    # Do not silently proceed if an analytic Prolific ID has multiple sessions.
    if "session_id" in df.columns:
        analytic_session_counts = (
            df.loc[
                df["prolific_pid"].astype(str).isin(analytic_ids)
            ]
            .assign(pid=lambda x: x["prolific_pid"].astype(str))
            .groupby("pid")["session_id"]
            .nunique(dropna=True)
        )

        analytic_repeats = analytic_session_counts[
            analytic_session_counts > 1
        ]

        if len(analytic_repeats):
            raise RuntimeError(
                "STOPPED: At least one otherwise-analytic participant "
                "appears in multiple session IDs. No automatic de-duplication "
                "was performed. Participants:\n"
                + "\n".join(analytic_repeats.index)
            )

    # ---- Derived trial-level variables ----
    data["condition"] = pd.Categorical(
        data["condition"],
        categories=CONDITION_ORDER,
        ordered=True,
    )

    data["h_c"] = data["n_hidden"] - HIDDEN_CENTER

    data["tall"] = data["condition"].eq(
        "Tallest visible"
    ).astype(int)

    data["short"] = data["condition"].eq(
        "Shortest visible"
    ).astype(int)

    data["tall_hc"] = data["tall"] * data["h_c"]
    data["short_hc"] = data["short"] * data["h_c"]

    # Corrected-preregistered benchmark retained as the primary benchmark
    # for reproducing the original preregistered study.
    data["bayes"] = data.apply(
        bayesian_benchmark,
        axis=1,
    )

    # Exact posterior mean under the actual discrete generator and the exact
    # observed hidden/revealed position pattern. This is secondary/robustness.
    print(
        "Computing exact discrete Bayesian benchmarks "
        "(this can take a little while)..."
    )
    data["bayes_exact_discrete"] = data.apply(
        exact_discrete_bayesian_benchmark,
        axis=1,
    )

    data["raw_estimate"] = data["estimate"].astype(float)

    data["adjustment_visible"] = (
        data["raw_estimate"] - data["visible_mean"]
    )

    data["deviation_bayes"] = (
        data["raw_estimate"] - data["bayes"]
    )

    data["deviation_bayes_exact"] = (
        data["raw_estimate"] - data["bayes_exact_discrete"]
    )

    data["exact_minus_prereg_bayes"] = (
        data["bayes_exact_discrete"] - data["bayes"]
    )

    audit = {
        "raw_rows": int(len(df)),
        "raw_unique_prolific_ids": raw_n_pids,
        "stick_trial_rows": int(len(stick_all)),
        "complete_participants_before_quiz_exclusion": int(
            len(complete_ids)
        ),
        "participants_excluded_for_3plus_quiz_failures": int(
            len(excluded_quiz.intersection(complete_ids))
        ),
        "final_analytic_N": int(data["pid"].nunique()),
        "final_analytic_trials": int(len(data)),
        "repeat_pid_audit": repeated_pid_message,
    }

    return data, audit, quiz_attempts


def _fmt_num(x, digits=4):
    try:
        if pd.isna(x):
            return ""
    except Exception:
        pass

    try:
        x = float(x)
    except Exception:
        return str(x)

    if x != 0 and abs(x) < 0.0001:
        return f"{x:.3e}"
    return f"{x:.{digits}f}"


def dataframe_to_text(df, columns=None, digits=4):
    if df is None or len(df) == 0:
        return "(no rows)"

    d = df.copy()

    if columns is not None:
        columns = [c for c in columns if c in d.columns]
        d = d[columns]

    for col in d.columns:
        if pd.api.types.is_numeric_dtype(d[col]):
            d[col] = d[col].map(lambda x: _fmt_num(x, digits))

    return d.to_string(index=False)


def concise_diagnostic(diagnostics):
    if diagnostics is None:
        return "No diagnostics."

    if diagnostics.get("model_type") == "full_correlated_random_slopes":
        eig = diagnostics.get("eigenvalues", [])
        eig_txt = ""
        if eig:
            eig_txt = (
                f"; random-cov eigenvalue range "
                f"[{min(eig):.6g}, {max(eig):.6g}]"
            )
        return (
            "full correlated random slopes; "
            f"optimizer={diagnostics.get('optimizer')}; "
            f"singular={diagnostics.get('singular')}"
            f"{eig_txt}"
        )

    if diagnostics.get("model_type") == "independent_random_slopes":
        fallback = diagnostics.get("independent_fallback", {})
        return (
            "independent-random-slopes fallback; "
            f"optimizer={fallback.get('optimizer')}"
        )

    return str(diagnostics.get("model_type", "unknown"))


def build_share_report(
    input_path,
    audit,
    mixed_results,
    condition_specific_mixed,
    robustness,
    condition_specific_clustered,
    benchmark_summary_full,
    benchmark_by_cell,
    lambda_results,
    exact_lambda_by_treatment_mcontrolled,
    exact_lambda_pairwise,
    exact_lambda_m_trends,
    exact_lambda_by_h_linear,
    center_heuristic_lambda,
    center_tracking,
    bayes_center_dispersion,
    secondary,
    cell_df,
    primary_diagnostics,
    secondary_diag,
):
    lines = []

    def section(title):
        lines.extend(["", "=" * 92, title, "=" * 92])

    lines.append("STICK STUDY — PARTICIPANT-STATED SUPPORT 1–100 SENSITIVITY ANALYSIS")
    lines.append(f"Run time: {datetime.now().isoformat()}")
    lines.append(f"Input file: {input_path.name}")
    lines.append(f"Input SHA256: {sha256_file(input_path)}")

    section("1. SAMPLE AUDIT")
    for k, v in audit.items():
        lines.append(f"{k}: {v}")

    section("2. CORRECTED-PREREGISTERED VS EXACT DISCRETE BAYESIAN BENCHMARK")
    lines.append(
        "exact_minus_prereg = exact discrete Bayes minus corrected-preregistered Bayes."
    )
    lines.append(
        dataframe_to_text(
            benchmark_summary_full,
            [
                "condition",
                "N",
                "mean_exact_minus_prereg",
                "mean_abs_difference",
                "max_abs_difference",
            ],
        )
    )

    section("3. BENCHMARK COMPARISON BY CONDITION × NUMBER HIDDEN")
    lines.append(
        dataframe_to_text(
            benchmark_by_cell,
            [
                "condition",
                "n_hidden",
                "N",
                "prereg_bayes_mean",
                "exact_bayes_mean",
                "mean_exact_minus_prereg",
                "mean_abs_difference",
            ],
        )
    )

    section("4. MIXED-MODEL FIXED EFFECTS")
    lines.append("Random is omitted; number hidden is centered at 5.")
    focal = mixed_results.loc[
        mixed_results["term"].isin(
            ["tall", "short", "tall_hc", "short_hc"]
        )
    ]
    lines.append(
        dataframe_to_text(
            focal,
            [
                "outcome_label",
                "term",
                "beta",
                "SE",
                "z",
                "p_two_sided",
                "preregistered_direction",
                "p_one_sided_directional",
                "model_used",
            ],
        )
    )

    section("5. CONDITION-SPECIFIC TESTS — PREFERRED MIXED MODEL")
    lines.append(
        "For adjustment/Bayes outcomes: fitted level at 5 hidden sticks and "
        "fitted slope per additional hidden stick, tested directly against zero."
    )
    lines.append(
        dataframe_to_text(
            condition_specific_mixed,
            [
                "outcome_label",
                "condition",
                "quantity",
                "estimate",
                "SE",
                "z",
                "p_two_sided",
                "direction",
                "p_one_sided_directional",
            ],
        )
    )

    section("6. DOT-STYLE BENCHMARK-GAP ANALYSIS (SECONDARY/EXPLORATORY)")
    lines.append(
        "A = estimate - visible mean; G = Bayes - visible mean. "
        "Participant fixed effects; participant-clustered SEs. "
        "lambda=0 means no correction; lambda=1 means full Bayesian correction."
    )
    lines.append(
        dataframe_to_text(
            lambda_results,
            [
                "benchmark",
                "scope",
                "N_trials",
                "N_participants",
                "lambda",
                "SE",
                "p_lambda_gt_0",
                "p_lambda_lt_1",
                "CI95_low",
                "CI95_high",
            ],
        )
    )

    section("6B. EXACT-BAYES LAMBDA: TREATMENT COMPARISONS AND VARIATION WITH NUMBER HIDDEN")
    lines.append(
        "Treatment-specific lambdas below come from one joint participant-FE model "
        "with participant-clustered SEs and fixed effects for treatment and number hidden. "
        "Thus the treatment comparison controls for the balanced censoring-severity levels."
    )
    lines.append(
        dataframe_to_text(
            exact_lambda_by_treatment_mcontrolled,
            [
                "condition",
                "lambda_m_controlled",
                "SE",
                "p_lambda_gt_0",
                "p_lambda_lt_1",
                "CI95_low",
                "CI95_high",
            ],
        )
    )
    lines.append("")
    lines.append("Pairwise differences in the m-controlled treatment lambdas:")
    lines.append(
        dataframe_to_text(
            exact_lambda_pairwise,
            [
                "contrast",
                "lambda_difference",
                "SE",
                "z",
                "p_two_sided",
            ],
        )
    )
    lines.append("")
    lines.append(
        "Within-treatment linear trend: lambda(h) = lambda_at_5_hidden + "
        "(h-5) * lambda_change_per_additional_hidden."
    )
    lines.append(
        dataframe_to_text(
            exact_lambda_m_trends,
            [
                "condition",
                "lambda_at_5_hidden",
                "lambda_change_per_additional_hidden",
                "SE_change",
                "z_change",
                "p_two_sided_change",
            ],
        )
    )
    lines.append("")
    lines.append("Implied lambda at each censoring level under the linear trend model:")
    lines.append(
        dataframe_to_text(
            exact_lambda_by_h_linear,
            [
                "condition",
                "n_hidden",
                "n_revealed",
                "lambda_linear_fit",
                "SE",
                "CI95_low",
                "CI95_high",
            ],
        )
    )

    section("6C. FIXED-CENTER HEURISTIC DIAGNOSTIC")
    lines.append(
        "Assumed participant-belief support for this sensitivity analysis is Uniform{1,...,100}, whose population center is 50.5. The realized data were generated by the original 1,...,99 code. "
        "The fixed-center lambda asks what benchmark-gap lambda would be obtained by an "
        "artificial participant who answered 50 on every trial."
    )
    lines.append(
        dataframe_to_text(
            center_heuristic_lambda,
            [
                "scope",
                "N_trials",
                "actual_lambda",
                "actual_SE",
                "fixed_center_lambda",
                "fixed_center_SE",
                "actual_minus_fixed_center_lambda",
            ],
        )
    )
    lines.append("")
    lines.append(
        "Bayes-tracking regression around the center: "
        "(guess - 50) ~ beta * (exact Bayes - 50) + participant FE. "
        "beta=0 is consistent with always answering 50; beta=1 corresponds to "
        "tracking the exact Bayesian benchmark one-for-one."
    )
    lines.append(
        dataframe_to_text(
            center_tracking,
            [
                "scope",
                "N_trials",
                "bayes_tracking_beta",
                "SE",
                "CI95_low",
                "CI95_high",
                "p_beta_gt_0",
                "p_beta_lt_1",
            ],
        )
    )
    lines.append("")
    lines.append("How much the exact Bayesian benchmark itself varies around 50:")
    lines.append(
        dataframe_to_text(
            bayes_center_dispersion,
            [
                "condition",
                "N",
                "mean_B_minus_center",
                "SD_B_minus_center",
                "mean_abs_B_minus_center",
                "min_B_minus_center",
                "max_B_minus_center",
            ],
        )
    )

    section("7. PARTICIPANT-FE / CLUSTERED-SE ROBUSTNESS")
    robust_focal = robustness.loc[
        robustness["term"].isin(
            ["tall", "short", "tall_hc", "short_hc"]
        )
    ]
    lines.append(
        dataframe_to_text(
            robust_focal,
            [
                "outcome",
                "term",
                "beta",
                "clustered_SE",
                "z_like_stat",
                "p_two_sided_normal",
            ],
        )
    )

    section("8. CONDITION-SPECIFIC CLUSTERED-FE ROBUSTNESS")
    lines.append(
        dataframe_to_text(
            condition_specific_clustered,
            [
                "outcome_label",
                "condition",
                "quantity",
                "estimate",
                "SE",
                "z",
                "p_two_sided",
                "direction",
                "p_one_sided_directional",
            ],
        )
    )

    section("9. SECONDARY POOLED DIRECTION-CODED UNDER-CORRECTION")
    lines.append(
        dataframe_to_text(
            secondary,
            [
                "term",
                "beta",
                "SE",
                "z",
                "p_two_sided",
                "secondary_direction",
                "p_one_sided_directional",
            ],
        )
    )

    section("10. EMPIRICAL CONDITION × NUMBER-HIDDEN CELL MEANS")
    lines.append("Actual cell means; no fitted regression predictions.")
    lines.append(
        dataframe_to_text(
            cell_df,
            [
                "condition",
                "n_hidden",
                "N",
                "raw_estimate_mean",
                "raw_estimate_SE",
                "adjustment_visible_mean",
                "adjustment_visible_SE",
                "deviation_bayes_mean",
                "deviation_bayes_SE",
                "deviation_bayes_exact_mean",
                "deviation_bayes_exact_SE",
                "visible_mean_mean",
                "bayes_mean",
                "bayes_exact_discrete_mean",
            ],
        )
    )

    section("11. CONCISE MODEL DIAGNOSTICS")
    for outcome, diag in primary_diagnostics.items():
        lines.append(
            f"{OUTCOME_SPECS[outcome]['label']}: {concise_diagnostic(diag)}"
        )

    if secondary_diag:
        converged = [
            d for d in secondary_diag
            if d.get("converged")
        ]
        if converged:
            lines.append(
                "Secondary pooled under-correction: converged; "
                f"optimizer={converged[0].get('optimizer')}"
            )
        else:
            lines.append(
                "Secondary pooled under-correction: did not converge."
            )

    section("12. ANALYSIS NOTES")
    lines.append(
        "IMPORTANT SUPPORT ASSUMPTION: this run intentionally computes Bayesian "
        "benchmarks as if participants' stated support Uniform{1,...,100} were true. "
        "The original deployed generator actually produced values 1,...,99. "
        "This is therefore the participant-information sensitivity analysis."
    )
    lines.append(
        "Corrected-preregistered benchmark: selective conditions use midpoint "
        "formula with participant-stated 1/100 endpoints for this sensitivity analysis; Random uses visible mean."
    )
    lines.append(
        "Exact discrete benchmark: exact posterior expected full-sample mean "
        "under iid Uniform{1,...,100}, conditioning on revealed values and their "
        "sorted positions; ties handled exactly."
    )
    lines.append(
        "The exact-Bayes and Dot-style lambda analyses were not preregistered "
        "for the original N=50 study and should be described as secondary/"
        "exploratory if reported."
    )

    return "\n".join(lines) + "\n"



# ---------------------------------------------------------------------
# 4. Main analysis
# ---------------------------------------------------------------------


def make_candidate_stick_figures_only(data, outdir):
    """
    Create only the two candidate manuscript figures discussed in chat.

    Figure A: correction away from the visible-stick mean
              (0 = naive benchmark), with participant correction and exact
              Bayesian correction shown as a function of number hidden.

    Figure B: direction-coded residual from exact Bayes
              (positive = under-correction toward the selectively observed
              evidence), shown as a function of number hidden.

    Output:
      figures_for_inspection/
        stick_candidate_A_correction_vs_bayes_two_panel.png
        stick_candidate_A_correction_vs_bayes_two_panel.pdf
        stick_candidate_B_residual_vs_bayes_two_panel.png
        stick_candidate_B_residual_vs_bayes_two_panel.pdf

    No other files are written.
    """
    figdir = Path(outdir) / "figures_for_inspection"
    figdir.mkdir(parents=True, exist_ok=True)

    d = data.copy()

    # Sign convention so positive means "correct upward from visible mean":
    # - Tallest visible: visible mean is too high, so Bayes - visible_mean < 0.
    #   Multiply by -1 to orient the correction positively.
    # - Shortest visible: visible mean is too low, so Bayes - visible_mean > 0.
    #   Keep positive orientation.
    sign_map = {
        "Tallest visible": -1.0,
        "Shortest visible": 1.0,
    }

    selective = d.loc[d["condition"].isin(["Tallest visible", "Shortest visible"])].copy()
    selective["sign"] = selective["condition"].map(sign_map).astype(float)

    # Figure A quantities
    selective["participant_correction"] = selective["sign"] * (
        selective["raw_estimate"] - selective["visible_mean"]
    )
    selective["bayes_correction"] = selective["sign"] * (
        selective["bayes_exact_discrete"] - selective["visible_mean"]
    )

    # Figure B quantity: positive = under-correction toward selectively observed evidence
    # Tallest visible: under-correction if estimate > Bayes  -> residual = estimate - Bayes
    # Shortest visible: under-correction if estimate < Bayes -> residual = Bayes - estimate
    selective["under_correction_residual"] = selective["sign"] * (
        selective["bayes_exact_discrete"] - selective["raw_estimate"]
    )

    # Aggregate to condition x number-hidden cells
    corr_df = (
        selective.groupby(["condition", "n_hidden"], observed=False)
        .agg(
            participant_mean=("participant_correction", "mean"),
            participant_sd=("participant_correction", "std"),
            n=("participant_correction", "count"),
            bayes_mean=("bayes_correction", "mean"),
        )
        .reset_index()
    )
    corr_df["participant_se"] = corr_df["participant_sd"] / corr_df["n"] ** 0.5
    corr_df["participant_ci95"] = 1.96 * corr_df["participant_se"]

    resid_df = (
        selective.groupby(["condition", "n_hidden"], observed=False)
        .agg(
            residual_mean=("under_correction_residual", "mean"),
            residual_sd=("under_correction_residual", "std"),
            n=("under_correction_residual", "count"),
        )
        .reset_index()
    )
    resid_df["residual_se"] = resid_df["residual_sd"] / resid_df["n"] ** 0.5
    resid_df["residual_ci95"] = 1.96 * resid_df["residual_se"]

    order = ["Tallest visible", "Shortest visible"]

    # -------- Figure A: participant correction vs Bayesian correction --------
    fig, axes = plt.subplots(1, 2, figsize=(10.6, 4.2), sharex=True, sharey=True)

    for ax, condition in zip(axes, order):
        sub = corr_df.loc[corr_df["condition"].eq(condition)].sort_values("n_hidden")

        ax.errorbar(
            sub["n_hidden"],
            sub["participant_mean"],
            yerr=sub["participant_ci95"],
            marker="o",
            capsize=3,
            linewidth=1.9,
            label="Participant correction",
        )
        ax.plot(
            sub["n_hidden"],
            sub["bayes_mean"],
            marker="^",
            linewidth=1.9,
            label="Exact Bayesian correction",
        )
        ax.axhline(0, linestyle="--", linewidth=1.2, label="No correction")
        ax.set_title(condition)
        ax.set_xlabel("Number of sticks hidden")
        ax.set_xticks(range(1, 10))
        ax.set_xlim(0.7, 9.3)

    axes[0].set_ylabel("Correction away from visible-stick mean")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=3, frameon=False, bbox_to_anchor=(0.5, 1.03))
    fig.tight_layout(rect=[0, 0, 1, 0.95])

    fig.savefig(figdir / "stick_candidate_A_correction_vs_bayes_two_panel.png", dpi=300, bbox_inches="tight")
    fig.savefig(figdir / "stick_candidate_A_correction_vs_bayes_two_panel.pdf", bbox_inches="tight")
    plt.close(fig)

    # -------- Figure B: direction-coded residual from exact Bayes --------
    fig, axes = plt.subplots(1, 2, figsize=(10.6, 4.2), sharex=True, sharey=True)

    for ax, condition in zip(axes, order):
        sub = resid_df.loc[resid_df["condition"].eq(condition)].sort_values("n_hidden")

        ax.errorbar(
            sub["n_hidden"],
            sub["residual_mean"],
            yerr=sub["residual_ci95"],
            marker="o",
            capsize=3,
            linewidth=1.9,
            label="Residual under-correction",
        )
        ax.axhline(0, linestyle="--", linewidth=1.2, label="Bayesian estimate")
        ax.set_title(condition)
        ax.set_xlabel("Number of sticks hidden")
        ax.set_xticks(range(1, 10))
        ax.set_xlim(0.7, 9.3)

    axes[0].set_ylabel("Signed residual from exact Bayes\n(positive = under-correction)")
    handles, labels = axes[0].get_legend_handles_labels()
    fig.legend(handles, labels, loc="upper center", ncol=2, frameon=False, bbox_to_anchor=(0.5, 1.03))
    fig.tight_layout(rect=[0, 0, 1, 0.95])

    fig.savefig(figdir / "stick_candidate_B_residual_vs_bayes_two_panel.png", dpi=300, bbox_inches="tight")
    fig.savefig(figdir / "stick_candidate_B_residual_vs_bayes_two_panel.pdf", bbox_inches="tight")
    plt.close(fig)

    print("Saved only these figure files:")
    print("  figures_for_inspection/stick_candidate_A_correction_vs_bayes_two_panel.png")
    print("  figures_for_inspection/stick_candidate_A_correction_vs_bayes_two_panel.pdf")
    print("  figures_for_inspection/stick_candidate_B_residual_vs_bayes_two_panel.png")
    print("  figures_for_inspection/stick_candidate_B_residual_vs_bayes_two_panel.pdf")


