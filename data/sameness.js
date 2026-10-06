#!/usr/bin/env node
// How alike a page's palettes of one box are. Two palettes' colors are matched one to one at the least total distance on
// the metric (identify.js's recallDistance); their sameness is the count of colors with their counterpart closer than
// SAMENESS_RADIUS. A box's score is the mean over every pair of its seeds: 0 where no palette repeats another's colors,
// the color count where all are one palette. Hue families do not enter it.
// Prints per box and page the score with its 10th and 90th percentiles over the pairs, the mean closest pair and the share
// of palettes keeping the Min distance.
//
//     node data/sameness.js [--seeds 50] [--state "v7|..."] [page.html ...]
// Without a state string, the boxes of hue-boost.js. Pages default to index.html; a change is compared by passing the page
// of `git show <rev>:index.html` saved to a file beside it.

"use strict";
const { loadPage, labOf, recallDistance } = require("./identify.js");
const { BOXES, configOf, boxOfState } = require("./hue-boost.js");

// Of the radii tried, the one that set the pages of two commits furthest apart (evolution.md, Hue families)
const SAMENESS_RADIUS = 3;

// Minimum-cost perfect matching of a square cost matrix (Hungarian, potentials form): the row matched to each column,
// and the matched pairs' costs by column
function matchedCosts(cost) {
	const n = cost.length, u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
	for (let i = 1; i <= n; ++i) {
		p[0] = i;
		let j0 = 0;
		const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
		do {
			used[j0] = true;
			const i0 = p[j0];
			let delta = Infinity, j1 = 0;
			for (let j = 1; j <= n; ++j)
				if (!used[j]) {
					const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
					if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
					if (minv[j] < delta) { delta = minv[j]; j1 = j; }
				}
			for (let j = 0; j <= n; ++j)
				if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
			j0 = j1;
		} while (p[j0] !== 0);
		do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
	}
	const rowOf = Array.from({ length: n }, (_, j) => p[j + 1] - 1);
	return { rowOf, costs: rowOf.map((i, j) => cost[i][j]) };
}

// The sameness of every pair of palettes, each a list of hexes of one count
function samenessOfPairs(palettes) {
	const labs = palettes.map(hexes => hexes.map(labOf)), pairs = [];
	for (let a = 0; a < labs.length; ++a)
		for (let b = a + 1; b < labs.length; ++b)
			pairs.push(matchedCosts(labs[a].map(p => labs[b].map(q => recallDistance(p, q)))).costs.filter(d => d < SAMENESS_RADIUS).length);
	return pairs;
}
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
// The score of a set of palettes
const sameness = palettes => mean(samenessOfPairs(palettes));

function main(args) {
	const option = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 ? args.splice(i, 2)[1] : fallback; };
	const seeds = +option("seeds", 50), state = option("state", null), pages = args.length ? args : ["index.html"];
	const pad = (text, width) => String(text).padStart(width);
	for (const box of state ? [boxOfState(state)] : BOXES) {
		console.log(box.name + ", " + seeds + " seeds\n" + "".padEnd(34) + pad("sameness", 9) + pad("p10", 5) + pad("p90", 5) + pad("closest", 9) + pad("keep", 6));
		for (const pagePath of pages) {
			const page = loadPage(pagePath), cfg = configOf(box, page.CELL_NAMES.length), made = Array.from({ length: seeds }, (_, k) => page.generate({ ...cfg, seed: k + 1 }));
			const pairs = samenessOfPairs(made.map(result => result.colors.map(color => color.hex))).sort((x, y) => x - y);
			console.log(("  " + pagePath).padEnd(34) + pad(mean(pairs).toFixed(2), 9) + pad(pairs[Math.floor(pairs.length / 10)], 5) + pad(pairs[Math.floor(pairs.length * 0.9)], 5)
				+ pad(mean(made.map(result => result.closestApart)).toFixed(2), 9) + pad((100 * made.filter(result => result.closestApart >= cfg.minApart - 1e-6).length / seeds).toFixed(0) + "%", 6));
		}
	}
}

module.exports = { SAMENESS_RADIUS, matchedCosts, samenessOfPairs, sameness };

if (require.main === module)
	main(process.argv.slice(2));
