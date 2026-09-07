#!/usr/bin/env node
// Reads calibrate-hue-steps.html logs and turns the steps into a hue density, compared with the
// HUE_DENSITY the page and identify.js carry.
//
// A step is the span from the left pick to the right pick around an anchor: two minimal meaningful
// differences, the first swatch each side that reads as a different color, past mere detectability.
// Every trial is one sample: its criterion is a random factor on both its sides, so only the two sides
// of one trial share a criterion. Each side is one observation of the local step, placed at the
// midpoint of its span, delta(h) in OKLab degrees. Two densities follow, each a kernel average of the
// log over the sides, normalized to mean 1 over the circle like HUE_DENSITY:
//
//     A(h) = 1 / delta(h)              equal perceived steps take equal warped angle
//     B(h) = 1 / (C(h) delta(h))       equal perceived steps take equal warped chord, C the anchor's chroma
//
// A is the criterion the table was authored under; B is what the metric implies, its hue term being
// the ab chord. The last blocks report how constant a side is under each reading, as the coefficient
// of variation over the sides, and the noise: right over left within a trial, the same within an anchor
// across rounds (equal to the first means no asymmetry repeats), the step against the anchor's mean
// across rounds (the criterion's spread), and each anchor's left side against the previous anchor's
// right side, which cover nearly the same hues.
//
// Version 2 logs step hue alone at one lightness and chroma. Version 1 logs walked the sRGB cube's
// saturated edges, where near a primary the codes move lightness and chroma and hardly any hue, so
// each side carries its hue share: the hue term's part of the anchor-to-pick squared weighted distance.
// Sides under the cut count in no density, CV or noise line; the table still prints them.
//
// A version 2 side the gamut cut short before the pick is null in the log, with the degrees the run had
// there: the step is at least that, so the density there is at most the density of that step. The fit
// prints these bounds against its own curve; they count in no density.
//
//     node data/fit_hue_steps.js [--share 0.7] log.json [more.json ...]
//     node data/fit_hue_steps.js --table a|b log.json ...    the density as 360 values, for pasting

"use strict";
const fs = require("fs");
const { labOf, W_L, W_C, HUE_DENSITY } = require("./identify.js");

const SHARE_CUT = 0.7;
const KERNEL_WIDTH = 4;   // degrees, about half the anchor spacing
const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
const chromaOf = lab => Math.hypot(lab[1], lab[2]);
const turn = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
// The hue term's part of the pair's squared weighted distance, the terms as in weightedDistance.
function hueShare(p, q) {
	const dL = (p[0] - q[0]) * W_L, dC = (chromaOf(p) - chromaOf(q)) * W_C;
	const dH = (chromaOf(p) + chromaOf(q)) / 2 * turn(hueOf(p), hueOf(q)) * Math.PI / 180;
	return dH * dH / (dL * dL + dC * dC + dH * dH);
}
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const spread = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
const tableAt = h => {
	const at = Math.floor(h), f = h - at;
	return HUE_DENSITY[at % 360] * (1 - f) + HUE_DENSITY[(at + 1) % 360] * f;
};

function readLogs(paths) {
	const records = [];
	for (const path of paths) {
		const log = JSON.parse(fs.readFileSync(path, "utf8"));
		if (log.version !== 1 && log.version !== 2)
			throw new Error(path + ": log version " + log.version + ", this script reads 1 and 2");
		for (const r of log.records)
			records.push({ ...r, source: path });
	}
	return records;
}

// One trial per record, in time order: the anchor's hue and chroma, each side's step in degrees and its
// hue share, null on a clipped side with the bound in atLeastLeft/Right, and the round, the record's rank
// among its file's records at that anchor. Every hue is read back from the hex shown, so a version 2 step
// carries the 8-bit rounding the eye saw.
function trialsOf(records) {
	const trials = records.map(r => {
		const lab = labOf(r.anchorHex), hue = hueOf(lab);
		const side = hex => hex ? labOf(hex) : null;
		const left = side(r.leftHex), right = side(r.rightHex);
		return { source: r.source, at: r.at, hue, chroma: chromaOf(lab), hex: r.anchorHex,
			degreesLeft: left && turn(hueOf(left), hue), degreesRight: right && turn(hueOf(right), hue),
			shareLeft: left && hueShare(left, lab), shareRight: right && hueShare(right, lab),
			atLeastLeft: left ? null : r.inGamut.left, atLeastRight: right ? null : r.inGamut.right };
	}).sort((a, b) => a.at < b.at ? -1 : 1);
	const seen = new Map();
	for (const t of trials) {
		const key = t.source + " " + t.hex;
		t.round = (seen.get(key) || 0) + 1;
		seen.set(key, t.round);
	}
	return trials;
}

const groupBy = (items, key) => [...items.reduce((m, x) => m.set(key(x), [...(m.get(key(x)) || []), x]), new Map()).values()];

