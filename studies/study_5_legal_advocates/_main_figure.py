"""Regenerate the data-driven panels used in main-text Figure 5."""

from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


BLUE = "#2878B5"
ORANGE = "#F27C0E"
TEAL = "#1B9E77"
PURPLE = "#8064A2"
CHARCOAL = "#4D4D4D"


def _finish_bar_axis(ax) -> None:
    ax.axhline(0, color=BLUE, linewidth=0.8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", color="#E8E8E8", linewidth=0.6)
    ax.set_axisbelow(True)


def _mean_ci(frame: pd.DataFrame, groups: list[str], value: str) -> pd.DataFrame:
    out = frame.groupby(groups, observed=True)[value].agg(["mean", "sem", "count"]).reset_index()
    out["ci95"] = 1.96 * out["sem"]
    return out


def _grouped_bars(ax, stats, x_col, x_order, ylabel) -> None:
    width = 0.36
    x = np.arange(len(x_order), dtype=float)
    for i, (role, color) in enumerate([
        ("Defendant advocate", BLUE),
        ("Plaintiff advocate", ORANGE),
    ]):
        sub = stats.loc[stats["role"].eq(role)].set_index(x_col)
        means = [sub.loc[item, "mean"] for item in x_order]
        cis = [sub.loc[item, "ci95"] for item in x_order]
        ax.bar(x + (i - 0.5) * width, means, width, color=color, label=role, zorder=2)
        ax.errorbar(x + (i - 0.5) * width, means, yerr=cis, fmt="none",
                    ecolor="black", capsize=3, linewidth=1, zorder=3)
    ax.set_xticks(x, x_order)
    ax.set_ylabel(ylabel)
    ax.legend(frameon=False, loc="upper left", fontsize=8)
    _finish_bar_axis(ax)


def build(output: Path) -> None:
    claim = pd.read_csv(output / "claim_update_table.csv")
    verdict = pd.read_csv(output / "verdict_update_table.csv")
    attenuation = pd.read_csv(output / "raw_change_attenuation_summary.csv")

    claim["change"] = claim["Y_post"] - claim["Y_pre"]
    verdict["change"] = verdict["Y_post_verdict"] - verdict["Y_pre_verdict"]
    role = {0: "Defendant advocate", 1: "Plaintiff advocate"}

    claim_person = claim.groupby(["pid", "advocate_plaintiff"], as_index=False)["change"].mean()
    claim_person["outcome"] = "Disputed claims"
    verdict_person = verdict[["pid", "advocate_plaintiff", "change"]].copy()
    verdict_person["outcome"] = "Overall verdict"
    advocacy = pd.concat([claim_person, verdict_person], ignore_index=True)
    advocacy["role"] = advocacy["advocate_plaintiff"].map(role)
    advocacy_stats = _mean_ci(advocacy, ["outcome", "role"], "change")

    claim["condition"] = np.select(
        [
            claim["P_shown"].eq(0) & claim["D_shown"].eq(1),
            claim["P_shown"].eq(1) & claim["D_shown"].eq(1),
            claim["P_shown"].eq(1) & claim["D_shown"].eq(0),
        ],
        ["Defendant only", "Both sides", "Plaintiff only"],
        default="Other",
    )
    claim["role"] = claim["advocate_plaintiff"].map(role)
    responsiveness = (
        claim.loc[claim["condition"].ne("Other")]
        .groupby(["pid", "role", "condition"], observed=True, as_index=False)["change"].mean()
    )
    responsiveness_stats = _mean_ci(responsiveness, ["condition", "role"], "change")

    quantity_labels = {
        "claim_advocacy_beta_MR": "Claim advocacy",
        "verdict_advocacy_beta_MR": "Verdict advocacy",
        "claim_asymmetry_gamma_P_plus_gamma_D": "Asymmetric updating",
    }
    specification_labels = {
        "reference_only": "Sharing only",
        "all_process": "All process measures",
    }
    attenuation_rows = []
    for quantity, estimand in quantity_labels.items():
        base = attenuation.loc[
            attenuation["quantity"].eq(quantity) & attenuation["model"].eq("all_process"),
            "stacked_baseline",
        ].iloc[0]
        attenuation_rows.append({"estimand": estimand, "specification": "No process measures", "estimate": base})
        for model, specification in specification_labels.items():
            value = attenuation.loc[
                attenuation["quantity"].eq(quantity) & attenuation["model"].eq(model),
                "stacked_augmented",
            ].iloc[0]
            attenuation_rows.append({"estimand": estimand, "specification": specification, "estimate": value})
    attenuation_values = pd.DataFrame(attenuation_rows)

    advocacy_stats.to_csv(output / "figure_5_panel_b_values.csv", index=False)
    responsiveness_stats.to_csv(output / "figure_5_panel_c_values.csv", index=False)
    attenuation_values.to_csv(output / "figure_5_panel_d_values.csv", index=False)

    fig, axes = plt.subplots(2, 2, figsize=(8.0, 6.2), constrained_layout=True,
                             gridspec_kw={"height_ratios": [1, 0.9]})
    _grouped_bars(
        axes[0, 0], advocacy_stats, "outcome", ["Disputed claims", "Overall verdict"],
        "Mean change toward Plaintiff\n(percentage points)",
    )
    axes[0, 0].set_title("b", loc="left", fontweight="bold", fontsize=9)
    _grouped_bars(
        axes[0, 1], responsiveness_stats, "condition",
        ["Defendant only", "Both sides", "Plaintiff only"],
        "Mean claim change toward Plaintiff\n(percentage points)",
    )
    axes[0, 1].set_title("c", loc="left", fontweight="bold", fontsize=9)

    ax = axes[1, 0]
    axes[1, 1].remove()
    ax.set_position([0.16, 0.08, 0.70, 0.34])
    order = ["Claim advocacy", "Verdict advocacy", "Asymmetric updating"]
    specs = ["No process measures", "Sharing only", "All process measures"]
    colors = [CHARCOAL, TEAL, PURPLE]
    markers = ["o", "^", "D"]
    indexed = {s: attenuation_values.loc[attenuation_values["specification"].eq(s)].set_index("estimand") for s in specs}
    y = np.arange(len(order), dtype=float)
    for row, estimand in enumerate(order):
        ax.plot([indexed[s].loc[estimand, "estimate"] for s in specs], [row] * len(specs),
                color="#BDBDBD", linewidth=2, zorder=1)
    for spec, color, marker in zip(specs, colors, markers):
        ax.scatter([indexed[spec].loc[item, "estimate"] for item in order], y,
                   color=color, marker=marker, s=34, label=spec, zorder=3)
    ax.axvline(0, color="#555555", linewidth=0.9, linestyle="--")
    ax.set_yticks(y, order)
    ax.invert_yaxis()
    ax.set_xlabel("Percentage-point coefficient")
    ax.legend(frameon=False, loc="upper right", fontsize=8)
    ax.spines[["top", "right"]].set_visible(False)
    ax.set_title("d", loc="left", fontweight="bold", fontsize=9)

    fig.savefig(output / "Figure_5_statistical_panels.pdf", bbox_inches="tight")
    fig.savefig(output / "Figure_5_statistical_panels.png", dpi=300, bbox_inches="tight")
    plt.close(fig)
