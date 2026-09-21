#!/usr/bin/env node
// Two scores for a palette, reported side by side and never combined.
//
// Identification, the one the generator optimizes: the chance a viewer who learned the palette
// picks the right entry for a color shown on its own. Recall is the color plus Gaussian memory
// noise in OKLab; the viewer answers with the nearest palette entry. Noise is anisotropic:
// lightness and chroma differences count by their weight against hue differences, and hues are
// respaced by HUE_DENSITY first. A pair swaps with the chance the noise carries a recall past their
// midpoint, and a color's error is the sum over its pairs, as in the page.
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
// The identification constants are measured with data/calibrate.html and data/fit.js, the lightness
// gain with the light-ground rounds (data/calibrate-hue.html, data/calibrate-cusp.html) and data/fit_hue.js,
// and the naming ones with data/calibrate-names.html and data/fit_names.js; see data/scripts.md.

"use strict";
const fs = require("fs");
const path = require("path");

// Memory noise, standard deviation in OKLab x100 along hue, for swatches of CALIBRATED_PX.
// A lightness or chroma difference counts W_L or W_C times its size: below 1 the axis is a weaker
// cue than hue, so noise along it is wider by the same factor.
// SIGMA and W_L are fitted by data/fit.js to data/calibration-log.json, W_L held under the preference rounds;
// W_C is the preference rounds' chroma pairs, a chroma gap reading at the metric's unit; see data/scripts.md.
const SIGMA = 3;
const W_L = 0.35;
const W_C = 1;
// A hue difference grows with chroma at this power, one at CHROMA_REFERENCE; the preference rounds at
// 85% and 50% of the reach. Below CHROMA_FLOOR the scale is held.
const CHROMA_POWER = 0.75;
const CHROMA_REFERENCE = 15;
const CHROMA_FLOOR = 1;
// A gain on the whole distance by the pair's mean lightness: one at LIGHTNESS_REFERENCE, rising
// toward black and toward white, where a pair is wanted at less distance. The preference rounds at
// lightness 25, 50 and 75 of the cusp; the recall calibration ran the dark side the other way. Absolute
// lightness, not the cusp-relative coordinate: a round of lightness pairs ranks the two alike, and
// data/calibrate-cusp.html chose absolute for recall.
const LIGHTNESS_EXPONENT = 0.5;
// The gain's minimum, the cusps' own lightness
const LIGHTNESS_REFERENCE = 68;
// The rounds reach down to 25; the gain is held below this.
const LIGHTNESS_FLOOR = 20;
function lightnessGain(L) {
	const l = Math.max(LIGHTNESS_FLOOR, L);
	return (Math.max(l, LIGHTNESS_REFERENCE) / Math.min(l, LIGHTNESS_REFERENCE)) ** LIGHTNESS_EXPONENT;
}
const hueScaleAt = C => (Math.max(CHROMA_FLOOR, C) / CHROMA_REFERENCE) ** (CHROMA_POWER - 1);
const CALIBRATED_PX = 16;
// Each hue's share of the circle in the metric, per whole degree at mean 1; the page's copy, which
// loadPage checks against this one. Fitted to the hue boundary rounds under the preference question, the
// output of node data/fit_hue_density.js --own-cuts --ridge 10 --p 0.75 --table over boundary-4-log.json to
// boundary-9-log.json. See index.html.
const HUE_DENSITY = [
	0.833, 0.857, 0.881, 0.906, 0.932, 0.958, 0.985, 1.013, 1.042, 1.071, 1.101, 1.133, 1.165, 1.198, 1.231, 1.266, 1.302,
	1.339, 1.377, 1.416, 1.456, 1.497, 1.539, 1.583, 1.628, 1.674, 1.721, 1.77, 1.82, 1.871, 1.924, 1.863, 1.803, 1.746,
	1.69, 1.636, 1.584, 1.533, 1.484, 1.437, 1.391, 1.347, 1.304, 1.262, 1.222, 1.183, 1.145, 1.109, 1.073, 1.039, 1.006,
	0.974, 0.943, 0.913, 0.883, 0.855, 0.828, 0.802, 0.776, 0.751, 0.727, 0.717, 0.708, 0.698, 0.689, 0.679, 0.67, 0.661,
	0.652, 0.644, 0.635, 0.626, 0.618, 0.61, 0.601, 0.593, 0.585, 0.577, 0.57, 0.562, 0.554, 0.547, 0.54, 0.532, 0.525,
	0.518, 0.511, 0.504, 0.497, 0.491, 0.484, 0.497, 0.511, 0.524, 0.539, 0.553, 0.568, 0.583, 0.599, 0.615, 0.632, 0.649,
	0.667, 0.685, 0.703, 0.722, 0.742, 0.762, 0.782, 0.804, 0.825, 0.848, 0.871, 0.894, 0.918, 0.943, 0.969, 0.995, 1.022,
	1.049, 1.078, 1.072, 1.065, 1.059, 1.053, 1.047, 1.041, 1.035, 1.029, 1.023, 1.017, 1.011, 1.005, 0.999, 0.993, 0.987,
	0.982, 0.976, 0.97, 0.965, 0.959, 0.953, 0.948, 0.942, 0.937, 0.931, 0.926, 0.92, 0.915, 0.91, 0.904, 0.894, 0.884,
	0.874, 0.864, 0.855, 0.845, 0.836, 0.826, 0.817, 0.808, 0.799, 0.79, 0.781, 0.772, 0.763, 0.755, 0.746, 0.738, 0.73,
	0.721, 0.713, 0.705, 0.697, 0.689, 0.682, 0.674, 0.666, 0.659, 0.652, 0.644, 0.645, 0.646, 0.646, 0.647, 0.648, 0.648,
	0.649, 0.65, 0.65, 0.651, 0.652, 0.652, 0.653, 0.654, 0.654, 0.655, 0.656, 0.656, 0.657, 0.658, 0.658, 0.659, 0.66,
	0.66, 0.661, 0.662, 0.662, 0.663, 0.664, 0.664, 0.672, 0.679, 0.687, 0.694, 0.702, 0.71, 0.718, 0.726, 0.734, 0.742,
	0.75, 0.758, 0.767, 0.775, 0.784, 0.793, 0.801, 0.81, 0.819, 0.828, 0.838, 0.847, 0.856, 0.866, 0.875, 0.885, 0.895,
	0.905, 0.915, 0.925, 0.935, 0.946, 0.956, 0.967, 0.977, 0.988, 0.999, 1.01, 1.021, 1.032, 1.044, 1.055, 1.067, 1.079,
	1.091, 1.103, 1.115, 1.127, 1.14, 1.152, 1.165, 1.178, 1.191, 1.204, 1.217, 1.231, 1.244, 1.258, 1.272, 1.286, 1.302,
	1.319, 1.336, 1.353, 1.371, 1.388, 1.406, 1.424, 1.442, 1.461, 1.48, 1.499, 1.518, 1.537, 1.557, 1.577, 1.598, 1.618,
	1.639, 1.66, 1.681, 1.703, 1.725, 1.747, 1.769, 1.792, 1.815, 1.838, 1.862, 1.886, 1.844, 1.803, 1.763, 1.724, 1.685,
	1.648, 1.611, 1.575, 1.54, 1.506, 1.473, 1.44, 1.408, 1.377, 1.346, 1.316, 1.287, 1.258, 1.23, 1.203, 1.176, 1.15,
	1.124, 1.1, 1.075, 1.051, 1.028, 1.005, 0.983, 0.961, 0.956, 0.952, 0.947, 0.943, 0.938, 0.934, 0.929, 0.925, 0.921,
	0.916, 0.912, 0.908, 0.903, 0.899, 0.895, 0.89, 0.886, 0.882, 0.878, 0.874, 0.87, 0.865, 0.861, 0.857, 0.853, 0.849,
	0.845, 0.841, 0.837];

