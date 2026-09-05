#!/usr/bin/env node
// Fits the naming score of data/identify.js to a calibrate-names.html log: whether the cell overlap
// table predicts that two colors get the same name, and whether the distance between them adds
// anything the table does not already say.
//
//     node data/fit_names.js log.json [more.json ...] [page.html]
//
// The log holds one word per color, so every pair of answers is a datum: n colors carry n(n-1)/2
// pairs, and they cost one judgment each rather than one per pair.
//
// The page offers a shortlist rather than all 36 words, so the first thing reported is what that
// cost: how often the full list was needed, and which words the shortlist had missed.

"use strict";
const fs = require("fs");
const path = require("path");
const { labOf, rgbOf, weightedDistance, W_L, W_C, NAME_DECAY, loadPage } = require("./identify.js");

// Overlap bands to report the observed same-name rate in. The last holds pairs the page puts in one
// cell, where the table says the words agree outright.
const OVERLAP_BANDS = [0, 0.05, 0.2, 0.4, 0.6, 0.8, 1];
const DISTANCE_BANDS = [0, 5, 10, 15, 20, 30, Infinity];
// Decay scales tried, in weighted deltaE. Infinity is the table alone, with distance ignored.
const DECAYS = [4, 6, 8, 11, 14, 18, 23, 30, 40, 60, 100, Infinity];

const files = process.argv.slice(2);
const pagePath = files.find(name => name.endsWith(".html")) || path.join(__dirname, "..", "index.html");
const logs = files.filter(name => !name.endsWith(".html"));
if (!logs.length) {
	console.error("no log: node data/fit_names.js log.json [page.html]");
	process.exit(1);
}

const page = loadPage(pagePath);
const width = page.CELL_NAMES.length;
const answers = [];
for (const file of logs) {
	const log = JSON.parse(fs.readFileSync(file, "utf8"));
	for (const run of log.runs || [])
		for (const answer of run.answers)
			if (answer.name)
				answers.push({ ...answer, swatchPx: run.swatchPx });
}
if (!answers.length) {
	console.error("no named colors in the logs");
	process.exit(1);
}

for (const answer of answers) {
	answer.lab = labOf(answer.hex);
	answer.cell = page.cellOf(rgbOf(answer.hex)).cell;
	answer.pageName = page.CELL_NAMES[answer.cell] ?? "unnamed";
}
const sizes = [...new Set(answers.map(a => a.swatchPx))];
const agreed = answers.filter(a => a.name === a.pageName).length;
console.log(answers.length + " named colors, swatch " + sizes.join("/") + " px");
console.log("the word matches the page's cell for " + (100 * agreed / answers.length).toFixed(1) + "%");

// What the shortlist cost. The page offers the words owning a bin near the color and keeps the full
// list one click away; an answer that needed the click is one the sweep did not hold, and its rate
// is the bound on how much the shortlist could have steered the rest. A word chosen from the
// shortlist is not evidence that no better word existed outside it, so this rate is reported before
// anything is fitted, and a high one means the fit below is measuring the shortlist as much as the
// observer.
const shortlisted = answers.filter(a => a.offered);
if (shortlisted.length) {
	const escaped = shortlisted.filter(a => a.expanded);
	const offeredSizes = shortlisted.map(a => a.offered.length).sort((x, y) => x - y);
	console.log("shortlist: %s of %s answers were taken from it, %s needed the full list (%s%%)",
		shortlisted.length - escaped.length, shortlisted.length, escaped.length,
		(100 * escaped.length / shortlisted.length).toFixed(1));
	console.log("  words offered per color: median %s, most %s", offeredSizes[offeredSizes.length >> 1],
		offeredSizes[offeredSizes.length - 1]);
	// A word chosen after the click that the sweep did hold means the shortlist was read past, not missed.
	const missed = escaped.filter(a => !a.offered.includes(a.name));
	console.log("  of those, %s chose a word the sweep had not offered", missed.length);
	if (missed.length) {
		const words = new Map();
		for (const a of missed)
			words.set(a.name, (words.get(a.name) || 0) + 1);
		console.log("  words the sweep missed: " + [...words].sort((x, y) => y[1] - x[1])
			.map(([word, n]) => word + " " + n).join(", "));
	}
	if (shortlisted.length < answers.length)
		console.log("warning: %s answers carry no shortlist, so the log mixes two tasks", answers.length - shortlisted.length);
}

// Where the words part company with the partition. A word the page never predicts is a cell whose
// territory the survey and this observer disagree about.
const misses = new Map();
for (const a of answers)
	if (a.name !== a.pageName) {
		const key = a.pageName + " -> " + a.name;
		misses.set(key, (misses.get(key) || 0) + 1);
	}
if (misses.size) {
	console.log("\nmost common disagreements: the page's cell, then the word given");
	for (const [key, count] of [...misses].sort((p, q) => q[1] - p[1]).slice(0, 10))
		console.log("  " + String(count).padStart(4) + "  " + key);
}

const overlapOf = (a, b) => a.cell === b.cell ? 1
	: a.cell < width && b.cell < width ? page.CELL_OVERLAP[a.cell * width + b.cell] / 255 : 0;

const pairs = [];
for (let i = 0; i < answers.length; ++i)
	for (let j = i + 1; j < answers.length; ++j)
		pairs.push({ overlap: overlapOf(answers[i], answers[j]), same: answers[i].name === answers[j].name,
			distance: weightedDistance(answers[i].lab, answers[j].lab, W_L, W_C) });

