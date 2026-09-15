# Generation evolution

What was tried for the generator, in order, with the numbers each step produced. The original page steered
generation by color names; this file covers the rework that replaced names with a recall model, the metric
built to judge it, and the rework's promotion to `index.html`. Paths are relative to the repo root, and the
snapshots the steps name by filename alone are in `data/past-experiments/`.

## The yardstick

`data/identify.js` scores a palette by the task itself: a viewer recalls a color with Gaussian memory noise
in OKLab (width `SIGMA`, lightness and chroma weighted by `W_L`, `W_C` against hue) and answers with the
nearest palette entry. Each color's accuracy is one minus its summed pair swap chances. Until the calibration
it was the fraction of simulated recalls landing on the color; see the Calibration section for why.

- **floor**: the palette's worst color accuracy. Mean overstates a palette with one bad entry.
- **floor, all runs**: that floor averaged over 20 seeds, two range boxes (default s 45-90 l 35-65, wide
  s 40-100 l 25-75, full hue) and 6, 8, 10 colors. The single number quoted below unless stated.
- **worst seed**: the lowest floor among the 20 seeds. The tail a user hits by re-rolling.
- **min dE**: smallest unweighted OKLab distance in the palette, averaged over seeds.

Every score below was measured at the provisional constants sigma 6, wL 1, wC 0.7, before calibration (see
the Calibration section); they rank variants against each other and do not predict human accuracy.
Differences under about a point are noise.

The old `data/bench.js` (name overlap times a 30 dE distance falloff) disagrees with this metric in direction:
it prefers the name-aware `index.html` (worst 0.579) over the reworked page (0.496 to 0.516), since the rework
repeats names at large N. Each generator wins on the metric it optimizes. Calibration decides which is right.
That script is gone; its scorer is now the naming score `identify.js` reports beside the identification one,
off the page's own overlap table rather than a copy of the survey data.

## Steps

All at sigma 6, 20 seeds. Reference points: `index.html` scores 86.7; the pre-rework `experimental.html`
(name-aware, same sampler) scored within 0.2 of `index.html`.

| step | mechanism | floor, all | notes |
|---|---|---|---|
| 1. sum-of-swap gradient descent | farthest-point start from 1500 uniform draws, descent on the summed pairwise swap chance, projected into the box | 92.8 | collapses at large N: gap 0 at n=12 sigma 30 and at n=40 |
| 2. soft-max over pairs | same descent, energy is a soft maximum (sharpness 20) | 92.5 | fixes the collapse (n=40 gap 10.8); saved as `experimental-gradient.html` |
| 3. straight push-apart | farthest-point start; only pairs above 2% swap chance step 1 dE along their line; 10 dE budget per color; no-worse rule | 88.0 | default n=10 drops to 74.2 |
| 4. dart start | first uniform draw under the 2% limit, farthest of 1500 as fallback; then step 3's push | 88.5 | saved as `experimental-gradient-restricted-push.html` |
| 5. cone push | step direction uniform within 120 deg of the away-axis, per-color stall after 25 rejections | 89.1 | flat from 60 deg up; straight is 88.5 |
| 6. angle band | forbid directions within a minimum angle of the axis; sliders for both angles | 89.1 | free up to 40 deg, costs from 60 (88.7), 80 deg gives 86.8; saved as `push-with-angle-randomization.html` |
| 7. crowd filter, best snapshot | no-worse rule replaced by "dropped if too close to another and closer than before"; return the best-floor state seen | 88.4 | fewer wall colors at n=10 (62% to 44%) |
| 8. persistent heading | one direction per color, kept while accepted, redrawn on rejection | 88.6 | in full boxes 80% of steps are rejected, so it rarely persists |
| 9. whole-set start | dart start replaced by whole uniform sets: the first with a floor at the bar, else the best of 2000; step 8's push | 87.6 | bar 0.85; loses 5 points at default n=10, clips more (63% vs 46% at 9 colors); reverted, saved as `experimental-wholeset-start.html` |
| 10. own-error filter, gamut margin | dart start back; a push is dropped if the color's summed swap chance rises or it lands on the gamut surface | 90.3 | default n=10 83.3 to 87.4, worst seed 79.9 to 84.7, clipping 46% to 1%; saved as `experimental-error-filter.html` |
| 11. no budget | the 10 dE budget removed | 90.4 | worst seed 86.3; the budget was not binding (see the knob table) |
| 12. spaced start | dart start at the widest spacing the draws fill: the limit, then 15% wider per try until a color finds no draw | 90.5 | no gain: random placement is at its packing ceiling near the limit already (finding 2); reverted, the limit kept as a distance |
| 13. error trigger | a color is pushed while its summed swap chance exceeds the 2% limit, away from all neighbors weighted by the slope of their swap chance | 92.5 | 9 colors 92.7, worst seed 90.4; the largest gain since the dart start |
| 14. box-wall margin | the gamut margin replaced by every wall of the box, hue ends included: a push landing on one is dropped | 92.1 | empties the walls (default box saturation max 75% to 1%, hue ends of a 200-320 range 40% to 3%); costs 1.7 at default n=10; saved as `experimental-error-trigger.html` |
| 15. clamp refusal | the wall margin replaced: a push is dropped only when the box or gamut had to pull its target back; a target inside the box is accepted wherever it lands | 92.2 | 9 colors 92.6, 46 ms against 71; colors settle within a step of the walls: 25 to 33% within half a unit at 10 colors, 27% with a 00 or FF channel; saved as `experimental-clamp-refusal.html` |
| 16. clamp slack | a push is dropped only when the clamp pulled its target back by more than 0.3 dE; a slighter protrusion is clamped and kept | 92.4 | 9 colors 92.5; the walls fill again: saturation max 61 to 85% at 10 colors, 79% of colors with a 00 or FF channel at 9; not adopted |
| 17. reachable floor, adaptive restarts | step 15 adopted as `index.html`; one wall-using attempt from its own seed gives the floor the box allows; restarts continue up to 16 while the best is under 90% or more than 2 points short of it; the status line shows the readout | 92.4 | default n=10 87.2 to 88.4, worst seed 81.7 to 87.3; 197 ms against 66 in the full default box, unchanged elsewhere |
| 18. OKLCh box | the HSL ranges replaced by OKLab lightness, absolute chroma (0 to 33) and OKLCh hue; uniform draws by rejection, gamut mapping by chroma reduction, planes and 3D faces linear in OKLCh | 90.5 (new boxes) | not comparable with the rows above: the boxes changed shape; see the OKLCh baseline below; saved as `experimental-oklch.html` |

Why steps 1 and 2 were abandoned despite the score: a maximin over a box has its optimum on the hull, so
every seed converged to the same corners (one box always produced `#FF99FF`) and a third of hex values
repeated across seeds. Steps 3 onward trade score for seed variety and interior colors.

### Sweeps

Cone half-angle, step 5 (floor all / default n=10): 0 deg 88.5 / 82.5; 60 deg 89.0 / 84.8; 90 deg 89.1 / 84.9;
120 deg 89.1 / 84.9; 150 deg 89.1 / 84.7.

Minimum angle with the maximum at 120 deg: 0 to 40 deg 89.1; 60 deg 88.7; 80 deg 86.8.

## Findings

1. **Feasibility is a property of the box and N.** The 2% limit needs about 24.6 weighted dE at sigma 6.
   The maximin optimum's min dE (step 2) is 28.4 / 23.4 / 19.4 in the default box at 6 / 8 / 10 colors and
   32.3 / 27.2 / 24.4 in the wide box. Where the needed distance exceeds the optimum, every acceptable palette
   is a perturbation of one arrangement and no generator can add variety.
2. **Random placement reaches about 0.8 of the optimal spacing.** Random sequential packing in 3D jams at
   38% volume fraction against 74% for the densest packing. Pure random placement therefore suffices only
   where needed / optimum is below 0.8.
3. **Wall colors come from the pushes, not the start.** Right after the dart start 2 to 5% of colors sit at
   the box's saturation max; after pushing, 48 to 61% do at 10 colors. Any step with an outward chroma
   component is clamped to the wall and stays there. With saturation max 100 the wall is the sRGB gamut
   surface, so those colors carry a 00 or FF channel.
4. **The budget is not binding.** Tripling it from 10 to 30 dE changes nothing; colors move about 3.5 dE and
   5% reach the budget. Pushes end by rejection.
5. **The crowd filter was the limiter** (steps 7 to 9). In a full box every color has too-close neighbors
   on several sides, so nearly every direction approaches one by a hair and is rejected. Replaced in step 10.
6. **The dart start is two heuristics.** In the s 21-100, l 15-68 box at 9 colors, the first six colors are
   Poisson-disk draws at the goal radius; colors 7 to 9 exhaust the draws and take the farthest, which is
   greedy farthest-point sampling. Plain uniform draws score a floor of 57 in that box; the dart start alone
   scores 86, and pushing adds 3 on top.
