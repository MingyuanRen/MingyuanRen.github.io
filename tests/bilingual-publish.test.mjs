import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writingServer } from "../build/writing-server.mjs";
import { publishGithub } from "../build/publish-github.mjs";
import { translateEntry } from "../lib/translation-server.mjs";
import { readEntry, serializeEntry, githubWriter, encodedText } from "../lib/writing.mjs";
import { otherLanguagePath } from "../lib/bilingual-publish.mjs";

const entry = { section: "essays", slug: "bilingual", language: "zh", title: "", format: "moment", body: "日落还未结束。", date: "2026-09-17", description: "", draft: false };
const original = serializeEntry(entry, false);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const translate = async (source, path) => {
  const input = readEntry(source, path);
  return serializeEntry({ ...input, language: input.language === "zh" ? "en" : "zh", title: "Sunset", body: "The sunset is not over yet." }, true);
};

async function localFixture(t, translator = translate) {
  const root = mkdtempSync(join(tmpdir(), "bilingual-publish-test-"));
  for (const section of ["essays", "engineering", "rankings"]) mkdirSync(join(root, "content", section), { recursive: true });
  const server = writingServer(root, { translator });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const base = "http://127.0.0.1:" + server.address().port;
  return { root, request: (payload, origin = "http://localhost:3000") => fetch(base + "/api/publish", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload) }) };
}

test("publish translates unsaved content and publishes both versions in one author action", async t => {
  let calls = 0;
  const { root, request } = await localFixture(t, async (...args) => { calls++; return translate(...args); });
  const response = await request(original);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.files.length, 2);
  assert.equal(calls, 1);
  for (const file of result.files) {
    assert.equal(readEntry(file.source, file.path).draft, false);
    assert.equal(readFileSync(join(root, file.path), "utf8"), file.source);
  }
  const source = result.files.find(file => file.path === original.path);
  const updated = serializeEntry({ ...entry, body: "新内容。" }, false);
  assert.equal((await request({ ...updated, sha: source.sha })).status, 200);
  assert.equal(calls, 2);
  assert.match(readFileSync(join(root, original.path), "utf8"), /新内容/);
});

test("translation failure preserves published originals and returns a visible error, not partial success", async t => {
  let calls = 0;
  const { root, request } = await localFixture(t, async () => { calls++; throw new Error("OpenAI quota or rate limit reached."); });
  const response = await request(original);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /quota/);
  assert.equal(existsSync(join(root, original.path)), false);
  assert.equal(existsSync(join(root, otherLanguagePath(original.path))), false);
  assert.equal(calls, 1);
  assert.equal((await request(original, "https://evil.example")).status, 403);
  assert.equal(calls, 1);
  writeFileSync(join(root, original.path), original.source);
  assert.equal((await request({ ...original, sha: "stale" })).status, 409);
  assert.equal(calls, 1);
  assert.equal(readFileSync(join(root, original.path), "utf8"), original.source);
});

test("publication cannot revive a trashed translation or start a paid request until restored", async t => {
  let calls = 0;
  const { root, request } = await localFixture(t, async (...args) => { calls++; return translate(...args); });
  const trashed = serializeEntry({ ...entry, language: "en", trashed: true }, true);
  writeFileSync(join(root, trashed.path), trashed.source);
  const result = await request(original);
  assert.equal(result.status, 409); assert.match((await result.json()).error, /Restore/);
  assert.equal(calls, 0);
  assert.equal(readFileSync(join(root, trashed.path), "utf8"), trashed.source);
});

test("online publishing refuses existing trashed versions before dispatch or translation", async () => {
  const trashed = serializeEntry({ ...entry, language: "en", trashed: true }, true);
  const current = { type: "file", encoding: "base64", content: encodedText(trashed.source), sha: "a".repeat(40) };
  let dispatches = 0, paid = 0;
  const adapter = githubWriter("github_pat_test", async (url, options) => {
    if (options.method === "POST") { dispatches++; return json({}); }
    return url.includes(".en.md") ? json(current) : json({}, 404);
  });
  await assert.rejects(adapter.publish(original.path, original.source), /Restore/);
  assert.equal(dispatches, 0);
  await assert.rejects(publishGithub({ ...original, token: "test-only", targetSha: current.sha, translator: async () => { paid++; return translate(original.source, original.path); }, fetcher: async url => {
    if (url.includes("/git/ref/")) return json({ object: { sha: "head" } });
    if (url.includes("/git/commits/")) return json({ tree: { sha: "tree" } });
    return url.includes(".en.md") ? json(current) : json({}, 404);
  } }), /Restore/);
  assert.equal(paid, 0);
});