// The table authored by eye in data/hue-density.html before the measurement; not in the metric, kept for
// fit_hue_steps.js to compare against.
const HUE_DENSITY_AUTHORED = [
	0.472, 0.487, 0.501, 0.512, 0.52, 0.524, 0.53, 0.541, 0.557, 0.575, 0.595, 0.617, 0.643, 0.669, 0.697, 0.729, 0.768,
	0.816, 0.873, 0.94, 1.013, 1.091, 1.182, 1.305, 1.491, 1.783, 2.209, 2.72, 3.166, 3.362, 3.217, 2.811, 2.317, 1.878,
	1.547, 1.315, 1.162, 1.079, 1.05, 1.05, 1.046, 1.015, 0.955, 0.882, 0.816, 0.764, 0.726, 0.694, 0.665, 0.638, 0.616,
	0.6, 0.588, 0.582, 0.583, 0.589, 0.591, 0.583, 0.568, 0.553, 0.543, 0.538, 0.537, 0.536, 0.536, 0.536, 0.536, 0.538,
	0.542, 0.553, 0.572, 0.6, 0.633, 0.66, 0.677, 0.681, 0.673, 0.654, 0.635, 0.627, 0.635, 0.655, 0.675, 0.691, 0.703,
	0.72, 0.743, 0.769, 0.791, 0.805, 0.814, 0.83, 0.855, 0.886, 0.914, 0.935, 0.954, 0.974, 0.997, 1.023, 1.052, 1.08,
	1.101, 1.117, 1.14, 1.181, 1.228, 1.259, 1.26, 1.235, 1.2, 1.167, 1.144, 1.126, 1.105, 1.081, 1.06, 1.063, 1.102,
	1.175, 1.262, 1.336, 1.382, 1.395, 1.391, 1.387, 1.397, 1.427, 1.475, 1.537, 1.605, 1.66, 1.679, 1.638, 1.541, 1.441,
	1.452, 1.705, 2.347, 3.433, 4.793, 5.99, 6.522, 6.193, 5.262, 4.192, 3.307, 2.673, 2.221, 1.875, 1.612, 1.412, 1.268,
	1.162, 1.079, 1.009, 0.949, 0.9, 0.86, 0.824, 0.79, 0.761, 0.744, 0.74, 0.743, 0.745, 0.742, 0.732, 0.72, 0.708,
	0.697, 0.684, 0.67, 0.656, 0.643, 0.63, 0.62, 0.611, 0.604, 0.6, 0.599, 0.596, 0.585, 0.569, 0.553, 0.543, 0.538,
	0.537, 0.536, 0.536, 0.536, 0.535, 0.533, 0.529, 0.523, 0.513, 0.499, 0.481, 0.463, 0.452, 0.448, 0.447, 0.446,
	0.445, 0.445, 0.445, 0.442, 0.436, 0.433, 0.434, 0.437, 0.441, 0.444, 0.446, 0.446, 0.447, 0.447, 0.447, 0.447,
	0.447, 0.447, 0.447, 0.447, 0.449, 0.453, 0.462, 0.474, 0.484, 0.486, 0.482, 0.48, 0.488, 0.504, 0.519, 0.529, 0.534,
	0.536, 0.538, 0.543, 0.554, 0.571, 0.593, 0.615, 0.636, 0.658, 0.682, 0.705, 0.728, 0.755, 0.787, 0.821, 0.85, 0.872,
	0.89, 0.917, 0.974, 1.076, 1.23, 1.436, 1.681, 1.987, 2.382, 2.846, 3.228, 3.326, 3.063, 2.589, 2.157, 1.917, 1.868,
	1.9, 1.883, 1.745, 1.478, 1.164, 0.915, 0.81, 0.848, 0.963, 1.067, 1.1, 1.059, 0.979, 0.904, 0.855, 0.837, 0.841,
	0.852, 0.858, 0.851, 0.837, 0.821, 0.811, 0.806, 0.805, 0.806, 0.811, 0.821, 0.837, 0.854, 0.865, 0.869, 0.871,
	0.877, 0.885, 0.894, 0.905, 0.917, 0.931, 0.945, 0.959, 0.973, 0.986, 1.001, 1.021, 1.044, 1.062, 1.075, 1.082, 1.09,
	1.103, 1.124, 1.15, 1.178, 1.197, 1.203, 1.191, 1.148, 1.063, 0.933, 0.779, 0.639, 0.537, 0.479, 0.449, 0.434, 0.425,
	0.42, 0.416, 0.411, 0.402, 0.391, 0.377, 0.362, 0.349, 0.337, 0.328, 0.321, 0.314, 0.308, 0.306, 0.311, 0.325, 0.348,
	0.373, 0.395, 0.411, 0.423, 0.438, 0.455];

