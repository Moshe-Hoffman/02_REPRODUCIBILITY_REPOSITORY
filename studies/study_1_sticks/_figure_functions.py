#!/usr/bin/env python3

import argparse
import json
import math
import os
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
os.environ.setdefault("MPLBACKEND", "Agg")
os.environ.setdefault("MPLCONFIGDIR", str(SCRIPT_DIR / ".matplotlib_cache"))

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt


SUPPORT_MIN = 1
SUPPORT_MAX = 100

COLORS = {
    "Tallest visible": {"main": "#1F5AA6", "light": "#8FB5E8"},
    "Shortest visible": {"main": "#D97904", "light": "#F3BF7A"},
    "Random drop": {"main": "#666666"},
    "Pooled": {"main": "#333333"},
    "Zero": "#A0A0A0",
}


def read_data(path):
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".parquet":
        return pd.read_parquet(path)
    if suffix == ".csv":
        return pd.read_csv(path)
    raise ValueError("Input must be a .parquet or .csv file.")


def exact_hidden_mean(boundary, n_hidden, n_visible_at_boundary, direction):
    """
    Exact posterior mean of the hidden sticks for a discrete Uniform{1,...,100}
    sample, conditioning on the observed order statistics. This integrates
    exactly over possible ties at the censoring boundary.

    direction:
      "low"  -> lowest sticks hidden, so tallest sticks are visible
      "high" -> highest sticks hidden, so shortest sticks are visible
    """
    h = int(n_hidden)
    r = int(n_visible_at_boundary)
    b = int(boundary)

    if h == 0:
        return np.nan

    weights = []
    hidden_means = []

    for t in range(h + 1):
        # t = number of hidden sticks tied at the visible boundary
        if direction == "low":
            m = b - SUPPORT_MIN
            if h - t > 0 and m == 0:
                continue

            weight = (m ** (h - t)) / (
                math.factorial(h - t) * math.factorial(r + t)
            )

            if h - t > 0:
                mean_strict = (SUPPORT_MIN + b - 1) / 2
            else:
                mean_strict = 0.0

            hidden_sum = t * b + (h - t) * mean_strict

        elif direction == "high":
            m = SUPPORT_MAX - b
            if h - t > 0 and m == 0:
                continue

            weight = (m ** (h - t)) / (
                math.factorial(h - t) * math.factorial(r + t)
            )

            if h - t > 0:
                mean_strict = (b + 1 + SUPPORT_MAX) / 2
            else:
                mean_strict = 0.0

            hidden_sum = t * b + (h - t) * mean_strict

        else:
            raise ValueError("direction must be 'low' or 'high'.")

        weights.append(weight)
        hidden_means.append(hidden_sum / h)

    weights = np.asarray(weights, dtype=float)
    hidden_means = np.asarray(hidden_means, dtype=float)

    return float(np.sum(weights * hidden_means) / np.sum(weights))