7. **The trigger and the filter matter, the direction does not.** Steps 5, 6 and 8 (cone, band, persistent
   heading) moved the floor under a point; steps 10 and 13 (filter and trigger on the color's own error)
   moved it 4. The push stage is at 92.1 against the maximin optimum's 92.5, with every color off the walls
   and every seed distinct, so the remaining headroom is the restarts' tail and the box itself.

## Negative results

What was tried and did not pay, with the number that decided it. Details are in the tables below.

1. **Summed swap chance as the descent energy** (step 1): 92.8 but the sum prefers piling colors into a
   corner, away from the many far ones; gap 0 at 12 colors sigma 30 and at 40 colors. Soft maximum instead.
2. **Soft-max sharpness**: 10 / 20 / 40 gave 92.6 / 92.5 / 92.3 and 40-color gaps 9.8 / 10.8 / 11.9. Flat.
3. **Any descent to the optimum** (steps 1, 2): the optimum lies on the box hull, so every seed converged
   to the same corners and a third of hex values repeated across seeds. Abandoned for that, not for score.
4. **Straight push-apart** (step 3): 88.0, and 74.2 at default n=10, since pushes from several sides cancel
   and jostle in a full box.
5. **Push direction**: cone (step 5), angle band (step 6), persistent heading (step 8) all moved the
   all-runs floor by under a point. Bands narrower than 60 deg or restricted to the sideways half cost 1 to
   4 points under later filters. The direction was never the lever.
6. **Crowd filter** (step 7): 88.4 against the no-worse rule's 89.1, and the limiter in full boxes, where
   80% of proposals were rejected because every direction approached some too-close neighbor.
7. **Whole-set rejection** (idea 1, step 9): at 9 colors the best of 50000 uniform sets floors at 80,
   below the dart start alone at 86; with pushes on top it loses 5 points at default n=10 and 6 of worst
   seed. Viable only at 6 colors.
8. **Push budget**: 30 dE changes nothing against 10, 5 dE costs a point, none gains 0.1. Removed.
9. **More start draws**: 5000 against 1500 gains nothing and costs 5x time.
10. **Wider dart spacing** (step 12): searching the largest spacing the draws fill gains 0.1. Random
    placement is at its packing ceiling near the limit already (finding 2).
11. **Push step and stall count**: 0.5 / 1 / 2 dE and 10 / 25 / 60 rejections all within 0.3. The stall
    count is not flat at the calibrated metric; see the knob re-measurement under Calibration.
12. **Error limits below 2%** (step 13): 1% and 0.5% gain 0.6 to 0.8 overall, nothing in the full box,
    and push more colors to the walls.
13. **Gamut margin alone** (step 10): removes the 00 / FF channels but only where the saturation max is 100;
    in the default box 75% of colors sat on the saturation-90 wall regardless. The box walls are the boundary.
14. **Clamp detection by distance at 1e-6 dE** (step 15, first attempt): 86.4, because the color round trip
    moves an interior point by 2e-6 to 4e-6 dE. A measurement bug, not a rule result.
15. **Clamp slack** (step 16): any allowance, 0.1 dE up, makes a wall absorbing again; 57 to 92% of colors
    with a 00 / FF channel at 9 colors for under a point of floor.
16. **bench.js on the rework**: the name-based score prefers `index.html` (worst 0.579 against 0.496 to
    0.516), so the two metrics disagree in direction. Not a generator result; it is why calibration matters.

17. **Reachable floor from the result's own seed** (step 17, first attempt): the wall-using run shares the
    seed's dart start, so a poor seed reads as at its ceiling and no extra restart is made; floors identical
    to step 15. A run from its own seed fixes it. In a full box the wall-using run is not an upper bound
    either: at default n=10 it scores 87.9 against the normal 89.2 by the page's model, and the gradient
    page's descent 85.3. No cheap estimator bounds the optimum there, so the readout is a lower bound.
18. **Shortfall rule alone** (step 17, second attempt): restart only while more than 2 points short of the
    reachable floor: worst seed 86.0 and 118 ms at default n=10, against 87.3 and 197 ms with the 90% target
    added. A cap of 32 restarts instead of 16 gains nothing (worst seed 87.2) at 240 ms.

One caveat on early numbers: `index.html` measured 83.7 in the first 20-seed run and 86.7 later in the same
session with identify.js unchanged, so the page itself changed in between. Comparisons in this file use
numbers measured side by side.

## Variants at 9 colors, box s 21-100 l 15-68

The current page defaults. 20 seeds, sigma 6. Scratch patches of step 8 unless named.

| variant | floor | worst seed | min dE | clipped | distinct hexes of 180 |
|---|---|---|---|---|---|
| uniform draws, no search, no pushes | 57.1 | 47.1 | 8.6 | 2% | 180 |
| dart start only | 86.2 | 80.7 | 21.4 | 3% | 180 |
| `experimental-gradient-restricted-push.html` (step 4) | 88.9 | 87.1 | 24.8 | 46% | 179 |
| current (step 8) | 89.2 | 86.9 | 24.5 | 46% | 179 |
| current, budget 30 | 89.3 | 86.9 | 24.5 | 47% | 179 |
| no filter at all | 89.8 | 87.6 | 23.2 | 78% | 178 |
| own-error filter: dropped if the moved color's summed swap chance rises | 90.9 | 89.2 | 24.2 | 62% | 174 |
| current + gamut margin: dropped if the pushed color has a 00 or FF channel | 89.2 | 86.9 | 24.2 | 1% | 180 |
| own-error filter + gamut margin | 90.5 | 88.7 | 24.2 | 1% | 180 |
| no filter + gamut margin | 88.6 | 86.1 | 22.4 | 1% | 180 |
| maximin optimum, `experimental-gradient.html` | 93.3 | 91.9 | 26.8 | 99% | 130 |

Reading: the clipping costs nothing to remove; the own-error filter buys 1.5 to 1.7 points; the remaining
3 points to the optimum are paid for with hull colors and repeated palettes.

### Wholesale rejection of uniform sets

The original idea 1: draw whole sets uniformly, reject the bad ones. Measured on 50000 uniform sets in the
same box, floor by the page's analytic model.

| colors | median floor | best 1 in 100 | 1 in 1000 | 1 in 10000 | best of 50000 | best min dE |
|---|---|---|---|---|---|---|
| 6 | 56 | 86 | 91 | 94 | 96 | 26.7 |
| 9 | 28 | 64 | 72 | 77 | 80 | 16.6 |

At 6 colors one set in a thousand matches the pushed generator, so wholesale rejection is viable there at
negligible cost and with no bias at all. At 9 colors the best of 50000 sets is below the dart start alone
(86.2, min dE 21.4): the acceptable region has too little measure to hit by whole-set draws. The dart start
is the same idea applied per color, and per-color rejection compounds where whole-set rejection does not.

### Whole-set start with pushes (step 9)

The bar is `START_FLOOR`: a drawn set below it is rejected and another drawn, up to `START_SETS`. 20 seeds.

| start | floor, all runs | default n=10 | worst seed, all | 9 colors, new box | clipped | ms per run |
|---|---|---|---|---|---|---|
| dart start (step 8) | 88.6 | 83.3 | 79.9 | 89.2 | 46% | 41 |
| whole sets, bar 0.5 | 85.1 | 77.0 | 67.9 | 84.4 | 67% | 16 |
| whole sets, bar 0.7 | 87.1 | 78.4 | 73.8 | 88.5 | 63% | 32 |
| whole sets, bar 0.85 | 87.6 | 78.5 | 73.8 | 88.4 | 63% | 109 |
| whole sets, best of 2000 | 87.5 | 78.5 | 73.8 | 88.4 | 66% | 110 |

Ties the dart start where the box has room (6 colors, 9 in the new box), loses 5 points of floor and 6 of
worst seed where it is full. A bar above 0.7 is rarely reached at 8 or more colors, so the start is then
best-of-2000 and pays for all 2000 evaluations. Every seed is distinct in every row.

### Knobs of step 10

Scratch patches of step 10, 20 seeds. Columns: all-runs floor, default n=10 floor, worst seed over all runs,
then the 9-color new-box run.

| variant | floor all | default n=10 | worst seed all | n9 floor | n9 worst | n9 min dE | n9 clipped | ms per run |
|---|---|---|---|---|---|---|---|---|
| step 10 as is (4 restarts, 1500 draws, budget 10) | 90.3 | 87.4 | 84.7 | 90.5 | 88.7 | 24.2 | 1% | 37 |
| 8 restarts | 90.8 | 88.1 | 85.2 | 90.4 | 88.0 | 24.3 | 1% | 127 |
| 16 restarts | 91.0 | 88.4 | 85.8 | 90.7 | 88.0 | 24.2 | 2% | 243 |
| 5000 start draws | 90.2 | 87.3 | 82.8 | 90.2 | 88.0 | 24.3 | 1% | 176 |
| budget 5 | 89.5 | 85.4 | 82.2 | 90.0 | 88.1 | 23.9 | 1% | 39 |
| no budget (step 11) | 90.4 | 87.9 | 86.3 | 90.7 | 87.9 | 24.5 | 2% | 37 |

Restarts buy half a point per doubling at proportional cost; kept at 4. More start draws buy nothing.
The budget only costs when small, so it was removed.

Angle band re-swept under the own-error filter (step 11, floor all / default n=10 / worst seed all):
0-30 deg 89.3 / 85.1 / 80.4; 15-60 deg 90.0 / 87.3 / 82.8; 0-120 deg 90.5 / 88.2 / 86.2; 15-120 deg (kept)
90.4 / 87.9 / 86.3; 45-120 deg 90.6 / 87.8 / 85.7; 15-180 deg 90.5 / 88.2 / 84.0; 90-180 deg 87.8 / 81.5 / 78.2.
Unlike under the crowd filter, a narrow cone now costs a point: the wide band is what lets a color slide
past a neighbor instead of being rejected.

Push step 0.5 / 1 / 2 dE: 90.6 / 90.4 / 90.7. Stall after 10 / 25 / 60 rejections: 90.2 / 90.4 / 90.5, worst
seed 81.9 / 86.3 / 85.6. Both left as they were.

### Error trigger and wall margin (steps 13, 14)

Scratch patches of step 11. The per-color limit is the error a color may carry before it is pushed.

| variant | floor all | default n=10 | worst seed all | n9 floor | n9 worst | n9 min dE | ms per run |
|---|---|---|---|---|---|---|---|
| step 11 (pair trigger, gamut margin) | 90.4 | 87.9 | 86.3 | 90.7 | 87.9 | 24.5 | 37 |
| error trigger, limit 10% | 88.2 | 85.9 | 82.8 | 87.0 | 84.6 | 21.3 | 35 |
| error trigger, limit 5% | 90.6 | 88.1 | 86.3 | 90.6 | 88.7 | 23.2 | 46 |
| error trigger, limit 2% (step 13) | 92.5 | 88.3 | 86.4 | 92.7 | 90.4 | 25.6 | 83 |
| error trigger, limit 1% | 93.1 | 88.3 | 86.4 | 92.8 | 91.2 | 26.1 | 103 |
| error trigger, limit 0.5% | 93.3 | 88.3 | 86.4 | 92.6 | 90.6 | 25.9 | 100 |
| limit 2%, saturation-wall margin | 92.1 | 86.8 | 82.4 | 92.5 | 90.4 | 25.4 | 69 |
| limit 2%, all-walls margin (step 14) | 92.1 | 86.6 | 82.0 | 92.3 | 88.9 | 25.1 | 71 |

The limit stays at 2%, the same number as the start's pair spacing: lower limits gain under a point overall
and nothing in the full box, and push more colors to the walls.

Wall occupancy at 10 colors, default box (saturation max 90, so the gamut margin does not apply there):
step 11 has 75% of colors at the saturation max and 31% at the lightness min; step 13 with the gamut margin
the same; the saturation-wall margin brings the saturation max to 2% and leaves the lightness min at 29%;
the all-walls margin brings every wall to 2% or less. The wall margin is the typicality knob: it pays
1.7 points of floor in the full box for interior colors, and nothing where the box has room.

Under step 14 (floor all / default n=10 / worst seed all / n9 floor / n9 worst): angle band 0-60 deg
90.8 / 84.4 / 79.6 / 91.9 / 88.6; 0-120 92.0 / 86.7 / 82.6 / 92.7 / 89.6; 15-120 (kept) 92.1 / 86.6 / 82.0 /
92.3 / 88.9; 45-150 92.1 / 87.0 / 82.4 / 92.2 / 90.0; 15-180 91.9 / 86.8 / 83.0 / 92.4 / 90.1. Restarts 8:
92.4 / 87.9 / 86.6 / 92.6 / 90.4 at 170 ms per run against 71: the one knob left that moves the worst seed,
at the cost of slider responsiveness. Kept at 4.

Step 15 measured the clamp test two ways. By distance between the target and the color that came back,
tolerance 1e-6 dE, the floor fell to 86.4: the OKLab to RGB to HSL round trip carries float error above
that, so nearly every push read as clamped. Detecting the clamp where it happens, in colorInBox, gives
92.2. Wall occupancy at 10 colors under step 15: default box saturation max 29%, lightness min 23%; new box
saturation max 33%; hue ends of a 200-320 range 25% at 6 colors. Those colors are within half a unit of
the wall, not on it, and no push put one there by clamping; in hex terms a third of them still show a
00 or FF channel.

Step 16 swept the slack (floor all / n9 floor / n9 clipped / distinct hexes of 180): 0.1 dE 92.3 / 92.8 / 57% /
180; 0.3 (kept) 92.4 / 92.5 / 79% / 179; 0.5 92.6 / 93.1 / 81% / 175; 1 dE, every clamp accepted, 92.8 / 92.9 /
92% / 156. Any slack makes a wall absorbing again: a color that touches one keeps taking the glancing steps
whose protrusion is under the slack, and slides along it. The floor gain over step 15 is under a point;
the wall occupancy is back to step 13's. The round trip OKLab to RGB to HSL and back moves an interior
point by 2e-6 to 4e-6 dE: step 15's first attempt, at 1e-6 tolerance, read every push as clamped.

## OKLCh baseline (step 18)

The ranges are OKLab lightness 0 to 100, chroma 0 to 33 (sRGB reaches 32.25, at magenta) and OKLCh
hue. The benchmark boxes in identify.js changed with them: default is the page's defaults (chroma 5-33,
lightness 20-80), narrow is chroma 8-33, lightness 35-65; the scratch 9-color box is chroma 5-25,
lightness 30-75. Nothing here compares with the HSL rows: an absolute chroma range reaches the gamut
surface for most hues, so the box's walls are largely the gamut itself, and the volumes differ.

