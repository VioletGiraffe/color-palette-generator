#!/usr/bin/env node
// What the generator delivers over hue: the share of generated colors per 30-degree bin of OKLab hue and,
// with --names, per color name, over many seeds in one range box. The hue density enters the generator in
// two roles, the metric's warp and the starting draw's acceptance, and each condition sets the two apart:
//
//     node data/hue-marginals.js [--seeds 200] [--counts 7,10] [--box lMin lMax cMin cMax] [--names] [page.html] [metric/draw ...]
//
// metric and draw are each one of shipped (HUE_DENSITY), authored (HUE_DENSITY_AUTHORED) or uniform; the
// default condition is shipped/shipped, the page's own. The hue bins are in multiples of the uniform share
// and judged against the shipped and the authored share by the coefficient of variation of their ratio
// over the bins; the name table adds the box's own marginal, the share each name gets from uniform draws
// over the box, as the room the name has.

"use strict";
const path = require("path");
const { loadPage, HUE_DENSITY, HUE_DENSITY_AUTHORED } = require("./identify.js");

const DENSITIES = { shipped: HUE_DENSITY, authored: HUE_DENSITY_AUTHORED, uniform: new Array(360).fill(1) };
const mean = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
const shareOf = density => Array.from({ length: 12 }, (_, b) => mean(density.slice(b * 30, b * 30 + 30)));
const cv = xs => Math.sqrt(mean(xs.map(x => (x - mean(xs)) ** 2))) / mean(xs);
const fmt = (x, w = 6, d = 2) => x.toFixed(d).padStart(w);

function main(args) {
	let seeds = 200, counts = [7, 10], box = { lMin: 20, lMax: 60, cMin: 20, cMax: 100 }, names = false, pagePath = null;
	const conditions = [];
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--seeds")
			seeds = +args[++i];
		else if (args[i] === "--counts")
			counts = args[++i].split(",").map(Number);
		else if (args[i] === "--box")
			box = { lMin: +args[++i], lMax: +args[++i], cMin: +args[++i], cMax: +args[++i] };
		else if (args[i] === "--names")
			names = true;
		else if (args[i].endsWith(".html"))
			pagePath = args[i];
		else {
			const [metric, draw] = args[i].split("/");
			if (!DENSITIES[metric] || !DENSITIES[draw])
				throw new Error("condition " + args[i] + ": each side is shipped, authored or uniform");
			conditions.push({ label: args[i], metric, draw });
		}
	}
	if (!conditions.length)
		conditions.push({ label: "shipped/shipped", metric: "shipped", draw: "shipped" });
	pagePath = pagePath || path.join(__dirname, "..", "index.html");

	console.log(path.basename(pagePath) + ", box L " + box.lMin + "-" + box.lMax + ", C " + box.cMin + "-" + box.cMax + "%, " + seeds + " seeds at " + counts.join(", ") + " colors");
	console.log("share per 30-degree bin, multiples of uniform");
	console.log("metric/draw".padEnd(20) + Array.from({ length: 12 }, (_, b) => String(b * 30).padStart(6)).join("") + "   CV vs shipped  CV vs authored");
	for (const [name, density] of [["shipped share", HUE_DENSITY], ["authored share", HUE_DENSITY_AUTHORED]])
		console.log(name.padEnd(20) + shareOf(density).map(v => fmt(v)).join(""));

	const nameCounts = new Map(), tally = (map, name) => map.set(name, (map.get(name) || 0) + 1);
	let page = null;
	for (const condition of conditions) {
		page = loadPage(pagePath, { metric: DENSITIES[condition.metric], draw: DENSITIES[condition.draw] });
		const bins = new Array(12).fill(0), perName = new Map();
		let total = 0;
		for (const count of counts)
			for (let seed = 1; seed <= seeds; ++seed)
				for (const color of page.generate({ count, hMin: 0, hMax: 360, ...box, seed, fixed: [] }).colors) {
					++bins[Math.floor(hueOf(color.lab) / 30)];
					++total;
					tally(perName, page.CELL_NAMES[color.cell] ?? "unnamed");
				}
		const delivered = bins.map(n => n / total * 12);
		const against = density => cv(delivered.map((d, b) => d / shareOf(density)[b]));
		console.log(condition.label.padEnd(20) + delivered.map(v => fmt(v)).join("") + fmt(against(HUE_DENSITY), 15, 3) + fmt(against(HUE_DENSITY_AUTHORED), 16, 3));
		nameCounts.set(condition.label, { perName, total });
	}
	if (!names)
		return;

	// The box's own name marginal: uniform draws over the box, as generate() draws them before weighting.
	const cfg = { hMin: 0, hMax: 360, ...box, included: new Array(page.CELL_NAMES.length + 1).fill(true) };
	const cells = page.boxCells(cfg);
	cfg.cells = cells.fraction < page.SPARSE_FRACTION ? cells : null;
	const rnd = page.mulberry32(7), boxNames = new Map(), BOX_DRAWS = 20000;
	for (let n = 0; n < BOX_DRAWS; ++n) {
		const [L, C, h] = page.samplePoint(rnd, cfg);
		tally(boxNames, page.CELL_NAMES[page.cellOf(page.oklabToRgb(...page.labOfLch(L, C, h))).cell] ?? "unnamed");
	}
	nameCounts.set("box", { perName: boxNames, total: BOX_DRAWS });

	const columns = ["box", ...conditions.map(c => c.label)];
	const seen = [...new Set([...nameCounts.values()].flatMap(c => [...c.perName.keys()]))];
	const first = nameCounts.get(conditions[0].label);
	seen.sort((a, b) => (first.perName.get(b) || 0) - (first.perName.get(a) || 0));
	console.log("\nshare of colors per name, per cent");
	console.log("name".padEnd(14) + columns.map(c => c.padStart(18)).join(""));
	for (const name of seen)
		console.log(name.padEnd(14) + columns.map(c => fmt((nameCounts.get(c).perName.get(name) || 0) / nameCounts.get(c).total * 100, 18, 1)).join(""));
	console.log("names seen".padEnd(14) + columns.map(c => String([...nameCounts.get(c).perName.keys()].length).padStart(18)).join(""));
}

main(process.argv.slice(2));
