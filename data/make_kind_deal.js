#!/usr/bin/env node
// Deals the colors calibrate-kinds.html shows, each named alone by the judge: a grid of hues every --hues degrees, at the
// cusp-relative lightnesses of --lights and the chroma shares of the reach of --shares. Writes the deal into the page.
//
//     node data/make_kind_deal.js [--hues 10] [--lights 25,50,75] [--shares 50,100] [page.html]

"use strict";
const path = require("path");
const { loadPage, writeDeal, gamutChroma } = require("./identify.js");

const hexOf = rgb => "#" + rgb.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");

function main(args) {
	let hueStep = 10, lights = [25, 50, 75], shares = [50, 100], pagePath = path.join(__dirname, "..", "index.html");
	for (let i = 0; i < args.length; ++i) {
		if (args[i] === "--hues")
			hueStep = +args[++i];
		else if (args[i] === "--lights")
			lights = args[++i].split(",").map(Number);
		else if (args[i] === "--shares")
			shares = args[++i].split(",").map(Number);
		else if (args[i].endsWith(".html"))
			pagePath = args[i];
		else
			throw new Error("unknown option " + args[i]);
	}
	const page = loadPage(pagePath);
	const colors = [];
	for (let hue = 0; hue < 360; hue += hueStep)
		for (const light of lights)
			for (const share of shares) {
				const L = page.absoluteL(light, hue), C = share / 100 * gamutChroma(L, hue);
				colors.push({ hue, light, share, L: +L.toFixed(1), C: +C.toFixed(1), hex: hexOf(page.oklabToRgb(...page.labOfLch(L, C, hue))) });
			}
	writeDeal("calibrate-kinds.html", "KIND_DEAL", { version: 1, page: path.basename(pagePath), hueStep, lights, shares, colors });
	console.log(colors.length + " colors: hues every " + hueStep + " degrees, lightness " + lights.join(", ") + " of the cusp, chroma " + shares.join(", ") + "% of the reach; written into data/calibrate-kinds.html");
}

main(process.argv.slice(2));
