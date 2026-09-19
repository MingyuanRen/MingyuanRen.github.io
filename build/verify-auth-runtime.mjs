// Local workerd + Durable Object smoke test. No real credentials or outbound network.
import assert from "node:assert/strict";
import { Miniflare, Response as RuntimeResponse, convertV4MiniflareOptions } from "miniflare";
const origin = "https://writing.example.workers.dev";
const requests = [];
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "writing-test",
  modules: true, scriptPath: "dist/auth/worker.js", compatibilityDate: "2026-09-18",
  durableObjects: { SESSIONS: { className: "WritingSession", useSQLite: true } },
  bindings: { STUDIO_ORIGIN: origin, GITHUB_CLIENT_ID: "test", GITHUB_CLIENT_SECRET: "test-secret", GITHUB_USER_ID: "123", GITHUB_REPOSITORY_ID: "456", SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") },
  outboundService: async request => {
    requests.push(request.url);
    if (request.url === "https://github.com/login/oauth/access_token") return RuntimeResponse.json({ access_token: "ghu_test_only", refresh_token: "ghr_test_only", expires_in: 28800, refresh_token_expires_in: 15897600 });
    if (request.url === "https://api.github.com/user") return RuntimeResponse.json({ login: "MingyuanRen", id: 123 });
    if (request.url === "https://api.github.com/repos/MingyuanRen/MingyuanRen.github.io") return RuntimeResponse.json({ id: 456, permissions: { push: true } });
    return new RuntimeResponse("Unexpected outbound request blocked", { status: 500 });
  },
}] }));
try {
  const start = await mf.dispatchFetch(origin + "/auth/login", { redirect: "manual" });
  assert.equal(start.status, 303);
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const oauth = start.headers.getSetCookie()[0].split(";")[0];
  const callback = await mf.dispatchFetch(origin + "/auth/callback?state=" + state + "&code=fake", { redirect: "manual", headers: { Cookie: oauth } });
  assert.equal(callback.headers.get("Location"), origin + "/admin/", JSON.stringify(requests));
  const cookie = callback.headers.getSetCookie().find(value => value.startsWith("__Host-writing-session=")).split(";")[0];
  assert.doesNotMatch(cookie, /ghu_|ghr_/);
  const session = await mf.dispatchFetch(origin + "/auth/session", { headers: { Cookie: cookie } });
  assert.equal(session.status, 200);
  const { csrf } = await session.json();
  const headers = { Cookie: cookie, Origin: origin, "Content-Type": "application/json", "X-Writing-CSRF": csrf };
  const proxy = await mf.dispatchFetch(origin + "/api/github", { method: "POST", headers, body: JSON.stringify({ method: "GET", endpoint: "/user" }) });
  assert.equal(proxy.status, 200);
  assert.deepEqual(await proxy.json(), { login: "MingyuanRen" });
  assert.equal((await mf.dispatchFetch(origin + "/auth/logout", { method: "POST", headers })).status, 200);
  assert.equal((await mf.dispatchFetch(origin + "/auth/session", { headers: { Cookie: cookie } })).status, 401);
  console.log("Real local Worker/DO runtime: login, encrypted session, proxy and logout passed; all GitHub requests mocked.");
} finally { await mf.dispose(); }