// The table's claim, band by band: of the pairs it puts at this overlap, how many really share a word.
console.log("\n" + pairs.length + " pairs. Predicted overlap against the share that got the same word:");
console.log("  overlap        pairs   same word");
for (let k = 0; k < OVERLAP_BANDS.length; ++k) {
	const lo = OVERLAP_BANDS[k], hi = OVERLAP_BANDS[k + 1];
	const band = hi === undefined ? pairs.filter(p => p.overlap >= 1) : pairs.filter(p => p.overlap >= lo && p.overlap < hi);
	if (!band.length)
		continue;
	const label = hi === undefined ? "same cell" : lo.toFixed(2) + " to " + hi.toFixed(2);
	console.log("  " + label.padEnd(14) + String(band.length).padStart(6) + "   "
		+ (100 * band.filter(p => p.same).length / band.length).toFixed(1).padStart(5) + "%");
}

// Words shared across cells the page keeps apart: where its partition is finer than this observer's.
const shared = new Map();
for (let i = 0; i < answers.length; ++i)
	for (let j = i + 1; j < answers.length; ++j)
		if (answers[i].name === answers[j].name && answers[i].cell !== answers[j].cell) {
			const key = [answers[i].pageName, answers[j].pageName].sort().join(" and ") + " both called " + answers[i].name;
			shared.set(key, (shared.get(key) || 0) + 1);
		}
if (shared.size) {
	console.log("\ncells the page separates that got one word here");
	for (const [key, count] of [...shared].sort((p, q) => q[1] - p[1]).slice(0, 10))
		console.log("  " + String(count).padStart(4) + "  " + key);
}

// Only pairs the page puts in one cell can say anything about distance. Across cells the words
// differ because the cells do, and different-cell pairs are the farther apart ones, so pooling them
// makes distance stand in for the cell and invents a decay where there is none.
// Within a cell the overlap is fixed at 1, leaving the chance of a shared word as a base rate the
// observer holds anywhere times the decay. The base is free: a flat rate below 1 is a steady lapse,
// not a decay, and without it the fit reads one as the other.
const together = pairs.filter(p => p.overlap >= 1);
console.log("\n" + together.length + " pairs the page puts in one cell, by distance - the only pairs distance can speak to:");
console.log("  weighted deltaE   pairs   same word");
for (let k = 0; k < DISTANCE_BANDS.length - 1; ++k) {
	const lo = DISTANCE_BANDS[k], hi = DISTANCE_BANDS[k + 1];
	const band = together.filter(p => p.distance >= lo && p.distance < hi);
	if (!band.length)
		continue;
	const label = hi === Infinity ? lo + " and up" : lo + " to " + hi;
	console.log("  " + label.padEnd(16) + String(band.length).padStart(6) + "   "
		+ (100 * band.filter(p => p.same).length / band.length).toFixed(1).padStart(5) + "%");
}

const BASES = Array.from({ length: 21 }, (_, k) => 0.5 + k * 0.025);
const logLikelihood = (built, decay) => Math.max(...BASES.map(base => built.reduce((sum, p) => {
	const chance = Math.min(0.999, Math.max(0.001, base * Math.exp(-p.distance / decay)));
	return sum + Math.log(p.same ? chance : 1 - chance);
}, 0)));

// Same-cell pairs among a set of colors, which may hold a color more than once.
function samePairs(picked) {
	const built = [];
	for (let i = 0; i < picked.length; ++i)
		for (let j = i + 1; j < picked.length; ++j) {
			const a = answers[picked[i]], b = answers[picked[j]];
			if (a.cell === b.cell)
				built.push({ same: a.name === b.name, distance: weightedDistance(a.lab, b.lab, W_L, W_C) });
		}
	return built;
}

const all = answers.map((_, i) => i);
const lls = DECAYS.map(decay => logLikelihood(together, decay));
const top = Math.max(...lls);
console.log("\ndecay profile over same-cell pairs: scale in weighted deltaE, log-likelihood below the best");
DECAYS.forEach((decay, k) => console.log("  " + String(decay).padStart(8) + "  " + (lls[k] - top).toFixed(1).padStart(8)
	+ (decay === NAME_DECAY ? "   <- NAME_DECAY in identify.js" : "")));

// Pairs share colors, so the likelihood above is not a real one and its curvature would claim a
// precision the data does not hold: one color named oddly turns every pair it sits in. The colors
// are what was sampled independently, so the spread comes from resampling those.
const BOOTSTRAPS = 200;
const drawn = [];
for (let n = 0; n < BOOTSTRAPS; ++n) {
	const picked = all.map(() => Math.floor(Math.random() * all.length));
	const built = samePairs(picked);
	if (!built.length)
		continue;
	const scores = DECAYS.map(decay => logLikelihood(built, decay));
	drawn.push(DECAYS[scores.indexOf(Math.max(...scores))]);
}
drawn.sort((p, q) => p - q);
const at = share => drawn[Math.min(drawn.length - 1, Math.floor(share * drawn.length))];
const flat = drawn.filter(scale => scale === Infinity).length;
console.log("\nresampling the colors " + BOOTSTRAPS + " times, the best scale lands between "
	+ at(0.05) + " and " + at(0.95) + ", no decay at all in " + Math.round(100 * flat / drawn.length) + "% of them.");
console.log(flat >= 0.05 * drawn.length
	? "A decay is not established: within a cell the words hold well enough at any distance, so the\n"
		+ "distance factor in identify.js is not earning its place on this evidence."
	: "A decay earns its place; " + at(0.5) + " is the middle of the resampled fits, for NAME_DECAY in data/identify.js.");
