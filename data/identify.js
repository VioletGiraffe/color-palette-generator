#!/usr/bin/env node
// Two scores for a palette, reported side by side and never combined.
//
// Identification, the one the generator optimizes: the chance a viewer who learned the palette
// picks the right entry for a color shown on its own. Recall is the color plus Gaussian memory
// noise in OKLab; the viewer answers with the nearest palette entry. Noise is anisotropic:
// lightness and chroma differences count by their weight against hue differences. A pair swaps
// with the chance the noise carries a recall past their midpoint, and a color's error is the sum
// over its pairs, as in the page.
//
// Naming, a second opinion the generator does not steer by: the chance two entries would be
// described the same way, from the page's own cell overlap table. Telling two colors apart and
// saying which one you mean are different questions, so a palette where the two scores disagree
// is worth looking at.
//
//     node data/identify.js [page.html]            the page's generator over fixed seeds and boxes
//     node data/identify.js --hex "#rrggbb ..."     one palette
//     node data/identify.js --file palettes.txt     one palette per line, // comments
//
// The identification constants are measured with calibrate.html and data/fit.js, where a pair's
// standing in the gamut counts for with calibrate-hue.html and data/fit_hue.js, and the naming ones
// with calibrate-names.html and data/fit_names.js; see data/README.md.

"use strict";
const fs = require("fs");
const path = require("path");

// Memory noise, standard deviation in OKLab x100 along hue, for swatches of CALIBRATED_PX.
// A lightness or chroma difference counts W_L or W_C times its size: below 1 the axis is a weaker
// cue than hue, so noise along it is wider by the same factor.
// Fitted by data/fit.js to data/calibration-log.json; see data/README.md.
const SIGMA = 3;
const W_L = 0.35;
const W_C = 0.6;
// A dark pair needs more distance than the weights alone give it, as a gain on the whole distance.
// Fitted by data/fit_hue.js to data/light-calibration-log.json and data/hue-log.json, which the
// page's `apart2` carries too. The gain is one at the cusp, 1.24 at the top of the gamut and 0.49
// at the bottom, so the fine threshold runs from 6.5 weighted deltaE near white to 16.5 near black.
const LIGHTNESS_EXPONENT = 0.4;
// Without a floor the gain reaches zero at black, where every pair would read as confusable. The
// calibration reaches down to 6, so anything under this is extrapolation either way.
const LIGHTNESS_FLOOR = 5;
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

const hueOfLab = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;

// ---------- the sRGB gamut and its cusp ----------
// index.html holds the same solver and the same cusp table; the two must agree, since the page
// generates the palettes this file scores and states its lightness range in these coordinates.

// The a and b weight of each LMS term, and the LMS mix of each linear channel: gamutChroma solves
// these same expressions symbolically and must use the identical numbers.
const LMS_A = [0.3963377774, -0.1055613458, -0.0894841775];
const LMS_B = [0.2158037573, -0.0638541728, -1.2914855480];
const RGB_FROM_LMS = [
	[4.0767416621, -3.3077115913, 0.2309699292],
	[-1.2684380046, 2.6097574011, -0.3413193965],
	[-0.0041960863, -0.7034186147, 1.7076147010]];

// Linear sRGB from OKLab, lightness and chroma normalized to 0..1. Components outside [0, 1] mean
// the color is outside the gamut.
function oklabToLinear(L, a, b) {
	const l = (L + LMS_A[0] * a + LMS_B[0] * b) ** 3;
	const m = (L + LMS_A[1] * a + LMS_B[1] * b) ** 3;
	const s = (L + LMS_A[2] * a + LMS_B[2] * b) ** 3;
	return [
		RGB_FROM_LMS[0][0] * l + RGB_FROM_LMS[0][1] * m + RGB_FROM_LMS[0][2] * s,
		RGB_FROM_LMS[1][0] * l + RGB_FROM_LMS[1][1] * m + RGB_FROM_LMS[1][2] * s,
		RGB_FROM_LMS[2][0] * l + RGB_FROM_LMS[2][1] * m + RGB_FROM_LMS[2][2] * s];
}

