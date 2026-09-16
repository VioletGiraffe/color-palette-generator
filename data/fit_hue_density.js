#!/usr/bin/env node
// Fits a memory-scale hue density to calibrate-boundaries.html logs: an ordinal logistic model of the grade in the
// log of the pair's distance on the metric with its hue term replaced by C^p times the arc integral of the density
// over the pair's turn, in radians, the density piecewise linear between knots spaced evenly around the circle,
// log-parametrised with mean zero and ridged toward flat. The lightness and chroma terms and the lightness gain
// are identify.js's, so pairs that differ in lightness or chroma count as the metric counts them. Prints the
// ranking quality (AUC of not-close against close and of fine against the rest) of the flat density, of the fit in
// sample and of the fit under 6-fold cross-validation, then the density at each knot.
//
//     node data/fit_hue_density.js [--p 0.75] [--ridge 2] [--knots 12] [--own-cuts] [--wl 0.35] [--wc 0.6] [--gain 0.5] [--placement own] [--table] log.json [more.json ...]
//
// --table prints the fitted density per whole degree at mean 1, in the format of HUE_DENSITY in index.html and
// identify.js. --placement keeps only the records dealt under that placement, for a deal that mixed several.
//
// p is chroma's exponent on a turn, fixed per run, the metric's CHROMA_POWER by default. --wl and --wc replace the
// metric's lightness and chroma weights, so a deal whose pairs differ in lightness or chroma can say whether the
// weights hold at this scale; --gain replaces the metric's lightness gain by a plain power of lightness over 50,
// which deals at different lightness levels under one pair of cuts test. Every log's records add up, whatever their
// deal. The grade cuts, the distances at which marginal and fine begin, are printed; --own-cuts fits a pair per log
// under the one density, which shows a criterion that moved between sittings.

"use strict";
const fs = require("fs");
const { labOf, W_L, W_C, CHROMA_POWER, LIGHTNESS_REFERENCE, LIGHTNESS_FLOOR, lightnessGain } = require("./identify.js");

const GRADES = ["close", "marginal", "fine"];
const FOLDS = 6;
const CUT_SLOPE = 4;

