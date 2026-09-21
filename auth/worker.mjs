import { allowedRequest } from "./policy.mjs";
import { movieImages } from "../lib/movie-images.mjs";
import { validRankingImage } from "../lib/rankings.mjs";

const SITE = "https://mingyuanren.github.io";
const REPO = "/repos/MingyuanRen/MingyuanRen.github.io";
const SESSION = "__Host-writing-session";
const OAUTH = "__Host-writing-oauth";
const MONTH = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const base64 = bytes => btoa(String.fromCharCode(...bytes));
const unbase64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));
const random = () => base64(crypto.getRandomValues(new Uint8Array(32))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const cookie = (name, value, seconds) => `${name}=${value}; Path=/; Max-Age=${seconds}; Secure; HttpOnly; SameSite=Lax`;
const readCookie = (request, name) => (request.headers.get("Cookie") || "").split(/;\s*/).find(value => value.startsWith(name + "="))?.slice(name.length + 1) || "";
const validId = value => /^[A-Za-z0-9_-]{43}$/.test(value || "");
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const redirect = (url, cookies = []) => {
  const headers = new Headers({ Location: url, "Cache-Control": "no-store" });
  cookies.forEach(value => headers.append("Set-Cookie", value));
  return new Response(null, { status: 303, headers });
};

export async function seal(value, secret) {
  const key = await crypto.subtle.importKey("raw", unbase64(secret), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(JSON.stringify(value)));
  return { iv: base64(iv), data: base64(new Uint8Array(data)) };
}
export async function unseal(value, secret) {
  const key = await crypto.subtle.importKey("raw", unbase64(secret), "AES-GCM", false, ["decrypt"]);
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(value.iv) }, key, unbase64(value.data));
  return JSON.parse(new TextDecoder().decode(data));
}
async function readBody(request, max = 7_100_000) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail(415, "JSON required.");
  if (Number(request.headers.get("Content-Length")) > max) fail(413, "Request too large.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Missing request.");
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); fail(413, "Request too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function tokenExchange(env, fields, fetcher) {
  const response = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, ...fields }),
  });
  if (!response.ok) fail(401, "GitHub sign-in expired. Please sign in again.");
  const data = await response.json();
  // Require expiring GitHub App tokens; do not silently accept broad OAuth/PAT credentials.
  if (!data.access_token?.startsWith("ghu_") || !data.refresh_token?.startsWith("ghr_") ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0 || data.expires_in > 28800 ||
      !Number.isFinite(data.refresh_token_expires_in) || data.refresh_token_expires_in <= 0) {
    fail(401, "GitHub sign-in failed. Enable expiring user tokens on the GitHub App.");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token,
    tokenExpires: Date.now() + data.expires_in * 1000, refreshExpires: Date.now() + data.refresh_token_expires_in * 1000 };
}
async function github(endpoint, token, options = {}, fetcher = fetch) {
  return fetcher("https://api.github.com" + endpoint, { ...options, redirect: "manual", signal: AbortSignal.timeout(20_000),
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "Mingyuan-writing", "X-GitHub-Api-Version": "2022-11-28" } });
}

