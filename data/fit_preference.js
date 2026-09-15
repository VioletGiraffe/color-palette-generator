#!/usr/bin/env node
// Fits the preference density the generator's draw uses from calibrate-members.html logs: the chance a color is
// marked bad as a logistic on its absolute chroma, lightness and hue, the hue as two harmonics, with a chroma by
// hue interaction where it earns its parameters. Prints the models nested from the intercept up with their
// log-likelihood gains, the chosen model's coefficients as the PREFERENCE constant index.html carries, and the
// model's bad rate against the observed one by hue bin and chroma third.
//
//     node data/fit_preference.js log.json [more.json ...]

"use strict";
const fs = require("fs");
const { labOf } = require("./identify.js");

const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const fmt = (x, w = 7, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-").padStart(w);

function readLogs(paths) {
	const rows = [];
	for (const path of paths) {
		const log = JSON.parse(fs.readFileSync(path, "utf8"));
		if (log.version !== 1)
			throw new Error(path + ": log version " + log.version + ", this script reads 1");
		for (const r of log.records)
			for (const hex of r.hexes) {
				const lab = labOf(hex);
				rows.push({ L: lab[0], C: Math.hypot(lab[1], lab[2]), h: hueOf(lab), bad: r.bad.includes(hex) ? 1 : 0 });
			}
	}
	return rows;
}

// The feature vector of a color under a model: the intercept and the named terms, in this order.
const TERMS = {
	chroma: c => c.C,
	lightness: c => c.L,
	"cos h": c => Math.cos(c.h * Math.PI / 180),
	"sin h": c => Math.sin(c.h * Math.PI / 180),
	"cos 2h": c => Math.cos(2 * c.h * Math.PI / 180),
	"sin 2h": c => Math.sin(2 * c.h * Math.PI / 180),
	"chroma cos h": c => c.C * Math.cos(c.h * Math.PI / 180),
	"chroma sin h": c => c.C * Math.sin(c.h * Math.PI / 180),
};
const MODELS = [
	["intercept", []],
	["chroma", ["chroma"]],
	["chroma, lightness", ["chroma", "lightness"]],
	["chroma, hue", ["chroma", "cos h", "sin h", "cos 2h", "sin 2h"]],
	["chroma, hue, chroma by hue", ["chroma", "cos h", "sin h", "cos 2h", "sin 2h", "chroma cos h", "chroma sin h"]],
	["chroma, lightness, hue, chroma by hue", ["chroma", "lightness", "cos h", "sin h", "cos 2h", "sin 2h", "chroma cos h", "chroma sin h"]],
];

// Gaussian elimination with partial pivoting.
function solve(A, b) {
	const n = b.length, M = A.map((row, i) => [...row, b[i]]);
	for (let k = 0; k < n; ++k) {
		let p = k;
		for (let i = k + 1; i < n; ++i)
			if (Math.abs(M[i][k]) > Math.abs(M[p][k]))
				p = i;
		[M[k], M[p]] = [M[p], M[k]];
		for (let i = k + 1; i < n; ++i) {
			const f = M[i][k] / M[k][k];
			for (let j = k; j <= n; ++j)
				M[i][j] -= f * M[k][j];
		}
	}
	const x = new Array(n).fill(0);
	for (let i = n - 1; i >= 0; --i)
		x[i] = (M[i][n] - M[i].slice(i + 1, n).reduce((s, v, j) => s + v * x[i + 1 + j], 0)) / M[i][i];
	return x;
}

// A logistic on the intercept and the named terms by Newton's method, returning the coefficients and the
// log-likelihood. Terms are standardized for the iteration and the coefficients mapped back.
function logistic(rows, terms) {
	const raw = rows.map(c => terms.map(t => TERMS[t](c)));
	const m = terms.map((_, j) => mean(raw.map(r => r[j]))), s = terms.map((_, j) => Math.sqrt(mean(raw.map(r => (r[j] - m[j]) ** 2))) || 1);
	const X = raw.map(r => [1, ...r.map((v, j) => (v - m[j]) / s[j])]), y = rows.map(c => c.bad), k = terms.length + 1;
	let beta = new Array(k).fill(0);
	beta[0] = Math.log(mean(y) / (1 - mean(y)));
	const p = x => 1 / (1 + Math.exp(-x.reduce((sum, v, j) => sum + v * beta[j], 0)));
	for (let n = 0; n < 50; ++n) {
		const g = new Array(k).fill(0), H = Array.from({ length: k }, () => new Array(k).fill(0));
		X.forEach((x, i) => {
			const pi = p(x), w = pi * (1 - pi);
			for (let a = 0; a < k; ++a) {
				g[a] += (y[i] - pi) * x[a];
				for (let b = 0; b < k; ++b)
					H[a][b] += w * x[a] * x[b];
			}
		});
		const step = solve(H, g);
		beta = beta.map((v, j) => v + step[j]);
		if (Math.max(...step.map(Math.abs)) < 1e-9)
			break;
	}
	const ll = X.reduce((sum, x, i) => sum + Math.log(y[i] ? p(x) : 1 - p(x)), 0);
	// Back to raw units: beta_j / s_j on the term, the intercept less the sum of beta_j m_j / s_j.
	const coefficients = Object.fromEntries(terms.map((t, j) => [t, beta[j + 1] / s[j]]));
	const intercept = beta[0] - terms.reduce((sum, t, j) => sum + coefficients[t] * m[j], 0);
	return { intercept, coefficients, ll };
}

function main(args) {
	if (!args.length) {
		console.error("usage: node data/fit_preference.js log.json [more.json ...]");
		process.exit(1);
	}
	const rows = readLogs(args);
	console.log(rows.length + " colors, " + rows.filter(c => c.bad).length + " bad; chroma " + fmt(Math.min(...rows.map(c => c.C)), 4, 1) + " to " + fmt(Math.max(...rows.map(c => c.C)), 4, 1)
		+ ", lightness " + fmt(Math.min(...rows.map(c => c.L)), 4, 1) + " to " + fmt(Math.max(...rows.map(c => c.L)), 4, 1));
	console.log("\nmodels, log-likelihood gain over the intercept and over the previous model");
	const fits = MODELS.map(([name, terms]) => ({ name, terms, ...logistic(rows, terms) }));
	fits.forEach((f, i) => console.log("  " + f.name.padEnd(40) + String(f.terms.length + 1).padStart(3) + " parameters" + fmt(f.ll - fits[0].ll, 9, 1)
		+ (i ? fmt(f.ll - fits[i - 1].ll, 9, 1) : "".padStart(9))));
	// The chosen model: each step up the ladder from the chroma and hue model only where it earns 2 units per parameter.
	let chosen = fits[3];
	for (const next of fits.slice(4))
		if (next.ll - chosen.ll >= 2 * (next.terms.length - chosen.terms.length))
			chosen = next;
	console.log("\nchosen: " + chosen.name);
	const bounds = { chroma: [Math.min(...rows.map(c => c.C)), Math.max(...rows.map(c => c.C))], lightness: [Math.min(...rows.map(c => c.L)), Math.max(...rows.map(c => c.L))] };
	const round = v => +v.toFixed(5);
	const constant = { intercept: round(chosen.intercept), ...Object.fromEntries(Object.entries(chosen.coefficients).map(([t, v]) => [t, round(v)])),
		chromaRange: bounds.chroma.map(v => +v.toFixed(1)), ...(chosen.terms.includes("lightness") ? { lightnessRange: bounds.lightness.map(v => +v.toFixed(1)) } : {}) };
	console.log("const PREFERENCE = " + JSON.stringify(constant) + ";");

	const predict = c => { const x = chosen.intercept + chosen.terms.reduce((s, t) => s + chosen.coefficients[t] * TERMS[t](c), 0); return 1 / (1 + Math.exp(-x)); };
	console.log("\nbad rate by 30 degree hue bin, observed over predicted");
	const bins = Array.from({ length: 12 }, (_, b) => rows.filter(c => Math.floor(c.h / 30) === b));
	console.log("  bin start " + bins.map((_, b) => String(b * 30).padStart(6)).join(""));
	console.log("  observed  " + bins.map(b => fmt(mean(b.map(c => c.bad)), 6)).join(""));
	console.log("  predicted " + bins.map(b => fmt(mean(b.map(predict)), 6)).join(""));
	console.log("\nbad rate by chroma third, observed over predicted");
	const sorted = rows.slice().sort((p, q) => p.C - q.C), third = Math.ceil(rows.length / 3);
	for (let t = 0; t < 3; ++t) {
		const part = sorted.slice(t * third, (t + 1) * third);
		console.log("  " + fmt(part[0].C, 5, 1) + " to " + fmt(part[part.length - 1].C, 5, 1) + "  observed " + fmt(mean(part.map(c => c.bad)), 5) + "  predicted " + fmt(mean(part.map(predict)), 5));
	}
}

main(process.argv.slice(2));