| box, N | floor | worst seed | min dE |
|---|---|---|---|
| default 6 | 94.2 | 92.7 | 27.9 |
| default 8 | 93.5 | 91.9 | 27.0 |
| default 10 | 90.0 | 87.5 | 23.6 |
| narrow 6 | 94.0 | 93.1 | 28.2 |
| narrow 8 | 88.9 | 86.9 | 22.3 |
| narrow 10 | 82.5 | 80.3 | 18.1 |
| 9 colors, chroma 5-25 | 89.3 | 87.0 | 23.0 |

What the conversion removed: the density tables that corrected HSL draws to OKLab volume, and the
arc-length axes that made the HSL planes perceptual. What it added: a gamut test per draw, since a
chroma range past the gamut is rejected there, and a chroma bisection when a push leaves the gamut.
Time per generation: 50 ms at 8 colors in the default box, 324 ms at 10 in the narrow box (a full
box, so all 16 restarts run), 1.0 s at 20. Two speed measures with no effect on results: the color
record (name lookup, hex) is built only for a kept draw or push, and the gamut test uses linear sRGB,
skipping the transfer curve.

Colors at the gamut surface reappear under absolute chroma: 15% of colors at 9 colors carry a 00 or FF
channel, all placed there by the dart start, since the pushes still refuse a gamut pull. A chroma
maximum below the gamut's reach for the hues in use keeps them off it.

## Not yet tried
- Stratified placement: seeded k-means partition of the box, one random draw per region.
- Metropolis sampling at a temperature, the principled distinctness-versus-randomness knob.
- A switch for the wall margin, since it is the distinctness-versus-typicality knob (see steps 13, 14).
- Steering by name crowding: a per-color penalty from the name entropy of the color's neighbourhood in the
  survey grid, so palettes avoid colors no single name wins. Not the original page's steering, which worked
  from pairwise name overlap; crowding is a property of one color, and the naming round validated it as a
  nameability measure (see the naming round under Calibration).

## Calibration

`calibrate.html` shows one palette at a time, scattered at the swatch size on a ground, and
records which pairs the viewer marks as too close or marginal; unmarked pairs are fine. `data/fit.js` fits an
ordered probit over the weighted pair distance to the verdicts. An earlier design by recall trials (learn
letters, answer letter by letter, dozens of palettes) was dropped: it measured memory under time pressure,
while the real task is one palette after a week of use. The question answered for each pair was "would I
still confuse these two after learning the palette for a while".

Data: `data/calibration-verdicts-16px.json`, 78 palettes at 16 px (details in `data/README.md`). The table
below is fitted on 40 of them, the axes and validation rounds; the 38 region palettes came later. Result:

| | hue | chroma | lightness |
|---|---|---|---|
| weight against hue | 1 | 0.5 | 0.35 |
| too close below, raw deltaE | 5 | 10 | 14 |
| fine above, raw deltaE | 8 | 16 | 23 |

Softness 2 weighted deltaE; wL within 0.3 to 0.4, wC within 0.4 to 0.6 at 2 log-likelihood units. Against
the provisional constants: hue is three times as potent as lightness, and the scale is three times tighter
(fine at 8 weighted deltaE, not 25).

Sigma is set where a lone pair is judged fine reliably, two softness units past the fine threshold (12
weighted deltaE), not at the threshold: five generator palettes at sigma 1.9 (nearest pairs at the threshold)
each drew a marginal mark, five at sigma 3 (nearest pairs at 13 to 14) drew one between them. The refit
on all 78 palettes, region round included, has softness 3 and so a rule sigma of 3.5. Adopted: sigma 3.5,
wL 0.35, wC 0.5, in `data/identify.js` and both pages.

Verdicts were consistent with the fit, with two patterns the model does not carry:

- Lightness-only pairs 30 apart were marginal 6 times of 16 when the darker color sat at OKLab L 30 to 45,
  and 0 of 7 with the darker at L 60. Lightness discrimination is worse among dark colors. Not modeled.
- One hue-only pair at 13.6 (vivid magenta and pink) was marginal while the six hue-13 probes were fine.

