# The page, inside

The overview for working on `index.html`: what is where, the coordinates, the metric, the generator's pipeline
and the state string. The root `README.md` is the user's; `scripts.md` here covers every script, log and fit;
`evolution.md` is the design history, with the numbers behind every constant. Read `evolution.md` before changing
the generator or the metric: most of the obvious alternatives have been measured there already.

## What is where

- `index.html` is the whole app, one file, no build. Its main script is in sections, each opened by a
  `// ---------- name ----------` line, in this order: color math (sRGB, OKLab, OKLCh, the gamut's reach
  `gamutChroma`, the cusp search), lightness relative to the cusp (the cusp table, `absoluteL`, `relativeL`,
  `absoluteC`, `relativeC`), color naming (the embedded xkcd cell grid and `cellOf`), generation (the metric and
  the generator, up to `generate`), ui, name controls, state string, cross-view highlight, pinned palettes. A
  separate module script draws the 3D gamut with three.js from a CDN through an import map; the page runs without it.
- The tables in the page (`CELL_GRID_CHARS`, `CELL_OVERLAP_B64`, `HUE_DENSITY`, `PREFERENCE`, the cusp table)
  are pasted in from the scripts in this directory; nothing here is loaded at runtime.
- `identify.js` holds the metric a second time, for scoring and fitting in Node, and loads any version of the
  page's generator (`loadPage`, see `scripts.md`). A constant or a table changed in the page is changed there too.
- `calibrate-*.html` are the calibration pages, `make_*_deal.js` the dealers that write a deal into a page,
  `fit_*.js` the fits, `*-log.json` the judged logs. `past-experiments/` keeps one working page per step of
  `evolution.md`. `scripts.md` lists all of them.
- `tmp/` at the project root is gitignored scratch for experiment scripts and pages; `exp.html` at the root is
  a gitignored live scratch copy of the page. `demo.html` is untracked and not part of the project.

## Coordinates

Five conventions coexist. Which one a number is in is the first thing to check.

| where | lightness | chroma | hue |
|---|---|---|---|
| range controls, state string, cells, avoid cones | relative to the cusp: 50 is the hue's cusp lightness, 0 black, 100 white, linear on each side (`absoluteL`, `relativeL`, `CUSP_ANCHOR`); the lightness range alone is absolute OKLab L with the `absolute` box ticked (`cfg.lAbsolute`; `rangeL`, `withinLightness` take the mode) | share of the cusp's chroma: 100 is `cuspChroma(h)`, whatever the color's lightness (`absoluteC`, `relativeC`); the chroma range alone is a share of `CHROMA_MAX`, the same chroma at every hue, with its `absolute` box ticked (`cfg.cAbsolute`; `rangeC` takes the mode); a share the lightness cannot reach is cut to the gamut (`rawDraw`, `insideBox`); the saturation floor `sMin` is absolute chroma over absolute lightness, the same at every hue (`lowestC`) | degrees of OKLab hue; the hue sliders alone run in the ridge coordinate (`ridgeWarp`, `ridgeUnwarp`) |
| a color's `lch` | absolute OKLab L, 0 to 100 | absolute, 0 to about 32 | degrees |
| metric positions (`positionsOf`, `apart2`), every distance and deltaE | OKLab times 100 | | |
| a color's `lab` and `rgb` | OKLab and sRGB in 0 to 1 | | |
| `make_boundary_deal.js` | cusp-relative as above | share of the reach at the color's own lightness (`gamutChroma`), not of the cusp's | degrees |

The cusp of a hue is the lightness at which sRGB reaches the hue's highest chroma (`cuspLightness`,
`cuspChroma`, from a smoothed table). The hue circle is warped twice over: the metric's warps, `HUE_LEVELS`, the running integrals of a hue
density per lightness level (`HUE_DENSITY_AT_30`, `_58`, `_85`), mixed by lightness (`hueLevelAt`, `warpedHue`);
`RIDGE`, the metric's length along the sRGB cube's saturated edges code by code, is the hue control's only: the hue bar paints the edges' own colors by it. `HUE_DENSITY`,
the one table over every lightness, is not in the metric and not in use in the page; `identify.js` still exports it for
the archived generator and the scripts.

## The metric

`apart2(p, q)` is the squared distance between two metric positions, in deltaE:

- the lightness difference times the lightness weight at the pair's hue, `HUE_WEIGHT_L` read by `weightAt` at the hue of
  the two colors' summed ab (a grey defers to its partner), times a share that is `SAME_HUE_LIGHTNESS` (0.31) at one
  hue and returns to one as the hue term below grows, half of the way at `SAME_HUE_SPAN` (17.2): a lightness
  difference counts more when the hue differs too;
