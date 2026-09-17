import test from "node:test";
import assert from "node:assert/strict";
import { parsePost, publishedPosts } from "../lib/markdown.mjs";

const source = (fields = "", body = "## Hello\n\n**Markdown** works.") => `---\ntitle: 测试文章\ndate: "2026-09-17"\n${fields}\n---\n${body}`;
test("Markdown renders Chinese, code, lists and images without executing HTML or unsafe links", () => {
  const post = parsePost(source("draft: false", '# 标题\n\n- one\n- two\n\n```js\nconst n = 1;\n```\n\n![image](/uploads/photo.jpg)\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))'), "content/essays/测试.zh.md");
  assert.match(post.html, /<ul>/);
  assert.match(post.html, /language-js/);
  assert.match(post.html, /src="\/uploads\/photo.jpg"/);
  assert.doesNotMatch(post.html, /<script>|href="javascript:/);
  assert.equal(post.href, "/posts/essays/%E6%B5%8B%E8%AF%95/zh/");
});
test("drafts, missing status and individual draft translations stay unpublished", () => {
  const posts = publishedPosts({
    "content/essays/a.zh.md": source("draft: false"),
    "content/essays/a.en.md": source("draft: true"),
    "content/engineering/b.en.md": source(),
  });
  assert.equal(posts.length, 1);
  assert.equal(posts[0].language, "zh");
});
test("reject malformed frontmatter, unsafe filenames and invalid dates", () => {
  assert.throws(() => parsePost("no metadata", "content/essays/a.zh.md"));
  assert.throws(() => parsePost(source('draft: "false"'), "content/essays/a.zh.md"));
  assert.throws(() => parsePost(source(), "content/essays/..zh.md"));
  assert.throws(() => parsePost(source("draft: false").replace("2026-09-17", "2026-02-30"), "content/essays/a.zh.md"));
});
test("an unfinished draft translation cannot break the published site or leak its body", () => {
  const posts = publishedPosts({ "content/essays/a.en.md": "---\ndraft: true\n---\nPRIVATE DRAFT" });
  assert.deepEqual(posts, []);
});
