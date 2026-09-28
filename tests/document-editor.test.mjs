import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument, serializeDocument, loadDocument, safeDocumentUrl, blockPositions } from "../lib/document-markdown.ts";
import { renderMarkdown } from "../lib/markdown.mjs";

test("document Markdown round-trips Chinese, line breaks, formatting, lists, links, images and code", () => {
  const samples = [
    "第一行\n第二行 😀\n\n另一段。",
    "# Heading\n\n**bold** and *italic* and ~~strike~~ and `x < 2`",
    "> 电影里的日落。\n> 第二行\n\n---",
    "3. first\n4. second\n   * nested\n   * 中文",
    "* first\n\n* loose list\n\n  second paragraph",
    "[title](https://example.com/path \"A title\") and [mail](mailto:person@example.com)",
    "![一张 **电影** 图](/uploads/12345678-1234-1234-1234-123456789abc.jpg \"A still\")",
    "````ts\nconst x = `中文`;\n// ``` nested fence\n````",
    "A literal <script>alert(1)</script> and <b>not raw HTML</b>.",
    "[reference][id]\n\n[id]: https://example.com/ \"reference title\"",
  ];
  for (const source of samples) {
    const doc = parseDocument(source), saved = serializeDocument(doc);
    assert.deepEqual(parseDocument(saved).toJSON(), doc.toJSON(), source);
    assert.equal(renderMarkdown(saved), renderMarkdown(source), source);
  }
});

test("unsupported Markdown stays in source mode instead of losing table content", () => {
  const source = "| Director | Film |\n| --- | --- |\n| Name | Title |";
  assert.throws(() => parseDocument(source), /table/);
  assert.match(loadDocument(source).error, /original Markdown is intact/);
  assert.equal(loadDocument("你好").error, "");
  assert.deepEqual(blockPositions(parseDocument("First\n\nSecond")).map(block => [block.pos, block.end, block.node.textContent]), [[0, 7, "First"], [7, 15, "Second"]]);
});

test("document links and image URLs reject executable and embedded content", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,x", "file:///etc/passwd", "//outside.test/x", "/\\outside.test/x", "https://a.test/\nfoo"]) {
    assert.equal(safeDocumentUrl(url), false, url);
    assert.equal(safeDocumentUrl(url, true), false, url);
  }
  for (const url of ["/uploads/test.png", "https://example.com/image.jpg"]) assert.equal(safeDocumentUrl(url, true), true);
  assert.equal(safeDocumentUrl("mailto:person@example.com"), true);
  assert.equal(safeDocumentUrl("mailto:person@example.com", true), false);
  const saved = serializeDocument(parseDocument("[unsafe](javascript:alert(1))"));
  assert.doesNotMatch(renderMarkdown(saved), /href=/);
});