const inGamut = rgb => rgb.every(v => v >= -1e-6 && v <= 1 + 1e-6);

// Above the most chroma sRGB shows anywhere (32.25, at magenta).
const CHROMA_MAX = 32.5;

// The real roots of a x^3 + b x^2 + c x + d, degenerating to the quadratic and the line.
function cubicRoots(a, b, c, d) {
	if (Math.abs(a) < 1e-12) {
		if (Math.abs(b) < 1e-12)
			return Math.abs(c) < 1e-12 ? [] : [-d / c];
		const discriminant = c * c - 4 * b * d;
		if (discriminant < 0)
			return [];
		const root = Math.sqrt(discriminant);
		return [(-c + root) / (2 * b), (-c - root) / (2 * b)];
	}

	// Depressed to t^3 + p t + q, where x is t less a third of the quadratic coefficient.
	const quad = b / a, lin = c / a, base = d / a;
	const shift = quad / 3;
	const p = lin - quad * quad / 3;
	const q = 2 * quad * quad * quad / 27 - quad * lin / 3 + base;
	if (Math.abs(p) < 1e-14)
		return [Math.cbrt(-q) - shift];

	const delta = q * q / 4 + p * p * p / 27;
	if (delta > 0) {
		const root = Math.sqrt(delta);
		return [Math.cbrt(-q / 2 + root) + Math.cbrt(-q / 2 - root) - shift];
	}
	// Three real roots: p is negative here, so the trigonometric form applies.
	const scale = 2 * Math.sqrt(-p / 3);
	const angle = Math.acos(Math.min(1, Math.max(-1, 3 * q / (p * scale)))) / 3;
	return [0, 1, 2].map(k => scale * Math.cos(angle - 2 * Math.PI * k / 3) - shift);
}

// The most chroma sRGB shows at this lightness and hue; 0 at black and white.
// Along the ray each LMS term is linear in chroma and then cubed, so every linear channel is a
// cubic in it and the sRGB box is six cubic inequalities. Their roots cut the ray into spans that
// are wholly in or out, and the outermost span that is in gives the answer.
function gamutChroma(L, h) {
	const turn = h * Math.PI / 180, toA = Math.cos(turn), toB = Math.sin(turn);
	const light = L / 100, limit = CHROMA_MAX / 100;
	// The LMS terms as light + slope * chroma.
	const slope = LMS_A.map((a, n) => a * toA + LMS_B[n] * toB);
	const breaks = [0, limit];
	for (const mix of RGB_FROM_LMS) {
		let c3 = 0, c2 = 0, c1 = 0, c0 = 0;
		for (let n = 0; n < 3; ++n) {
			const w = mix[n], k = slope[n];
			c3 += w * k * k * k;
			c2 += w * 3 * light * k * k;
			c1 += w * 3 * light * light * k;
			c0 += w * light * light * light;
		}
		for (const target of [0, 1])
			for (const root of cubicRoots(c3, c2, c1, c0 - target))
				if (root > 0 && root < limit)
					breaks.push(root);
	}

	breaks.sort((p, q) => p - q);
	for (let n = breaks.length - 1; n > 0; --n) {
		const mid = (breaks[n - 1] + breaks[n]) / 2;
		if (inGamut(oklabToLinear(light, mid * toA, mid * toB)))
			return breaks[n] * 100;
	}
	return 0;
}

// The lightness at which sRGB shows the most chroma at this hue, the gamut cusp. A coarse scan
// brackets the peak, golden-section search narrows it to 0.1 L: chroma over lightness at one hue
// has a single peak.
const CUSP_SCAN_LEVELS = 24;
function searchCuspLightness(h) {
	let bestLevel = 0, bestC = 0;
	for (let n = 1; n < CUSP_SCAN_LEVELS; ++n) {
		const C = gamutChroma(100 * n / CUSP_SCAN_LEVELS, h);
		if (C > bestC) {
			bestLevel = n;
			bestC = C;
		}
	}

	const R = (Math.sqrt(5) - 1) / 2;
	let lo = 100 * (bestLevel - 1) / CUSP_SCAN_LEVELS, hi = 100 * (bestLevel + 1) / CUSP_SCAN_LEVELS;
	let a = hi - R * (hi - lo), b = lo + R * (hi - lo), Ca = gamutChroma(a, h), Cb = gamutChroma(b, h);
	while (hi - lo > 0.1) {
		if (Ca < Cb) {
			lo = a;
			a = b;
			Ca = Cb;
			b = lo + R * (hi - lo);
			Cb = gamutChroma(b, h);
		} else {
			hi = b;
			b = a;
			Cb = Ca;
			a = hi - R * (hi - lo);
			Ca = gamutChroma(a, h);
		}
	}
	return (lo + hi) / 2;
}

