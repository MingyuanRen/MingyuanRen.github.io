import { parse, stringify } from "yaml";
import { parsePost, sections } from "./markdown.mjs";
import { validateRanking, validRankingImage } from "./rankings.mjs";
import { galleryPath, emptyGallery, parseGallery, serializeGallery } from "./pictures.mjs";

export const repository = "MingyuanRen/MingyuanRen.github.io";
export const postPathPattern = /^content\/(engineering|essays|rankings)\/([\p{L}\p{N}][\p{L}\p{N}_-]{0,100})\.(zh|en)\.md$/u;
export function validPostPath(path) { return typeof path === "string" && postPathPattern.test(path); }
export function postPath(entry) {
  const path = `content/${entry.section}/${entry.slug}.${entry.language}.md`;
  if (!validPostPath(path)) throw new Error("请填写有效网址名：中文、英文字母、数字、短横线均可，不要使用空格。");
  return path;
}
export function serializeEntry(entry, draft) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("文章数据格式无效。");
  if (typeof draft !== "boolean") throw new Error("草稿状态格式无效。");
  const path = postPath(entry);
  if (entry.format !== undefined && (entry.format !== "moment" || entry.section !== "essays")) throw new Error("片刻格式只能用于随笔分类。");
  if (typeof entry.body !== "string" || typeof entry.title !== "string") throw new Error("文章标题和正文格式无效。");
  if (entry.format === "moment" && !draft && !entry.body.trim()) throw new Error("请先写下一点内容再发布。");
  const title = entry.title.trim() || (entry.format === "moment" ? momentTitle(entry.body, entry.date) : "");
  if (!title) throw new Error("请先填写文章标题。");
  if (entry.body.length > 500_000) throw new Error("正文过长，请控制在 500,000 字符以内。");
  if (entry.ranking !== undefined && entry.section !== "rankings") throw new Error("排名只能保存到从夯到拉分类。");
  const ranking = entry.ranking === undefined ? undefined : validateRanking(entry.ranking, { published: !draft });
  const metadata = { title, date: entry.date, draft, description: entry.description };
  // Validate dates and required fields even when saving a draft.
  parsePost("---\n" + stringify({ ...metadata, draft: false }) + "---\n" + entry.body, path);
  const completeMetadata = { ...metadata,
    ...(entry.format !== undefined ? { format: entry.format } : {}),
    ...(ranking !== undefined ? { ranking } : {}),
  };
  const serialize = value => "---\n" + stringify(value) + "---\n" + entry.body + "\n";
  const source = serialize(completeMetadata);
  // Publishing generates a PNG after preflight. Reserve its exact path length
  // before the caller uploads anything, even when no boardImage exists yet.
  const publishedSize = ranking && !draft
    ? serialize({ ...completeMetadata, ranking: { ...ranking, boardImage: "/uploads/00000000-0000-0000-0000-000000000000.png" } }).length
    : source.length;
  if (Math.max(source.length, publishedSize) > 600_000) throw new Error("文章与排名内容合计过长，请缩短后再保存。");
  return { path, source };
}

