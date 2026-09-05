#!/usr/bin/env node
// Reads a calibrate-hue.html log and fits the three position terms together, because separately
// each one absorbs the others: the chroma round's apparent chroma slope turned out to be its hue
// composition, and the lightness round's exponent is part hue for the same reason.
//
// The model is a gain on the weighted distance, the form `apart2` would carry:
//
//     effective = distance * (1 - amplitude * cos(hue - centre)) * (relativeL / 50) ^ qL * (chroma / CHROMA_REF) ^ qC
//
// with one threshold, softness and lapse shared. A gain above one means the pair reads further
// apart than the metric says, so that region needs less separation; below one, more. Only the
// shape of the hue term is identifiable against the threshold, not its level, which is why it is
// written as a trough about one rather than as a free gain per sector.
//
//     node data/fit_hue.js hue-log.json [more.json ...]

"use strict";
const fs = require("fs");
const { labOf, relativePosition, weightedDistance, W_L, W_C } = require("./identify.js");

const SECTORS = 6;
const LIGHTNESS_REF = 50, CHROMA_REF = 10;
const LIGHTNESS_FLOOR = 5, CHROMA_FLOOR = 1.5;
// Coordinate ascent: too many parameters for one grid, and each is cheap to sweep with the others held.
// The hue term as one smooth trough rather than a free gain per sector: `1 - amplitude * cos(hue - centre)`
// peaks once and dips once, which is the shape a discrimination minimum has. Six free gains cost
// five parameters and, on a planted lightness effect with no hue effect at all, absorb five log-
// likelihood units of it - the lightness exponent then reads 0.20 where 0.45 was planted. Two
// parameters do not have the freedom to do that. The six sectors are still printed, read off the trough.
const AMPLITUDES = Array.from({ length: 25 }, (_, i) => i * 0.02);
const CENTRES = Array.from({ length: 24 }, (_, i) => i * 15);
const EXPONENTS = Array.from({ length: 33 }, (_, i) => -0.8 + i * 0.05);
const THRESHOLDS = Array.from({ length: 41 }, (_, i) => 2 + i * 0.5);
const SOFTNESS = [1, 1.5, 2, 3, 4, 6];
const LAPSES = [0.005, 0.02, 0.05, 0.1];
const PASSES = 12;
// Palettes resampled whole: pairs judged in one sitting are not independent observations.
const BOOTSTRAP = 300;
const INTERVAL = 0.9, LL_RANGE = 2;
const GRADES = ["close", "marginal", "fine"];

function erfc(x) {
	const t = 1 / (1 + 0.3275911 * Math.abs(x));
	const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
	const tail = poly * Math.exp(-x * x);
	return x >= 0 ? tail : 2 - tail;
}
const normalCdf = x => 0.5 * erfc(-x / Math.SQRT2);
const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;

const logs = process.argv.slice(2).map(file => JSON.parse(fs.readFileSync(file, "utf8")));
// Any log carrying probe pairs will do, not only calibrate-hue.html's: a probe that records no
// sector gets one from its own hue, and the model is a gain on the distance whatever axis the pair
// was stepped along. The lightness round's log pools in on those terms, which is most of the
// lightness leverage.
const sessions = logs.flatMap(log => log.sessions || []).filter(s => (s.probes || []).length);
if (!sessions.length) {
	console.error("no log with probe pairs: node data/fit_hue.js hue-log.json [more.json ...]");
	process.exit(1);
}
const pairKey = (a, b) => Math.min(a, b) + "," + Math.max(a, b);

const probes = [];
const grounds = new Set(), sizes = new Set();
for (const [index, session] of sessions.entries()) {
	const labs = session.hexes.map(labOf), rel = labs.map(relativePosition);
	const grade = new Map(session.verdicts.map(v => [pairKey(v.a, v.b), GRADES.indexOf(v.grade)]));
	grounds.add(session.ground || "unrecorded");
	sizes.add(session.swatchPx);
	for (const probe of session.probes) {
		const a = labs[probe.a], b = labs[probe.b];
		const hue = hueOf(a);
		probes.push({ session: index, sector: probe.sector ?? Math.floor(hue / (360 / SECTORS)), level: probe.level,
			axis: probe.axis || "H", asked: probe.distance,
			distance: weightedDistance(a, b, W_L, W_C),
			relL: Math.max(LIGHTNESS_FLOOR, (rel[probe.a][0] + rel[probe.b][0]) / 2),
			chroma: Math.max(CHROMA_FLOOR, (Math.hypot(a[1], a[2]) + Math.hypot(b[1], b[2])) / 2),
			hue, marked: (grade.get(pairKey(probe.a, probe.b)) ?? 2) < 2 });
	}
}