// The cusp depends on the hue alone, so the search runs once per sample and everything else reads
// the samples. Built on first use: the search is far too slow to run per color.
// The six sRGB primaries and secondaries are corners of the ridge; their hues are sampled too, so
// no interpolated segment spans one.
const CUSP_STEP = 1;
const CUSP_CORNER_HUES = ["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff"]
	.map(hex => hueOfLab(labOf(hex)));
let cuspSamples = null;

function cuspTable() {
	if (!cuspSamples) {
		const hues = Array.from({ length: Math.round(360 / CUSP_STEP) }, (_, n) => n * CUSP_STEP)
			.concat(CUSP_CORNER_HUES).sort((a, b) => a - b);
		cuspSamples = { hues, light: hues.map(searchCuspLightness) };
	}
	return cuspSamples;
}

// The cusp lightness at any hue, straight between the samples either side of it.
function cuspLightness(h) {
	const { hues, light } = cuspTable();
	const hue = ((h % 360) + 360) % 360;
	// The first sample is hue 0, so the search never lands before it and `before` stays in range.
	let lo = 0, hi = hues.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (hues[mid] <= hue)
			lo = mid + 1;
		else
			hi = mid;
	}
	// Past the last sample the segment wraps to the first, a turn of 360 away.
	const before = lo - 1, after = lo % hues.length;
	const start = hues[before], end = hues[after] + (after === 0 ? 360 : 0);
	const within = end > start ? (hue - start) / (end - start) : 0;
	return light[before] * (1 - within) + light[after] * within;
}

