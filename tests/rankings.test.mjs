import assert from "node:assert/strict";
import test from "node:test";
import { stringify } from "yaml";
import { parsePost, publishedPosts } from "../lib/markdown.mjs";
import { readEntry, serializeEntry, validUploadPath } from "../lib/writing.mjs";
import { tiers, validateRanking, validRankingImage } from "../lib/rankings.mjs";

const image = "/uploads/12345678-1234-1234-1234-123456789abc.jpg";
const boardImage = "/uploads/87654321-1234-1234-1234-123456789abc.png";
const item = { id: "movie-1", title: "日落之前", image, tier: "s", reason: "**喜欢**它的余韵。\n\n第二段：很私人。" };
const ranking = { version: 1, items: [item, { ...item, id: "movie-2", title: "重看一遍", tier: "d" }], boardImage };
const entry = { section: "rankings", slug: "电影排名", language: "zh", title: "我的电影排名", date: "2026-09-17", description: "私人意见", body: "一段开场白。", draft: false, ranking };
const source = (metadata, body = "开场白。") => "---\n" + stringify({ title: "Title", date: "2026-09-17", draft: false, ...metadata }) + "---\n" + body;

test("ranking tiers match the reference and validation preserves order, duplicate posters and Chinese reasons", () => {
  assert.deepEqual(tiers.map(tier => [tier.id, tier.label, tier.color]), [
    ["s", "夯", "#ed3825"], ["a", "顶级", "#f4c94d"], ["b", "人上人", "#f8ef32"],
    ["c", "NPC", "#f8efcc"], ["d", "拉完了", "#ffffff"],
  ]);
  const validated = validateRanking(ranking, { published: true });
  assert.deepEqual(validated, ranking);
  assert.notEqual(validated, ranking);
  assert.notEqual(validated.items[0], ranking.items[0]);
  const { source: markdown, path } = serializeEntry(entry, false);
  assert.deepEqual(readEntry(markdown, path), { ...entry, body: entry.body + "\n" });
  const published = parsePost(markdown, path);
  assert.deepEqual(published.ranking, ranking);
  assert.equal(published.html, "<p>一段开场白。</p>\n");
  assert.doesNotMatch(published.html, /喜欢|重看一遍/);
});

test("unfinished rankings can be saved as drafts but must be complete before publishing", () => {
  for (const pending of [{ version: 1, items: [] }, { version: 1, items: [{ ...item, tier: null }] }]) {
    const { source: markdown, path } = serializeEntry({ ...entry, ranking: pending }, true);
    assert.deepEqual(readEntry(markdown, path).ranking, pending);
    assert.throws(() => serializeEntry({ ...entry, ranking: pending }, false), /发布前/);
    assert.deepEqual(publishedPosts({ [path]: markdown }), []);
    assert.equal(Object.hasOwn(parsePost(markdown, path), "ranking"), false);
  }
  // A malformed private draft must not break the build or expose its metadata.
  assert.deepEqual(publishedPosts({ "content/rankings/unready.en.md": source({ draft: true, ranking: { private: "unfinished" } }, "PRIVATE") }), []);
  assert.deepEqual(validateRanking({ version: 1, items: [item] }), { version: 1, items: [item] });
  assert.throws(() => validateRanking({ version: 1, items: [{ ...item, title: " " }] }, { published: true }), /作品的名称/);
});

test("free-form text below the board survives saves and item changes without affecting legacy rankings", () => {
  const commentary = "一段自由写的正文。\n\n**另一段**，无需固定标题。";
  const withText = { ...ranking, commentary };
  for (const draft of [true, false]) {
    const saved = serializeEntry({ ...entry, ranking: withText }, draft);
    assert.equal(readEntry(saved.source, saved.path).ranking.commentary, commentary);
    if (!draft) assert.equal(parsePost(saved.source, saved.path).ranking.commentary, commentary);
    else assert.equal(Object.hasOwn(parsePost(saved.source, saved.path), "ranking"), false);
  }
  assert.equal(validateRanking({ ...withText, items: [...withText.items].reverse() }).commentary, commentary);
  assert.equal(Object.hasOwn(validateRanking(ranking), "commentary"), false);
  assert.equal(validateRanking({ ...ranking, commentary: "" }).commentary, "");
  for (const invalid of [null, {}, 42, "x".repeat(100001)]) {
    assert.throws(() => validateRanking({ ...ranking, commentary: invalid }), /正文/);
  }
});

test("ranking data rejects invalid schemas, duplicate identity, tiers and oversized fields", () => {
  const invalid = [null, [], { version: 2, items: [] }, { version: 1, items: {} },
    { items: [] }, { version: 1 }, { version: 1, items: Array(1) },
    { ...ranking, unexpected: true }, { ...ranking, items: [{ ...item, extra: true }] },
    { ...ranking, items: [item, item] }, { ...ranking, items: [{ ...item, id: "../escape" }] },
    { ...ranking, items: [{ ...item, tier: "f" }] }, { ...ranking, items: [{ ...item, tier: undefined }] },
    { ...ranking, items: [{ ...item, title: "x".repeat(201) }] },
    { ...ranking, items: [{ ...item, reason: "x".repeat(10_001) }] },
    { ...ranking, items: [{ ...item, reason: null }] },
    { ...ranking, items: Array.from({ length: 41 }, (_, index) => ({ ...item, id: "movie-" + index })) },
  ];
  for (const value of invalid) assert.throws(() => validateRanking(value), Error);
  for (const key of Object.keys(item)) {
    const incomplete = { ...item };
    delete incomplete[key];
    assert.throws(() => validateRanking({ version: 1, items: [incomplete] }), /作品数据无效/);
  }
  assert.throws(() => validateRanking({ version: 1, items: [Object.create(item)] }), /作品数据无效/);
  assert.throws(() => serializeEntry({ ...entry, title: "" }, true), /标题/);
  assert.throws(() => serializeEntry(undefined, true), /文章数据格式/);
  assert.throws(() => serializeEntry(entry, "false"), /草稿状态格式/);
});

