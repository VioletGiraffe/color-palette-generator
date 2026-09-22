#!/usr/bin/env node
// Reads calibrate-boundaries.html logs: per boundary hue, the mean grade (too close 0, marginal 1, fine 2) by turn and
// offset, then the smallest turn graded fine on average at each offset, with the pair's distance on the metric at that
// turn. A straddling pair (offset 0) graded fine at a smaller turn than the pairs to either side (offsets -1 and 1)
// is the boundary's excess: the metric distance the pairs beside it need, less the distance the straddling pair had.
// A sweep deal has no boundaries: its table is the mean grade by centre hue and turn.
// A mixed deal validates the metric: per kind of pair, the grades by band of the dealt distance and by hue range and
// lightness window, then how well the metric's distance and plain OKLab deltaE rank the verdicts (AUC of not-close
// against close and of fine against the rest).
//
//     node data/fit_boundaries.js log.json [more.json ...]
//
// The logs given must be rounds of one deal; fit_hue_density.js pools logs across deals.

"use strict";
const fs = require("fs");
const { labOf, recallDistance } = require("./identify.js");

const GRADES = ["close", "marginal", "fine"];
const FINE = 1.5;
const fmt = (x, w = 6, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-").padStart(w);

function readLogs(paths) {
	const records = [];
	let deal = null;
	for (const p of paths) {
		const log = JSON.parse(fs.readFileSync(p, "utf8"));
		if (log.version !== 1)
			throw new Error(p + ": log version " + log.version + ", this script reads 1");
		deal ??= log.deal;
		records.push(...log.records);
	}
	return { deal, records };
}

function main(args) {
	if (!args.length) {
		console.error("usage: node data/fit_boundaries.js log.json [more.json ...]");
		process.exit(1);
	}
	const { deal, records } = readLogs(args);
	const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
	if (deal.axis === "mixed") {
		// Round 16's stamp: one box of every hue, mixed pairs, bands on the metric
		const cells = deal.box ? { ranges: [[0, 360]], windows: [deal.box.light], share: deal.box.share, kinds: ["mixed"], by: "metric", distances: [deal.distances] } : deal;
		const spans = list => list.map(span => span.join(" to ")).join(", "), measure = cells.by === "oklab" ? "OKLab deltaE" : "the metric";
		console.log(records.length + " verdicts; mixed deal, hues " + spans(cells.ranges) + ", lightness " + spans(cells.windows) + " of the cusp, chroma " + cells.share.join(" to ") + "% of the reach, seed " + deal.seed);
		const within = (h, [from, to]) => ((h - from) % 360 + 360) % 360 <= to - from;
		const rows = records.map(r => { const a = labOf(r.a), b = labOf(r.b); return { g: GRADES.indexOf(r.grade), kind: r.kind ?? "mixed", window: r.window ?? cells.windows[0], range: cells.ranges.find(range => within(r.hues[0], range)),
			metric: recallDistance(a, b), oklab: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) }; });
		const tally = own => fmt(own.length, 4, 0) + fmt(own.length ? mean(own.map(r => r.g)) : NaN) + "   " + GRADES.map((_, g) => own.filter(r => r.g === g).length).join(" / ");
		const auc = (own, key, positive) => {
			let n = 0, s = 0;
			for (const p of own)
				for (const q of own)
					if (positive(p) && !positive(q)) { ++n; s += p[key] > q[key] ? 1 : p[key] === q[key] ? 0.5 : 0; }
			return s / n;
		};
		cells.kinds.forEach((kind, k) => {
			const ofKind = rows.filter(r => r.kind === kind), [low, high] = cells.distances[k], width = (high - low) / deal.bands;
			console.log("\n" + kind + " pairs, distance band on " + measure + ": n, mean grade, close / marginal / fine");
			for (let band = 0; band < deal.bands; ++band)
				console.log(fmt(low + band * width, 5, 1) + " to" + fmt(low + (band + 1) * width, 5, 1) + ":" + tally(ofKind.filter(r => Math.floor((r[cells.by] - low) / width) === band)));
			if (cells.ranges.length * cells.windows.length > 1) {
				console.log("hues, lightness: n, mean grade, close / marginal / fine, mean distance on the metric");
				for (const range of cells.ranges)
					for (const window of cells.windows) {
						const own = ofKind.filter(r => r.range === range && r.window.join() === window.join());
						console.log((range.join(" to ") + ", " + window.join(" to ") + ":").padEnd(24) + tally(own) + fmt(mean(own.map(r => r.metric)), 7, 1));
					}
			}
			for (const [label, key] of [["the metric", "metric"], ["OKLab deltaE", "oklab"]])
				console.log(label + ": AUC not-close " + auc(ofKind, key, r => r.g >= 1).toFixed(3) + ", fine " + auc(ofKind, key, r => r.g >= 2).toFixed(3));
		});
		return;
	}
	const turns = [...new Set(deal.turns)], offsets = deal.offsets;
	console.log(records.length + " verdicts; deal version " + (deal.version ?? 1) + ", lightness " + deal.light + ", chroma " + deal.chroma + "% of the reach, placement " + (deal.placement ?? "shared"));
	if (deal.axis === "lightness" || deal.axis === "chroma") {
		const table = (label, key, keys) => {
			console.log("\n" + label + ": mean grade (n) by " + key + " down and " + deal.axis + " turn across");
			console.log("  " + key.padStart(6) + " " + turns.map(t => String(t).padStart(10)).join(""));
			for (const k of keys) {
				const cells = turns.map(turn => records.filter(r => r.turn === turn && r[key] === k).map(r => GRADES.indexOf(r.grade)));
				console.log("  " + String(k).padStart(6) + " " + cells.map(g => g.length ? (fmt(mean(g), 5) + " (" + g.length + ")").padStart(10) : "-".padStart(10)).join(""));
			}
		};
		table(deal.axis + " pairs over the centres", "hue", [...new Set(records.map(r => r.hue))].sort((a, b) => a - b));
		table(deal.axis + " pairs over the hues", "centre", deal.centres);
		return;
	}
	if (deal.sweep) {
		console.log("\nsweep every " + deal.sweep + " degrees: mean grade (n) by centre hue down and turn across");
		console.log("  centre " + turns.map(t => String(t).padStart(10)).join(""));
		const centres = [...new Set(records.map(r => r.centre))].sort((a, b) => a - b);
		for (const centre of centres) {
			const cells = turns.map(turn => records.filter(r => r.turn === turn && r.centre === centre).map(r => GRADES.indexOf(r.grade)));
			console.log("  " + String(centre).padStart(6) + " " + cells.map(g => g.length ? (fmt(mean(g), 5) + " (" + g.length + ")").padStart(10) : "-".padStart(10)).join(""));
		}
		return;
	}
	for (const boundary of Object.keys(deal.boundaries)) {
		const own = records.filter(r => r.boundary === boundary);
		if (!own.length)
			continue;
		console.log("\n" + boundary + " at " + deal.boundaries[boundary] + " degrees: mean grade (n) by turn down and offset across; a pair straddles at offset 0");
		console.log("  turn " + offsets.map(o => String(o).padStart(10)).join(""));
		const threshold = {};
		for (const turn of turns) {
			const cells = offsets.map(offset => own.filter(r => r.turn === turn && r.offset === offset).map(r => GRADES.indexOf(r.grade)));
			console.log("  " + String(turn).padStart(4) + " " + cells.map(g => g.length ? (fmt(mean(g), 5) + " (" + g.length + ")").padStart(10) : "-".padStart(10)).join(""));
			cells.forEach((g, k) => { if (g.length && mean(g) >= FINE && threshold[offsets[k]] === undefined) threshold[offsets[k]] = turn; });
		}
		// The metric's distance for a pair of the boundary at a turn, from the dealt hexes.
		const distanceAt = (turn, offset) => { const r = own.find(x => x.turn === turn && x.offset === offset); return r ? recallDistance(labOf(r.a), labOf(r.b)) : NaN; };
		console.log("  first turn graded fine: " + offsets.map(o => o + ": " + (threshold[o] === undefined ? "none" : threshold[o] + " deg, " + fmt(distanceAt(threshold[o], o), 4, 1) + " on the metric")).join("; "));
		const straddle = threshold[0], beside = offsets.filter(o => Math.abs(o) >= 1 && threshold[o] !== undefined);
		if (straddle !== undefined && beside.length)
			console.log("  excess at the boundary: " + fmt(mean(beside.map(o => distanceAt(threshold[o], o))) - distanceAt(straddle, 0), 5, 1) + " metric units, pairs beside it against the straddling pair");
	}
}

main(process.argv.slice(2));
