import assert from "node:assert/strict";
import test from "node:test";

test("renders the introduction before writing sections with requested outbound links", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /href="\/personal\/?"/);
  assert.match(html, />Personal<\/a>/);
  assert.match(html, /Literature, film, and things that live in the imagination/);
  assert.match(html, /Mingyuan Ren/);
  assert.match(html, /任明远/);
  assert.match(html, /About me/);
  assert.match(html, /<strong>Core Infrastructure<\/strong> team/);
  assert.match(html, /class="current-company" href="https:\/\/zip.com\/"/);
  assert.match(html, />Engineering Notes<\/a>/);
  assert.match(html, /University of Waterloo/);
  assert.match(html, /996607062al@gmail\.com/);
  for (const url of ["https://zip.com/", "https://uwaterloo.ca/", "https://kikoff.com/", "https://www.coinbase.com/", "https://www.bitgo.com/", "https://system1.com/", "https://www.blackberry.com/", "https://www.tiktok.com/about"]) {
    assert.ok(html.includes(`href="${url}"`));
  }
  assert.ok(html.indexOf('aria-label="About me"') < html.indexOf('aria-label="Writing"'));
  assert.match(html, /href="\/tech\/"/);
  assert.match(html, /src="\/avatar.jpg"/);
  assert.match(html, /href="\/favicon.jpg"/);
  assert.doesNotMatch(html, />\s*(LEARNING|CULTURE|NOW|TECH)\s*</);
  assert.doesNotMatch(html, /Use dark theme|Use light theme|<button/);
  assert.doesNotMatch(html, /hello@example\.com|Your Name|Infrastructure Engineer|After Yang|Reading Kubernetes/);
  assert.doesNotMatch(html, /href="#contact"|<article\b|codex-preview/);
});

test("personal page links to both empty categories", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(
    new Request("http://localhost/personal", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/"/);
  assert.match(html, /href="\/personal\/essays\/">片刻/);
  assert.match(html, /Literature, film, and things that live in the imagination/);
  assert.match(html, /aria-pressed="true"[^>]*>中文/);
  assert.match(html, /aria-pressed="false"[^>]*>English/);
  assert.match(html, /href="\/personal\/rankings\/">从夯到拉/);
  assert.doesNotMatch(html, /<article\b|LEARNING|CULTURE/);
});

for (const [slug, title] of [["essays", "片刻"], ["rankings", "从夯到拉"]]) {
  test(`${slug} has a title and parent link without sample content`, async () => {
    const { default: worker } = await import("../dist/server/index.js");
    const response = await worker.fetch(
      new Request(`http://localhost/personal/${slug}`, { headers: { accept: "text/html" } }),
      { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
      { waitUntil() {}, passThroughOnException() {} },
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="\/personal\/"/);
    assert.ok(html.includes(`<h1 class="section-title">${title}</h1>`));
    assert.doesNotMatch(html, /<time\b/);
    assert.doesNotMatch(html, /<article\b/);
  });
}
