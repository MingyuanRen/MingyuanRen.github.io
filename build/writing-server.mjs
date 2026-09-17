import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { imageExtension, validPostPath, validUploadPath } from "../lib/writing.mjs";
import { parsePost, sections } from "../lib/markdown.mjs";

const revision = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

// A local-only file adapter. It has no Git credentials and never runs git.
export function writingServer(root) {
  root = resolve(root);
  function safePath(path, image = false) {
    if (!(image ? validUploadPath(path) : validPostPath(path))) fail("不支持的文件路径。");
    let current = root;
    for (const [index, part] of path.split("/").entries()) {
      current = join(current, part);
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) fail("不能读写链接文件。");
        if (index < path.split("/").length - 1 && !stat.isDirectory()) fail("目录无效。");
      } catch (error) {
        if (error.code !== "ENOENT" || index < path.split("/").length - 1) throw error;
      }
    }
    return current;
  }
  function read(path) {
    const source = readFileSync(safePath(path), "utf8");
    return { source, sha: revision(source) };
  }
  return createServer(async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (code, value) => { res.writeHead(code); res.end(JSON.stringify(value)); };
    if (origin !== "http://localhost:3000" || !/^127\.0\.0\.1:\d+$/.test(req.headers.host || "")) {
      return send(403, { error: "只接受 localhost:3000 的本地编辑器请求。" });
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return send(204, null);
    }
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/api/posts") {
        const files = sections.flatMap(section => readdirSync(join(root, "content", section))
          .map(name => "content/" + section + "/" + name).filter(validPostPath)
          .map(path => ({ path, sha: read(path).sha })));
        return send(200, files);
      }
      if (req.method === "GET" && url.pathname === "/api/post") return send(200, read(url.searchParams.get("path")));
      if (req.method !== "PUT" || !["/api/post", "/api/image"].includes(url.pathname)) return send(404, { error: "Not found" });
      if (req.headers["content-type"] !== "application/json") fail("仅接受 JSON。", 415);
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 7_100_000) fail("文件过大。", 413);
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const image = url.pathname === "/api/image";
      const target = safePath(body.path, image);
      let previous;
      try { previous = readFileSync(target); } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (image) {
        const bytes = Buffer.from(body.content, "base64");
        if (!body.path.endsWith("." + imageExtension(bytes))) fail("图片类型不匹配。");
        writeFileSync(target, bytes, { flag: "wx" });
        return send(201, { url: "/" + body.path.replace("site-public/", "") });
      }
      if (typeof body.source !== "string" || body.source.length > 600_000) fail("文章格式无效或过长。");
      parsePost(body.source, body.path);
      if ((previous ? revision(previous) : undefined) !== body.sha) fail("文件已被修改。请先下载草稿，再重新打开最新版本。", 409);
      writeFileSync(target, body.source, { flag: previous ? "w" : "wx" });
      send(200, { sha: revision(body.source) });
    } catch (error) {
      const status = error.status || (error.code === "ENOENT" ? 404 : error.code === "EEXIST" ? 409 : 400);
      send(status, { error: error.code ? "文件无法读取或写入，请检查路径和版本。" : error.message });
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  writingServer(root).listen(8081, "127.0.0.1", () => {
    console.log("Local writing ready at http://localhost:3000/admin/ — file saves only; no commits or deployment.");
  });
}
