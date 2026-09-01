# Color naming data

`index.html` decides what a color is *called*, not just where it sits. The tables it embeds are
derived from the files here. Nothing in this directory is loaded at runtime — the page stays a
single self-contained file.

## Where the data comes from

`c3_data.json` is the color naming model from [c3](https://github.com/StanfordHCI/c3), built by
Jeffrey Heer and Maureen Stone for *Color Naming Models for Color Selection, Image Editing and
Palette Design* (CHI 2012). It is fitted to the [XKCD color
survey](https://blog.xkcd.com/2010/05/03/color-survey-results/), in which a large number of people
named colors in their own words.

It holds 8325 bins covering sRGB — CIE Lab cubes 5 units on a side — 153 color terms, and the vote
count for every bin/term pair. `c3_LICENSE.txt` is its BSD license, which requires the copyright
notice be kept; `index.html` carries it above the tables.

## What the build does

`build_cells.py` turns the vote counts into a partition of color space into named cells.

1. A word earns a cell if it out-polls every other word, by `KEEP_LEAD` on average, somewhere —
   words that never lead anywhere are synonyms of one that does, or too rare to matter. This is
   what separates `orange` (winning its region by 39 points) from `darkteal` (2 points over `teal`,
   in a single bin). 29 words survive.
2. Each bin then belongs to the kept word with the highest vote share weighted by the word's
   rarity (`SPECIFICITY`). Unweighted plurality hands generic words everything — everyone falls
   back on `green`, so `green` narrowly out-polls `light green` even at its pale edge, and owns
   74x `mauve`'s territory; weighting returns specific words their regions and flattens the ratio
   to 11x. The territories are arbitrary shapes, which is why the table cannot be replaced by a
   list of representative colors — a nearest-centroid partition reproduces only 60% of it.
3. A bin is flagged when people split their votes between names (`UNSURE_LEAD`) or when the
   weighted winner barely beat the runner-up (`UNSURE_RATIO`). Those colors have no name people
   agree on; the page marks them with a tilde. They are not excluded from palettes — being hard to
   name is not a defect, and some cells hold little else.
4. The grid is run-length encoded and base64'd, one symbol per bin carrying the cell and the flag.
5. A cell-by-cell name overlap matrix (cosine similarity of the cells' mean vote distributions)
   is emitted alongside: the page's generator uses it to keep same-worded cells apart.

## Running it

```
python data/build_cells.py            # print the const lines to paste into index.html
python data/build_cells.py --check    # verify index.html matches; non-zero exit if not
node data/bench.js [page.html]        # end-to-end: generate palettes, score identification
```

`bench.js` accepts any version of the page, so a change can be compared against
`git show <rev>:index.html` saved to a file. It models the real task, labeling a palette color
seen on its own: two entries are confusable when people describe both colors with the same
words and the colors also sit close in OKLab - either alone is survivable, together they are
not. An entry scores 1 minus its worst confusability; a palette reports the mean entry score
and the worst - it is only as usable as its most confusable color.

The four constants at the top of the script are the only judgement calls. All trade the number of
cells against how well each one corresponds to a name a person would actually reach for.
