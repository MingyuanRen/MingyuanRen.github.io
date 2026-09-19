import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { translateEntry, translationSource } from "../lib/translation-server.mjs";
import { translateGithub } from "../build/translate-github.mjs";
import { writingServer } from "../build/writing-server.mjs";
import { serializeEntry, readEntry, encodedText, decodedText, githubWriter } from "../lib/writing.mjs";

const image = "/uploads/00000000-0000-0000-0000-000000000000.png";
const entry = { title: "我的电影", section: "rankings", slug: "films", date: "2026-09-17", language: "zh", draft: false, description: "", body: "看了一些电影。", ranking: { version: 1, boardImage: image, commentary: "想说的话。", items: [{ id: "film-1", title: "电影", image, tier: "s", reason: "喜欢。", tmdbId: 204 }] } };
const original = serializeEntry(entry, false);
const output = { title: "My films", description: "", body: "Some films I watched.", commentary: "A few thoughts.", films: [{ id: "film-1", title: "Film", reason: "Loved it." }] };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const response = value => json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
const sha = "a".repeat(40);

test("OpenAI translation sends text only and produces a linked, unpublished draft preserving the board", async () => {
  const result = await translateEntry(original.source, original.path, { apiKey: "test-secret", fetcher: async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer test-secret");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-5.6");
    assert.deepEqual(body.reasoning, { effort: "none" });
    assert.equal(body.store, false);
    assert.equal(body.text.format.strict, true);
    assert.doesNotMatch(body.input, /uploads|boardImage|tier|tmdbId|test-secret/);
    assert.ok(body.max_output_tokens <= 16000);
    return response(output);
  } });
  const english = readEntry(result.source, result.path);
  assert.equal(result.path, original.path.replace(".zh.md", ".en.md"));
  assert.equal(english.draft, true);
  assert.equal(english.language, "en");
  assert.equal(english.date, entry.date);
  assert.deepEqual(english.ranking, { ...entry.ranking, commentary: output.commentary, items: [{ ...entry.ranking.items[0], title: "Film", reason: "Loved it." }] });
  assert.equal(readEntry(original.source, original.path).language, "zh");
});

test("missing keys, oversized inputs, refusals, truncation and bad film mappings cannot create a translation", async () => {
  await assert.rejects(translateEntry(original.source, original.path), /not configured/);
  const large = serializeEntry({ ...entry, body: "长".repeat(24001) }, true);
  assert.throws(() => translationSource(large.source, large.path), /24,000/);
  const invalid = [json({ status: "incomplete" }), json({ status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }), response({ ...output, films: [] }), response({ ...output, films: [{ ...output.films[0], id: "wrong" }] }), response({ ...output, body: "" })];
  for (const value of invalid) await assert.rejects(translateEntry(original.source, original.path, { apiKey: "test-only", fetcher: async () => value }), /incomplete or invalid/);
  await assert.rejects(translateEntry(original.source, original.path, { apiKey: "test-only", fetcher: async () => json({ error: "SECRET response" }, 429) }), error => /quota/.test(error.message) && !error.message.includes("SECRET"));
});

test("moments translate without acquiring a ranking or losing their format", async () => {
  const source = serializeEntry({ ...entry, section: "essays", format: "moment", title: "", ranking: undefined }, true);
  const translated = await translateEntry(source.source, source.path, { apiKey: "test-only", fetcher: async () => response({ ...output, commentary: "", films: [] }) });
  assert.equal(readEntry(translated.source, translated.path).format, "moment");
  assert.equal(readEntry(translated.source, translated.path).ranking, undefined);
});