- the radial chroma difference, less `SHADE_DISCOUNT` (0.24) of the change a lightness change at the pair's saturation
  (chroma over lightness) brings, times the chroma weight there, `HUE_WEIGHT_C`: a shade of a color reads close to it.
  Over hue, blue through magenta weighs lightness up to a sixth above its mean and chroma up to 45% below, yellow-green
  weighs chroma a third above its mean and cyan up to 60% above;
- the tangential part, the ab chord after both hues move to their warped angle at the pair's mean lightness, the
  mix of the two levels around it, less the radial part, times
  `hueScaleAt` of the pair's mean chroma, `(C / CHROMA_REFERENCE) ^ (CHROMA_POWER - 1)`, so a hue turn grows with
  chroma at the 0.75 power;
- the sum times the square of `lightnessGain` of the pair's mean lightness, one at `LIGHTNESS_REFERENCE` (68): the ratio
  to it at `LIGHTNESS_EXPONENT_DARK` (0.156) toward black (floored at 20), where the gain rises, and at
  `LIGHTNESS_EXPONENT_LIGHT` (-0.341) toward white, where it falls.

The noise width `SIGMA` (3.14) is fixed; a pair at distance `d` swaps with `swapChance(d, SIGMA)`, half the
complementary error function of `d / (2 SIGMA)` in standard units, falling to 2% at `FINE_DISTANCE` (12.9), the median
of the strict pair rounds' "fine" cuts (21 to 29), the recall calibration (`calibrate.html`, `fit.js`) having set the
earliest one. `FINE_DISTANCE` is the Min distance control's default and a reroll's exclusion zone. The
level densities, the weight tables, the shape terms and the gain's exponents are one fit to the strict pair rounds, 21 on,
under the preference question (`calibrate-boundaries.html`, `fit_hue_density.js`), the chroma power from the earlier rounds; the sources
and numbers are in `scripts.md` and `evolution.md`. `W_L` and `W_C` in `identify.js` are one weight per axis for the
recall-era scoring and the older fit scripts: `W_L` is a lightness step's at one hue, the table's mean times the same-hue share.
The metric measures how far apart two colors read as members of one palette. It carries no term for a color on
its own.

## The generator

A palette is `count` colors that are, in this order of priority: distinct, every pair near the minimum spacing apart
on `apart2` (the Min distance control, `minApart`) or over it, as far as the box and the relaxation's reach allow; spread evenly over the hue
families (`FAMILY_STARTS`); a sample of one stated density over the
usable part of the box; different for every seed. `identification` reports `worstIdentified`, the worst color's chance of being identified,
and `closestApart`, the closest pair's distance; pairs of two fixed colors are skipped.

The density carries every preference about where colors sit:

- `metricVolume(L, C, h)`: the metric's volume per OKLab volume, in closed form, the product of the metric's scale on
  each axis: `weightL(h) * SAME_HUE_LIGHTNESS * weightC(h) * density(h, L) * hueScaleAt(C) * lightnessGain(L)^3`, the
  density the level tables mixed at `L`.
- `vividness(C, h)`: the chroma as a share of the hue's cusp chroma, floored at `VIVIDNESS_FLOOR`: a dark or a pale
  color on the gamut's surface is not vivid. It enters the density to the power of three times the config's
  `vividControl`, the Vividness control (`VIVIDNESS_DEFAULT` without one).
- `HUE_BOOST_RANGES`: hue ranges with a boost each, exact at any hue (`boostAt`), plus one offset for every hue
  (`roomOffset`) so the box's total density is kept, floored at zero. Set by eye with `tune-hue-boost.html`
  (`fit_hue_boost.js` fits one range per hue family toward even counts). It moves where colors sit, not how close they
  read.
- The density is the volume times those two factors, on usable points (`insideBox`, `usableLch`: inside the ranges and sRGB, a
  name in use, at or above the preference floor `PREFERENCE_FLOOR` of `preferenceOf`, outside every avoided color's
  cone, `inAvoidCone`), zero elsewhere. The preferences act only through how often the pool draws a color: spacing is on
  `apart2` alone.

`generate` makes `THROWS` throws, keeps the one with the most even family counts (`unevenness`, the sum of the squared
counts; among equals the widest closest pair) and relaxes it:

1. **The pool** (`poolFor`, one per box and seed, cached): raw draws (`rawDraw`) cover the box without rejection by the gamut,
   hue evenly over the range, lightness evenly over the hue's interval, chroma by its square over the interval the
   ranges and the gamut leave at that lightness; a draw's weight is the density times `coverVolume`, the OKLab volume it
   stands for, which undoes the uneven raw cover. `POOL_SIZE` points are kept by rejection against the density's peak
   over a survey of `RAW_SURVEY` usable draws. Where a range has no thickness, a lightness of one value or a chroma
   range beyond the gamut, the draw sits on the gamut's surface in a shell `SHELL` thick.
