#!/usr/bin/env node
// Reads calibrate-hue-steps.html logs holding hue, lightness and chroma steps at the same anchors, and gives the
// metric's lightness and chroma weights per hue: at an anchor, one meaningful step is one criterion in every
// direction, so the weight is the hue step over the lightness or chroma step, each in OKLab units.
//
//     node data/fit_step_weights.js log.json [more.json ...]
//
// Per anchor: the step in each direction, the geometric mean of its picked sides; the weights against the shipped
// W_L and W_C. The hue step is taken in the shipped hue warp, where the metric's hue term lives, and raw. Then the
// weights per 30 degree bin, their spread over the anchors, and the noise per direction: right over left within a
// trial, and the step against the anchor's mean across rounds. A side the run cut short before the pick is null
// in the log and counts nowhere.

"use strict";
const fs = require("fs");
const { labOf, warpedLab, W_L, W_C } = require("./identify.js");

const DIRECTIONS = ["hue", "lightness", "chroma"];
const chromaOf = lab => Math.hypot(lab[1], lab[2]);
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const gmean = xs => Math.exp(mean(xs.map(Math.log)));
const rmsLog = xs => Math.sqrt(mean(xs.map(x => Math.log(x) ** 2)));
const fmt = (x, w = 7, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-").padStart(w);

function readLogs(paths) {
	const records = [];
	for (const path of paths) {
		const log = JSON.parse(fs.readFileSync(path, "utf8"));
		if (log.version !== 2)
			throw new Error(path + ": log version " + log.version + ", this script reads 2");
		for (const r of log.records)
			records.push({ ...r, direction: r.direction ?? "hue", source: path });
	}
	return records;
}

// A side's step in OKLab units between the anchor and the pick: for hue the ab chord, raw and in the shipped
// warp; for lightness and chroma the difference in that coordinate, the same in both.
function stepOf(record, side) {
	const hex = record[side + "Hex"];
	if (!hex)
		return null;
	const a = labOf(record.anchorHex), p = labOf(hex);
	if (record.direction === "lightness")
		return { raw: Math.abs(p[0] - a[0]), warped: Math.abs(p[0] - a[0]) };
	if (record.direction === "chroma")
		return { raw: Math.abs(chromaOf(p) - chromaOf(a)), warped: Math.abs(chromaOf(p) - chromaOf(a)) };
	const wa = warpedLab(a), wp = warpedLab(p);
	return { raw: Math.hypot(p[1] - a[1], p[2] - a[2]), warped: Math.hypot(wp[1] - wa[1], wp[2] - wa[2]) };
}

function main(args) {
	if (!args.length) {
		console.error("usage: node data/fit_step_weights.js log.json [more.json ...]");
		process.exit(1);
	}
	const records = readLogs(args).filter(r => r.leftHex || r.rightHex);
	// Per anchor and direction: every picked side's step, and per trial the right over left ratio.
	const anchors = new Map();
	for (const r of records) {
		const key = r.anchor, at = anchors.get(key) ?? { anchor: r.anchor, hex: r.anchorHex, sides: { hue: [], lightness: [], chroma: [] }, trials: { hue: [], lightness: [], chroma: [] } };
		const left = stepOf(r, "left"), right = stepOf(r, "right");
		for (const s of [left, right])
			if (s)
				at.sides[r.direction].push(s);
		at.trials[r.direction].push({ left, right });
		anchors.set(key, at);
	}
	const rows = [...anchors.values()].sort((p, q) => p.anchor - q.anchor);
	const stepAt = (row, direction, which) => row.sides[direction].length ? gmean(row.sides[direction].map(s => s[which])) : NaN;
	console.log(records.length + " trials over " + args.length + " log(s), " + rows.length + " anchors; per direction "
		+ DIRECTIONS.map(d => d + " " + records.filter(r => r.direction === d).length).join(", "));

	console.log("\nper anchor: the step in OKLab units per direction, the hue step raw and in the shipped warp; the weights are the warped hue"
		+ "\nstep over the lightness or chroma step, shipped W_L " + W_L + " and W_C " + W_C);
	console.log("  anchor  hex      hue raw  warped   light  chroma      W_L    W_C");
	const weights = { lightness: [], chroma: [] };
	for (const row of rows) {
		const hue = stepAt(row, "hue", "warped"), light = stepAt(row, "lightness", "raw"), chroma = stepAt(row, "chroma", "raw");
		const wL = hue / light, wC = hue / chroma;
		if (Number.isFinite(wL))
			weights.lightness.push({ anchor: row.anchor, w: wL });
		if (Number.isFinite(wC))
			weights.chroma.push({ anchor: row.anchor, w: wC });
		console.log("  " + fmt(row.anchor, 6, 1) + "  " + row.hex + fmt(stepAt(row, "hue", "raw")) + fmt(hue, 8) + fmt(light, 8) + fmt(chroma, 8) + "   " + fmt(wL, 6) + fmt(wC, 7));
	}

	for (const [direction, shipped] of [["lightness", W_L], ["chroma", W_C]]) {
		const ws = weights[direction];
		if (!ws.length) {
			console.log("\nno " + direction + " steps at an anchor with hue steps");
			continue;
		}
		console.log("\n" + direction + " weight over " + ws.length + " anchors: geometric mean " + fmt(gmean(ws.map(x => x.w)), 5) + ", shipped " + shipped
			+ ", spread over anchors " + fmt(rmsLog(ws.map(x => x.w / gmean(ws.map(y => y.w)))), 5, 3) + " rms log");
		const bins = Array.from({ length: 12 }, (_, b) => ws.filter(x => Math.floor(x.anchor / 30) === b).map(x => x.w));
		console.log("  bin start " + bins.map((_, b) => String(b * 30).padStart(6)).join(""));
		console.log("  weight    " + bins.map(b => fmt(b.length ? gmean(b) : NaN, 6)).join(""));
		console.log("  anchors   " + bins.map(b => String(b.length).padStart(6)).join(""));
	}

	console.log("\nnoise per direction, rms log ratio");
	for (const d of DIRECTIONS) {
		const both = rows.flatMap(row => row.trials[d]).filter(t => t.left && t.right);
		const acrossRounds = rows.flatMap(row => {
			const steps = row.trials[d].filter(t => t.left && t.right).map(t => (t.left.raw + t.right.raw) / 2);
			return steps.length > 1 ? steps.map(s => s / gmean(steps)) : [];
		});
		console.log("  " + d.padEnd(10) + " right over left within a trial " + fmt(both.length ? rmsLog(both.map(t => t.right.raw / t.left.raw)) : NaN, 6, 3)
			+ " over " + both.length + " trials" + (acrossRounds.length ? "; step over the anchor's mean across rounds " + fmt(rmsLog(acrossRounds), 6, 3) : ""));
	}
}

main(process.argv.slice(2));
