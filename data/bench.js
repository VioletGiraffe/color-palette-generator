#!/usr/bin/env node
// Scores a page's generator end to end against the c3 survey votes. Two palette entries are
// confusable when people describe both colors with the same words AND the colors sit close in
// OKLab: same-worded entries far apart are still told apart by memory of the color itself.
// An entry's score is 1 minus its worst confusability against the rest; the palette score is the
// mean over entries.
//
//     node data/bench.js [path-to-index.html]
//
// Runs fixed seeds over fixed range boxes, so two versions of the page compare run for run.

const fs = require("fs");
const path = require("path");

const pagePath = process.argv[2] || path.join(__dirname, "..", "index.html");

// The page holds several scripts; the generator's is the one reaching the ui section, and only the
// part above it runs here - everything below touches the DOM.
const UI_SECTION = "// ---------- ui ----------";
const source = [...fs.readFileSync(pagePath, "utf8").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
	.map(match => match[1]).find(script => script.includes(UI_SECTION));
const body = source.slice(0, source.indexOf(UI_SECTION));
globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
(0, eval)(body + "; globalThis.__page = { generate, CELL_NAMES };");

const model = JSON.parse(fs.readFileSync(path.join(__dirname, "c3_data.json"), "utf8"));
const width = model.terms.length;
const binCount = model.color.length / 3;

const tallies = Array.from({ length: binCount }, () => new Map());
for (let i = 0; i < model.T.length; i += 2)
	tallies[Math.floor(model.T[i] / width)].set(model.T[i] % width, model.T[i + 1]);

const binAt = new Map();
for (let i = 0; i < binCount; ++i)
	binAt.set(model.color.slice(i * 3, i * 3 + 3).join(","), i);

// Same-worded colors this far apart in OKLab deltaE are 1/e as confusable. Calibrated on the
// palette that motivated the naming work: its known-confusable pairs (two greens 18.8 apart with
// 0.91 name overlap, two teal-blues at 0.83) must score confusable, and they sit near 20 deltaE -
// isolated labeling fails at distances side-by-side comparison resolves with ease.
const CONFUSION_SCALE = 30;

// CIE Lab under D65, the space of the survey's bins. rgb components are 0..1 as the page holds them.
function labOf(rgb) {
	const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	const [r, g, b] = rgb.map(lin);
	const f = v => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
	const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
	const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
	const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Rounding can leave the survey's gamut at its edge; the nearest existing bin is the same color
// to within a bin's width.
function binOf(rgb) {
	const lab = labOf(rgb);
	const key = lab.map(v => 5 * Math.round(v / 5)).join(",");
	if (binAt.has(key))
		return binAt.get(key);
	let best = Infinity, at = 0;
	for (let i = 0; i < binCount; ++i) {
		const d = (model.color[i * 3] - lab[0]) ** 2 + (model.color[i * 3 + 1] - lab[1]) ** 2
			+ (model.color[i * 3 + 2] - lab[2]) ** 2;
		if (d < best) {
			best = d;
			at = i;
		}
	}
	return at;
}

// Cosine similarity of two bins' vote distributions: 1 when people word the colors identically.
function nameOverlap(a, b) {
	let dot = 0;
	for (const [term, votes] of a)
		if (b.has(term))
			dot += votes * b.get(term);
	const norm = m => Math.sqrt([...m.values()].reduce((s, v) => s + v * v, 0));
	return dot / (norm(a) * norm(b));
}

// Mean entry score and the worst entry's score: a palette is only as usable as its most
// confusable color.
function identificationScore(colors) {
	const bins = colors.map(color => tallies[binOf(color.rgb)]);
	let sum = 0, floor = 1;
	for (let i = 0; i < colors.length; ++i) {
		let worst = 0;
		for (let j = 0; j < colors.length; ++j) {
			if (j === i)
				continue;
			const apart = Math.hypot(colors[i].lab[0] - colors[j].lab[0], colors[i].lab[1] - colors[j].lab[1],
				colors[i].lab[2] - colors[j].lab[2]) * 100;
			worst = Math.max(worst, nameOverlap(bins[i], bins[j]) * Math.exp(-apart / CONFUSION_SCALE));
		}
		sum += 1 - worst;
		floor = Math.min(floor, 1 - worst);
	}
	return { mean: sum / colors.length, floor };
}

const boxes = [
	{ name: "default", hMin: 0, hMax: 360, sMin: 45, sMax: 90, lMin: 35, lMax: 65 },
	{ name: "wide", hMin: 0, hMax: 360, sMin: 40, sMax: 100, lMin: 25, lMax: 75 },
];
const counts = [8, 12, 15, 24];
const seeds = [1, 2, 3];

console.log(path.basename(pagePath) + " (" + __page.CELL_NAMES.length + " cells)");
let grand = 0, grandFloor = 0, runs = 0;
for (const box of boxes)
	for (const count of counts) {
		let names = 0, gap = 0, score = 0, floor = 0, unsure = 0, ms = 0;
		for (const seed of seeds) {
			const t0 = Date.now();
			const result = __page.generate({ count, seed, fixed: [], scale: 30, ...box });
			ms += Date.now() - t0;
			names += result.named;
			gap += result.gap;
			const id = identificationScore(result.colors);
			score += id.mean;
			floor += id.floor;
			unsure += result.colors.filter(c => !c.confident).length;
		}
		grand += score;
		grandFloor += floor;
		runs += seeds.length;
		console.log("%s n=%s | names %s | gap %s | ID %s worst %s | unsure %s | %sms",
			box.name.padEnd(7), String(count).padStart(2),
			(names / seeds.length).toFixed(1).padStart(4), (gap / seeds.length).toFixed(1).padStart(4),
			(score / seeds.length).toFixed(3), (floor / seeds.length).toFixed(3),
			(unsure / seeds.length).toFixed(1).padStart(4), String(Math.round(ms / seeds.length)).padStart(4));
	}
console.log("over all runs: mean ID " + (grand / runs).toFixed(3) + ", mean worst " + (grandFloor / runs).toFixed(3));
