import assert from "node:assert/strict";
import test from "node:test";

test("renders the empty template without fabricated content or placeholder links", async () => {
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
  assert.match(html, /src="\/avatar.jpg"/);
  assert.match(html, /href="\/favicon.jpg"/);
  assert.doesNotMatch(html, />\s*(LEARNING|CULTURE|NOW|TECH)\s*</);
  assert.doesNotMatch(html, /Use dark theme|Use light theme|<button/);
  assert.doesNotMatch(html, /hello@example\.com|Your Name|Infrastructure Engineer|After Yang|Reading Kubernetes/);
  assert.doesNotMatch(html, /href="#contact"|<article\b|codex-preview/);
});

test("personal page stays empty with a working home link", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(
    new Request("http://localhost/personal", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /href="\/"/);
  assert.doesNotMatch(html, /<article\b|<h1\b|LEARNING|CULTURE/);
});
