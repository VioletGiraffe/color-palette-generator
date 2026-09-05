#!/usr/bin/env node
// Reads a calibrate-chroma.html log and asks whether the metric's two ab weights hold at every
// chroma. The metric gives a chroma difference a fixed weight W_C and a hue difference a fixed 1;
// CIEDE2000 grows both with chroma and the chroma one about three times faster.
//
// Each axis gets a threshold - the weighted distance at which a pair stops being marked - that runs
// straight in the chroma level: `base + slope * (level - reference)`. A slope is the whole question,
// and fitting one per axis rather than a free threshold per cell is what makes the question
// answerable at this data volume: six free thresholds over twelve judgements each are noisy enough
// that a null observer produces a per-cell difference that looks real.
//
//     node data/fit_chroma.js chroma-log.json [more.json ...]

"use strict";
const fs = require("fs");
const { labOf, weightedDistance, W_L, W_C } = require("./identify.js");

const BASES = Array.from({ length: 25 }, (_, i) => 3 + i * 0.5);
// Threshold units per unit of OKLab chroma. Zero is the metric as it stands.
const SLOPES = Array.from({ length: 25 }, (_, i) => -0.6 + i * 0.05);
const SOFTNESS = [1, 1.5, 2, 3, 4, 6];
const LAPSES = [0.005, 0.02, 0.05];
// Draws of the palettes, resampled whole: the pairs of one palette are judged in one sitting and in
// sight of each other, so a slope interval taken pair by pair reads tighter than it should.
const BOOTSTRAP = 400;
const INTERVAL = 0.9;
// Profile range, in log-likelihood units below the best.
const LL_RANGE = 2;
// CIEDE2000's own slopes over this coordinate, for reference. Its S_C is 1 + 0.045 C and its S_H
// about 1 + 0.015 C in CIELAB chroma, which runs near 2.5 times OKLab's; anchoring each at the
// middle level turns them into these. The factor is approximate, so they are a direction and a
// rough size, not a target to hit.
const PREDICTED = { C: 0.113, H: 0.038 };
const GRADES = ["close", "marginal", "fine"];

function erfc(x) {
	const t = 1 / (1 + 0.3275911 * Math.abs(x));
	const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
	const tail = poly * Math.exp(-x * x);
	return x >= 0 ? tail : 2 - tail;
}
const normalCdf = x => 0.5 * erfc(-x / Math.SQRT2);

const logs = process.argv.slice(2).map(file => JSON.parse(fs.readFileSync(file, "utf8")));
const sessions = logs.flatMap(log => log.sessions || []).filter(s => (s.probes || []).some(p => p.level !== undefined));
if (!sessions.length) {
	console.error("no calibrate-chroma.html log with levelled probes: node data/fit_chroma.js chroma-log.json");
	process.exit(1);
}

const pairKey = (a, b) => Math.min(a, b) + "," + Math.max(a, b);

// Only the probe pairs. A filler pair carries no level and sits far from every rung, so it says
// nothing about where a threshold is and would only weight the fit toward "fine".
const probes = [];
const grounds = new Set(), sizes = new Set();
for (const [index, session] of sessions.entries()) {
	const labs = session.hexes.map(labOf);
	const grade = new Map(session.verdicts.map(v => [pairKey(v.a, v.b), GRADES.indexOf(v.grade)]));
	grounds.add(session.ground || "unrecorded");
	sizes.add(session.swatchPx);
	for (const probe of session.probes)
		probes.push({ session: index, axis: probe.axis, level: probe.level,
			distance: weightedDistance(labs[probe.a], labs[probe.b], W_L, W_C),
			asked: probe.distance, marked: (grade.get(pairKey(probe.a, probe.b)) ?? 2) < 2 });
}

const axes = [...new Set(probes.map(p => p.axis))].sort();
const levels = [...new Set(probes.map(p => p.level))].sort((a, b) => a - b);
const LEVEL_REF = levels.reduce((a, b) => a + b, 0) / levels.length;

console.log("%s palettes, %s probe pairs, %s marked; swatch %s px, ground %s",
	sessions.length, probes.length, probes.filter(p => p.marked).length, [...sizes].join("/"), [...grounds].join("/"));
if (sizes.size > 1)
	console.log("warning: mixed swatch sizes fit one set of thresholds");
if (grounds.size > 1)
	console.log("warning: mixed grounds - a pair marked on the light ground is not the same measurement");

console.log("\nmarked / judged, by axis and level:");
const rungs = [...new Set(probes.map(p => p.asked))].sort((a, b) => a - b);
console.log("  cell        " + rungs.map(r => String(r).padStart(8)).join(""));
for (const axis of axes)
	for (const level of levels) {
		const row = rungs.map(rung => {
			const at = probes.filter(p => p.axis === axis && p.level === level && p.asked === rung);
			return (at.length ? at.filter(p => p.marked).length + "/" + at.length : "-").padStart(8);
		});
		console.log("  " + (axis + "@" + level).padEnd(10) + row.join(""));
	}

// A pair is marked with the chance its distance falls below the axis's threshold at its level,
// blurred by the softness, off a lapse floor.
function logLikelihood(at, base, slope, softness, lapse) {
	let total = 0;
	for (const p of at) {
		const threshold = base + slope * (p.level - LEVEL_REF);
		const chance = lapse / 2 + (1 - lapse) * normalCdf((threshold - p.distance) / softness);
		total += Math.log(Math.max(1e-12, p.marked ? chance : 1 - chance));
	}
	return total;
}