// One Durable Object per opaque browser session. Queue refresh, writes and logout
// to prevent simultaneous requests from reusing an already-rotated refresh token.
export class WritingSession {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; this.queue = Promise.resolve(); this.fetcher = fetch; }
  fetch(request) {
    const work = this.queue.then(() => this.handle(request));
    this.queue = work.catch(() => {});
    return work.catch(error => json({ error: error.status ? error.message : "Writing service failed. Please sign in again." }, error.status || 503));
  }
  async save(data) {
    await this.ctx.storage.put("sealed", await seal(data, this.env.SESSION_ENCRYPTION_KEY));
    await this.ctx.storage.setAlarm(data.expires);
  }
  async load() {
    const encrypted = await this.ctx.storage.get("sealed");
    if (!encrypted) fail(401, "Please sign in with GitHub.");
    const data = await unseal(encrypted, this.env.SESSION_ENCRYPTION_KEY);
    if (data.expires <= Date.now()) { await this.ctx.storage.deleteAll(); fail(401, "Your session expired. Sign in again."); }
    return data;
  }
  async alarm() { await this.ctx.storage.deleteAll(); }
  async handle(request) {
    const path = new URL(request.url).pathname;
    // These routes are reachable only through the private Worker binding.
    if (path === "/create") {
      if (await this.ctx.storage.get("sealed")) fail(409, "Session already exists.");
      await this.save(await request.json()); return json({ ok: true });
    }
    const data = await this.load();
    if (path === "/consume" && data.kind === "oauth") {
      await this.ctx.storage.deleteAll(); return json(data);
    }
    if (data.kind !== "session") fail(401, "Please sign in again.");
    if (path === "/session") return json({ login: data.login, csrf: data.csrf });
    if (request.headers.get("X-Writing-CSRF") !== data.csrf) fail(403, "Invalid session request. Reload after saving your work.");
    if (path === "/logout") { await this.ctx.storage.deleteAll(); return json({ ok: true }); }
    if (path === "/movies") {
      // Authenticated, CSRF-checked and bounded independently of GitHub writes.
      const now = Date.now();
      if (!this.movieWindow || now - this.movieWindow > 60_000) { this.movieWindow = now; this.movieRequests = 0; }
      if (++this.movieRequests > 30) fail(429, "Too many image requests. Wait a minute before trying again.");
      return json(await movieImages(await readBody(request, 2000), { token: this.env.TMDB_READ_ACCESS_TOKEN, fetcher: this.fetcher }));
    }
    if (path !== "/proxy") fail(404, "Not found.");
    const operation = allowedRequest(await readBody(request));
    if (data.tokenExpires <= Date.now() + 60_000) {
      if (data.refreshExpires <= Date.now()) { await this.ctx.storage.deleteAll(); fail(401, "Please sign in again."); }
      try {
        Object.assign(data, await tokenExchange(this.env, { grant_type: "refresh_token", refresh_token: data.refreshToken }, this.fetcher));
        await this.save(data);
      } catch {
        // A failed/uncertain refresh must never replay a consumed refresh token.
        await this.ctx.storage.deleteAll(); fail(401, "Session renewal failed. Please sign in again; your writing is still here.");
      }
    }
    const response = await github(operation.endpoint, data.accessToken, { method: operation.method,
      ...(operation.body ? { body: JSON.stringify(operation.body) } : {}) }, this.fetcher);
    if (response.status === 401) { await this.ctx.storage.deleteAll(); fail(401, "GitHub authorization expired or was revoked. Please sign in again."); }
    if (!response.ok) {
      const limited = response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after");
      const messages = { 403: "GitHub denied access. Check the GitHub App installation and Contents/Actions permissions for this website repository.", 404: "File or repository not found. Check the GitHub App installation.", 409: "Content changed elsewhere. Reopen the latest version before saving.", 422: "GitHub rejected this revision. Reopen the latest version before saving." };
      return json({ error: limited ? "GitHub temporarily limited requests. Wait before trying again." : messages[response.status] || "GitHub request failed. Check your saved content before retrying." }, response.status);
    }
    if (response.status === 204) return new Response(null, { status: 204 });
    const result = await response.json();
    if (operation.endpoint === "/user") return json({ login: result.login });
    if (operation.endpoint === REPO) return json({ permissions: { push: result.permissions?.push === true } });
    return json(result);
  }
}

function object(env, id) { return env.SESSIONS.get(env.SESSIONS.idFromName(id)); }
const internal = (path, value, csrf) => new Request("https://session.internal" + path, { method: "POST",
  headers: { "Content-Type": "application/json", ...(csrf ? { "X-Writing-CSRF": csrf } : {}) }, ...(value ? { body: JSON.stringify(value) } : {}) });

