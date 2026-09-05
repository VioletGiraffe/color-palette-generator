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
node data/identify.js [page.html]             # end-to-end: generate palettes, score both ways
node data/identify.js --hex "#rrggbb ..."     # score one palette
node data/identify.js --file palettes.txt     # score one palette per line
node data/fit.js log.json                     # fit identify.js's constants to a calibrate.html log
node data/fit_hue.js log.json [more.json]     # fit the position terms, over any probe logs pooled
node data/fit_chroma.js chroma-log.json       # the chroma round's own question, see below
node data/fit_names.js log.json               # fit the naming score to a calibrate-names.html log
```

Every script taking a page path defaults to `index.html`, and accepts any version of it, so a
change can be compared against `git show <rev>:index.html` saved to a file. `identify.js` passes its
range boxes as OKLCh ranges, so it needs a page whose controls are OKLCh. `build_cells.py` needs numpy.

`identify.js` reports two scores side by side and never combines them:

- **Identification**, the primary one, which the generator optimizes: the chance a viewer who
  learned the palette picks the right entry for a color shown alone. Described below.
- **Naming**, a second opinion the generator does not steer by: the chance two entries would be
  described the same way. A pair collides by the overlap of their cells' vote distributions, from
  the page's own `CELL_OVERLAP` table, faded by how far apart the colors sit.

They answer different questions - whether you can tell two colors apart, and whether you can say
which one you mean - so a run where they disagree is the point of having both. Names label the
result and never steer generation; that was measured and dropped (see `evolution.md`).

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
   too close or marginal; unmarked pairs count as fine. Download the log when done; more rounds
   narrow the fit, and logs fit together, so a long session can be split over sittings.
   Each round places one probe pair per axis and distance — lightness or hue, at weighted deltaE
   from 6 to 12.5 — and deals each one a cell of relative lightness by relative chroma, at a hue
   drawn at random. The weights come out of how verdicts differ by axis; whether the metric's scale
   depends on where a pair sits comes out of how they differ by cell.
   The cells are relative because the gamut ties absolute chroma to hue: nothing outside the reds,
   blues and magentas passes chroma 20, so an absolute "vivid" condition is also a hue condition.
   The ground is light throughout and does not flip: it is the harder one at both ends of the range,
   so every mark is the pessimistic verdict and belongs to a ground known in advance. Judged on two,
   a pair is marked on whichever came first and no position term can be read out of the log.
   The chroma axis is not scheduled: a chroma step needs room in the gamut and the dark band has
   none, so keeping it would give the dark band a different axis mix from the light one and let the
   mix stand in for lightness.
   Colors not in the same probe pair keep 12 weighted deltaE apart, two softness units past the
   fine threshold. A wider clearance leaves no room: at 14 the gamut places only a third of the
   four pairs a palette asks for.
2. `node data/fit.js log.json` fits an ordered probit over the weighted pair distance (too close
   below one threshold, marginal up to a second, fine above, boundaries blurred by a softness) by
   maximum likelihood over a grid, with a lapse rate for stray marks. It prints the lines to paste
   into `identify.js` and the page, a likelihood profile per parameter, and observed against
   predicted verdicts per probe condition. It then asks whether the metric's scale depends on
   position, refitting with the distance scaled by relative chroma and relative lightness each
   raised to an exponent, the other parameters free nearby. Zero exponents are the flat metric, so
   the profiles say directly whether the data asks for anything else; on judged palettes the
   exponents and the chroma weight trade off, so a shape shows up more reliably than its split
   against the weight does. The noise width puts a lone pair's swap chance at the
   generator's limit two softness units past the fine threshold, where a pair is judged fine
   reliably; at the threshold itself half the verdicts are still marginal. Parameters within about
   2 log-likelihood units of the best are not distinguishable.

## Calibration data

`calibration-log.json` is the log the current constants come from: 28 palettes judged by the author
on 2026-09-04 in Firefox at 16 px swatches, the question being "would I still confuse these two
after learning the palette for a while". Each palette was judged on a light and a dark ground and
marked at its worst, so the constants are pessimistic by design. 98 of the 1260 pairs are probes at
a set weighted distance along one of lightness, chroma and hue, crossed with three lightness and
three chroma bands; the rest are fillers.

Fitted: wL 0.35 (0.3 to 0.35), wC 0.6 (0.5 to 0.7), too close below 7 and fine above 9 weighted
deltaE, softness 2, lapse 0.005. Marked rate over the distance ladder: 21/21 at 4.5, 15/19 at 6,
13/16 at 7.5, 9/16 at 9, 1/13 at 11, 0/13 at 13. The sigma rule below puts a lone pair's 2% swap
chance at 13.0 weighted deltaE. Adopted: SIGMA 3, wL 0.35, wC 0.6.

The staged fit returns a chroma exponent of -0.2, 4.1 log-likelihood units better than the flat
metric. Not adopted: the chroma-axis probes are capped at distance 9 and so never leave the middle
chroma band, and among the hue and lightness probes, which reach every band, high and middle chroma
are marked at the same rate (16/20 against 12/15 at the threshold rungs). The exponent is the chroma
axis being easier than wC alone predicts, not a position effect. The lightness exponent returns 0,
which this log cannot test: each pair is marked once at its worst over the two grounds, and 60 of
the 71 marks were recorded on whichever ground came first.

### Where a pair sits in the gamut

Three later rounds were judged on the light ground alone, which is the harder one at both ends of
the range and makes every mark attributable to a ground known in advance. They are not poolable with
the both-grounds log above, and they are what the `LIGHTNESS_EXPONENT` comes from.

`light-calibration-log.json`, 21 palettes: lightness and hue probes over three bands of relative
lightness, two of them below the cusp. `chroma-log.json`, 24 palettes from `calibrate-chroma.html`:
chroma and hue probes at three chroma levels. `hue-log.json`, 36 palettes from `calibrate-hue.html`:
hue probes over six sectors and two chroma levels, lightness drawn across the whole span the gamut
allows at each hue, which is what decorrelates the three candidates.

Fitted together by `node data/fit_hue.js data/hue-log.json data/light-calibration-log.json`, 209
probe pairs:

| term | value | earns | zero excluded |
|---|---|---|---|
| relative lightness exponent | 0.40 | 16.1 log-likelihood units | yes, profile and bootstrap |
| hue trough | amplitude 0.10 at 285 degrees | 4.3 units, 2 parameters | profile yes, bootstrap no |
| chroma exponent | -0.05 | 0.1 units | no |

Adopted: the lightness exponent alone, as a gain on the whole distance in `apart2` and
`recallDistance`. The gain is 1 at the cusp, 1.24 at the top of the gamut and 0.49 at the bottom, so
the fine threshold runs from 6.5 weighted deltaE near white to 16.5 near black.

Not adopted: the hue term. It is marginal on its own, and it disappears entirely if absolute
lightness is used as the coordinate instead of the cusp-relative one - the two correlate at 0.81
over these rounds and relative wins by only 1.9 units, so the hue trough and the coordinate choice
are partly the same claim. `calibrate-hue.html` rounds pool, so more of them would settle it.

Not adopted, and worth knowing before refitting: the chroma round on its own reports a chroma slope
of 0.6 that looks decisive. It is its hue and lightness composition. A chroma level reachable at
every hue is capped near 13, and pushing past it confines the probes to blues and magentas, whose
cusps are dark. `calibrate-hue.html` exists because of that.

`calibration-verdicts-16px.json` is the predecessor, 78 palettes from 2026-09-02 under a coarser
schedule with no ground control. Archival: its ranges contain the current fit, and the two logs are
not poolable.

Refit with `node data/fit.js data/calibration-log.json`. A different swatch size needs its own log
and fit; the thresholds are size-dependent.
