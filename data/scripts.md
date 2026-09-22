# Scripts, logs and fits

Reference for every script in this directory, the log each one reads and the constant it produced.
`README.md`, alongside, is the overview of the page and the generator; `evolution.md` the design history,
with the numbers behind every constant below. Nothing in this directory is loaded at runtime: the tables
the page needs are pasted into `index.html`, which stays a single self-contained file.

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
   to 3.7x. The territories are arbitrary shapes: a list of representative colors cannot replace the
   table, a nearest-centroid partition reproduces only 60% of it.
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
node data/fit.js --warped log.json            # fit identify.js's constants to a calibrate.html log; without --warped, on the raw hue circle
node data/fit_hue.js --warped log.json [more.json] # fit the position terms, over any probe logs pooled
node data/fit_hue.js --relative log.json      # the same against cusp-relative lightness, the coordinate before the cusp rounds
node data/fit_hue_steps.js log.json           # a hue density from calibrate-hue-steps.html, against HUE_DENSITY
node data/fit_step_weights.js log.json        # lightness and chroma weights per hue from a calibrate-hue-steps.html log with all three directions
node data/make_cell_deal.js [--sectors 20]    # deal calibrate-cells.html's hue sectors into the page, even in the hue warp
node data/fit_cells.js log.json               # capacity per cell and direction, the metric's correction factors and the same-y ratio, from a calibrate-cells.html log
node data/make_palette_pairs.js [--seeds 20] [--counts 7,10] [--box 40 60 60 100] [--conditions hue|preference] # deal calibrate-palettes.html's pairs into the page
node data/fit_palettes.js log.json            # condition strengths and what the eye counted, from a calibrate-palettes.html log
node data/make_boundary_deal.js [--boundaries red,yellow,green,cyan,blue,magenta] [--turns 10,15,20,30,45,60] [--offsets -1,-0.5,0,0.5,1] [--light 50] [--chroma 85] [--placement shared|own-chroma|own] # deal calibrate-boundaries.html's pairs into the page
node data/make_boundary_deal.js --sweep 10 [--turns 20,30,45,60,45] [--light 50] [--chroma 85] [--placement shared|own-chroma|own|own-reversed|low|high[,more]] [--ranges 230-340,120-190] # the same, swept around the circle or over hue ranges at even centres; a turn listed twice is dealt again at centres half a step over; several placements deal every pair under each
node data/make_boundary_deal.js --axis lightness [--hues 30] [--centres 35,50,65] [--turns 10,20,30,45,60] [--chroma 85] # lightness pairs instead: one hue, a turn apart in cusp-relative lightness
node data/make_boundary_deal.js --axis chroma [--hues 30] [--centres 30,50,70] [--turns 10,20,30,40,50] [--light 50] # chroma pairs: one hue and lightness, a turn apart in chroma share of the reach
node data/make_boundary_deal.js --axis mixed [--ranges 0-360] [--windows 20-80] [--share 30-100] [--kinds mixed] [--by metric] [--distances 2-18] [--bands 6] [--each 30] [--seed 1] # validation pairs in cells of hue range, lightness window, kind (hue alone, chroma alone, or hue, lightness and chroma at once) and distance band, the chroma within a share of the reach, the bands on the metric or on OKLab deltaE; the defaults deal round 16
node data/fit_boundaries.js log.json          # grades by turn and offset per boundary hue and the boundary's excess on the metric, from a calibrate-boundaries.html log; for a mixed deal, per kind the grades by distance band and by hue range and lightness window, and the ranking quality of the metric against OKLab deltaE
node data/fit_hue_density.js [--p 0.75] [--ridge 2] [--knots 12] [--levels 30,58,85] [--level-ridge 10] [--own-cuts] [--same-cuts 13-17] [--wl 0.46] [--wc 0.83] [--gain 0.21] [--free wl,wc,gain] [--placement own] [--table] log.json [more.json ...] # the metric fitted to calibrate-boundaries.html logs through identify.js's metricWith: the hue density, one or one per lightness level, and whichever of the lightness weight, the chroma weight and the gain's exponent --free names; ranking quality and loss per verdict of the built metric, flat, fitted and cross-validated, the fitted numbers and the grade cuts on the metric, per log with --own-cuts
node data/make_member_deal.js [--palettes 120] [--count 8] [--box 20 60 20 100] [--shared 0.5] # deal calibrate-members.html's palettes into the page
node data/fit_members.js log.json             # where the bad colors live and whether bad is the color or its company, from a calibrate-members.html log
node data/fit_preference.js log.json          # the draw's preference density from a calibrate-members.html log, as the PREFERENCE constant
node data/hue-marginals.js [--names] [--counts 7,10,14] [m/d ...] # the hue and name shares the generator delivers, metric and draw density set apart; runs a page with the box sampler, data/past-experiments/experimental-cells-pushes.html or earlier
node data/fit_chroma.js chroma-log.json       # the chroma round's own question, see below
node data/fit_names.js log.json               # fit the naming score to a calibrate-names.html log
```

Every script taking a page path defaults to `index.html`, and accepts any version of it, so a
change can be compared against `git show <rev>:index.html` saved to a file. `identify.js` passes its
range boxes as OKLCh ranges, so it needs a page whose controls are OKLCh. `build_cells.py` needs numpy.

## Running the page headless

`identify.js` is also the module every experiment script requires (`require("../data/identify.js")` from
`tmp/`, the gitignored scratch folder). Its `loadPage(pagePath, densities)` runs the page's generator in Node:

- It takes the page's script that holds the `// ---------- ui ----------` marker, evaluates the part before
  the marker, and returns `generate`, `mulberry32`, `cellOf`, `colorFromHex`, `oklabToRgb`, `labOfLch`, `CELL_NAMES`,
  `CELL_OVERLAP`, `HUE_DENSITY` and `HUE_LEVEL_DENSITIES`, and from a page before the rebuilt generator its box
  sampler, `boxCells`, `samplePoint` and `SPARSE_FRACTION`, which `hue-marginals.js` reads. Anything
  defined below the marker (the UI, the state string, the 3D module) is not there.
