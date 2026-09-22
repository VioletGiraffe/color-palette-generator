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
| range controls, state string, cells, shadows | relative to the cusp: 50 is the hue's cusp lightness, 0 black, 100 white, linear on each side (`absoluteL`, `relativeL`, `CUSP_ANCHOR`); the lightness range alone is absolute OKLab L with the `absolute` box ticked (`cfg.lAbsolute`; `rangeL`, `withinLightness` take the mode) | share of the cusp's chroma: 100 is `cuspChroma(h)`, whatever the color's lightness (`absoluteC`, `relativeC`); a share the lightness cannot reach is cut to the gamut (`rawDraw`, `insideBox`) | degrees of OKLab hue; the hue sliders alone run in the ridge coordinate (`ridgeWarp`, `ridgeUnwarp`) |
| a color's `lch` | absolute OKLab L, 0 to 100 | absolute, 0 to about 32 | degrees |
| metric positions (`positionsOf`, `apart2`), every distance and deltaE | OKLab times 100 | | |
| a color's `lab` and `rgb` | OKLab and sRGB in 0 to 1 | | |
| `make_boundary_deal.js` | cusp-relative as above | share of the reach at the color's own lightness (`gamutChroma`), not of the cusp's | degrees |

The cusp of a hue is the lightness at which sRGB reaches the hue's highest chroma (`cuspLightness`,
`cuspChroma`, from a smoothed table). The hue circle is warped twice over: the metric's warps, `HUE_LEVELS`, the running integrals of a hue
density per lightness level (`HUE_DENSITY_AT_30`, `_58`, `_85`), mixed by lightness (`hueLevelAt`, `warpedHue`);
`RIDGE_WARP`, the metric's length along the sRGB cube's saturated edges, is the hue control's only. `HUE_DENSITY`,
the one table over every lightness, is not in the metric and not in use in the page; `identify.js` still exports it for
the archived generator and the scripts.

## The metric

`apart2(p, q)` is the squared distance between two metric positions, in deltaE:

- the lightness difference times `W_L` (0.46);
- the radial chroma difference times `W_C` (0.83);
- the tangential part, the ab chord after both hues move to their warped angle at the pair's mean lightness, the
  mix of the two levels around it, less the radial part, times
  `hueScaleAt` of the pair's mean chroma, `(C / CHROMA_REFERENCE) ^ (CHROMA_POWER - 1)`, so a hue turn grows with
  chroma at the 0.75 power;
- the sum times the square of `lightnessGain` of the pair's mean lightness, one at `LIGHTNESS_REFERENCE` (68) and
  rising as the ratio to `LIGHTNESS_EXPONENT` (0.21) toward black (floored at 20) and toward white.

The Distinctness control is the noise width `sigma`; a pair at distance `d` swaps with `swapChance(d, sigma)`,
half the complementary error function of `d / (2 sigma)` in standard units, and `limitDistance(sigma)` is where
that chance falls to `ERROR_LIMIT` (0.02). `sigma` comes from the recall calibration (`calibrate.html`,
`fit.js`); the level densities, `W_L`, `W_C` and the gain's exponent are one fit to the pair rounds under the preference
question (`calibrate-boundaries.html`, `fit_hue_density.js`), the chroma power from the same rounds; the sources and numbers are in `scripts.md` and `evolution.md`.
The metric measures how far apart two colors read as members of one palette. It carries no term for a color on
its own.

## The generator

A palette is `count` colors that are, in this order of priority: distinct, every color's error, the sum of its
swap chances with the others on `apart2`, at most `ERROR_LIMIT`, or where the box cannot hold that the highest floor
found; a sample of one stated density over the usable part of the box; evenly spread in that density; different for
every seed. An attempt is scored by its floor, the worst color's chance of being identified, then by `apart`, the
closest pair's distance (`identification`); pairs of two fixed colors are skipped.

The density carries every preference about where colors sit:

- `metricVolume(L, C, h)`: the metric's volume per OKLab volume, in closed form, the product of the metric's scale on
  each axis: `W_L * W_C * density(h, L) * hueScaleAt(C) * lightnessGain(L)^3`, the density the level tables mixed at `L`.
- `vividness(C, h)`: the chroma as a share of the hue's cusp chroma, floored at `VIVIDNESS_FLOOR`: a dark or a pale
  color on the gamut's surface is not vivid. A color's packing scale is its vividness to `VIVIDNESS_POWER`, relative to
  the pool's largest, so a pastel box ranks its own colors.
- The density is the volume times the cube of the scale, on usable points (`insideBox`, `usableLch`: inside the ranges and sRGB, a
  name in use, at or above the preference floor `PREFERENCE_FLOOR` of `preferenceOf`, outside every avoided color's
  shadow, `shadowed`), zero elsewhere.
