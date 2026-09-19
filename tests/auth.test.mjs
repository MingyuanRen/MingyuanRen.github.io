import test from "node:test";
import assert from "node:assert/strict";
import { WritingSession, handleRequest, seal, unseal } from "../auth/worker.mjs";
import { allowedRequest } from "../auth/policy.mjs";
import { sessionWriter, serializeEntry, encodedText } from "../lib/writing.mjs";

const origin = "https://writing.example.workers.dev";
const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const tokenData = { access_token: "ghu_test_only", refresh_token: "ghr_test_only", expires_in: 28800, refresh_token_expires_in: 15897600 };
const repo = "/repos/MingyuanRen/MingyuanRen.github.io";
const entry = serializeEntry({ section: "essays", slug: "auth-test", language: "zh", title: "Test", date: "2026-09-19", body: "测试", description: "" }, true);
const authCookie = response => response.headers.getSetCookie().find(c => c.startsWith("__Host-writing-oauth="))?.split(";")[0];

function fixture({ userId = 123, token = tokenData } = {}) {
  const objects = new Map(); const calls = [];
  const env = { STUDIO_ORIGIN: origin, GITHUB_CLIENT_ID: "test_client", GITHUB_CLIENT_SECRET: "test_secret", GITHUB_USER_ID: "123", GITHUB_REPOSITORY_ID: "456", SESSION_ENCRYPTION_KEY: encryptionKey };
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, "manual");
    if (url === "https://github.com/login/oauth/access_token") return Response.json(token);
    if (url === "https://api.github.com/user") return Response.json({ id: userId, login: "MingyuanRen" });
    if (url === "https://api.github.com" + repo) return Response.json({ id: 456, permissions: { push: true } });
    if (url === "https://mingyuanren.github.io/admin/") return new Response("<html><head></head><body>Write</body></html>", { headers: { "Content-Type": "text/html" } });
    if (url.startsWith("https://api.github.com" + repo + "/contents/")) return Response.json({ content: { sha: "new-sha" }, commit: { sha: "commit" } });
    throw new Error("Unexpected test request");
  };
  env.SESSIONS = { idFromName: name => name, get: id => {
    if (!objects.has(id)) {
      const values = new Map();
      const storage = { get: async key => values.get(key), put: async (key, value) => values.set(key, value), deleteAll: async () => values.clear(), setAlarm: async () => {} };
      const object = new WritingSession({ storage }, env); object.fetcher = fetcher;
      objects.set(id, { object, values });
    }
    return objects.get(id).object;
  } };
  const request = (path, options = {}) => handleRequest(new Request(origin + path, options), env, fetcher);
  async function login() {
    const start = await request("/auth/login");
    const state = new URL(start.headers.get("Location")).searchParams.get("state");
    const result = await request("/auth/callback?state=" + state + "&code=test_code", { headers: { Cookie: authCookie(start) } });
    const cookie = result.headers.getSetCookie().find(c => c.startsWith("__Host-writing-session="))?.split(";")[0];
    return { start, state, result, cookie };
  }
  return { env, objects, calls, request, login };
}