def prepare_trials(df):
    x = df.copy()

    if "trial_type" in x.columns:
        stick_mask = x["trial_type"].astype(str).str.contains("stick", case=False, na=False)
        if stick_mask.any():
            x = x.loc[stick_mask].copy()

    required = [
        "N_Sticks_Covered",
        "estimate",
        "stick_covered",
        "stick_lengths",
        "censored_direction",
        "participant_id",
    ]
    missing = [c for c in required if c not in x.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    x["n_hidden"] = pd.to_numeric(x["N_Sticks_Covered"], errors="coerce")
    x["estimate_num"] = pd.to_numeric(x["estimate"], errors="coerce")
    x = x[x["n_hidden"].between(1, 9)].copy()
    x = x[x["estimate_num"].notna()].copy()

    def condition_label(v):
        v = str(v).strip().lower()
        if v == "low":
            return "Tallest visible"
        if v == "high":
            return "Shortest visible"
        if v == "random":
            return "Random drop"
        return np.nan

    x["condition"] = x["censored_direction"].map(condition_label)
    x = x[x["condition"].notna()].copy()

    visible_means = []
    bayes_means = []

    def as_list(value):
        """Accept native arrays (Parquet) or JSON arrays (public CSV)."""
        if isinstance(value, str):
            return json.loads(value)
        return list(value)

    for row in x.itertuples(index=False):
        lengths = as_list(row.stick_lengths)
        covered = as_list(row.stick_covered)

        visible = [
            float(length)
            for length, is_covered in zip(lengths, covered)
            if not bool(is_covered)
        ]

        if len(visible) == 0:
            visible_means.append(np.nan)
            bayes_means.append(np.nan)
            continue

        visible_mean = float(np.mean(visible))
        visible_means.append(visible_mean)

        h = int(row.n_hidden)
        direction = str(row.censored_direction).strip().lower()

        if direction == "low":
            boundary = min(visible)
            r = sum(v == boundary for v in visible)
            hidden_mean = exact_hidden_mean(
                boundary=boundary,
                n_hidden=h,
                n_visible_at_boundary=r,
                direction="low",
            )
            bayes = (sum(visible) + h * hidden_mean) / 10.0

        elif direction == "high":
            boundary = max(visible)
            r = sum(v == boundary for v in visible)
            hidden_mean = exact_hidden_mean(
                boundary=boundary,
                n_hidden=h,
                n_visible_at_boundary=r,
                direction="high",
            )
            bayes = (sum(visible) + h * hidden_mean) / 10.0

        else:
            bayes = np.nan

        bayes_means.append(bayes)

    x["visible_mean"] = visible_means
    x["bayes_exact"] = bayes_means
    x["participant"] = x["participant_id"].astype(str)

    return x


def summarize_raw(d):
    def se(s):
        return s.std(ddof=1) / math.sqrt(s.notna().sum())

    out = (
        d.groupby(["condition", "n_hidden"], as_index=False)
        .agg(
            participant_mean=("estimate_num", "mean"),
            participant_se=("estimate_num", se),
            visible_mean=("visible_mean", "mean"),
            N=("participant", "nunique"),
        )
    )
    out["ci95"] = 1.96 * out["participant_se"]
    return out


def summarize_residuals(d):
    selective = d[
        d["condition"].isin(["Tallest visible", "Shortest visible"])
    ].copy()

    selective["toward_visible_sign"] = np.sign(
        selective["visible_mean"] - selective["bayes_exact"]
    )
    selective["residual_toward_visible"] = (
        selective["estimate_num"] - selective["bayes_exact"]
    ) * selective["toward_visible_sign"]

    # Pooled: average the two selective conditions within participant x hidden-count.
    pooled_person = (
        selective.groupby(["participant", "n_hidden"], as_index=False)
        .agg(residual=("residual_toward_visible", "mean"))
    )

    pooled = (
        pooled_person.groupby("n_hidden", as_index=False)
        .agg(
            mean=("residual", "mean"),
            se=("residual", lambda s: s.std(ddof=1) / math.sqrt(s.notna().sum())),
            N=("participant", "nunique"),
        )
    )
    pooled["ci95"] = 1.96 * pooled["se"]

    # Unpooled: condition-specific participant means.
    unpooled_person = (
        selective.groupby(
            ["participant", "condition", "n_hidden"], as_index=False
        )
        .agg(residual=("residual_toward_visible", "mean"))
    )

    unpooled = (
        unpooled_person.groupby(["condition", "n_hidden"], as_index=False)
        .agg(
            mean=("residual", "mean"),
            se=("residual", lambda s: s.std(ddof=1) / math.sqrt(s.notna().sum())),
            N=("participant", "nunique"),
        )
    )
    unpooled["ci95"] = 1.96 * unpooled["se"]

    return pooled, unpooled


def style_axes(ax):
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="both", labelsize=9)


def plot_panel_a(ax, raw):
    # Light, dashed visible-stick means first.
    for condition in ["Tallest visible", "Shortest visible"]:
        s = raw[raw["condition"] == condition].sort_values("n_hidden")
        ax.plot(
            s["n_hidden"],
            s["visible_mean"],
            color=COLORS[condition]["light"],
            linestyle="--",
            linewidth=1.7,
            marker="s",
            markersize=4.5,
            label=f"{condition}: visible-stick mean (Naive)",
            zorder=1,
        )

    # Participant estimates for selective conditions.
    for condition in ["Tallest visible", "Shortest visible"]:
        s = raw[raw["condition"] == condition].sort_values("n_hidden")
        ax.errorbar(
            s["n_hidden"],
            s["participant_mean"],
            yerr=s["ci95"],
            color=COLORS[condition]["main"],
            linestyle="-",
            linewidth=2.0,
            marker="o",
            markersize=5,
            capsize=3,
            label=f"{condition}: participant estimate",
            zorder=3,
        )

    # Random-drop estimate: hollow gray diamonds, drawn last/on top.
    s = raw[raw["condition"] == "Random drop"].sort_values("n_hidden")
    ax.errorbar(
        s["n_hidden"],
        s["participant_mean"],
        yerr=s["ci95"],
        color=COLORS["Random drop"]["main"],
        linestyle=":",
        linewidth=1.9,
        marker="D",
        markersize=5.5,
        markerfacecolor="white",
        markeredgewidth=1.5,
        capsize=3,
        label="Random drop: participant estimate",
        zorder=6,
    )

    relevant = raw[raw["condition"].isin(
        ["Tallest visible", "Shortest visible", "Random drop"]
    )]
    ymin = min(relevant["participant_mean"].min(), relevant["visible_mean"].min())
    ymax = max(relevant["participant_mean"].max(), relevant["visible_mean"].max())
    pad = 0.06 * (ymax - ymin)

    ax.set_ylim(max(0, ymin - pad), min(100, ymax + pad))
    ax.set_xticks(range(1, 10))
    ax.set_xlabel("Number of hidden sticks", fontsize=10)
    ax.set_ylabel("Estimated mean of all 10 sticks", fontsize=10)
    ax.set_title("A  Raw estimates", loc="left", fontsize=11.5, fontweight="bold")
    style_axes(ax)

    handles, labels = ax.get_legend_handles_labels()
    order = [2, 0, 3, 1, 4]
    ax.legend(
        [handles[i] for i in order],
        [labels[i] for i in order],
        frameon=False,
        fontsize=7.3,
        loc="best",
    )


