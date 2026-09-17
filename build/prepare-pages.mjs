import { copyFile, mkdir, readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";

// vinext's trailingSlash export currently redirects before prerendering nested
// routes. Export without it, then provide GitHub Pages directory-style URLs.
await mkdir("dist/client/personal", { recursive: true });
await copyFile("dist/client/personal.html", "dist/client/personal/index.html");
const home = await readFile("dist/client/index.html", "utf8");
const personal = await readFile("dist/client/personal/index.html", "utf8");
assert.match(home, /href="\/personal\/"/);
assert.match(personal, /href="\/"/);
await Promise.all(["avatar.jpg", "favicon.jpg"].map(file => access(`dist/client/${file}`)));
