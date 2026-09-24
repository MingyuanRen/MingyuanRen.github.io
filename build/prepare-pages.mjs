import { copyFile, mkdir, readFile, access, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { publishedPosts, sections } from "../lib/markdown.mjs";
import { feeds, rssFeed } from "../lib/sharing.mjs";

// vinext's trailingSlash export currently redirects before prerendering nested
// routes. Export without it, then provide GitHub Pages directory-style URLs.
async function directoryUrls(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await directoryUrls(path);
    else if (entry.name.endsWith(".html") && !["index.html", "404.html"].includes(entry.name)) {
      const target = path.slice(0, -5);
      await mkdir(target, { recursive: true });
      await copyFile(path, join(target, "index.html"));
    }
  }
}
await directoryUrls("dist/client");
const home = await readFile("dist/client/index.html", "utf8");
const personal = await readFile("dist/client/personal/index.html", "utf8");
assert.match(home, /href="\/personal\/"/);
assert.match(personal, /href="\/"/);
assert.match(personal, /href="\/personal\/essays\/"/);
assert.match(personal, /href="\/personal\/rankings\/"/);
assert.match(personal, /href="\/personal\/pictures\/"/);
await Promise.all(["avatar.jpg", "favicon.jpg"].map(file => access(`dist/client/${file}`)));
await access("dist/client/admin/index.html");
await access("dist/client/personal/pictures/index.html");

// vinext skips route handlers in its static export. Emit real XML assets for
// GitHub Pages using the same renderer as the local GET routes.
const sources = {};
for (const section of sections) {
  const directory = join("content", section);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isFile() && /\.(zh|en)\.md$/.test(entry.name)) {
      const path = join(directory, entry.name);
      sources[path] = await readFile(path, "utf8");
    }
  }
}
const posts = publishedPosts(sources);
for (const [language, path] of Object.entries(feeds)) {
  const xml = rssFeed(posts, language);
  const target = join("dist/client", path.slice(1));
  await writeFile(target, xml);
  assert.equal(await readFile(target, "utf8"), xml);
}
