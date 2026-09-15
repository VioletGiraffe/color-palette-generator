#!/usr/bin/env node
// Reads calibrate-members.html logs: per palette, the members marked bad. Where in the box do the bad colors
// live, and is bad a property of the color or of its company?
//
//     node data/fit_members.js log.json [more.json ...]
//
// Readings:
//   1. Bad rate by hue bin, by lightness and chroma third of the colors shown, by name.
//   2. A logistic per color feature, intercept and slope, against the intercept alone: lightness, chroma, the
//      nearest other member's metric distance, the number of members sharing the color's name. The hue bins as
//      a twelve-rate model against the intercept, for the same log-likelihood scale.
//   3. The shared colors, each judged in two palettes: how often the verdict repeats, against independence
//      at the shared colors' own bad rate, and among the disagreements whether the bad verdict fell in the
//      company where the color's nearest neighbour was closer.

"use strict";
const fs = require("fs");
const { labOf, recallDistance, W_L, W_C } = require("./identify.js");

const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const sd = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2)));
const fmt = (x, w = 7, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "-").padStart(w);
const rate = (bad, n) => fmt(bad, 4, 0) + "/" + String(n).padEnd(4) + fmt(n ? bad / n : NaN, 5) + " ";

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

// One row per color shown: its coordinates, name, company features and the verdict.
function colorsOf(records) {
	const rows = [];
	for (const r of records) {
		const labs = r.hexes.map(labOf);
		r.hexes.forEach((hex, k) => {
			const lab = labs[k];
			const nearest = Math.min(...labs.map((other, j) => j === k ? Infinity : recallDistance(lab, other, W_L, W_C)));
			rows.push({ hex, record: r, L: lab[0], C: Math.hypot(lab[1], lab[2]), hue: hueOf(lab), name: r.names[k], nearest,
				sameName: r.names.filter(n => n === r.names[k]).length - 1, bad: r.bad.includes(hex) ? 1 : 0 });
		});
	}
	return rows;
}

// ---------- 1. rates ----------

function rates(rows) {
	console.log("\nbad rate per 30 degree hue bin: bad/shown, rate");
	const bins = Array.from({ length: 12 }, (_, b) => rows.filter(c => Math.floor(c.hue / 30) === b));
	console.log("bin start " + bins.map((_, b) => String(b * 30).padStart(14)).join(""));
	console.log("          " + bins.map(b => rate(b.filter(c => c.bad).length, b.length).padStart(14)).join(""));
	for (const [label, key] of [["lightness", "L"], ["chroma", "C"]]) {
		const sorted = rows.slice().sort((p, q) => p[key] - q[key]), third = Math.ceil(sorted.length / 3);
		console.log("\nbad rate by " + label + " third of the colors shown");
		for (let t = 0; t < 3; ++t) {
			const part = sorted.slice(t * third, (t + 1) * third);
			console.log("  " + fmt(part[0][key], 5, 1) + " to " + fmt(part[part.length - 1][key], 5, 1) + "   " + rate(part.filter(c => c.bad).length, part.length));
		}
	}
	console.log("\nbad rate by name, five or more shown, worst first");
	const byName = new Map();
	for (const c of rows)
		byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
	[...byName].filter(([, cs]) => cs.length >= 5).map(([name, cs]) => [name, cs.filter(c => c.bad).length, cs.length])
		.sort((p, q) => q[1] / q[2] - p[1] / p[2]).forEach(([name, bad, n]) => console.log("  " + name.padEnd(14) + rate(bad, n)));
}

// ---------- 2. features ----------

// Intercept and slope by Newton's method on the standardized feature; the gain is over the intercept alone.
function logistic(rows, feature) {
	const x = rows.map(feature), m = mean(x), s = sd(x) || 1, z = x.map(v => (v - m) / s), y = rows.map(c => c.bad);
	const ll = (a, b) => z.reduce((sum, v, i) => { const p = 1 / (1 + Math.exp(-(a + b * v))); return sum + Math.log(y[i] ? p : 1 - p); }, 0);
	let a = Math.log(mean(y) / (1 - mean(y))), b = 0;
	for (let n = 0; n < 30; ++n) {
		let ga = 0, gb = 0, haa = 0, hab = 0, hbb = 0;
		z.forEach((v, i) => { const p = 1 / (1 + Math.exp(-(a + b * v))), w = p * (1 - p); ga += y[i] - p; gb += (y[i] - p) * v; haa += w; hab += w * v; hbb += w * v * v; });
		const det = haa * hbb - hab * hab;
		if (Math.abs(det) < 1e-12)
			break;
		a += (hbb * ga - hab * gb) / det;
		b += (haa * gb - hab * ga) / det;
	}
	return { slope: b, gain: ll(a, b) - ll(Math.log(mean(y) / (1 - mean(y))), 0) };
}

