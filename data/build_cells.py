#!/usr/bin/env python3
"""Derives the color-naming tables that index.html embeds, from the c3 color naming model.

Run with no arguments to print the two lines to paste into index.html, or with --check to verify
that the ones already there match what this script produces:

    python data/build_cells.py
    python data/build_cells.py --check

See data/README.md for what the model is and where it came from.
"""

import argparse
import base64
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "c3_data.json")
PAGE = os.path.join(os.path.dirname(HERE), "index.html")

# A word must beat the runner-up by this share of the vote, averaged over the bins it wins, to be a
# cell of its own. Below it the two words are synonyms competing for one region, and the loser's
# bins go to the winner. The line sits between "limegreen" and "darkteal": dropping darkteal costs
# nothing, keeping it would spend a palette entry on a name few would pick over plain teal.
KEEP_LEAD = 0.02

# Bins are owned by the kept word with the highest vote share divided by the square root of the
# word's overall share: common words are said of everything, so an unweighted plurality hands them
# the specific words' borderlands (green holds 74x mauve's territory unweighted, 11x weighted).
# The exponent tempers the correction; 1.0 lets ultra-rare words claim bins on a handful of votes.
SPECIFICITY = 0.5

# A bin is flagged unsure when either holds; flagged colors are marked for display and otherwise
# treated like any other, unnameable is not unusable:
#   the top two kept words' raw vote shares differ by under UNSURE_LEAD - people split between names;
#   the runner-up's weighted score is at least UNSURE_RATIO of the winner's - the bin sits on a
#   cell boundary, where the winning name barely won.
UNSURE_LEAD = 0.05
UNSURE_RATIO = 0.80

# The survey's words are written without spaces; these read badly in a UI.
DISPLAY = {
    "lightblue": "light blue",
    "navyblue": "navy blue",
    "darkgreen": "dark green",
    "lightgreen": "light green",
    "darkpurple": "dark purple",
    "limegreen": "lime green",
}

OUTSIDE_GAMUT = 29  # must equal the number of cells kept, and the constant of the same name in index.html
UNSURE_BIT = 32


def bin_tallies(model):
    """Per bin, the vote count each term received. T is flat (index, count) pairs, where the index
    packs bin and term together."""
    width = len(model["terms"])
    tallies = [dict() for _ in range(len(model["color"]) // 3)]
    flat = model["T"]
    for i in range(0, len(flat), 2):
        tallies[flat[i] // width][flat[i] % width] = flat[i + 1]
    return tallies


def ranked(tally, among=None):
    """Terms of one bin by vote share, descending. Ties go to the lower term index, which is the
    word the survey saw more of overall, so the result does not depend on iteration order."""
    total = sum(tally.values())
    return sorted(((count / total, -term) for term, count in tally.items()
                   if among is None or term in among), reverse=True)


def keep_terms(tallies):
    """The words that win their region outright. Sorted only for determinism; build() orders the
    final cells by assigned territory."""
    leads = defaultdict(list)
    for tally in tallies:
        order = ranked(tally)
        second = order[1][0] if len(order) > 1 else 0.0
        leads[-order[0][1]].append(order[0][0] - second)
    kept = [t for t, v in leads.items() if sum(v) / len(v) >= KEEP_LEAD]
    return sorted(kept, key=lambda t: (-len(leads[t]), t))


def assign(tallies, kept):
    """Each bin's owning term and unsure flag, by specificity-weighted vote share among the kept
    words. See the SPECIFICITY and UNSURE_* comments for both rules."""
    keptset = set(kept)
    mass = defaultdict(int)
    for tally in tallies:
        for term, count in tally.items():
            if term in keptset:
                mass[term] += count
    total_mass = sum(mass.values())
    weight = {term: (mass[term] / total_mass) ** SPECIFICITY for term in kept}

    out = []
    for tally in tallies:
        total = sum(tally.values())
        scores = sorted(((count / total / weight[term], -term) for term, count in tally.items()
                         if term in keptset), reverse=True)
        raw = ranked(tally, among=keptset)
        split = raw[0][0] - (raw[1][0] if len(raw) > 1 else 0.0) < UNSURE_LEAD
        boundary = len(scores) > 1 and scores[1][0] >= scores[0][0] * UNSURE_RATIO
        out.append((-scores[0][1], split or boundary))
    return out


def encode(model, cells):
    """The grid as run-length pairs of (symbol, length), in L then a then b order."""
    colors = [tuple(model["color"][i:i + 3]) for i in range(0, len(model["color"]), 3)]
    axes = [sorted({c[axis] for c in colors}) for axis in range(3)]
    at = {c: i for i, c in enumerate(colors)}

    runs = []
    for lightness in axes[0]:
        for a in axes[1]:
            for b in axes[2]:
                key = (lightness, a, b)
                if key in at:
                    cell, unsure = cells[at[key]]
                    symbol = cell | UNSURE_BIT if unsure else cell
                else:
                    symbol = OUTSIDE_GAMUT
                if runs and runs[-1][0] == symbol and runs[-1][1] < 255:
                    runs[-1][1] += 1
                else:
                    runs.append([symbol, 1])

    packed = bytearray()
    for symbol, length in runs:
        packed += bytes([symbol, length])
    return base64.b64encode(bytes(packed)).decode(), axes


def build():
    with open(MODEL, encoding="utf-8") as f:
        model = json.load(f)

    tallies = bin_tallies(model)
    kept = keep_terms(tallies)
    if len(kept) != OUTSIDE_GAMUT:
        sys.exit("kept %d cells but OUTSIDE_GAMUT is %d; they must agree" % (len(kept), OUTSIDE_GAMUT))

    owners = assign(tallies, kept)
    territory = Counter(term for term, _ in owners)
    order = sorted(kept, key=lambda t: (-territory[t], t))
    index = {term: i for i, term in enumerate(order)}
    cells = [(index[term], unsure) for term, unsure in owners]
    rle, axes = encode(model, cells)
    names = [DISPLAY.get(model["terms"][t], model["terms"][t]) for t in order]
    return names, rle, axes, cells


def source_lines(names, rle):
    return ("const CELL_NAMES = [%s];" % ", ".join('"%s"' % n for n in names),
            'const CELL_GRID_RLE = "%s";' % rle)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="compare against index.html instead of printing")
    args = parser.parse_args()

    names, rle, axes, cells = build()
    names_line, rle_line = source_lines(names, rle)

    if not args.check:
        print("// grid: L %d..%d, a %d..%d, b %d..%d, step %d"
              % (axes[0][0], axes[0][-1], axes[1][0], axes[1][-1], axes[2][0], axes[2][-1],
                 axes[0][1] - axes[0][0]))
        print("// %d cells, %d of %d bins flagged unsure"
              % (len(names), sum(1 for _, unsure in cells if unsure), len(cells)))
        print(names_line)
        print(rle_line)
        return

    with open(PAGE, encoding="utf-8") as f:
        page = f.read()
    stale = [label for label, line in (("CELL_NAMES", names_line), ("CELL_GRID_RLE", rle_line))
             if line not in page]
    if stale:
        sys.exit("index.html is out of date with this script: " + ", ".join(stale))
    print("index.html matches: %d cells, %d bins" % (len(names), len(cells)))


if __name__ == "__main__":
    main()
