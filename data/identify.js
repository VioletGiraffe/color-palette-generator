#!/usr/bin/env node
// Two scores for a palette, reported side by side and never combined.
//
// Identification, the one the generator optimizes: the chance a viewer who learned the palette
// picks the right entry for a color shown on its own. Recall is the color plus Gaussian memory
// noise in OKLab; the viewer answers with the nearest palette entry. Noise is anisotropic:
// lightness and chroma differences count by their weight against hue differences, hues are
// respaced by the level densities first, a lightness difference counts less at one hue, and a shade's
// chroma change counts in part. A pair swaps with the chance the noise carries a recall past their
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

// Memory noise, standard deviation in weighted deltaE, for swatches of CALIBRATED_PX: a lone pair's swap chance falls
// to the page's error limit at 14.4, by the median of the strict pair rounds' "fine" cuts, 14.3 (21 to 29). The weight tables,
// the shape terms, LIGHTNESS_EXPONENT and the level densities are one fit to the preference rounds; see HUE_DENSITY and
// data/scripts.md.
const SIGMA = 3.5;
// A lightness or chroma difference counts the weight at the pair's hue times its size: below 1 the axis is a weaker
// cue than hue there. Per whole degree of OKLab hue, read by weightAt at pairHue.
const HUE_WEIGHT_L = [
	0.965, 0.963, 0.961, 0.958, 0.956, 0.954, 0.952, 0.949, 0.947, 0.945, 0.942, 0.94, 0.938, 0.936, 0.933, 0.931, 0.929,
	0.927, 0.924, 0.922, 0.92, 0.918, 0.915, 0.913, 0.912, 0.91, 0.908, 0.906, 0.905, 0.903, 0.901, 0.9, 0.898, 0.896,
	0.895, 0.893, 0.891, 0.889, 0.888, 0.886, 0.884, 0.883, 0.881, 0.879, 0.878, 0.876, 0.869, 0.862, 0.855, 0.848, 0.841,
	0.835, 0.828, 0.821, 0.815, 0.808, 0.801, 0.795, 0.789, 0.782, 0.776, 0.77, 0.763, 0.757, 0.751, 0.745, 0.739, 0.733,
	0.732, 0.736, 0.739, 0.743, 0.747, 0.751, 0.755, 0.758, 0.762, 0.766, 0.77, 0.774, 0.778, 0.782, 0.786, 0.79, 0.794,
	0.798, 0.802, 0.806, 0.81, 0.814, 0.818, 0.815, 0.813, 0.81, 0.807, 0.804, 0.802, 0.799, 0.796, 0.794, 0.791, 0.788,
	0.786, 0.783, 0.78, 0.778, 0.775, 0.773, 0.77, 0.767, 0.765, 0.762, 0.76, 0.76, 0.762, 0.765, 0.768, 0.77, 0.773,
	0.776, 0.778, 0.781, 0.784, 0.787, 0.789, 0.792, 0.795, 0.798, 0.801, 0.803, 0.806, 0.809, 0.812, 0.815, 0.818, 0.82,
	0.819, 0.818, 0.817, 0.816, 0.815, 0.814, 0.813, 0.811, 0.81, 0.809, 0.808, 0.807, 0.806, 0.805, 0.804, 0.802, 0.801,
	0.8, 0.799, 0.798, 0.797, 0.796, 0.797, 0.801, 0.806, 0.81, 0.814, 0.818, 0.823, 0.827, 0.831, 0.836, 0.84, 0.844,
	0.849, 0.853, 0.857, 0.862, 0.866, 0.871, 0.875, 0.88, 0.885, 0.889, 0.894, 0.888, 0.882, 0.877, 0.871, 0.865, 0.86,
	0.854, 0.848, 0.843, 0.837, 0.832, 0.827, 0.821, 0.816, 0.81, 0.805, 0.8, 0.795, 0.79, 0.784, 0.779, 0.774, 0.774,
	0.778, 0.782, 0.786, 0.791, 0.795, 0.799, 0.803, 0.808, 0.812, 0.816, 0.821, 0.825, 0.829, 0.834, 0.838, 0.843, 0.847,
	0.852, 0.857, 0.861, 0.866, 0.87, 0.872, 0.873, 0.874, 0.876, 0.877, 0.878, 0.879, 0.881, 0.882, 0.883, 0.885, 0.886,
	0.887, 0.889, 0.89, 0.891, 0.893, 0.894, 0.895, 0.897, 0.898, 0.899, 0.905, 0.914, 0.924, 0.934, 0.944, 0.954, 0.964,
	0.974, 0.985, 0.995, 1.006, 1.017, 1.027, 1.038, 1.049, 1.06, 1.072, 1.083, 1.095, 1.106, 1.118, 1.13, 1.142, 1.138,
	1.133, 1.129, 1.124, 1.12, 1.116, 1.111, 1.107, 1.103, 1.098, 1.094, 1.09, 1.086, 1.082, 1.077, 1.073, 1.069, 1.065,
	1.061, 1.057, 1.053, 1.048, 1.047, 1.049, 1.05, 1.051, 1.053, 1.054, 1.056, 1.057, 1.059, 1.06, 1.061, 1.063, 1.064,
	1.066, 1.067, 1.069, 1.07, 1.072, 1.073, 1.074, 1.076, 1.077, 1.079, 1.073, 1.068, 1.062, 1.057, 1.052, 1.046, 1.041,
	1.036, 1.031, 1.025, 1.02, 1.015, 1.01, 1.005, 1, 0.994, 0.989, 0.984, 0.979, 0.974, 0.969, 0.965, 0.962, 0.962,
	0.962, 0.963, 0.963, 0.963, 0.963, 0.963, 0.963, 0.964, 0.964, 0.964, 0.964, 0.964, 0.964, 0.964, 0.965, 0.965, 0.965,
	0.965, 0.965, 0.965];