// The warped hue of each whole degree, 0 to 360: the running integral of HUE_DENSITY.
const HUE_WARP = (() => {
	const warp = [0];
	for (let h = 0; h < 360; ++h)
		warp.push(warp[h] + HUE_DENSITY[h]);
	return warp.map(v => v * 360 / warp[360]);
})();
// The color with its hue moved to the warped hue, chroma and lightness kept.
function warpedLab(lab) {
	const h = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360, at = Math.floor(h);
	const turned = (HUE_WARP[at] + (HUE_WARP[at + 1] - HUE_WARP[at]) * (h - at)) * Math.PI / 180;
	const C = Math.hypot(lab[1], lab[2]);
	return [lab[0], C * Math.cos(turned), C * Math.sin(turned)];
}

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

// Where a color stands in its own hue's gamut: lightness against the cusp, which sits at
// CUSP_ANCHOR at every hue with 0 black and 100 white, and chroma as a fraction of the reach at
// that lightness and hue. Both are coordinates of the gamut's shape, not perceptual quantities -
// the metric itself stays in absolute OKLab.
// The lightness here is the coordinate the page's control uses; the chroma is not. The control
// takes a fraction of the hue's cusp chroma, so that one number means one vividness at every hue,
// where this predictor asks how close a pair sits to the boundary at its own lightness.
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
// The anisotropic part alone, without the gain and the hue warp below, the hue term scaled by hueScale:
// the fit scripts measure against this at the default, so it must stay the raw quantity they were fitted on.
function weightedDistance(p, q, wL, wC, hueScale = 1) {
	const dL = (p[0] - q[0]) * wL, dC = Math.hypot(p[1], p[2]) - Math.hypot(q[1], q[2]);
	const chord2 = (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
	return Math.sqrt(dL * dL + wC * wC * dC * dC + Math.max(0, chord2 - dC * dC) * hueScale * hueScale);
}

// How far apart a pair reads: the weighted distance of the hue-warped points, the hue term scaled by the
// pair's mean chroma, times the gain for the pair's lightness. This is the metric the generator optimizes
// and this file scores.
const recallDistance = (p, q, wL, wC) => weightedDistance(warpedLab(p), warpedLab(q), wL, wC, hueScaleAt((Math.hypot(p[1], p[2]) + Math.hypot(q[1], q[2])) / 2))
	* lightnessGain((p[0] + q[0]) / 2);

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
				error += matrix[i][j] = swapChance(recallDistance(labs[i], labs[j], wL, wC), sigma);
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
// `densities`, when given, swaps the page's hue density for the metric's warp and for the draw's
// acceptance separately, so hue-marginals.js can tell their effects apart; either may be null to keep
// the page's own. Fails if the page no longer has the two lines it patches.
function loadPage(pagePath, densities = null) {
	const key = pagePath + (densities ? JSON.stringify(densities) : "");
	if (!pages.has(key)) {
		const UI_SECTION = "// ---------- ui ----------";
		let source = [...fs.readFileSync(pagePath, "utf8").matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
			.map(match => match[1]).find(script => script.includes(UI_SECTION));
		source = source.slice(0, source.indexOf(UI_SECTION));
		const patch = (line, replacement) => {
			if (!source.includes(line))
				throw new Error(path.basename(pagePath) + " lacks the line to patch: " + line);
			source = source.replace(line, replacement);
		};
		if (densities && densities.metric)
			patch("warp.push(warp[h] + HUE_DENSITY[h]);", "warp.push(warp[h] + " + JSON.stringify(densities.metric) + "[h]);");
		if (densities && densities.draw)
			patch("const weight = HUE_DENSITY.map(", "const weight = " + JSON.stringify(densities.draw) + ".map(");
		globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
		const page = (0, eval)(source
			+ "; ({ generate, cellOf, colorFromHex, CELL_NAMES, CELL_OVERLAP, mulberry32, oklabToRgb, labOfLch, HUE_DENSITY: typeof HUE_DENSITY === 'undefined' ? null : HUE_DENSITY,"
			// The box sampler of pages before generator-next.html, for hue-marginals.js.
			+ " ...(typeof boxCells === 'undefined' ? {} : { boxCells, samplePoint, SPARSE_FRACTION }) })");
		// A page respacing hue differently from this file is scored on a metric other than its own.
		if (!densities && (!page.HUE_DENSITY || page.HUE_DENSITY.some((d, h) => d !== HUE_DENSITY[h])))
			console.warn(path.basename(pagePath) + ": its hue density is not this file's; scores are on this file's metric");
		pages.set(key, page);
	}
	return pages.get(key);
}

const rgbOf = hex => [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);

// How far apart two colors must be for a shared name to stop mattering, in weighted deltaE: 6 to 11
// at 2 log-likelihood units from the naming round (data/calibrate-names.html, data/fit_names.js).
const NAME_DECAY = 8;

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
// are OKLCh ranges as the page's controls state them: lightness and chroma both relative to the
// hue's cusp, hue in degrees. Pages before the relative chroma control read cMin and cMax as
// absolute chroma x100 and cannot be compared with these numbers.
function benchmarkPage(pagePath) {
	const page = loadPage(pagePath);
	const generate = page.generate;
	const boxes = [
		{ name: "default", hMin: 0, hMax: 360, cMin: 20, cMax: 100, lMin: 20, lMax: 80 },
		{ name: "narrow", hMin: 0, hMax: 360, cMin: 35, cMax: 100, lMin: 35, lMax: 65 },
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

module.exports = { SIGMA, W_L, W_C, CHROMA_POWER, CHROMA_REFERENCE, CHROMA_FLOOR, LIGHTNESS_EXPONENT, LIGHTNESS_REFERENCE, LIGHTNESS_FLOOR, lightnessGain, hueScaleAt, NAME_DECAY, CALIBRATED_PX, HUE_DENSITY, HUE_DENSITY_AUTHORED,
	labOf, rgbOf, warpedLab, weightedDistance, recallDistance, swapChance, confusionMatrix, summarize, score, nameCollision,
	loadPage, gamutChroma, cuspLightness, relativePosition };

if (require.main === module)
	main(process.argv.slice(2));