def plot_panel_b_pooled(ax, pooled):
    s = pooled.sort_values("n_hidden")

    ax.errorbar(
        s["n_hidden"],
        s["mean"],
        yerr=s["ci95"],
        color=COLORS["Pooled"]["main"],
        linewidth=2.0,
        marker="o",
        markersize=5,
        capsize=3.5,
    )
    ax.axhline(0, color=COLORS["Zero"], linestyle="--", linewidth=1.1)

    low = (s["mean"] - s["ci95"]).min()
    high = (s["mean"] + s["ci95"]).max()
    pad = 0.08 * (high - low)

    ax.set_ylim(low - pad, high + pad)
    ax.set_xticks(range(1, 10))
    ax.set_xlabel("Number of hidden sticks", fontsize=10)
    ax.set_ylabel(
        "Residual displacement toward visible sticks\nrelative to Bayesian benchmark",
        fontsize=10,
    )
    ax.set_title(
        "B  Residual bias (pooled)",
        loc="left",
        fontsize=11.5,
        fontweight="bold",
    )
    style_axes(ax)


def plot_panel_b_unpooled(ax, unpooled):
    for condition in ["Tallest visible", "Shortest visible"]:
        s = unpooled[unpooled["condition"] == condition].sort_values("n_hidden")
        ax.errorbar(
            s["n_hidden"],
            s["mean"],
            yerr=s["ci95"],
            color=COLORS[condition]["main"],
            linewidth=2.0,
            marker="o",
            markersize=5,
            capsize=3.5,
            label=condition,
        )

    ax.axhline(0, color=COLORS["Zero"], linestyle="--", linewidth=1.1)

    low = (unpooled["mean"] - unpooled["ci95"]).min()
    high = (unpooled["mean"] + unpooled["ci95"]).max()
    pad = 0.08 * (high - low)

    ax.set_ylim(low - pad, high + pad)
    ax.set_xticks(range(1, 10))
    ax.set_xlabel("Number of hidden sticks", fontsize=10)
    ax.set_ylabel(
        "Residual displacement toward visible sticks\nrelative to Bayesian benchmark",
        fontsize=10,
    )
    ax.set_title(
        "B  Residual bias (by condition)",
        loc="left",
        fontsize=11.5,
        fontweight="bold",
    )
    ax.legend(frameon=False, fontsize=8, loc="best")
    style_axes(ax)


def make_figures(data_path, output_dir):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    d = prepare_trials(read_data(data_path))
    raw = summarize_raw(d)
    pooled, unpooled = summarize_residuals(d)
    raw.to_csv(output_dir / "figure_1_panel_c_values.csv", index=False)
    pooled.to_csv(output_dir / "figure_1_panel_d_values.csv", index=False)

    # Pooled version.
    fig, axes = plt.subplots(1, 2, figsize=(12.0, 4.6))
    plot_panel_a(axes[0], raw)
    plot_panel_b_pooled(axes[1], pooled)
    fig.tight_layout(w_pad=2.2)
    fig.savefig(
        output_dir / "fig_sticks_pooled_main.pdf",
        bbox_inches="tight",
    )
    plt.close(fig)

    # Unpooled version.
    fig, axes = plt.subplots(1, 2, figsize=(12.0, 4.6))
    plot_panel_a(axes[0], raw)
    plot_panel_b_unpooled(axes[1], unpooled)
    fig.tight_layout(w_pad=2.2)
    fig.savefig(
        output_dir / "fig_sticks_unpooled_main.pdf",
        bbox_inches="tight",
    )
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument(
        "data",
        nargs="?",
        default=None,
        help="Optional path to the Study 1 .parquet or .csv file",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Optional output directory",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent

    # If launched by double-click / Python Launcher with no arguments, use the
    # canonical de-identified input distributed with the public repository.
    if args.data is None:
        data_path = script_dir / "data" / "study1_main_analysis_data.csv"
        if not data_path.exists():
            raise FileNotFoundError(
                f"The canonical Study 1 input is missing: {data_path}"
            )
    else:
        data_path = Path(args.data).expanduser().resolve()

    # Keep direct-launch output in the main reproduction output folder.
    output_dir = (
        Path(args.out).expanduser().resolve()
        if args.out is not None
        else script_dir / "output"
    )

    make_figures(data_path, output_dir)


if __name__ == "__main__":
    main()