const HUE_WEIGHT_C = [
	0.95, 0.951, 0.952, 0.953, 0.954, 0.955, 0.956, 0.957, 0.957, 0.958, 0.959, 0.96, 0.961, 0.962, 0.963, 0.963, 0.964,
	0.965, 0.966, 0.967, 0.968, 0.969, 0.97, 0.972, 0.977, 0.981, 0.986, 0.99, 0.995, 0.999, 1.004, 1.008, 1.013, 1.018,
	1.022, 1.027, 1.032, 1.037, 1.041, 1.046, 1.051, 1.056, 1.06, 1.065, 1.07, 1.075, 1.071, 1.067, 1.062, 1.058, 1.054,
	1.049, 1.045, 1.041, 1.037, 1.033, 1.029, 1.024, 1.02, 1.016, 1.012, 1.008, 1.004, 1, 0.996, 0.992, 0.988, 0.984,
	0.982, 0.982, 0.982, 0.983, 0.983, 0.983, 0.983, 0.983, 0.983, 0.983, 0.983, 0.984, 0.984, 0.984, 0.984, 0.984, 0.984,
	0.984, 0.984, 0.984, 0.985, 0.985, 0.985, 0.982, 0.98, 0.977, 0.974, 0.972, 0.969, 0.967, 0.964, 0.961, 0.959, 0.956,
	0.954, 0.951, 0.949, 0.946, 0.944, 0.941, 0.939, 0.936, 0.934, 0.931, 0.929, 0.922, 0.912, 0.901, 0.891, 0.881, 0.871,
	0.861, 0.852, 0.842, 0.833, 0.823, 0.814, 0.805, 0.796, 0.787, 0.778, 0.769, 0.76, 0.752, 0.743, 0.735, 0.727, 0.718,
	0.72, 0.722, 0.724, 0.726, 0.727, 0.729, 0.731, 0.733, 0.735, 0.736, 0.738, 0.74, 0.742, 0.744, 0.745, 0.747, 0.749,
	0.751, 0.753, 0.755, 0.756, 0.758, 0.767, 0.782, 0.798, 0.813, 0.829, 0.846, 0.863, 0.88, 0.897, 0.915, 0.933, 0.952,
	0.971, 0.99, 1.01, 1.03, 1.05, 1.071, 1.092, 1.114, 1.136, 1.159, 1.182, 1.183, 1.185, 1.186, 1.187, 1.189, 1.19,
	1.192, 1.193, 1.195, 1.196, 1.198, 1.199, 1.201, 1.202, 1.204, 1.205, 1.207, 1.208, 1.21, 1.211, 1.213, 1.214, 1.219,
	1.227, 1.235, 1.243, 1.251, 1.259, 1.267, 1.275, 1.284, 1.292, 1.3, 1.309, 1.317, 1.326, 1.334, 1.343, 1.352, 1.36,
	1.369, 1.378, 1.387, 1.396, 1.405, 1.389, 1.374, 1.358, 1.343, 1.328, 1.313, 1.298, 1.283, 1.269, 1.254, 1.24, 1.226,
	1.212, 1.199, 1.185, 1.172, 1.159, 1.146, 1.133, 1.12, 1.107, 1.095, 1.075, 1.049, 1.023, 0.997, 0.973, 0.949, 0.926,
	0.903, 0.88, 0.859, 0.838, 0.817, 0.797, 0.777, 0.758, 0.739, 0.721, 0.703, 0.686, 0.669, 0.653, 0.637, 0.621, 0.623,
	0.625, 0.626, 0.628, 0.63, 0.632, 0.634, 0.636, 0.638, 0.64, 0.641, 0.643, 0.645, 0.647, 0.649, 0.651, 0.653, 0.655,
	0.657, 0.659, 0.661, 0.663, 0.663, 0.662, 0.661, 0.659, 0.658, 0.657, 0.656, 0.654, 0.653, 0.652, 0.65, 0.649, 0.648,
	0.647, 0.645, 0.644, 0.643, 0.642, 0.641, 0.639, 0.638, 0.637, 0.636, 0.637, 0.639, 0.641, 0.642, 0.644, 0.646, 0.648,
	0.649, 0.651, 0.653, 0.655, 0.656, 0.658, 0.66, 0.662, 0.663, 0.665, 0.667, 0.669, 0.67, 0.672, 0.674, 0.68, 0.69,
	0.701, 0.712, 0.723, 0.734, 0.745, 0.756, 0.768, 0.78, 0.792, 0.804, 0.816, 0.829, 0.842, 0.854, 0.868, 0.881, 0.894,
	0.908, 0.922, 0.936];
