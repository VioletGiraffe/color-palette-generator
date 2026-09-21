#!/usr/bin/env node
// Two scores for a palette, reported side by side and never combined.
//
// Identification, the one the generator optimizes: the chance a viewer who learned the palette
// picks the right entry for a color shown on its own. Recall is the color plus Gaussian memory
// noise in OKLab; the viewer answers with the nearest palette entry. Noise is anisotropic:
// lightness and chroma differences count by their weight against hue differences, and hues are
// respaced by the level densities first. A pair swaps with the chance the noise carries a recall past their
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
// SIGMA is fitted by data/fit.js to data/calibration-log.json. W_L, W_C, LIGHTNESS_EXPONENT and the level
// densities are one fit to the preference rounds; see HUE_DENSITY_AT_30 and data/scripts.md.
const SIGMA = 3;
const W_L = 0.46;
const W_C = 0.83;
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
const LIGHTNESS_EXPONENT = 0.21;
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
// node data/fit_hue_density.js --own-cuts --ridge 10 --free wl,wc,gain --table over boundary-4-log.json to
// boundary-20-log.json. See index.html.
const HUE_DENSITY = [
	0.842, 0.861, 0.881, 0.902, 0.922, 0.943, 0.965, 0.987, 1.01, 1.033, 1.057, 1.081, 1.106, 1.132, 1.158, 1.184, 1.212,
	1.24, 1.268, 1.297, 1.327, 1.358, 1.389, 1.421, 1.454, 1.487, 1.521, 1.556, 1.592, 1.629, 1.666, 1.63, 1.596, 1.561,
	1.528, 1.495, 1.463, 1.432, 1.401, 1.371, 1.342, 1.313, 1.285, 1.257, 1.23, 1.204, 1.178, 1.153, 1.128, 1.104, 1.081,
	1.057, 1.035, 1.013, 0.991, 0.97, 0.949, 0.929, 0.909, 0.889, 0.87, 0.86, 0.85, 0.84, 0.83, 0.82, 0.811, 0.801,
	0.792, 0.782, 0.773, 0.764, 0.755, 0.746, 0.738, 0.729, 0.72, 0.712, 0.704, 0.695, 0.687, 0.679, 0.671, 0.663, 0.656,
	0.648, 0.64, 0.633, 0.625, 0.618, 0.611, 0.625, 0.639, 0.654, 0.669, 0.685, 0.701, 0.717, 0.734, 0.751, 0.768, 0.786,
	0.804, 0.823, 0.842, 0.861, 0.881, 0.902, 0.923, 0.944, 0.966, 0.989, 1.011, 1.035, 1.059, 1.084, 1.109, 1.134, 1.161,
	1.188, 1.215, 1.209, 1.202, 1.195, 1.189, 1.182, 1.176, 1.17, 1.163, 1.157, 1.151, 1.144, 1.138, 1.132, 1.126, 1.12,
	1.113, 1.107, 1.101, 1.095, 1.089, 1.083, 1.077, 1.072, 1.066, 1.06, 1.054, 1.048, 1.043, 1.037, 1.031, 1.021, 1.01,
	1, 0.989, 0.979, 0.969, 0.959, 0.949, 0.94, 0.93, 0.92, 0.911, 0.901, 0.892, 0.883, 0.874, 0.865, 0.856, 0.847,
	0.838, 0.83, 0.821, 0.813, 0.804, 0.796, 0.788, 0.78, 0.772, 0.764, 0.756, 0.762, 0.769, 0.775, 0.781, 0.788, 0.795,
	0.801, 0.808, 0.815, 0.821, 0.828, 0.835, 0.842, 0.849, 0.856, 0.863, 0.871, 0.878, 0.885, 0.893, 0.9, 0.908, 0.915,
	0.923, 0.931, 0.938, 0.946, 0.954, 0.962, 0.97, 0.968, 0.965, 0.963, 0.96, 0.958, 0.955, 0.953, 0.95, 0.948, 0.946,
	0.943, 0.941, 0.938, 0.936, 0.933, 0.931, 0.929, 0.926, 0.924, 0.922, 0.919, 0.917, 0.914, 0.912, 0.91, 0.907, 0.905,
	0.903, 0.9, 0.898, 0.903, 0.907, 0.912, 0.917, 0.921, 0.926, 0.931, 0.935, 0.94, 0.945, 0.95, 0.955, 0.959, 0.964,
	0.969, 0.974, 0.979, 0.984, 0.989, 0.994, 0.999, 1.004, 1.009, 1.015, 1.02, 1.025, 1.03, 1.035, 1.041, 1.046, 1.056,
	1.065, 1.075, 1.085, 1.095, 1.105, 1.115, 1.125, 1.136, 1.146, 1.157, 1.167, 1.178, 1.189, 1.2, 1.211, 1.222, 1.233,
	1.245, 1.256, 1.268, 1.279, 1.291, 1.303, 1.315, 1.327, 1.339, 1.352, 1.364, 1.377, 1.357, 1.337, 1.318, 1.299, 1.28,
	1.262, 1.244, 1.226, 1.208, 1.191, 1.173, 1.157, 1.14, 1.123, 1.107, 1.091, 1.076, 1.06, 1.045, 1.03, 1.015, 1,
	0.986, 0.972, 0.958, 0.944, 0.93, 0.917, 0.904, 0.891, 0.889, 0.887, 0.886, 0.884, 0.882, 0.881, 0.879, 0.877, 0.876,
	0.874, 0.873, 0.871, 0.869, 0.868, 0.866, 0.864, 0.863, 0.861, 0.86, 0.858, 0.856, 0.855, 0.853, 0.852, 0.85, 0.848,
	0.847, 0.845, 0.844];
