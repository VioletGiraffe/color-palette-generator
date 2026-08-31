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

1. Each bin's winner is the word most people gave it. Grouping bins by winner gives each word a
   territory as large as people's use of it: green wins 1335 bins, orange 308, salmon 52. That
   asymmetry is the point, and it is why the table cannot be replaced by a list of representative
   colors — a nearest-centroid partition reproduces only 60% of it.
2. Words that beat their runner-up by less than `KEEP_LEAD` averaged over the bins they win are
   dropped as ties with a synonym, and their bins fall to the runner-up. This is what separates
   `orange` (winning by 39 points) from `darkteal` (2 points over `teal`, in a single bin). 26
   words survive.
3. Each bin whose winner leads by less than `UNSURE_LEAD` is flagged. Those colors have no name
   people agree on; the page marks them with a tilde. They are not excluded from palettes — being
   hard to name is not a defect, and some cells hold little else.
4. The grid is run-length encoded and base64'd, one symbol per bin carrying the cell and the flag.

## Running it

```
python data/build_cells.py            # print the two lines to paste into index.html
python data/build_cells.py --check    # verify index.html matches; non-zero exit if not
```

The two thresholds at the top of the script are the only judgement calls. Both trade the number of
cells against how well each one corresponds to a name a person would actually reach for.
