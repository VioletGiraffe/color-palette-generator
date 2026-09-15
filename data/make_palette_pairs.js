#!/usr/bin/env node
// Deals the palettes calibrate-palettes.html shows: the same seed and count generated under each hue
// condition, paired condition against condition, so a verdict is about the spread and not the draw.
// Writes the deal into the page itself, between its deal markers: a page opened from disk can fetch nothing.
//
//     node data/make_palette_pairs.js [--seeds 20] [--counts 7,10] [--box lMin lMax cMin cMax] [--conditions hue|preference] [page.html]
//
// The hue conditions, each a hue density in the generator's two roles, the metric's warp and the draw's acceptance:
//     shipped   HUE_DENSITY in both, the page as it is
//     angle     A in both, the step rounds' angle density: equal perceived steps take equal warped angle
//     uniform   HUE_DENSITY in the metric, a uniform draw
// The preference conditions, the draw's preference density on and off:
//     shipped   the page as it is, the draw weighted by PREFERENCE
//     plain     the draw without it
// Every palette is sorted by hue from 0, as the page shows it with sorting on.

"use strict";
const fs = require("fs");
const path = require("path");
const { loadPage, HUE_DENSITY } = require("./identify.js");
const { densityTables } = require("./fit_hue_steps.js");

const HUE_LOGS = ["hue-1-steps-log.json", "hue-2-steps-log.json", "hue-3-c70-steps-log.json", "hue-4-c80-steps-log.json", "hue-5-c80-steps-log.json"]
	.map(name => path.join(__dirname, name));
const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;

function main(args) {
	let seeds = 20, counts = [7, 10], box = { lMin: 40, lMax: 60, cMin: 60, cMax: 100 }, set = "hue", pagePath = path.join(__dirname, "..", "index.html");
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--seeds")
			seeds = +args[++i];
		else if (args[i] === "--counts")
			counts = args[++i].split(",").map(Number);
		else if (args[i] === "--box")
			box = { lMin: +args[++i], lMax: +args[++i], cMin: +args[++i], cMax: +args[++i] };
		else if (args[i] === "--conditions")
			set = args[++i];
		else if (args[i].endsWith(".html"))
			pagePath = args[i];
		else
			throw new Error("unknown option " + args[i]);
	}
	// A condition is a page and the generator settings it is dealt with; the hue set replaces the densities in the page.
	const page = loadPage(pagePath), A = () => densityTables(HUE_LOGS).A.map(v => +v.toFixed(4));
	const conditions = set === "hue" ? {
		shipped: { page, settings: {}, about: "HUE_DENSITY in the metric and the draw, the page as it is" },
		angle: { page: loadPage(pagePath, { metric: A(), draw: A() }), settings: {}, about: "the step rounds' angle density A in the metric and the draw" },
		uniform: { page: loadPage(pagePath, { draw: new Array(360).fill(1) }), settings: {}, about: "HUE_DENSITY in the metric, a uniform draw" },
	} : set === "preference" ? {
		shipped: { page, settings: {}, about: "the page as it is, the draw weighted by PREFERENCE" },
		plain: { page, settings: { preference: false }, about: "the draw without the preference density" },
	} : (() => { throw new Error("unknown condition set " + set); })();
	const names = Object.keys(conditions), CELL_NAMES = page.CELL_NAMES;
	const palettes = [], pairs = [];
	for (const count of counts)
		for (let seed = 1; seed <= seeds; ++seed) {
			const dealt = names.map(condition => {
				const colors = conditions[condition].page.generate({ count, scale: 3, hMin: 0, hMax: 360, ...box, seed, fixed: [], ...conditions[condition].settings }).colors
					.slice().sort((p, q) => hueOf(p.lab) - hueOf(q.lab));
				palettes.push({ condition, seed, count, hexes: colors.map(c => c.hex), names: colors.map(c => CELL_NAMES[c.cell] ?? "unnamed") });
				return palettes.length - 1;
			});
			for (let i = 0; i < dealt.length; ++i)
				for (let j = i + 1; j < dealt.length; ++j)
					pairs.push([dealt[i], dealt[j]]);
		}
	const about = Object.fromEntries(names.map(n => [n, conditions[n].about]));
	const data = { version: 1, page: path.basename(pagePath), box, seeds, counts, conditions: about, palettes, pairs };
	const out = path.join(__dirname, "calibrate-palettes.html"), OPEN = "// ---------- deal ----------\n", CLOSE = "// ---------- end deal ----------";
	const source = fs.readFileSync(out, "utf8"), from = source.indexOf(OPEN), to = source.indexOf(CLOSE);
	if (from < 0 || to < from)
		throw new Error(path.basename(out) + " lacks the deal markers");
	fs.writeFileSync(out, source.slice(0, from + OPEN.length) + "const PALETTE_PAIRS = " + JSON.stringify(data) + ";\n" + source.slice(to));
	console.log(palettes.length + " palettes, " + pairs.length + " pairs, " + names.length + " conditions at " + counts.join(", ") + " colors over " + seeds
		+ " seeds; box L " + box.lMin + "-" + box.lMax + ", C " + box.cMin + "-" + box.cMax + "%; written into " + path.relative(process.cwd(), out));
}

main(process.argv.slice(2));