// A shade, a lightness change at the pair's saturation (chroma over lightness), counts this share of the chroma change
// it brings as no chroma difference.
const SHADE_DISCOUNT = 0.518;
// At one hue a lightness difference counts this share of its weight; the full weight returns as the hue term grows past
// SAME_HUE_SPAN, half of the way at it.
const SAME_HUE_LIGHTNESS = 0.455;
const SAME_HUE_SPAN = 16.53;
// One weight per axis for the raw distances of nameCollision and the older fit scripts: the lightness weight is a step's
// at one hue, the scale NAME_DECAY and those scripts were fitted on.
const meanOf = table => table.reduce((a, b) => a + b, 0) / table.length;
const W_L = meanOf(HUE_WEIGHT_L) * SAME_HUE_LIGHTNESS;
const W_C = meanOf(HUE_WEIGHT_C);
// A table's value at a hue in degrees, interpolated, wrapping.
function weightAt(table, hue) {
	const x = ((hue % 360) + 360) % 360, i = Math.floor(x), t = x - i;
	return table[i] * (1 - t) + table[(i + 1) % 360] * t;
}
// The hue a pair's weights are read at: the hue of the two colors' summed ab, so a grey defers to its partner.
const pairHue = (p, q) => Math.atan2(p[2] + q[2], p[1] + q[1]) * 180 / Math.PI;
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
const LIGHTNESS_EXPONENT = 0.174;
// The gain's minimum, the cusps' own lightness
const LIGHTNESS_REFERENCE = 68;
// The rounds reach down to 25; the gain is held below this.
const LIGHTNESS_FLOOR = 20;
function lightnessGain(L, exponent = LIGHTNESS_EXPONENT) {
	const l = Math.max(LIGHTNESS_FLOOR, L);
	return (Math.max(l, LIGHTNESS_REFERENCE) / Math.min(l, LIGHTNESS_REFERENCE)) ** exponent;
}
const hueScaleAt = (C, power = CHROMA_POWER) => (Math.max(CHROMA_FLOOR, C) / CHROMA_REFERENCE) ** (power - 1);
const CALIBRATED_PX = 16;
// Each hue's share of the circle in the metric, per whole degree at mean 1; the page's copy, which
// loadPage checks against this one. Fitted to the pair rounds under the preference question, the output of
// node data/fit_hue_density.js --own-cuts --ridge 10 --free wl,wc,gain,shade,samehue,huespan --skip-kinds named --levels 30,58,85
// --weight-knots 16 --table over boundary-4-log.json to boundary-29-log.json, with the level densities, the weight tables and
// the shape terms. See index.html.
const HUE_DENSITY = [
	0.974, 0.986, 0.999, 1.012, 1.026, 1.039, 1.053, 1.066, 1.08, 1.094, 1.109, 1.123, 1.138, 1.153, 1.168, 1.183, 1.199,
	1.214, 1.23, 1.247, 1.263, 1.279, 1.296, 1.313, 1.33, 1.348, 1.365, 1.383, 1.401, 1.42, 1.438, 1.415, 1.392, 1.37,
	1.348, 1.326, 1.305, 1.284, 1.264, 1.243, 1.223, 1.204, 1.184, 1.165, 1.147, 1.128, 1.11, 1.092, 1.075, 1.058, 1.041,
	1.024, 1.008, 0.991, 0.975, 0.96, 0.944, 0.929, 0.914, 0.9, 0.885, 0.879, 0.873, 0.868, 0.862, 0.856, 0.85, 0.845,
	0.839, 0.833, 0.828, 0.822, 0.817, 0.811, 0.806, 0.801, 0.795, 0.79, 0.785, 0.779, 0.774, 0.769, 0.764, 0.759, 0.754,
	0.749, 0.744, 0.739, 0.734, 0.729, 0.724, 0.734, 0.744, 0.754, 0.764, 0.775, 0.785, 0.796, 0.807, 0.818, 0.829, 0.84,
	0.852, 0.863, 0.875, 0.887, 0.899, 0.911, 0.924, 0.936, 0.949, 0.962, 0.975, 0.988, 1.002, 1.015, 1.029, 1.043, 1.058,
	1.072, 1.087, 1.088, 1.089, 1.09, 1.091, 1.092, 1.093, 1.094, 1.095, 1.097, 1.098, 1.099, 1.1, 1.101, 1.102, 1.103,
	1.104, 1.106, 1.107, 1.108, 1.109, 1.11, 1.111, 1.112, 1.113, 1.115, 1.116, 1.117, 1.118, 1.119, 1.12, 1.108, 1.096,
	1.084, 1.072, 1.06, 1.049, 1.037, 1.026, 1.015, 1.004, 0.993, 0.982, 0.971, 0.961, 0.95, 0.94, 0.93, 0.92, 0.91,
	0.9, 0.89, 0.88, 0.871, 0.861, 0.852, 0.842, 0.833, 0.824, 0.815, 0.806, 0.816, 0.826, 0.835, 0.845, 0.855, 0.865,
	0.876, 0.886, 0.897, 0.907, 0.918, 0.929, 0.94, 0.951, 0.963, 0.974, 0.986, 0.997, 1.009, 1.021, 1.033, 1.046, 1.058,
	1.071, 1.083, 1.096, 1.109, 1.122, 1.136, 1.149, 1.136, 1.122, 1.109, 1.096, 1.083, 1.071, 1.058, 1.046, 1.033, 1.021,
	1.009, 0.997, 0.986, 0.974, 0.963, 0.951, 0.94, 0.929, 0.918, 0.907, 0.897, 0.886, 0.876, 0.865, 0.855, 0.845, 0.835,
	0.825, 0.816, 0.806, 0.812, 0.817, 0.822, 0.828, 0.833, 0.839, 0.844, 0.85, 0.855, 0.861, 0.867, 0.873, 0.878, 0.884,
	0.89, 0.896, 0.902, 0.908, 0.914, 0.92, 0.926, 0.932, 0.938, 0.944, 0.951, 0.957, 0.963, 0.97, 0.976, 0.982, 0.991,
	0.999, 1.007, 1.016, 1.024, 1.033, 1.042, 1.051, 1.059, 1.068, 1.077, 1.086, 1.096, 1.105, 1.114, 1.124, 1.133, 1.143,
	1.152, 1.162, 1.172, 1.182, 1.191, 1.202, 1.212, 1.222, 1.232, 1.243, 1.253, 1.264, 1.248, 1.232, 1.217, 1.202, 1.187,
	1.172, 1.157, 1.143, 1.129, 1.115, 1.101, 1.087, 1.074, 1.06, 1.047, 1.034, 1.021, 1.009, 0.996, 0.984, 0.971, 0.959,
	0.947, 0.935, 0.924, 0.912, 0.901, 0.89, 0.879, 0.868, 0.871, 0.874, 0.878, 0.881, 0.885, 0.888, 0.891, 0.895, 0.898,
	0.902, 0.905, 0.909, 0.912, 0.916, 0.919, 0.923, 0.926, 0.93, 0.933, 0.937, 0.941, 0.944, 0.948, 0.951, 0.955, 0.959,
	0.962, 0.966, 0.97];
