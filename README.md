# Color palette generator

Generates a set of colors made to be recognized one at a time, not just told apart side by side - each as nameable and as far from the others as the requested count allows. Fully customizable, with rich visualization. Almost no dependencies, just open `index.html` in a browser (only downloads three.js on first open for the 3D gamut, degrades gracefully if not available).

Use live online in your browser: https://violetgiraffe.github.io/color-palette-generator/

## What you can do

- **Choose how many colors** you need, from 1 to 40.
- **Set how distinct they have to be**: one slider controls how far apart similarly-named colors must sit to count as distinct. At 0 any visible difference is enough; higher demands colors you could label from memory.
- **See what each color is called**: every swatch carries the name people most often give that color, from the [xkcd color survey](https://blog.xkcd.com/2010/05/03/color-survey-results/). A tilde marks a color people never settled a name for - as usable as any other, just harder to call something.
- **Choose which names get used**: every name the generator can reach is listed with the territory it owns, each drawn at the lightness where it covers the most ground. Switch one off and no color is placed there. Drag one name onto another to merge them: the pair then generates as a single name, so two colors sharing it have to sit further apart, while each swatch keeps its own label.
- **Restrict the color space**: min and max sliders for hue, saturation and lightness. The hue range wraps around, so 300-60 covers magenta through yellow.
- **Generate around colors you already have**: paste any number of hex values as fixed colors. New colors are kept distinct from them. They are shown alongside the result but not counted in Colors and not exported.
- **See the selected range**: a hue bar and a saturation/lightness plane, with everything outside the range hatched out.
- **See where the colors landed**: three slices of the perceptual color space (OKLab) at the low, middle and high lightness of the selected range, with a dot for each color on the slice nearest its lightness. Equal distance is equal perceived difference in any direction; a slider sweeps the slices through lightness.
- **Judge the colors together**: a tight grid of small squares, over a white, black, grey or custom backdrop.
- **Copy the result**: hex list, CSS custom properties, JSON, or a Python list. Click any swatch to copy its hex.
- **Get the same palette again**: each one comes from a seed you can set. A fresh load gets a new unique seed.
- **Save the whole setup**: the state string holds every setting. Copy it, paste it back later or on another machine, and you get the identical palette.
- **Pin the ones you like**: park any generation in a named list and click it to get it back. This session only, nothing is stored: copy the list out to keep it, and paste it back with Load next time.

## How the generation works

Two colors can be trivial to tell apart side by side yet impossible to identify alone: shown one
pale green in isolation, you cannot say which of two pale greens it was. The generator optimizes
for that isolated recognition, not just pairwise difference.

- Colors are picked in HSL and compared in OKLab, a perceptually uniform space where equal
  distances look equally different. Candidates are drawn evenly through OKLab rather than through
  HSL, which packs far more colors into some regions than others.
- Every color carries a name, looked up in a partition of color space derived from the xkcd
  survey's millions of votes (see `data/README.md` for the derivation).
- Two palette entries are confusable to the degree people use the same words for both colors AND
  the colors sit close in OKLab. Either alone is survivable: same-named colors far apart are told
  apart by memory of the color itself.
- The generator maximizes the identifiability of the worst-off entry. Repeating a name is allowed
  when the repeat sits far enough away - sometimes that beats a mediocre new name.
- Merging two names scores them as fully shared wording, which is what two colors of one name
  already score. Excluding a name keeps candidates out of it, and gives way only where the
  selected range holds too little else - the palette says so when that happens.
- The Distinctness slider sets how far apart same-named colors must sit before memory is trusted
  to separate them. It is the strictness of "recognizable alone": 0 falls back to pure OKLab
  spread, side-by-side distinctness only.

You always get the best palette found; nothing fails outright. The pair likeliest to be mixed up
is reported above the swatches with its OKLab distance, and outlined.
