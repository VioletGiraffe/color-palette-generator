// HUE_BOOST_RANGES' parts, shared by data/fit_hue_boost.js (require) and data/tune-hue-boost.html (script tag): the
// author's hue sectors, the boxes the boost is judged in, and the ranges as index.html holds them.
(function (root) {
	"use strict";

	// The author's hue families, red through pink, by where each starts in OKLCh hue
	const SECTORS = [["red", 12], ["orange", 32], ["yellow", 72], ["green", 115], ["teal", 170], ["blue", 215], ["violet", 275], ["pink", 318]];
	// The author's box, capped and uncapped in lightness, and the page's default box; `names` is a state string's names field
	const AUTHOR_BOX = { count: 15, minApart: 14, hMin: 0, hMax: 360, cMin: 20, cMax: 100, lMin: 20, lMax: 67, lAbsolute: true, vividness: 0.15, names: "vkhsvlj" };
	const BOXES = [
		{ name: "author's, lightness to 67", weight: 2, cfg: AUTHOR_BOX },
		{ name: "author's, lightness to 100", weight: 1, cfg: { ...AUTHOR_BOX, lMax: 100 } },
		{ name: "default, 10 colors", weight: 1, cfg: { count: 10, hMin: 0, hMax: 360, cMin: 20, cMax: 100, lMin: 20, lMax: 80 } },
	];

	// Below the first start a hue is in the last sector, which wraps past 360
	function sectorOf(h) {
		let at = SECTORS.length - 1;
		SECTORS.forEach(([, from], i) => { if (h >= from) at = i; });
		return at;
	}

	// A box's generator config: its names field as the included cells, a bit per cell in base 36, the slot past the names in
	function configOf(box, cellCount) {
		const { names, ...cfg } = box.cfg;
		const included = names ? [...Array.from({ length: cellCount }, (_, cell) => Math.floor(parseInt(names, 36) / 2 ** cell) % 2 === 1), true] : undefined;
		return { fixed: [], avoid: [], ...cfg, ...(included ? { included } : {}) };
	}

	// Ranges { from, to, boost, ramp } as index.html holds them, a range a line
	const rangesText = ranges => "const HUE_BOOST_RANGES = [" + ranges.map(({ from, to, boost, ramp }) =>
		"\n\t{ from: " + from + ", to: " + to + ", boost: " + +boost.toFixed(3) + ", ramp: " + ramp + " },").join("") + (ranges.length ? "\n" : "") + "];";

	const api = { SECTORS, BOXES, sectorOf, configOf, rangesText };
	if (typeof module !== "undefined" && module.exports)
		module.exports = api;
	else
		root.HueBoost = api;
})(this);