// The density at lightness 30, 58 and 85, the metric's; the page's copy, which loadPage checks against this one. The same
// fit as HUE_DENSITY above. See index.html.
const HUE_DENSITY_AT_30 = [
	1.217, 1.235, 1.254, 1.273, 1.292, 1.312, 1.331, 1.352, 1.372, 1.393, 1.414, 1.435, 1.457, 1.479, 1.502, 1.524, 1.547,
	1.571, 1.595, 1.619, 1.643, 1.668, 1.694, 1.719, 1.745, 1.772, 1.799, 1.826, 1.853, 1.881, 1.91, 1.852, 1.795, 1.741,
	1.687, 1.636, 1.586, 1.538, 1.491, 1.445, 1.401, 1.359, 1.317, 1.277, 1.238, 1.2, 1.164, 1.128, 1.094, 1.06, 1.028,
	0.997, 0.966, 0.937, 0.908, 0.881, 0.854, 0.828, 0.802, 0.778, 0.754, 0.749, 0.745, 0.74, 0.735, 0.73, 0.726, 0.721,
	0.716, 0.712, 0.707, 0.702, 0.698, 0.693, 0.689, 0.684, 0.68, 0.676, 0.671, 0.667, 0.663, 0.658, 0.654, 0.65, 0.646,
	0.642, 0.637, 0.633, 0.629, 0.625, 0.621, 0.632, 0.642, 0.653, 0.664, 0.675, 0.686, 0.697, 0.709, 0.721, 0.733, 0.745,
	0.758, 0.77, 0.783, 0.796, 0.809, 0.823, 0.837, 0.851, 0.865, 0.879, 0.894, 0.909, 0.924, 0.939, 0.955, 0.971, 0.987,
	1.004, 1.02, 1.023, 1.026, 1.029, 1.031, 1.034, 1.037, 1.04, 1.042, 1.045, 1.048, 1.051, 1.053, 1.056, 1.059, 1.062,
	1.065, 1.068, 1.07, 1.073, 1.076, 1.079, 1.082, 1.085, 1.088, 1.091, 1.093, 1.096, 1.099, 1.102, 1.105, 1.088, 1.071,
	1.054, 1.037, 1.021, 1.005, 0.989, 0.973, 0.958, 0.943, 0.928, 0.914, 0.899, 0.885, 0.871, 0.857, 0.844, 0.831, 0.818,
	0.805, 0.792, 0.78, 0.767, 0.755, 0.743, 0.732, 0.72, 0.709, 0.698, 0.687, 0.701, 0.715, 0.73, 0.745, 0.76, 0.775,
	0.791, 0.807, 0.824, 0.84, 0.858, 0.875, 0.893, 0.911, 0.93, 0.949, 0.968, 0.988, 1.008, 1.028, 1.049, 1.071, 1.093,
	1.115, 1.138, 1.161, 1.185, 1.209, 1.233, 1.259, 1.239, 1.219, 1.2, 1.181, 1.163, 1.144, 1.126, 1.109, 1.091, 1.074,
	1.057, 1.041, 1.024, 1.008, 0.992, 0.977, 0.961, 0.946, 0.931, 0.917, 0.902, 0.888, 0.874, 0.86, 0.847, 0.834, 0.82,
	0.807, 0.795, 0.782, 0.79, 0.797, 0.804, 0.812, 0.819, 0.827, 0.834, 0.842, 0.85, 0.858, 0.866, 0.874, 0.882, 0.89,
	0.898, 0.906, 0.915, 0.923, 0.932, 0.94, 0.949, 0.958, 0.966, 0.975, 0.984, 0.993, 1.003, 1.012, 1.021, 1.031, 1.031,
	1.032, 1.033, 1.034, 1.034, 1.035, 1.036, 1.037, 1.038, 1.038, 1.039, 1.04, 1.041, 1.041, 1.042, 1.043, 1.044, 1.044,
	1.045, 1.046, 1.047, 1.048, 1.048, 1.049, 1.05, 1.051, 1.051, 1.052, 1.053, 1.054, 1.044, 1.033, 1.023, 1.013, 1.003,
	0.994, 0.984, 0.974, 0.965, 0.955, 0.946, 0.937, 0.928, 0.919, 0.91, 0.901, 0.892, 0.883, 0.875, 0.866, 0.858, 0.85,
	0.841, 0.833, 0.825, 0.817, 0.809, 0.801, 0.793, 0.786, 0.797, 0.809, 0.821, 0.833, 0.845, 0.857, 0.87, 0.883, 0.896,
	0.909, 0.922, 0.936, 0.949, 0.963, 0.978, 0.992, 1.006, 1.021, 1.036, 1.051, 1.067, 1.083, 1.099, 1.115, 1.131, 1.148,
	1.164, 1.182, 1.199];
