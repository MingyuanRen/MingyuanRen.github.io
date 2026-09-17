"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { githubWriter, localWriter, readEntry, serializeEntry, imageExtension } from "../../lib/writing.mjs";
import { renderMarkdown } from "../../lib/markdown.mjs";
import "./writing.css";

type Entry = { title: string; section: string; slug: string; language: string; date: string; description: string; body: string; draft: boolean };
type FileEntry = { path: string; sha: string };
type Writer = {
  connect(): Promise<string>; list(): Promise<FileEntry[]>;
  read(path: string): Promise<{ source: string; sha: string }>;
  save(path: string, source: string, sha?: string): Promise<{ sha: string }>;
  upload(path: string, bytes: Uint8Array): Promise<string>; disconnect(): void;
};
const blank = (): Entry => ({
  title: "", section: "engineering", slug: "", language: "zh",
  date: new Date().toLocaleDateString("en-CA"), description: "", body: "", draft: true,
});
const subscribe = () => () => {};
const environment = () => window.location.origin === "http://localhost:3000" ? "local"
  : window.location.origin === "https://mingyuanren.github.io" ? "github" : "unsupported";
const serverEnvironment = () => "loading";

export default function Editor() {
  const mode = useSyncExternalStore(subscribe, environment, serverEnvironment);
  const writer = useRef<Writer | null>(null);
  const tokenInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [entry, setEntry] = useState<Entry>({ ...blank(), date: "" });
  const [opened, setOpened] = useState<FileEntry | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"draft" | "publish" | null>(null);
  const [savedLink, setSavedLink] = useState("");

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => () => writer.current?.disconnect(), []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong. Your text is still here."); }
    finally { setBusy(false); }
  }
  async function connect() {
    await run(async () => {
      if (mode !== "local" && mode !== "github") throw new Error("Open this editor on localhost:3000 or mingyuanren.github.io.");
      const next = mode === "local" ? localWriter() : githubWriter(tokenInput.current?.value.trim() || "");
      if (tokenInput.current) tokenInput.current.value = "";
      try {
        await next.connect();
        const items = await next.list();
        writer.current = next; setFiles(items); setConnected(true);
        setEntry(current => ({ ...current, date: current.date || blank().date }));
      } catch (cause) { next.disconnect(); throw cause; }
    });
  }
  function update(key: keyof Entry, value: string) {
    setEntry(current => ({ ...current, [key]: value }));
    setDirty(true); setSavedLink(""); setConfirmation(null);
  }
  function canLeave() { return !dirty || window.confirm("Discard unsaved changes? Download your Markdown first if you want to keep it."); }
  function newArticle() {
    if (!canLeave()) return;
    setEntry(blank()); setOpened(null); setDirty(false); setPreview(false); setNotice(""); setError(""); setSavedLink(""); setConfirmation(null);
  }
  async function openArticle(path: string) {
    if (!canLeave()) return;
    await run(async () => {
      const file = await writer.current!.read(path);
      setEntry(readEntry(file.source, path));
      setOpened({ path, sha: file.sha }); setDirty(false); setPreview(false); setSavedLink(""); setConfirmation(null);
    });
  }
  function translation() {
    if (!canLeave()) return;
    const language = entry.language === "zh" ? "en" : "zh";
    const path = "content/" + entry.section + "/" + entry.slug + "." + language + ".md";
    if (files.some(file => file.path === path)) { void openArticle(path); return; }
    setEntry({ ...entry, language, title: "", description: "", body: "", draft: true });
    setOpened(null); setDirty(true); setPreview(false); setSavedLink(""); setConfirmation(null);
    setNotice("A separate translation, linked by the same URL name. Nothing is auto-translated.");
  }
  async function save(draft: boolean) {
    setConfirmation(null);
    await run(async () => {
      const { path, source } = serializeEntry(entry, draft);
      const result = await writer.current!.save(path, source, opened?.sha);
      setOpened({ path, sha: result.sha }); setEntry({ ...entry, draft }); setDirty(false);
      setFiles(current => [...current.filter(file => file.path !== path), { path, sha: result.sha }]);
      setNotice(mode === "local"
        ? draft ? "Draft saved locally. No commit or deployment." : "Published in your local preview only. No commit or deployment."
        : draft ? "Draft committed to the public repository. It stays off the website."
        : "Committed to GitHub. The site will update after GitHub Pages finishes building.");
      setSavedLink(draft ? "" : "/posts/" + entry.section + "/" + encodeURIComponent(entry.slug) + "/" + entry.language + "/");
    });
  }
  function requestSave(draft: boolean) {
    try { serializeEntry(entry, draft); } catch (cause) { setError((cause as Error).message); return; }
    if (mode === "github") setConfirmation(draft ? "draft" : "publish");
    else void save(draft);
  }
  function download() {
    try {
      const { path, source } = serializeEntry(entry, true);
      const url = URL.createObjectURL(new Blob([source], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = path.split("/").pop()!; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError((cause as Error).message); }
  }
  async function upload(file: File) {
    if (mode === "github" && !window.confirm("Upload this image to the public GitHub repository now? This creates a commit, even if your article is still a draft.")) return;
    await run(async () => {
      if (file.size > 5 * 1024 * 1024) throw new Error("Please choose an image smaller than 5 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const path = "site-public/uploads/" + crypto.randomUUID() + "." + imageExtension(bytes);
      const url = await writer.current!.upload(path, bytes);
      setEntry(current => ({ ...current, body: current.body + "\n\n![Image description](" + url + ")\n" }));
      setDirty(true); setPreview(false);
      setNotice(mode === "local" ? "Image saved locally. Add a description in the Markdown." : "Image committed to GitHub. It appears after the next deployment.");
    });
  }

  return <main className="page writer-page">
    <div className="page-toolbar">
      <Link className="back-link" href="/" onClick={event => { if (!canLeave()) event.preventDefault(); }}>← Mingyuan Ren</Link>
      <span className="writer-eyebrow">{mode === "local" ? "LOCAL PREVIEW" : "WRITING"}</span>
    </div>
    <header className="writer-header"><h1>Write.</h1><p>Engineering notes, essays, and everything in between.</p></header>

    {!connected ? <section className="writer-connect" aria-label="Connect">
      {mode === "local" ? <>
        <p>This is your local workspace. Nothing here commits or publishes to GitHub.</p>
        <button className="writer-primary" disabled={busy} onClick={() => void connect()}>Start writing locally</button>
        <p className="writer-help">Run <code>npm run cms</code> alongside the website.</p>
      </> : mode === "github" ? <>
        <p>Connect your website repository to write and publish here. No extra hosting account needed.</p>
        <details className="writer-setup"><summary>One-time setup on GitHub</summary>
          <ol><li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">GitHub token settings ↗</a> and create a fine-grained token.</li>
            <li>Set an expiration. Under “Only select repositories”, choose <strong>MingyuanRen.github.io</strong>.</li>
            <li>Give repository <strong>Contents</strong> permission <strong>Read and write</strong>. Keep other permissions unchanged.</li>
            <li>Paste the token below. Don’t share it in chat or commit it to the repository.</li></ol>
        </details>
        <form onSubmit={event => { event.preventDefault(); void connect(); }}>
          <label className="writer-label">GitHub fine-grained token
            <input ref={tokenInput} type="password" autoComplete="off" spellCheck={false} placeholder="github_pat_…" required />
          </label>
          <button className="writer-primary" disabled={busy} type="submit">Connect GitHub</button>
        </form>
        <p className="writer-help">Kept in memory for this tab only. Refreshing or disconnecting clears it. This is token-based access, not an OAuth login.</p>
      </> : <p>{mode === "loading" ? "Opening your workspace…" : "Open this editor at localhost:3000 or mingyuanren.github.io."}</p>}
    </section> : <>
      <div className="writer-library">
        <details><summary>Articles <span>({files.length})</span></summary>
          <div className="writer-file-list">
            {files.length === 0 ? <p className="writer-help">No articles yet.</p> : files.map(file =>
              <button key={file.path} disabled={busy} onClick={() => void openArticle(file.path)}>{file.path.replace("content/", "").replace(/\.md$/, "")}</button>)}
            <button disabled={busy} onClick={() => void run(async () => setFiles(await writer.current!.list()))}>Refresh list</button>
          </div>
        </details>
        <button disabled={busy} onClick={newArticle}>New article +</button>
      </div>
      <fieldset className="writer-form" disabled={busy}>
        <label className="writer-label writer-title-label">Title<input className="writer-title" value={entry.title} placeholder="Untitled" onChange={event => update("title", event.target.value)} /></label>
        <div className="writer-fields">
          <label className="writer-label">Section<select value={entry.section} disabled={!!opened} onChange={event => update("section", event.target.value)}>
            <option value="engineering">Engineering Notes</option><option value="essays">Personal · 随笔</option><option value="rankings">Personal · 从夯到拉</option>
          </select></label>
          <label className="writer-label">Language<select value={entry.language} disabled={!!opened} onChange={event => update("language", event.target.value)}><option value="zh">中文</option><option value="en">English</option></select></label>
          <label className="writer-label">URL name<input value={entry.slug} disabled={!!opened} placeholder="my-first-note" onChange={event => update("slug", event.target.value)} /></label>
          <label className="writer-label">Date<input type="date" value={entry.date} onChange={event => update("date", event.target.value)} /></label>
        </div>
        <label className="writer-label">Summary <span>(optional)</span><input value={entry.description} placeholder="A line or two for the article list." onChange={event => update("description", event.target.value)} /></label>
        {opened && <button className="writer-translation" onClick={translation}>Open / add {entry.language === "zh" ? "English" : "中文"} version ↗</button>}
        <div className="writer-editor-toolbar">
          <div className="language-switch" aria-label="Editor view"><button aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button><span>/</span><button aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button></div>
          <button onClick={() => imageInput.current?.click()}>Add image</button>
          <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </div>
        {preview ? <article className="writer-preview">
          <h2>{entry.title || "Untitled"}</h2>
          <div className="post-meta">{entry.date} · {entry.language === "zh" ? "中文" : "English"}</div>
          {entry.body ? <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }} /> : <p className="writer-help">Your preview will appear here.</p>}
        </article> : <label className="writer-body-label"><span className="writer-sr-only">Markdown body</span>
          <textarea value={entry.body} placeholder="Start writing…\n\nMarkdown works here. 中文也可以。" onChange={event => update("body", event.target.value)} />
        </label>}
        <p className="writer-help"># Heading · **bold** · [link](url) · code fences · lists · images</p>
        <div className="writer-actions">
          <button className="writer-primary" onClick={() => requestSave(false)}>{mode === "local" ? "Publish locally" : "Publish"}</button>
          <button onClick={() => requestSave(true)}>Save draft</button>
          <button onClick={download}>Download .md</button>
          <span className="writer-help">{busy ? "Saving…" : dirty ? "Unsaved changes" : opened ? entry.draft ? "Draft" : "Published" : ""}</span>
        </div>
      </fieldset>
      {confirmation && <section className="writer-confirm" aria-label="Confirm GitHub commit">
        <p>{confirmation === "draft" ? "Save this draft to the public GitHub repository? It will not appear on the website, but its source and history will be public." : "Publish this article? This commits it to the public GitHub repository and starts a website deployment."}</p>
        <button className="writer-primary" disabled={busy} onClick={() => void save(confirmation === "draft")}>Confirm {confirmation === "draft" ? "draft save" : "publish"}</button>
        <button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
      </section>}
      <p className="writer-privacy">{mode === "local" ? "Local saves stay on this computer. Nothing is committed or deployed." : "Public repository: saved drafts, uploads, and revision history are public, even before you publish. Do not include private work information."}</p>
      <div className="writer-connection">
        <span>{mode === "local" ? "Local files" : "MingyuanRen / MingyuanRen.github.io"}</span>
        <button disabled={busy} onClick={() => { if (!canLeave()) return; writer.current?.disconnect(); writer.current = null; setConnected(false); setEntry(blank()); setOpened(null); setDirty(false); setConfirmation(null); setNotice(""); setError(""); setSavedLink(""); }}>Disconnect</button>
      </div>
    </>}
    {error && <p className="writer-error" role="alert">{error}</p>}
    {notice && <p className="writer-notice" role="status">{notice}</p>}
    {savedLink && <p className="writer-result"><a href={savedLink} target="_blank" rel="noreferrer">View article ↗</a>{mode === "github" && <> · <a href="https://github.com/MingyuanRen/MingyuanRen.github.io/actions" target="_blank" rel="noreferrer">Check deployment ↗</a></>}</p>}
  </main>;
}
