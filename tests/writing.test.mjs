import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writingServer } from "../build/writing-server.mjs";
import { decodedText, encodedText, githubWriter, localWriter, readEntry, serializeEntry, validPostPath, imageExtension } from "../lib/writing.mjs";

const entry = { section: "essays", slug: "测试-note", language: "zh", title: "中文: draft: true", date: "2026-09-17", description: "电影", body: "# Hello\n\n你好，世界。", draft: true };
const result = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("article serialization preserves Chinese, validates drafts, and prevents path traversal", () => {
  const { path, source } = serializeEntry(entry, false);
  assert.deepEqual(readEntry(source, path), { ...entry, body: entry.body + "\n", draft: false });
  assert.equal(decodedText(encodedText(source)), source);
  assert.throws(() => serializeEntry({ ...entry, date: "2026-02-31" }, true), /Date/);
  for (const path of ["content/essays/../secret.zh.md", "content/essays/a.zh.md/extra", ".github/workflows/main.yml", "content/essays/test.en.mdx"]) assert.equal(validPostPath(path), false);
  assert.throws(() => imageExtension(new TextEncoder().encode("<svg><script>alert(1)</script></svg>")), /SVG/);
});

test("GitHub adapter sends UTF-8 content and the original SHA only to the fixed repository", async () => {
  const calls = [];
  const adapter = githubWriter("github_pat_test_only", async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/user")) return result({ login: "MingyuanRen" });
    if (url.endsWith(".github.io")) return result({ permissions: { push: true } });
    if (options.method === "PUT") return result({ content: { sha: "new-sha" }, commit: { sha: "commit" } });
    return result({ type: "file", encoding: "base64", content: encodedText("中文"), sha: "original-sha" });
  });
  assert.equal(await adapter.connect(), "MingyuanRen");
  const { path, source } = serializeEntry(entry, false);
  assert.deepEqual(await adapter.read(path), { source: "中文", sha: "original-sha" });
  assert.deepEqual(await adapter.save(path, source, "original-sha"), { sha: "new-sha", commit: "commit" });
  const payload = JSON.parse(calls.at(-1).options.body);
  assert.equal(payload.sha, "original-sha");
  assert.equal(payload.branch, "main");
  assert.equal(decodedText(payload.content), source);
  for (const { url, options } of calls) {
    assert.ok(url.startsWith("https://api.github.com/"));
    assert.ok(!url.includes("github_pat_"));
    assert.equal(options.redirect, "error");
    assert.equal(options.credentials, "omit");
  }
  await assert.rejects(adapter.save(".github/workflows/evil.yml", source), /路径/);
  adapter.disconnect();
  await assert.rejects(adapter.list(), /断开/);
});

test("failed auth, stale revisions and missing local service fail without a fallback write", async () => {
  assert.throws(() => githubWriter("ghp_legacy"), /Fine-grained/);
  await assert.rejects(githubWriter("github_pat_test", async () => result({ login: "another-user" })).connect(), /MingyuanRen/);
  for (const status of [401, 403, 409, 422]) {
    let calls = 0;
    const adapter = githubWriter("github_pat_test", async () => { calls++; return result({}, status); });
    const { path, source } = serializeEntry(entry, false);
    await assert.rejects(adapter.save(path, source, "stale"), error => error.status === status);
    assert.equal(calls, 1);
  }
  const local = localWriter(async url => { assert.ok(url.startsWith("http://127.0.0.1:8081/")); throw new Error("offline"); });
  await assert.rejects(local.connect(), /不会自动连接线上/);
});

test("local writer saves, detects conflicts, and rejects foreign origins, unsafe paths and symlinks", async t => {
  const root = mkdtempSync(join(tmpdir(), "personal-writing-test-"));
  for (const path of ["content/engineering", "content/essays", "content/rankings", "site-public/uploads"]) mkdirSync(join(root, path), { recursive: true });
  const server = writingServer(root);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (path, body, origin = "http://localhost:3000") => fetch(base + path, { method: body ? "PUT" : "GET", headers: { Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const { path, source } = serializeEntry(entry, true);
  assert.equal((await request("/api/post", { path, source }, "https://evil.example")).status, 403);
  assert.equal((await fetch(base + "/api/posts")).status, 403);
  assert.equal((await request("/api/post", { path: "../outside.zh.md", source })).status, 400);
  const first = await request("/api/post", { path, source });
  assert.equal(first.status, 200);
  const saved = await first.json();
  assert.equal(readFileSync(join(root, path), "utf8"), source);
  assert.equal((await request("/api/post", { path, source })).status, 409);
  assert.equal((await request("/api/post", { path, source, sha: "stale" })).status, 409);
  assert.equal((await request("/api/post", { path, source: serializeEntry(entry, false).source, sha: saved.sha })).status, 200);
  assert.equal((await (await request("/api/posts")).json()).length, 1);
  writeFileSync(join(root, "private.txt"), "private");
  symlinkSync(join(root, "private.txt"), join(root, "content/essays/link.zh.md"));
  assert.equal((await request("/api/post?path=content/essays/link.zh.md")).status, 400);
  assert.equal((await request("/api/post", { path: "content/essays/link.zh.md", source })).status, 400);
  assert.equal(readFileSync(join(root, "private.txt"), "utf8"), "private");
  assert.equal((await request("/api/image", { path: "site-public/uploads/00000000-0000-0000-0000-000000000000.png", content: encodedText("<svg/>") })).status, 400);
  const imagePath = "site-public/uploads/00000000-0000-0000-0000-000000000000.png";
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJO8AAAAASUVORK5CYII=";
  const image = await request("/api/image", { path: imagePath, content: png });
  assert.equal(image.status, 201);
  assert.equal((await image.json()).url, "/uploads/00000000-0000-0000-0000-000000000000.png");
  assert.equal(readFileSync(join(root, imagePath)).toString("base64"), png);
  assert.equal((await request("/api/image", { path: imagePath, content: png })).status, 409);
});
