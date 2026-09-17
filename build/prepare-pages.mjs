import { copyFile, mkdir, readFile, access } from "node:fs/promises";
import assert from "node:assert/strict";

// vinext's trailingSlash export currently redirects before prerendering nested
// routes. Export without it, then provide GitHub Pages directory-style URLs.
for (const route of ["tech", "personal", "personal/essays", "personal/rankings"]) {
  await mkdir(`dist/client/${route}`, { recursive: true });
  await copyFile(`dist/client/${route}.html`, `dist/client/${route}/index.html`);
}
const home = await readFile("dist/client/index.html", "utf8");
const personal = await readFile("dist/client/personal/index.html", "utf8");
assert.match(home, /href="\/personal\/"/);
assert.match(personal, /href="\/"/);
assert.match(personal, /href="\/personal\/essays\/"/);
assert.match(personal, /href="\/personal\/rankings\/"/);
await Promise.all(["avatar.jpg", "favicon.jpg"].map(file => access(`dist/client/${file}`)));
