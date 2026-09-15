#!/usr/bin/env node
// Reads calibrate-cells.html logs: per cell and direction, the largest count of a row across the cell at which
// every neighbour is still distinct, and the largest before any two look same-y, each with the row's hexes.
//
//     node data/fit_cells.js log.json [more.json ...]
//
// Each stop's step is the closest neighbour pair of its row, the hardest pair the judge still passed, bracketed with
// the closest pair of the row one larger, which the judge rejected; under the shipped metric and raw in OKLab. Readings:
//   1. Per cell and direction: both counts and steps, and the same-y over distinct ratio.
//   2. The distinct step in metric units by sector, lightness third, chroma third and direction: constant if the
//      metric is right, a cell's correction factor where it is not.
//   3. The same-y ratio by the same factors, and its spread over cells: a constant ratio is a criterion scale, a
//      ratio moving with the cell a family effect, one moving with the direction a per-direction factor.

"use strict";
const fs = require("fs");
const { labOf, recallDistance, W_L, W_C } = require("./identify.js");

const DIRECTIONS = ["hue", "lightness", "chroma"];
const THIRDS = ["dark", "cusp", "light"], CHROMA_THIRDS = ["dull", "mid", "vivid"];
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const gmean = xs => Math.exp(mean(xs.map(Math.log)));
const rmsLog = xs => Math.sqrt(mean(xs.map(x => Math.log(x) ** 2)));
const fmt = (x, w = 7, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-").padStart(w);

function readLogs(paths) {
	const records = [];
	for (const path of paths) {
		const log = JSON.parse(fs.readFileSync(path, "utf8"));
		if (log.version !== 1)
			throw new Error(path + ": log version " + log.version + ", this script reads 1");
		for (const r of log.records)
			records.push({ ...r, source: path });
	}
	return records;
}

// The smallest neighbour distance along a row, in the shipped metric and raw.
function closestPair(hexes) {
	const labs = hexes.map(labOf);
	let metric = Infinity, raw = Infinity;
	for (let k = 1; k < labs.length; ++k) {
		metric = Math.min(metric, recallDistance(labs[k - 1], labs[k], W_L, W_C));
		raw = Math.min(raw, Math.hypot(...labs[k].map((v, i) => v - labs[k - 1][i])));
	}
	return { metric, raw };
}

// A stop's step: the threshold lies between the closest pair of the row accepted and that of the row one larger,
// rejected, so the midpoint of the two. Not their geometric mean: in a sliver of a cell the rejected row's closest
// pair can be two identical 8-bit colors, distance zero. A stop at one color has no accepted pair: the rejected
// row's pair, the cell's whole span, is an upper bound, marked as such.
function stepOf(stop) {
	if (!stop)
		return null;
	const above = closestPair(stop.above);
	if (stop.count === 1)
		return { count: 1, metric: above.metric, raw: above.raw, bound: true };
	const at = closestPair(stop.hexes);
	return { count: stop.count, metric: (at.metric + above.metric) / 2, raw: (at.raw + above.raw) / 2, bound: false };
}

// The geometric mean of a value over the rows a key selects, per key value, as one printed line.
function byFactor(rows, label, keys, keyOf, value) {
	const groups = keys.map((_, k) => rows.filter(r => keyOf(r) === k).map(value).filter(Number.isFinite));
	console.log("  " + label.padEnd(10) + keys.map((name, k) => String(name).padStart(7)).join(""));
	console.log("  " + "".padEnd(10) + groups.map(g => fmt(g.length ? gmean(g) : NaN, 7)).join(""));
	console.log("  " + "cells".padEnd(10) + groups.map(g => String(g.length).padStart(7)).join(""));
}

function main(args) {
	if (!args.length) {
		console.error("usage: node data/fit_cells.js log.json [more.json ...]");
		process.exit(1);
	}
	const records = readLogs(args);
	const rows = records.filter(r => r.distinct || r.varied).map(r => ({ ...r, d: stepOf(r.distinct), v: stepOf(r.varied) }));
	const sectors = Math.max(...records.map(r => r.sector)) + 1;
	console.log(records.length + " trials over " + args.length + " log(s), " + rows.length + " with a stop, " + (records.length - rows.length) + " skipped; "
		+ sectors + " sectors; per direction " + DIRECTIONS.map(d => d + " " + rows.filter(r => r.direction === d).length).join(", "));

	console.log("\nper cell and direction: count and step at each stop, the step the smallest neighbour distance, metric and raw OKLab; ratio same-y over distinct."
		+ "\nA stop at 1 color prints the cell's span with <, an upper bound on the step; bounds count in no mean.");
	console.log("  sector hues        light chroma direction   distinct n  metric    raw   same-y n  metric    raw   ratio");
	rows.sort((p, q) => p.sector - q.sector || p.light - q.light || p.chroma - q.chroma || DIRECTIONS.indexOf(p.direction) - DIRECTIONS.indexOf(q.direction));
	for (const r of rows) {
		const ratio = r.d && r.v && !r.d.bound && !r.v.bound ? r.v.metric / r.d.metric : NaN;
		const step = s => s ? (s.bound ? "<" : " ") + fmt(s.metric, 7) + fmt(s.raw, 7) : fmt(NaN, 8) + fmt(NaN, 7);
		console.log("  " + String(r.sector + 1).padStart(6) + " " + (r.hues[0] + "-" + r.hues[1]).padEnd(12) + THIRDS[r.light].padEnd(6) + CHROMA_THIRDS[r.chroma].padEnd(7)
			+ r.direction.padEnd(10) + fmt(r.d?.count, 12, 0) + step(r.d) + fmt(r.v?.count, 11, 0) + step(r.v) + fmt(ratio, 8));
	}

	const withD = rows.filter(r => r.d && !r.d.bound), withBoth = rows.filter(r => r.d && r.v && !r.d.bound && !r.v.bound);
	if (withD.length) {
		const all = withD.map(r => r.d.metric);
		console.log("\ndistinct step in metric units: geometric mean " + fmt(gmean(all), 5) + ", spread over cells " + fmt(rmsLog(all.map(x => x / gmean(all))), 5, 3)
			+ " rms log; a cell's value over the mean is its correction factor against the metric");
		byFactor(withD, "direction", DIRECTIONS, r => DIRECTIONS.indexOf(r.direction), r => r.d.metric);
		byFactor(withD, "lightness", THIRDS, r => r.light, r => r.d.metric);
		byFactor(withD, "chroma", CHROMA_THIRDS, r => r.chroma, r => r.d.metric);
		byFactor(withD, "sector", Array.from({ length: sectors }, (_, k) => k + 1), r => r.sector, r => r.d.metric);
	}
	if (withBoth.length) {
		const ratios = withBoth.map(r => r.v.metric / r.d.metric);
		console.log("\nsame-y over distinct: geometric mean " + fmt(gmean(ratios), 5) + ", spread over cells " + fmt(rmsLog(ratios.map(x => x / gmean(ratios))), 5, 3) + " rms log");
		const ratio = r => r.v.metric / r.d.metric;
		byFactor(withBoth, "direction", DIRECTIONS, r => DIRECTIONS.indexOf(r.direction), ratio);
		byFactor(withBoth, "lightness", THIRDS, r => r.light, ratio);
		byFactor(withBoth, "chroma", CHROMA_THIRDS, r => r.chroma, ratio);
		byFactor(withBoth, "sector", Array.from({ length: sectors }, (_, k) => k + 1), r => r.sector, ratio);
		// The spread left once each factor's means are taken out, one factor at a time: the factor that removes
		// the most is where the ratio lives.
		console.log("  spread left after removing a factor's means, rms log:");
		for (const [label, keyOf] of [["direction", r => r.direction], ["lightness", r => r.light], ["chroma", r => r.chroma], ["sector", r => r.sector], ["cell", r => r.sector + " " + r.light + " " + r.chroma]]) {
			const groups = new Map();
			for (const r of withBoth)
				groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), ratio(r)]);
			const residual = withBoth.map(r => ratio(r) / gmean(groups.get(keyOf(r))));
			console.log("    " + label.padEnd(10) + fmt(rmsLog(residual), 6, 3));
		}
	}
}

main(process.argv.slice(2));
