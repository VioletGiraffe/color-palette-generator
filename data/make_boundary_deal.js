#!/usr/bin/env node
// Deals the pairs calibrate-boundaries.html shows: two colors at one lightness and one chroma, a set hue turn apart,
// placed around each sRGB primary and secondary hue at offsets of the turn, so a pair straddles the hue, touches it,
// or sits to one side. Writes the deal into the page itself, between its deal markers: a page opened from disk can
// fetch nothing.
//
//     node data/make_boundary_deal.js [--boundaries red,yellow,green,cyan,blue,magenta] [--turns 10,15,20,30,45,60] [--offsets -1,-0.5,0,0.5,1] [--light 50] [--chroma 85] [--placement shared] [page.html]
//     node data/make_boundary_deal.js --sweep 10 [--turns 20,30,45,60,45] [--light 50] [--chroma 85] [--placement shared] [--ranges 230-340,120-190] [page.html]
//     node data/make_boundary_deal.js --axis lightness [--hues 30] [--centres 35,50,65] [--turns 10,20,30,45,60] [--chroma 85] [page.html]
//     node data/make_boundary_deal.js --axis chroma [--hues 30] [--centres 30,50,70] [--turns 10,20,30,40,50] [--light 50] [page.html]
//     node data/make_boundary_deal.js --axis mixed [--ranges 0-360] [--windows 20-80] [--share 30-100] [--kinds mixed] [--by metric] [--distances 2-18] [--bands 6] [--each 30] [--seed 1] [page.html]
//
// A mixed deal validates the metric on pairs no round dealt. A cell is a hue range of --ranges, a window of
// cusp-relative lightness of --windows, a kind and a distance band; every cell holds --each pairs, one number per hue range.
// Both colors of a pair are drawn evenly in hue, relative lightness and chroma, --share, a percentage of the reach
// at the color's lightness, inside the cell.
//   mixed - each color at its own draw: the pair differs in hue, lightness and chroma at once.
//   hue - the second color takes the first's relative lightness and share, the pair placed as `shared` below.
//   chroma - the second color takes the first's hue and relative lightness: the pair differs in chroma alone.
// --distances holds one range per kind, split evenly into --bands, so the grades cover both cuts; a cell's top is
// lowered to what its pairs reach (MIXED_REACH). --by is the distance between the two shown hexes the bands are in:
// `metric`, or `oklab`, plain deltaE, which keeps the metric out of the deal.
//
// A lightness deal is the other kind of pair: one hue, the two colors a turn apart in cusp-relative lightness
// around a centre, each at the chroma share of the reach at its own lightness; hues every --hues degrees. It tells
// absolute from cusp-relative lightness: above yellow's cusp a relative turn is a sliver of absolute lightness.
// A chroma deal: one hue at the relative lightness --light, the two colors a turn apart in chroma share of the
// reach around a centre share. It measures the chroma weight.
//
// The pair's centre hue is the boundary plus offset times turn; its colors sit half a turn either side. Offset 0
// straddles the boundary symmetrically, 0.5 touches it, 1 clears it. A sweep deals every turn at centres every
// --sweep degrees around the whole circle instead, or over the hue ranges of --ranges; a turn listed n times is
// dealt n times, its centres shifted by a 1/n step each time. --light is a lightness relative to the cusp, --chroma
// a share of the gamut's reach; the placement says whose, and several placements deal every pair under each, the
// pair tagged with its own:
//   shared - one lightness, the mean of the two hues', and one chroma, the share of the smaller reach there: the pair
//            differs in hue alone. Yellow's and cyan's reach collapses away from their high cusps, so their pairs are pale.
//   own-chroma - the shared lightness, each color at the share of the reach of its hue there.
//   own - each color at its own hue's lightness and reach, as palette colors sit; the pair differs in lightness too.
//   own-reversed - each color at the other's lightness, the same gap the other way, each at the reach there.
//   low, high - both at the lower or the higher of the two hues' lightness, each at the reach there.

"use strict";
const path = require("path");
const { loadPage, gamutChroma, labOf, recallDistance, writeDeal } = require("./identify.js");