test("concurrent edits and duplicate publication requests cannot overwrite work or start another paid call", async t => {
  let release; let started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const { root, request } = await localFixture(t, async (...args) => { calls++; started(); await pending; return translate(...args); });
  const first = request(original);
  await ready;
  assert.equal((await request(original)).status, 409);
  const target = otherLanguagePath(original.path);
  writeFileSync(join(root, target), "Do not overwrite this concurrent edit.");
  release();
  assert.equal((await first).status, 409);
  assert.equal(readFileSync(join(root, target), "utf8"), "Do not overwrite this concurrent edit.");
  assert.equal(existsSync(join(root, original.path)), false);
  assert.equal(calls, 1);
});

test("English-first writing requests Chinese translation and preserves its original language", async () => {
  const input = serializeEntry({ ...entry, language: "en", title: "Sunset", body: "Sunset." }, false);
  const output = await translateEntry(input.source, input.path, { apiKey: "test-only", fetcher: async (_url, options) => {
    assert.match(JSON.parse(options.body).instructions, /English personal writing into natural Simplified Chinese/);
    return json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ title: "日落", description: "", body: "日落。", commentary: "", films: [] }) }] }] });
  } });
  assert.equal(output.path, input.path.replace(".en.md", ".zh.md"));
  assert.equal(readEntry(output.source, output.path).language, "zh");
});

test("GitHub publication adds both language files in a single non-force commit", async () => {
  const head = "a".repeat(40); const commit = "b".repeat(40);
  const writes = [];
  const result = await publishGithub({ ...original, token: "test", translator: translate, fetcher: async (url, options) => {
    assert.ok(url.startsWith("https://api.github.com/repos/MingyuanRen/MingyuanRen.github.io/"));
    if (options.method !== "GET") {
      const body = JSON.parse(options.body); writes.push({ url, body });
      if (url.endsWith("/git/trees")) {
        assert.equal(body.tree.length, 2);
        for (const file of body.tree) assert.equal(readEntry(file.content, file.path).draft, false);
        return json({ sha: "tree-sha" });
      }
      if (url.endsWith("/git/commits")) { assert.deepEqual(body.parents, [head]); return json({ sha: commit }); }
      assert.deepEqual(body, { sha: commit, force: false }); return json({});
    }
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: head } });
    if (url.includes("/git/commits/")) return json({ tree: { sha: "old-tree" } });
    return json({}, 404);
  } });
  assert.equal(result.commit, commit);
  assert.equal(writes.length, 3);
});

test("GitHub changes during translation prevent any publication commit", async () => {
  let reads = 0; let writes = 0;
  await assert.rejects(publishGithub({ ...original, token: "test", translator: translate, fetcher: async (url, options) => {
    if (options.method !== "GET") writes++;
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: (++reads === 1 ? "a" : "b").repeat(40) } });
    if (url.includes("/git/commits/")) return json({ tree: { sha: "old-tree" } });
    return json({}, 404);
  } }), /repository changed/);
  assert.equal(writes, 0);
});

test("online author publishes current unsaved text with one dispatch and waits for both published versions", async () => {
  let requestId; let dispatched = false;
  const translation = await translate(original.source, original.path);
  const published = serializeEntry(readEntry(translation.source, translation.path), false);
  const writer = githubWriter("github_pat_test", async (url, options) => {
    if (url.endsWith("/dispatches")) {
      const payload = JSON.parse(options.body);
      requestId = payload.inputs.request_id;
      assert.equal(payload.inputs.source, original.source);
      assert.equal(payload.inputs.source_sha, "");
      dispatched = true;
      return new Response(null, { status: 204 });
    }
    if (url.includes("/runs?")) return json({ workflow_runs: [{ display_title: "Publish " + requestId, status: "completed", conclusion: "success" }] });
    const file = url.includes(".en.md") ? published : original;
    return dispatched ? json({ type: "file", encoding: "base64", content: encodedText(file.source), sha: "a".repeat(40) }) : json({}, 404);
  }, async () => {});
  const result = await writer.publish(original.path, original.source);
  assert.equal(result.files.length, 2);
  assert.ok(result.files.every(file => readEntry(file.source, file.path).draft === false));
});