function main(args) {
	let p = CHROMA_POWER, ridge = 2, knots = 12, ownCuts = false, wL = W_L, wC = W_C, gainExponent = null, table = false, placement = null;
	const paths = [];
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--p")
			p = +args[++i];
		else if (args[i] === "--ridge")
			ridge = +args[++i];
		else if (args[i] === "--knots")
			knots = +args[++i];
		else if (args[i] === "--own-cuts")
			ownCuts = true;
		else if (args[i] === "--wl")
			wL = +args[++i];
		else if (args[i] === "--wc")
			wC = +args[++i];
		else if (args[i] === "--gain")
			gainExponent = +args[++i];
		else if (args[i] === "--table")
			table = true;
		else if (args[i] === "--placement")
			placement = args[++i];
		else if (args[i].endsWith(".json"))
			paths.push(args[i]);
		else
			throw new Error("unknown option " + args[i]);
	}
	if (!paths.length) {
		console.error("usage: node data/fit_hue_density.js [--p 1] [--ridge 2] [--knots 12] log.json [more.json ...]");
		process.exit(1);
	}
	const step = 360 / knots;
	// A record tagged with no placement was dealt under its deal's one; a deal stamped with none is shared
	const records = paths.flatMap((path, source) => { const log = JSON.parse(fs.readFileSync(path, "utf8")); return log.records.map(r => ({ ...r, source, placement: r.placement ?? log.deal.placement ?? "shared" })); })
		.filter(r => placement === null || r.placement === placement);
	const lch = hex => { const [L, a, b] = labOf(hex); return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };
	// A row is the pair's grade, its chroma factor, its turn as the arc from lo counter-clockwise over span degrees,
	// the metric's weighted lightness and chroma differences and gain, and the cut pair it is graded against: one
	// for all, or its log's
	const rows = records.map(r => {
		const A = lch(r.a), B = lch(r.b);
		let lo = A[2], hi = B[2];
		if ((hi - lo + 360) % 360 > 180)
			[lo, hi] = [hi, lo];
		const meanL = (A[0] + B[0]) / 2;
		const gain = gainExponent === null ? lightnessGain(meanL) : (Math.max(LIGHTNESS_FLOOR, meanL) / LIGHTNESS_REFERENCE) ** gainExponent;
		return { g: GRADES.indexOf(r.grade), C: Math.pow((A[1] + B[1]) / 2, p), lo, span: (hi - lo + 360) % 360, dL: wL * (A[0] - B[0]), dC: wC * (A[1] - B[1]), gain, cuts: ownCuts ? r.source : 0 };
	});
	const cutPairs = ownCuts ? paths.length : 1;
	const densityAt = (logs, h) => { const x = h / step, i = Math.floor(x) % knots, t = x - Math.floor(x); return Math.exp(logs[i] * (1 - t) + logs[(i + 1) % knots] * t); };
	// The hue term is the turn's integral of the density by one-degree steps, in radians
	const distance = (logs, row) => {
		const n = Math.max(1, Math.round(row.span));
		let s = 0;
		for (let k = 0; k < n; ++k)
			s += densityAt(logs, (row.lo + (k + 0.5) * row.span / n) % 360);
		const hue = row.C * s * row.span / n * Math.PI / 180;
		return Math.sqrt(hue * hue + row.dL * row.dL + row.dC * row.dC) * row.gain;
	};
	const sigmoid = x => 1 / (1 + Math.exp(-x));
	// theta: the knot logs, then per cut pair the log-distance cut between close and marginal and the log of the gap to the fine cut
	const cutsOf = (theta, row) => { const cut1 = theta[knots + 2 * row.cuts]; return [cut1, cut1 + Math.exp(theta[knots + 2 * row.cuts + 1])]; };
	const loss = (theta, set) => {
		const logs = theta.slice(0, knots);
		let s = 0;
		for (const row of set) {
			const d = Math.log(distance(logs, row)), [cut1, cut2] = cutsOf(theta, row);
			const p1 = sigmoid(CUT_SLOPE * (d - cut1)), p2 = sigmoid(CUT_SLOPE * (d - cut2));
			s -= Math.log(Math.max(row.g === 0 ? 1 - p1 : row.g === 1 ? p1 - p2 : p2, 1e-9));
		}
		const m = logs.reduce((a, b) => a + b, 0) / knots;
		return s + ridge * logs.reduce((a, x) => a + (x - m) ** 2, 0) + 100 * m * m;
	};
	const flatLogs = Array(knots).fill(0);
	const meanLogDistance = Math.log(rows.reduce((a, r) => a + distance(flatLogs, r), 0) / rows.length);
	const start = () => [...flatLogs, ...Array(cutPairs).fill([meanLogDistance, 0]).flat()];
	const auc = (xs, positive) => {
		let n = 0, s = 0;
		for (let i = 0; i < xs.length; ++i)
			for (let j = 0; j < xs.length; ++j)
				if (positive[i] && !positive[j]) { ++n; s += xs[i] > xs[j] ? 1 : xs[i] === xs[j] ? 0.5 : 0; }
		return s / n;
	};
	const grades = rows.map(r => r.g);
	const quality = xs => "AUC not-close " + auc(xs, grades.map(g => g >= 1)).toFixed(3) + ", fine " + auc(xs, grades.map(g => g >= 2)).toFixed(3);

	console.log(rows.length + " verdicts; p " + p + ", ridge " + ridge + ", " + knots + " knots, wL " + wL + ", wC " + wC + ", gain " + (gainExponent === null ? "the metric's" : "lightness over " + LIGHTNESS_REFERENCE + " to the " + gainExponent));
	console.log("flat density: " + quality(rows.map(r => distance(flatLogs, r))));
	const theta = nelderMead(t => loss(t, rows), start(), 4000);
	console.log("fitted, in sample: " + quality(rows.map(r => distance(theta, r))));
	const fold = rows.map((_, i) => (i * 7919) % FOLDS), held = Array(rows.length);
	for (let k = 0; k < FOLDS; ++k) {
		const fit = nelderMead(t => loss(t, rows.filter((_, i) => fold[i] !== k)), start(), 2500);
		rows.forEach((r, i) => { if (fold[i] === k) held[i] = distance(fit, r); });
	}
	console.log("fitted, " + FOLDS + "-fold cross-validated: " + quality(held));
	console.log("density at knots: " + theta.slice(0, knots).map((x, i) => (i * step) + ":" + Math.exp(x).toFixed(2)).join(" "));
	for (let k = 0; k < cutPairs; ++k) {
		const [cut1, cut2] = cutsOf(theta, { cuts: k });
		console.log("cuts" + (ownCuts ? " of " + paths[k] : "") + ": marginal from " + Math.exp(cut1).toFixed(1) + ", fine from " + Math.exp(cut2).toFixed(1) + " on the metric");
	}
	if (table) {
		const perDegree = Array.from({ length: 360 }, (_, h) => densityAt(theta, h));
		const mean = perDegree.reduce((a, b) => a + b, 0) / 360;
		const entries = perDegree.map(d => +(d / mean).toFixed(3));
		console.log("const HUE_DENSITY = [");
		for (let h = 0; h < 360; h += 17)
			console.log("\t" + entries.slice(h, h + 17).join(", ") + (h + 17 < 360 ? "," : "];"));
	}
}

function nelderMead(f, x0, iterations) {
	const n = x0.length;
	let simplex = [x0.slice()];
	for (let i = 0; i < n; ++i) {
		const x = x0.slice();
		x[i] += 0.3;
		simplex.push(x);
	}
	let values = simplex.map(f);
	for (let it = 0; it < iterations; ++it) {
		const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
		simplex = order.map(i => simplex[i]);
		values = order.map(i => values[i]);
		const centroid = Array(n).fill(0);
		for (let i = 0; i < n; ++i)
			for (let j = 0; j < n; ++j)
				centroid[j] += simplex[i][j] / n;
		const worst = simplex[n], reflected = centroid.map((v, j) => v + (v - worst[j])), fr = f(reflected);
		if (fr < values[0]) {
			const expanded = centroid.map((v, j) => v + 2 * (v - worst[j])), fe = f(expanded);
			[simplex[n], values[n]] = fe < fr ? [expanded, fe] : [reflected, fr];
		} else if (fr < values[n - 1]) {
			simplex[n] = reflected;
			values[n] = fr;
		} else {
			const contracted = centroid.map((v, j) => v + 0.5 * (worst[j] - v)), fc = f(contracted);
			if (fc < values[n]) {
				simplex[n] = contracted;
				values[n] = fc;
			} else
				for (let i = 1; i <= n; ++i) {
					simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
					values[i] = f(simplex[i]);
				}
		}
	}
	return simplex[0];
}

main(process.argv.slice(2));