Every far-hue pair was fine, including dull opposite-hue pairs at 12 deltaE chord (chroma 6 brown against
chroma 6 navy). This decided the noise geometry. The Monte Carlo `data/identify.js` used until then drew
chroma noise through the neutral axis, where a dull recall lands near every other dull color, and scored such
pairs 8% confused; its floors at the calibrated constants (about 90% in the default box, against 98% from
the pages' analytic formula) were that artifact. Four Monte Carlo geometries were fitted to the verdicts
through the same ordered-probit link as the analytic distance, each over sigma and both weights:

| judge | log-likelihood below the analytic fit |
|---|---|
| Cartesian noise in the color's frame (the old yardstick) | 11.5 |
| chroma clamped at grey | 8.0 |
| chroma noise proportional to chroma | 5.5 |
| hue noise as an angle, chroma clamped | 13.0 |

None came close, so the yardstick is now the analytic formula: pair swap chance from the polar weighted
distance, a color's error the sum over its pairs, the same as the pages optimize. Baseline of step 18 on it
at the adopted constants (floor / worst seed): default box 6, 8, 10 colors 98.6 / 98.2, 98.2 / 98.0,
98.1 / 98.0; narrow box 98.8 / 98.2, 98.2 / 98.1, 98.0 / 97.7. The narrow box still binds at 10 colors, by
0.1 points of floor. Scores move with the constants, so they compare only within one set of them: at sigma
3.5 and wC 0.5 the same runs read 1 to 5 points lower, narrow 10 colors most of all. These boxes stop at
lightness 20, so the lightness gain barely shows in them; it bites in a box that reaches the dark end.

Two refinements the verdicts suggested were tested on the analytic model and are not supported at this data
volume: a hue distance scaled per 60-degree sector gains 2.4 log-likelihood units for six parameters, a
darkness term on the lightness weight at most 1.1.

A targeted round then tested the metric's scale by region: pairs in a random direction at weighted
distances 5 to 11, one region at a time (six hue sectors, three lightness bands, dull and vivid chroma), 10
pairs per region, fitted as a distance factor per region with the rest of the fit held. Every factor's range
at 2 log-likelihood units includes 1: hue sectors best 0.9 to 1.1, dark and vivid 1.25 (1 to 1.6), dull 0.9
(0.7 to 1.1). A 25% regional effect would have shown; none did. The metric is treated as uniform over the
gamut. The dark pairs judged lightness-only earlier (6 marginal of 16) did not recur with mixed-direction
pairs, so if that effect exists it is specific to lightness steps among dark colors.

A second round on 2026-09-04 replaced the region schedule with relative coordinates: probes at a set weighted
distance along one axis, crossed with three lightness and three chroma bands measured against the cusp and
the gamut boundary rather than in absolute units, so a chroma level is no longer also a hue selection. Each
palette was judged on a light and a dark ground and marked at its worst. 28 palettes moved wC from 0.5 to 0.6
and the rule sigma from 3.5 to 3; wL held at 0.35 and is now pinned harder than the 78-palette log managed
(0.4 costs 7.3 log-likelihood units, where before it was inside the range). Position dependence is still not
supported: the chroma exponent's -0.2 comes from the chroma axis, which the distance cap confines to middle
chroma, and vanishes among the hue and lightness probes that reach every band.

A third and fourth round then separated the three candidate position terms, which had each been standing
in for the others. The chroma round reported a chroma slope of 0.6 and, once a hue term was allowed, gave
it all up: its high chroma level was reachable only at blues and magentas, whose cusps are dark, so hue,
chroma and lightness moved together at r 0.65 to 0.74. The hue round dropped the chroma axis - a hue step
turns at constant chroma and so needs no room above the level, which is what had confined the levels to
the blues - and crossed six hue sectors with two chroma levels, drawing lightness across the whole span
each hue and level allow. That brought the three predictors to r under 0.07 and settled all of them:

| term | value | earns | adopted |
|---|---|---|---|
| relative lightness exponent | 0.40 | 16.1 log-likelihood units | yes |
| hue trough at 285 degrees | amplitude 0.10 | 4.3 units for 2 parameters | no |
| chroma exponent | -0.05 | 0.1 units | no |

The hue term was held because it was marginal and because it vanished under absolute lightness, which
these rounds could not rule out: the two lightness coordinates correlate at 0.81 and relative won by 1.9
units. The gain went in on the cusp-relative coordinate, as `apart2` and `recallDistance` multiplying the
distance by the pair's standing in the gamut, which cost the generator 20 to 54 per cent more pair
evaluations - the stricter metric lowers the floors it can reach, so the pushes stall later and the
restarts run longer.

Two rounds of `data/calibrate-cusp.html` then chose the coordinate. The two models were degenerate by
construction: at one absolute lightness the cusp-relative gain makes a blue pair a third easier than a
yellow one, and a trough centred on blue cancels that at every lightness, so any design whose lightness
tracks the cusp fits both alike. The page crosses four hues the two order oppositely - red and cyan share
the trough's node and differ in cusp lightness, yellow and cyan share a cusp and sit at its peak and node,
blue is its centre and the lowest cusp - with absolute lightness bands shared by all four; the second
round put every rung at the threshold (6, 7, 8) after the first showed the rungs at 4.5 and past 9.5
carried no information. Under the binary fit the two models sat 1.4 units apart on 300 pairs and 0.1 on
371; the ordered probit over all three grades, ported from `data/fit.js` and given several starts, put
absolute with no hue term 3.5 units ahead of cusp-relative with its trough, 6.3 like for like:

| coordinate | hue term | lightness exponent | log-likelihood |
|---|---|---|---|
| cusp-relative | trough 0.16 at 285 degrees, 18 units | 0.40 | -221.3 |
| absolute | none | 0.40 | -217.8 |
| absolute | trough 0.08 at 270 degrees, 2.8 units | 0.40 | -215.0 |

Adopted: the gain on the pair's mean absolute lightness, one at 50, in `apart2` and `recallDistance`,
which reads the lightness off the position and needs no cusp lookup. The hue term stays out: 8 per cent,
the bootstrap includes no effect. Blues and violets get about a third more room against yellows and
greens at one lightness than the cusp-relative gain gave them.

The ground is the effect the round could not measure. Dark colors that separate cleanly on a dark ground
collapse on a light one, strongly enough to need no statistics; light colors lose a little on a light ground
too, so the penalty is one-directional and not a symmetric squashing about mid lightness. Veiling glare fits:
a bright surround adds a luminance floor, and a common addend compresses a dark pair's ratio far more than a
light pair's. The log cannot show it, because a pair is marked once at its worst and 60 of 71 marks landed on
whichever ground came first. Scoring stays pessimistic and ground-blind; a lightness exponent would need a
round judged on the light ground alone.

### Naming round

`calibrate-names.html` shows colors one at a time at the swatch size and asks what each is called;
`data/fit_names.js` fits the naming score's distance decay to the answers. The words offered are a sweep:
every cell owning a grid bin within 22 OKLab units of the color, plus the color's own cell, with the full 36
behind an escape button. Data: `data/naming-verdicts-16px.json`, 120 colors judged 2026-09-05 in 6.8
minutes, median 6 words offered, the escape never used.

- `NAME_DECAY` measures 8 weighted deltaE (6 to 11 at 2 log-likelihood units, 4 to 8 by a color-level
  bootstrap), adopted; the 18 carried from the old bench costs 3.9 units, no decay at all 33. Same-cell pairs got
  the same word 50% of the time under 5 weighted deltaE, 28% at 5 to 10, 17% at 10 to 15. The fit is on the
  raw weighted distance, which is what `nameCollision` uses; naming on the lightness-corrected distance
  would need a refit.
- The page's cell matched the answer 53% of the time, but the median cell overlap on a disagreement is
  0.65 and only 9 of 120 answers are a genuinely different word: the winner-take-all partition picks one of
  two words the survey treats as near-synonyms (pink / light pink, purple / lavender, lavender / mauve).
  Some pale violets are assigned to white, a partition artifact at the pale edge.
- The overlap table predicts a shared word monotonically over its whole range, so the score's machinery
  is sound and only its constant was off. The unsure flag holds: 59% agreement on confident bins, 38% on
  flagged ones.

Negative result: hesitation carries no signal of its own. Time per answer rises with how crowded the
color's neighbourhood is (median 2.6 s in the two quietest quartiles of neighbourhood name entropy, 3.3 s
in the two most crowded) and agreement falls with it (67% to 37%), but every computable crowding measure
predicts the answer better than time does (z 2.2 to 3.0 against 1.5 at n=120). Crowding is a property of
the grid; the timings validate it as a nameability measure and add nothing beyond it. Agreement with the
table is capped by crowding, not by the observer, so a disagreement in a crowded region is not evidence
against the table.

### Knobs re-measured at the calibrated metric

Every optimizer knob was tuned at the provisional constants. Re-measured at the calibrated ones over 20
seeds, both benchmark boxes, 6 to 20 colors; deltas are points of floor / worst seed against the shipped
values. The steps themselves cannot be re-run: their pages predate the OKLCh controls the harness needs.

The bar (every color under 2% error) holds through 10 colors in the default box and 8 in the narrow one;
at 16 nearly every color is over it and at 20 all are, so above 12 the boxes are full and the floor is
what the packing allows.

| knob | shipped | result |
|---|---|---|
| restart target 0.9, cap 16 | kept | engages only where the bar is lost (20 colors, 16 in the narrow box) and pays there: cap 4 costs 1.1 / 2.0 at 20 for a third of the time; the shortfall rule alone stops too early, 0.9 / 2.0 at 20; target 0.98 gains 0.5 to 0.7 at 12 to 16 but restarts 16 times at 6 colors for nothing; cap 32 gains 0.4 to 0.6 at 20 for double the time |
| `START_DRAWS` 1500 | kept | 500 within noise, 5000 costs 2 to 4x for nothing |
| `PUSH_STEP` 1 | kept | 0.5 flat and slower, 2 loses up to 0.5 from 16 colors up |
| `RESTART_SHORTFALL` 0.02 | kept | 0.01 and 0.05 within 0.1 |
| `STALL_PUSHES` 25 | **60** | 10 loses 0.6 / 0.8 on average and 1.9 / 2.5 at 20; 60 gains 0.4 / 0.5 on average, 0.6 to 0.8 at 12 to 16, 1.1 / 1.4 at 20, within 1.3x time and faster at 20 in the default box since better attempts need fewer restarts (15.6 to 10.4); 100 and 150 add 0.1 to 0.2 more at up to 2x time |

The stricter metric lowers the floors an attempt can reach, so a color that stalls at 25 rejections is
still short of what more patience finds. Nothing moves at 6 to 8 colors, which are at the bar already.

## Lightness relative to the cusp

The lightness range was absolute OKLCh L, and the cusp - the lightness where a hue reaches its most chroma -
moves with hue: 96.8 at yellow, 45.2 at blue. One absolute band therefore clips the hues whose peak is bright
and admits only washed-out colors where it is dark. At the old default of 20 to 80, every hue from 73 to 220
had its peak above the band.

The range is now stated against the cusp: 0 black, 100 white, `CUSP_ANCHOR` 50 the cusp at every hue,
piecewise linear either side so the two maps are exact inverses. A range then selects the same standing in
every hue's own gamut. Ottosson's Okhsv does the same thing for color pickers, mapping the cusp to a fixed
coordinate; Okhsl does not, its lightness being a hue-independent toe function. He also notes that fitting
the gamut to a cylinder costs perceptual uniformity, which is why the coordinate is confined to the selected
region: every distance and the whole identification model stay in absolute OKLab, where the calibration put
them.

Three places needed the coordinate handled rather than substituted:

- A uniform draw takes the hue first, then lightness evenly between that hue's absolute bounds. Drawing in
  the relative coordinate and converting would crowd the draws wherever the map compresses.
- The sparse-box grid stores its centres in the relative coordinate, so a cell is the same size at every hue
  and a jitter within one cannot leave the range, as it could not before.
- `pointInBox` clamps the hue first, the bounds depending on it, and decides whether the lightness moved in
  the relative coordinate: the round trip through the absolute one need not land on the same float, and
  comparing absolutes would mark almost every push clamped and reject it.

Default 20 to 60, `STATE_VERSION` v3. In the hue-lightness charts the hatched bands now follow the cusp ridge
instead of running level.

## Chroma relative to the cusp

The chroma range stayed absolute when the lightness one moved, and cusp chroma varies as widely as cusp
lightness: 14.5 at teal against 32.2 at magenta, 2.22x. One absolute floor therefore asks a different
vividness of every hue. A floor of 20 leaves 43% of hues with nothing to draw from at all, so asking for
vivid colors deleted teal, cyan and the yellow-orange stretch from the circle instead of making them vivid.

The range is now a fraction of the hue's cusp chroma: 100 all the hue has, 0 neutral, linear between, exact
inverses to the float. A floor of 95 - the top twentieth of every hue's chroma - still fills all twelve
30-degree hue bins.

Relative to the cusp, not to the reach at the point's own lightness, which is what `data/identify.js` means
by relative chroma. The second makes every setting reachable at every lightness, but 90 to 100 then selects
the gamut's whole shell, near-black colors included. Below the cusp the two agree exactly - the lower hull
runs straight from black to the cusp, so reach is proportional to lightness and the ratio's hue spread is
1.00x at every relative lightness up to 50 - and they separate above it, reaching 1.83x at relative
lightness 90.

The same three places as the lightness coordinate needed handling, for the same reasons: the uniform draw,
the sparse-box grid, and `pointInBox`, which now decides whether the chroma moved in the relative coordinate
as it already did for lightness. `cuspChroma` is interpolated from the cusp table rather than solved per
call: `boxCells` asks 56250 times a generation and the analytic solve cost 110 ms of that, against 13 ms for
the interpolation, whose worst error against a fresh search is 0.20 chroma.

Chroma stays absolute on the hue-chroma chart's axis, as lightness does on the other, so the selected band
curves with each hue's peak rather than running level.

