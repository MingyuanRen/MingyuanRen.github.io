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
  assert.match(html, />Personal<\/a>/);
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
  assert.match(html, /href="\/personal\/essays\/">随笔/);
  assert.match(html, /href="\/personal\/rankings\/">从夯到拉/);
  assert.doesNotMatch(html, /<article\b|LEARNING|CULTURE/);
});

for (const [slug, title] of [["essays", "随笔"], ["rankings", "从夯到拉"]]) {
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
    assert.ok(html.includes(title));
    assert.doesNotMatch(html, /<article\b/);
  });
}