test("GitHub translation is create-only and checks source revisions before and after the paid call", async () => {
  let reads = 0; let saved;
  const translator = async () => serializeEntry({ ...entry, language: "en", body: "English" }, true);
  await translateGithub({ path: original.path, sha, token: "test-github", apiKey: "test-openai", translator, fetcher: async (url, options) => {
    assert.ok(url.startsWith("https://api.github.com/repos/MingyuanRen/MingyuanRen.github.io/contents/"));
    assert.equal(options.redirect, "error");
    if (options.method === "PUT") { saved = JSON.parse(options.body); return json({}); }
    if (url.includes(".en.md")) return json({}, 404);
    reads++; return json({ type: "file", encoding: "base64", sha, content: encodedText(original.source) });
  } });
  assert.equal(reads, 2);
  assert.equal(saved.sha, undefined);
  assert.equal(saved.branch, "main");
  assert.equal(readEntry(decodedText(saved.content), original.path.replace("zh.md", "en.md")).draft, true);
  for (const conflict of ["exists", "stale", "changed-during"]) {
    let paid = 0; let sourceReads = 0; let writes = 0;
    await assert.rejects(translateGithub({ path: original.path, sha, token: "test", translator: async () => { paid++; return translator(); }, fetcher: async (url, options) => {
      if (options.method === "PUT") { writes++; return json({}); }
      if (url.includes(".en.md")) return json({}, conflict === "exists" ? 200 : 404);
      sourceReads++;
      return json({ type: "file", encoding: "base64", sha: conflict === "stale" || (conflict === "changed-during" && sourceReads === 2) ? "b".repeat(40) : sha, content: encodedText(original.source) });
    } }));
    assert.equal(writes, 0);
    assert.equal(paid, conflict === "changed-during" ? 1 : 0);
  }
});

test("browser translation adapter handles 204 dispatch and reads only its completed workflow", async () => {
  let requestId; let dispatches = 0; let sleeps = 0;
  const source = serializeEntry({ ...entry, language: "en" }, true).source;
  const writer = githubWriter("github_pat_test", async (url, options) => {
    assert.equal(options.credentials, "omit");
    if (url.endsWith("/dispatches")) {
      const body = JSON.parse(options.body);
      requestId = body.inputs.request_id; dispatches++;
      assert.equal(body.inputs.source_path, original.path);
      assert.equal(body.inputs.source_sha, sha);
      assert.equal(body.ref, "main");
      return new Response(null, { status: 204 });
    }
    if (url.includes("/runs?")) return json({ workflow_runs: [{ display_title: "Translate " + requestId, status: "completed", conclusion: "success" }] });
    return dispatches ? json({ type: "file", encoding: "base64", content: encodedText(source), sha }) : json({}, 404);
  }, async () => { sleeps++; });
  const result = await writer.translate(original.path, sha);
  assert.equal(result.source, source);
  assert.equal(dispatches, 1); assert.equal(sleeps, 1);
});

test("local translation rejects foreign origins and stale input, returning an unsaved draft only", async t => {
  const root = mkdtempSync(join(tmpdir(), "translation-test-"));
  mkdirSync(join(root, "content/rankings"), { recursive: true });
  writeFileSync(join(root, original.path), original.source);
  let calls = 0;
  const server = writingServer(root, { translator: async () => { calls++; return serializeEntry({ ...entry, language: "en" }, true); } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const base = "http://127.0.0.1:" + server.address().port;
  const body = { path: original.path, sha: createHash("sha256").update(original.source).digest("hex") };
  const request = (payload = body, origin = "http://localhost:3000") => fetch(base + "/api/translate", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  assert.equal((await request(body, "https://evil.example")).status, 403);
  assert.equal((await request({ ...body, sha: "stale" })).status, 409);
  assert.equal(calls, 0);
  const result = await request();
  assert.equal(result.status, 200);
  const translated = await result.json();
  assert.equal(readEntry(translated.source, translated.path).draft, true);
  assert.equal(existsSync(join(root, translated.path)), false);
  assert.equal(readFileSync(join(root, original.path), "utf8"), original.source);
  writeFileSync(join(root, translated.path), translated.source);
  assert.equal((await request()).status, 409);
  assert.equal(calls, 1);
});
