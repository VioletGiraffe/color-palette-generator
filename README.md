# Color palette generator

Generates a set of visually distinct colors, fully customizable, with rich visualization. One HTML file, no dependencies: open `index.html` in a browser.

Use live online in your browser: https://violetgiraffe.github.io/color-palette-generator/

## What you can do

- **Choose how many colors** you need, from 1 to 40.
- **Set how distinct they have to be**: one slider controls the minimum perceived difference between any two colors.
- **Restrict the color space**: min and max sliders for hue, saturation and lightness. The hue range wraps around, so 300-60 covers magenta through yellow.
- **Generate around colors you already have**: paste any number of hex values as fixed colors. New colors are kept distinct from them. They are shown alongside the result but not counted in Colors and not exported.
- **See the selected range**: a hue bar and a saturation/lightness plane, with everything outside the range hatched out.
- **See where the colors landed**: a hue/saturation plot with a dot for each generated color.
- **Judge the colors together**: a tight grid of small squares, over a white, black, grey or custom backdrop.
- **Copy the result**: hex list, CSS custom properties, JSON, or a Python list. Click any swatch to copy its hex.
- **Get the same palette again**: each one comes from a seed you can set. A fresh load gets a new unique seed.
- **Save the whole setup**: the state string holds every setting. Copy it, paste it back later or on another machine, and you get the identical palette.
- **Pin the ones you like**: park any generation in a named list and click it to get it back. This session only, nothing is stored, so copy the strings out to keep them.

## How the distinctness works

Colors are picked in HSL, but compared in OKLab. OKLab is perceptually uniform, so equal distances look equally different.

The slider sets the minimum distance allowed between any two colors. Roughly, 2 is a just-noticeable difference, and 15 to 25 is comfortably distinguishable. At 0 the colors are random and may repeat.

If the range is too narrow / too many colors requested and the target distance is impossible, you get the best palette it could find. The closest pair is reported above the swatches so you can see how far off it was.