2. **The throw** (`throwAt`, `spacedThrow`): the pool in a seeded random order; a point is picked when its distance on
   the metric to every fixed color and every color picked before it is at least the minimum spacing, or where the box cannot
   pick `count` so, the widest spacing it can, by bisection to `THROW_PRECISION`. A random sequential sample of the density;
   in a box full at the spacing, its family mix follows the box's shape more than the density (`evolution.md`, Hue families).
3. **The relaxation** (`relax`), only while some pair is under the minimum spacing: the colors with such a pair, closest first,
   each try up to `PROPOSALS` positions a step away on the metric in a random direction; an unusable proposal is dropped, nothing is
   clamped, and so is one out of the color's hue family or past `RELAX_REACH` from where the color started: the relaxation keeps
   the throw's family counts and its sample of the density, and gives up the minimum spacing where that takes a longer move.
   A proposal is kept when it widens the color's closest pair. A sweep with nothing kept halves the step, from
   `STEP_START`; the relaxation ends when no pair is under the minimum spacing, the step is under `STEP_MIN` or `SWEEPS_MAX`
   sweeps are spent. The state with the widest closest pair is kept.

A reroll (`reroll`, for each slot in the config's `rerolls`, replayed after the throws on the seeds after theirs): the
slot's color and its `REROLL_VICINITY` nearest generated colors are thrown again among the rest, from the pool less the
points within `FINE_DISTANCE` of the rejected color at any spacing, then relaxed, the reach counted from where the reroll
found or threw each color; the other colors keep their slots. Removing the
color alone would pick a near-twin: in a full box the room a color leaves behind is about one spacing wide
(`evolution.md`). A slot past the count or of a fixed color is skipped.

Where the metric enters, so a change to it moves all of these: `metricVolume` (the density, so the pool and the
throw), the spacing (the throw's minimum spacing and a proposal's acceptance), `identification`, the avoid cones' hue
reach, `RIDGE` (the hue control's coordinate), and the 3D module's metric view. The preference model
(`PREFERENCE`, from the palette member rounds) enters only as the preference floor.

Not in the generator, and why (measured in `evolution.md`): descent toward the best spacing puts every seed on the
same corners of the box; cells and their split geometry did not stop the pushes emptying the middle and cost worst
identified at 40 colors; push direction rules, stall counts, clamping and phases never moved worst identified by a point, and clamping is
what parks colors on walls; the hue marginal as a draw acceptance and a hue target toward `HUE_DENSITY`'s hue line
put colors into hues with little room, and the table by lightness balances the hues on its own; the preference model
as a draw weight dislikes yellows at any weight. Known gap: a box flat in lightness or in hue gets no relaxation, a
random step never lands inside it.

## The state string

`stateString` writes, `parseState` reads and `configFromState` turns into a generator config:

    v6|count|minApart|hMin|hMax|cMinPercentage|cMaxPercentage|lMin|lMax|seed|sort|backdrop|custom|format|fixed|names|avoid|lAbsolute|rerolls|vividControl|sMin|cAbsolute

- `minApart` is the Min distance value in weighted deltaE; the ranges are in the control coordinates above (hue in
  degrees, not the ridge coordinate); `seed` is written unsigned.
- `sort` is 0 or 1; `backdrop` and `format` are option values matched by value, not position; `custom` is the
  custom backdrop's hex without `#`.
- `fixed` and `avoid` are comma-joined hexes without `#`; `names` is the included-name mask, one bit
  per cell, as a base-36 number (`stateNameField`, `nameTableFrom`); `lAbsolute` is 0 or 1, the lightness range's
  coordinate; `rerolls` is the comma-joined slots rerolled, in order, indexes into the result; `vividControl` is the
  Vividness value, 0 to 1; `sMin` is the Saturation min value, chroma over lightness, 0 to 1; `cAbsolute` is 0 or 1, the chroma range's
  coordinate. These eight were added later in that order, so an older string ends earlier and the missing
  ones take their defaults.
- `STATE_VERSION` changes when a field's meaning changes or the generator would give a string another palette; an added
  field goes at the end.

## After a change

- `node data/identify.js` runs the page's generator over fixed seeds and boxes and scores both ways; a metric
  change is compared against a saved copy of the page the same way.
- `python data/build_cells.py --check` verifies the naming tables in the page.
- In the browser: load the page, generate, open the 3D gamut with and without the metric checkbox.
