#!/usr/bin/env python3
"""Derives the color-naming tables that index.html embeds, from the c3 color naming model.

Run with no arguments to print the const lines to paste into the page, or with --check to verify
that the ones already there match what this script produces. The page defaults to index.html:

    python data/build_cells.py
    python data/build_cells.py --check [page.html]

See data/README.md for what the model is and where it came from.
"""

import argparse
import base64
import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, "c3_data.json")
PAGE = os.path.join(os.path.dirname(HERE), "index.html")

# A word keeps a cell of its own once it beats the runner-up by this share of the vote, averaged over
# the bins it wins. Until every word does, the weakest folds into the surviving word its votes
# co-occur with most. Synonyms split a region's votes: aqua, turquoise and aquamarine each lose to
# teal alone and win their region as one word.
# The marginal survivors at 0.02 are burntorange, paleyellow, beige and mauve.
KEEP_LEAD = 0.02

# Bins are owned by the kept word with the highest vote share divided by the square root of the
# word's overall share: common words are said of everything, so an unweighted plurality hands them
# the specific words' borderlands (green holds 84x mauve's territory unweighted, 3.7x weighted).
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
    "greyblue": "grey blue",
    "yellowgreen": "yellow green",
    "lightpink": "light pink",
    "brickred": "brick red",
    "paleyellow": "pale yellow",
    "burntorange": "burnt orange",
    "offwhite": "off white",
}

# Grid symbols: cell index, or the cell count for a bin outside sRGB, with this bit set on unsure
# bins. The page reads the same layout, so the count and the bit are emitted and checked with the
# tables; the cell count must stay below the bit.
UNSURE_BIT = 64


