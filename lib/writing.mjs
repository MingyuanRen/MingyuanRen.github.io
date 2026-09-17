import { parse, stringify } from "yaml";
import { parsePost, sections } from "./markdown.mjs";

export const repository = "MingyuanRen/MingyuanRen.github.io";
export const postPathPattern = /^content\/(engineering|essays|rankings)\/([\p{L}\p{N}][\p{L}\p{N}_-]{0,100})\.(zh|en)\.md$/u;
export function validPostPath(path) { return typeof path === "string" && postPathPattern.test(path); }
export function postPath(entry) {
  const path = `content/${entry.section}/${entry.slug}.${entry.language}.md`;
  if (!validPostPath(path)) throw new Error("请填写有效网址名：中文、英文字母、数字、短横线均可，不要使用空格。");
  return path;
}
export function serializeEntry(entry, draft) {
  const path = postPath(entry);
  if (!entry.title.trim()) throw new Error("请先填写文章标题。");
  if (entry.body.length > 500_000) throw new Error("正文过长，请控制在 500,000 字符以内。");
  const metadata = { title: entry.title.trim(), date: entry.date, draft, description: entry.description };
  const source = "---\n" + stringify(metadata) + "---\n" + entry.body + "\n";
  // Validate dates and required fields even when saving a draft.
  parsePost("---\n" + stringify({ ...metadata, draft: false }) + "---\n" + entry.body, path);
  return { path, source };
}
export function readEntry(source, path) {
  if (!validPostPath(path)) throw new Error("不支持的文章路径。");
  const [, section, slug, language] = path.match(postPathPattern);
  const match = source.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!match) throw new Error("文章缺少 Markdown 元数据。");
  const meta = parse(match[1], { maxAliasCount: 0 });
  return { section, slug, language, title: String(meta.title || ""), date: String(meta.date || ""), description: String(meta.description || ""), body: match[2], draft: meta.draft !== false };
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
export function validUploadPath(path) { return /^site-public\/uploads\/[a-f0-9-]{36}\.(png|jpg|gif|webp)$/.test(path); }

export function githubWriter(token, fetcher = fetch) {
  if (!token.startsWith("github_pat_")) throw new Error("请使用 Fine-grained personal access token，仅授权网站仓库。");
  const base = "https://api.github.com";
  const repo = "/repos/" + repository;
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
    return response.json();
  }
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
    disconnect() { token = ""; },
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
    disconnect() {},
  };
}
