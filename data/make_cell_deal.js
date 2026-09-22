#!/usr/bin/env node
// Deals the hue sectors calibrate-cells.html crosses with its lightness and chroma thirds: sectors even in the
// shipped hue warp, so each spans the same share of the circle by the step rounds' measure. Writes the deal into
// the page between its deal markers: a page opened from disk can fetch nothing.
//
//     node data/make_cell_deal.js [--sectors 20]

"use strict";
const { HUE_DENSITY, writeDeal } = require("./identify.js");

function main(args) {
	let sectors = 20;
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--sectors")
			sectors = +args[++i];
		else
			throw new Error("unknown option " + args[i]);
	}
	const warp = [0];
	for (let h = 0; h < 360; ++h)
		warp.push(warp[h] + HUE_DENSITY[h]);
	// The hue at which the warp reaches a share of its total, linear within the degree.
	const unwarp = share => {
		const target = share * warp[360];
		let lo = 0, hi = 360;
		while (hi - lo > 1) {
			const mid = (lo + hi) >> 1;
			if (warp[mid] <= target) lo = mid; else hi = mid;
		}
		return +(lo + (target - warp[lo]) / (warp[lo + 1] - warp[lo])).toFixed(2);
	};
	const bounds = Array.from({ length: sectors + 1 }, (_, k) => unwarp(k / sectors));
	const data = { version: 1, sectors: bounds.slice(0, -1).map((h, k) => [h, bounds[k + 1]]) };
	writeDeal("calibrate-cells.html", "CELL_DEAL", data);
	console.log(sectors + " sectors, " + data.sectors.map(([a, b]) => (b - a).toFixed(1)).join(" ") + " degrees wide; written into data/calibrate-cells.html");
}

main(process.argv.slice(2));