// The density at lightness 30, 58 and 85, the metric's; the page's copy, which loadPage checks against this one. The output of
// node data/fit_hue_density.js --own-cuts --ridge 10 --free wl,wc,gain --levels 30,58,85 --table over boundary-4-log.json to
// boundary-20-log.json. See index.html.
const HUE_DENSITY_AT_30 = [
	1.014, 1.039, 1.064, 1.09, 1.117, 1.144, 1.173, 1.201, 1.231, 1.261, 1.292, 1.324, 1.357, 1.39, 1.424, 1.459, 1.495,
	1.532, 1.569, 1.608, 1.648, 1.688, 1.73, 1.772, 1.816, 1.86, 1.906, 1.953, 2.001, 2.05, 2.101, 2.036, 1.974, 1.914,
	1.856, 1.799, 1.744, 1.691, 1.639, 1.589, 1.541, 1.494, 1.448, 1.404, 1.361, 1.319, 1.279, 1.24, 1.202, 1.166, 1.13,
	1.096, 1.062, 1.03, 0.998, 0.968, 0.938, 0.91, 0.882, 0.855, 0.829, 0.817, 0.805, 0.794, 0.783, 0.772, 0.761, 0.75,
	0.739, 0.729, 0.718, 0.708, 0.698, 0.688, 0.679, 0.669, 0.659, 0.65, 0.641, 0.632, 0.623, 0.614, 0.605, 0.597, 0.588,
	0.58, 0.572, 0.564, 0.556, 0.548, 0.54, 0.549, 0.559, 0.569, 0.579, 0.589, 0.599, 0.61, 0.62, 0.631, 0.642, 0.654,
	0.665, 0.677, 0.689, 0.701, 0.713, 0.725, 0.738, 0.751, 0.764, 0.778, 0.791, 0.805, 0.819, 0.833, 0.848, 0.863, 0.878,
	0.893, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909,
	0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.909, 0.91, 0.902, 0.894,
	0.886, 0.878, 0.87, 0.863, 0.855, 0.848, 0.84, 0.833, 0.826, 0.819, 0.811, 0.804, 0.797, 0.79, 0.783, 0.777, 0.77,
	0.763, 0.756, 0.75, 0.743, 0.737, 0.73, 0.724, 0.718, 0.711, 0.705, 0.699, 0.709, 0.719, 0.729, 0.739, 0.75, 0.76,
	0.771, 0.782, 0.793, 0.804, 0.816, 0.827, 0.839, 0.851, 0.863, 0.875, 0.887, 0.9, 0.912, 0.925, 0.938, 0.951, 0.965,
	0.978, 0.992, 1.006, 1.02, 1.035, 1.049, 1.064, 1.059, 1.054, 1.049, 1.044, 1.039, 1.034, 1.029, 1.025, 1.02, 1.015,
	1.01, 1.005, 1.001, 0.996, 0.991, 0.986, 0.982, 0.977, 0.972, 0.968, 0.963, 0.959, 0.954, 0.95, 0.945, 0.941, 0.936,
	0.932, 0.927, 0.923, 0.931, 0.938, 0.946, 0.954, 0.962, 0.97, 0.978, 0.986, 0.994, 1.003, 1.011, 1.019, 1.028, 1.036,
	1.045, 1.054, 1.062, 1.071, 1.08, 1.089, 1.098, 1.107, 1.116, 1.126, 1.135, 1.144, 1.154, 1.163, 1.173, 1.183, 1.183,
	1.183, 1.182, 1.182, 1.182, 1.182, 1.182, 1.182, 1.182, 1.182, 1.182, 1.182, 1.182, 1.181, 1.181, 1.181, 1.181, 1.181,
	1.181, 1.181, 1.181, 1.181, 1.181, 1.18, 1.18, 1.18, 1.18, 1.18, 1.18, 1.18, 1.168, 1.156, 1.145, 1.133, 1.122,
	1.111, 1.1, 1.089, 1.078, 1.067, 1.056, 1.046, 1.035, 1.025, 1.014, 1.004, 0.994, 0.984, 0.974, 0.965, 0.955, 0.945,
	0.936, 0.926, 0.917, 0.908, 0.899, 0.89, 0.881, 0.872, 0.876, 0.881, 0.885, 0.89, 0.894, 0.899, 0.903, 0.908, 0.912,
	0.917, 0.921, 0.926, 0.931, 0.935, 0.94, 0.945, 0.95, 0.954, 0.959, 0.964, 0.969, 0.974, 0.979, 0.984, 0.988, 0.993,
	0.998, 1.003, 1.009];