const HUE_DENSITY_AT_58 = [
	0.865, 0.882, 0.9, 0.918, 0.936, 0.955, 0.974, 0.994, 1.013, 1.034, 1.054, 1.075, 1.097, 1.119, 1.141, 1.164, 1.187,
	1.211, 1.235, 1.26, 1.285, 1.31, 1.337, 1.363, 1.39, 1.418, 1.447, 1.475, 1.505, 1.535, 1.566, 1.537, 1.51, 1.483,
	1.456, 1.43, 1.404, 1.379, 1.354, 1.33, 1.306, 1.282, 1.259, 1.237, 1.214, 1.192, 1.171, 1.15, 1.129, 1.109, 1.089,
	1.069, 1.05, 1.031, 1.013, 0.995, 0.977, 0.959, 0.942, 0.925, 0.908, 0.896, 0.883, 0.871, 0.859, 0.847, 0.836, 0.824,
	0.813, 0.802, 0.791, 0.78, 0.769, 0.759, 0.748, 0.738, 0.728, 0.718, 0.708, 0.698, 0.689, 0.679, 0.67, 0.66, 0.651,
	0.642, 0.634, 0.625, 0.616, 0.608, 0.599, 0.611, 0.623, 0.636, 0.648, 0.661, 0.674, 0.687, 0.701, 0.715, 0.729, 0.743,
	0.758, 0.773, 0.788, 0.804, 0.82, 0.836, 0.852, 0.869, 0.886, 0.904, 0.922, 0.94, 0.958, 0.977, 0.997, 1.016, 1.036,
	1.057, 1.078, 1.084, 1.091, 1.097, 1.104, 1.11, 1.117, 1.124, 1.13, 1.137, 1.144, 1.151, 1.158, 1.164, 1.171, 1.178,
	1.185, 1.192, 1.2, 1.207, 1.214, 1.221, 1.228, 1.236, 1.243, 1.251, 1.258, 1.266, 1.273, 1.281, 1.288, 1.268, 1.249,
	1.229, 1.21, 1.192, 1.173, 1.155, 1.137, 1.119, 1.102, 1.085, 1.068, 1.052, 1.035, 1.019, 1.004, 0.988, 0.973, 0.958,
	0.943, 0.928, 0.914, 0.9, 0.886, 0.872, 0.859, 0.845, 0.832, 0.819, 0.807, 0.82, 0.834, 0.848, 0.863, 0.877, 0.892,
	0.907, 0.923, 0.938, 0.954, 0.97, 0.987, 1.003, 1.02, 1.038, 1.055, 1.073, 1.091, 1.11, 1.129, 1.148, 1.167, 1.187,
	1.207, 1.227, 1.248, 1.269, 1.291, 1.313, 1.335, 1.309, 1.284, 1.259, 1.235, 1.211, 1.188, 1.165, 1.143, 1.121, 1.099,
	1.078, 1.057, 1.037, 1.017, 0.998, 0.978, 0.96, 0.941, 0.923, 0.905, 0.888, 0.871, 0.854, 0.838, 0.821, 0.806, 0.79,
	0.775, 0.76, 0.745, 0.751, 0.756, 0.762, 0.767, 0.773, 0.778, 0.784, 0.79, 0.795, 0.801, 0.807, 0.813, 0.818, 0.824,
	0.83, 0.836, 0.842, 0.848, 0.855, 0.861, 0.867, 0.873, 0.879, 0.886, 0.892, 0.899, 0.905, 0.912, 0.918, 0.925, 0.932,
	0.94, 0.948, 0.956, 0.964, 0.972, 0.98, 0.988, 0.996, 1.004, 1.012, 1.021, 1.029, 1.038, 1.046, 1.055, 1.064, 1.072,
	1.081, 1.09, 1.099, 1.108, 1.117, 1.127, 1.136, 1.145, 1.155, 1.164, 1.174, 1.184, 1.172, 1.161, 1.15, 1.139, 1.128,
	1.117, 1.106, 1.096, 1.085, 1.075, 1.064, 1.054, 1.044, 1.034, 1.024, 1.014, 1.004, 0.995, 0.985, 0.976, 0.966, 0.957,
	0.948, 0.939, 0.93, 0.921, 0.912, 0.903, 0.895, 0.886, 0.885, 0.885, 0.884, 0.883, 0.882, 0.882, 0.881, 0.88, 0.88,
	0.879, 0.878, 0.878, 0.877, 0.876, 0.875, 0.875, 0.874, 0.873, 0.873, 0.872, 0.871, 0.871, 0.87, 0.869, 0.869, 0.868,
	0.867, 0.866, 0.866];
