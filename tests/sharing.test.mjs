import test from "node:test";
import assert from "node:assert/strict";
import { parsePost, publishedPosts } from "../lib/markdown.mjs";
import { markdownText, excerpt, firstUploadedImage } from "../lib/text.mjs";
import { pageMetadata, rssFeed, xml } from "../lib/sharing.mjs";

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

test("RSS separates languages, hides drafts and trash, escapes XML, uses stable GUIDs and chronological order", () => {
  const posts = publishedPosts({
    "content/essays/new.zh.md": source().replace("2026-09-17", "2026-09-20"),
    "content/essays/old.zh.md": source("pinned: true", "Older post"),
    "content/essays/new.en.md": source("", "English only"),
    "content/essays/draft.zh.md": source().replace("draft: false", "draft: true"),
    "content/essays/trash.zh.md": source("trashed: true", "PRIVATE TRASH"),
  });
  const feed = rssFeed(posts, "zh");
  assert.equal((feed.match(/<item>/g) || []).length, 2);
  assert.ok(feed.indexOf("/new/zh/") < feed.indexOf("/old/zh/"));
  assert.match(feed, /标题 &amp; &lt;test&gt;/); assert.match(feed, /&amp; &lt;文字&gt;/);
  assert.match(feed, /<guid isPermaLink="true">https:\/\/mingyuanren.github.io\/posts\/essays\/new\/zh\//);
  assert.doesNotMatch(feed, /English only|PRIVATE TRASH|draft\/zh/);
  assert.match(rssFeed(posts, "en"), /English only/);
  assert.equal((rssFeed([], "zh").match(/<item>/g) || []).length, 0);
  assert.equal(xml("\0\u000b & < > ' \""), " &amp; &lt; &gt; &apos; &quot;");
  assert.throws(() => rssFeed(posts, "invalid"), /Unsupported/);
});

test("rendered metadata and RSS discovery are present without running browser JavaScript", async () => {
  const { default: worker } = await import("../dist/server/index.js");
  const fetch = path => worker.fetch(new Request("http://localhost" + path, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
  const html = await (await fetch("/tech")).text();
  assert.match(html, /property="og:title" content="Engineering Notes/);
  assert.match(html, /property="og:url" content="https:\/\/mingyuanren.github.io\/tech\/"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /type="application\/rss\+xml"/);
  for (const path of ["/feed.xml", "/feed-en.xml"]) {
    const response = await fetch(path);
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /application\/rss\+xml/);
    assert.match(await response.text(), /^<\?xml/);
  }
});
