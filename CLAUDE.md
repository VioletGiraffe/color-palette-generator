# Color palette generator

A single-file web page, `index.html`, that generates palettes of colors meant to be recognized one at a time,
by a distance metric calibrated on the author's own judgements. The calibration pages, scripts and logs are in
`data/`.

## Read first

- `data/README.md`: the page's layout, the five coordinate conventions, the metric, the generator's pipeline and
  where the metric enters it, the state string.
- `data/scripts.md`: every script, log and fit, and `loadPage`, the way to run the page's generator in Node.
- `data/evolution.md`: the design history with numbers. Read before changing the generator or the metric.

## Working rules here

- The metric lives twice, in `index.html` and `data/identify.js`, and they must agree: change constants in
  both, paste a new density table into both.
- Experiments are Node scripts in `tmp/` (gitignored, never `git add`) that `require("../data/identify.js")`
  and run the page through `loadPage`; a variant of the page is a copy in `tmp/` with the constant edited.
  Measurement output goes to a file in `tmp/`, the aggregate to the screen.
- Tracked data files are documented in `data/scripts.md`: what a log holds, which script reads it. "We store"
  means: stage the files, the user commits.
- Calibration rounds on `data/calibrate-boundaries.html` and `data/calibrate-kinds.html`: the dealer writes one deal into the page, so the
  page holds one deal at a time and is reloaded for the next. The user force-reloads and presses Start with no
  parameter changes; if a round needs one, say so explicitly before the round. Swatch size stays 80 px across
  rounds. No expectations or analysis before a round, only after: the judge must not be biased. The downloaded
  log is stored as the next `data/boundary-N-log.json` or `data/kinds-N-log.json`.
- `demo.html` at the root is untracked and not part of the project; leave it alone.

## Browser checks

- Verify in a tab of my own in the app's browser pane, never in the user's tab, and leave tabs open afterward;
  reload in place on regeneration. Each navigate makes a new tab id.
- The pane opens files outside the project as static snapshots (no script runs) and files it opens as
  `data:` URLs have no localStorage: a calibration page's log lives only in a real page load.
- `.claude/launch.json` serves the project root on port 8734 (`oklab-3d-demo`) for the 3D module.