function momentTitle(body, date) {
  const line = body.split(/\r?\n/).find(line => line.trim()) || "";
  const text = line.replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`~]/g, "").trim();
  return [...text].slice(0, 36).join("") || date;
}
export function readEntry(source, path) {
  if (!validPostPath(path)) throw new Error("不支持的文章路径。");
  const [, section, slug, language] = path.match(postPathPattern);
  const match = source.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error("文章缺少 Markdown 元数据。");
  const meta = parse(match[1], { maxAliasCount: 0 });
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) throw new Error("文章元数据格式无效。");
  if (meta.format !== undefined && (meta.format !== "moment" || section !== "essays")) throw new Error("不支持的文章格式。");
  if (meta.ranking !== undefined && section !== "rankings") throw new Error("排名只能保存到从夯到拉分类。");
  return { section, slug, language, title: String(meta.title || ""), date: String(meta.date || ""), description: String(meta.description || ""), body: match[2], draft: meta.draft !== false,
    ...(meta.format !== undefined ? { format: meta.format } : {}),
    ...(meta.ranking !== undefined ? { ranking: validateRanking(meta.ranking, { published: meta.draft === false }) } : {}),
  };
}
export function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function fromBase64(value) { return Uint8Array.from(atob(value.replace(/\s/g, "")), c => c.charCodeAt(0)); }
export function encodedText(value) { return toBase64(new TextEncoder().encode(value)); }
export function decodedText(value) { return new TextDecoder().decode(fromBase64(value)); }
export function imageExtension(bytes) {
  if (bytes.length > 5 * 1024 * 1024) throw new Error("图片需小于 5 MB。");
  if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  const header = String.fromCharCode(...bytes.slice(0, 12));
  if (header.startsWith("GIF87a") || header.startsWith("GIF89a")) return "gif";
  if (header.startsWith("RIFF") && header.slice(8, 12) === "WEBP") return "webp";
  throw new Error("只支持 PNG、JPEG、GIF、WebP 图片，不接受 SVG 或 HTML。");
}
export function validUploadPath(path) { return typeof path === "string" && path.startsWith("site-public/") && validRankingImage(path.slice("site-public".length)); }

export function githubWriter(token, fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  if (!token.startsWith("github_pat_")) throw new Error("请使用 Fine-grained personal access token，仅授权网站仓库。");
  const base = "https://api.github.com";
  async function api(endpoint, options = {}) {
    if (!token) throw new Error("已断开连接，请重新连接 GitHub。");
    const response = await fetcher(base + endpoint, {
      ...options, redirect: "error", credentials: "omit",
      headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errors = { 401: "令牌无效或已过期，请重新连接。", 403: "GitHub 拒绝操作。请检查仓库权限或 API 限额。", 404: "没有找到文件或无法访问网站仓库。", 409: "文章已在别处修改。请先下载当前草稿，再重新打开最新版本。", 422: "文件名已存在或提交被拒绝。请重新打开文章，不要覆盖。" };
      const error = new Error(errors[response.status] || "GitHub 请求失败，请稍后重试。");
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  return repositoryWriter(api, () => { token = ""; }, wait);
}

// Shares the existing content operations, but never receives a GitHub credential.
export function sessionWriter(fetcher = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let csrf = "";
  let disconnected = false;
  async function session() {
    const response = await fetcher("/auth/session", { credentials: "same-origin", redirect: "error", cache: "no-store" });
    if (!response.ok) throw Object.assign(new Error("Please sign in with GitHub to continue."), { status: response.status });
    const data = await response.json();
    if (typeof data.csrf !== "string" || data.login?.toLowerCase() !== "mingyuanren") throw new Error("Invalid writing session.");
    csrf = data.csrf;
  }
  async function request(path, body) {
    if (disconnected) throw new Error("Writing session disconnected.");
    if (!csrf) await session();
    const response = await fetcher(path, {
      method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { "Content-Type": "application/json", "X-Writing-CSRF": csrf },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 || response.status === 403) csrf = "";
      throw Object.assign(new Error(data.error || "Writing request failed. Your text remains here."), { status: response.status });
    }
    return response.status === 204 ? null : response.json();
  }
  const api = (endpoint, options = {}) => request("/api/github", { endpoint, method: options.method || "GET", ...(options.body ? { body: JSON.parse(options.body) } : {}) });
  return { ...repositoryWriter(api, () => { disconnected = true; csrf = ""; }, wait),
    movies: input => request("/api/movies", input),
    async logout() {
      if (!csrf) await session();
      const response = await fetcher("/auth/logout", { method: "POST", credentials: "same-origin", redirect: "error", headers: { "X-Writing-CSRF": csrf } });
      if (!response.ok) throw new Error("Sign out failed. Please try again.");
      disconnected = true; csrf = "";
    },
  };
}

function repositoryWriter(api, disconnect, wait) {
  const repo = "/repos/" + repository;
  const endpoint = path => repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
  return {
    async connect() {
      const user = await api("/user");
      if (user.login.toLowerCase() !== "mingyuanren") throw new Error("此编辑器仅用于 MingyuanRen 的网站。");
      const info = await api(repo);
      if (!info.permissions?.push) throw new Error("该账号没有网站仓库的写入权限。");
      return user.login;
    },
    async list() {
      const groups = await Promise.all(sections.map(async section => {
        try {
          const files = await api(endpoint("content/" + section) + "?ref=main");
          return files.filter(file => file.type === "file" && validPostPath(file.path)).map(file => ({ path: file.path, sha: file.sha }));
        } catch (error) { if (error.status === 404) return []; throw error; }
      }));
      return groups.flat();
    },
    async read(path) {
      if (!validPostPath(path)) throw new Error("不支持的文章路径。");
      const file = await api(endpoint(path) + "?ref=main");
      if (file.type !== "file" || file.encoding !== "base64") throw new Error("不支持的文件类型或文件过大。");
      return { source: decodedText(file.content), sha: file.sha };
    },
    async save(path, source, sha) {
      if (!validPostPath(path)) throw new Error("不支持的文章路径。");
      parsePost(source, path);
      const result = await api(endpoint(path), { method: "PUT", body: JSON.stringify({ branch: "main", message: "Write: " + path, content: encodedText(source), ...(sha ? { sha } : {}) }) });
      return { sha: result.content.sha, commit: result.commit.sha };
    },
    async upload(path, bytes) {
      if (!validUploadPath(path) || !path.endsWith("." + imageExtension(bytes))) throw new Error("图片路径无效。");
      await api(endpoint(path), { method: "PUT", body: JSON.stringify({ branch: "main", message: "Upload article image", content: toBase64(bytes) }) });
      return "/" + path.replace("site-public/", "");
    },
    async readGallery() {
      try {
        const file = await api(endpoint(galleryPath) + "?ref=main");
        if (file.type !== "file" || file.encoding !== "base64") throw new Error("Could not read the picture collection.");
        return { gallery: parseGallery(decodedText(file.content)), sha: file.sha };
      } catch (error) { if (error.status === 404) return { gallery: emptyGallery() }; throw error; }
    },
    async saveGallery(gallery, sha) {
      const source = serializeGallery(gallery);
      const result = await api(endpoint(galleryPath), { method: "PUT", body: JSON.stringify({ branch: "main", message: "Update picture collection", content: encodedText(source), ...(sha ? { sha } : {}) }) });
      return { sha: result.content.sha };
    },
    async translate(path, sha) {
      if (!validPostPath(path) || !path.endsWith(".zh.md") || !/^[a-f0-9]{40}$/.test(sha || "")) throw new Error("Please save and open a Chinese article first.");
      const target = path.replace(/\.zh\.md$/, ".en.md");
      try { await api(endpoint(target) + "?ref=main"); throw new Error("An English version already exists. Open it instead."); }
      catch (error) { if (error.status !== 404) throw error; }
      const workflow = repo + "/actions/workflows/translate.yml";
      const requestId = crypto.randomUUID();
      // Do not retry dispatch: an uncertain response may already have started a paid request.
      try {
        await api(workflow + "/dispatches", { method: "POST", body: JSON.stringify({ ref: "main", inputs: { source_path: path, source_sha: sha, request_id: requestId } }) });
      } catch {
        throw new Error("Could not confirm the translation started. Check GitHub Actions before retrying. The translation workflow must be deployed and your token needs Actions: Read and write.");
      }
      for (let attempt = 0; attempt < 30; attempt++) {
        await wait(10_000);
        const result = await api(workflow + "/runs?event=workflow_dispatch&branch=main&per_page=100");
        const run = result.workflow_runs.find(run => run.display_title === "Translate " + requestId);
        if (run?.status !== "completed") continue;
        if (run.conclusion !== "success") throw new Error("Translation did not finish. Check the Translate writing run in GitHub Actions (key, quota, or source conflict). Your Chinese original is unchanged.");
        const file = await api(endpoint(target) + "?ref=main");
        if (file.type !== "file" || file.encoding !== "base64") throw new Error("Could not read the English draft. Refresh the article list.");
        return { path: target, source: decodedText(file.content), sha: file.sha };
      }
      throw new Error("Translation is still queued or running. Check GitHub Actions, then refresh the article list to open the English draft. Do not start a second request.");
    },
    async publish(path, source, sha) {
      const entry = readEntry(source, path);
      serializeEntry(entry, false);
      const target = path.replace(/\.(zh|en)\.md$/, (_, language) => language === "zh" ? ".en.md" : ".zh.md");
      async function current(file) {
        try { return await api(endpoint(file) + "?ref=main"); }
        catch (error) { if (error.status === 404) return null; throw error; }
      }
      const original = await current(path);
      if ((original?.sha || "") !== (sha || "")) throw new Error("This article changed elsewhere. Reopen the latest version before publishing.");
      const translation = await current(target);
      const requestId = crypto.randomUUID();
      const body = JSON.stringify({ ref: "main", inputs: { source_path: path, source, source_sha: sha || "", target_sha: translation?.sha || "", request_id: requestId } });
      if (new TextEncoder().encode(body).length > 60_000) throw new Error("This article is too large for online translation (60 KB request limit). Shorten it before publishing.");
      const workflow = repo + "/actions/workflows/publish.yml";
      try { await api(workflow + "/dispatches", { method: "POST", body }); }
      catch { throw new Error("Could not confirm publishing started. Check GitHub Actions before retrying. The publish workflow must be deployed and your token needs Actions: Read and write."); }
      for (let attempt = 0; attempt < 30; attempt++) {
        await wait(10_000);
        const result = await api(workflow + "/runs?event=workflow_dispatch&branch=main&per_page=100");
        const run = result.workflow_runs.find(run => run.display_title === "Publish " + requestId);
        if (run?.status !== "completed") continue;
        if (run.conclusion !== "success") throw new Error("Translation or deployment failed. Your writing is still in this editor. Check the Publish bilingual writing run before retrying; if the commit succeeded, both files are already saved.");
        const files = await Promise.all([path, target].map(async filePath => {
          const file = await current(filePath);
          if (file?.type !== "file" || file.encoding !== "base64") throw new Error("Publication finished but the result could not be read. Refresh the article list before editing.");
          const content = decodedText(file.content);
          if (readEntry(content, filePath).draft) throw new Error("An article changed after publication. Refresh before editing.");
          if (filePath === path && content.trimEnd() !== source.trimEnd()) throw new Error("Your article was edited again after this publication. Reopen the latest version before editing.");
          return { path: filePath, source: content, sha: file.sha };
        }));
        return { files };
      }
      throw new Error("Publishing is still queued or running. Check GitHub Actions before retrying; your writing remains in this editor.");
    },
    disconnect,
  };
}

export function localWriter(fetcher = fetch) {
  async function api(path, options = {}) {
    let response;
    try { response = await fetcher("http://127.0.0.1:8081" + path, { ...options, credentials: "omit", headers: { "Content-Type": "application/json" } }); }
    catch { throw new Error("本地写作服务没有启动。运行 npm run cms 后再试，不会自动连接线上仓库。"); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "本地保存失败。");
    return result;
  }
  return {
    async connect() { await api("/api/posts"); return "local"; },
    list: () => api("/api/posts"),
    read: path => api("/api/post?path=" + encodeURIComponent(path)),
    save: (path, source, sha) => api("/api/post", { method: "PUT", body: JSON.stringify({ path, source, sha }) }),
    upload: async (path, bytes) => (await api("/api/image", { method: "PUT", body: JSON.stringify({ path, content: toBase64(bytes) }) })).url,
    translate: (path, sha) => api("/api/translate", { method: "POST", body: JSON.stringify({ path, sha }) }),
    publish: (path, source, sha) => api("/api/publish", { method: "POST", body: JSON.stringify({ path, source, sha }) }),
    readGallery: () => api("/api/gallery"),
    saveGallery: (gallery, sha) => api("/api/gallery", { method: "PUT", body: JSON.stringify({ gallery, sha }) }),
    movies: input => api("/api/movies", { method: "POST", body: JSON.stringify(input) }),
    disconnect() {},
  };
}
