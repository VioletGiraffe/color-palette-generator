#!/usr/bin/env node
// Identification metric: the chance a viewer who learned a palette picks the right entry for a
// color shown on its own. Recall is the color plus Gaussian memory noise in OKLab; the viewer
// answers with the nearest palette entry. Noise is anisotropic: lightness and chroma differences
// count by their weight against hue differences. A pair swaps with the chance the noise carries a
// recall past their midpoint, and a color's error is the sum over its pairs, as in the page.
//
//     node data/identify.js [page.html]            the page's generator over fixed seeds and boxes
//     node data/identify.js --hex "#rrggbb ..."     one palette
//     node data/identify.js --file palettes.txt     one palette per line, // comments
//
// The constants below are measured with calibrate.html and data/fit.js; see data/README.md.

"use strict";
const fs = require("fs");
const path = require("path");

// Memory noise, standard deviation in OKLab x100 along hue, for swatches of CALIBRATED_PX.
// A lightness or chroma difference counts W_L or W_C times its size: below 1 the axis is a weaker
// cue than hue, so noise along it is wider by the same factor.
// Fitted by data/fit.js to data/calibration-verdicts-16px.json; see data/README.md.
const SIGMA = 3.5;
const W_L = 0.35;
const W_C = 0.5;
const CALIBRATED_PX = 16;

function srgbToLinear(u) {
	return u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
}

// OKLab x100, so distances read like CIE deltaE.
function labOf(hex) {
	const n = parseInt(hex.slice(1), 16);
	const r = srgbToLinear((n >> 16 & 255) / 255), g = srgbToLinear((n >> 8 & 255) / 255), b = srgbToLinear((n & 255) / 255);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s) * 100,
		(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s) * 100,
		(0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s) * 100];
}

function erfc(x) {
	const t = 1 / (1 + 0.3275911 * Math.abs(x));
	const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
	const tail = poly * Math.exp(-x * x);
	return x >= 0 ? tail : 2 - tail;
}

