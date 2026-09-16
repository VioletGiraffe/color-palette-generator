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
const fs = require("fs");
const path = require("path");
const { loadPage, cuspLightness, gamutChroma } = require("./identify.js");

const CUSP_ANCHOR = 50;
const absoluteL = (relative, h) => { const cusp = cuspLightness(h); return relative <= CUSP_ANCHOR ? cusp * relative / CUSP_ANCHOR : cusp + (100 - cusp) * (relative - CUSP_ANCHOR) / (100 - CUSP_ANCHOR); };
const hexOf = rgb => "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");

function main(args) {
	let turns = [10, 15, 20, 30, 45, 60], offsets = [-1, -0.5, 0, 0.5, 1], light = 50, chroma = 85, sweep = 0, placements = ["shared"], pagePath = path.join(__dirname, "..", "index.html");
	let names = ["red", "yellow", "green", "cyan", "blue", "magenta"], ranges = [[0, 360]];
	let axis = "hue", hueStep = 30, centres = [35, 50, 65];
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--boundaries")
			names = args[++i].split(",");
		else if (args[i] === "--sweep")
			sweep = +args[++i];
		else if (args[i] === "--axis") {
			axis = args[++i];
			if (!["hue", "lightness", "chroma"].includes(axis))
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
			ranges = args[++i].split(",").map(range => range.split("-").map(Number));
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
		const own = hues.map(h => absoluteL(light, h));
		const L = { own, "own-reversed": [own[1], own[0]], low: Array(2).fill(Math.min(...own)), high: Array(2).fill(Math.max(...own)) }[placement] ?? Array(2).fill((own[0] + own[1]) / 2);
		const reach = hues.map((h, i) => gamutChroma(L[i], h));
		const C = placement === "shared" ? Array(2).fill(chroma / 100 * Math.min(...reach)) : reach.map(r => chroma / 100 * r);
		return { ...around, placement, turn, centre: +centre.toFixed(2), hues, L: L.map(x => +x.toFixed(1)), C: C.map(x => +x.toFixed(1)), hexes: hues.map((h, i) => colorAt(L[i], C[i], h)) };
	};
	// A lightness pair: the same hue, relative lightness centre plus and minus half the turn
	const dealLightnessPair = (turn, centre, hue) => {
		const L = [centre - turn / 2, centre + turn / 2].map(relative => absoluteL(relative, hue));
		const C = L.map(l => chroma / 100 * gamutChroma(l, hue));
		return { hue, turn, centre, hues: [hue, hue], L: L.map(x => +x.toFixed(1)), C: C.map(x => +x.toFixed(1)), hexes: L.map((l, i) => colorAt(l, C[i], hue)) };
	};
	// A chroma pair: the same hue and lightness, chroma share centre plus and minus half the turn
	const dealChromaPair = (turn, centre, hue) => {
		const L = absoluteL(light, hue), reach = gamutChroma(L, hue);
		const C = [centre - turn / 2, centre + turn / 2].map(share => share / 100 * reach);
		return { hue, turn, centre, hues: [hue, hue], L: [L, L].map(x => +x.toFixed(1)), C: C.map(x => +x.toFixed(1)), hexes: C.map(c => colorAt(L, c, hue)) };
	};
	const pairs = [];
	if (axis !== "hue") {
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
	const where = axis !== "hue" ? { axis, hueStep, centres } : sweep ? { sweep, ranges } : { offsets, boundaries: Object.fromEntries(Object.entries(boundaries).map(([k, v]) => [k, +v.toFixed(1)])) };
	const data = { version: 2, page: path.basename(pagePath), light, chroma, placement: placements.join(","), turns, ...where, pairs };
	const out = path.join(__dirname, "calibrate-boundaries.html"), OPEN = "// ---------- deal ----------\n", CLOSE = "// ---------- end deal ----------";
	const source = fs.readFileSync(out, "utf8"), from = source.indexOf(OPEN), to = source.indexOf(CLOSE);
	if (from < 0 || to < from)
		throw new Error(path.basename(out) + " lacks the deal markers");
	fs.writeFileSync(out, source.slice(0, from + OPEN.length) + "const BOUNDARY_PAIRS = " + JSON.stringify(data) + ";\n" + source.slice(to));
	const dealt = axis === "lightness" ? " in relative lightness at centres " + centres.join(", ") + ", hues every " + hueStep + " degrees; chroma " + chroma + "% of the reach"
		: axis === "chroma" ? " in chroma share at centres " + centres.join(", ") + ", hues every " + hueStep + " degrees; lightness " + light
		: (sweep ? " at centres every " + sweep + " degrees over " + ranges.map(r => r.join(" to ")).join(", ") : " at offsets " + offsets.join(", ") + " around " + Object.entries(data.boundaries).map(([k, v]) => k + " " + v).join(", "))
			+ "; lightness " + light + ", chroma " + chroma + "% of the reach, placement " + placements.join(", ");
	console.log(pairs.length + " pairs: turns " + turns.join(", ") + dealt + "; written into " + path.relative(process.cwd(), out));
}

main(process.argv.slice(2));