// One observation per picked side at or above the share cut, at the midpoint of its span: the local step there.
const sidesOf = (trials, cut) => trials.flatMap(t => [
	{ hue: (t.hue - t.degreesLeft / 2 + 360) % 360, degrees: t.degreesLeft, chroma: t.chroma, share: t.shareLeft },
	{ hue: (t.hue + t.degreesRight / 2) % 360, degrees: t.degreesRight, chroma: t.chroma, share: t.shareRight }
]).filter(s => s.degrees !== null && s.share >= cut);
const bothPicked = t => t.degreesLeft !== null && t.degreesRight !== null;

// A per-observation value spread over the circle as a Gaussian kernel average of its log, then scaled to
// mean 1 over the 360 degrees; the scale comes along so a bound on the value can be read in the same units.
// The log: a trial's criterion scales both its sides, so the noise is multiplicative.
function circleOf(sides, value) {
	const out = new Array(360);
	for (let h = 0; h < 360; ++h) {
		let weight = 0, sum = 0;
		for (const s of sides) {
			const k = Math.exp(-0.5 * (turn(h, s.hue) / KERNEL_WIDTH) ** 2);
			weight += k;
			sum += k * Math.log(value(s));
		}
		out[h] = Math.exp(sum / weight);
	}
	const scale = mean(out);
	return { curve: out.map(v => v / scale), scale };
}

// One row per anchor for the table, means over its trials' picked sides; the asymmetry is the geometric mean
// of right over left. A value with nothing behind it is NaN and prints as such.
function anchorRows(trials) {
	return groupBy(trials, t => t.hex).map(g => {
		const whole = g.filter(bothPicked), steps = whole.map(t => t.degreesLeft + t.degreesRight);
		const lefts = g.filter(t => t.degreesLeft !== null), rights = g.filter(t => t.degreesRight !== null);
		return { hue: g[0].hue, chroma: g[0].chroma, hex: g[0].hex, trials: g.length,
			degreesLeft: mean(lefts.map(t => t.degreesLeft)), degreesRight: mean(rights.map(t => t.degreesRight)),
			shareLeft: mean(lefts.map(t => t.shareLeft)), shareRight: mean(rights.map(t => t.shareRight)),
			step: mean(steps), stepSpread: whole.length > 1 ? spread(steps) : 0,
			asymmetry: Math.exp(mean(whole.map(t => Math.log(t.degreesRight / t.degreesLeft)))) };
	}).sort((a, b) => a.hue - b.hue);
}

const bins = curve => Array.from({ length: 12 }, (_, b) => mean(curve.slice(b * 30, b * 30 + 30)));
const fmt = (x, w = 6, d = 2) => x.toFixed(d).padStart(w);

