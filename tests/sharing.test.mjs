import test from "node:test";
import assert from "node:assert/strict";
import { parsePost } from "../lib/markdown.mjs";
import { markdownText, excerpt, firstUploadedImage } from "../lib/text.mjs";
import { pageMetadata } from "../lib/sharing.mjs";

const image = "/uploads/12345678-1234-1234-1234-123456789abc.jpg";
const source = (fields = "", body = "第一行\n第二行 **重要** & <文字> 😀") => `---\ntitle: '标题 & <test>'\ndate: '2026-09-17'\ndraft: false\n${fields}\n---\n${body}`;

test("sharing extracts readable Markdown text and only chooses same-site uploaded images", () => {
  assert.equal(markdownText('**你好** [world](https://example.org) &amp; `code`\n换行\n\n![secret alt](https://outside.test/x.png)'), "你好 world & code\n换行");
  assert.equal(excerpt("😀😀😀", 2), "😀…");
  assert.equal(firstUploadedImage(`![external](https://outside.test/x.png)\n![ours](${image})`), image);
  assert.equal(firstUploadedImage('![x](//outside.test/x.jpg)'), undefined);
  const post = parsePost(source("", `A **small** thought.\n![image](${image})`), "content/essays/test.zh.md");
  assert.equal(post.excerpt, "A small thought."); assert.equal(post.coverImage, image);
  const metadata = pageMetadata({ title: post.title, path: post.href, image: post.coverImage, description: post.excerpt, language: post.language, article: true });
  assert.equal(metadata.openGraph.type, "article"); assert.equal(metadata.openGraph.locale, "zh_CN");
  assert.equal(metadata.openGraph.images[0].url, "https://mingyuanren.github.io" + image);
  assert.equal(metadata.alternates.canonical, "https://mingyuanren.github.io/posts/essays/test/zh/");
  assert.equal(metadata.twitter.card, "summary_large_image");
  assert.equal(pageMetadata().twitter.card, "summary");
});

test("rendered sharing metadata is preserved without RSS links or endpoints", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const fetch = path => worker.fetch(new Request("http://localhost" + path, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await (await fetch("/tech")).text();
  assert.match(html, /property="og:title" content="Engineering Notes/);
  assert.match(html, /property="og:url" content="https:\/\/mingyuanren.github.io\/tech\/"/);
  assert.match(html, /name="twitter:card"/);
  const rss = /application\/rss\+xml|feed(?:-en)?\.xml|feed-links|Subscribe via RSS/;
  assert.doesNotMatch(html, rss);
  for (const path of ["/", "/personal", "/personal/essays", "/personal/rankings", "/personal/pictures"]) {
    const response = await fetch(path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), rss, path);
  }
  for (const path of ["/feed.xml", "/feed-en.xml", "/feed.xml/", "/feed-en.xml/"]) {
    let response = await fetch(path);
    if (path.endsWith("/")) {
      assert.equal(response.status, 308);
      const location = response.headers.get("location");
      assert.equal(new URL(location, "http://localhost").pathname, path.slice(0, -1));
      response = await fetch(path.slice(0, -1));
    }
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /<rss\b/);
  }
});
