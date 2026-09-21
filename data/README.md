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
- `generator-next.html` at the root is a clone of the page with the generation stage rebuilt from the end state;
  `generator-next.md` here is its spec and its measurements against this page. The sections below describe `index.html`.
- `tmp/` at the project root is gitignored scratch for experiment scripts and pages; `exp.html` at the root is
  a gitignored live scratch copy of the page. `demo.html` is untracked and not part of the project.

## Coordinates

Five conventions coexist. Which one a number is in is the first thing to check.

| where | lightness | chroma | hue |
|---|---|---|---|
| range controls, state string, cells, shadows | relative to the cusp: 50 is the hue's cusp lightness, 0 black, 100 white, linear on each side (`absoluteL`, `relativeL`, `CUSP_ANCHOR`) | share of the cusp's chroma: 100 is `cuspChroma(h)`, whatever the color's lightness (`absoluteC`, `relativeC`); a share the lightness cannot reach is cut to the gamut in `pointInBox` | degrees of OKLab hue; the hue sliders alone run in the ridge coordinate (`ridgeWarp`, `ridgeUnwarp`) |
| a color's `lch` | absolute OKLab L, 0 to 100 | absolute, 0 to about 32 | degrees |
| metric positions (`positionsOf`, `apart2`), every distance and deltaE | OKLab times 100 | | |
| a color's `lab` and `rgb` | OKLab and sRGB in 0 to 1 | | |
| `make_boundary_deal.js` | cusp-relative as above | share of the reach at the color's own lightness (`gamutChroma`), not of the cusp's | degrees |

The cusp of a hue is the lightness at which sRGB reaches the hue's highest chroma (`cuspLightness`,
`cuspChroma`, from a smoothed table). Two warps of the hue circle exist: `HUE_WARP`, the running integral of
`HUE_DENSITY`, is the metric's; `RIDGE_WARP`, the metric's length along the sRGB cube's saturated edges, is the
hue control's only.

## The metric

`apart2(p, q)` is the squared distance between two metric positions, in deltaE:

- the lightness difference times `W_L` (0.46);
- the radial chroma difference times `W_C` (0.86);
- the tangential part, the ab chord after both hues move to their warped angle less the radial part, times
  `hueScaleAt` of the pair's mean chroma, `(C / CHROMA_REFERENCE) ^ (CHROMA_POWER - 1)`, so a hue turn grows with
  chroma at the 0.75 power;
- the sum times the square of `lightnessGain` of the pair's mean lightness, one at `LIGHTNESS_REFERENCE` (68) and
  rising as the ratio to `LIGHTNESS_EXPONENT` (0.19) toward black (floored at 20) and toward white.

The Distinctness control is the noise width `sigma`; a pair at distance `d` swaps with `swapChance(d, sigma)`,
half the complementary error function of `d / (2 sigma)` in standard units, and `limitDistance(sigma)` is where
that chance falls to `ERROR_LIMIT` (0.02). `sigma` comes from the recall calibration (`calibrate.html`,
`fit.js`); `HUE_DENSITY`, `W_L`, `W_C` and the gain's exponent are one fit to the pair rounds under the preference
question (`calibrate-boundaries.html`, `fit_hue_density.js`), the chroma power from the same rounds; the sources and numbers are in `scripts.md` and `evolution.md`.
The metric measures how far apart two colors read as members of one palette. It carries no term for a color on
its own.

## The generator

