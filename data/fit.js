#!/usr/bin/env node
// Fits the weights of data/identify.js and the page's Distinctness default to calibrate.html
// verdicts by maximum likelihood: an ordered probit over the weighted pair distance ("too close"
// below one threshold, "marginal" up to a second, fine above, each boundary blurred by a softness),
// with a lapse rate for stray marks. Prints the constants to paste, the likelihood profile along
// each parameter, and observed against predicted verdicts per probe condition.
//
//     node data/fit.js log.json [more.json ...]

"use strict";
const fs = require("fs");
const { labOf } = require("./identify.js");

const WEIGHTS = [0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 0.85, 1, 1.2, 1.4, 1.7, 2, 2.5];
// The "too close" threshold and the width of the marginal band above it, in weighted deltaE.
const THRESHOLDS = Array.from({ length: 38 }, (_, i) => i + 3);
const BANDS = [0, 1, 2, 3, 4, 6, 8, 12];
// Spread of a boundary from palette to palette, in weighted deltaE.
const SOFTNESS = [1, 1.5, 2, 3, 4, 6, 8];
const LAPSES = [0.005, 0.02, 0.05];
// The swap chance the generator allows one pair (ERROR_LIMIT in the page). The Distinctness default
// puts a lone pair's swap chance at it FINE_MARGIN softness units past the fine threshold: at the
// threshold itself a pair is still judged marginal half the time.
const SWAP_LIMIT = 0.02;
const FINE_MARGIN = 2;
// The page's Distinctness slider moves in these steps.
const SIGMA_STEP = 0.5;
const GRADES = ["close", "marginal", "fine"];

function erfc(x) {
	const t = 1 / (1 + 0.3275911 * Math.abs(x));
	const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
	const tail = poly * Math.exp(-x * x);
	return x >= 0 ? tail : 2 - tail;
}
const normalCdf = x => 0.5 * erfc(-x / Math.SQRT2);

const logs = process.argv.slice(2).map(file => JSON.parse(fs.readFileSync(file, "utf8")));
const sessions = logs.filter(log => log.version === 2).flatMap(log => log.sessions);
if (!sessions.length) {
	console.error("no version 2 calibrate.html log with palettes: node data/fit.js log.json");
	process.exit(1);
}

const pairKey = (a, b) => Math.min(a, b) + "," + Math.max(a, b);

// Every pair of every palette: squared lightness, radial chroma and hue (chord less radial) differences,
// as confusionMatrix in identify.js measures them; the verdict; the probe condition if any.
const pairs = [];
for (const session of sessions) {
	const labs = session.hexes.map(labOf);
	const chroma = labs.map(lab => Math.hypot(lab[1], lab[2]));
	const grade = new Map(session.verdicts.map(v => [pairKey(v.a, v.b), GRADES.indexOf(v.grade)]));
	const probe = new Map((session.probes || []).map(p => [pairKey(p.a, p.b), p]));
	for (let i = 0; i < labs.length; ++i)
		for (let j = i + 1; j < labs.length; ++j) {
			const dL = labs[i][0] - labs[j][0], dC = chroma[i] - chroma[j];
			const chord2 = (labs[i][1] - labs[j][1]) ** 2 + (labs[i][2] - labs[j][2]) ** 2;
			const p = probe.get(pairKey(i, j));
			pairs.push({ dL2: dL * dL, dC2: dC * dC, dH2: Math.max(0, chord2 - dC * dC), grade: grade.get(pairKey(i, j)) ?? 2,
				condition: p ? (p.region || p.axis) + " " + p.distance : null, region: p?.region || null });
		}
}
const graded = GRADES.map((_, g) => pairs.filter(p => p.grade === g).length);
const sizes = [...new Set(sessions.map(s => s.swatchPx))];
console.log(sessions.length + " palettes, " + pairs.length + " pairs: " + graded[0] + " too close, " + graded[1] + " marginal, "
	+ graded[2] + " fine; swatch " + sizes.join("/") + " px");
if (sizes.length > 1)
	console.log("warning: mixed swatch sizes fit one set of thresholds");

const weightedDistances = (wL, wC) => pairs.map(p => Math.sqrt(wL * wL * p.dL2 + wC * wC * p.dC2 + p.dH2));

// Chance of each grade for a pair at weighted distance d.
function gradeChances(d, t1, t2, s) {
	const close = normalCdf((t1 - d) / s), fine = normalCdf((d - t2) / s);
	return [close, Math.max(0, 1 - close - fine), fine];
}

const t0 = Date.now();
const fits = [];
for (const wL of WEIGHTS)
	for (const wC of WEIGHTS) {
		const d = weightedDistances(wL, wC);
		for (const t1 of THRESHOLDS)
			for (const band of BANDS)
				for (const s of SOFTNESS) {
					const ll = LAPSES.map(() => 0);
					for (let k = 0; k < pairs.length; ++k) {
						const chance = gradeChances(d[k], t1, t1 + band, s)[pairs[k].grade];
						for (let l = 0; l < LAPSES.length; ++l)
							ll[l] += Math.log((1 - LAPSES[l]) * chance + LAPSES[l] / GRADES.length);
					}
					ll.forEach((v, l) => fits.push({ wL, wC, t1, band, s, lapse: LAPSES[l], ll: v }));
				}
	}
fits.sort((a, b) => b.ll - a.ll);
const best = fits[0];
console.log("grid of " + fits.length + " settings in " + ((Date.now() - t0) / 1000).toFixed(1) + " s");

