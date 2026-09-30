#!/usr/bin/env node
// Fits HUE_BOOST_RANGES in index.html toward even color counts over hue sectors: the page's generator over fixed seeds in
// a few boxes, each sector's mean count per palette against an even share of the sectors the box holds. The boost is one
// range per sector, a hard step between sectors. A step moves each sector's log boost by the log of its count's
// shortfall, damped: a hue's room goes as its boost. The boost stays within BOOST_RANGE, so a sector with little room is
// not crammed.
// Prints each box's counts before and after, the palettes' worst identified color and closest pair, and the ranges to paste.
//
//     node data/fit_hue_boost.js [--steps 12] [--seeds 40] [page.html]

"use strict";
const path = require("path");
const { loadPage } = require("./identify.js");
const { SECTORS, BOXES, sectorOf, configOf, rangesText } = require("./hue-boost.js");

const BOOST_RANGE = [0.5, 2];
// A sector the unboosted generator gives less than this many colors a palette is not in the box's target
const HELD = 0.25;
const DAMPING = 0.7;
// The ranges of a log boost per sector
const rangesOf = logs => SECTORS.map(([, from], s) => ({ from, to: SECTORS[(s + 1) % SECTORS.length][1], boost: Math.exp(logs[s]), ramp: 0 }));

function main(args) {
	let steps = 12, seeds = 40, pagePath = path.join(__dirname, "..", "index.html");
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--steps")
			steps = +args[++i];
		else if (args[i] === "--seeds")
			seeds = +args[++i];
		else if (args[i].endsWith(".html"))
			pagePath = args[i];
		else
			throw new Error("unknown option " + args[i]);
	}
	const configs = BOXES.map(box => configOf(box, loadPage(pagePath).CELL_NAMES.length));

	// Mean count per sector a palette, mean worst identified color and closest pair, over the seeds, for each box
	const measure = logs => {
		const page = loadPage(pagePath, { hueBoostRanges: rangesOf(logs) });
		return configs.map(cfg => {
			const counts = Array(SECTORS.length).fill(0);
			let worstIdentified = 0, closestApart = 0;
			for (let seed = 1; seed <= seeds; ++seed) {
				const result = page.generate({ ...cfg, seed });
				for (const color of result.colors)
					++counts[sectorOf(color.lch[2])];
				worstIdentified += result.worstIdentified / seeds;
				closestApart += result.closestApart / seeds;
			}
			return { counts: counts.map(n => n / seeds), worstIdentified, closestApart };
		});
	};
	const show = (label, results) => {
		console.log(label);
		results.forEach((r, b) => console.log("  " + BOXES[b].name.padEnd(28) + SECTORS.map(([name], s) => name + " " + r.counts[s].toFixed(2)).join("  ")
			+ "  | worst identified " + r.worstIdentified.toFixed(3) + ", closest pair " + r.closestApart.toFixed(1)));
	};

	let logs = Array(SECTORS.length).fill(0), results = measure(logs);
	const before = results;
	const held = results.map(r => r.counts.map(n => n >= HELD));
	show("unboosted", results);
	for (let step = 1; step <= steps; ++step) {
		logs = logs.map((log, s) => {
			let pull = 0, weight = 0;
			results.forEach((r, b) => {
				if (!held[b][s])
					return;
				const target = configs[b].count / held[b].filter(Boolean).length;
				pull += BOXES[b].weight * Math.log(target / Math.max(r.counts[s], 0.05));
				weight += BOXES[b].weight;
			});
			return Math.min(Math.log(BOOST_RANGE[1]), Math.max(Math.log(BOOST_RANGE[0]), log + (weight ? DAMPING * pull / weight : 0)));
		});
		results = measure(logs);
		console.log("step " + step + ": boost at centres " + SECTORS.map(([name], s) => name + " " + Math.exp(logs[s]).toFixed(2)).join(" "));
	}
	show("unboosted", before);
	show("boosted", results);
	console.log(rangesText(rangesOf(logs)));
}

main(process.argv.slice(2));