export async function handleRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (!env.STUDIO_ORIGIN || !env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET ||
      !/^\d+$/.test(env.GITHUB_USER_ID || "") || !/^\d+$/.test(env.GITHUB_REPOSITORY_ID || "") || !env.SESSION_ENCRYPTION_KEY) {
    return json({ error: "Writing sign-in is not configured yet." }, 503);
  }
  if (url.origin !== env.STUDIO_ORIGIN || url.protocol !== "https:") return json({ error: "Invalid writing origin." }, 403);
  if (url.pathname === "/auth/login" && request.method === "GET") {
    const state = random(), verifier = random();
    await object(env, state).fetch(internal("/create", { kind: "oauth", verifier, expires: Date.now() + 5 * 60_000 }));
    const challenge = base64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier)))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const auth = new URL("https://github.com/login/oauth/authorize");
    auth.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: env.STUDIO_ORIGIN + "/auth/callback", state, code_challenge: challenge, code_challenge_method: "S256", login: "MingyuanRen", allow_signup: "false" }).toString();
    return redirect(auth.href, [cookie(OAUTH, state, 300)]);
  }
  if (url.pathname === "/auth/callback" && request.method === "GET") {
    const state = url.searchParams.get("state");
    try {
      if (!validId(state) || readCookie(request, OAUTH) !== state || !url.searchParams.get("code") || url.searchParams.get("error")) fail(401, "Invalid authorization.");
      const stored = await object(env, state).fetch(internal("/consume"));
      if (!stored.ok) fail(401, "Expired authorization.");
      const { verifier } = await stored.json();
      const tokens = await tokenExchange(env, { code: url.searchParams.get("code"), code_verifier: verifier,
        redirect_uri: env.STUDIO_ORIGIN + "/auth/callback", repository_id: Number(env.GITHUB_REPOSITORY_ID) }, fetcher);
      const userResponse = await github("/user", tokens.accessToken, {}, fetcher);
      if (!userResponse.ok) fail(403, "Owner only.");
      const user = await userResponse.json();
      if (String(user.id) !== env.GITHUB_USER_ID || user.login?.toLowerCase() !== "mingyuanren") fail(403, "Owner only.");
      const repoResponse = await github(REPO, tokens.accessToken, {}, fetcher);
      if (!repoResponse.ok) fail(403, "Repository unavailable.");
      const repo = await repoResponse.json();
      if (String(repo.id) !== env.GITHUB_REPOSITORY_ID || !repo.permissions?.push) fail(403, "Repository unavailable.");
      const id = random();
      const saved = await object(env, id).fetch(internal("/create", { kind: "session", ...tokens, login: user.login, csrf: random(), expires: Date.now() + MONTH * 1000 }));
      if (!saved.ok) fail(503, "Session unavailable.");
      return redirect(env.STUDIO_ORIGIN + "/admin/", [cookie(OAUTH, "", 0), cookie(SESSION, id, MONTH)]);
    } catch {
      return redirect(env.STUDIO_ORIGIN + "/admin/?signin=failed", [cookie(OAUTH, "", 0)]);
    }
  }
  if (["/auth/session", "/auth/logout", "/api/github", "/api/movies"].includes(url.pathname)) {
    const read = url.pathname === "/auth/session";
    if (request.method !== (read ? "GET" : "POST")) return json({ error: "Method not allowed." }, 405);
    if ((!read && request.headers.get("Origin") !== env.STUDIO_ORIGIN) || request.headers.get("Sec-Fetch-Site") === "cross-site") return json({ error: "Cross-site request rejected." }, 403);
    const id = readCookie(request, SESSION);
    if (!validId(id)) return json({ error: "Please sign in with GitHub." }, 401);
    const path = read ? "/session" : url.pathname === "/auth/logout" ? "/logout" : url.pathname === "/api/movies" ? "/movies" : "/proxy";
    const body = path === "/proxy" || path === "/movies" ? await readBody(request, path === "/movies" ? 2000 : undefined) : undefined;
    const result = await object(env, id).fetch(internal(path, body, request.headers.get("X-Writing-CSRF")));
    if (path === "/logout" && result.ok) return json({ ok: true }, 200, { "Set-Cookie": cookie(SESSION, "", 0) });
    return result;
  }
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed." }, 405);
  // Reuse the deployed static editor. Never forward browser cookies or headers
  // to Pages; credentials and OAuth endpoints are handled above on this origin.
  if (url.pathname === "/admin" || url.pathname === "/admin/" || url.pathname === "/tmdb.svg" || /^\/_next\/static\/[A-Za-z0-9_./-]+$/.test(url.pathname) || validRankingImage(url.pathname)) {
    const path = url.pathname.startsWith("/admin") ? "/admin/" : url.pathname;
    const upstream = await fetcher(SITE + path, { method: "GET", redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400) fail(502, "Unexpected editor redirect.");
    const headers = new Headers();
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/octet-stream");
    headers.set("Cache-Control", path === "/admin/" ? "no-store" : "public, max-age=300");
    if (path === "/admin/" && upstream.ok) {
      const html = (await upstream.text()).replace("<head>", '<head><meta name="writing-session" content="same-origin">');
      return new Response(request.method === "HEAD" ? null : html, { status: upstream.status, headers });
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, { status: upstream.status, headers });
  }
  return redirect(SITE + url.pathname);
}

export default {
  async fetch(request, env) {
    let response;
    try { response = await handleRequest(request, env); }
    catch (error) { response = json({ error: error.status ? error.message : "Writing service unavailable. No request was automatically retried." }, error.status || 503); }
    const secured = new Response(response.body, response);
    secured.headers.set("Referrer-Policy", "no-referrer");
    secured.headers.set("X-Content-Type-Options", "nosniff");
    secured.headers.set("X-Frame-Options", "DENY");
    secured.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://image.tmdb.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (new URL(request.url).pathname.startsWith("/auth/") || new URL(request.url).pathname.startsWith("/api/")) secured.headers.set("Cache-Control", "no-store");
    return secured;
  },
};
