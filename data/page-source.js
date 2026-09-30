// index.html's script up to its UI section, for data/ pages that run the page's own code (script tag). Fails on a page
// opened from disk: the fetch needs the server (.claude/launch.json, port 8734).
async function fetchPageSource() {
	const UI_SECTION = "// ---------- ui ----------";
	const html = await (await fetch("../index.html", { cache: "no-store" })).text();
	const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(text => text.includes(UI_SECTION));
	return script.slice(0, script.indexOf(UI_SECTION));
}