Both coordinates together are HSL's, rebuilt. HSL puts every fully saturated color at lightness 0.5 and
states saturation as a fraction of the most that lightness allows - and its S=1 locus, one channel at
maximum and one at minimum, is this cusp locus. The three anchors agree exactly: black, white, and the
saturated ridge at the midpoint. Everything between them differs, and that is where the value is. The
anchor here is a measured cusp instead of max/min arithmetic on gamma-encoded channels; the interpolation
runs in OKLab's lightness instead of encoded RGB; hue is OKLab's angle instead of a hexagonal one; and
chroma is a fraction of the cusp instead of the reach, which is HSL's answer and the fork rejected above.
None of it reaches the metric: HSL says where a color stands in its own gamut and nothing at all about how
far apart two colors look.

Both range controls went back to sliders with this. They had been number boxes because the value that mattered
was a different number at every hue - the absolute chroma or lightness that just clipped the brightest yellow -
and a slider could not be aimed at it. Relative to the cusp that value is the same number everywhere, so the
landmarks are round: 50 the cusp, 100 the hue's peak.

Default 20 to 100, `STATE_VERSION` v4: v3 strings no longer parse, their chroma fields having meant absolute
chroma. The benchmark boxes in `data/identify.js` are restated in the new coordinate, and scores from them
do not compare with runs before it.

## Gamut boundary by cubic roots

Anchoring the range on the cusp made the cusp's accuracy matter, and checking it turned up a defect under it.
`gamutChroma` bisected along the constant-lightness, constant-hue ray, which assumes the in-gamut chromas
form one span from zero. They do not. In linear sRGB the gamut is exactly a cube, six half-spaces; OKLab's
cube root bends a straight ray into a curve that can leave the cube and re-enter, and the rays graze its
corners. The round trip is exact to 1e-7, so this is geometry, not precision.

Measured against the cube's own colors: 44 of 1944 surface colors were called out of gamut at their own
lightness and hue. The worst is `#0000ff`, short by 4.76 chroma; blue's cusp read L 49.0 chroma 28.77 against
the vertex at L 45.2 chroma 31.32.

Two cheaper repairs were measured and rejected:

- **Scanning outward-in for the last crossing.** The re-entered span is 0.002 chroma wide or a single point -
  the ray is tangent to the corner - so no scan finds it. At 32 and 64 steps it costs 1.8x and 2.83x the
  `showsLch` calls of the bisection for nothing.
- **A looser `inGamut` tolerance.** At -1e-3 it recovers pure blue but moves every one of 5640 sampled cells,
  median 0.13 chroma and 25.9 at L 4, where the gamut is a sliver a fraction of a chroma wide.

Adopted: solve the boundary instead of sampling it. Along the ray each LMS term is linear in chroma and then
cubed, so every linear channel is a cubic in chroma and the sRGB box is six cubic inequalities. Their roots
cut the ray into spans wholly in or out, and the outermost span that is in gives the answer.

| | bisection | cubic roots |
|---|---|---|
| cube-surface colors unreachable at their own L and hue | 44 of 1944 | 0 of 5046 |
| cusp against the cube vertex, six corners | up to 3.8 L | within 0.02 L |
| 40k calls | 51.9 ms | 26.5 ms |
| cusp table build | 40 ms | 8 ms |

It is faster because six closed-form solves beat twenty `showsLch` evaluations. Two consequences worth
knowing: the solver returns the exact boundary, so it and `showsLch` disagree by up to `inGamut`'s tolerance
near black - at L 3 hue 260 the red channel crosses zero at chroma 1.2237 while `showsLch` accepts to 1.302 -
and chroma over lightness is no longer everywhere single-peaked, though the golden-section cusp search still
finds the maximum within 0.03 chroma at every hue.

## The hue-chroma chart

Hue across, chroma up, under the palette. Its third coordinate was a lightness slider reading absolute OKLCh
L, against range controls stated cusp-relative: one slider position then stood inside the range at some hues
and outside at others, and hatching the outside hues drew a wedge with vertical sides into the middle of the
chart - hues 258 to 312 at L 81, opening at the sRGB blue primary, whose cusp at 45.2 is the darkest on the
ridge. The dots compounded it, being placed by hue and chroma alone: at any one lightness most of them float
over ground the slice calls empty.

The slider is gone. Every column is drawn at `clamp(CUSP_ANCHOR, lMin, lMax)`: the cusp where the range
covers it, the range's nearer edge otherwise.

- The top edge is the most chroma the ranges allow at that hue, over the whole range rather than one slice of
  it. The lightnesses reaching a given chroma run in an interval around the cusp, so the union over a band is
  what its cusp-nearest point reaches alone; searching the band draws the same picture.
- Every generated color sits at or under the top edge, its own lightness being in the range. A circle above
  the silhouette is a generator fault; a triangle above it is a fixed color the ranges exclude.

The lightness bound is not hatched. It holds for every pixel at once, so it could only hatch all or nothing,
and when it fired it hid the hue and chroma hatching under it. Hatching is the hue and chroma ranges alone,
both of which vary across the chart.

Chroma over lightness is not single-peaked, as the cubic-root section notes: at hue 201 it rises 2.98 above
its running low near L 0. That never decides the pick - over every hue and six ranges the cusp-nearest
lightness came within 0.006 chroma of the best its band holds, two per cent of a pixel row.

## Smoothing the cusp table

Both relative coordinates divide by the cusp, so the cusp's shape is the shape of the controls. The locus
follows the edges of the sRGB cube and turns a corner at each of the six primaries and secondaries, where the
binding face changes; blue's corner is five times sharper than the next, and on the charts it read as a shear
rather than as compression.

Most of the visible tear was the table's own doing. `CUSP_CORNER_HUES` inserted an exact sample at each corner
hue so no interpolated segment spanned one. At blue that put a sample at 264.052 beside the regular one at
264.000, and the table fell from L 49.27 to 45.18 across those 0.052 degrees - 79 L per degree, against under
1.2 anywhere else. The locus itself is continuous; only its derivative turns.

Adopted: drop the corner samples, keep a uniform 1 degree grid, blur both columns around the circle with a
Gaussian of `CUSP_SMOOTHING` = 2 degrees. Second difference of cusp lightness at each corner:

| sigma | red 29 | yellow 110 | green 142 | cyan 195 | blue 264 | magenta 328 |
|---|---|---|---|---|---|---|
| none | 0.45 | 0.75 | 0.26 | 0.40 | 4.08 | 0.63 |
| 1.5 | 0.15 | 0.24 | 0.12 | 0.13 | 0.80 | 0.23 |
| 2 | 0.11 | 0.18 | 0.09 | 0.10 | 0.55 | 0.18 |
| 3 | 0.07 | 0.12 | 0.06 | 0.07 | 0.31 | 0.12 |

2 is the smallest sigma putting blue under yellow's 0.75, the sharpest corner the unsmoothed table already
had. Steepest cusp lightness slope over the whole circle falls from 79 to 1.97 per degree.

One blur over the whole circle needs no special case at the six hues: every 10 degree band it moves by more
than 0.15 lies within the blur radius of a corner, and the smooth stretches do not move at all. What it costs:

- 100 chroma sits up to 1.0 outside the gamut near blue, and up to 0.65 L off the true cusp at the other five
  corners. Callers already clamp to `gamutChroma` at the point's own lightness.
- `relativeL` and `absoluteL` stay exact inverses, both reading the same smoothed value; the round trip is
  1e-14 in both coordinates.
- `pureHue` calls `searchCuspLightness`, so the swatch it draws is still the true cusp color.

`cuspValue` lost its binary search along with the corner samples, a uniform grid indexing directly.
`STATE_VERSION` stays v4: the strings parse and mean the same, though a range near blue now selects a slightly
different band.

## Respacing the hue circle

OKLab's hue angle is not evenly spaced to the eye: on a strip of the most vivid color at each hue, red and blue
pass in a few degrees while green and cyan sprawl. The generator inherited that spacing twice, in the metric it
keeps colors apart by and in the uniform hue of its starting draws, so palettes under-delivered red and blue.

### Diagnosis

Measured first, before anything was changed. Hue marginals of generated colors, 250 seeds each at 7 and 10 colors
and 100 at 15, over a cusp-pinned box (relative C 14-32.5, the highest chroma floor that admits every hue, teal
peaking at 14.5; relative L 45-55) and a wider one (C 5-32.5, L 40-60), the shipped page against revision 06d52fe:

- Against its own metric's arc length the generator is even: the ratio of delivered to expected share is 1.00
  in nearly every 30-degree bin. Against the sRGB code walk it is the least even of every scale tried,
  coefficient of variation 0.53 at 7 colors against 0.30. The generator was not at fault; its metric was, and
  the disagreement is between the metric and the eye.
- In OKLab hue the shipped page gave cyan through blue (180 to 240) half to a third of a uniform share and green
  (120 to 150) 1.4 times it. 06d52fe was no better, and at 10 colors it had two near-empty bins at 30 and 150.

