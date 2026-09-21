# The generator, rebuilt from the end state

The spec of `generator-next.html`, a clone of `index.html` with the generation stage replaced. Everything else in
the page is the same code: color math, cusp tables, naming, the metric, the interface, the state string, the 3D view.
`README.md` here describes the generator it replaces; `evolution.md` holds the measurements this design rests on.

## What a palette is

`count` colors that are, in this order of priority:

1. **Distinct**: every color's error, the sum of its swap chances with the others on the metric (`apart2`), is at
   most `ERROR_LIMIT`; where the box cannot hold that, the highest floor found.
2. **A sample of a stated density** over the usable part of the box, so that what is common in palettes is
   a decision written in one place.
3. **Evenly spread** in that density: no region gets a second color while a comparable one has none.
4. **Different for every seed.**

## The density

One scalar field carries every preference about where colors sit:

- `J(x)`: the metric's volume per OKLab volume, in closed form, the product of the metric's scale on each axis:
  `W_L * W_C * HUE_DENSITY[h] * hueScaleAt(C) * lightnessGain(L)^3`.
- `w(x)`: the packing scale, the product of
  - vividness, the chroma as a share of the reach at the color's lightness, to `VIVIDNESS_POWER`;
  - the hue target's factor to the 1/3: per hue bin, the target line's share over the share `J * vividness^3`
    gives the bin, to `HUE_TARGET_STRENGTH`. At strength 1 the colors' hues follow the target line, `HUE_DENSITY`,
    the metric's own hue circle; at 0 they follow the volume.
  - `w` is scaled so its largest value over the pool is 1: a pastel box ranks its own colors.
- The density is `J * w^3` on usable points, zero elsewhere. Usable: inside the ranges and sRGB, a name in use,
  at or above the member-round preference floor, outside every avoided color's shadow.
- The packing distance between two colors is the metric's distance times `sqrt(w_p * w_q)`. A sample of the
  density is uniform in the packing distance's volume, so even spacing in it is even spread in the density.

## The stages

1. **The pool**, once per box, cached. Raw draws cover the box without rejection by the gamut: hue evenly over the
   range, lightness evenly over the hue's interval, chroma by its square over the interval the ranges and the
   gamut leave at that lightness. A draw's weight is the density times the volume of the slab it was drawn from,
   which undoes the uneven raw coverage. `POOL_SIZE` points are taken from the usable draws by weight, without
   replacement. Where a chroma range lies beyond the gamut the draw sits on the gamut's surface, the slab a
   shell of `SHELL` thickness.
2. **The throw**, per attempt. The pool in a seeded random order; a point is seated when its packing distance to
   every seated color, the fixed ones included, is at least `r`; `r` is the largest that seats `count`, by
   bisection. This is a maximal Poisson-disc sample: random, evenly spread, following the density.
3. **The relaxation**, only while some color's error is over the limit. The confusable colors, worst first, each
   propose one position a step away in a random direction; an unusable proposal is dropped, nothing is clamped;
   a proposal is kept when it lowers the color's error on the packing distance, so paleness has to pay for
   itself. A sweep with nothing kept halves the step; the relaxation ends when no color is confusable or the
   step is under `STEP_MIN`. The best state by floor, then by the closest pair's distance, is kept.
4. **The attempts**: up to `ATTEMPTS` throws, stopping at the first with no confusable color; the best by floor,
   then by the closest pair.

The report (floor, the likeliest swapped pair, its distance and chance) is on the metric, never the packing distance.

## What is not there, and why

- Descent toward the best spacing: it puts every seed on the same corners of the box (`evolution.md`, steps 1, 2).
- Cells and their split geometry: they did not stop the pushes emptying the middle and cost floor at 40 colors.
- Push direction rules (cone, band, heading), stall counts, clamping and the phases around it: direction never
  moved the floor by a point; clamping is what parks colors on walls.
- The wall-using attempt and the "possible here" readout, the adaptive restart rule.
- The hue marginal as a draw acceptance and the preference model as a draw weight: the first is the hue target
  now, stated once; the second dislikes yellows at any weight and stays a floor only.
- The grid sampler for sparse boxes: raw draws are inside the gamut by construction.
- The finite-difference volume element: the closed form is exact.

## Measured against the page it replaces

`tmp/compare-generators.js` runs both pages on the same boxes and seeds through `identify.js`'s `loadPage`;
`tmp/contact-sheet.js` writes a page of palettes per generator to look at. Four seeds, Distinctness 3, the hue bins
red, orange to lime, green to cyan, sky blue, blue to magenta; the target line is 18 / 22 / 18 / 11 / 31%:

| box, colors | page | floor | ms | hue bins | 00 or ff channel |
|---|---|---|---|---|---|
| chroma 26-100, lightness 23-60, 14 | current | 0.980 | 178 | 14 / 18 / 16 / 5 / 46 | 9% |
| | rebuilt | 0.965 | 21 | 20 / 21 / 14 / 14 / 30 | 11% |
| chroma 30-100, lightness 20-80, 24 | current | 0.967 | 1503 | 17 / 16 / 16 / 7 / 45 | 67% |
| | rebuilt | 0.881 | 93 | 16 / 24 / 19 / 11 / 30 | 47% |
| the same, 40 | current | 0.865 | 8217 | 19 / 18 / 13 / 7 / 43 | 99% |
| | rebuilt | 0.660 | 479 | 14 / 26 / 16 / 13 / 31 | 81% |
| chroma 0-35, lightness 40-80, 14 | current | 0.516 | 1259 | 23 / 0 / 21 / 4 / 52 | 14% |
| | rebuilt | 0.428 | 45 | 20 / 0 / 29 / 16 / 36 | 23% |
| the ring, chroma 100-100, 14 | current | 0.586 | 1237 | | |
| | rebuilt | 0.927 | 61 | | |

The floor the rebuilt page gives up in a crowded box is the hue target's price, not the method's: with
`HUE_TARGET_STRENGTH` 0 it reaches 0.982, 0.965, 0.878 and 0.507 on the first four boxes, the current page's floors, in a
twentieth of the time and with the current page's hue bins (43 to 46% blue to magenta). At 0.5: 0.980, 0.940, 0.812,
0.517, blue to magenta 35 to 38%. `HUE_BOOST_MAX` 2 at strength 1: 0.975, 0.916, 0.760, 0.521. Sixteen attempts
at strength 1 buy 0.01 to 0.05. The target puts colors into hues with little room; how much floor that is worth is
the judge's call, and the constant is the place to make it.

## Known gaps

- A box flat in lightness (minimum equal to maximum) or in hue gets no relaxation: a random step never lands inside it.
- Vividness is the share of the reach at the color's own lightness, so a near-white or near-black color on the
  gamut's surface counts as fully vivid. The share of the cusp's chroma, the chroma control's own coordinate, would
  rank those as pale; not measured.
- The pool is one per box, its points shared by every seed; a color the relaxation does not move is a pool point, so
  two palettes of one box can share a hex (4% of colors over four seeds).
- The push-angle controls are gone from the page; the state string is unchanged.
