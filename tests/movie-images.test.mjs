import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { movieImages } from "../lib/movie-images.mjs";
import { validateRanking } from "../lib/rankings.mjs";
import { writingServer } from "../build/writing-server.mjs";
import { serializeEntry, readEntry, sessionWriter, localWriter } from "../lib/writing.mjs";

const token = "tmdb-test-only";
const poster = { file_path: "/Poster123.jpg", width: 2000, height: 3000, iso_639_1: "zh" };
const backdrop = { file_path: "/Still123.jpg", width: 3840, height: 2160, iso_639_1: null };
const input = { action: "download", movieId: 204, path: poster.file_path, kind: "poster" };
const json = data => Response.json(data);

test("movie search validates inputs before network and exposes no provider credentials", async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++; const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.themoviedb.org");
    assert.equal(parsed.pathname, "/3/search/movie");
    assert.equal(parsed.searchParams.get("query"), "花样年华 & love");
    assert.equal(parsed.searchParams.get("include_adult"), "false");
    assert.equal(options.headers.Authorization, "Bearer " + token);
    assert.equal(options.redirect, "manual");
    return json({ total_pages: 100, results: [
      { id: 204, title: "花样年华", original_title: "In the Mood for Love", release_date: "2000-01-01", poster_path: poster.file_path },
      { id: 2, adult: true }, { id: "../secret" },
      { id: 3, title: "No poster", poster_path: "https://evil.example/x.jpg" },
    ] });
  };
  const result = await movieImages({ action: "search", query: "花样年华 & love" }, { token, fetcher });
  assert.equal(result.pages, 20); assert.equal(result.movies.length, 2);
  assert.equal(result.movies[0].thumbnail, "https://image.tmdb.org/t/p/w185/Poster123.jpg");
  assert.equal(result.movies[1].thumbnail, null);
  assert.ok(!JSON.stringify(result).includes(token));
  for (const bad of [null, { action: "search", query: " " }, { action: "search", query: "x", page: 0 }, { action: "images", movieId: "204" }, { ...input, path: "//evil.example/a.jpg" }, { ...input, url: "http://localhost" }]) {
    await assert.rejects(movieImages(bad, { token, fetcher }), { status: 400 });
  }
  await assert.rejects(movieImages({ action: "search", query: "test" }, { fetcher }), { status: 503 });
  assert.equal(calls, 1);
});

test("images expose real dimensions, separate types and exclude unsafe or malformed paths", async () => {
  const result = await movieImages({ action: "images", movieId: 204 }, { token, fetcher: async url => {
    assert.equal(url, "https://api.themoviedb.org/3/movie/204/images");
    return json({ posters: [poster, { ...poster, file_path: "/../secret.jpg" }, { ...poster, width: -2 }], backdrops: [backdrop] });
  } });
  assert.deepEqual(result.images.map(i => [i.kind, i.width, i.height]), [["backdrop", 3840, 2160], ["poster", 2000, 3000]]);
});

test("import rechecks film membership, bounds downloads and never forwards token to image CDN", async () => {
  const calls = [];
  const result = await movieImages(input, { token, fetcher: async (url, options) => {
    calls.push(url);
    if (url.startsWith("https://api.themoviedb.org/")) return json({ posters: [poster] });
    assert.deepEqual(options.headers, {}); assert.equal(options.redirect, "manual");
    if (url.includes("/original/")) return new Response("too big", { headers: { "Content-Length": "9000000" } });
    assert.equal(url, "https://image.tmdb.org/t/p/w780/Poster123.jpg");
    return new Response(new Uint8Array([255, 216, 255, 224]));
  } });
  assert.equal(result.resized, true); assert.equal(result.extension, "jpg"); assert.equal(calls.length, 3);
  await assert.rejects(movieImages({ ...input, path: "/Missing.jpg" }, { token, fetcher: async () => json({ posters: [poster] }) }), { status: 400 });
  for (const status of [302, 401, 429, 500]) {
    await assert.rejects(movieImages({ action: "search", query: "test" }, { token, fetcher: async () => new Response("provider secret detail", { status }) }), error => !error.message.includes("secret detail"));
  }
  await assert.rejects(movieImages(input, { token, fetcher: async url => url.includes("api.themoviedb") ? json({ posters: [poster] }) : new Response("<html>Not an image</html>") }), { status: 502 });
});

test("TMDB provenance round-trips without weakening ranking image path rules", () => {
  const item = { id: "movie-204", title: "电影", image: "/uploads/11111111-1111-1111-1111-111111111111.jpg", tier: "s", reason: "好", tmdbId: 204 };
  const ranking = { version: 1, items: [item] };
  assert.deepEqual(validateRanking(ranking), ranking);
  const saved = serializeEntry({ title: "电影", section: "rankings", slug: "movies", date: "2026-09-19", language: "zh", description: "", body: "", ranking }, true);
  assert.equal(readEntry(saved.source, saved.path).ranking.items[0].tmdbId, 204);
  for (const tmdbId of [0, -1, "204", 3.5, "javascript:alert(1)"]) assert.throws(() => validateRanking({ ...ranking, items: [{ ...item, tmdbId }] }));
  assert.throws(() => validateRanking({ ...ranking, items: [{ ...item, image: "https://image.tmdb.org/t/p/original/Poster123.jpg" }] }));
});

test("local search is origin protected, bounded, and never saves images or calls translation", async t => {
  const root = mkdtempSync(join(tmpdir(), "movie-search-test-")); let requests = 0;
  const server = writingServer(root, { movieToken: token, translator: () => assert.fail("No translation"), movieProvider: async (body, options) => {
    requests++; assert.equal(options.token, token); assert.equal(body.action, "search"); return { movies: [] };
  } });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(root, { recursive: true, force: true }); });
  const endpoint = `http://127.0.0.1:${server.address().port}/api/movies`;
  const request = (body, origin = "http://localhost:3000") => fetch(endpoint, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await request({ action: "search", query: "test" })).status, 200);
  assert.equal((await request({ action: "search", query: "test" }, "https://evil.example")).status, 403);
  assert.equal((await request({ action: "search", query: "x".repeat(2100) })).status, 413);
  assert.equal(requests, 1); assert.deepEqual(readdirSync(root), []);
});

test("both writer adapters route search separately from publication and credentials stay server-side", async () => {
  const request = { action: "images", movieId: 204 };
  const local = localWriter(async (url, options) => {
    assert.equal(url, "http://127.0.0.1:8081/api/movies"); assert.equal(options.credentials, "omit");
    assert.deepEqual(JSON.parse(options.body), request); return json({ images: [] });
  });
  assert.deepEqual(await local.movies(request), { images: [] });
  const online = sessionWriter(async (url, options) => {
    if (url === "/auth/session") return json({ login: "MingyuanRen", csrf: "test-only" });
    assert.equal(url, "/api/movies"); assert.equal(options.headers["X-Writing-CSRF"], "test-only");
    assert.equal(options.headers.Authorization, undefined); return json({ images: [] });
  });
  assert.deepEqual(await online.movies(request), { images: [] });
});