The sRGB code walk (unit steps along the cube's six saturated edges, 1530 codes, binned by OKLab hue) as a
candidate reference: monotone in OKLab hue (37 backward steps in 1530, the worst 0.0055 degrees at the blue fold),
so it is a density. Per 30-degree bin, in multiples of uniform: 1.23 0.96 0.47 0.70 2.65 0.82 0.45 0.42 1.74
0.78 0.91 0.88 from hue 0. Per 5 degrees it is spikes at the primaries with thin flanks: red 3.06 times at 25 to
30, green 7.29 at 140 to 145, blue 5.74 at 260 to 265, and under 1 on both sides of each. The codes crowd where
the varying channel sits near zero, a transfer-curve artifact, so the walk states nothing about how much room a
hue deserves. It is monotone hue with the right general shape and the wrong fine structure. On the same strips
CIELAB shows its blue-violet turn; OKLab's largest step along the sRGB locus is 4.57 at the blue vertex against
0.35 for the next, CIELAB's is 0.26.

Two dead ends on the way:

- `d(h) = 1 + alpha(h) (dR(h) - 1)`, a blend between OKLab's flat circle and the walk. No alpha turns a spike into
  a plateau, and blue's walk territory is the spike: the whole five degrees of it paint the same #0000ff. Dropped
  for a density stated directly per band of hue.
- A linear-light mix between two sRGB codes is not the even ramp it looks like it should be: the sRGB encode is
  concave, so the first quarter of the mix covers more perceptual ground than the other three. A plain lerp in
  sRGB codes is already close to perceptually even. No bug there; the pipeline was right.

### What each stage does to the hue marginal

Instrumented in the tool, 960 colors at 8 per palette, the density asked for against the draws, the starts and
the pushed result:

- The push is isotropic on a uniform start: 44 per cent of colors move, by 6.8 degrees of hue on average, and
  the mean signed shift is 0.088 degrees. Directions cancel across palettes. A start already satisfies the push's
  own threshold pair by pair, since `limitDistance` is the distance at which one swap chance equals
  `ERROR_LIMIT`; the push fires only because `errorAt` sums over all neighbours.
- `dartStart` is dart throwing, not farthest-point: it accepts the first draw that clears the limit. Ranking the
  draws on a warped metric changed nothing, since in a roomy box the first draw clears. Only the draw itself can
  carry a density. The weighted draw then delivers the asked density exactly.
- The dart filter erodes it, and not along hue: it favours hues with lightness and chroma room. Blue 1.41 asked,
  1.21 started; green 1.19 asked, 1.46 started. No hue correction reaches this, the rejection is in L and C.
- The push erodes a peaked start under an uncorrected metric, blue 1.30 to 1.00 with the spill into violet, and
  stops eroding once it measures in the corrected one, 1.21 to 1.29.

Under one candidate density, summed absolute deviation of the ratios over twelve bins: shipped 2.36, the metric
warped alone 1.94, metric and draw together 1.63. Both levers are one correction: uniform sampling in the
corrected metric is a draw weighted by the stretch in the old one.

### The correction

The position taken, held until evidence says otherwise: the uneven spacing is a fact about the metric, not a
sampling preference. The calibration leans the other way, the hue trough tried in the gain bought 8 per cent and
its bootstrap included zero, but that fit was over a handful of hues. So the correction is one table,
`HUE_DENSITY`, each hue's share of the circle at mean 1, applied in two places:

- `apart2` turns both points to their warped hue, the running integral of the table, before the ab chord.
  Push, scoring, restart ranking and the 3D halos all go through it, so they follow without changes of their own.
- `dartStart` draws with acceptance proportional to the table divided by the box's own hue marginal, the share
  of uniform draws each hue bin gets in the box, so the box's uneven room does not multiply in.

The table was authored by eye in `data/hue-density.html`: a strip of the most vivid color per hue under the
candidate density, next to OKLab's and the code walk's, with a factor per band of hue over the walk as the
controls (bands of 4 degrees around blue, 5 through red and lime green, 10 to 30 elsewhere) and a least-squares
fit from the resulting curve back to the page's band controls. The bands are flat and blurred; at sigma 4 a
4-degree band keeps 40 per cent of its own value and the fit has to oscillate between the clamps to undo the
blur, at sigma 2 it keeps 60 per cent and the fit settles near the band means. Sigma 2 is what the table uses.
Its presets are the table's definition; a retune is a new paste into `index.html` and `identify.js`, and
`identify.js` warns when the page it scores carries a different table.

Measured over the benchmark's default box, 960 colors at 6, 8 and 10 per palette: the hue marginal's deviation
from the table, summed over twelve 30-degree bins, fell from 4.45 to 1.87. The remainder is the dart's bias
above. Generation costs about the same, 44 ms against 42 per palette under Node; the box marginal is 18 ms per
box and cached.

Not done:

- Whether the palettes look even is the perceptual claim behind the belief, and only eyes can check it. The
  measurement toward it is `data/calibrate-hue-steps.html`: around anchors dealt on a grid in random order, the
  first swatch on each side that reads as a meaningfully different color, past mere detectability. That minimal
  meaningful difference varying with hue is the quantity itself, not a criterion to hold constant: a step that
  repeats across rounds is an effect, one that does not is noise. `data/fit_hue_steps.js` takes every trial as one sample
  whose criterion is a random factor on both its sides, each side one observation at the midpoint of its span, and
  turns them into a density two ways, equal steps as equal warped angle or as equal warped chord, against the
  table; the two sides of one trial, the same anchor across rounds, and each anchor's left side against its
  neighbour's right side over nearly the same hues, give the noise. The ridge sampled one
  chroma per hue, so the two readings differ only by the ridge's chroma profile and the data cannot separate them;
  the metric being a chord, the chord reading is the consistent one.

  Two rounds of 51 anchors over the ridge of most saturated colors, `data/ridge-2-steps-log.json` (both
  rounds in one log), repeat within a factor 1.3, and contradict the table:
  - Within a few degrees of a primary the codes move lightness and chroma and no hue, 24 codes around #001eff span
    0.05 degrees, so a step there is not a hue measurement. The fit reports each side's hue share and drops the low
    ones; 29 of 102 sides go.
  - Elsewhere the shape disagrees where the table follows the code walk. Lime through green (114 to 142) takes the
    longest steps on the circle, 8 to 14 degrees, and the table gives it 1.1 to 6.5 against the steps' 0.4 to 1.1;
    the red-magenta flank (14 to 27) is 2 to 4 times over; cyan, azure and pink are half. Orange through yellow and
    purple agree. One step is 2.6 table-warped degrees at #ff00b4 and 32 at #3cff00, a spread raw OKLab does not
    exceed.
  - The two methods answer different questions. The strip sets how much of the rainbow each family occupies, and
    green is a broad family; the steps set how far two colors must be apart to differ, and greens are alike. The
    metric's job is the second. The first can stay a draw density.

  The page now steps hue alone: anchors on a grid in degrees, each run at one OKLab lightness and chroma
  (lightness in the hue's own gamut, chroma a share of the gamut's reach; a side of the run ends where its hues
  leave the gamut).
  Its logs are version 2; the fit reads both. Three hue-only rounds at lightness 50 and chroma 50%,
  `data/hue-1-steps-log.json` and `data/hue-2-steps-log.json` (two rounds), 144 trials:
  - The chord reading holds: a side is nearly constant in OKLab chord over the circle (CV 0.25) and half as constant
    in degrees (0.43). The unwarped metric already predicts most of the steps; the table makes both worse (0.74, 0.68).
  - The rounds agree to within 0.15 per bin. Against the table, lime and pink are absent as features and blue is
    inverted: azure through blue (210 to 270) takes the longest chord steps on the circle, chord density about 0.7,
    where the table has 0.5 to 1.4; green (120 to 180) sits at 1.25. Elsewhere the chord density is 0.9 to 1.15.
  - Noise: right over left within a trial 0.21 rms log, 0.15 within an anchor across rounds, so part of the asymmetry
    repeats; hue 180 to 225 has the right side 1.2 to 1.6 times the left in every round, the slope B shows there.
    The criterion's spread across rounds is 0.15, its drift within a round under that.

  One round at chroma 70% and two at 80%, `data/hue-3-c70-steps-log.json`, `data/hue-4-c80-steps-log.json` and
  `data/hue-5-c80-steps-log.json`, test the chord law across chroma. At 70% the same anchors took 1.40 times the
  chroma and 0.72 times the degrees, a chord step of 0.96 times the 50% one. At 80% the chord step is 1.06 and 1.13
  times the first 50% round, 1.20 and 1.28 times the second, 1.16 for the means, and even over hue (per 30 degree
  bin 0.87 to 1.31). Rounds under one condition differ by 1.07 at 50% and 1.13 at 80%, a session spread of 0.07 rms
  log per round, so the 80% excess of 0.15 log is two sigma: a chroma effect of about the 0.3 power over 50 to 80%
  is likelier than an offset, but the 70% round fits neither. The chord law is kept: a 16% excess at the top end,
  where clipping removes a quarter of the sides, is too little to fit a chroma exponent for the hue term. In
  shape the two 80% rounds agree with each other to 0.13 rms log within an anchor, closer than the 50% rounds' 0.15,
  and with the shipped table to 0.09 mean |log ratio|; the density fitted from all five rounds differs from the
  shipped one by 0.02, no 30 degree bin by more than 0.03, so `HUE_DENSITY` stays as fitted from four. Clipped
  sides, 6 at 70% and 14 and 11 at 80%, record the run's reach as a bound on the step; the fit prints the bounds
  against its curve.

  The table's three spikes are the code walk leaking through the band factors. The walk stalls in hue at the
  primaries, 94 codes within a degree of blue and 97 of green, a density of 17 and 15 at mean 1; a factor of 0.47
  at blue and 0.84 at green halves a spike of that size, and the blur spreads the rest over ten degrees, so the
  table holds 3.3 at blue, 6.5 at green and 3.4 at red without any of them being drawn. B has none: 0.8 straight
  through blue, 1.2 at green. A multiplicative band factor cannot remove a base spike; the base has to be flat,
  or the spike has to be measured out.

  As strips of the most vivid color per hue, the six corners land at these degrees of the circle: table 29, 103,
  161, 223, 272, 346; B 29, 113, 153, 212, 265, 326; raw OKLab 29, 110, 142, 195, 264, 328. B sits between the
  table and raw OKLab, nearer raw: yellow to green 40 degrees against the table's 58 and raw's 32, magenta to red
  63 against 43, blue 7 degrees earlier than the table.

  B is now `HUE_DENSITY` in both roles, the metric's warp and the draw's acceptance; the authored table stays in
  the code as `HUE_DENSITY_AUTHORED`, read by nothing but the fit. Measured before the swap, 200 seeds at 7 and 10
  colors: the draw density moves the delivered hue share 15 to 30% of the way toward its own, since dartStart
  takes the clearest of many weighted draws; a B draw delivers the same as a uniform one; against B's share the
  shipped page was off by a CV of 0.57 and B in both roles sits at 0.17, the floor the box's own hue room sets.
  Per color name in a saturated box, the authored table made greens 28% and blue 16% of every palette while
  cyans and magentas got half their room; under B no family dominates, and reds are the thin one at 6%, the
  smallest hue family by room.
  Refit on the respaced circle (`--warped` in `fit.js` and `fit_hue.js`, the hue distance of every pair taken
  after the warp): the weights, noise width and thresholds come back unchanged, the identification log too small
  to tell the circles apart (0.5 units). On the five probe logs, 443 pairs, the raw circle wants a hue trough of
  amplitude 0.10 at 270 degrees worth 5.6 units; on the respaced circle the trough is exactly zero and the
  blue-over-red gain interval moves from 0.84 to 1.00 onto 0.97 to 1.10. B, fitted on the step criterion, predicts
  the recall verdicts' blue effect with no parameter spent. The lightness exponent moves 0.40 to 0.50 (profile 0.40
  to 0.55), the chroma exponent -0.10 to -0.15, the lapse 0.05 to 0.005. Adopted: exponent 0.5.
  Three checks on the respaced page, none of which changed it:
  - The delivered hue shares follow the metric's arc length along the wall, the lightness and chroma of the fold
    included, not the hue table alone. In a saturated box (L 40-60, C 60-100%, 200 seeds at 7, 10 and 14 colors)
    the rms deviation of the twelve bins from the ridge's metric arc share is 0.04, against 0.26 for a uniform
    share and 0.32 for plain OKLab arc length; blue included, 1.11 delivered against 1.14 of arc. (Ridge from the
    cube's edges; the cusp-table ridge first used here put a residual at blue that was its own defect, see below.)
    `hue-marginals.js` judges against the table's angle share, and the CV of 0.21 it reports there is the wall's
    shape at the corners, not a draw or push effect. A hue reading taken against a uniform or a table share
    overstates the pull toward the corners by that difference; the diagnosis's finding, even against its own
    arc length, still holds.
  - Distances without the gamut's corners predict the verdicts worse. Ordered probit as in `fit.js`, each
    distance with its own threshold grid, in log-likelihood units under the shipped metric, identification log
    (1260 pairs) then probe logs (6300): sRGB Euclidean 65 and 104, linear RGB Euclidean 130 and 359, an opponent
    luma/R-Y/B-Y form in sRGB 11 and 67, the same on linear RGB under a cube root 7 and 68 with three parameters
    spent. A cylinder of relative lightness and relative chroma at one radius over the respaced hue, weights and
    radius free, is 40 to 48 and 225 under; on pairs within relative lightness 40 to 60 it is 19 to 25 under on
    1191 probe pairs, and 6 to 14 under on the 72 below 25. The hue warp is not where it loses, A against no warp
    moves it 0 to 8 units and never up; the radius is: a step in relative chroma is an absolute chroma of 0.06 at
    cyan and 0.13 at magenta, and the cylinder calls them equal.
  - Along the ridge the OKLab arc per degree of hue runs from 0.24 at hue 79 to 5.4 at the blue vertex,
    mean 0.60. The strips in `hue-density.html` are spaced by degree, so equal width on them is not equal distance,
    nine times off at blue; the reference the tool needs is the ridge at equal arc length, plain OKLab or the metric's.
  Drawing the ridge from the cusp table is wrong across a vertex. The table samples the corner hue between two grid
  hues, and a segment from the grid sample at 264.00 (L 49.3) to the corner at 264.05 (L 45.2) interpolates lightness;
  chroma read at that lightness and hue lies inside the gamut (blue channel 0.79), and the last step onto the corner
  is 4.7 OKLab units at once. On an equal-arc strip that step is 8 per cent of the width in one colour followed by an
  edge: a jump the ridge does not have. Every ridge figure has to walk the cube's edges code by code instead; the
  numbers above are from the edges. The generator is unaffected: it reads chroma from the exact boundary, and the
  page's cusp table is smoothed without corner samples.
  The blue vertex on the exact edges, zoomed to hue 250-280 with the ridge round's picks marked: an intensity ramp on
  the cyan side, 4.4 L and 3 chroma within 0.15 degrees of hue (#0000ff to #003cff, the hue turning back at #0028ff),
  and a hue turn on the magenta side, the same 5.2 OKLab units over 8.8 degrees with lightness up 1.9. A degree bar
  collapses the ramp into one pixel; an equal-arc bar spends 9 per cent of the region on it and shows no jump, only a
  darkening. The ridge round's picks from #0000ff sit at 0.9 to 1.5 OKLab on the cyan side (a shade step of about one
  L unit) and 2.2 to 2.4 on the magenta side (a hue step of about 4 degrees); under the shipped metric 0.4 to 0.6
  against 1.6 to 1.7. Over all 204 ridge sides the meaningful step is 1.73 OKLab in the fold (250-280) against 1.86
  for the circle and 2.4 to 2.6 through violet and magenta; the shipped weights make the fold step 0.94 against 1.71.
  Whether a lightness-only step and a hue step were judged by one criterion there is not known: the lightness and
  chroma weights have never been measured on a step criterion, only on the recall verdicts. Decision: the weights
  stay on the recall verdicts, and the metric's shorter fold is taken as the measured response; no lightness or
  chroma step round is planned.
  Path length along the ridge and straight-line distance between its points differ where the ridge bends, and the
  fold is a bend: widths fitted by least squares to the straight-line distances of every pair within 12 deltaE,
  order kept, give hue 262-267 4.6% of the strip against 5.9% at path length (metric 2.4% against 3.2%), and halve
  the residual; the rest is what a bent curve cannot give a straight bar. A scratch page, not kept.
  The hue bar and its two sliders now run in `RIDGE_WARP`: the metric's length along the cube's edges per degree of
  OKLab hue, a running integral normalized to 360, built at load in 1 ms. The config, the labels and the state string
  stay in degrees. Equal width on the bar is equal metric distance along the ridge; the blue vertex has 3.2% of the
  bar where a degree bar gave it one pixel. Every hue axis on the page follows it, the range plane, the two palette
  charts and the name chips, so the plane's hue edges stay under the bar's overlays and the slider handles: a chart
  cannot be proportional to distance in more than one surface, and a chroma-weighted hue warp without the vertex
  excursions differs from the ridge by under 6% of the width, invisibly on the charts. The palette chart's full build
  at 576 by 118 is 175 ms, 38 ms with its gamut table cached; the per-column unwarp is nothing beside the bisections.
  The gamut table is now one, at the palette chart's size, and the range plane reads it by bilinear interpolation:
  one build per size instead of two, the plane's field 7 ms. Against its own bisection the plane's reach is off by
  0.05 chroma on average and 4.7 at the blue vertex column, a fold narrower than the column.
  Open: family coverage as its own goal, by a start stratified over color names rather than a density over degrees. Not planned: respacing
  the strips of `hue-density.html`, a tool whose table is retired; if it is ever used again, its strips should be
  built from `RIDGE_WARP` along the cube's edges.

## Step weights per hue

The lightness and chroma weights, 0.35 and 0.6, are one number each over the circle and come from the recall
verdicts; the hue term alone is measured per hue, on the step criterion. Whether a lightness or chroma step counts
the same at every hue is untested. `data/calibrate-hue-steps.html` now steps any of the three coordinates: a round
deals every direction on at every anchor, shuffled together, so the three are judged under one session criterion.
A lightness run moves L at the anchor's chroma and hue, a chroma run moves C and stops at grey; the units per
swatch are 1 degree of hue and 0.5 of lightness or chroma, with the four key sizes per direction. Records carry
`direction`; older records without it are hue steps, and `fit_hue_steps.js` reads only those.
`data/fit_step_weights.js` takes, per anchor, the step in each direction in OKLab units, the hue step in the
shipped warp, and gives W_L and W_C per anchor as the hue step over the lightness or chroma step, then per 30
degree bin with the spread over anchors and the left-right noise per direction. At the cusp anchor the light side
of a lightness run has little room where the cusp is light: at 50% chroma 2.5 to 7.5 L from hue 90 to 210 against
13 to 24 elsewhere, at 70% chroma 1 to 4.5; the dark side has 23 to 46 everywhere. A lightness threshold at the
shipped weight is about 10 L, so the light side clips through yellow, green and cyan and the dark side carries
the step there. The round is planned at 50% chroma, where the hue rounds have two sessions to compare against.

## A preference density

The judge's reading after the member and pairwise rounds: distinctness and preference are two metrics. The first
is a constraint, a floor on the closest pair, measured to within session noise three ways and found uniform; the
second is an objective over what the floor leaves free, and it collapses into the first only in a box too tight to
leave anything free, which the tight-box pairwise round was. The member round is a measurement of preference's
bottom, the colors thrown out, and `data/fit_preference.js` fits it: a logistic on absolute chroma and hue with two
harmonics and a chroma by hue term, 164 log-likelihood units on eight parameters over 960 colors, lightness earning
0.4 and dropped; the model reproduces the bad rate per hue bin and chroma third within 0.05. Its complement is the
`PREFERENCE` density in index.html, the chance a color is wanted for itself, chroma clamped to the round's range.
The draw is weighted by it, and a color under a floor of 0.5, more likely thrown out than kept, is outside the box
for the draw and the pushes alike: the pushes spread colors to the box's edges, so a draw weight alone left the
dirty region filled (dirty names 52 to 34 of 320 over 40 seeds in the default box) where the floor empties it (52
to 25, colors under chroma 12 from 108 to 61, the closest-pair floor unchanged at 0.98, 42 against 47 ms a
palette). The floor is a generator setting, `preference` in the config, on by default and off for the plain
condition. The pairwise page now deals `--conditions preference`: shipped against plain in the default box, 60
seeds at 7 and 10 colors, the round that tests whether the preferred draw makes preferred palettes. Not yet drawn
on the charts: the region under the floor is not hatched.

## Avoided colors

Excluding names is a family-level exclusion and the preference density a fitted population-level one; the
judge's third wish is a point-level one: this color and its kin, less of them. index.html takes a list of
avoided colors beside the fixed ones, from a textarea or a right-click on a palette color, carried in the state
string. An avoided color is not a gate on the box: a zone wide enough to mean kin covers much of a box, and a
start that lands inside a gate cannot push its way out, which is what a first gated version did at one color in
eight. It is a repulsive point instead, a member the palette does not show: the start and the pushes read its
distance divided by AVOID_REACH, 1.5, so colors settle that many limits away, and the floor and the status
exclude it. Over 20 default-box seeds with two avoided colors each, no color came within 16.9 of one against a
limit of 12.3 and a target of 18.5, the palette floor unchanged, generation 157 ms against 45: qualifying draws
are rarer and restarts more. The reach is unmeasured; the same-y ratio, if the cell round ever runs, would set it.

## Cell capacity rounds

The judge's account after the member round: some colors are distinguishable and still same-y, and fewer of them
are wanted. That is a third criterion above confusable and distinguishable, and no term carries it past the naming
fade. `data/calibrate-cells.html` measures it beside the second: the space is cut into cells, 20 hue sectors even
in the shipped hue warp (`data/make_cell_deal.js` writes the bounds into the page) by three cusp-relative lightness
thirds by three chroma thirds of the gamut's reach at the color's lightness and hue. A trial is a cell and a
direction: a row across the cell along that coordinate, even in it, the other two at the cell's middle. The keys
change the count and two stops are marked, the largest count at which every neighbour is distinct and the largest
before any two look same-y, a stop at one color meaning the cell holds one. The record holds each stop's row and the
row one larger, the one rejected, so the threshold is bracketed rather than read at the integer count, which at
two or three colors would overstate it by half. `data/fit_cells.js` gives per cell and direction the step at each
stop, the midpoint of the bracket's closest pairs under the shipped metric, and reads two things: the distinct
step in metric units by direction, lightness third, chroma third and sector, constant where the metric is right and
a correction factor where it is not; and the same-y over distinct ratio by the same factors with the spread left
after each factor's means are removed, which says whether same-y is a criterion scale, a family effect or a
per-direction one. A synthetic judge with a same-y ratio of 2.4 in the light third and 1.6 elsewhere was read back
as 2.35 against 1.75 and 1.62, and the lightness factor removed the most spread. Many cells are under one step:
in the synthetic run at a 3-unit threshold 205 of 540 stops sat at one color, most in the dull and dark thirds,
where the cell is a sliver; those trials are quick and their bound still counts. 540 trials at 20 sectors, judged
over several sittings with Download and Load between.

## Palette spread rounds

Every instrument so far grades pairs: the verdict logs, the step rounds, the metric fitted to them, the generator
spacing by the smallest pair distance. The complaint the project keeps returning to is about whole palettes,
whether the colors are evenly spread, and nothing measured that. `data/calibrate-palettes.html` does, by pairwise
choice, the most stable judgment a session gives: two palettes, A and B, the same seed and count under two hue
conditions, each as the page's square of squares in hue order, random order and random sides. The question is spread alone.
The answers are A is better, B is better, both are OK, neither is OK; the last two are ties, the tie being the
judgment, with an OK flag on both palettes that the fit reads as a coarse absolute score, the pairwise strengths
being the measurement since a threshold drifts within a session and a choice between two things on screen does
not. Before answering, two optional marks: two swatches that crowd, a swatch with a color missing after it.

`data/make_palette_pairs.js` deals the palettes into the page between its deal markers, since a page opened from
disk can fetch nothing: 20 seeds at 7 and 10 colors in the saturated box (L 40-60, C 60-100%), three conditions,
each a density in the generator's two roles: shipped, `HUE_DENSITY` in both; angle, the step rounds' A in both;
uniform, `HUE_DENSITY` in the metric and a uniform draw. Every pair of conditions per seed and count, 120 pairs.
Each record carries both palettes, so `data/fit_palettes.js` reads the log alone: a Bradley-Terry fit with ties
(Davidson) for a strength per condition with a bootstrap interval; a one-parameter logistic per palette feature
over the choices, the feature's difference the only term, whose log-likelihood gain says what the eye counted:
the unevenness and the largest gap of the hue gaps in degrees, in the metric's hue warp and in the ridge
coordinate, the nearest pair's metric distance, the number of distinct names; and the marked seams' gap against
the other seams' in each coordinate. On a synthetic log whose judge preferred the lower gap CV in the hue warp,
the fit put that feature first by 6 log-likelihood units over degrees and 17 over the ridge.

A round is one sitting, 50 pairs by default; the next Start takes the pairs not yet judged in the loaded log.

The first deal, `data/palette-pairs-log.json`, 120 pairs in one sitting, 3.5 s a verdict: 89 choices, 24 both OK,
7 neither. No condition is preferred: angle 0.87 and uniform 1.00 against shipped at 1, the 90% intervals 0.5 to
1.6; at 7 colors uniform is at 0.5 and at 10 at 1.9, forty pairs each, noise. No feature predicts the choices: the
hue gap evenness and the largest gap in all three coordinates, the nearest pair, the names, and a further sweep
(lightness and chroma spread, hue family shares, empty sectors, the mean nearest-neighbour distance) all gain
under 2 log-likelihood units over 89 choices, the sign test at best 57 of 89 for a larger mean nearest-neighbour
distance in the metric, one of seventeen tries. The choices are consistent, 2 cyclic triads of 18 where chance
gives 4.5, so the eye ranks something, but not the hue spread the conditions vary, and not the tested features.
The instrument has a side bias: B was chosen 56 times of 89. The random flip keeps it out of the strengths, but a
share of the choices is position, not palette. No marks were made.

The judge's account of the sitting: both palettes often had good members and bad members, and the choice was
between two mixed bags. The verdict unit was wrong: the judgment being made was per color. `data/calibrate-members.html`
asks that directly: one palette at a time, click the members to throw out, Done. `data/make_member_deal.js` deals
120 palettes of 8 from the page in its default box (L 20-60, C 20-100%), every second one keeping one color of the
palette before it as a fixed color, so 60 colors are judged in two companies. `data/fit_members.js` reads the log
for the bad rate by hue bin, lightness and chroma third, and name; a logistic per color feature (lightness, chroma,
the nearest member's metric distance, members with the same name) and the hue bins as a twelve-rate model, on one
log-likelihood scale; and the shared colors: how often the verdict repeats against independence, and among the
disagreements whether the bad verdict fell in the company with the closer nearest member. On a synthetic log with
bad planted at hue 80-140 the hue model gained 43 units where the features gained under 5. The nearest member's
distance has little variance in generated palettes, the generator spacing every color at about its limit, so
company can show only through the shared colors.

The first round, `data/palette-members-log.json`, 120 palettes in one sitting at 3.6 s each: 173 of 960 colors
marked bad, 23 palettes clean. The verdict mostly follows the color: a shared color's verdict repeats 0.83 of the
time against 0.70 under independence, kappa 0.44; company moves it in one case of six, the 10 disagreements
splitting 6 to 4 on the closer neighbour. The judge's account: company counts, but some colors no unthemed
company rescues, and a themed palette, built around them by design, was not on offer here. The bad colors are
low chroma at warm hues. Chroma alone gains 79 log-likelihood units on one parameter, the twelve hue bins
88 on eleven; the bad rate is 0.37 in the lowest chroma third, 0.14 in the middle, 0.03 in the top, and hue 30
to 120 holds 108 of the 173 marks. By name: brown 32 of 37, tan 25 of 33, olive 23 of 38, beige and off white 4
of 6, mustard 7 of 13; those names hold 104 of the marks. The judge's own word for it is dirty colors. Among the
other names the rate is 0.085 and still falls with chroma, 0.17 to 0.09 to 0.03 over the thirds, warm hues at
0.16 against cool at 0.07: purple, orange, pink and maroon at chroma 8 to 16 take most of the rest. Lightness
does nothing, 0.7 units. The generator's default box, chroma from 20%, draws these colors at a fifth of its
output; the page's name exclusion removes the named ones, a chroma floor around 17 absolute would remove the rest
at the warm hues.
The desktop app's pane opens a page as a data: URL, where storage is disabled: a round there survives only by
Download. A file:// tab in a browser keeps the log between visits.

## Files

- `index.html`: step 18 with the calibrated constants, the hue-lightness and hue-chroma charts, the plane
  hue scrub and the empty-box handling, the analytic gamut boundary and the cusp-relative lightness range.
  The shipped page.
- `data/past-experiments/`: a working page per step kept, each titled by its step. They run standalone, and
  their scores were measured on the metric of their own day: every page below step 18 predates both the OKLCh
  box and the calibration, so none of them can be compared with `index.html` or with each other across that
  line. What they are good for is the mechanism, in working code, if a step is ever revisited.
  - `experimental-gradient.html`: step 2, the soft-max descent. The score ceiling.
  - `experimental-gradient-restricted-push.html`: step 4, dart start with a straight push.
  - `push-with-angle-randomization.html`: step 6, the cone push under both angle sliders.
  - `experimental-wholeset-start.html`: step 9, whole-set start.
  - `experimental-error-filter.html`: step 10, own-error filter with the gamut margin.
  - `experimental-error-trigger.html`: step 14, error trigger with the wall margin.
  - `experimental-clamp-refusal.html`: step 15, exact clamp refusal, the copy that became `index.html`.
  - `experimental-oklch.html`: step 18, the OKLCh box before the calibration. The line the scores above
    stop crossing.
- `data/identify.js`, `data/fit.js`, `data/calibrate.html`: the metric and its calibration; see `data/README.md`.
- `data/calibration-log.json`: the verdicts the constants are fitted to.
- `data/calibrate-chroma.html`, `data/calibrate-hue.html`, `data/calibrate-cusp.html`, `data/fit_hue.js`,
  `data/fit_chroma.js`: the position-term rounds; their logs are `data/light-calibration-log.json`,
  `data/chroma-log.json`, `data/hue-log.json`, `data/cusp-log.json`, `data/cusp-log-new.json`.
- `data/calibrate-names.html`, `data/fit_names.js`, `data/naming-verdicts-16px.json`: the naming round.
- `data/hue-marginals.js`: the hue and name shares generated palettes deliver, per condition of metric and draw density.
- `data/hue-density.html`: the hue respacing tool; its presets define `HUE_DENSITY_AUTHORED`. A copy of the page from
  before the respacing with the tool on top, so its generator warps once.
- `data/calibrate-hue-steps.html`, `data/fit_hue_steps.js`, `data/fit_step_weights.js`, `data/ridge-2-steps-log.json`, `data/hue-1-steps-log.json`, `data/hue-2-steps-log.json`, `data/hue-3-c70-steps-log.json`, `data/hue-4-c80-steps-log.json`, `data/hue-5-c80-steps-log.json`:
  the hue step rounds, a measured density against the table. The ridge log is version 1 and holds both ridge rounds; the hue logs are version 2, three rounds at chroma 50%, one at 70%, two at 80%.
- `data/calibrate-palettes.html`, `data/make_palette_pairs.js`, `data/fit_palettes.js`, `data/palette-pairs-log.json`: the palette spread rounds, pairwise choice between whole palettes dealt under two hue conditions; the deal is written into the page.
- `data/calibrate-members.html`, `data/make_member_deal.js`, `data/fit_members.js`, `data/palette-members-log.json`: the palette member rounds, the bad members of one palette at a time, some colors dealt into two palettes; the deal is written into the page.
- `data/fit_preference.js`: the draw's preference density from a member log, the PREFERENCE constant in index.html.
- `data/calibrate-cells.html`, `data/make_cell_deal.js`, `data/fit_cells.js`: the cell capacity rounds, how many distinct and how many not same-y colors a cell of the space holds along each coordinate; the sectors are written into the page.