console.log("%s palettes, %s probe pairs, %s marked; swatch %s px, ground %s",
	sessions.length, probes.length, probes.filter(p => p.marked).length, [...sizes].join("/"), [...grounds].join("/"));
if (sizes.size > 1 || grounds.size > 1)
	console.log("warning: mixed swatch sizes or grounds fit one set of constants");
const axes = [...new Set(probes.map(p => p.axis))].sort();
if (axes.length > 1)
	console.log("pooled over axes: " + axes.map(axis => axis + " " + probes.filter(p => p.axis === axis).length).join(", "));

// The raw view, before any model.
console.log("\nmarked / judged, by sector and distance:");
const rungs = [...new Set(probes.map(p => p.asked))].sort((a, b) => a - b);
console.log("  sector          " + rungs.map(r => String(r).padStart(8)).join("") + "     all");
for (let sector = 0; sector < SECTORS; ++sector) {
	const at = probes.filter(p => p.sector === sector);
	const row = rungs.map(rung => {
		const cell = at.filter(p => p.asked === rung);
		return (cell.length ? cell.filter(p => p.marked).length + "/" + cell.length : "-").padStart(8);
	});
	console.log("  %s (%s-%s)%s   %s", sector, String(sector * 60).padStart(3), String(sector * 60 + 60).padStart(3),
		row.join(""), at.filter(p => p.marked).length + "/" + at.length);
}

// How far the three predictors move together, which is what decides whether this log can separate them.
const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
function correlation(f, g) {
	const x = probes.map(f), y = probes.map(g), mx = mean(x), my = mean(y);
	return mean(x.map((v, i) => (v - mx) * (y[i] - my))) / Math.sqrt(mean(x.map(v => (v - mx) ** 2)) * mean(y.map(v => (v - my) ** 2)));
}
const cool = p => p.sector >= 4 ? 1 : 0;
console.log("\nhow far the predictors move together (near zero is what makes the fit separable):");
console.log("  cool sector vs relative lightness  r = %s", correlation(cool, p => p.relL).toFixed(3));
console.log("  cool sector vs chroma              r = %s", correlation(cool, p => p.chroma).toFixed(3));
console.log("  relative lightness vs chroma       r = %s", correlation(p => p.relL, p => p.chroma).toFixed(3));

const model = () => ({ amplitude: 0, centre: 0, qL: 0, qC: 0, threshold: 8, softness: 2, lapse: 0.02 });
const hueGain = (m, hue) => 1 - m.amplitude * Math.cos((hue - m.centre) * Math.PI / 180);
const gainOf = (m, p) => hueGain(m, p.hue) * (p.relL / LIGHTNESS_REF) ** m.qL * (p.chroma / CHROMA_REF) ** m.qC;
function logLikelihood(m, sample) {
	let total = 0;
	for (const p of sample) {
		const chance = m.lapse / 2 + (1 - m.lapse) * normalCdf((m.threshold - p.distance * gainOf(m, p)) / m.softness);
		total += Math.log(Math.max(1e-12, p.marked ? chance : 1 - chance));
	}
	return total;
}

// One parameter swept with the rest held, cycled to convergence. `pin` holds a parameter out of the
// sweep, which is how each profile is taken. Coordinate ascent settles where it started from, so a
// profile starts from the free fit: from the default start a pinned fit can land below the free one
// even at the free one's own value, and the profile then reports no value in range at all.
function fit(sample, pin = {}, start = model()) {
	const m = { ...start, ...pin };
	const sweep = (key, values, set) => {
		if (key in pin)
			return;
		let best = null, bestLL = -Infinity;
		for (const value of values) {
			set(value);
			const ll = logLikelihood(m, sample);
			if (ll > bestLL) {
				bestLL = ll;
				best = value;
			}
		}
		set(best);
	};
	let last = -Infinity;
	for (let pass = 0; pass < PASSES; ++pass) {
		sweep("threshold", THRESHOLDS, v => m.threshold = v);
		sweep("softness", SOFTNESS, v => m.softness = v);
		sweep("lapse", LAPSES, v => m.lapse = v);
		sweep("qL", EXPONENTS, v => m.qL = v);
		sweep("qC", EXPONENTS, v => m.qC = v);
		sweep("amplitude", AMPLITUDES, v => m.amplitude = v);
		sweep("centre", CENTRES, v => m.centre = v);
		const now = logLikelihood(m, sample);
		if (now - last < 1e-6)
			break;
		last = now;
	}
	m.ll = logLikelihood(m, sample);
	return m;
}

