#!/usr/bin/env node
// Reads calibrate-palettes.html logs: pairwise verdicts on which of two palettes is the more evenly spread,
// each pair the same seed and count under two hue conditions, and ties that say whether both are OK or neither.
//
//     node data/fit_palettes.js log.json [more.json ...]
//
// Three readings:
//   1. Strength per condition, a Bradley-Terry fit with ties (Davidson): a beats b with chance
//      s_a / (s_a + s_b + t sqrt(s_a s_b)), the rest of the tie mass is t sqrt(s_a s_b) over the same sum.
//      Shipped is pinned at 1; the intervals are a bootstrap over the records.
//   2. What the eye counted: for each palette feature, a one-parameter logistic on the choices, the feature's
//      difference between the two palettes as the only term; the log-likelihood gain over a coin flip says how
//      much of the choosing the feature explains. The features are the unevenness of the hue gaps in three
//      coordinates, degrees, the metric's hue warp and the metric's length along the ridge, the largest gap in
//      each, the nearest pair's metric distance and the number of distinct names.
//   3. The marks: the hue gap at seams marked as missing a color against the other seams, in each coordinate,
//      and the metric distance of pairs marked as crowding against the other neighbours.

"use strict";
const fs = require("fs");
const { labOf, recallDistance, HUE_DENSITY } = require("./identify.js");