function features(rows) {
	console.log("\nper color feature, a logistic with intercept and slope on the standardized feature; more bad where the slope is positive");
	console.log("  feature                          slope   LL gain");
	const list = { lightness: c => c.L, chroma: c => c.C, "nearest member, metric": c => c.nearest, "members with the same name": c => c.sameName };
	for (const [name, feature] of Object.entries(list)) {
		const f = logistic(rows, feature);
		console.log("  " + name.padEnd(32) + fmt(f.slope, 6) + fmt(f.gain, 9, 1));
	}
	const p0 = mean(rows.map(c => c.bad)), ll0 = rows.reduce((s, c) => s + Math.log(c.bad ? p0 : 1 - p0), 0);
	let ll12 = 0;
	for (let b = 0; b < 12; ++b) {
		const part = rows.filter(c => Math.floor(c.hue / 30) === b), p = part.length ? mean(part.map(c => c.bad)) : 0;
		ll12 += part.reduce((s, c) => s + (c.bad ? (p ? Math.log(p) : 0) : (p < 1 ? Math.log(1 - p) : 0)), 0);
	}
	console.log("  " + "hue, twelve bin rates".padEnd(32) + fmt(NaN, 6) + fmt(ll12 - ll0, 9, 1) + "   (eleven parameters)");
}

// ---------- 3. company ----------

function company(rows, records) {
	const bySeed = new Map(records.map(r => [r.source + " " + r.seed, r]));
	const pairs = [];
	for (const r of records) {
		const partner = r.fixed && bySeed.get(r.source + " " + (r.seed - 1));
		if (!partner || !partner.hexes.includes(r.fixed))
			continue;
		const here = rows.find(c => c.record === r && c.hex === r.fixed), there = rows.find(c => c.record === partner && c.hex === r.fixed);
		pairs.push([here, there]);
	}
	if (!pairs.length) {
		console.log("\nno shared color judged in both its palettes");
		return;
	}
	const both = pairs.filter(([p, q]) => p.bad && q.bad).length, one = pairs.filter(([p, q]) => p.bad !== q.bad).length, none = pairs.length - both - one;
	const p = mean(pairs.flat().map(c => c.bad));
	const agree = (both + none) / pairs.length, chance = p * p + (1 - p) * (1 - p);
	console.log("\nshared colors judged in two palettes: " + pairs.length + "; bad in both " + both + ", in one " + one + ", in neither " + none
		+ "; bad rate among them " + fmt(p, 5));
	console.log("  the verdict repeats " + fmt(agree, 5) + " of the time, independence gives " + fmt(chance, 5) + ", kappa " + fmt((agree - chance) / (1 - chance), 5));
	const discordant = pairs.filter(([p, q]) => p.bad !== q.bad);
	if (discordant.length) {
		const closer = discordant.filter(([p, q]) => (p.bad ? p : q).nearest < (p.bad ? q : p).nearest).length;
		console.log("  of the " + discordant.length + " disagreements, the bad verdict fell in the company with the closer nearest member " + closer + " times");
	}
}

// ---------- main ----------

function main(args) {
	if (!args.length) {
		console.error("usage: node data/fit_members.js log.json [more.json ...]");
		process.exit(1);
	}
	const records = readLogs(args), rows = colorsOf(records);
	const bad = rows.filter(c => c.bad).length;
	console.log(records.length + " palettes over " + args.length + " log(s), " + rows.length + " colors shown, " + bad + " marked bad (" + fmt(bad / rows.length, 4) + "); "
		+ records.filter(r => !r.bad.length).length + " palettes with none bad; median " + fmt(records.map(r => r.ms).sort((p, q) => p - q)[records.length >> 1] / 1000, 4, 1) + " s per palette");
	rates(rows);
	features(rows);
	company(rows, records);
}

main(process.argv.slice(2));
