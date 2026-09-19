import { validPostPath, validUploadPath, imageExtension, fromBase64, decodedText, readEntry, serializeEntry } from "../lib/writing.mjs";
import { parseGallery, galleryPath } from "../lib/pictures.mjs";
import { parsePost } from "../lib/markdown.mjs";

const repo = "/repos/MingyuanRen/MingyuanRen.github.io";
const reject = () => { throw Object.assign(new Error("This operation is not available in the writing studio."), { status: 403 }); };

// Server-side allowlist, independent of the browser. No arbitrary GitHub proxy,
// workflow edits, branches, deletes, accounts, or other repositories.
export function allowedRequest(input) {
  if (!input || !["GET", "PUT", "POST"].includes(input.method) || typeof input.endpoint !== "string") reject();
  const { method, endpoint, body } = input;
  if (method === "GET" && ["/user", repo].includes(endpoint) && body === undefined) return input;
  if (method === "GET" && /^\/repos\/MingyuanRen\/MingyuanRen\.github\.io\/actions\/workflows\/(publish|translate)\.yml\/runs\?event=workflow_dispatch&branch=main&per_page=100$/.test(endpoint) && body === undefined) return input;
  const prefix = repo + "/contents/";
  if (endpoint.startsWith(prefix)) {
    let path;
    try { path = decodeURIComponent(endpoint.slice(prefix.length).replace(/\?ref=main$/, "")); } catch { reject(); }
    const canonical = prefix + path.split("/").map(encodeURIComponent).join("/");
    const file = validPostPath(path) || path === galleryPath;
    if (method === "GET" && endpoint === canonical + "?ref=main" && body === undefined &&
      (file || ["content/engineering", "content/essays", "content/rankings"].includes(path))) return input;
    if (method !== "PUT" || endpoint !== canonical || (!file && !validUploadPath(path)) || !body ||
      Object.keys(body).some(k => !["branch", "message", "content", "sha"].includes(k)) ||
      body.branch !== "main" || typeof body.message !== "string" || body.message.length > 300 ||
      typeof body.content !== "string" || body.content.length > 7_000_000 ||
      (body.sha !== undefined && !/^[a-f0-9]{40}$/.test(body.sha))) reject();
    if (validUploadPath(path)) {
      const bytes = fromBase64(body.content);
      if (body.sha || bytes.length > 5 * 1024 * 1024 || !path.endsWith("." + imageExtension(bytes))) reject();
    } else {
      const source = decodedText(body.content);
      if (source.length > 600_000) reject();
      if (path === galleryPath) parseGallery(source); else parsePost(source, path);
    }
    return input;
  }
  if (method === "POST" && endpoint === repo + "/actions/workflows/publish.yml/dispatches" &&
      body?.ref === "main" && typeof body.inputs?.source === "string" &&
      Object.keys(body).every(k => ["ref", "inputs"].includes(k)) &&
      Object.keys(body.inputs).every(k => ["source_path", "source", "source_sha", "target_sha", "request_id"].includes(k))) {
    const i = body.inputs;
    if (!validPostPath(i.source_path) || !/^[a-f0-9-]{36}$/.test(i.request_id) ||
        !/^(?:[a-f0-9]{40})?$/.test(i.source_sha) || !/^(?:[a-f0-9]{40})?$/.test(i.target_sha) ||
        new TextEncoder().encode(JSON.stringify(body)).length > 60_000) reject();
    serializeEntry(readEntry(i.source, i.source_path), false);
    return input;
  }
  reject();
}