const HUE_DENSITY_AT_58 = [
	0.746, 0.767, 0.788, 0.81, 0.832, 0.855, 0.879, 0.903, 0.928, 0.953, 0.98, 1.007, 1.034, 1.063, 1.092, 1.122, 1.153,
	1.185, 1.218, 1.251, 1.286, 1.321, 1.358, 1.395, 1.434, 1.473, 1.514, 1.556, 1.598, 1.642, 1.688, 1.654, 1.622, 1.589,
	1.558, 1.527, 1.497, 1.467, 1.438, 1.409, 1.381, 1.354, 1.327, 1.301, 1.275, 1.25, 1.225, 1.201, 1.177, 1.154, 1.131,
	1.108, 1.086, 1.065, 1.044, 1.023, 1.003, 0.983, 0.963, 0.944, 0.926, 0.91, 0.895, 0.881, 0.866, 0.852, 0.838, 0.824,
	0.811, 0.797, 0.784, 0.771, 0.759, 0.746, 0.734, 0.722, 0.71, 0.698, 0.687, 0.676, 0.665, 0.654, 0.643, 0.632, 0.622,
	0.612, 0.602, 0.592, 0.582, 0.573, 0.563, 0.578, 0.594, 0.61, 0.626, 0.643, 0.661, 0.678, 0.697, 0.715, 0.735, 0.755,
	0.775, 0.796, 0.817, 0.839, 0.862, 0.885, 0.909, 0.933, 0.959, 0.984, 1.011, 1.038, 1.066, 1.095, 1.124, 1.155, 1.186,
	1.218, 1.251, 1.254, 1.257, 1.26, 1.264, 1.267, 1.27, 1.273, 1.277, 1.28, 1.283, 1.287, 1.29, 1.293, 1.297, 1.3,
	1.303, 1.307, 1.31, 1.314, 1.317, 1.32, 1.324, 1.327, 1.331, 1.334, 1.338, 1.341, 1.345, 1.348, 1.352, 1.33, 1.309,
	1.288, 1.268, 1.248, 1.228, 1.208, 1.189, 1.17, 1.152, 1.134, 1.116, 1.098, 1.081, 1.063, 1.047, 1.03, 1.014, 0.998,
	0.982, 0.966, 0.951, 0.936, 0.921, 0.906, 0.892, 0.878, 0.864, 0.85, 0.837, 0.844, 0.851, 0.859, 0.866, 0.874, 0.881,
	0.889, 0.897, 0.904, 0.912, 0.92, 0.928, 0.936, 0.944, 0.953, 0.961, 0.969, 0.978, 0.986, 0.995, 1.003, 1.012, 1.021,
	1.03, 1.039, 1.048, 1.057, 1.066, 1.075, 1.085, 1.073, 1.062, 1.051, 1.04, 1.029, 1.018, 1.007, 0.997, 0.986, 0.976,
	0.966, 0.955, 0.945, 0.935, 0.926, 0.916, 0.906, 0.897, 0.887, 0.878, 0.869, 0.859, 0.85, 0.841, 0.833, 0.824, 0.815,
	0.807, 0.798, 0.79, 0.794, 0.799, 0.804, 0.808, 0.813, 0.818, 0.823, 0.827, 0.832, 0.837, 0.842, 0.847, 0.852, 0.857,
	0.862, 0.867, 0.872, 0.877, 0.882, 0.887, 0.892, 0.897, 0.903, 0.908, 0.913, 0.919, 0.924, 0.929, 0.935, 0.94, 0.948,
	0.956, 0.963, 0.971, 0.979, 0.987, 0.995, 1.003, 1.011, 1.02, 1.028, 1.036, 1.045, 1.053, 1.062, 1.07, 1.079, 1.088,
	1.097, 1.105, 1.114, 1.124, 1.133, 1.142, 1.151, 1.16, 1.17, 1.179, 1.189, 1.199, 1.185, 1.171, 1.157, 1.143, 1.13,
	1.116, 1.103, 1.09, 1.077, 1.064, 1.052, 1.039, 1.027, 1.015, 1.003, 0.991, 0.98, 0.968, 0.957, 0.945, 0.934, 0.923,
	0.912, 0.901, 0.891, 0.88, 0.87, 0.86, 0.849, 0.839, 0.836, 0.833, 0.83, 0.826, 0.823, 0.82, 0.817, 0.814, 0.81,
	0.807, 0.804, 0.801, 0.798, 0.795, 0.792, 0.788, 0.785, 0.782, 0.779, 0.776, 0.773, 0.77, 0.767, 0.764, 0.761, 0.758,
	0.755, 0.752, 0.749];