const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const cv = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2))) / mean(xs);
const fmt = (x, w = 7, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-").padStart(w);

// The running integral of a per-degree density, 0 to 360 at the whole degrees.
const warpOf = density => { const w = [0]; for (let h = 0; h < 360; ++h) w.push(w[h] + density[h]); return w.map(v => v * 360 / w[360]); };
const HUE_WARP = warpOf(HUE_DENSITY);
// The metric's length along the sRGB cube's saturated edges per degree of hue, as index.html's RIDGE_WARP.
const RIDGE_WARP = (() => {
	const codes = [];
	for (let g = 0; g < 255; ++g) codes.push([255, g, 0]);
	for (let r = 255; r > 0; --r) codes.push([r, 255, 0]);
	for (let b = 0; b < 255; ++b) codes.push([0, 255, b]);
	for (let g = 255; g > 0; --g) codes.push([0, g, 255]);
	for (let r = 0; r < 255; ++r) codes.push([r, 0, 255]);
	for (let b = 255; b > 0; --b) codes.push([255, 0, b]);
	const labs = codes.map(rgb => labOf("#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("")));
	const perDegree = new Array(360).fill(0);
	labs.forEach((lab, i) => { perDegree[Math.floor(hueOf(lab))] += recallDistance(lab, labs[(i + 1) % labs.length]); });
	return warpOf(perDegree);
})();
const warpAt = (table, h) => { const at = Math.min(359, Math.floor(h)); return table[at] + (table[at + 1] - table[at]) * (h - at); };
const COORDINATES = { degrees: h => h, "hue warp": h => warpAt(HUE_WARP, h), ridge: h => warpAt(RIDGE_WARP, h) };

// The gaps between hue neighbours round the circle in one coordinate, the wrap included.
function gapsOf(hues, coordinate) {
	const at = hues.map(coordinate).sort((a, b) => a - b);
	return at.map((v, i) => i + 1 < at.length ? at[i + 1] - v : 360 - v + at[0]);
}

function featuresOf(palette) {
	const labs = palette.hexes.map(labOf), hues = labs.map(hueOf);
	const out = {};
	for (const [name, coordinate] of Object.entries(COORDINATES)) {
		const gaps = gapsOf(hues, coordinate);
		out["gap CV, " + name] = cv(gaps);
		out["largest gap, " + name] = Math.max(...gaps);
	}
	let nearest = Infinity;
	for (let i = 0; i < labs.length; ++i)
		for (let j = i + 1; j < labs.length; ++j)
			nearest = Math.min(nearest, recallDistance(labs[i], labs[j]));
	out["nearest pair, metric"] = -nearest;   // negated: like the gaps, less is better
	out["distinct names"] = -new Set(palette.names).size;
	return out;
}

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

// ---------- 1. strengths ----------

// Davidson's model over the records, strengths as logs with the first condition pinned at 0, the tie parameter
// as a log too; gradient ascent, the likelihood being concave in these parameters.
function davidson(records, conditions) {
	const index = new Map(conditions.map((c, i) => [c, i]));
	const theta = new Array(conditions.length).fill(0);
	let logTie = 0;
	const chances = (a, b) => {
		const sa = Math.exp(theta[a]), sb = Math.exp(theta[b]), tie = Math.exp(logTie) * Math.sqrt(sa * sb), sum = sa + sb + tie;
		return [sa / sum, sb / sum, tie / sum];
	};
	const outcome = r => r.verdict === "a" ? 0 : r.verdict === "b" ? 1 : 2;
	const likelihood = () => records.reduce((ll, r) => ll + Math.log(chances(index.get(r.a.condition), index.get(r.b.condition))[outcome(r)]), 0);
	for (let iter = 0; iter < 2000; ++iter) {
		const grad = new Array(conditions.length).fill(0);
		let gradTie = 0;
		for (const r of records) {
			const a = index.get(r.a.condition), b = index.get(r.b.condition), [pa, pb, pt] = chances(a, b), o = outcome(r);
			// d log P(o) / d theta: the observed term's own derivative less the expectation over the three outcomes.
			const da = [1, 0, 0.5][o] - (pa + 0.5 * pt), db = [0, 1, 0.5][o] - (pb + 0.5 * pt), dt = [0, 0, 1][o] - pt;
			grad[a] += da;
			grad[b] += db;
			gradTie += dt;
		}
		const step = 1 / records.length;
		for (let i = 1; i < conditions.length; ++i)
			theta[i] += step * grad[i];
		logTie += step * gradTie;
	}
	return { strengths: theta.map(Math.exp), tie: Math.exp(logTie), likelihood: likelihood() };
}

function resample(records, rnd) {
	return Array.from(records, () => records[Math.floor(rnd() * records.length)]);
}
function mulberry32(seed) {
	return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- 2. features ----------

// One parameter: the chance a is chosen is the logistic of beta times (f_b - f_a), so a positive beta means the
// eye preferred less of the feature. Golden-section search over beta; ties are left out.
function logistic(diffs) {
	const ll = beta => diffs.reduce((s, [d, chosenA]) => s + Math.log(1 / (1 + Math.exp(-(chosenA ? 1 : -1) * beta * d))), 0);
	let lo = -50, hi = 50;
	const R = (Math.sqrt(5) - 1) / 2;
	let a = hi - R * (hi - lo), b = lo + R * (hi - lo), fa = ll(a), fb = ll(b);
	for (let n = 0; n < 80; ++n) {
		if (fa < fb) { lo = a; a = b; fa = fb; b = lo + R * (hi - lo); fb = ll(b); }
		else { hi = b; b = a; fb = fa; a = hi - R * (hi - lo); fa = ll(a); }
	}
	const beta = (lo + hi) / 2;
	return { beta, gain: ll(beta) - ll(0), accuracy: mean(diffs.map(([d, chosenA]) => (d > 0) === chosenA ? 1 : 0)) };
}

// ---------- main ----------

function main(args) {
	if (!args.length)
		throw new Error("no log given");
	const records = readLogs(args);
	const conditions = [...new Set(records.flatMap(r => [r.a.condition, r.b.condition]))].sort((p, q) => p === "shipped" ? -1 : q === "shipped" ? 1 : p < q ? -1 : 1);
	const chosen = records.filter(r => r.verdict === "a" || r.verdict === "b");
	console.log(records.length + " verdicts over " + args.length + " log(s): " + chosen.length + " choices, "
		+ records.filter(r => r.verdict === "both").length + " both OK, " + records.filter(r => r.verdict === "neither").length + " neither; median "
		+ (records.map(r => r.ms).sort((p, q) => p - q)[records.length >> 1] / 1000).toFixed(1) + " s per verdict");

	console.log("\nper condition pair: wins for the first, for the second, both OK, neither");
	for (let i = 0; i < conditions.length; ++i)
		for (let j = i + 1; j < conditions.length; ++j) {
			const own = records.filter(r => (r.a.condition === conditions[i] && r.b.condition === conditions[j]) || (r.a.condition === conditions[j] && r.b.condition === conditions[i]));
			const firstWins = own.filter(r => (r.verdict === "a" ? r.a : r.verdict === "b" ? r.b : {}).condition === conditions[i]).length;
			const secondWins = own.filter(r => (r.verdict === "a" ? r.a : r.verdict === "b" ? r.b : {}).condition === conditions[j]).length;
			console.log("  " + (conditions[i] + " v " + conditions[j]).padEnd(26) + String(firstWins).padStart(4) + String(secondWins).padStart(4)
				+ String(own.filter(r => r.verdict === "both").length).padStart(4) + String(own.filter(r => r.verdict === "neither").length).padStart(4) + "   of " + own.length);
		}

	const fit = davidson(records, conditions);
	const rnd = mulberry32(1), boots = Array.from({ length: 200 }, () => davidson(resample(records, rnd), conditions).strengths);
	const interval = i => { const s = boots.map(b => b[i]).sort((p, q) => p - q); return [s[Math.floor(s.length * 0.05)], s[Math.floor(s.length * 0.95)]]; };
	console.log("\nstrength per condition, shipped at 1, with the 90% bootstrap interval; tie parameter " + fit.tie.toFixed(2));
	conditions.forEach((c, i) => console.log("  " + c.padEnd(12) + fmt(fit.strengths[i]) + "   " + interval(i).map(v => v.toFixed(2)).join(" to ")));
	console.log("  the same over each count:");
	for (const count of [...new Set(records.map(r => r.a.count))].sort((p, q) => p - q)) {
		const own = davidson(records.filter(r => r.a.count === count), conditions);
		console.log("    " + String(count).padEnd(10) + conditions.map((c, i) => c + " " + own.strengths[i].toFixed(2)).join("  "));
	}

	console.log("\nwhat the eye counted: one-parameter logistic per feature over the " + chosen.length + " choices; less of the feature preferred where beta is positive");
	console.log("  feature".padEnd(30) + "     beta   LL gain   accuracy");
	const features = chosen.map(r => [featuresOf(r.a), featuresOf(r.b), r.verdict === "a"]);
	for (const name of Object.keys(features[0][0])) {
		const diffs = features.map(([fa, fb, chosenA]) => [fb[name] - fa[name], chosenA]);
		const scale = Math.sqrt(mean(diffs.map(([d]) => d * d))) || 1;
		const { beta, gain, accuracy } = logistic(diffs.map(([d, c]) => [d / scale, c]));
		console.log("  " + name.padEnd(30) + fmt(beta, 8) + fmt(gain, 9, 1) + fmt(accuracy, 10));
	}

	const marked = { gaps: [], crowded: [] };
	for (const r of records)
		for (const side of ["a", "b"]) {
			const palette = r[side], hues = palette.hexes.map(hex => hueOf(labOf(hex)));
			const seams = palette.hexes.map((hex, k) => [hex, palette.hexes[(k + 1) % palette.hexes.length]]);
			const isMarked = (pair, list) => list.some(([p, q]) => (p === pair[0] && q === pair[1]) || (p === pair[1] && q === pair[0]));
			for (const seam of seams) {
				const [p, q] = seam.map(hex => hueOf(labOf(hex)));
				marked.gaps.push({ marked: isMarked(seam, r.marks[side].gaps), gap: Object.fromEntries(Object.entries(COORDINATES).map(([n, c]) => [n, ((c(q) - c(p)) % 360 + 360) % 360])) });
				marked.crowded.push({ marked: isMarked(seam, r.marks[side].crowded), distance: recallDistance(labOf(seam[0]), labOf(seam[1])) });
			}
		}
	const gapsMarked = marked.gaps.filter(g => g.marked), crowdMarked = marked.crowded.filter(c => c.marked);
	if (gapsMarked.length) {
		console.log("\nseams marked as missing a color, " + gapsMarked.length + " of " + marked.gaps.length + ": their mean gap over the other seams', per coordinate");
		for (const name of Object.keys(COORDINATES))
			console.log("  " + name.padEnd(12) + fmt(mean(gapsMarked.map(g => g.gap[name])) / mean(marked.gaps.filter(g => !g.marked).map(g => g.gap[name]))));
	}
	if (crowdMarked.length)
		console.log("\nneighbours marked as crowding, " + crowdMarked.length + " of " + marked.crowded.length + ": mean metric distance " + fmt(mean(crowdMarked.map(c => c.distance)))
			+ " against " + fmt(mean(marked.crowded.filter(c => !c.marked).map(c => c.distance))) + " for the others");
}

main(process.argv.slice(2));
