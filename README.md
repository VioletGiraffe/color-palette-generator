# Color palette generator

Generates a set of memorable colors - made to be recognized one at a time, in isolation.    
Fully customizable, with rich visualization. Almost no dependencies, just open `index.html` in a browser (only downloads three.js on first open for the 3D gamut, degrades gracefully if not available).

Use live online in your browser: https://violetgiraffe.github.io/color-palette-generator/

## What you can do

- **Choose how many colors** you need, from 1 to 40.
- **Set how distinct they have to be**: the Distinctness slider is the width of the memory noise the colors are spread against, in OKLab ΔE. The default comes from a calibration run (see `data/README.md`); raise it for palettes that survive a longer gap between seeing a color and naming it, lower it to fit more colors into a narrow range.
- **See what each color is called**: every swatch carries the name people most often give that color, from the [xkcd color survey](https://blog.xkcd.com/2010/05/03/color-survey-results/). A tilde marks a color people never settled a name for - as usable as any other, just harder to call something. The names panel shows every name's territory; switching a name off keeps the generated colors out of it.
- **Restrict the color space**: min and max sliders for hue, chroma and lightness in OKLCh. Chroma is absolute; lightness is relative to each hue's own peak, where 50 is the most vivid sRGB reaches at that hue, 0 is black and 100 is white. Yellow peaks near absolute lightness 97 and blue near 45, so one absolute range would clip the first and admit only washed-out colors at the second, where the relative one selects the same standing in every hue's gamut. The hue range wraps around, so 300-60 covers magenta through orange. Any value some sRGB color reaches is selectable; where a range runs past what sRGB can show, the gamut is the limit, and a range that holds no sRGB color at all says so instead of generating.
- **Generate around colors you already have**: paste any number of hex values as fixed colors. New colors are kept distinct from them. They are shown alongside the result but not counted in Colors and not exported.
- **See the selected range**: a hue bar, and a chroma/lightness plane at a hue you can sweep, with everything outside the range hatched out and everything sRGB cannot show left blank. The lightness bounds follow each hue's peak, so the selected band rises and falls across the hue axis instead of running level.
- **See where the colors landed**: two charts of the perceptual space with a dot per color. One is the outside of the selected region, hue across and lightness up, every point as vivid as the ranges allow; the other a slice at a lightness you can sweep, hue across and chroma up. Equal distance is equal perceived difference in any direction. The 3D gamut shows the same region as a solid, with a halo around each color reaching half the Distinctness width.
- **Judge the colors together**: a tight grid of small squares, over a white, black, grey or custom backdrop.
- **Switch light or dark**: the page follows the system theme; the selector overrides it for the session.
- **Copy the result**: hex list, CSS custom properties, JSON, or a Python list. Click any swatch to copy its hex.
- **Get the same palette again**: each one comes from a seed you can set. A fresh load gets a new unique seed.
- **Save the whole setup**: the state string holds every setting. Copy it, paste it back later or on another machine, and you get the identical palette.
- **Pin the ones you like**: park any generation in a named list and click it to get it back. The list stays in this browser between visits; copy it out to move it to another one, and paste it in with Load.

## How the generation works

Two colors can be trivial to tell apart side by side yet impossible to identify alone: shown one
pale green in isolation, you cannot say which of two pale greens it was. The generator optimizes
for that isolated recognition, not just pairwise difference.

- A viewer who learned the palette is modeled as recalling a color with Gaussian memory noise in
  OKLab and answering with the nearest palette entry. The noise is anisotropic: a lightness
  difference counts about a third of an equal hue difference, a chroma difference about half. The
  width and the weights were fitted to the author's judgments of hundreds of color pairs
  (`data/README.md`, `data/evolution.md`); the Distinctness slider is the width.
- A pair's chance of being swapped follows from its weighted distance, and a color's chance of
  being misidentified is the sum over its pairs. The generator keeps every color's chance under a
  limit: colors start at random positions in the selected range at least the limit distance
  apart, and any color still confused too often steps away from its neighbors until none is.
  Several starts are made and the one whose worst color does best is kept.
- The selected range is a box in OKLCh, cut by the sRGB gamut and by the excluded names: draws
  outside it are discarded, and a step that would leave it is refused.
- Names are looked up in a partition of color space derived from the xkcd survey's millions of
  votes (see `data/README.md` for the derivation). They label the result; beyond an exclusion
  they do not steer it.

You always get the best palette found; nothing fails outright short of an empty range. The pair
likeliest to be mixed up is reported above the swatches with its weighted distance and swap
chance, and outlined; the worst color's identification rate is given with the best this range can
reach for the count, so a forced palette is visible as such.

`data/evolution.md` is the design history behind all of this: every generator tried and the numbers
it produced, the negative results, the calibration that fixed the constants, and the gamut and
lightness work that followed.
