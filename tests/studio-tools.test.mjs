import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveBackup, readBackups, removeBackup } from "../lib/browser-drafts.mjs";
import { presentation } from "../lib/post-order.mjs";
import { publishProgress } from "../lib/publish-progress.mjs";
import { serializeEntry, readEntry, githubWriter, encodedText } from "../lib/writing.mjs";
import { publishedPosts } from "../lib/markdown.mjs";
import { changePresentation } from "../lib/writing-library.mjs";
import { allowedRequest } from "../auth/policy.mjs";
import { writingServer } from "../build/writing-server.mjs";

const entry = { section: "engineering", slug: "example", language: "zh", date: "2026-09-20", title: "Example", body: "First\nSecond", description: "", draft: false };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function storage() {
  const values = new Map();
  return { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test("browser backups preserve unfinished writing and revisions without erasing unrelated storage", () => {
  const store = storage(); store.setItem("other", "untouched");
  const item = { id: crypto.randomUUID(), updatedAt: 1, entry: { ...entry, title: "", slug: "" }, opened: null };
  saveBackup(store, item);
  assert.deepEqual(readBackups(store), [item]);
  saveBackup(store, { ...item, updatedAt: 2, entry: { ...item.entry, body: "New text" } });
  assert.equal(readBackups(store).length, 1);
  assert.equal(readBackups(store)[0].entry.body, "New text");
  assert.throws(() => saveBackup({ ...store, setItem: () => { throw new Error("Quota exceeded"); } }, item), /Quota/);
  assert.throws(() => saveBackup(store, { ...item, opened: { path: "../private", sha: "a" } }), /revision/);
  removeBackup(store, item.id);
  assert.deepEqual(readBackups(store), []); assert.equal(store.getItem("other"), "untouched");
});

test("pinning and order sort readers' lists and metadata-only saves preserve text and publication status", async () => {
  const sources = Object.fromEntries([{ ...entry, slug: "default" }, { ...entry, slug: "order", order: 1 }, { ...entry, slug: "pinned", pinned: true, order: 9 }].map(item => { const file = serializeEntry(item, false); return [file.path, file.source]; }));
  assert.deepEqual(publishedPosts(sources).map(post => post.slug), ["pinned", "order", "default"]);
  for (const order of [-1, 0.5, "1", Infinity, 1000000]) assert.throws(() => presentation({ order }));
  assert.throws(() => presentation({ pinned: "yes" }));
  const files = ["zh", "en"].map(language => ({ ...serializeEntry({ ...entry, language }, false), sha: language }));
  const writes = [];
  const result = await changePresentation({ read: async path => files.find(file => file.path === path), save: async (path, source, sha) => { writes.push({ path, source, sha }); return { sha: "next" }; } }, files, { pinned: true, order: 2 });
  assert.equal(result.saved.length, 2);
  for (const file of writes) { const value = readEntry(file.source, file.path); assert.equal(value.pinned, true); assert.equal(value.order, 2); assert.equal(value.draft, false); assert.equal(value.body.trimEnd(), entry.body); }
});

test("publication status distinguishes queued, translating, saved/deploying, live and deployment failure", () => {
  const run = { id: 123, status: "in_progress" };
  assert.equal(publishProgress(run).stage, "queued");
  assert.equal(publishProgress(run, [{ name: "publish", steps: [{ name: "Translate and commit both versions", status: "in_progress" }] }]).stage, "translating");
  assert.equal(publishProgress(run, [{ name: "publish", conclusion: "success" }]).stage, "deploying");
  assert.equal(publishProgress({ ...run, status: "completed", conclusion: "success" }).stage, "live");
  assert.match(publishProgress({ ...run, status: "completed", conclusion: "failure" }, [{ name: "publish", conclusion: "success" }]).label, /Writing saved/);
  assert.equal(publishProgress({ id: "https://evil.example" }).url, undefined);
});

test("new studio reads are restricted to the fixed upload folder and workflow job metadata", () => {
  const base = "/repos/MingyuanRen/MingyuanRen.github.io";
  for (const endpoint of [base + "/contents/site-public/uploads?ref=main", base + "/actions/runs/123/jobs?per_page=100"]) assert.equal(allowedRequest({ endpoint, method: "GET" }).endpoint, endpoint);
  for (const endpoint of [base + "/contents/.env.images?ref=main", base + "/actions/runs/123/logs", base + "/actions/runs/123/jobs?per_page=100&extra=1"]) assert.throws(() => allowedRequest({ endpoint, method: "GET" }));
});

test("local image reuse lists only validated files, omits links and never writes", async t => {
  const root = mkdtempSync(join(tmpdir(), "studio-images-"));
  mkdirSync(join(root, "site-public/uploads"), { recursive: true });
  const name = "tmdb-843-11111111-1111-1111-1111-111111111111.jpg";
  writeFileSync(join(root, "site-public/uploads", name), "fixture");
  writeFileSync(join(root, "secret.txt"), "private");
  symlinkSync(join(root, "secret.txt"), join(root, "site-public/uploads/22222222-2222-2222-2222-222222222222.jpg"));
  const server = writingServer(root);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${server.address().port}/api/images`;
  assert.equal((await fetch(url)).status, 403);
  const result = await (await fetch(url, { headers: { Origin: "http://localhost:3000" } })).json();
  assert.deepEqual(result.images.map(item => item.image), ["/uploads/" + name]);
});

test("GitHub publication reports real workflow stages without repeating dispatch", async () => {
  let requestId, polls = 0, dispatches = 0;
  const original = serializeEntry(entry, false), english = serializeEntry({ ...entry, language: "en" }, false), phases = [];
  const writer = githubWriter("github_pat_test", async (url, options) => {
    if (url.endsWith("/dispatches")) { dispatches++; requestId = JSON.parse(options.body).inputs.request_id; return new Response(null, { status: 204 }); }
    if (url.includes("/runs?")) { polls++; return json({ workflow_runs: [{ id: 123, display_title: "Publish " + requestId, status: polls < 3 ? "in_progress" : "completed", conclusion: polls < 3 ? null : "success" }] }); }
    if (url.includes("/jobs?")) return json({ jobs: [{ name: "publish", conclusion: polls >= 2 ? "success" : null, steps: [{ name: "Translate and commit both versions", status: "in_progress" }] }] });
    const file = url.includes(".en.md") ? english : original;
    return dispatches ? json({ type: "file", encoding: "base64", content: encodedText(file.source), sha: "a".repeat(40) }) : json({}, 404);
  }, async () => {});
  await writer.publish(original.path, original.source, undefined, progress => phases.push(progress.stage));
  assert.deepEqual(phases, ["checking", "queued", "translating", "deploying", "live"]); assert.equal(dispatches, 1);
});