function main(args) {
	let table = null, cut = SHARE_CUT;
	while (args[0] && args[0].startsWith("--")) {
		if (args[0] === "--table")
			table = args[1];
		else if (args[0] === "--share")
			cut = +args[1];
		else
			throw new Error("unknown option " + args[0]);
		args = args.slice(2);
	}
	const trials = trialsOf(readLogs(args)), sides = sidesOf(trials, cut);
	if (sides.length < 6)
		throw new Error("fewer than six sides with a hue share of " + cut);
	const angle = s => 1 / s.degrees, chord = s => 1 / (s.chroma * s.degrees);
	const { curve: A, scale: scaleA } = circleOf(sides, angle), { curve: B, scale: scaleB } = circleOf(sides, chord);
	if (table) {
		console.log((table === "b" ? B : A).map(v => +v.toFixed(3)).join(", "));
		return;
	}
	const rows = anchorRows(trials);
	// Anchors with both sides in, each with the chord of the previous such anchor's right side over this anchor's left side:
	// the two spans cover nearly the same hues.
	const anchorsBothIn = rows.filter(r => r.shareLeft >= cut && r.shareRight >= cut);
	const overlap = new Map(anchorsBothIn.map((r, i) => {
		const p = anchorsBothIn[(i + anchorsBothIn.length - 1) % anchorsBothIn.length];
		return [r, p.chroma * p.degreesRight / (r.chroma * r.degreesLeft)];
	}));
	console.log(rows.length + " anchors, " + trials.length + " trials; " + sides.length + " of " + 2 * trials.length + " sides at a hue share of " + cut + " or more");
	console.log("   hue  chroma  hex      deg -/+      step deg  +-   r/l  share -/+      A      B  table   A/t   B/t   ovl");
	for (const r of rows) {
		const a = A[Math.round(r.hue) % 360], b = B[Math.round(r.hue) % 360], t = tableAt(r.hue);
		console.log(fmt(r.hue, 6, 1) + fmt(r.chroma, 8, 1) + "  " + r.hex + fmt(r.degreesLeft, 6, 2) + "/" + fmt(r.degreesRight, 6, 2)
			+ fmt(r.step, 10, 2) + fmt(r.stepSpread, 6, 2) + fmt(r.asymmetry) + fmt(r.shareLeft, 7) + "/" + fmt(r.shareRight, 4) + fmt(a) + fmt(b) + fmt(t) + fmt(a / t) + fmt(b / t)
			+ (overlap.has(r) ? fmt(overlap.get(r)) : "      ") + (r.shareLeft < cut ? "  out-" : "") + (r.shareRight < cut ? "  out+" : ""));
	}

	// A clipped side bounds the step from below, so the density from above, in the curves' own units.
	const bounds = trials.flatMap(t => [["left", t.atLeastLeft], ["right", t.atLeastRight]].filter(([, d]) => d !== null).map(([side, degrees]) => ({ ...t, side, degrees })));
	if (bounds.length) {
		console.log("\nclipped sides, the step at least the run's reach, against the fit at that hue");
		for (const b of bounds) {
			const h = Math.round(b.hue) % 360, aMax = angle(b) / scaleA, bMax = chord(b) / scaleB;
			console.log("  hue " + fmt(b.hue, 5, 1) + "  " + b.hex + "  " + b.side.padEnd(5) + " at least " + fmt(b.degrees, 5, 1) + " deg:  A at most " + fmt(aMax, 5)
				+ ", fit " + fmt(A[h], 5) + (A[h] > aMax ? " exceeds" : "") + ";  B at most " + fmt(bMax, 5) + ", fit " + fmt(B[h], 5) + (B[h] > bMax ? " exceeds" : ""));
		}
	}

	console.log("\nper 30 degree bin, mean 1 over the circle");
	console.log("bin start " + Array.from({ length: 12 }, (_, b) => String(b * 30).padStart(6)).join(""));
	for (const [name, curve] of [["A", A], ["B", B], ["table", HUE_DENSITY]])
		console.log(name.padEnd(10) + bins(curve).map(v => fmt(v)).join(""));
	const closeness = curve => mean(curve.map((v, h) => Math.abs(Math.log(v / HUE_DENSITY[h]))));
	console.log("mean |log ratio| to the table: A " + closeness(A).toFixed(3) + ", B " + closeness(B).toFixed(3));

	// Each file and round on its own: files for rounds taken at different settings, rounds for the repeat.
	const rounds = groupBy(trials, t => t.source + " round " + t.round);
	if (rounds.length > 1)
		for (const round of rounds) {
			const own = sidesOf(round, cut);
			console.log("\n" + round[0].source + " round " + round[0].round + ": " + own.length + " sides used");
			if (own.length < 6)
				continue;
			for (const [name, value] of [["A", angle], ["B", chord]])
				console.log(name.padEnd(10) + bins(circleOf(own, value).curve).map(v => fmt(v)).join(""));
		}

	console.log("\nhow constant a side is over the sides, coefficient of variation");
	const cv = values => spread(values) / mean(values);
	const rad = Math.PI / 180;
	console.log("  degrees, no warp             " + fmt(cv(sides.map(s => s.degrees)), 6, 3));
	console.log("  chord, no warp               " + fmt(cv(sides.map(s => s.chroma * s.degrees * rad)), 6, 3));
	console.log("  degrees, warped by the table " + fmt(cv(sides.map(s => tableAt(s.hue) * s.degrees)), 6, 3));
	console.log("  chord, warped by the table   " + fmt(cv(sides.map(s => s.chroma * tableAt(s.hue) * s.degrees * rad)), 6, 3));

	// Rms deviation of a per-trial value from its anchor's mean, over anchors with repeats, corrected for the mean's own
	// share of the spread: equal to the rms over all trials means nothing about the anchor is repeatable.
	const rms = values => Math.sqrt(mean(values.map(v => v * v)));
	const trialsBothIn = trials.filter(t => bothPicked(t) && t.shareLeft >= cut && t.shareRight >= cut);
	const withinAnchor = value => rms(groupBy(trialsBothIn, t => t.hex).filter(g => g.length > 1).flatMap(g => {
		const m = mean(g.map(value)), correction = Math.sqrt(g.length / (g.length - 1));
		return g.map(t => (value(t) - m) * correction);
	}));
	const asymmetry = t => Math.log(t.degreesRight / t.degreesLeft), logStep = t => Math.log(t.degreesLeft + t.degreesRight);
	console.log("\nnoise, rms log ratio");
	console.log("  right side over left side, one trial                       " + fmt(rms(trialsBothIn.map(asymmetry)), 6, 3));
	if (trialsBothIn.length > groupBy(trialsBothIn, t => t.hex).length) {
		console.log("  the same, within an anchor across rounds                   " + fmt(withinAnchor(asymmetry), 6, 3));
		console.log("  step over the anchor's mean step, across rounds            " + fmt(withinAnchor(logStep), 6, 3));
	}
	console.log("  previous anchor's right side over this left side, means    " + fmt(rms([...overlap.values()].map(Math.log)), 6, 3));
}

main(process.argv.slice(2));
