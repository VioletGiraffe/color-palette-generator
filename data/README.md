# Color naming data

`index.html` decides what a color is *called*, not just where it sits. The tables it embeds are
derived from the files here. Nothing in this directory is loaded at runtime — the page stays a
single self-contained file.

`evolution.md`, alongside this file, is the design history: what was tried for the generator, the
numbers each step produced, the negative results, and how the metric below was arrived at. Read it
before changing the generator or the identification model — most of the obvious alternatives have
been measured there already.

## Where the data comes from

`c3_data.json` is the color naming model from [c3](https://github.com/StanfordHCI/c3), built by
Jeffrey Heer and Maureen Stone for *Color Naming Models for Color Selection, Image Editing and
Palette Design* (CHI 2012). It is fitted to the [XKCD color
survey](https://blog.xkcd.com/2010/05/03/color-survey-results/), in which a large number of people
named colors in their own words.

It holds 8325 bins covering sRGB — CIE Lab cubes 5 units on a side — 153 color terms, and the vote
count for every bin/term pair. `c3_LICENSE.txt` is its BSD license, which requires the copyright
notice be kept; `index.html` carries it above the tables.

## What the build does

`build_cells.py` turns the vote counts into a partition of color space into named cells.

1. A word earns a cell if it out-polls every other word, by `KEEP_LEAD` on average, somewhere.
   Until every word does, the weakest is folded into the surviving word its votes co-occur with
   most, and its votes count for that word from then on. Synonyms split a region's votes — `aqua`,
   `turquoise` and `aquamarine` each lose to `teal` alone and win their region as one word — and a
   third of all votes go to words that never win a bin alone. 36 words survive; the script lists
   what each absorbed.
2. Each bin then belongs to the kept word with the highest vote share weighted by the word's
   rarity (`SPECIFICITY`). Unweighted plurality hands generic words everything — everyone falls
   back on `green`, so `green` narrowly out-polls `light green` even at its pale edge, and owns
   84x `mauve`'s territory; weighting returns specific words their regions and flattens the ratio
   to 3.7x. The territories are arbitrary shapes, which is why the table cannot be replaced by a
   list of representative colors — a nearest-centroid partition reproduces only 60% of it.
3. A bin is flagged when people split their votes between names (`UNSURE_LEAD`) or when the
   weighted winner barely beat the runner-up (`UNSURE_RATIO`). Those colors have no name people
   agree on; the page marks them with a tilde. They are not excluded from palettes — being hard to
   name is not a defect, and some cells hold little else.
4. The grid is emitted as one printable char per bin carrying the cell and the flag; HTTP gzip
   compresses that as well as any hand-rolled scheme.
5. Each cell gets a showcase color for the names panel: the bin, among those the cell owns, where
   the most people gave its name. Vivid names get a vivid color, neutral names a neutral one.
6. A cell-by-cell name overlap matrix (cosine similarity of the cells' mean vote distributions)
   is emitted alongside and embedded in the page. The current generator does not read it.

## Running it

```
python data/build_cells.py                    # print the const lines to paste into the page
python data/build_cells.py --check [page.html] # verify the page matches; non-zero exit if not
node data/bench.js [page.html]                # end-to-end: generate palettes, score by names + distance
node data/identify.js [page.html]             # end-to-end: generate palettes, score by simulated recall
node data/identify.js --hex "#rrggbb ..."     # score one palette
node data/identify.js --file palettes.txt     # score one palette per line
node data/fit.js log.json                     # fit identify.js's constants to a calibrate.html log
```

Every script taking a page path defaults to `index.html`, and accepts any version of it, so a
change can be compared against `git show <rev>:index.html` saved to a file. `identify.js` passes its
range boxes as OKLCh ranges, so it needs a page whose controls are OKLCh. `build_cells.py` needs numpy.

`bench.js` models the real task, labeling a palette color
seen on its own: two entries are confusable when people describe both colors with the same
words and the colors also sit close in OKLab - either alone is survivable, together they are
not. An entry scores 1 minus its worst confusability; a palette reports the mean entry score
and the worst - it is only as usable as its most confusable color.

The four constants at the top of `build_cells.py` are the only judgement calls. All trade the number of
cells against how well each one corresponds to a name a person would actually reach for.

## Identification metric

`identify.js` scores a palette by the task itself, without naming: a viewer who learned the
palette recalls a color with Gaussian memory noise in OKLab and answers with the nearest entry.
Noise is anisotropic - lightness and chroma differences count by a weight against hue, the hue
difference is the ab chord less its radial part - and a pair swaps with the chance the noise
carries a recall past their midpoint. A color's error is the sum over its pairs, the same formula
the page optimizes. A palette reports each color's accuracy, the floor (the worst color), and the
pair confused most. A Monte Carlo (noise drawn per recall, nearest entry answered) was tried in
four geometries and fitted the calibration verdicts worse than this formula in every one, by 5 to
13 log-likelihood units.

Its constants (noise width, the two weights, swatch size) are measured, not assumed:

1. Open `calibrate.html` and judge its palettes one at a time, scattered on a ground at the swatch
   size the palette is meant for: mark each pair you would mix up after living with the palette as
   too close or marginal; unmarked pairs count as fine. Each palette carries probe pairs at known
   deltaE along lightness, chroma or hue: the weights are fitted from those. Download the log when
   done; more rounds narrow the fit. The region schedules instead place pairs in a random direction
   at weighted distances straddling the fitted boundary, within one hue sector, lightness band or
   chroma level at a time: they test whether the boundary sits at the same distance everywhere, and
   fit.js reports a distance factor per region when the log holds them. Fit region logs together
   with the axes log, so the thresholds come from all pairs.
2. `node data/fit.js log.json` fits an ordered probit over the weighted pair distance (too close
   below one threshold, marginal up to a second, fine above, boundaries blurred by a softness) by
   maximum likelihood over a grid, with a lapse rate for stray marks. It prints the lines to paste
   into `identify.js` and the page, a likelihood profile per parameter, and observed against
   predicted verdicts per probe condition. The noise width puts a lone pair's swap chance at the
   generator's limit two softness units past the fine threshold, where a pair is judged fine
   reliably; at the threshold itself half the verdicts are still marginal. Parameters within about
   2 log-likelihood units of the best are not distinguishable.

## Calibration data

`calibration-verdicts-16px.json` is the log the current constants come from: 78 palettes judged by
the author on 2026-09-02 in Firefox at 16 px swatches, the question being "would I still confuse
these two after learning the palette for a while". 30 palettes are three rounds of the axes
schedule (distances 6 9 13 18 25, chroma to 18), 10 are validation palettes from the generator (five
at sigma 1.9, five at sigma 3, under the fitted weights), 38 are one round each of the hue, lightness
and chroma region schedules.

Fitted on the axes and validation palettes: wL 0.35 (0.3 to 0.4), wC 0.5 (0.4 to 0.6), too close
below 5 and fine above 8 weighted deltaE (each ±1), softness 2. In raw deltaE per axis: too close
below 5 / 10 / 14 and fine above 8 / 16 / 23 for hue / chroma / lightness. The validation palettes
at sigma 1.9, whose nearest pairs sit at the fine threshold, each drew one marginal mark; at sigma 3,
with nearest pairs at 13 to 14, one mark in five palettes.

The region round found no region whose distance factor excludes 1 (ranges at 2 log-likelihood
units, 10 pairs each): hue sectors 0.9 to 1.1 best, ranges about 0.7 to 1.4; dark and vivid 1.25
with ranges 1 to 1.6; dull 0.9, 0.7 to 1.1. Refitting on all 78 palettes moves the weights within
their ranges (wL 0.4, wC 0.6, with 0.35 / 0.5 only 0.2 units behind) and the softness to 3, which
the sigma rule turns into 3.5. Adopted: SIGMA 3.5, wL 0.35, wC 0.5.

Refit with `node data/fit.js data/calibration-verdicts-16px.json`. A different swatch size needs
its own log and fit; the thresholds are size-dependent.
