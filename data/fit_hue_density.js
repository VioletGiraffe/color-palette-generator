#!/usr/bin/env node
// Fits the metric to calibrate-boundaries.html logs: an ordinal logistic model of the grade in the log of the pair's
// distance, the distance identify.js's metricWith under the candidate, so a fitted number holds in the metric it is
// pasted into. The candidate is a hue density, piecewise linear between knots spaced evenly around the circle,
// log-parametrised with mean zero and ridged toward flat, and whichever of the lightness weight, the chroma weight
// and the gain's exponent --free names; the rest stay at the metric's or at the option's value. Prints the ranking
// quality (AUC of not-close against close and of fine against the rest) and the loss per verdict of the built metric,
// of the flat density, of the fit in sample and of the fit under 6-fold cross-validation, then the fitted numbers.
//
//     node data/fit_hue_density.js [--p 0.75] [--ridge 2] [--knots 12] [--levels 30,58,85] [--level-ridge 10] [--own-cuts] [--same-cuts 13-17] [--wl 0.46] [--wc 0.86] [--gain 0.19] [--free wl,wc,gain] [--placement own] [--table] log.json [more.json ...]
//
// --table prints the fitted density per whole degree at mean 1, in the format of HUE_DENSITY in index.html and
// identify.js. --placement keeps only the records dealt under that placement, for a deal that mixed several.
// --levels fits a density per lightness named, the pair's the mix of the two around its mean lightness: each is the
// one density times offsets of its own, ridged toward none by --level-ridge.
//
// p is chroma's exponent on a hue difference, fixed per run, the metric's CHROMA_POWER by default. Every log's records
// add up, whatever their deal. The grade cuts, the distances at which marginal and fine begin, are fitted exactly for
// every candidate and printed, and the slope of the grade transitions is fitted with every model, the built metric
// included. --own-cuts fits a pair of cuts per log under the one candidate, which takes a criterion that moved
// between sittings out of the fit; --same-cuts names spans of positions in the log list judged under one criterion,
// one pair each: a log of one stretch of hues with cuts of its own hides that stretch's scale in them.

"use strict";
const fs = require("fs");
const { labOf, W_L, W_C, CHROMA_POWER, LIGHTNESS_EXPONENT, HUE_DENSITY, metricWith } = require("./identify.js");

const GRADES = ["close", "marginal", "fine"];
const FOLDS = 6;
const FIT_STEPS = 300;
const CUT_SLOPE = 4;
const CUT_STEPS = 12, CUT_PULL = 1e-3, CUT_EXACT = 1e-7;
const FREE = ["wl", "wc", "gain"];