test("combined ranking metadata and body limits are checked before a board image upload", () => {
  const large = { ...entry, body: "x".repeat(490_000), ranking: { version: 1, items: Array.from({ length: 20 }, (_, index) => ({ ...item, id: "movie-" + index, reason: "x".repeat(10_000) })) } };
  for (const draft of [true, false]) assert.throws(() => serializeEntry(large, draft), /文章与排名内容合计过长/);
  const near = { ...entry, body: "x".repeat(490_000), ranking: { version: 1, items: Array.from({ length: 10 }, (_, index) => ({ ...item, id: "movie-" + index, reason: "x".repeat(10_000) })) } };
  const withBoard = { ...near, ranking: { ...near.ranking, boardImage } };
  const remaining = 600_000 - serializeEntry(withBoard, false).source.length;
  near.body += "x".repeat(remaining);
  assert.equal(serializeEntry({ ...near, ranking: { ...near.ranking, boardImage } }, false).source.length, 600_000);
  assert.ok(serializeEntry(near, false).source.length < 600_000);
  near.body += "x";
  // The raw source still fits, but the image added after preflight would not.
  assert.ok(serializeEntry(near, true).source.length < 600_000);
  assert.throws(() => serializeEntry(near, false), /文章与排名内容合计过长/);
});

test("rankings accept only exact same-site upload paths, including for board snapshots", () => {
  const badImages = ["https://evil.example/poster.jpg", "//evil.example/poster.jpg", "data:image/png;base64,a", "javascript:alert(1)",
    image + "?query", image + "#hash", image.replace(".jpg", ".svg"), image.replace("/uploads/", "/uploads/../"),
    "/uploads/------------------------------------.png", "/uploads/photo.png", image.replace("/uploads/", "/%75ploads/")];
  for (const invalid of badImages) {
    assert.equal(validRankingImage(invalid), false);
    assert.throws(() => validateRanking({ ...ranking, items: [{ ...item, image: invalid }] }));
    assert.throws(() => validateRanking({ ...ranking, boardImage: invalid }));
  }
  assert.equal(validRankingImage(image), true);
  assert.equal(validUploadPath("site-public" + image), true);
  assert.equal(validUploadPath("site-public/uploads/------------------------------------.png"), false);
  assert.equal(validUploadPath(undefined), false);
});

test("ranking metadata is restricted to rankings and legacy Markdown articles stay unchanged", () => {
  for (const section of ["essays", "engineering"]) {
    assert.throws(() => serializeEntry({ ...entry, section }, true), /从夯到拉/);
    assert.throws(() => parsePost(source({ ranking }), `content/${section}/test.zh.md`), /only allowed/);
    assert.throws(() => readEntry(source({ ranking }), `content/${section}/test.zh.md`), /从夯到拉/);
  }
  const { ranking: unusedRanking, ...legacy } = entry;
  assert.ok(unusedRanking);
  const { source: markdown, path } = serializeEntry(legacy, false);
  assert.deepEqual(readEntry(markdown, path), { ...legacy, body: legacy.body + "\n" });
  assert.equal(Object.hasOwn(parsePost(markdown, path), "ranking"), false);
  assert.equal(Object.hasOwn(parsePost(markdown, path), "format"), false);
});

test("moments allow an omitted title, preserve their format and derive a short readable title", () => {
  const text = "这是一段用于验证标题生成的测试文字，需要保留中文字符并且在合适的位置截断，正文应完整保存。";
  const moment = { ...entry, section: "essays", ranking: undefined, title: "", format: "moment", body: "\n> **" + text + "**" };
  const { source: markdown, path } = serializeEntry(moment, false);
  const loaded = readEntry(markdown, path);
  assert.equal(loaded.format, "moment");
  assert.equal(loaded.title, [...text].slice(0, 36).join(""));
  assert.equal(Object.hasOwn(loaded, "ranking"), false);
  const published = parsePost(markdown, path);
  assert.equal(published.format, "moment");
  assert.equal(published.title, loaded.title);
  const untitledDraft = serializeEntry({ ...moment, body: "" }, true);
  assert.equal(readEntry(untitledDraft.source, path).title, moment.date);
  assert.throws(() => serializeEntry({ ...moment, body: "" }, false), /写下/);
  assert.throws(() => parsePost(source({ format: "moment" }, "\n"), "content/essays/empty.zh.md"), /needs some text/);
  for (const section of ["rankings", "engineering"]) {
    assert.throws(() => serializeEntry({ ...moment, section }, true), /只能用于/);
    assert.throws(() => parsePost(source({ format: "moment" }), `content/${section}/test.zh.md`), /Invalid format/);
  }
  assert.throws(() => serializeEntry({ ...moment, format: "another-format" }, true), /只能用于/);
  assert.throws(() => serializeEntry({ ...moment, format: undefined }, false), /标题/);
});