The objective: every color's error, the sum of its swap chances with the others, under `ERROR_LIMIT`. An attempt
is scored by its floor, the worst color's chance of being identified, then by `apart`, the closest pair's
distance (`identification`). Pairs of two fixed colors are skipped. Nothing in the score values a color for
itself: where a pale or a dark placement buys distance, the generator takes it (see `evolution.md`, "Live
palettes under the preference metric").

`generate` runs `attempt` several times; an attempt is a start and the pushes:

1. **The box** (`pointInBox`, `usableLch`): the cusp-relative ranges, cut by the sRGB gamut, by the excluded names
   (a color's cell against `cfg.included`), by the preference floor (`wantedLch`: `preferenceOf` at least
   `PREFERENCE_FLOOR`) and by the shadows of avoided colors (`shadowed`). `boxCells` grids it 25 by 25 by 90; a box
   whose usable cells are under `SPARSE_FRACTION` of the grid is sampled from those cells, else by rejection.
2. **The pool** (`poolFor`, one per box, cached): `POOL_DRAWS` draws by `sampleWeighted`, a box draw accepted with
   the chance `hueWeight[h]` times `preferenceOf(C, h)`. `hueWeightFor` is `HUE_DENSITY` over the box's own
   uniform hue marginal, so draws land with the density's hue distribution whatever the box's shape. Each draw
   carries `volumeElement`, the metric's volume per OKLab volume at the point.
3. **The cells** (`splitCells`): the pool cut into as many cells of equal metric volume as there are seats,
   sub-boxes in the box's own coordinates, split axes and hue origin drawn per attempt.
4. **The seats** (`poolStart`): the fixed colors, then the cells in random order, each seating the first of its
   points in weighted order that is at least the limit distance from every color placed, else the farthest of
   them; a fixed color inside the box takes the cell it falls in; further rounds over the cells while seats remain.
5. **The pushes** (`pushApart`): a color whose error is over the limit is pushed by every other, along the OKLab
   line between them, weighted by their distance in noise widths; it steps `PUSH_STEP` in a direction
   `pushMin` to `pushMax` degrees off that resultant, kept until a step is refused. A step is refused when it
   leaves the box, a name, the preference floor or enters a shadow, or raises the color's own error;
   `STALL_PUSHES` refusals in a row park the color. Three phases: within its cell refusing clamped steps, within
   its cell keeping them, within the whole box. The best state by floor then `apart` is kept across all pushes.
6. **The restarts** (`generate`): `reachable` is one attempt free of cells from its own seed, the floor the box
   allows; then `RESTARTS` attempts, up to `MAX_RESTARTS` while the best is under `RESTART_TARGET` or under
   `reachable` by more than `RESTART_SHORTFALL` and a recent attempt still improved it.

Where the metric enters, so a change to it moves all of these: `volumeElement` (pool weights, so the cells'
sizes and where the seats go), the seating clearance, the push weights and the error a step is judged by,
`identification`, the shadows' hue reach, `RIDGE_WARP` (the hue control's coordinate), and the 3D module's
metric view. `HUE_DENSITY` enters once more, as the draw acceptance in `hueWeightFor`. The preference model (`PREFERENCE`, from the palette member rounds) enters only as the draw acceptance
and the floor; above the floor it does not steer a push.

## The state string

`stateString` writes, `parseState` reads and `configFromState` turns into a generator config:

    v4|count|strict|hMin|hMax|cMin|cMax|lMin|lMax|seed|sort|backdrop|custom|format|fixed|names|avoid

- `strict` is the Distinctness value, `sigma`; the ranges are in the control coordinates above (hue in degrees,
  not the ridge coordinate); `seed` is written unsigned.
- `sort` is 0 or 1; `backdrop` and `format` are option values matched by value, not position; `custom` is the
  custom backdrop's hex without `#`.
- `fixed` and `avoid` are comma-joined hexes without `#`; `names` is the included-name mask, one bit
  per cell, as a base-36 number (`stateNameField`, `nameTableFrom`). These three were added later in that order, so an older string ends
  earlier and the missing ones take their defaults.
- `STATE_VERSION` changes only when a field's meaning changes; an added field goes at the end.

## After a change

- `node data/identify.js` runs the page's generator over fixed seeds and boxes and scores both ways; a metric
  change is compared against a saved copy of the page the same way.
- `python data/build_cells.py --check` verifies the naming tables in the page.
- In the browser: load the page, generate, open the 3D gamut with and without the metric checkbox.