const HUE_DENSITY_AT_85 = [
	0.827, 0.841, 0.856, 0.871, 0.886, 0.901, 0.917, 0.933, 0.949, 0.966, 0.982, 0.999, 1.017, 1.034, 1.052, 1.071, 1.089,
	1.108, 1.127, 1.147, 1.167, 1.187, 1.208, 1.229, 1.25, 1.272, 1.294, 1.316, 1.339, 1.363, 1.386, 1.365, 1.344, 1.323,
	1.302, 1.282, 1.262, 1.243, 1.224, 1.205, 1.186, 1.168, 1.15, 1.132, 1.114, 1.097, 1.08, 1.063, 1.047, 1.031, 1.015,
	0.999, 0.984, 0.968, 0.953, 0.939, 0.924, 0.91, 0.896, 0.882, 0.868, 0.863, 0.857, 0.851, 0.846, 0.84, 0.835, 0.83,
	0.824, 0.819, 0.814, 0.808, 0.803, 0.798, 0.793, 0.788, 0.782, 0.777, 0.772, 0.767, 0.762, 0.757, 0.753, 0.748, 0.743,
	0.738, 0.733, 0.729, 0.724, 0.719, 0.714, 0.727, 0.741, 0.754, 0.768, 0.782, 0.796, 0.811, 0.825, 0.84, 0.856, 0.871,
	0.887, 0.903, 0.92, 0.937, 0.954, 0.971, 0.989, 1.007, 1.025, 1.044, 1.063, 1.082, 1.102, 1.122, 1.142, 1.163, 1.184,
	1.206, 1.228, 1.222, 1.217, 1.211, 1.206, 1.2, 1.195, 1.189, 1.184, 1.178, 1.173, 1.168, 1.163, 1.157, 1.152, 1.147,
	1.142, 1.136, 1.131, 1.126, 1.121, 1.116, 1.111, 1.106, 1.101, 1.096, 1.091, 1.086, 1.081, 1.076, 1.071, 1.058, 1.045,
	1.032, 1.019, 1.007, 0.995, 0.982, 0.97, 0.958, 0.946, 0.935, 0.923, 0.912, 0.901, 0.89, 0.879, 0.868, 0.857, 0.847,
	0.836, 0.826, 0.816, 0.806, 0.796, 0.786, 0.776, 0.767, 0.757, 0.748, 0.739, 0.746, 0.754, 0.762, 0.77, 0.778, 0.786,
	0.794, 0.802, 0.81, 0.819, 0.827, 0.836, 0.844, 0.853, 0.862, 0.871, 0.88, 0.889, 0.898, 0.907, 0.917, 0.926, 0.936,
	0.945, 0.955, 0.965, 0.975, 0.985, 0.995, 1.006, 0.994, 0.982, 0.97, 0.958, 0.947, 0.936, 0.925, 0.914, 0.903, 0.892,
	0.881, 0.871, 0.86, 0.85, 0.84, 0.83, 0.82, 0.81, 0.801, 0.791, 0.782, 0.772, 0.763, 0.754, 0.745, 0.736, 0.727,
	0.719, 0.71, 0.702, 0.709, 0.716, 0.723, 0.73, 0.737, 0.745, 0.752, 0.76, 0.767, 0.775, 0.783, 0.791, 0.799, 0.807,
	0.815, 0.823, 0.831, 0.84, 0.848, 0.857, 0.865, 0.874, 0.883, 0.891, 0.9, 0.909, 0.919, 0.928, 0.937, 0.947, 0.97,
	0.994, 1.019, 1.044, 1.07, 1.097, 1.124, 1.152, 1.181, 1.21, 1.241, 1.272, 1.303, 1.336, 1.369, 1.403, 1.438, 1.474,
	1.51, 1.548, 1.587, 1.626, 1.667, 1.708, 1.751, 1.794, 1.839, 1.885, 1.932, 1.98, 1.92, 1.862, 1.806, 1.751, 1.699,
	1.647, 1.598, 1.549, 1.503, 1.457, 1.413, 1.371, 1.329, 1.289, 1.25, 1.212, 1.176, 1.14, 1.106, 1.073, 1.04, 1.009,
	0.978, 0.949, 0.92, 0.892, 0.865, 0.839, 0.814, 0.789, 0.791, 0.792, 0.793, 0.794, 0.796, 0.797, 0.798, 0.799, 0.8,
	0.802, 0.803, 0.804, 0.805, 0.807, 0.808, 0.809, 0.811, 0.812, 0.813, 0.814, 0.816, 0.817, 0.818, 0.819, 0.821, 0.822,
	0.823, 0.824, 0.826];

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