// Draws of the second color before the first is redrawn; a hue or a chroma pair's second varies on one axis
const MIXED_TRIES = { mixed: 200000, hue: 1000, chroma: 1000 };
// Second colors drawn per band before the deal fails: a band no pair of the cell reaches
const MIXED_BAND_DRAWS = 5e6;
// A cell's top distance is at most the one this share of MIXED_SURVEY random pairs of the cell stay under: a dark or a pale cell reaches less
const MIXED_SURVEY = 4000, MIXED_REACH = 0.99;
const hexOf = rgb => "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");

function main(args) {
	let turns = [10, 15, 20, 30, 45, 60], offsets = [-1, -0.5, 0, 0.5, 1], light = 50, chroma = 85, sweep = 0, placements = ["shared"], pagePath = path.join(__dirname, "..", "index.html");
	let names = ["red", "yellow", "green", "cyan", "blue", "magenta"], ranges = [[0, 360]];
	let axis = "hue", hueStep = 30, centres = [35, 50, 65];
	let windows = [[20, 80]], share = [30, 100], kinds = ["mixed"], by = "metric", distances = [[2, 18]], bands = 6, each = [30], seed = 1;
	const rangesOf = text => text.split(",").map(range => range.split("-").map(Number));
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--boundaries")
			names = args[++i].split(",");
		else if (args[i] === "--sweep")
			sweep = +args[++i];
		else if (args[i] === "--windows")
			windows = rangesOf(args[++i]);
		else if (args[i] === "--share")
			[share] = rangesOf(args[++i]);
		else if (args[i] === "--kinds") {
			kinds = args[++i].split(",");
			for (const kind of kinds)
				if (!(kind in MIXED_TRIES))
					throw new Error("unknown kind " + kind);
		} else if (args[i] === "--by") {
			by = args[++i];
			if (!["metric", "oklab"].includes(by))
				throw new Error("unknown distance " + by);
		} else if (args[i] === "--distances")
			distances = rangesOf(args[++i]);
		else if (args[i] === "--bands")
			bands = +args[++i];
		else if (args[i] === "--each")
			each = args[++i].split(",").map(Number);
		else if (args[i] === "--seed")
			seed = +args[++i];
		else if (args[i] === "--axis") {
			axis = args[++i];
			if (!["hue", "lightness", "chroma", "mixed"].includes(axis))
				throw new Error("unknown axis " + axis);
			if (axis === "lightness")
				turns = [10, 20, 30, 45, 60];
			else if (axis === "chroma") {
				turns = [10, 20, 30, 40, 50];
				centres = [30, 50, 70];
			}
		} else if (args[i] === "--hues")
			hueStep = +args[++i];
		else if (args[i] === "--centres")
			centres = args[++i].split(",").map(Number);
		else if (args[i] === "--placement") {
			placements = args[++i].split(",");
			for (const placement of placements)
				if (!["shared", "own-chroma", "own", "own-reversed", "low", "high"].includes(placement))
					throw new Error("unknown placement " + placement);
		} else if (args[i] === "--ranges")
			ranges = rangesOf(args[++i]);
		else if (args[i] === "--turns")
			turns = args[++i].split(",").map(Number);
		else if (args[i] === "--offsets")
			offsets = args[++i].split(",").map(Number);
		else if (args[i] === "--light")
			light = +args[++i];
		else if (args[i] === "--chroma")
			chroma = +args[++i];
		else if (args[i].endsWith(".html"))
			pagePath = args[i];
		else
			throw new Error("unknown option " + args[i]);
	}
	const page = loadPage(pagePath);
	const hueOf = hex => page.colorFromHex(hex).lch[2];
	const all = { red: hueOf("#ff0000"), yellow: hueOf("#ffff00"), green: hueOf("#00ff00"), cyan: hueOf("#00ffff"), blue: hueOf("#0000ff"), magenta: hueOf("#ff00ff") };
	const boundaries = Object.fromEntries(names.map(name => { if (!(name in all)) throw new Error("unknown boundary " + name); return [name, all[name]]; }));
	const colorAt = (L, C, h) => hexOf(page.oklabToRgb(...page.labOfLch(L, C, h)));
	const dealPair = (turn, centre, around, placement) => {
		const hues = [(centre - turn / 2 + 360) % 360, (centre + turn / 2) % 360].map(h => +h.toFixed(2));
		const own = hues.map(h => page.absoluteL(light, h));
		const L = { own, "own-reversed": [own[1], own[0]], low: Array(2).fill(Math.min(...own)), high: Array(2).fill(Math.max(...own)) }[placement] ?? Array(2).fill((own[0] + own[1]) / 2);
		const reach = hues.map((h, i) => gamutChroma(L[i], h));
		const C = placement === "shared" ? Array(2).fill(chroma / 100 * Math.min(...reach)) : reach.map(r => chroma / 100 * r);
		return { ...around, placement, turn, centre: +centre.toFixed(2), hues, L: L.map(x => +x.toFixed(1)), C: C.map(x => +x.toFixed(1)), hexes: hues.map((h, i) => colorAt(L[i], C[i], h)) };
	};
	// A lightness pair: the same hue, relative lightness centre plus and minus half the turn
	const dealLightnessPair = (turn, centre, hue) => {
		const L = [centre - turn / 2, centre + turn / 2].map(relative => page.absoluteL(relative, hue));
		const C = L.map(l => chroma / 100 * gamutChroma(l, hue));
		return { hue, turn, centre, hues: [hue, hue], L: L.map(x => +x.toFixed(1)), C: C.map(x => +x.toFixed(1)), hexes: L.map((l, i) => colorAt(l, C[i], hue)) };
	};
	// A chroma pair: the same hue and lightness, chroma share centre plus and minus half the turn
	const dealChromaPair = (turn, centre, hue) => {
		const L = page.absoluteL(light, hue), reach = gamutChroma(L, hue);
		const C = [centre - turn / 2, centre + turn / 2].map(share => share / 100 * reach);
		return { hue, turn, centre, hues: [hue, hue], L: [L, L].map(x => +x.toFixed(1)), C: C.map(x => +x.toFixed(1)), hexes: C.map(c => colorAt(L, c, hue)) };
	};
	const dealMixedPairs = () => {
		if (distances.length !== kinds.length || each.length !== ranges.length)
			throw new Error("--distances takes one range per kind, --each one number per hue range");
		// The survey draws from its own stream: the deal's draws do not depend on it
		const rnd = page.mulberry32(seed), surveyRnd = page.mulberry32(seed + MIXED_SURVEY);
		const measure = by === "oklab" ? (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) : (p, q) => recallDistance(p, q);
		const distanceOf = pair => measure(labOf(pair[0].hex), labOf(pair[1].hex));
		const colored = (L, C, h) => ({ L, C, h, hex: colorAt(L, C, h) });
		const placedOwn = spot => { const L = page.absoluteL(spot.light, spot.h); return colored(L, spot.share / 100 * gamutChroma(L, spot.h), spot.h); };
		const placedShared = (spot, hues) => {
			const L = (page.absoluteL(spot.light, hues[0]) + page.absoluteL(spot.light, hues[1])) / 2, C = spot.share / 100 * Math.min(...hues.map(h => gamutChroma(L, h)));
			return hues.map(h => colored(L, C, h));
		};
		const dealt = [];
		ranges.forEach((range, r) => windows.forEach(window => kinds.forEach((kind, k) => {
			const drawsFrom = random => { const within = ([lo, hi]) => lo + random() * (hi - lo), hue = () => within(range) % 360, chroma = () => within(share); return { hue, chroma, spot: () => ({ h: hue(), light: within(window), share: chroma() }) }; };
			const pairFrom = (first, firstOwn, draw) => kind === "hue" ? placedShared(first, [first.h, draw.hue()]) : [firstOwn, placedOwn(kind === "chroma" ? { ...first, share: draw.chroma() } : draw.spot())];
			const draw = drawsFrom(rnd), probe = drawsFrom(surveyRnd);
			const reached = Array.from({ length: MIXED_SURVEY }, () => { const first = probe.spot(); return distanceOf(pairFrom(first, placedOwn(first), probe)); }).sort((a, b) => a - b)[Math.floor(MIXED_REACH * MIXED_SURVEY)];
			const low = distances[k][0], high = Math.min(distances[k][1], reached), width = (high - low) / bands;
			for (let band = 0; band < bands; ++band)
				for (let n = 0, drawn = 0; n < each[r];) {
					if (drawn >= MIXED_BAND_DRAWS)
						throw new Error("no " + kind + " pair in band " + band + " of hues " + range.join(" to ") + ", lightness " + window.join(" to "));
					const first = draw.spot(), firstOwn = placedOwn(first);
					for (let tries = 0; tries < MIXED_TRIES[kind]; ++tries, ++drawn) {
						const pair = pairFrom(first, firstOwn, draw), distance = distanceOf(pair);
						if (Math.floor((distance - low) / width) !== band)
							continue;
						dealt.push({ kind, window, band, top: +high.toFixed(1), distance: +distance.toFixed(2), hues: pair.map(c => +c.h.toFixed(2)), L: pair.map(c => +c.L.toFixed(1)), C: pair.map(c => +c.C.toFixed(1)), hexes: pair.map(c => c.hex) });
						++n;
						break;
					}
				}
		})));
		return dealt;
	};
	const pairs = [];
	if (axis === "mixed")
		pairs.push(...dealMixedPairs());
	else if (axis !== "hue") {
		const dealPairOn = axis === "lightness" ? dealLightnessPair : dealChromaPair;
		for (let hue = 0; hue < 360; hue += hueStep)
			for (const centre of centres)
				for (const turn of turns)
					pairs.push(dealPairOn(turn, centre, hue));
	} else if (sweep) {
		const dealt = new Map();
		for (const turn of turns) {
			const repeat = dealt.get(turn) ?? 0, shift = sweep * repeat / turns.filter(t => t === turn).length;
			dealt.set(turn, repeat + 1);
			for (const [from, to] of ranges)
				for (let centre = from + shift; centre < to; centre += sweep)
					for (const placement of placements)
						pairs.push(dealPair(turn, centre % 360, {}, placement));
		}
	} else
		for (const [boundary, hue] of Object.entries(boundaries))
			for (const turn of turns)
				for (const offset of offsets)
					for (const placement of placements)
						pairs.push(dealPair(turn, (hue + offset * turn + 360) % 360, { boundary, offset }, placement));
	// Deal version: 2 places by the placement above, 1 put each color at the centre hue's cusp lightness and its own reach
	const where = axis === "mixed" ? { axis, ranges, windows, share, kinds, by, distances, bands, each, seed }
		: { light, chroma, placement: placements.join(","), turns,
			...(axis !== "hue" ? { axis, hueStep, centres } : sweep ? { sweep, ranges } : { offsets, boundaries: Object.fromEntries(Object.entries(boundaries).map(([k, v]) => [k, +v.toFixed(1)])) }) };
	const data = { version: 2, page: path.basename(pagePath), ...where, pairs };
	writeDeal("calibrate-boundaries.html", "BOUNDARY_PAIRS", data);
	const dealt = axis === "mixed"
		? "mixed, hues " + ranges.map(r => r.join(" to ")).join(", ") + " with " + each.join(", ") + " pairs a cell, lightness " + windows.map(w => w.join(" to ")).join(", ") + " of the cusp, chroma " + share.join(" to ")
			+ "% of the reach, " + kinds.map((kind, k) => kind + " pairs in " + bands + " bands of " + distances[k].join(" to ")).join(", ") + (by === "oklab" ? " OKLab deltaE" : " on the metric") + ", seed " + seed
		: "turns " + turns.join(", ") + (axis === "lightness" ? " in relative lightness at centres " + centres.join(", ") + ", hues every " + hueStep + " degrees; chroma " + chroma + "% of the reach"
		: axis === "chroma" ? " in chroma share at centres " + centres.join(", ") + ", hues every " + hueStep + " degrees; lightness " + light
		: (sweep ? " at centres every " + sweep + " degrees over " + ranges.map(r => r.join(" to ")).join(", ") : " at offsets " + offsets.join(", ") + " around " + Object.entries(data.boundaries).map(([k, v]) => k + " " + v).join(", "))
			+ "; lightness " + light + ", chroma " + chroma + "% of the reach, placement " + placements.join(", "));
	console.log(pairs.length + " pairs: " + dealt + "; written into data/calibrate-boundaries.html");
}

main(process.argv.slice(2));