// The best base and slope for one axis, given the shared shape. `slopes` narrows the search, which
// is how the flat model and the slope profile are taken.
function fitAxis(at, softness, lapse, slopes = SLOPES) {
	let best = { ll: -Infinity };
	for (const base of BASES)
		for (const slope of slopes) {
			const ll = logLikelihood(at, base, slope, softness, lapse);
			if (ll > best.ll)
				best = { base, slope, ll };
		}
	return best;
}

// Softness and lapse are shared across axes, so the whole fit is searched over those two and each
// axis solved inside.
function fitAll(sample, slopes = SLOPES) {
	let best = null;
	for (const softness of SOFTNESS)
		for (const lapse of LAPSES) {
			const perAxis = new Map(axes.map(axis => [axis, fitAxis(sample.filter(p => p.axis === axis), softness, lapse, slopes)]));
			const ll = [...perAxis.values()].reduce((sum, fit) => sum + fit.ll, 0);
			if (!best || ll > best.ll)
				best = { perAxis, softness, lapse, ll };
		}
	return best;
}

const best = fitAll(probes);
const flat = fitAll(probes, [0]);

console.log("\nthreshold in weighted deltaE against chroma level, per axis (softness %s, lapse %s):", best.softness, best.lapse);
for (const axis of axes) {
	const fit = best.perAxis.get(axis);
	console.log("  %s  at level %s: %s, at level %s: %s   slope %s per chroma unit",
		axis, levels[0], (fit.base + fit.slope * (levels[0] - LEVEL_REF)).toFixed(1),
		levels[levels.length - 1], (fit.base + fit.slope * (levels[levels.length - 1] - LEVEL_REF)).toFixed(1),
		fit.slope.toFixed(2));
}

// The slope profile: the whole fit refitted with this axis pinned at each slope, everything else
// free. Its range is what the data allows, and whether that range holds zero is the answer.
console.log("\nslope profile per axis: value, log-likelihood below the best");
for (const axis of axes) {
	const marks = [];
	for (const slope of SLOPES) {
		let bestAt = -Infinity;
		for (const softness of SOFTNESS)
			for (const lapse of LAPSES) {
				const own = fitAxis(probes.filter(p => p.axis === axis), softness, lapse, [slope]);
				const rest = axes.filter(other => other !== axis)
					.reduce((sum, other) => sum + fitAxis(probes.filter(p => p.axis === other), softness, lapse).ll, 0);
				bestAt = Math.max(bestAt, own.ll + rest);
			}
		marks.push({ slope, drop: bestAt - best.ll });
	}
	const within = marks.filter(m => m.drop > -LL_RANGE).map(m => m.slope);
	console.log("  " + axis + ": " + marks.filter((_, i) => i % 3 === 0).map(m => m.slope.toFixed(2) + " " + m.drop.toFixed(1)).join("   "));
	console.log("     range at %s units: %s to %s;  zero is %s;  CIEDE2000 would be about %s",
		LL_RANGE, Math.min(...within).toFixed(2), Math.max(...within).toFixed(2),
		Math.min(...within) > 0 || Math.max(...within) < 0 ? "outside it" : "inside it", PREDICTED[axis] ?? "-");
}

console.log("\nboth slopes forced to zero, the metric as it stands: %s log-likelihood units worse",
	(best.ll - flat.ll).toFixed(1));
console.log("(two extra parameters, so about %s units is the floor for taking the slopes seriously)", LL_RANGE);

// The contrast the levels are here to make, and the one the shared hue set per level protects: a
// chroma slope steeper than the hue slope is the chroma weight alone being wrong, which a scalar on
// the whole distance cannot express. Bootstrapped over palettes, since the slopes share sessions.
if (axes.includes("C") && axes.includes("H")) {
	const bySession = sessions.map((_, i) => probes.filter(p => p.session === i));
	const gaps = [];
	for (let draw = 0; draw < BOOTSTRAP; ++draw) {
		const sample = [];
		for (let n = 0; n < bySession.length; ++n)
			sample.push(...bySession[Math.floor(Math.random() * bySession.length)]);
		const fit = fitAll(sample);
		gaps.push(fit.perAxis.get("C").slope - fit.perAxis.get("H").slope);
	}
	gaps.sort((a, b) => a - b);
	const at = q => gaps[Math.min(gaps.length - 1, Math.max(0, Math.round(q * (gaps.length - 1))))];
	const [lo, hi] = [at((1 - INTERVAL) / 2), at((1 + INTERVAL) / 2)];
	console.log("\nchroma slope less hue slope: %s   %s%% interval over %s palette draws: %s to %s",
		(best.perAxis.get("C").slope - best.perAxis.get("H").slope).toFixed(2),
		Math.round(INTERVAL * 100), BOOTSTRAP, lo.toFixed(2), hi.toFixed(2));
	console.log("  zero is %s the interval;  CIEDE2000 would be about %s",
		lo > 0 || hi < 0 ? "outside" : "inside", (PREDICTED.C - PREDICTED.H).toFixed(2));
}