// Where a color stands in its own hue's gamut, as the page states its ranges: lightness against the
// cusp, which sits at CUSP_ANCHOR at every hue with 0 black and 100 white, and chroma as a fraction
// of the reach at that lightness and hue. Both are coordinates of the gamut's shape, not perceptual
// quantities - the metric itself stays in absolute OKLab.
const CUSP_ANCHOR = 50;
function relativePosition(lab) {
	const h = hueOfLab(lab), cusp = cuspLightness(h), reach = gamutChroma(lab[0], h);
	const relativeL = lab[0] <= cusp ? CUSP_ANCHOR * lab[0] / cusp
		: CUSP_ANCHOR + (100 - CUSP_ANCHOR) * (lab[0] - cusp) / (100 - cusp);
	return [relativeL, reach > 0 ? Math.hypot(lab[1], lab[2]) / reach : 0];
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
// The anisotropic part alone, without the gain below: the fit scripts measure the gain against this,
// so it must stay the raw quantity they were fitted on.
function weightedDistance(p, q, wL, wC) {
	const dL = (p[0] - q[0]) * wL, dC = Math.hypot(p[1], p[2]) - Math.hypot(q[1], q[2]);
	const chord2 = (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
	return Math.sqrt(dL * dL + wC * wC * dC * dC + Math.max(0, chord2 - dC * dC));
}

// How far apart a pair reads, which is the weighted distance times the gain for where the pair
// stands in its hues' gamuts. This is the metric the generator optimizes and this file scores.
const recallDistance = (p, q, relLp, relLq, wL, wC) => weightedDistance(p, q, wL, wC)
	* (Math.max(LIGHTNESS_FLOOR, (relLp + relLq) / 2) / CUSP_ANCHOR) ** LIGHTNESS_EXPONENT;

// Chance a recall of one color of a pair lands nearer the other: noise of width sigma along the
// pair's line, past the midpoint.
const swapChance = (distance, sigma) => 0.5 * erfc(distance / (2 * sigma) / Math.SQRT2);

// Rows are the color shown, columns the entry answered. Off the diagonal the pair's swap chance;
// on it what is left, floored at zero: the sum over pairs overstates the error of a crowded color.
function confusionMatrix(labs, sigma, wL, wC) {
	const n = labs.length;
	const matrix = Array.from({ length: n }, () => new Float64Array(n));
	// Once per color rather than once per pair: the cusp table is the costly part of the gain.
	const relL = labs.map(lab => relativePosition(lab)[0]);
	for (let i = 0; i < n; ++i) {
		let error = 0;
		for (let j = 0; j < n; ++j)
			if (j !== i)
				error += matrix[i][j] = swapChance(recallDistance(labs[i], labs[j], relL[i], relL[j], wL, wC), sigma);
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

function printPalette(hexes, page) {
	const result = score(hexes);
	const naming = nameCollision(hexes, page);
	const labs = hexes.map(labOf);
	for (let i = 0; i < hexes.length; ++i)
		console.log("  " + hexes[i] + "  identified " + percent(result.accuracy[i])
			+ "  named " + percent(naming.distinct[i]) + "  " + naming.names[i]);
	const [a, b] = result.pair;
	console.log("identification: floor %s  mean %s  min deltaE %s  worst pair %s %s confused %s at deltaE %s",
		percent(result.floor), percent(result.mean), minimumGap(labs).toFixed(1),
		hexes[a], hexes[b], percent(result.confused), distance(labs[a], labs[b]).toFixed(1));
	const [c, d] = naming.pair;
	console.log("naming:         floor %s  mean %s  worst pair %s %s both %s / %s, colliding %s",
		percent(naming.floor), percent(naming.mean), hexes[c], hexes[d],
		naming.names[c], naming.names[d], percent(naming.collided));
}

function parseHexes(text) {
	return text.match(/#?[0-9a-f]{6}\b/gi)?.map(t => "#" + t.replace("#", "").toLowerCase()) || [];
}

// Everything above the ui section is DOM-free, so it evaluates here.
// The page's generator and its naming tables, cached per path: the eval is the costly part and both
// scores reach for it. The naming tables are the page's own, so the score is about the names it shows.
const pages = new Map();
function loadPage(pagePath) {
	if (!pages.has(pagePath)) {
		const UI_SECTION = "// ---------- ui ----------";
		const source = [...fs.readFileSync(pagePath, "utf8").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
			.map(match => match[1]).find(script => script.includes(UI_SECTION));
		globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
		pages.set(pagePath, (0, eval)(source.slice(0, source.indexOf(UI_SECTION))
			+ "; ({ generate, cellOf, CELL_NAMES, CELL_OVERLAP })"));
	}
	return pages.get(pagePath);
}

const rgbOf = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);

// How far apart two colors must be for a shared name to stop mattering, in weighted deltaE. Not
// fitted: the calibration verdicts answer whether two colors are told apart, never whether they are
// called the same. Set so the pairs the old name-based bench was built around still read as confusable.
// calibrate-names.html and data/fit_names.js measure the naming side directly.
const NAME_DECAY = 18;

// The naming score, kept apart from the identification one rather than folded in: it asks whether
// two entries would be described the same way, which distance alone cannot see. A pair collides by
// the overlap of their cells' vote distributions, faded by how far apart the colors are.
// Cells past the table carry no word of their own, so they collide only with their own kind.
function nameCollision(hexes, page) {
	const labs = hexes.map(labOf);
	const cells = hexes.map(hex => page.cellOf(rgbOf(hex)).cell);
	const width = page.CELL_NAMES.length;
	const overlap = (i, j) => cells[i] === cells[j] ? 1
		: cells[i] < width && cells[j] < width ? page.CELL_OVERLAP[cells[i] * width + cells[j]] / 255 : 0;

	const worst = hexes.map(() => 0);
	let pair = null, collided = -1;
	for (let i = 0; i < hexes.length; ++i)
		for (let j = i + 1; j < hexes.length; ++j) {
			const shared = overlap(i, j) * Math.exp(-weightedDistance(labs[i], labs[j], W_L, W_C) / NAME_DECAY);
			worst[i] = Math.max(worst[i], shared);
			worst[j] = Math.max(worst[j], shared);
			if (shared > collided) {
				collided = shared;
				pair = [i, j];
			}
		}
	const distinct = worst.map(v => 1 - v);
	return { distinct, floor: Math.min(...distinct), mean: distinct.reduce((s, v) => s + v, 0) / hexes.length,
		pair, collided, names: cells.map(cell => page.CELL_NAMES[cell] ?? "unnamed") };
}

// Fixed seeds over fixed range boxes, so two versions of the page compare run for run. The boxes
// are OKLCh ranges (lightness and chroma x100, hue in degrees), as the page's controls are.
function benchmarkPage(pagePath) {
	const page = loadPage(pagePath);
	const generate = page.generate;
	const boxes = [
		{ name: "default", hMin: 0, hMax: 360, cMin: 5, cMax: 32.5, lMin: 20, lMax: 80 },
		{ name: "narrow", hMin: 0, hMax: 360, cMin: 8, cMax: 32.5, lMin: 35, lMax: 65 },
	];
	const counts = [6, 8, 10];
	const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

	console.log(path.basename(pagePath) + " - identification, sigma " + SIGMA + " wL " + W_L + " wC " + W_C
		+ "; naming, decay " + NAME_DECAY);
	console.log("                 identification          naming");
	// The two scores are reported side by side and never combined: identification is the one the
	// generator optimizes, naming the second opinion, and a run where they disagree is the finding.
	let grandFloor = 0, grandMean = 0, grandNamed = 0, runs = 0;
	for (const box of boxes)
		for (const count of counts) {
			let floor = 0, mean = 0, gap = 0, least = 1, namedFloor = 0, namedMean = 0, leastNamed = 1;
			for (const seed of seeds) {
				const hexes = generate({ count, seed, fixed: [], scale: SIGMA, ...box }).colors.map(color => color.hex);
				const result = score(hexes);
				const naming = nameCollision(hexes, page);
				floor += result.floor;
				mean += result.mean;
				gap += minimumGap(hexes.map(labOf));
				least = Math.min(least, result.floor);
				namedFloor += naming.floor;
				namedMean += naming.mean;
				leastNamed = Math.min(leastNamed, naming.floor);
			}
			grandFloor += floor;
			grandMean += mean;
			grandNamed += namedFloor;
			runs += seeds.length;
			console.log("%s n=%s | floor %s worst %s mean %s | floor %s worst %s mean %s | min deltaE %s",
				box.name.padEnd(7), String(count).padStart(2), percent(floor / seeds.length), percent(least),
				percent(mean / seeds.length), percent(namedFloor / seeds.length), percent(leastNamed),
				percent(namedMean / seeds.length), (gap / seeds.length).toFixed(1).padStart(4));
		}
	console.log("over all runs: identification floor " + percent(grandFloor / runs) + "  mean " + percent(grandMean / runs)
		+ " | naming floor " + percent(grandNamed / runs));
}

function main(args) {
	// A named palette needs the page's naming tables, so scoring loose hexes reads the page too.
	const defaultPage = path.join(__dirname, "..", "index.html");
	if (args[0] === "--hex")
		return printPalette(parseHexes(args.slice(1).join(" ")), loadPage(defaultPage));
	if (args[0] === "--file") {
		const page = loadPage(defaultPage);
		for (const line of fs.readFileSync(args[1], "utf8").split(/\r?\n/)) {
			const hexes = parseHexes(line.replace(/#\s.*|^\s*#[^0-9a-f].*/i, ""));
			if (hexes.length > 1) {
				console.log(line.trim());
				printPalette(hexes, page);
			}
		}
		return;
	}
	benchmarkPage(args[0] || defaultPage);
}

module.exports = { SIGMA, W_L, W_C, LIGHTNESS_EXPONENT, NAME_DECAY, CALIBRATED_PX,
	labOf, rgbOf, weightedDistance, recallDistance, swapChance, confusionMatrix, summarize, score, nameCollision,
	loadPage, gamutChroma, cuspLightness, relativePosition };

if (require.main === module)
	main(process.argv.slice(2));