def bin_tallies(model):
    """Per bin, the vote count each term received. T is flat (index, count) pairs, where the index
    packs bin and term together."""
    width = len(model["terms"])
    tallies = [dict() for _ in range(len(model["color"]) // 3)]
    flat = model["T"]
    for i in range(0, len(flat), 2):
        tallies[flat[i] // width][flat[i] % width] = flat[i + 1]
    return tallies


def ranked(tally):
    """Terms of one bin by vote share, descending. Ties go to the lower term index, which is the
    word the survey saw more of overall, so the result does not depend on iteration order."""
    total = sum(tally.values())
    return sorted(((count / total, -term) for term, count in tally.items()), reverse=True)


def fold_synonyms(tallies, width):
    """The words that win a region of their own, the tallies with every other word's votes moved
    into the survivor it co-occurs with most, and where each dropped word went. See KEEP_LEAD."""
    shares = np.zeros((width, len(tallies)))
    votes = np.zeros(width)
    for i, tally in enumerate(tallies):
        total = sum(tally.values())
        for term, count in tally.items():
            shares[term, i] = count / total
            votes[term] += count

    alive = [term for term in range(width) if votes[term] > 0]
    target = {}
    while True:
        rows = shares[alive]
        winner = rows.argmax(0)  # ties to the lower index, as ranked() breaks them
        top = np.sort(rows, 0)[-2:]
        lead = np.bincount(winner, weights=top[1] - top[0], minlength=len(alive))
        mean_lead = lead / np.maximum(np.bincount(winner, minlength=len(alive)), 1)
        weakest = min(range(len(alive)), key=lambda i: (mean_lead[i], votes[alive[i]]))
        if mean_lead[weakest] >= KEEP_LEAD:
            break
        similarity = rows @ rows[weakest] / (np.linalg.norm(rows, axis=1) * np.linalg.norm(rows[weakest]))
        similarity[weakest] = -1
        nearest = alive[int(similarity.argmax())]
        source = alive.pop(weakest)
        shares[nearest] += shares[source]
        votes[nearest] += votes[source]
        target[source] = nearest

    def survivor(term):
        while term in target:
            term = target[term]
        return term

    folded = []
    for tally in tallies:
        counts = Counter()
        for term, count in tally.items():
            counts[survivor(term)] += count
        folded.append(dict(counts))
    return alive, folded, {term: survivor(term) for term in target}


def assign(tallies):
    """Each bin's owning term and unsure flag, by specificity-weighted vote share. Requires folded
    tallies: every word in them owns a cell. See the SPECIFICITY and UNSURE_* comments for both rules."""
    mass = Counter()
    for tally in tallies:
        mass.update(tally)
    total_mass = sum(mass.values())
    weight = {term: (count / total_mass) ** SPECIFICITY for term, count in mass.items()}

    out = []
    for tally in tallies:
        total = sum(tally.values())
        scores = sorted(((count / total / weight[term], -term) for term, count in tally.items()), reverse=True)
        raw = ranked(tally)
        split = raw[0][0] - (raw[1][0] if len(raw) > 1 else 0.0) < UNSURE_LEAD
        boundary = len(scores) > 1 and scores[1][0] >= scores[0][0] * UNSURE_RATIO
        out.append((-scores[0][1], split or boundary))
    return out


def encode(model, cells, outside):
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
                    symbol = outside
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
    kept, folded, folds = fold_synonyms(tallies, len(model["terms"]))
    if len(kept) >= UNSURE_BIT:
        sys.exit("%d cells do not fit below UNSURE_BIT" % len(kept))

    owners = assign(folded)
    territory = Counter(term for term, _ in owners)
    order = sorted(kept, key=lambda t: (-territory[t], t))
    index = {term: i for i, term in enumerate(order)}
    cells = [(index[term], unsure) for term, unsure in owners]
    rle, axes = encode(model, cells, len(kept))
    names = [DISPLAY.get(model["terms"][t], model["terms"][t]) for t in order]
    folds = {model["terms"][source]: model["terms"][kept_term] for source, kept_term in folds.items()}
    return names, rle, axes, cells, cell_overlap(tallies, cells), folds


def cell_overlap(tallies, cells):
    """Name overlap between every pair of cells: cosine similarity of their mean vote
    distributions, quantized to a byte. The full square matrix, row-major by cell index.
    Measured on the survey's own words, before folding: the finer vocabulary is what people share."""
    width = 1 + max(term for tally in tallies for term in tally)
    means = defaultdict(lambda: [0.0] * width)
    counts = Counter()
    for tally, (cell, _) in zip(tallies, cells):
        total = sum(tally.values())
        for term, count in tally.items():
            means[cell][term] += count / total
        counts[cell] += 1

    n = len(means)
    vecs = [means[cell] for cell in range(n)]
    norms = [sum(v * v for v in vec) ** 0.5 for vec in vecs]
    out = bytearray()
    for a in range(n):
        for b in range(n):
            dot = sum(x * y for x, y in zip(vecs[a], vecs[b]))
            out.append(round(255 * dot / (norms[a] * norms[b])))
    return base64.b64encode(bytes(out)).decode()


def source_lines(names, rle, overlap):
    """The const lines the page must hold verbatim, keyed by constant name."""
    return {"CELL_NAMES": "const CELL_NAMES = [%s];" % ", ".join('"%s"' % n for n in names),
            "OUTSIDE_GAMUT": "const OUTSIDE_GAMUT = %d;" % len(names),
            "UNSURE": "const UNSURE = %d;" % UNSURE_BIT,
            "CELL_GRID_RLE": 'const CELL_GRID_RLE = "%s";' % rle,
            "CELL_OVERLAP_B64": 'const CELL_OVERLAP_B64 = "%s";' % overlap}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("page", nargs="?", default=PAGE, help="the page holding the tables (default: index.html)")
    parser.add_argument("--check", action="store_true", help="compare against the page instead of printing")
    args = parser.parse_args()

    names, rle, axes, cells, overlap, folds = build()
    lines = source_lines(names, rle, overlap)

    if not args.check:
        print("// grid: L %d..%d, a %d..%d, b %d..%d, step %d"
              % (axes[0][0], axes[0][-1], axes[1][0], axes[1][-1], axes[2][0], axes[2][-1],
                 axes[0][1] - axes[0][0]))
        print("// %d cells, %d of %d bins flagged unsure"
              % (len(names), sum(1 for _, unsure in cells if unsure), len(cells)))
        for line in lines.values():
            print(line)
        absorbed = defaultdict(list)
        for source, kept_term in folds.items():
            absorbed[kept_term].append(source)
        for kept_term, sources in sorted(absorbed.items()):
            print("%s <- %s" % (kept_term, ", ".join(sorted(sources))), file=sys.stderr)
        return

    with open(args.page, encoding="utf-8") as f:
        page = f.read()
    stale = [label for label, line in lines.items() if line not in page]
    if stale:
        sys.exit("%s is out of date with this script: %s" % (os.path.basename(args.page), ", ".join(stale)))
    print("%s matches: %d cells, %d bins" % (os.path.basename(args.page), len(names), len(cells)))


if __name__ == "__main__":
    main()