const HUE_DENSITY_AT_85 = [
	0.812, 0.825, 0.838, 0.852, 0.865, 0.879, 0.893, 0.907, 0.922, 0.937, 0.952, 0.967, 0.982, 0.998, 1.014, 1.03, 1.047,
	1.064, 1.081, 1.098, 1.115, 1.133, 1.151, 1.17, 1.189, 1.208, 1.227, 1.247, 1.266, 1.287, 1.307, 1.288, 1.268, 1.249,
	1.23, 1.212, 1.194, 1.176, 1.158, 1.141, 1.123, 1.107, 1.09, 1.074, 1.057, 1.042, 1.026, 1.01, 0.995, 0.98, 0.966,
	0.951, 0.937, 0.923, 0.909, 0.895, 0.882, 0.868, 0.855, 0.842, 0.83, 0.823, 0.816, 0.809, 0.802, 0.795, 0.788, 0.781,
	0.774, 0.768, 0.761, 0.755, 0.748, 0.742, 0.735, 0.729, 0.723, 0.716, 0.71, 0.704, 0.698, 0.692, 0.686, 0.68, 0.674,
	0.669, 0.663, 0.657, 0.652, 0.646, 0.64, 0.654, 0.668, 0.683, 0.697, 0.712, 0.728, 0.743, 0.759, 0.776, 0.792, 0.809,
	0.827, 0.845, 0.863, 0.881, 0.9, 0.92, 0.94, 0.96, 0.981, 1.002, 1.023, 1.045, 1.068, 1.091, 1.114, 1.138, 1.163,
	1.188, 1.213, 1.203, 1.192, 1.182, 1.171, 1.161, 1.151, 1.141, 1.131, 1.121, 1.111, 1.102, 1.092, 1.082, 1.073, 1.064,
	1.054, 1.045, 1.036, 1.027, 1.018, 1.009, 1, 0.991, 0.983, 0.974, 0.966, 0.957, 0.949, 0.941, 0.932, 0.924, 0.916,
	0.907, 0.899, 0.891, 0.883, 0.875, 0.867, 0.859, 0.851, 0.844, 0.836, 0.829, 0.821, 0.814, 0.806, 0.799, 0.792, 0.785,
	0.778, 0.771, 0.764, 0.757, 0.75, 0.743, 0.736, 0.73, 0.723, 0.717, 0.71, 0.715, 0.719, 0.723, 0.728, 0.732, 0.737,
	0.741, 0.746, 0.75, 0.755, 0.759, 0.764, 0.769, 0.773, 0.778, 0.783, 0.788, 0.792, 0.797, 0.802, 0.807, 0.812, 0.817,
	0.822, 0.827, 0.832, 0.837, 0.842, 0.847, 0.852, 0.854, 0.855, 0.856, 0.858, 0.859, 0.861, 0.862, 0.863, 0.865, 0.866,
	0.868, 0.869, 0.87, 0.872, 0.873, 0.874, 0.876, 0.877, 0.879, 0.88, 0.882, 0.883, 0.884, 0.886, 0.887, 0.889, 0.89,
	0.892, 0.893, 0.894, 0.9, 0.906, 0.912, 0.917, 0.923, 0.929, 0.935, 0.941, 0.947, 0.953, 0.959, 0.965, 0.972, 0.978,
	0.984, 0.99, 0.997, 1.003, 1.009, 1.016, 1.022, 1.029, 1.035, 1.042, 1.049, 1.055, 1.062, 1.069, 1.076, 1.083, 1.108,
	1.135, 1.162, 1.189, 1.218, 1.247, 1.276, 1.307, 1.338, 1.37, 1.402, 1.436, 1.47, 1.505, 1.541, 1.578, 1.615, 1.654,
	1.693, 1.733, 1.775, 1.817, 1.86, 1.904, 1.95, 1.996, 2.044, 2.092, 2.142, 2.193, 2.121, 2.051, 1.983, 1.917, 1.854,
	1.793, 1.734, 1.676, 1.621, 1.567, 1.515, 1.465, 1.417, 1.37, 1.325, 1.281, 1.239, 1.198, 1.158, 1.12, 1.083, 1.047,
	1.013, 0.979, 0.947, 0.915, 0.885, 0.856, 0.828, 0.8, 0.801, 0.801, 0.801, 0.802, 0.802, 0.803, 0.803, 0.803, 0.804,
	0.804, 0.805, 0.805, 0.805, 0.806, 0.806, 0.807, 0.807, 0.807, 0.808, 0.808, 0.808, 0.809, 0.809, 0.81, 0.81, 0.81,
	0.811, 0.811, 0.812];

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
// the fit scripts measure against this at the default, so it must stay the raw quantity they were fitted on.
function weightedDistance(p, q, wL, wC, hueScale = 1) {
	const dL = (p[0] - q[0]) * wL, dC = Math.hypot(p[1], p[2]) - Math.hypot(q[1], q[2]);
	const chord2 = (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
	return Math.sqrt(dL * dL + wC * wC * dC * dC + Math.max(0, chord2 - dC * dC) * hueScale * hueScale);
}

// How far apart a pair reads: the weighted distance of the hue-warped points, the hue term scaled by the
// pair's mean chroma, times the gain for the pair's lightness. This is the metric the generator optimizes
// and this file scores.
// levels: the hue warps by lightness, [{ L, warp }] in rising L; a pair's is the mix of the two around its mean lightness,
// the first or the last beyond them.
function distanceUnder(p, q, levels, wL, wC, power, gainExponent) {
	const meanL = (p[0] + q[0]) / 2, found = levels.findIndex(level => level.L > meanL), above = found < 0 ? levels.length : found;
	const from = levels[Math.max(0, above - 1)], to = levels[Math.min(above, levels.length - 1)];
	const t = to === from ? 0 : Math.min(1, Math.max(0, (meanL - from.L) / (to.L - from.L)));
	return weightedDistance(warpedUnder(p, from.warp, to.warp, t), warpedUnder(q, from.warp, to.warp, t), wL, wC, hueScaleAt((Math.hypot(p[1], p[2]) + Math.hypot(q[1], q[2])) / 2, power))
		* lightnessGain(meanL, gainExponent);
}
const BUILT_LEVELS = HUE_LEVEL_DENSITIES.map(([L, density]) => ({ L, warp: hueWarpOf(density) }));
const recallDistance = (p, q, wL, wC) => distanceUnder(p, q, BUILT_LEVELS, wL, wC, CHROMA_POWER, LIGHTNESS_EXPONENT);
// The same distance under a candidate's hue density per whole degree, weights, chroma power and gain exponent: what a fit
// measures, so its numbers hold in the metric they are pasted into. One density for every lightness, or levels,
// [{ L, density }] in rising L; the built levels with neither.
function metricWith({ density, levels = density ? [{ L: 0, density }] : HUE_LEVEL_DENSITIES.map(([L, built]) => ({ L, density: built })), wL = W_L, wC = W_C, power = CHROMA_POWER, gainExponent = LIGHTNESS_EXPONENT }) {
	const warps = levels.map(level => ({ L: level.L, warp: hueWarpOf(level.density) }));
	return (p, q) => distanceUnder(p, q, warps, wL, wC, power, gainExponent);
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
		// A page with a density per lightness gets the one density at every level
		const ONE_WARP = "warp.push(warp[h] + HUE_DENSITY[h]);", LEVELS = source.match(/const HUE_LEVEL_DENSITIES = .*;/)?.[0];
		if (densities && densities.metric && !source.includes(ONE_WARP) && LEVELS)
			patch(LEVELS, "const HUE_LEVEL_DENSITIES = [[30, " + JSON.stringify(densities.metric) + "], [85, " + JSON.stringify(densities.metric) + "]];");
		else if (densities && densities.metric)
			patch(ONE_WARP, "warp.push(warp[h] + " + JSON.stringify(densities.metric) + "[h]);");
		if (densities && densities.draw)
			patch("const weight = HUE_DENSITY.map(", "const weight = " + JSON.stringify(densities.draw) + ".map(");
		globalThis.atob = s => Buffer.from(s, "base64").toString("binary");
		const page = (0, eval)(source
			+ "; ({ generate, cellOf, colorFromHex, CELL_NAMES, CELL_OVERLAP, mulberry32, oklabToRgb, labOfLch, HUE_DENSITY: typeof HUE_DENSITY === 'undefined' ? null : HUE_DENSITY,"
			+ " HUE_LEVEL_DENSITIES: typeof HUE_LEVEL_DENSITIES === 'undefined' ? null : HUE_LEVEL_DENSITIES,"
			// The box sampler of pages before the rebuilt generator (data/past-experiments/experimental-cells-pushes.html), for hue-marginals.js.
			+ " ...(typeof boxCells === 'undefined' ? {} : { boxCells, samplePoint, SPARSE_FRACTION }) })");
		// A page respacing hue differently from this file is scored on a metric other than its own.
		const sameLevels = page.HUE_LEVEL_DENSITIES?.length === HUE_LEVEL_DENSITIES.length
			&& page.HUE_LEVEL_DENSITIES.every(([L, density], k) => L === HUE_LEVEL_DENSITIES[k][0] && density.every((d, h) => d === HUE_LEVEL_DENSITIES[k][1][h]));
		if (!densities && (!sameLevels || !page.HUE_DENSITY || page.HUE_DENSITY.some((d, h) => d !== HUE_DENSITY[h])))
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

module.exports = { SIGMA, W_L, W_C, CHROMA_POWER, CHROMA_REFERENCE, CHROMA_FLOOR, LIGHTNESS_EXPONENT, LIGHTNESS_REFERENCE, LIGHTNESS_FLOOR, lightnessGain, hueScaleAt, NAME_DECAY, CALIBRATED_PX, HUE_DENSITY, HUE_LEVEL_DENSITIES, HUE_DENSITY_AUTHORED,
	labOf, rgbOf, warpedLab, weightedDistance, recallDistance, metricWith, swapChance, confusionMatrix, summarize, score, nameCollision,
	loadPage, gamutChroma, cuspLightness, relativePosition };

if (require.main === module)
	main(process.argv.slice(2));