test("GitHub sign-in binds state and PKCE, stores encrypted credentials and reuses an HttpOnly session", async () => {
  const f = fixture(); const { start, state, result, cookie } = await f.login();
  assert.equal(new URL(start.headers.get("Location")).searchParams.get("code_challenge_method"), "S256");
  assert.equal(result.headers.get("Location"), origin + "/admin/");
  assert.match(result.headers.getSetCookie().join(";"), /Max-Age=2592000; Secure; HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(result.headers.getSetCookie().join(";"), /ghu_|ghr_/);
  assert.ok(f.calls.find(c => c.url.endsWith("access_token")).options.body.includes("code_verifier"));
  const session = await f.request("/auth/session", { headers: { Cookie: cookie } });
  const data = await session.json();
  assert.equal(data.login, "MingyuanRen"); assert.equal(typeof data.csrf, "string");
  assert.doesNotMatch(JSON.stringify(data), /ghu_|ghr_|test_secret/);
  for (const { values } of f.objects.values()) assert.doesNotMatch(JSON.stringify([...values]), /ghu_|ghr_|test_secret/);
  assert.equal((await f.request("/auth/session", { headers: { Cookie: cookie } })).status, 200);
  const replay = await f.request("/auth/callback?state=" + state + "&code=test_code", { headers: { Cookie: authCookie(start) } });
  assert.match(replay.headers.get("Location"), /signin=failed/);
});

test("sign-in rejects state mismatch, wrong account and non-expiring credentials", async () => {
  const f = fixture(); const start = await f.request("/auth/login");
  const response = await f.request("/auth/callback?state=" + "x".repeat(43) + "&code=bad", { headers: { Cookie: authCookie(start) } });
  assert.match(response.headers.get("Location"), /signin=failed/); assert.equal(f.calls.length, 0);
  assert.equal((await fixture({ userId: 999 }).login()).cookie, undefined);
  assert.equal((await fixture({ token: { access_token: "ghu_test_only" } }).login()).cookie, undefined);
});

test("authenticated requests require same origin and CSRF; logout revokes the stored session", async () => {
  const f = fixture(); const { cookie } = await f.login();
  const { csrf } = await (await f.request("/auth/session", { headers: { Cookie: cookie } })).json();
  const headers = { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Writing-CSRF": csrf };
  const body = JSON.stringify({ method: "GET", endpoint: "/user" });
  for (const changed of [{ Origin: "https://evil.example" }, { "X-Writing-CSRF": "wrong" }, { "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await f.request("/api/github", { method: "POST", headers: { ...headers, ...changed }, body })).status, 403);
  }
  assert.equal((await f.request("/api/github", { method: "POST", headers, body })).status, 200);
  const logout = await f.request("/auth/logout", { method: "POST", headers });
  assert.equal(logout.status, 200); assert.match(logout.headers.get("Set-Cookie"), /Max-Age=0/);
  assert.equal((await f.request("/auth/session", { headers: { Cookie: cookie } })).status, 401);
});

test("simultaneous requests rotate an expired access token only once; absolute expiry stays fixed", async () => {
  const f = fixture(); const { cookie } = await f.login();
  const id = cookie.split("=")[1]; const { object, values } = f.objects.get(id);
  const original = await unseal(values.get("sealed"), encryptionKey);
  await object.save({ ...original, tokenExpires: 0 });
  const request = () => f.request("/api/github", { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Writing-CSRF": original.csrf }, body: JSON.stringify({ method: "GET", endpoint: "/user" }) });
  const responses = await Promise.all([request(), request(), request()]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(f.calls.filter(c => c.url.endsWith("access_token")).length, 2); // initial exchange + one renewal
  assert.equal((await unseal(values.get("sealed"), encryptionKey)).expires, original.expires);
  await object.save({ ...original, expires: Date.now() - 1 });
  assert.equal((await request()).status, 401);
});

test("credential encryption detects tampering and proxy allowlist blocks arbitrary writes", async () => {
  const encrypted = await seal({ value: "secret" }, encryptionKey);
  await assert.rejects(unseal({ ...encrypted, data: encrypted.data.slice(0, -5) + "AAAA=" }, encryptionKey));
  for (const operation of [
    { method: "GET", endpoint: "https://evil.example" },
    { method: "GET", endpoint: "/repos/somebody/private" },
    { method: "DELETE", endpoint: repo + "/contents/" + entry.path },
    { method: "PUT", endpoint: repo + "/contents/.github/workflows/pages.yml", body: {} },
    { method: "POST", endpoint: repo + "/actions/workflows/pages.yml/dispatches", body: {} },
    { method: "GET", endpoint: repo + "/contents/content/essays?ref=other" },
    { method: "GET", endpoint: repo + "/contents/content%2Fessays?ref=main" },
  ]) assert.throws(() => allowedRequest(operation));
  const permitted = { method: "PUT", endpoint: repo + "/contents/" + entry.path,
    body: { branch: "main", message: "Write", content: encodedText(entry.source), sha: "a".repeat(40) } };
  assert.deepEqual(allowedRequest(permitted), permitted);
  assert.throws(() => allowedRequest({ ...permitted, body: { ...permitted.body, branch: "other" } }));
});

test("failed renewal invalidates the session without replaying a refresh or write", async () => {
  const f = fixture(); const { cookie } = await f.login();
  const { object, values } = f.objects.get(cookie.split("=")[1]);
  const data = await unseal(values.get("sealed"), encryptionKey);
  await object.save({ ...data, tokenExpires: 0 });
  let attempts = 0;
  object.fetcher = async url => {
    assert.equal(url, "https://github.com/login/oauth/access_token");
    attempts++;
    return new Response(null, { status: 401 });
  };
  const options = { method: "POST", headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Writing-CSRF": data.csrf },
    body: JSON.stringify({ method: "PUT", endpoint: repo + "/contents/" + entry.path,
      body: { branch: "main", message: "Write", content: encodedText(entry.source) } }) };
  assert.equal((await f.request("/api/github", options)).status, 401);
  assert.equal((await f.request("/api/github", options)).status, 401);
  assert.equal(attempts, 1);
  assert.equal(values.size, 0);
});

test("static editor proxy never forwards cookies, restricts upstream, and enables same-origin mode", async () => {
  const f = fixture();
  const response = await f.request("/admin/?token=must-not-forward", { headers: { Cookie: "private-cookie=secret" } });
  assert.match(await response.text(), /meta name="writing-session"/);
  assert.equal(f.calls[0].url, "https://mingyuanren.github.io/admin/");
  assert.equal(f.calls[0].options.headers, undefined);
  assert.equal((await f.request("/auth/session")).status, 401);
  assert.equal((await handleRequest(new Request("https://other.example/auth/login"), f.env)).status, 403);
  await assert.rejects(handleRequest(new Request(origin + "/admin/"), f.env, async () =>
    new Response(null, { status: 302, headers: { Location: "https://other.example/" } })), /Unexpected editor redirect/);
});

test("browser session adapter sends no GitHub token and can restore connection without user input", async () => {
  const calls = [];
  const writer = sessionWriter(async (path, options) => {
    calls.push(path); assert.equal(options.credentials, "same-origin");
    assert.equal(options.headers?.Authorization, undefined);
    if (path === "/auth/session") return Response.json({ login: "MingyuanRen", csrf: "test-csrf" });
    assert.equal(options.headers["X-Writing-CSRF"], "test-csrf");
    if (path === "/auth/logout") return Response.json({ ok: true });
    assert.equal(path, "/api/github");
    const body = JSON.parse(options.body);
    if (body.endpoint === "/user") return Response.json({ login: "MingyuanRen" });
    return Response.json({ permissions: { push: true } });
  });
  assert.equal(await writer.connect(), "MingyuanRen");
  assert.equal(calls.filter(c => c === "/auth/session").length, 1);
  await writer.logout(); await assert.rejects(writer.connect(), /disconnected/);
});

test("movie search is owner-session and CSRF protected, has no GitHub proxy access and is rate limited", async () => {
  const f = fixture();
  const body = JSON.stringify({ action: "search", query: "电影" });
  const headers = { Origin: origin, "Content-Type": "application/json" };
  assert.equal((await f.request("/api/movies", { method: "POST", headers, body })).status, 401);
  const { cookie } = await f.login();
  const { csrf } = await (await f.request("/auth/session", { headers: { Cookie: cookie } })).json();
  const request = changed => f.request("/api/movies", { method: "POST", headers: { ...headers, Cookie: cookie, "X-Writing-CSRF": csrf, ...changed }, body });
  assert.equal((await request({ Origin: "https://evil.example" })).status, 403);
  assert.equal((await request({ "X-Writing-CSRF": "bad" })).status, 403);
  // Missing provider key is visible but leaves the GitHub session intact.
  assert.equal((await request()).status, 503);
  f.env.TMDB_READ_ACCESS_TOKEN = "test-only-tmdb";
  const { object } = f.objects.get(cookie.split("=")[1]);
  object.fetcher = async (url, options) => {
    assert.ok(url.startsWith("https://api.themoviedb.org/3/search/movie?"));
    assert.equal(options.headers.Authorization, "Bearer test-only-tmdb");
    return Response.json({ results: [], total_pages: 1 });
  };
  assert.equal((await request()).status, 200);
  object.movieRequests = 30;
  assert.equal((await request()).status, 429);
  assert.equal((await f.request("/auth/session", { headers: { Cookie: cookie } })).status, 200);
});
