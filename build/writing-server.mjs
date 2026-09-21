import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, readdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { imageExtension, validPostPath, validUploadPath } from "../lib/writing.mjs";
import { parsePost, sections } from "../lib/markdown.mjs";
import { translateEntry } from "../lib/translation-server.mjs";
import { otherLanguagePath, publishedPair } from "../lib/bilingual-publish.mjs";
import { readEntry, serializeEntry } from "../lib/writing.mjs";
import { galleryPath, emptyGallery, parseGallery, serializeGallery } from "../lib/pictures.mjs";
import { movieImages } from "../lib/movie-images.mjs";

const revision = bytes => createHash("sha256").update(bytes).digest("hex");
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

// A local-only file adapter. It has no Git credentials and never runs git.
export function writingServer(root, { translator = translateEntry, apiKey = process.env.OPENAI_API_KEY, model = process.env.OPENAI_TRANSLATION_MODEL || undefined, movieProvider = movieImages, movieToken = process.env.TMDB_READ_ACCESS_TOKEN } = {}) {
  root = resolve(root);
  let translating = false;
  function safePath(path, image = false) {
    if (!(image ? validUploadPath(path) : validPostPath(path) || path === galleryPath)) fail("不支持的文件路径。");
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
  function optionalRead(path) {
    try { return read(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  function writePair(pair) {
    // Stage both files before replacing either. Roll back a filesystem failure.
    const staged = [];
    try {
      for (const file of pair) {
        const target = safePath(file.path);
        const previous = optionalRead(file.path);
        const temp = target + "." + randomUUID() + ".tmp";
        writeFileSync(temp, file.source, { flag: "wx" });
        staged.push({ target, temp, previous, written: false });
      }
      for (const file of staged) { renameSync(file.temp, file.target); file.written = true; }
    } catch (error) {
      for (const file of staged.reverse()) {
        if (!file.written) { unlinkSync(file.temp); continue; }
        if (file.previous) writeFileSync(file.target, file.previous.source);
        else unlinkSync(file.target);
      }
      throw error;
    }
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
      res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return send(204, null);
    }
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/api/images") {
        const folder = join(root, "site-public", "uploads");
        const images = readdirSync(folder).filter(name => validUploadPath("site-public/uploads/" + name)).flatMap(name => {
          try {
            const path = "site-public/uploads/" + name;
            const stat = lstatSync(safePath(path, true));
            return stat.isFile() ? [{ image: "/uploads/" + name, title: name }] : [];
          } catch { return []; }
        });
        return send(200, { images, truncated: false });
      }
      if (req.method === "GET" && url.pathname === "/api/gallery") {
        const file = optionalRead(galleryPath);
        return send(200, file ? { gallery: parseGallery(file.source), sha: file.sha } : { gallery: emptyGallery() });
      }
      if (req.method === "GET" && url.pathname === "/api/posts") {
        const files = sections.flatMap(section => readdirSync(join(root, "content", section))
          .map(name => "content/" + section + "/" + name).filter(validPostPath)
          .map(path => ({ path, sha: read(path).sha })));
        return send(200, files);
      }
      if (req.method === "GET" && url.pathname === "/api/post") return send(200, read(url.searchParams.get("path")));
      const translation = req.method === "POST" && url.pathname === "/api/translate";
      const publishing = req.method === "POST" && url.pathname === "/api/publish";
      const movies = req.method === "POST" && url.pathname === "/api/movies";
      if (!movies && !translation && !publishing && (req.method !== "PUT" || !["/api/post", "/api/image", "/api/gallery"].includes(url.pathname))) return send(404, { error: "Not found" });
      if (req.headers["content-type"] !== "application/json") fail("仅接受 JSON。", 415);
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > (translation || movies ? 2000 : 7_100_000)) fail("文件过大。", 413);
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (movies) return send(200, await movieProvider(body, { token: movieToken }));
      if (url.pathname === "/api/gallery") {
        const source = serializeGallery(body.gallery);
        const previous = optionalRead(galleryPath);
        if (previous?.sha !== body.sha) fail("Pictures changed elsewhere. Download your collection, then reopen Picture before saving.", 409);
        writePair([{ path: galleryPath, source }]);
        return send(200, { sha: revision(source) });
      }
      if (publishing) {
        if (translating) fail("Translation is already running. Please wait.", 409);
        if (!validPostPath(body.path) || typeof body.source !== "string" || body.source.length > 600_000) fail("Invalid article.");
        const original = serializeEntry(readEntry(body.source, body.path), false);
        const targetPath = otherLanguagePath(body.path);
        const beforeSource = optionalRead(body.path);
        const beforeTarget = optionalRead(targetPath);
        if (beforeSource && readEntry(beforeSource.source, body.path).trashed) fail("Restore this article from Trash before publishing.", 409);
        if (beforeTarget && readEntry(beforeTarget.source, targetPath).trashed) fail("Restore the other language version from Trash before publishing.", 409);
        if ((beforeSource?.sha || "") !== (body.sha || "")) fail("This article changed elsewhere. Reopen the latest version before publishing.", 409);
        translating = true;
        try {
          const translated = await translator(original.source, body.path, { apiKey, model });
          const pair = publishedPair(original.source, body.path, translated);
          if ((optionalRead(body.path)?.sha || "") !== (beforeSource?.sha || "") || (optionalRead(targetPath)?.sha || "") !== (beforeTarget?.sha || "")) fail("An article changed during translation. Neither version was published. Reopen the latest version.", 409);
          writePair(pair);
          return send(200, { files: pair.map(file => ({ ...file, sha: revision(file.source) })) });
        } finally { translating = false; }
      }
      if (translation) {
        if (translating) fail("A translation is already running. Please wait.", 409);
        if (!validPostPath(body.path) || !body.path.endsWith(".zh.md")) fail("Please choose a saved Chinese article.");
        const original = read(body.path);
        if (original.sha !== body.sha) fail("Chinese source changed. Save or reopen the latest version first.", 409);
        const english = body.path.replace(/\.zh\.md$/, ".en.md");
        try { read(english); fail("An English version already exists. Open it instead.", 409); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
        translating = true;
        try {
          const result = await translator(original.source, body.path, { apiKey, model });
          if (read(body.path).sha !== body.sha) fail("Chinese source changed during translation. Your original is untouched.", 409);
          return send(200, result); // Return an unsaved draft; never write or commit.
        } finally { translating = false; }
      }
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