// Log-likelihood against the best fit, the other parameters at their best for each value:
// a value within about 2 is not distinguishable from the best.
function profile(name, values, pick) {
	console.log("\n" + name + " profile: value, log-likelihood below the best, the rest of the fit");
	for (const value of values) {
		const top = fits.find(f => pick(f) === value);
		console.log("  " + String(value).padStart(5) + "  " + (top.ll - best.ll).toFixed(1).padStart(7)
			+ "   wL " + top.wL + " wC " + top.wC + " close below " + top.t1 + " fine above " + (top.t1 + top.band)
			+ " softness " + top.s + " lapse " + top.lapse);
	}
}
profile("wL", WEIGHTS, f => f.wL);
profile("wC", WEIGHTS, f => f.wC);
profile("too close threshold", THRESHOLDS, f => f.t1);
profile("marginal band", BANDS, f => f.band);
profile("softness", SOFTNESS, f => f.s);
profile("lapse", LAPSES, f => f.lapse);

for (const [name, values, value] of [["wL", WEIGHTS, best.wL], ["wC", WEIGHTS, best.wC], ["threshold", THRESHOLDS, best.t1],
		["band", BANDS, best.band], ["softness", SOFTNESS, best.s]])
	if (value === values[0] || value === values[values.length - 1])
		console.log("\nwarning: " + name + " at the edge of its grid");

// Probe pairs: verdicts observed against the fit's expectation, pooled by axis and distance.
const pooled = new Map();
const bestDistances = weightedDistances(best.wL, best.wC);
pairs.forEach((pair, k) => {
	if (!pair.condition)
		return;
	const entry = pooled.get(pair.condition) || { shown: 0, observed: [0, 0, 0], predicted: [0, 0, 0] };
	++entry.shown;
	++entry.observed[pair.grade];
	gradeChances(bestDistances[k], best.t1, best.t1 + best.band, best.s)
		.forEach((chance, g) => entry.predicted[g] += (1 - best.lapse) * chance + best.lapse / GRADES.length);
	pooled.set(pair.condition, entry);
});
const conditionParts = key => [key.slice(0, key.lastIndexOf(" ")), parseFloat(key.slice(key.lastIndexOf(" ") + 1))];
if (pooled.size) {
	console.log("\nprobe pairs: verdicts observed / predicted");
	const byNameThenDistance = (a, b) => {
		const [nameA, dA] = conditionParts(a), [nameB, dB] = conditionParts(b);
		return nameA === nameB ? dA - dB : nameA < nameB ? -1 : 1;
	};
	for (const key of [...pooled.keys()].sort(byNameThenDistance)) {
		const e = pooled.get(key);
		console.log("  " + key.padEnd(10) + GRADES.map((grade, g) => "  " + grade + " " + String(e.observed[g]).padStart(2) + " / "
			+ e.predicted[g].toFixed(1).padStart(4)).join("") + "  of " + e.shown);
	}
}

// Region probes: the factor on their distances that fits their verdicts best, the rest of the fit held.
// Below 1 the metric overstates distances there (colors are less distinct than it says), above 1 understates.
const FACTORS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8];
const regions = [...new Set(pairs.map(p => p.region).filter(Boolean))];
if (regions.length) {
	console.log("\nregion factors: best, the range within 2 log-likelihood units, probe pairs");
	for (const region of regions) {
		const lls = FACTORS.map(factor => {
			let ll = 0;
			pairs.forEach((pair, k) => {
				const d = bestDistances[k] * (pair.region === region ? factor : 1);
				const chance = gradeChances(d, best.t1, best.t1 + best.band, best.s)[pair.grade];
				ll += Math.log((1 - best.lapse) * chance + best.lapse / GRADES.length);
			});
			return ll;
		});
		const top = Math.max(...lls);
		const within = FACTORS.filter((_, k) => lls[k] >= top - 2);
		console.log("  " + region.padEnd(10) + String(FACTORS[lls.indexOf(top)]).padStart(5) + "   " + within[0] + " to " + within[within.length - 1]
			+ "   " + pairs.filter(p => p.region === region).length + " pairs");
	}
}

// The z with normalCdf(-z) = SWAP_LIMIT: a pair at weighted distance d swaps with chance normalCdf(-d / 2 sigma).
let zLow = 0, zHigh = 10;
for (let n = 0; n < 50; ++n) {
	const mid = (zLow + zHigh) / 2;
	if (normalCdf(-mid) > SWAP_LIMIT)
		zLow = mid;
	else
		zHigh = mid;
}
const reliablyFine = best.t1 + best.band + FINE_MARGIN * best.s;
const sigma = Math.round(reliablyFine / (2 * zLow) / SIGMA_STEP) * SIGMA_STEP;

console.log("\npaste into data/identify.js, and W_L / W_C / the Distinctness default into the page:");
console.log("const SIGMA = " + sigma + ";  // a lone pair swaps " + SWAP_LIMIT * 100 + "% at " + reliablyFine.toFixed(1) + " weighted deltaE");
console.log("const W_L = " + best.wL + ";");
console.log("const W_C = " + best.wC + ";");
console.log("const CALIBRATED_PX = " + sizes[0] + ";");
console.log("// too close below " + best.t1 + ", fine above " + (best.t1 + best.band) + " weighted deltaE, softness " + best.s
	+ ", lapse " + best.lapse + ", " + pairs.length + " pairs, log-likelihood " + best.ll.toFixed(1));