- The packing distance, `packed2`, is `apart2` times the pair's scales. A sample of the density is uniform in the
  packing distance's volume, so even spacing in it is even spread in the density: a pale placement has to buy more
  distance than a vivid one. Which colors are confusable, which state is best and what is reported stay on `apart2`.

`generate` runs up to `ATTEMPTS` attempts, stopping at the first with no confusable color, and keeps the best by floor
then `apart`; an attempt is a throw and a relaxation:

1. **The pool** (`poolFor`, one per box, cached): raw draws (`rawDraw`) cover the box without rejection by the gamut,
   hue evenly over the range, lightness evenly over the hue's interval, chroma by its square over the interval the
   ranges and the gamut leave at that lightness; a draw's weight is the density times `slab`, the OKLab volume it
   stands for, which undoes the uneven raw cover. `POOL_SIZE` points are kept by rejection against the density's peak
   over a survey of `RAW_SURVEY` usable draws. Where a range has no thickness, a lightness of one value or a chroma
   range beyond the gamut, the draw sits on the gamut's surface in a shell `SHELL` thick.
2. **The throw** (`throwAt`, `widestThrow`): the pool in a seeded random order; a point is seated when its packing
   distance to every seated color, the fixed ones included, is at least `r`, and `r` is the largest that seats
   `count`, by bisection to `THROW_PRECISION`. A maximal Poisson-disc sample: random, evenly spread, following the density.
3. **The relaxation** (`relax`), only while some color's error is over the limit: the confusable colors, worst first,
   each try up to `PROPOSALS` positions a step away in a random direction; an unusable proposal is dropped, nothing is
   clamped; a proposal is kept when it lowers the color's error on the packing distance. A sweep with nothing kept
   halves the step, from `STEP_START`; the relaxation ends when no color is confusable, the step is under `STEP_MIN`
   or `SWEEPS_MAX` sweeps are spent. The best state by floor, then `apart`, is kept.

A reroll (`reroll`, for each slot in the config's `rerolls`, replayed after the attempts on the seeds after theirs): the
slot's color and its `REROLL_VICINITY` nearest generated colors are thrown again among the rest, from the pool less the
points within the limit distance of the rejected color, then relaxed; the other colors keep their slots. Removing the
color alone would seat a near-twin: in a maximal throw the room a color leaves behind is smaller than the spacing
(`evolution.md`). A slot past the count or of a fixed color is skipped.

Where the metric enters, so a change to it moves all of these: `metricVolume` (the density, so the pool and the
throw), the packing distance (the throw's spacing and a proposal's acceptance), `identification`, the shadows' hue
reach, `RIDGE_WARP` (the hue control's coordinate), and the 3D module's metric view. The preference model
(`PREFERENCE`, from the palette member rounds) enters only as the floor.

Not in the generator, and why (measured in `evolution.md`): descent toward the best spacing puts every seed on the
same corners of the box; cells and their split geometry did not stop the pushes emptying the middle and cost floor at
40 colors; push direction rules, stall counts, clamping and phases never moved the floor by a point, and clamping is
what parks colors on walls; the hue marginal as a draw acceptance and a hue target toward `HUE_DENSITY`'s hue line
put colors into hues with little room, and the table by lightness balances the hues on its own; the preference model
as a draw weight dislikes yellows at any weight. Known gaps: a box flat in lightness or in hue gets no relaxation, a
random step never lands inside it; the pool is shared by every seed of a box, so two palettes of one box can share a hex.

## The state string

`stateString` writes, `parseState` reads and `configFromState` turns into a generator config:

    v4|count|strict|hMin|hMax|cMin|cMax|lMin|lMax|seed|sort|backdrop|custom|format|fixed|names|avoid|lAbsolute|rerolls

- `strict` is the Distinctness value, `sigma`; the ranges are in the control coordinates above (hue in degrees,
  not the ridge coordinate); `seed` is written unsigned.
- `sort` is 0 or 1; `backdrop` and `format` are option values matched by value, not position; `custom` is the
  custom backdrop's hex without `#`.
- `fixed` and `avoid` are comma-joined hexes without `#`; `names` is the included-name mask, one bit
  per cell, as a base-36 number (`stateNameField`, `nameTableFrom`); `lAbsolute` is 0 or 1, the lightness range's
  coordinate; `rerolls` is the comma-joined slots rerolled, in order, indexes into the result. These five were added
  later in that order, so an older string ends earlier and the missing ones take their defaults.
- `STATE_VERSION` changes only when a field's meaning changes; an added field goes at the end.

## After a change

- `node data/identify.js` runs the page's generator over fixed seeds and boxes and scores both ways; a metric
  change is compared against a saved copy of the page the same way.
- `python data/build_cells.py --check` verifies the naming tables in the page.
- In the browser: load the page, generate, open the 3D gamut with and without the metric checkbox.
