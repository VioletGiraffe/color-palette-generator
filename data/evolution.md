# Generation evolution

What was tried for the generator in `experimental.html`, in order, with the numbers each step produced.
`index.html` and its name-based generator are described in `README.md`; this file covers the rework that
replaced names with a recall model, and the metric built to judge it. Paths are relative to the repo root.

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
| 6. angle band | forbid directions within a minimum angle of the axis; sliders for both angles | 89.1 | free up to 40 deg, costs from 60 (88.7), 80 deg gives 86.8 |
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
| 18. OKLCh box | the HSL ranges replaced by OKLab lightness, absolute chroma (0 to 33) and OKLCh hue; uniform draws by rejection, gamut mapping by chroma reduction, planes and 3D faces linear in OKLCh | 90.5 (new boxes) | not comparable with the rows above: the boxes changed shape; see the OKLCh baseline below |

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
11. **Push step and stall count**: 0.5 / 1 / 2 dE and 10 / 25 / 60 rejections all within 0.3.
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
- Re-measuring the steps at the calibrated constants.

## Calibration

`calibrate.html` shows one palette at a time, scattered at the swatch size on a light or dark ground, and
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
at the adopted constants (floor / worst seed): default box 6, 8, 10 colors 98.1 / 98.0, 97.9 / 96.8,
96.6 / 95.4; narrow box 98.1 / 97.7, 96.0 / 95.1, 92.7 / 91.4. The box binds from 8 colors in the narrow
box and at 10 in the default one.

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

Default 20 to 60, `STATE_VERSION` v3. In the charts the hatched bands now follow the cusp ridge instead of
running level.

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

## Files

- `index.html`: step 18 with the calibrated constants, the skin chart, the plane hue scrub and the empty-box
  handling, the analytic gamut boundary and the cusp-relative lightness range. The shipped page.
- `experimental-gradient.html`: step 2, the soft-max descent. The score ceiling.
- `experimental-gradient-restricted-push.html`: step 4, dart start with a straight push.
- `experimental-wholeset-start.html`: step 9, whole-set start.
- `experimental-error-filter.html`: step 10, own-error filter with the gamut margin.
- `experimental-error-trigger.html`: step 14, error trigger with the wall margin.
- `experimental-clamp-refusal.html`: step 15, exact clamp refusal, the copy that became `index.html`.
- `data/identify.js`, `data/fit.js`, `calibrate.html`: the metric and its calibration; see `data/README.md`.
- `data/calibration-verdicts-16px.json`: the verdicts the constants are fitted to.
