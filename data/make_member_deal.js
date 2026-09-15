#!/usr/bin/env node
// Deals the palettes calibrate-members.html shows, one per seed from the page as it is. Every second palette
// keeps one color of the palette before it as a fixed color, so that color is judged in two companies.
// Writes the deal into the page itself, between its deal markers: a page opened from disk can fetch nothing.
//
//     node data/make_member_deal.js [--palettes 120] [--count 8] [--box lMin lMax cMin cMax] [--shared 0.5] [page.html]
//
// --shared is the fraction of palettes that carry a fixed color from the palette before them.
// Every palette is sorted by hue from 0, as the page shows it with sorting on.

"use strict";
const fs = require("fs");
const path = require("path");
const { loadPage } = require("./identify.js");

const hueOf = lab => (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;

function main(args) {
	let count = 8, palettes = 120, shared = 0.5, box = { lMin: 20, lMax: 60, cMin: 20, cMax: 100 }, pagePath = path.join(__dirname, "..", "index.html");
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--palettes")
			palettes = +args[++i];
		else if (args[i] === "--count")
			count = +args[++i];
		else if (args[i] === "--shared")
			shared = +args[++i];
		else if (args[i] === "--box")
			box = { lMin: +args[++i], lMax: +args[++i], cMin: +args[++i], cMax: +args[++i] };
		else if (args[i].endsWith(".html"))
			pagePath = args[i];
		else
			throw new Error("unknown option " + args[i]);
	}
	const page = loadPage(pagePath), CELL_NAMES = page.CELL_NAMES;
	const dealt = [];
	for (let seed = 1; seed <= palettes; ++seed) {
		// The shared palettes are every other one from the second, up to the fraction asked for.
		const previous = dealt[seed - 2];
		const fixedHex = previous && seed % 2 === 0 && (seed / 2) <= Math.round(palettes * shared) ? previous.hexes[Math.floor(page.mulberry32(seed)() * previous.hexes.length)] : null;
		const fixed = fixedHex ? [page.colorFromHex(fixedHex)] : [];
		const colors = page.generate({ count: count - fixed.length, scale: 3, hMin: 0, hMax: 360, ...box, seed, fixed }).colors
			.slice().sort((p, q) => hueOf(p.lab) - hueOf(q.lab));
		dealt.push({ seed, count, hexes: colors.map(c => c.hex), names: colors.map(c => CELL_NAMES[c.cell] ?? "unnamed"), fixed: fixedHex });
	}
	const sharedCount = dealt.filter(p => p.fixed).length;
	const data = { version: 1, page: path.basename(pagePath), box, count, shared: sharedCount, palettes: dealt };
	const out = path.join(__dirname, "calibrate-members.html"), OPEN = "// ---------- deal ----------\n", CLOSE = "// ---------- end deal ----------";
	const source = fs.readFileSync(out, "utf8"), from = source.indexOf(OPEN), to = source.indexOf(CLOSE);
	if (from < 0 || to < from)
		throw new Error(path.basename(out) + " lacks the deal markers");
	fs.writeFileSync(out, source.slice(0, from + OPEN.length) + "const MEMBER_DEAL = " + JSON.stringify(data) + ";\n" + source.slice(to));
	console.log(dealt.length + " palettes of " + count + " colors, " + sharedCount + " sharing a color with the palette before; box L " + box.lMin + "-" + box.lMax
		+ ", C " + box.cMin + "-" + box.cMax + "%; written into " + path.relative(process.cwd(), out));
}

main(process.argv.slice(2));
