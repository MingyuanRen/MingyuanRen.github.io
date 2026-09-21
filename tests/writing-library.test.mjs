import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdown, parsePost } from "../lib/markdown.mjs";
import { serializeEntry, readEntry } from "../lib/writing.mjs";
import { changeTrashState, loadLibrary } from "../lib/writing-library.mjs";
import { translationSource } from "../lib/translation-server.mjs";

const entry = { section: "essays", slug: "lines", language: "zh", title: "Lines", date: "2026-09-20", description: "", body: "第一行\n第二行\n\n下一段", draft: false };

test("author-entered line breaks survive preview, save and published rendering without changing code blocks", () => {
  assert.match(renderMarkdown(entry.body), /第一行<br>\n第二行/);
  const saved = serializeEntry(entry, false);
  assert.match(parsePost(saved.source, saved.path).html, /第一行<br>\n第二行/);
  assert.match(parsePost(saved.source, saved.path).html, /<p>下一段<\/p>/);
  assert.equal(renderMarkdown("```\na\nb\n```"), "<pre><code>a\nb\n</code></pre>\n");
});

test("trash is hidden even with published metadata, preserves writing, and cannot publish until restored", () => {
  const saved = serializeEntry({ ...entry, trashed: true }, true);
  const loaded = readEntry(saved.source, saved.path);
  assert.equal(loaded.trashed, true);
  assert.equal(loaded.body.trimEnd(), entry.body);
  assert.equal(parsePost(saved.source.replace("draft: true", "draft: false"), saved.path).draft, true);
  assert.throws(() => serializeEntry(loaded, false), /restore/i);
  assert.throws(() => translationSource(saved.source, saved.path), /restore/i);
  assert.throws(() => parsePost(saved.source.replace("trashed: true", "trashed: yes"), saved.path), /Trash/);
  const restored = serializeEntry({ ...loaded, trashed: false }, true);
  assert.equal(readEntry(restored.source, restored.path).draft, true);
  assert.equal(readEntry(restored.source, restored.path).trashed, undefined);
});

test("library separates drafts, published, trash and unreadable files without exposing draft bodies", async () => {
  const fixtures = [serializeEntry(entry, true), serializeEntry({ ...entry, slug: "published" }, false), serializeEntry({ ...entry, slug: "trash", trashed: true }, true), { path: "content/essays/broken.zh.md", source: "invalid" }];
  const files = await loadLibrary({ list: async () => fixtures.map(file => ({ path: file.path, sha: "old" })), read: async path => ({ ...fixtures.find(file => file.path === path), sha: "fresh" }) });
  assert.deepEqual(files.map(file => file.state), ["drafts", "published", "trash", "unavailable"]);
  assert.equal(files[0].sha, "fresh");
  assert.ok(files.every(file => file.body === undefined));
});

test("trash and restore keep both versions recoverable and protect stale revisions and partial failures", async () => {
  const zh = serializeEntry(entry, false), en = serializeEntry({ ...entry, language: "en" }, false);
  const files = new Map([zh, en].map(file => [file.path, { ...file, sha: "v1" }]));
  let writes = 0, failSecond = false;
  const writer = { read: async path => files.get(path), save: async (path, source, sha) => {
    assert.equal(sha, files.get(path).sha);
    if (failSecond && path === en.path) throw new Error("network failed after request");
    writes++; const result = { path, source, sha: `v${writes + 1}` }; files.set(path, result); return result;
  } };
  const targets = () => [zh, en].map(file => ({ path: file.path, sha: files.get(file.path).sha }));
  await assert.rejects(changeTrashState(writer, [{ path: zh.path, sha: "stale" }], true), /changed elsewhere/);
  await assert.rejects(changeTrashState(writer, [{ path: "site-public/uploads/test.png", sha: "v1" }], true), /Choose/);
  assert.equal(writes, 0);
  const trashed = await changeTrashState(writer, targets(), true);
  assert.equal(trashed.saved.length, 2); assert.equal(trashed.error, "");
  for (const file of files.values()) assert.equal(parsePost(file.source, file.path).draft, true);
  const restored = await changeTrashState(writer, targets(), false);
  assert.equal(restored.saved.length, 2);
  for (const file of files.values()) { assert.equal(readEntry(file.source, file.path).trashed, undefined); assert.equal(readEntry(file.source, file.path).draft, true); }
  failSecond = true;
  const partial = await changeTrashState(writer, targets(), true);
  assert.equal(partial.saved.length, 1); assert.match(partial.error, /Refresh/);
  assert.equal(readEntry(files.get(zh.path).source, zh.path).trashed, true);
  assert.equal(readEntry(files.get(en.path).source, en.path).trashed, undefined);
});