function main(args) {
	let p = CHROMA_POWER, ridge = 2, knots = 12, ownCuts = false, wL = W_L, wC = W_C, gainExponent = LIGHTNESS_EXPONENT, free = [], table = false, placement = null, sameCuts = [], levels = [], levelRidge = 10;
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
		else if (args[i] === "--levels")
			levels = args[++i].split(",").map(Number);
		else if (args[i] === "--level-ridge")
			levelRidge = +args[++i];
		else if (args[i] === "--same-cuts")
			sameCuts = args[++i].split(",").map(span => span.split("-").map(Number));
		else if (args[i] === "--wl")
			wL = +args[++i];
		else if (args[i] === "--wc")
			wC = +args[++i];
		else if (args[i] === "--gain")
			gainExponent = +args[++i];
		else if (args[i] === "--free") {
			free = args[++i].split(",");
			for (const name of free)
				if (!FREE.includes(name))
					throw new Error("unknown free parameter " + name);
		} else if (args[i] === "--table")
			table = true;
		else if (args[i] === "--placement")
			placement = args[++i];
		else if (args[i].endsWith(".json"))
			paths.push(args[i]);
		else
			throw new Error("unknown option " + args[i]);
	}
	if (!paths.length) {
		console.error("usage: node data/fit_hue_density.js [--p 0.75] [--ridge 2] [--knots 12] [--levels 30,58,85] [--own-cuts] [--free wl,wc,gain] log.json [more.json ...]");
		process.exit(1);
	}
	const step = 360 / knots;
	// A record tagged with no placement was dealt under its deal's one; a deal stamped with none is shared
	const records = paths.flatMap((path, source) => { const log = JSON.parse(fs.readFileSync(path, "utf8")); return log.records.map(r => ({ ...r, source, placement: r.placement ?? log.deal.placement ?? "shared" })); })
		.filter(r => placement === null || r.placement === placement);
	// A log's cut pair: one for all, or its own, or the one of the --same-cuts span of positions it falls in
	const firstOf = source => { const span = sameCuts.find(([from, to]) => source + 1 >= from && source + 1 <= to); return !ownCuts ? 0 : span ? span[0] - 1 : source; };
	const firsts = [...new Set(paths.map((_, source) => firstOf(source)))], cutPairOf = paths.map((_, source) => firsts.indexOf(firstOf(source))), cutPairs = firsts.length;
	// A row is the pair's grade, its two colors and the cut pair it is graded against
	const rows = records.map(r => ({ g: GRADES.indexOf(r.grade), a: labOf(r.a), b: labOf(r.b), cuts: cutPairOf[r.source] }));
	const densityAt = (logs, h) => { const x = h / step, i = Math.floor(x) % knots, t = x - Math.floor(x); return Math.exp(logs[i] * (1 - t) + logs[(i + 1) % knots] * t); };
	// theta: the knot logs, then per level of --levels its knot logs' offsets from them, then the free parameters in
	// --free's order, the weights as logs
	const tables = 1 + levels.length;
	const levelLogs = (theta, k) => theta.slice(0, knots).map((x, i) => x + theta[knots * (1 + k) + i]);
	const perDegree = logs => Array.from({ length: 360 }, (_, h) => densityAt(logs, h));
	const candidate = theta => {
		const at = name => theta[knots * tables + free.indexOf(name)];
		return { density: perDegree(theta), ...(levels.length ? { levels: levels.map((L, k) => ({ L, density: perDegree(levelLogs(theta, k)) })) } : {}), power: p,
			wL: free.includes("wl") ? Math.exp(at("wl")) : wL, wC: free.includes("wc") ? Math.exp(at("wc")) : wC, gainExponent: free.includes("gain") ? at("gain") : gainExponent };
	};
	const logDistances = (metric, set) => set.map(row => Math.log(Math.max(1e-6, metric(row.a, row.b))));
	const sigmoid = x => 1 / (1 + Math.exp(-x));
	const verdictLoss = (d, g, cut1, cut2, S) => { const p1 = sigmoid(S * (d - cut1)), p2 = sigmoid(S * (d - cut2)); return -Math.log(Math.max(g === 0 ? 1 - p1 : g === 1 ? p1 - p2 : p2, 1e-9)); };
	// The cut pairs that fit the set's log distances best, per pair the cut between close and marginal, then the fine cut:
	// Newton steps on a loss convex in the two cuts, exact enough that the candidate's objective is smooth.
	// CUT_PULL toward the set's middle keeps a cut finite where a log holds no verdict of a grade.
	const cutsFor = (set, ds, S) => Array.from({ length: cutPairs }, (_, k) => {
		const own = set.map((row, i) => [ds[i], row.g, row.cuts]).filter(([, , cuts]) => cuts === k);
		if (!own.length)
			return [0, 0];
		const sorted = own.map(([d]) => d).sort((x, y) => x - y), middle = sorted[own.length >> 1];
		const lossAt = (c1, c2) => own.reduce((s, [d, g]) => s + verdictLoss(d, g, c1, c2, S), CUT_PULL * ((c1 - middle) ** 2 + (c2 - middle) ** 2));
		let c1 = sorted[Math.floor(own.length / 3)], c2 = Math.max(sorted[Math.floor(2 * own.length / 3)], c1 + 0.05), loss = lossAt(c1, c2);
		for (let it = 0; it < CUT_STEPS; ++it) {
			let g1 = 2 * CUT_PULL * (c1 - middle), g2 = 2 * CUT_PULL * (c2 - middle), h11 = 2 * CUT_PULL, h22 = 2 * CUT_PULL, h12 = 0;
			for (const [d, g] of own) {
				const p1 = sigmoid(S * (d - c1)), p2 = sigmoid(S * (d - c2)), v1 = p1 * (1 - p1), v2 = p2 * (1 - p2);
				if (g === 0) { g1 -= S * p1; h11 += S * S * v1; }
				else if (g === 2) { g2 += S * (1 - p2); h22 += S * S * v2; }
				else { const q = Math.max(p1 - p2, 1e-9); g1 += S * v1 / q; g2 -= S * v2 / q; h11 += S * S * (v1 * v1 - v1 * (1 - 2 * p1) * q) / (q * q); h22 += S * S * (v2 * v2 + v2 * (1 - 2 * p2) * q) / (q * q); h12 -= S * S * v1 * v2 / (q * q); }
			}
			const det = h11 * h22 - h12 * h12, s1 = (h22 * g1 - h12 * g2) / det, s2 = (h11 * g2 - h12 * g1) / det;
			let scale = 1, n1, n2, next;
			do {
				n1 = c1 - scale * s1; n2 = c2 - scale * s2; next = n2 > n1 ? lossAt(n1, n2) : Infinity; scale /= 2;
			} while (next > loss && scale > 1e-4);
			if (next > loss)
				break;
			[c1, c2, loss] = [n1, n2, next];
			if (Math.abs(s1) + Math.abs(s2) < CUT_EXACT)
				break;
		}
		return [c1, c2];
	});
	const lossUnder = (cuts, set, ds, S) => set.reduce((s, row, i) => s + verdictLoss(ds[i], row.g, ...cuts[row.cuts], S), 0);
	const slopeOf = theta => Math.exp(theta[theta.length - 1]);
	const objective = (theta, set) => {
		const ds = logDistances(metricWith(candidate(theta)), set), logs = theta.slice(0, knots), m = logs.reduce((a, b) => a + b, 0) / knots, S = slopeOf(theta);
		return lossUnder(cutsFor(set, ds, S), set, ds, S) + ridge * logs.reduce((a, x) => a + (x - m) ** 2, 0) + 100 * m * m
			+ levelRidge * theta.slice(knots, knots * tables).reduce((a, x) => a + x * x, 0);
	};
	// theta ends with the log of the slope of the grade transitions in log distance, fitted with every model
	const start = () => [...Array(knots * tables).fill(0), ...free.map(name => name === "wl" ? Math.log(wL) : name === "wc" ? Math.log(wC) : gainExponent), Math.log(CUT_SLOPE)];
	// A model is a metric and a slope from a training set
	const fittedModel = set => { const theta = descend(t => objective(t, set), start(), FIT_STEPS); return { metric: metricWith(candidate(theta)), S: slopeOf(theta), theta }; };
	const fixedModel = metric => set => { const ds = logDistances(metric, set), [logS] = descend(([x]) => lossUnder(cutsFor(set, ds, Math.exp(x)), set, ds, Math.exp(x)), [Math.log(CUT_SLOPE)], FIT_STEPS); return { metric, S: Math.exp(logS) }; };
	const auc = (xs, positive) => {
		let n = 0, s = 0;
		for (let i = 0; i < xs.length; ++i)
			for (let j = 0; j < xs.length; ++j)
				if (positive[i] && !positive[j]) { ++n; s += xs[i] > xs[j] ? 1 : xs[i] === xs[j] ? 0.5 : 0; }
		return s / n;
	};
	const grades = rows.map(r => r.g);
	const quality = (ds, loss) => "AUC not-close " + auc(ds, grades.map(g => g >= 1)).toFixed(3) + ", fine " + auc(ds, grades.map(g => g >= 2)).toFixed(3) + ", loss per verdict " + (loss / rows.length).toFixed(4);
	// A model's quality in sample, and held out: the model, its slope and its cuts from the other folds
	const fold = rows.map((_, i) => (i * 7919) % FOLDS);
	const assess = (label, modelFor) => {
		const whole = modelFor(rows), ds = logDistances(whole.metric, rows);
		console.log(label + ", in sample: " + quality(ds, lossUnder(cutsFor(rows, ds, whole.S), rows, ds, whole.S)));
		const held = Array(rows.length);
		let heldLoss = 0;
		for (let k = 0; k < FOLDS; ++k) {
			const training = rows.filter((_, i) => fold[i] !== k), { metric, S } = modelFor(training), cuts = cutsFor(training, logDistances(metric, training), S);
			rows.forEach((row, i) => { if (fold[i] === k) { held[i] = Math.log(Math.max(1e-6, metric(row.a, row.b))); heldLoss += verdictLoss(held[i], row.g, ...cuts[row.cuts], S); } });
		}
		console.log(label + ", " + FOLDS + "-fold cross-validated: " + quality(held, heldLoss));
		return whole;
	};

	console.log(rows.length + " verdicts; p " + p + ", ridge " + ridge + ", " + knots + " knots, " + cutPairs + " pair" + (cutPairs > 1 ? "s" : "") + " of cuts; "
		+ [["wl", "wL", wL], ["wc", "wC", wC], ["gain", "gain exponent", gainExponent]].map(([name, label, value]) => label + " " + (free.includes(name) ? "free" : value)).join(", "));
	assess("the built metric", fixedModel(metricWith({})));
	assess("flat density", fixedModel(metricWith(candidate(start()))));
	const { theta, metric, S } = assess("fitted", fittedModel), best = candidate(theta);
	console.log("wL " + best.wL.toFixed(3) + ", wC " + best.wC.toFixed(3) + ", gain exponent " + best.gainExponent.toFixed(3) + ", slope " + S.toFixed(2));
	const knotLine = logs => { const mean = perDegree(logs).reduce((a, b) => a + b, 0) / 360; return logs.map((x, i) => (i * step) + ":" + (Math.exp(x) / mean).toFixed(2)).join(" "); };
	console.log("density at knots: " + knotLine(theta.slice(0, knots)));
	levels.forEach((L, k) => console.log("density at knots, lightness " + L + ": " + knotLine(levelLogs(theta, k))));
	cutsFor(rows, logDistances(metric, rows), S).forEach(([cut1, cut2], k) => console.log("cuts of " + paths.filter((_, source) => cutPairOf[source] === k).join(", ") + ": marginal from " + Math.exp(cut1).toFixed(1)
		+ ", fine from " + Math.exp(cut2).toFixed(1) + " on the metric"));
	const printTable = (name, density) => {
		const mean = density.reduce((a, b) => a + b, 0) / 360, entries = density.map(d => +(d / mean).toFixed(3));
		console.log("const " + name + " = [");
		for (let h = 0; h < 360; h += 17)
			console.log("\t" + entries.slice(h, h + 17).join(", ") + (h + 17 < 360 ? "," : "];"));
	};
	if (table) {
		printTable("HUE_DENSITY", best.density);
		best.levels?.forEach(level => printTable("HUE_DENSITY_AT_" + level.L, level.density));
	}
}

// Adam on forward-difference gradients, the best point seen returned.
function descend(f, x0, steps) {
	const n = x0.length, x = x0.slice(), m = Array(n).fill(0), v = Array(n).fill(0), H = 1e-4, RATE = 0.03;
	let best = x.slice(), bestValue = f(x);
	for (let step = 1; step <= steps; ++step) {
		const here = f(x), g = x.map((_, i) => { const moved = x.slice(); moved[i] += H; return (f(moved) - here) / H; });
		if (here < bestValue)
			[best, bestValue] = [x.slice(), here];
		for (let i = 0; i < n; ++i) {
			m[i] = 0.9 * m[i] + 0.1 * g[i];
			v[i] = 0.999 * v[i] + 0.001 * g[i] * g[i];
			x[i] -= RATE * (m[i] / (1 - 0.9 ** step)) / (Math.sqrt(v[i] / (1 - 0.999 ** step)) + 1e-8);
		}
	}
	return f(x) < bestValue ? x : best;
}

main(process.argv.slice(2));