// Weighted distance of two colors: lightness and radial chroma differences times their weight, the
// hue difference (the ab chord less its radial part) as is. Never through the neutral axis: a dull
// color is as far from its opposite hue as the chord says, which is what the calibration verdicts show.
function weightedDistance(p, q, wL, wC) {
	const dL = (p[0] - q[0]) * wL, dC = Math.hypot(p[1], p[2]) - Math.hypot(q[1], q[2]);
	const chord2 = (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
	return Math.sqrt(dL * dL + wC * wC * dC * dC + Math.max(0, chord2 - dC * dC));
}

// Chance a recall of one color of a pair lands nearer the other: noise of width sigma along the
// pair's line, past the midpoint.
const swapChance = (distance, sigma) => 0.5 * erfc(distance / (2 * sigma) / Math.SQRT2);

// Rows are the color shown, columns the entry answered. Off the diagonal the pair's swap chance;
// on it what is left, floored at zero: the sum over pairs overstates the error of a crowded color.
function confusionMatrix(labs, sigma, wL, wC) {
	const n = labs.length;
	const matrix = Array.from({ length: n }, () => new Float64Array(n));
	for (let i = 0; i < n; ++i) {
		let error = 0;
		for (let j = 0; j < n; ++j)
			if (j !== i)
				error += matrix[i][j] = swapChance(weightedDistance(labs[i], labs[j], wL, wC), sigma);
		matrix[i][i] = Math.max(0, 1 - error);
	}
	return matrix;
}

// Per-color accuracy, the palette's floor and mean, and the pair confused most (either way round).
function summarize(matrix) {
	const n = matrix.length;
	const accuracy = matrix.map((row, i) => row[i]);
	let pair = null, confused = -1;
	for (let i = 0; i < n; ++i)
		for (let j = i + 1; j < n; ++j)
			if (matrix[i][j] + matrix[j][i] > confused) {
				confused = matrix[i][j] + matrix[j][i];
				pair = [i, j];
			}
	return { accuracy, floor: Math.min(...accuracy), mean: accuracy.reduce((s, v) => s + v, 0) / n, pair, confused };
}

function score(hexes) {
	return summarize(confusionMatrix(hexes.map(labOf), SIGMA, W_L, W_C));
}

function distance(p, q) {
	return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function minimumGap(labs) {
	let gap = Infinity;
	for (let i = 0; i < labs.length; ++i)
		for (let j = i + 1; j < labs.length; ++j)
			gap = Math.min(gap, distance(labs[i], labs[j]));
	return gap;
}

const percent = v => (v * 100).toFixed(1).padStart(5) + "%";

function printPalette(hexes) {
	const result = score(hexes);
	const labs = hexes.map(labOf);
	for (let i = 0; i < hexes.length; ++i)
		console.log("  " + hexes[i] + "  " + percent(result.accuracy[i]));
	const [a, b] = result.pair;
	console.log("floor %s  mean %s  min deltaE %s  worst pair %s %s confused %s at deltaE %s",
		percent(result.floor), percent(result.mean), minimumGap(labs).toFixed(1),
		hexes[a], hexes[b], percent(result.confused), distance(labs[a], labs[b]).toFixed(1));
}

function parseHexes(text) {
	return text.match(/#?[0-9a-f]{6}\b/gi)?.map(t => "#" + t.replace("#", "").toLowerCase()) || [];
}

// Loads the page's generator the way data/bench.js does: everything above the ui section is DOM-free.
function loadGenerator(pagePath) {
	const UI_SECTION = "// ---------- ui ----------";
	const source = [...fs.readFileSync(pagePath, "utf8").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
		.map(match => match[1]).find(script => script.includes(UI_SECTION));
	globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
	return (0, eval)(source.slice(0, source.indexOf(UI_SECTION)) + "; generate");
}

// Fixed seeds over fixed range boxes, so two versions of the page compare run for run. The boxes
// are OKLCh ranges (lightness and chroma x100, hue in degrees), as the page's controls are.
function benchmarkPage(pagePath) {
	const generate = loadGenerator(pagePath);
	const boxes = [
		{ name: "default", hMin: 0, hMax: 360, cMin: 5, cMax: 33, lMin: 20, lMax: 80 },
		{ name: "narrow", hMin: 0, hMax: 360, cMin: 8, cMax: 33, lMin: 35, lMax: 65 },
	];
	const counts = [6, 8, 10];
	const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

	console.log(path.basename(pagePath) + " - identification, sigma " + SIGMA + " wL " + W_L + " wC " + W_C);
	let grandFloor = 0, grandMean = 0, runs = 0;
	for (const box of boxes)
		for (const count of counts) {
			let floor = 0, mean = 0, gap = 0, least = 1;
			for (const seed of seeds) {
				const hexes = generate({ count, seed, fixed: [], scale: SIGMA, ...box }).colors.map(color => color.hex);
				const result = score(hexes);
				floor += result.floor;
				mean += result.mean;
				gap += minimumGap(hexes.map(labOf));
				least = Math.min(least, result.floor);
			}
			grandFloor += floor;
			grandMean += mean;
			runs += seeds.length;
			console.log("%s n=%s | floor %s  worst seed %s | mean %s | min deltaE %s",
				box.name.padEnd(7), String(count).padStart(2), percent(floor / seeds.length), percent(least),
				percent(mean / seeds.length), (gap / seeds.length).toFixed(1).padStart(4));
		}
	console.log("over all runs: floor " + percent(grandFloor / runs) + "  mean " + percent(grandMean / runs));
}

function main(args) {
	if (args[0] === "--hex")
		return printPalette(parseHexes(args.slice(1).join(" ")));
	if (args[0] === "--file") {
		for (const line of fs.readFileSync(args[1], "utf8").split(/\r?\n/)) {
			const hexes = parseHexes(line.replace(/#\s.*|^\s*#[^0-9a-f].*/i, ""));
			if (hexes.length > 1) {
				console.log(line.trim());
				printPalette(hexes);
			}
		}
		return;
	}
	benchmarkPage(args[0] || path.join(__dirname, "..", "index.html"));
}

module.exports = { SIGMA, W_L, W_C, CALIBRATED_PX, labOf, weightedDistance, swapChance, confusionMatrix, summarize, score };

if (require.main === module)
	main(process.argv.slice(2));
