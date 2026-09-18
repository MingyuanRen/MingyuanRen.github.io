import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateGallery, parseGallery, serializeGallery, emptyGallery, galleryPath } from "../lib/pictures.mjs";
import { githubWriter, encodedText } from "../lib/writing.mjs";
import { writingServer } from "../build/writing-server.mjs";

const picture = { id: "11111111-1111-1111-1111-111111111111", image: "/uploads/22222222-2222-2222-2222-222222222222.jpg", alt: "电影截图", caption: "日落中的一帧。" };
const gallery = { version: 1, items: [picture] };

test("pictures preserve ordering and optional text, reject invalid paths and oversized collections", () => {
  assert.deepEqual(parseGallery(serializeGallery(gallery)), gallery);
  assert.deepEqual(validateGallery(emptyGallery()), { version: 1, items: [] });
  const second = { ...picture, id: "33333333-3333-3333-3333-333333333333", alt: "", caption: "" };
  assert.deepEqual(validateGallery({ version: 1, items: [second, picture] }).items, [second, picture]);
  for (const image of ["https://example.com/photo.jpg", "/uploads/../secret.jpg", "javascript:alert(1)", "/uploads/22222222-2222-2222-2222-222222222222.svg"]) {
    assert.throws(() => validateGallery({ version: 1, items: [{ ...picture, image }] }));
  }
  assert.throws(() => validateGallery({ version: 1, items: [picture, picture] }));
  assert.throws(() => validateGallery({ version: 1, items: [{ ...picture, caption: "a".repeat(2001) }] }));
  assert.throws(() => validateGallery({ version: 1, items: Array(201).fill(picture) }));
  assert.throws(() => parseGallery("{}"));
});

test("local picture saving persists a collection, detects stale edits and never translates", async t => {
  const root = mkdtempSync(join(tmpdir(), "picture-test-"));
  mkdirSync(join(root, "content/pictures"), { recursive: true });
  let translations = 0;
  const server = writingServer(root, { translator: () => { translations++; throw new Error("Must not translate pictures"); } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (body, origin = "http://localhost:3000") => fetch(base + "/api/gallery", {
    method: body ? "PUT" : "GET", headers: { Origin: origin, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.deepEqual(await (await request()).json(), { gallery: emptyGallery() });
  const saved = await request({ gallery }); assert.equal(saved.status, 200);
  const { sha } = await saved.json();
  assert.deepEqual((await (await request()).json()).gallery, gallery);
  assert.equal((await request({ gallery, sha: "stale" })).status, 409);
  assert.equal((await request({ gallery }, "https://evil.example")).status, 403);
  assert.equal((await request({ gallery: { version: 1, items: [{ ...picture, image: "../oops.png" }] }, sha })).status, 400);
  assert.equal(readFileSync(join(root, galleryPath), "utf8"), serializeGallery(gallery));
  assert.equal((await request({ gallery: emptyGallery(), sha })).status, 200);
  assert.deepEqual(parseGallery(readFileSync(join(root, galleryPath), "utf8")), emptyGallery());
  assert.equal(translations, 0);
});

test("local picture collection cannot escape through a linked directory", async t => {
  const root = mkdtempSync(join(tmpdir(), "picture-links-test-"));
  mkdirSync(join(root, "content")); mkdirSync(join(root, "outside"));
  symlinkSync(join(root, "outside"), join(root, "content/pictures"));
  const server = writingServer(root, { apiKey: "" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/gallery", { headers: { Origin: "http://localhost:3000" } });
  assert.equal(response.status, 400);
});

test("GitHub picture collection uses its fixed path and revision, without workflow dispatch", async () => {
  const calls = [];
  const writer = githubWriter("github_pat_test_only", async (url, options) => {
    calls.push(url);
    assert.equal(url, "https://api.github.com/repos/MingyuanRen/MingyuanRen.github.io/contents/" + galleryPath + (options.method === "PUT" ? "" : "?ref=main"));
    assert.equal(options.redirect, "error");
    if (options.method === "PUT") {
      const body = JSON.parse(options.body);
      assert.equal(body.sha, "old-sha"); assert.equal(body.branch, "main");
      assert.deepEqual(parseGallery(Buffer.from(body.content, "base64").toString("utf8")), gallery);
      return Response.json({ content: { sha: "new-sha" } });
    }
    return Response.json({ type: "file", encoding: "base64", sha: "old-sha", content: encodedText(serializeGallery(gallery)) });
  });
  assert.deepEqual(await writer.readGallery(), { gallery, sha: "old-sha" });
  assert.deepEqual(await writer.saveGallery(gallery, "old-sha"), { sha: "new-sha" });
  assert.equal(calls.length, 2);
  const absent = githubWriter("github_pat_test_only", async () => Response.json({}, { status: 404 }));
  assert.deepEqual(await absent.readGallery(), { gallery: emptyGallery() });
  const conflict = githubWriter("github_pat_test_only", async () => Response.json({}, { status: 409 }));
  await assert.rejects(conflict.saveGallery(gallery, "stale"));
});