// The warped hue of each whole degree, 0 to 360: the running integral of a density per whole degree, scaled to a full turn.
function hueWarpOf(density) {
	const warp = [0];
	for (let h = 0; h < 360; ++h)
		warp.push(warp[h] + density[h]);
	return warp.map(v => v * 360 / warp[360]);
}
const HUE_WARP = hueWarpOf(HUE_DENSITY);
const HUE_LEVEL_DENSITIES = [[30, HUE_DENSITY_AT_30], [58, HUE_DENSITY_AT_58], [85, HUE_DENSITY_AT_85]];
// The color with its hue moved to the warped hue, chroma and lightness kept.
const warpedLab = lab => warpedUnder(lab, HUE_WARP);
// warp, or the mix of it and `toward` at the share t: two warps mixed are a warp, both run from 0 to 360.
function warpedUnder(lab, warp, toward = warp, t = 0) {
	const h = (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360, at = Math.floor(h), hueIn = w => w[at] + (w[at + 1] - w[at]) * (h - at);
	const turned = (hueIn(warp) * (1 - t) + hueIn(toward) * t) * Math.PI / 180;
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
// the fit scripts measure against this at the defaults, so it must stay the raw quantity they were fitted on.
// shade, sameHueLightness, sameHueSpan: as SHADE_DISCOUNT, SAME_HUE_LIGHTNESS and SAME_HUE_SPAN; the defaults leave both terms out.
function weightedDistance(p, q, wL, wC, hueScale = 1, shade = 0, sameHueLightness = 1, sameHueSpan = 1) {
	const Cp = Math.hypot(p[1], p[2]), Cq = Math.hypot(q[1], q[2]), dL = p[0] - q[0], dC = Cp - Cq;
	const hue2 = Math.max(0, (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 - dC * dC) * hueScale * hueScale;
	const chroma = wC * (dC - shade * (Cp + Cq) / Math.max(5, p[0] + q[0]) * dL);
	const lightness = dL * wL * (sameHueLightness + (1 - sameHueLightness) * hue2 / (hue2 + sameHueSpan * sameHueSpan));
	return Math.sqrt(lightness * lightness + chroma * chroma + hue2);
}

// How far apart a pair reads: the weighted distance of the hue-warped points, the hue term scaled by the
// pair's mean chroma, times the gain for the pair's lightness. This is the metric the generator optimizes
// and this file scores.
// levels: the hue warps by lightness, [{ L, warp }] in rising L; a pair's is the mix of the two around its mean lightness,
// the first or the last beyond them.
// wL, wC: one weight, or a table per whole degree read at the pair's hue.
// shape: { shade, sameHueLightness, sameHueSpan }, the terms weightedDistance adds.
function distanceUnder(p, q, levels, wL, wC, power, gainExponent, shape) {
	const meanL = (p[0] + q[0]) / 2, found = levels.findIndex(level => level.L > meanL), above = found < 0 ? levels.length : found;
	const from = levels[Math.max(0, above - 1)], to = levels[Math.min(above, levels.length - 1)];
	const t = to === from ? 0 : Math.min(1, Math.max(0, (meanL - from.L) / (to.L - from.L)));
	const hue = typeof wL === "number" && typeof wC === "number" ? 0 : pairHue(p, q);
	return weightedDistance(warpedUnder(p, from.warp, to.warp, t), warpedUnder(q, from.warp, to.warp, t), typeof wL === "number" ? wL : weightAt(wL, hue),
		typeof wC === "number" ? wC : weightAt(wC, hue), hueScaleAt((Math.hypot(p[1], p[2]) + Math.hypot(q[1], q[2])) / 2, power),
		shape.shade, shape.sameHueLightness, shape.sameHueSpan) * lightnessGain(meanL, gainExponent);
}
const BUILT_LEVELS = HUE_LEVEL_DENSITIES.map(([L, density]) => ({ L, warp: hueWarpOf(density) }));
const BUILT_SHAPE = { shade: SHADE_DISCOUNT, sameHueLightness: SAME_HUE_LIGHTNESS, sameHueSpan: SAME_HUE_SPAN };
const recallDistance = (p, q) => distanceUnder(p, q, BUILT_LEVELS, HUE_WEIGHT_L, HUE_WEIGHT_C, CHROMA_POWER, LIGHTNESS_EXPONENT, BUILT_SHAPE);
// The same distance under a candidate's hue density per whole degree, weights, chroma power, gain exponent and shape terms:
// what a fit measures, so its numbers hold in the metric they are pasted into. One density for every lightness, or levels,
// [{ L, density }] in rising L; the built levels with neither. A weight is one number or a table per whole degree.
function metricWith({ density, levels = density ? [{ L: 0, density }] : HUE_LEVEL_DENSITIES.map(([L, built]) => ({ L, density: built })), wL = HUE_WEIGHT_L, wC = HUE_WEIGHT_C, power = CHROMA_POWER, gainExponent = LIGHTNESS_EXPONENT,
	shade = SHADE_DISCOUNT, sameHueLightness = SAME_HUE_LIGHTNESS, sameHueSpan = SAME_HUE_SPAN }) {
	const warps = levels.map(level => ({ L: level.L, warp: hueWarpOf(level.density) })), shape = { shade, sameHueLightness, sameHueSpan };
	return (p, q) => distanceUnder(p, q, warps, wL, wC, power, gainExponent, shape);
}

// Chance a recall of one color of a pair lands nearer the other: noise of width sigma along the
// pair's line, past the midpoint.
const swapChance = (distance, sigma) => 0.5 * erfc(distance / (2 * sigma) / Math.SQRT2);

// Rows are the color shown, columns the entry answered. Off the diagonal the pair's swap chance;
// on it what is left, floored at zero: the sum over pairs overstates the error of a crowded color.
function confusionMatrix(labs, sigma) {
	const n = labs.length;
	const matrix = Array.from({ length: n }, () => new Float64Array(n));
	for (let i = 0; i < n; ++i) {
		let error = 0;
		for (let j = 0; j < n; ++j)
			if (j !== i)
				error += matrix[i][j] = swapChance(recallDistance(labs[i], labs[j]), sigma);
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
	return summarize(confusionMatrix(hexes.map(labOf), SIGMA));
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
// The metric's constants the page holds a copy of, checked as its tables are.
const METRIC_SCALARS = { SIGMA, CHROMA_POWER, LIGHTNESS_EXPONENT, SHADE_DISCOUNT, SAME_HUE_LIGHTNESS, SAME_HUE_SPAN };
// `densities`, when given, swaps the page's hue density for the metric's warp and for the draw's
// acceptance separately, so hue-marginals.js can tell their effects apart; either may be null to keep
// the page's own. Its `hueBoostRanges` replaces HUE_BOOST_RANGES, for fit_hue_boost.js.
// Fails if the page lacks what it patches.
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
		// A page with a density per lightness gets the one density at every level
		const ONE_WARP = "warp.push(warp[h] + HUE_DENSITY[h]);", LEVELS = source.match(/const HUE_LEVEL_DENSITIES = .*;/)?.[0];
		if (densities && densities.metric && !source.includes(ONE_WARP) && LEVELS)
			patch(LEVELS, "const HUE_LEVEL_DENSITIES = [[30, " + JSON.stringify(densities.metric) + "], [85, " + JSON.stringify(densities.metric) + "]];");
		else if (densities && densities.metric)
			patch(ONE_WARP, "warp.push(warp[h] + " + JSON.stringify(densities.metric) + "[h]);");
		if (densities && densities.hueBoostRanges)
			patch(source.match(/const HUE_BOOST_RANGES = \[[\s\S]*?\];/)?.[0] ?? "const HUE_BOOST_RANGES = [",
				"const HUE_BOOST_RANGES = " + JSON.stringify(densities.hueBoostRanges) + ";");
		if (densities && densities.draw)
			patch("const weight = HUE_DENSITY.map(", "const weight = " + JSON.stringify(densities.draw) + ".map(");
		globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
		const scalars = Object.keys(METRIC_SCALARS).map(name => name + ": typeof " + name + " === 'undefined' ? null : " + name).join(", ");
		const page = (0, eval)(source
			+ "; ({ generate, cellOf, colorFromHex, CELL_NAMES, CELL_OVERLAP, mulberry32, oklabToRgb, labOfLch, absoluteL: typeof absoluteL === 'undefined' ? null : absoluteL, HUE_DENSITY: typeof HUE_DENSITY === 'undefined' ? null : HUE_DENSITY,"
			+ " HUE_LEVEL_DENSITIES: typeof HUE_LEVEL_DENSITIES === 'undefined' ? null : HUE_LEVEL_DENSITIES,"
			+ " HUE_WEIGHT_L: typeof HUE_WEIGHT_L === 'undefined' ? null : HUE_WEIGHT_L, HUE_WEIGHT_C: typeof HUE_WEIGHT_C === 'undefined' ? null : HUE_WEIGHT_C,"
			+ " scalars: { " + scalars + " },"
			// The box sampler of pages before the rebuilt generator (data/past-experiments/experimental-cells-pushes.html), for hue-marginals.js.
			+ " ...(typeof boxCells === 'undefined' ? {} : { boxCells, samplePoint, SPARSE_FRACTION }) })");
		// A page respacing hue or weighing an axis differently from this file is scored on a metric other than its own.
		const sameTable = (a, b) => !!a && a.length === b.length && a.every((v, h) => v === b[h]);
		const sameLevels = page.HUE_LEVEL_DENSITIES?.length === HUE_LEVEL_DENSITIES.length
			&& page.HUE_LEVEL_DENSITIES.every(([L, density], k) => L === HUE_LEVEL_DENSITIES[k][0] && density.every((d, h) => d === HUE_LEVEL_DENSITIES[k][1][h]));
		const differing = [...(!sameLevels || !sameTable(page.HUE_DENSITY, HUE_DENSITY) || !sameTable(page.HUE_WEIGHT_L, HUE_WEIGHT_L) || !sameTable(page.HUE_WEIGHT_C, HUE_WEIGHT_C) ? ["tables"] : []),
			...Object.entries(METRIC_SCALARS).filter(([name, value]) => page.scalars[name] !== value).map(([name]) => name)];
		if (!densities && differing.length)
			console.warn(path.basename(pagePath) + ": metric not as in this file (" + differing.join(", ") + "); scores are on this file's metric");
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

	console.log(path.basename(pagePath) + " - identification, sigma " + SIGMA + "; naming, wL " + W_L.toFixed(3) + " wC " + W_C.toFixed(3)
		+ " decay " + NAME_DECAY);
	console.log("                 identification          naming");
	// The two scores are reported side by side and never combined: identification is the one the
	// generator optimizes, naming the second opinion, and a run where they disagree is the finding.
	let grandFloor = 0, grandMean = 0, grandNamed = 0, runs = 0;
	for (const box of boxes)
		for (const count of counts) {
			let floor = 0, mean = 0, gap = 0, least = 1, namedFloor = 0, namedMean = 0, leastNamed = 1;
			for (const seed of seeds) {
				const hexes = generate({ count, seed, fixed: [], ...box }).colors.map(color => color.hex);
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

// Writes a deal into a calibration page between its deal markers, as `const <constName> = <data>;`: a page opened from disk
// can fetch nothing. pageName is the file in this directory.
function writeDeal(pageName, constName, data) {
	const out = path.join(__dirname, pageName), OPEN = "// ---------- deal ----------\n", CLOSE = "// ---------- end deal ----------";
	const source = fs.readFileSync(out, "utf8"), from = source.indexOf(OPEN), to = source.indexOf(CLOSE);
	if (from < 0 || to < from)
		throw new Error(pageName + " lacks the deal markers");
	fs.writeFileSync(out, source.slice(0, from + OPEN.length) + "const " + constName + " = " + JSON.stringify(data) + ";\n" + source.slice(to));
}

module.exports = { SIGMA, W_L, W_C, HUE_WEIGHT_L, HUE_WEIGHT_C, SHADE_DISCOUNT, SAME_HUE_LIGHTNESS, SAME_HUE_SPAN, weightAt, pairHue, CHROMA_POWER, CHROMA_REFERENCE, CHROMA_FLOOR, LIGHTNESS_EXPONENT, LIGHTNESS_REFERENCE, LIGHTNESS_FLOOR, lightnessGain, hueScaleAt, NAME_DECAY, CALIBRATED_PX, HUE_DENSITY, HUE_LEVEL_DENSITIES, HUE_DENSITY_AUTHORED,
	labOf, rgbOf, warpedLab, weightedDistance, recallDistance, metricWith, swapChance, confusionMatrix, summarize, score, nameCollision,
	loadPage, writeDeal, gamutChroma, cuspLightness, relativePosition };

if (require.main === module)
	main(process.argv.slice(2));
