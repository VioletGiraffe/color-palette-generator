# Color palette generator

Generates a set of memorable colors - made to be recognized one at a time, in isolation.    
Fully customizable, with rich visualization. Almost no dependencies, just open `index.html` in a browser (only downloads three.js on first open for the 3D gamut, degrades gracefully if not available).

Use live online in your browser: https://violetgiraffe.github.io/color-palette-generator/

## What you can do

- **Choose how many colors** you need, from 1 to 40.
- **Set how distinct they have to be**: the Distinctness slider is the width of the memory noise the colors are spread against, in OKLab ΔE. The default comes from a calibration run (see `data/scripts.md`); raise it for palettes that survive a longer gap between seeing a color and naming it, lower it to fit more colors into a narrow range.
- **See what each color is called**: every swatch carries the name people most often give that color, from the [xkcd color survey](https://blog.xkcd.com/2010/05/03/color-survey-results/). A tilde marks a color people never settled a name for - as usable as any other, just harder to call something. The names panel shows every name's territory; switching a name off keeps the generated colors out of it.
- **Restrict the color space**: min and max sliders for hue, chroma and lightness in OKLCh. Both chroma and lightness are relative to each hue's own peak, so one setting selects the same standing in every hue's gamut. Lightness: 50 is the most vivid sRGB reaches at that hue, 0 is black and 100 is white - yellow peaks near absolute lightness 97 and blue near 45, so one absolute range would clip the first and admit only washed-out colors at the second. Chroma: 100 is all the hue has - teal peaks at absolute chroma 14.5 and magenta at 32.2, so an absolute floor above 14.5 drops teal from the palette while leaving magenta almost untouched. The hue range wraps around, so 300-60 covers magenta through orange. Any value some sRGB color reaches is selectable; where a range runs past what sRGB can show, the gamut is the limit, and a range that holds no sRGB color at all says so instead of generating.
- **Generate around colors you already have**: paste any number of hex values as fixed colors. New colors are kept distinct from them. They are shown alongside the result but not counted in Colors and not exported.
- **Keep colors you dislike out**: paste hex values as avoided colors, or right-click a color in the palette. Each bans what it lacks: at its hue, every color at least as dull, as dark or as light as it is, and never the pure version. The charts hatch the banned region.
- **See the selected range**: the color space, and the limits you select, are rendered on the 2D color chart in real time.
- **See where the colors landed**: two charts of the perceptual space with a dot per color. One is the outside of the selected region, hue across and lightness up, every point as vivid as the ranges allow; the other is hue across and chroma up, each hue drawn at the lightness within the range that makes it most vivid, so its top edge is the most chroma you can get at that hue and every color sits under it. Equal distance is equal perceived difference in any direction. The 3D gamut shows the same region as a solid, with a halo around each color reaching half the Distinctness width; a checkbox redraws it the way the generator measures distance, hues at their calibrated angles and darks shrunk.
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

- Two colors are as far apart as the author would want them in one palette, measured as a distance in
  OKLab with a noise width the Distinctness slider sets. The distance is anisotropic: a lightness
  difference counts about half of an equal hue difference, a chroma difference a little under it; a hue
  difference grows with chroma at the 0.75 power; a pair toward black or toward white needs somewhat less
  distance than one at the lightness of the most saturated colors. Hue differences are taken on a respaced
  circle, each hue's share measured by the author's verdicts on thousands of pairs and different by lightness:
  red is widest among dark colors, violet among pastels, yellow narrow throughout
  (`data/scripts.md`, `data/evolution.md`).
- A pair's chance of being swapped follows from its weighted distance, and a color's chance of
  being misidentified is the sum over its pairs. The generator keeps every color's chance under a
  limit: the colors are thrown at random over the selected range with the widest spacing that seats
  them all, so they follow one stated density and no region gets a second color while a comparable one
  has none; any color still confused too often steps off in random directions until none is. A few
  throws are made and the one whose worst color does best is kept.
- Vividness is a preference, not a restriction: colors are spaced on the distance times their chroma's share
  of the most saturated color of their hue, so a pale or a dark placement has to buy more distance than a vivid one
  to be taken. What counts as distinct, and what is reported, stays on the distance itself.
- The selected range is a box in OKLCh, cut by the sRGB gamut and by the excluded names: draws
  outside it are discarded, and a step that would leave it is refused.
- Names are looked up in a partition of color space derived from the xkcd survey's millions of
  votes (see `data/scripts.md` for the derivation). They label the result; beyond an exclusion
  they do not steer it.

You always get the best palette found; nothing fails outright short of an empty range. The pair
likeliest to be mixed up is reported above the swatches with its weighted distance and swap
chance, and outlined; the worst color's identification rate is given, so a forced palette is visible as such.

`data/README.md` is the engineering overview: the page's layout, its coordinates, the metric and the
generator's pipeline. `data/evolution.md` is the design history behind all of this: every generator tried
and the numbers it produced, the negative results, the calibration that fixed the constants, and the gamut
and lightness work that followed.