- Any version of the page loads: `index.html`, a `past-experiments/` page, a `git show <rev>:index.html`
  saved to a file, or a copy with a constant edited by `sed`. Pages are cached by path.
- `densities`, optional: `{ metric, draw }`, each a 360-entry table, replace the page's hue density for
  the metric (every level of `HUE_LEVEL_DENSITIES`, or the `HUE_WARP` integral of a page with one table) and
  for the draw's hue weight of a page that has one, one or both. Without it a page whose
  tables differ from this file's is loaded with a warning: the scores `identify.js` prints are on this
  file's metric, the page's generator runs on its own.
- `generate(cfg)` takes `{ count, scale, hMin, hMax, cMin, cMax, lMin, lMax, seed, fixed, avoid }` with
  `fixed` and `avoid` as arrays of `colorFromHex` results, plus the optional `included` (name mask, all
  by default), `preference` (true), `lAbsolute` (false: the lightness range in absolute OKLab L), `rerolls` (none: slots of
  the result rerolled, in order). It returns `{ colors, floor, pair, apart,
  confused, named }` or null for an empty box; a color is `{ lch, lab, rgb, hex, cell, confident }`.
  The ranges are the page's cusp-relative ones, see `README.md`.

The module also exports the metric itself for the fit scripts: the constants (`SIGMA`, `W_L`, `W_C`,
`CHROMA_POWER`, `CHROMA_REFERENCE`, `CHROMA_FLOOR`, `LIGHTNESS_EXPONENT`, `LIGHTNESS_REFERENCE`,
`LIGHTNESS_FLOOR`, `CALIBRATED_PX`, `NAME_DECAY`, `HUE_DENSITY`, `HUE_LEVEL_DENSITIES`, `HUE_DENSITY_AUTHORED`), `lightnessGain`,
`hueScaleAt`, `labOf`, `rgbOf`, `warpedLab`, `weightedDistance`, `recallDistance`, `metricWith`, `swapChance`,
`confusionMatrix`, `summarize`, `score`, `nameCollision`, `gamutChroma`, `cuspLightness`,
`relativePosition`. `metricWith({ density, wL, wC, power, gainExponent })` returns `recallDistance`'s form under
a candidate's numbers, each defaulting to the built one: a fit measures through it, never through a copy of the
form. The metric here and in the page must agree; a constant changed in one is changed in
the other, and a new density table is pasted into both.

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
difference is the ab chord less its radial part, taken after each hue moves to its place on the
respaced circle of `HUE_DENSITY` and scaled by the pair's mean chroma at `CHROMA_POWER`, the whole
distance by a lightness gain that is one at the cusps' lightness and rises toward black and toward white - and
a pair swaps with the chance the noise carries a recall past their midpoint. A color's error is the
sum over its pairs, the same formula the page optimizes. The noise width comes from the
recall calibration below, fitted on the step-round circle (the fit scripts' `--warped`); the
circle by lightness, the lightness and chroma weights and the gain's exponent are one fit to the pair rounds under
the preference question, the chroma power from the same rounds, see the boundary logs at the end. A
palette reports each color's accuracy, the floor (the worst color), and the pair confused most. A
Monte Carlo (noise drawn per recall, nearest entry answered) was tried in
four geometries and fitted the calibration verdicts worse than this formula in every one, by 5 to
13 log-likelihood units.

Its constants (noise width, the two weights, swatch size) are measured, not assumed:

1. Open `data/calibrate.html` and judge its palettes one at a time, scattered on a ground at the swatch
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
   four pairs a palette needs.
2. `node data/fit.js log.json` fits an ordered probit over the weighted pair distance (too close
   below one threshold, marginal up to a second, fine above, boundaries blurred by a softness) by
   maximum likelihood over a grid, with a lapse rate for stray marks. It prints the lines to paste
   into `identify.js` and the page, a likelihood profile per parameter, and observed against
   predicted verdicts per probe condition. It then tests whether the metric's scale depends on
   position, refitting with the distance scaled by relative chroma and relative lightness each
   raised to an exponent, the other parameters free nearby. Zero exponents are the flat metric, so
   the profiles show directly whether the data departs from it; on judged palettes the
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
chance at 13.0 weighted deltaE. Adopted: SIGMA 3, wL 0.35, wC 0.6; the preference rounds later put wL at 0.46 and wC at 0.83.

The staged fit returns a chroma exponent of -0.2, 4.1 log-likelihood units better than the flat
metric. Not adopted: the chroma-axis probes are capped at distance 9 and so never leave the middle
chroma band, and among the hue and lightness probes, which reach every band, high and middle chroma
are marked at the same rate (16/20 against 12/15 at the threshold rungs). The exponent is the chroma
axis being easier than wC alone predicts, not a position effect. The lightness exponent returns 0,
which this log cannot test: each pair is marked once at its worst over the two grounds, and 60 of
the 71 marks were recorded on whichever ground came first.

### Where a pair sits in the gamut

Five later rounds were judged on the light ground alone, which is the harder one at both ends of
the range and makes every mark attributable to a ground known in advance. They are not poolable with
the both-grounds log above, and they are what the `LIGHTNESS_EXPONENT` comes from.

`light-calibration-log.json`, 21 palettes: lightness and hue probes over three bands of relative
lightness, two of them below the cusp. `chroma-log.json`, 24 palettes from `calibrate-chroma.html`:
chroma and hue probes at three chroma levels. `hue-log.json`, 36 palettes from `calibrate-hue.html`:
hue probes over six sectors and two chroma levels, lightness drawn across the whole span the gamut
allows at each hue: that span decorrelates the three candidates. `cusp-log.json` and
`cusp-log-new.json`, 33 and 26 palettes from `calibrate-cusp.html`: hue probes at four hues crossed
with absolute lightness bands shared by all four: the shared bands tell the lightness coordinate apart
(below).

Fitted together by `node data/fit_hue.js --warped` over the five probe logs, 443 pairs, the ordered
model over all three grades, on the respaced hue circle:

| term | value | earns | zero excluded |
|---|---|---|---|
| absolute lightness exponent | 0.50 | 39 log-likelihood units | yes, profile and bootstrap |
| hue trough | amplitude 0.00 | 0 units, 2 parameters | no |
| chroma exponent | -0.15 | 3 units | profile yes, bootstrap no |

On the raw circle the same data wants a trough of amplitude 0.10 at 270 degrees worth 5.6 units, blue
pairs reading closer than their distance says; the respacing, fitted on the step criterion with no
parameter spent here, removes it, and the blue-over-red gain interval moves from 0.84 to 1.00 onto
0.97 to 1.10. The weights and the noise width refit on the respaced circle unchanged.

Adopted: the lightness exponent alone, as a gain on the whole distance in `apart2` and
`recallDistance`, on the pair's mean absolute lightness. The gain is 1 at lightness 50, 1.41 at white
and 0.32 at the floor of 5, so the fine threshold runs from 6 weighted deltaE near white to 27 at the
floor.

The coordinate is the finding of the cusp rounds. The gain was first carried on cusp-relative
lightness, the coordinate of the range controls, and on the hue and lightness rounds that fit as well
as absolute does: at one absolute lightness the cusp-relative coordinate makes a blue pair about a
third easier than a yellow one, and a hue trough centred on blue cancels that at every lightness, so
the two models predict the same verdicts wherever lightness tracks the cusp. `calibrate-cusp.html`
crosses four hues the two order oppositely (red 15, yellow 100, cyan 195, blue 285) with absolute
lightness bands shared by all four, at chroma 11, or 8 for cyan, and its second round holds every
rung at the threshold. The four hues were marked alike; cusp-relative with its trough trails absolute
by 6.3 units like for like and by 3.5 with two parameters more.

Not adopted: the hue term. Under absolute lightness it is what is left of the trough - 8 per cent,
two parameters for 2.8 units, the palette bootstrap includes no effect - and it is on record in the
fit's output for a later round to promote.

Not adopted, and worth knowing before refitting: the chroma round on its own reports a chroma slope
of 0.6 that looks decisive. It is its hue and lightness composition. A chroma level reachable at
every hue is capped near 13, and pushing past it confines the probes to blues and magentas, whose
cusps are dark. `calibrate-hue.html` exists because of that.

`calibration-verdicts-16px.json` is the predecessor, 78 palettes from 2026-09-02 under a coarser
schedule with no ground control. Archival: its ranges contain the current fit, and the two logs are
not poolable.

Refit with `node data/fit.js --warped data/calibration-log.json`. A different swatch size needs its own log
and fit; the thresholds are size-dependent.

### Naming round

`naming-verdicts-16px.json`: 120 colors named by the author on 2026-09-05 at 16 px swatches, one word per color
from the 36 of `calibrate-names.html`. A record holds the hex, the word, the shortlist the page offered and
whether the full list was opened. Read by `node data/fit_names.js data/naming-verdicts-16px.json`, which scores
every pair of answers.

### Hue step logs

Logs of `calibrate-hue-steps.html`: at an anchor color the judge scrubs a run of swatches to each side and picks
the first that reads as a different color. A record holds the anchor's hue and hex, the hues and hexes picked to
the left and right, the anchor's lightness and chroma, absolute and cusp-relative, the degrees per swatch, the run's
reach in swatches, the swatch size and the ground. All the tracked logs step hue alone.

- `ridge-2-steps-log.json`, version 1: two rounds of 51 anchors along the ridge of most saturated colors, the
  anchor a position along the ridge, 2026-09-07.
- `hue-1-steps-log.json` and `hue-2-steps-log.json`, version 2: anchors at cusp lightness and 50% of the reach,
  48 and 96 trials, 2026-09-07.
- `hue-3-c70-steps-log.json`: the same at 70% of the reach, 48 trials, 2026-09-07. `hue-4-c80-steps-log.json`
  and `hue-5-c80-steps-log.json`: at 80%, 48 trials each, 2026-09-07 and 2026-09-09.

`node data/fit_hue_steps.js log.json [more.json]` turns them into a hue density against the shipped
`HUE_DENSITY`; both versions read. `fit_step_weights.js` needs a log with lightness and chroma runs at the
same anchors, and no tracked log holds them.

### Palette rounds

`palette-pairs-log.json`: 120 pairwise verdicts from `calibrate-palettes.html`, each pair the same seed and
count generated under two of three hue conditions, shipped, angle and uniform, described in the deal stamp, from the box lightness 40 to 60 and chroma 60 to 100, at counts 7 and 10;
a record holds both palettes with their hexes, names and condition, and a verdict of a, b, both or neither. The
deal is stamped in the log. Read by `node data/fit_palettes.js data/palette-pairs-log.json`.

`palette-members-log.json`: 120 palettes of 8 from `calibrate-members.html`, the box lightness 20 to 60 and
chroma 20 to 100, 60 colors dealt into two palettes each; a record holds the palette's hexes and names, the fixed
color and the members marked bad. Read by `node data/fit_members.js data/palette-members-log.json` for where
the bad colors live, and by `node data/fit_preference.js data/palette-members-log.json` for the draw's
`PREFERENCE` constant.

### Hue boundary logs

`boundary-1-log.json` to `boundary-15-log.json` are the hue boundary rounds from
`calibrate-boundaries.html`, one pair per trial at the same lightness and chroma, a set hue turn apart, graded
too close, marginal or fine. Rounds 1 to 3 asked whether one color would be recalled as the other; from round 4
the question is whether the judge wants both in one palette, a preference, which the judge holds steadier. Each
record carries the pair's hexes, its turn and centre hue, and for a boundary deal the boundary it was placed around
and the offset of the turn from it. The `deal` stamp says how the log's
pairs were placed: version 1 put each color at the centre hue's cusp lightness and its own reach, so round 1's
pairs differ in chroma within a pair and its yellow pairs are pale; version 2 names its `placement`: `shared` is one
lightness and one chroma per pair, `own-chroma` one lightness and each color's own reach, `own` each color at its
own hue's lightness and reach, `own-reversed` each at the other's, `low` and `high` both at the lower or the higher. Rounds 1 and 2 are boundary deals; rounds 3 to 9 the same sweep, rounds 3 and 4
shared, 5 own-chroma, 6 to 9 own; round 4 onward under the preference question. Rounds 3 to 6 sit at the cusp
at 85% of the reach; round 7 at the cusp at 50%, round 8 at relative lightness 25, round 9 at 75, both at 85%.
Round 10 is a lightness deal, `axis` lightness in the stamp: one hue per pair, the colors a turn apart in
cusp-relative lightness around a centre, twelve hues, centres 35, 50 and 65, turns 10 to 60; it tells absolute
from cusp-relative lightness. Round 11 is a chroma deal, `axis` chroma: one hue and lightness per pair, the colors a
turn apart in chroma share of the reach around centres 30, 50 and 70, turns 10 to 50; it measures the chroma weight.
Rounds 12 and 13 repeat the dark and the pastel sweeps, rounds 8 and 9, pair for pair. Round 14 sweeps violet, 230 to
340, and green as a control, 120 to 190, every pair dealt under both the shared and the own placement in one
sitting, each record tagged with its placement. Round 15 deals violet 260 to 340 and red-orange 20 to 80 at turns 30 and 45
five ways each: one lightness at the mean (`own-chroma`), each at its own cusp (`own`), each at the other's
(`own-reversed`), both at the lower (`low`), both at the higher (`high`), every color at 85% of its reach there.
`boundary-1-log.json` to `boundary-15-log.json` follow the same record format.
`boundary-16-log.json` is a mixed deal, `axis` mixed: 180 pairs anywhere in lightness 20 to 80 and 30 to 100% of the
reach, the two colors differing in hue, lightness and chroma at once, 30 pairs per band of distance 2 to 18 on the
metric. A record carries the pair's index in the deal, its hexes, hues and grade; the stamp carries the box, the
distance range, the bands and the seed. It validates the metric on pairs of a kind no earlier round dealt.
`boundary-17-log.json` is a mixed deal in cells: both colors in hues 230 to 340 (144 pairs) or 90 to 200, the control
(48), in one of three windows of cusp-relative lightness, 13 to 37, 38 to 62, 63 to 87; half the pairs differ in hue
alone (`kind` hue, the shared placement), half in hue, lightness and chroma (`kind` mixed); four bands of OKLab
deltaE per cell, 4 to 16 and 6 to 26, so the metric had no part in the deal. A record carries its `kind` and `window`.
Rounds 18 to 20 are the same kind of deal over what rounds 4 to 17 left thin: round 18 muted colors, every hue, the
three windows, chroma 20 to 50% of the reach, hue and mixed pairs (120); round 19 pairs differing in chroma alone
(`kind` chroma), six hue ranges, windows 10 to 30 and 30 to 48 below the cusp, chroma 10 to 100% (96); round 20
hues 45 to 255 in three overlapping ranges, the same two windows, hue and mixed pairs (144).

- `node data/fit_boundaries.js log.json` tables one deal's grades by turn and placement.
- `node data/fit_hue_density.js data/boundary-1-log.json data/boundary-2-log.json data/boundary-3-log.json` pools every log into the memory-scale hue density; a
  record's own hexes carry everything the fit reads, so deals of any version pool.

### Archive

`calibration_0409/` is the state of the `calibrate.html` logs on 2026-09-04, before the 28 sessions the
constants come from were judged: `calibration-log.json` there pools the 78 predecessor sessions with 24 judged
that morning under the new schedule, and `new-schedule-24.json` holds those 24 alone. None of the sessions is
in the current `calibration-log.json`, and the predecessor's are not poolable with it (above). Read by
`node data/fit.js --warped` like any `calibrate.html` log.