const pinnedFit = (sample, key, value) => fit(sample, { [key]: value }, best);

const best = fit(probes);
console.log("\nfitted gain on the distance (above one: reads further apart than the metric says):");
console.log("  hue trough: amplitude %s, deepest at %s degrees", best.amplitude.toFixed(2), best.centre);
for (let sector = 0; sector < SECTORS; ++sector)
	console.log("    sector %s (%s-%s)  gain %s", sector, String(sector * 60).padStart(3), String(sector * 60 + 60).padStart(3),
		hueGain(best, sector * 60 + 30).toFixed(2));
console.log("  relative lightness exponent  %s", best.qL.toFixed(2));
console.log("  chroma exponent              %s", best.qC.toFixed(2));
console.log("  threshold %s, softness %s, lapse %s, log-likelihood %s",
	best.threshold, best.softness, best.lapse, best.ll.toFixed(1));

// What each term earns: the same fit with that term held at no effect.
console.log("\nwhat each term earns, refitting everything else without it:");
console.log("  hue term flat         %s log-likelihood units worse (2 parameters)", (best.ll - fit(probes, { amplitude: 0 }, best).ll).toFixed(1));
console.log("  lightness exponent 0  %s units worse (1 parameter)", (best.ll - fit(probes, { qL: 0 }, best).ll).toFixed(1));
console.log("  chroma exponent 0     %s units worse (1 parameter)", (best.ll - fit(probes, { qC: 0 }, best).ll).toFixed(1));

console.log("\nprofiles: range at %s log-likelihood units below the best", LL_RANGE);
const profile = (label, key, values, neutral) => {
	const within = values.filter(v => pinnedFit(probes, key, v).ll - best.ll > -LL_RANGE);
	if (!within.length)
		return console.log("  " + label.padEnd(24) + "no value within range");
	const [lo, hi] = [Math.min(...within), Math.max(...within)];
	console.log("  %s%s to %s;  %s is %s%s", label.padEnd(24), lo.toFixed(2), hi.toFixed(2), neutral,
		lo > neutral || hi < neutral ? "OUTSIDE it" : "inside it",
		hi >= values[values.length - 1] || lo <= values[0] ? "   (railed)" : "");
};
profile("hue amplitude", "amplitude", AMPLITUDES, 0);
profile("lightness exponent", "qL", EXPONENTS, 0);
profile("chroma exponent", "qC", EXPONENTS, 0);

// Palette-level bootstrap on the terms that would go into the metric.
const bySession = sessions.map((_, i) => probes.filter(p => p.session === i));
const draws = { qL: [], qC: [], coolGain: [] };
for (let draw = 0; draw < BOOTSTRAP; ++draw) {
	const sample = [];
	for (let n = 0; n < bySession.length; ++n)
		sample.push(...bySession[Math.floor(Math.random() * bySession.length)]);
	const m = fit(sample);
	draws.qL.push(m.qL);
	draws.qC.push(m.qC);
	draws.coolGain.push(hueGain(m, 270) / hueGain(m, 30));
}
const at = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
console.log("\n%s%% intervals over %s palette draws:", Math.round(INTERVAL * 100), BOOTSTRAP);
for (const [label, key, neutral] of [["lightness exponent", "qL", 0], ["chroma exponent", "qC", 0],
		["blue gain over red", "coolGain", 1]]) {
	const sorted = draws[key].slice().sort((a, b) => a - b);
	const [lo, hi] = [at(sorted, (1 - INTERVAL) / 2), at(sorted, (1 + INTERVAL) / 2)];
	console.log("  %s%s to %s;  %s is %s", label.padEnd(22), lo.toFixed(2), hi.toFixed(2), neutral,
		lo > neutral || hi < neutral ? "OUTSIDE it" : "inside it");
}
