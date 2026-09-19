"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sessionWriter, localWriter, readEntry, serializeEntry, imageExtension, fromBase64 } from "../../lib/writing.mjs";
import type { Movie, MovieImage, MovieRequest, MovieResult } from "./movie-picker";
import { renderMarkdown } from "../../lib/markdown.mjs";
import RankingEditor from "./ranking-editor";
import RankingArticle from "../components/ranking-article";
import type { RankingData } from "../components/ranking-board";
import { renderRankingPng } from "../../lib/ranking-image";
import "./writing.css";
import PictureEditor from "./picture-editor";
import type { Gallery } from "../components/picture-gallery";
import SignInCard from "./sign-in-card";

type Entry = { title: string; section: string; slug: string; language: string; date: string; description: string; body: string; draft: boolean; format?: "moment"; ranking?: RankingData };
type FileEntry = { path: string; sha: string };
type Writer = {
  connect(): Promise<string>; list(): Promise<FileEntry[]>;
  read(path: string): Promise<{ source: string; sha: string }>;
  save(path: string, source: string, sha?: string): Promise<{ sha: string }>;
  upload(path: string, bytes: Uint8Array): Promise<string>; disconnect(): void;
  publish(path: string, source: string, sha?: string): Promise<{ files: Array<{ path: string; source: string; sha: string }> }>;
  readGallery(): Promise<{ gallery: Gallery; sha?: string }>;
  saveGallery(gallery: Gallery, sha?: string): Promise<{ sha: string }>;
  logout?(): Promise<void>;
  movies(input: MovieRequest): Promise<MovieResult>;
};
const categories = [
  { id: "engineering", title: "Engineering Notes", description: "Source code, systems, and things learned along the way." },
  { id: "essays", title: "片刻 / Moments", description: "A thought, a feeling, a few lines. No title required." },
  { id: "rankings", title: "从夯到拉 / Tier lists", description: "An introduction, a poster board, and your reasons." },
  { id: "pictures", title: "Picture", description: "Film stills, small discoveries, and images worth keeping." },
];
const blank = (section = "engineering", language = "zh"): Entry => ({
  title: "", section, slug: "", language,
  date: new Date().toLocaleDateString("en-CA"), description: "", body: "", draft: true,
  ...(section === "essays" ? { format: "moment" as const } : {}),
  ...(section === "rankings" ? { ranking: { version: 1 as const, items: [] } } : {}),
});
const subscribe = () => () => {};
const environment = () => document.querySelector('meta[name="writing-session"][content="same-origin"]') ? "session"
  : window.location.origin === "http://localhost:3000" ? "local"
  : window.location.origin === "https://mingyuanren.github.io" ? "github" : "unsupported";
const serverEnvironment = () => "loading";

export default function Editor() {
  const mode = useSyncExternalStore(subscribe, environment, serverEnvironment);
  const writer = useRef<Writer | null>(null);
  const [galleryWriter, setGalleryWriter] = useState<Writer | null>(null);
  const [studioOrigin, setStudioOrigin] = useState("");
  const [sessionChecked, setSessionChecked] = useState(false);
  const [signInFailed, setSignInFailed] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const operation = useRef(false);
  const [preferredLanguage, setPreferredLanguage] = useState("zh");
  const [connected, setConnected] = useState(false);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [entry, setEntry] = useState<Entry>({ ...blank(), date: "" });
  const [opened, setOpened] = useState<FileEntry | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState<"draft" | "publish" | null>(null);
  const [savedLink, setSavedLink] = useState("");
  const [imageSources, setImageSources] = useState<Record<string, string>>({});
  const objectUrls = useRef<string[]>([]);
  const categoryFiles = files.filter(file => file.path.startsWith("content/" + entry.section + "/"));
  const moment = entry.format === "moment";

  useEffect(() => {
    let active = true;
    if (mode === "github") {
      fetch("/writing-config.json", { cache: "no-store", credentials: "omit" }).then(response => response.json()).then(config => {
        if (!active || !config.studioOrigin) return;
        const url = new URL(config.studioOrigin);
        if (url.protocol === "https:" && url.origin === config.studioOrigin && !url.username && !url.password) setStudioOrigin(url.origin);
      }).catch(() => { /* Remain unavailable until the deployment is configured. */ });
    }
    if (mode !== "session") return () => { active = false; };
    const next = sessionWriter();
    next.connect().then(() => next.list()).then(items => {
      if (!active) { next.disconnect(); return; }
      writer.current = next; setGalleryWriter(next); setFiles(items); setConnected(true);
      let language = "zh";
      try { language = localStorage.getItem("writing-language") === "en" ? "en" : "zh"; } catch { /* Use Chinese by default. */ }
      setPreferredLanguage(language); setEntry(current => ({ ...current, language, date: current.date || blank().date }));
    }).catch(cause => { if (active && cause.status !== 401) setError(cause.message); }).finally(() => {
      if (active) { setSessionChecked(true); setSignInFailed(new URLSearchParams(window.location.search).get("signin") === "failed"); }
    });
    return () => { active = false; next.disconnect(); };
  }, [mode]);

  useEffect(() => {
    if (error || notice) feedback.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error, notice]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  useEffect(() => () => {
    writer.current?.disconnect();
    for (const url of objectUrls.current) URL.revokeObjectURL(url);
  }, []);

  async function run(action: () => Promise<void>) {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setError(""); setNotice("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong. Your text is still here."); }
    finally { setBusy(false); operation.current = false; }
  }
  async function connect() {
    await run(async () => {
      if (mode !== "local") throw new Error("Please sign in with GitHub.");
      const next = localWriter();
      try {
        await next.connect();
        const items = await next.list();
        writer.current = next; setGalleryWriter(next); setFiles(items); setConnected(true);
        let language = preferredLanguage;
        try { language = localStorage.getItem("writing-language") === "en" ? "en" : "zh"; } catch { /* Keep the in-memory choice. */ }
        setPreferredLanguage(language);
        setEntry(current => ({ ...current, language, date: current.date || blank().date }));
      } catch (cause) { next.disconnect(); throw cause; }
    });
  }
  function update(key: keyof Entry, value: string) {
    if (key === "language") {
      setPreferredLanguage(value);
      try { localStorage.setItem("writing-language", value); } catch { /* Keep the current choice in memory. */ }
    }
    setEntry(current => ({ ...current, [key]: value }));
    setDirty(true); setSavedLink(""); setConfirmation(null);
  }
  function canLeave() { return !busy && (!dirty || window.confirm("Discard unsaved changes? Download your Markdown first if you want to keep it.")); }
  function newArticle(section = entry.section) {
    if (!canLeave()) return;
    setEntry(blank(section, preferredLanguage)); setOpened(null); setDirty(false); setPreview(false); setNotice(""); setError(""); setSavedLink(""); setConfirmation(null);
  }
  async function openArticle(path: string) {
    if (!canLeave()) return;
    await run(async () => {
      const file = await writer.current!.read(path);
      setEntry(readEntry(file.source, path) as Entry);
      setOpened({ path, sha: file.sha }); setDirty(false); setPreview(false); setSavedLink(""); setConfirmation(null);
    });
  }
  async function save(draft: boolean) {
    setConfirmation(null);
    await run(async () => {
      let saving = withUrlName(entry);
      // Keep a stable URL even if translation fails, so retries do not create copies.
      setEntry(saving); setDirty(true); setSavedLink("");
      serializeEntry(saving, draft);
      if (saving.ranking && !draft) {
        const image = await renderRankingPng(saving.ranking, imageSources);
        const boardImage = await uploadAsset(new File([image], "ranking.png", { type: "image/png" }));
        saving = { ...saving, ranking: { ...saving.ranking, boardImage } };
        setEntry(saving);
      }
      const { path, source } = serializeEntry(saving, draft);
      if (draft) {
        const result = await writer.current!.save(path, source, opened?.sha);
        setOpened({ path, sha: result.sha }); setEntry({ ...saving, draft: true }); setDirty(false);
        setFiles(current => [...current.filter(file => file.path !== path), { path, sha: result.sha }]);
        setNotice(mode === "local" ? "Draft saved locally. No translation, commit or deployment." : "Draft saved to the public repository. No translation requested.");
        return;
      }
      setTranslating(true);
      try {
        const result = await writer.current!.publish(path, source, opened?.sha);
        const original = result.files.find(file => file.path === path);
        if (!original || result.files.length !== 2) throw new Error("Could not verify both versions. Refresh the article list before retrying.");
        setEntry(readEntry(original.source, path) as Entry); setOpened({ path, sha: original.sha }); setDirty(false);
        setFiles(current => [...current.filter(file => !result.files.some(saved => saved.path === file.path)), ...result.files.map(({ path, sha }) => ({ path, sha }))]);
        setNotice(mode === "local" ? "Published in 中文 and English locally. No GitHub commit or deployment." : "Published in 中文 and English. Both versions are ready to read.");
        setSavedLink("/posts/" + saving.section + "/" + encodeURIComponent(saving.slug) + "/" + saving.language + "/");
      } finally { setTranslating(false); }
    });
  }
  function withUrlName(value: Entry): Entry {
    if (value.slug) return value;
    const prefix = value.format === "moment" ? "moment" : value.section === "rankings" ? "ranking" : "note";
    return { ...value, slug: prefix + "-" + value.date + "-" + crypto.randomUUID().slice(0, 8) };
  }
  function requestSave(draft: boolean) {
    try { serializeEntry(withUrlName(entry), draft); } catch (cause) { setError((cause as Error).message); return; }
    if (mode !== "local") setConfirmation(draft ? "draft" : "publish");
    else void save(draft);
  }
  function download() {
    try {
      const { path, source } = serializeEntry(withUrlName(entry), true);
      const url = URL.createObjectURL(new Blob([source], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = path.split("/").pop()!; link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError((cause as Error).message); }
  }
  async function uploadAsset(file: File) {
    if (file.size > 5 * 1024 * 1024) throw new Error("Please choose an image smaller than 5 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = "site-public/uploads/" + crypto.randomUUID() + "." + imageExtension(bytes);
    const url = await writer.current!.upload(path, bytes);
    const previewUrl = URL.createObjectURL(file);
    objectUrls.current.push(previewUrl);
    setImageSources(current => ({ ...current, [url]: previewUrl }));
    return url;
  }
  async function upload(file: File) {
    if (mode !== "local" && !window.confirm("Upload this image to the public GitHub repository now? This creates a commit, even if your article is still a draft.")) return;
    await run(async () => {
      const url = await uploadAsset(file);
      setEntry(current => ({ ...current, body: current.body + "\n\n![Image description](" + url + ")\n" }));
      setDirty(true); setPreview(false);
      setNotice(mode === "local" ? "Image saved locally. Add a description in the Markdown." : "Image committed to GitHub. It appears after the next deployment.");
    });
  }
  async function uploadPosters(selected: File[]) {
    if (!selected.length) return [];
    if ((entry.ranking?.items.length || 0) + selected.length > 40) throw new Error("A board can hold up to 40 posters.");
    if (selected.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) throw new Error("Please upload no more than 20 MB at a time.");
    setBusy(true); setError(""); setNotice("");
    const uploaded: Array<{ image: string; title: string }> = [];
    try {
      // Lock navigation before the first await; an upload belongs to this entry.
      for (const file of selected) imageExtension(new Uint8Array(await file.arrayBuffer()));
      if (mode !== "local" && !window.confirm("Upload these posters to the public GitHub repository? Each image is public immediately, including for drafts.")) return [];
      for (const file of selected) {
        const image = await uploadAsset(file);
        uploaded.push({ image, title: file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled film" });
      }
    } catch (cause) {
      if (!uploaded.length) throw cause;
      setError((cause as Error).message + " " + uploaded.length + " poster(s) were added; retry the remaining files.");
    } finally { setBusy(false); }
    return uploaded;
  }
  async function movieRequest(input: MovieRequest) {
    if (!writer.current) throw new Error("Connect the writing studio first.");
    return writer.current.movies(input);
  }
  async function importMovieImage(movie: Movie, image: MovieImage) {
    if ((entry.ranking?.items.length || 0) >= 40) throw new Error("A board can hold up to 40 posters.");
    if (mode !== "local" && !window.confirm("Save this TMDB image to the public GitHub repository and add it to Unranked? The image becomes public immediately, even for drafts. Only import images you are entitled to use.")) return null;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await movieRequest({ action: "download", movieId: movie.id, path: image.path, kind: image.kind });
      if (!result.content || !result.extension) throw new Error("No image was returned.");
      const bytes = fromBase64(result.content);
      const extension = imageExtension(bytes);
      const file = new File([bytes], `tmdb-${movie.id}.${extension}`, { type: extension === "jpg" ? "image/jpeg" : `image/${extension}` });
      const saved = await uploadAsset(file);
      setNotice(`${movie.title} added${result.resized ? " using a smaller TMDB image to fit the 5 MB limit" : " at original resolution"}.`);
      return { image: saved, title: movie.title };
    } finally { setBusy(false); }
  }
  function updateRanking(ranking: RankingData) {
    setEntry(current => ({ ...current, ranking: { ...ranking, boardImage: undefined } }));
    setDirty(true); setSavedLink(""); setConfirmation(null);
  }
  async function downloadRanking() {
    await run(async () => {
      if (!entry.ranking?.items.some(item => item.tier)) throw new Error("Place at least one poster in a tier first.");
      const blob = await renderRankingPng(entry.ranking, imageSources);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = (entry.slug || "my-tier-list") + ".png"; link.click();
      URL.revokeObjectURL(url);
      setNotice("Ranking image downloaded. Nothing was published.");
    });
  }

  return <main className="page writer-page">
    <div className="page-toolbar">
      <a className="back-link" href={mode === "session" ? "https://mingyuanren.github.io/" : "/"} onClick={event => { if (!canLeave()) event.preventDefault(); }}>← Mingyuan Ren</a>
      <span className="writer-eyebrow">{mode === "local" ? "LOCAL PREVIEW" : "WRITING"}</span>
    </div>
    <header className="writer-header"><h1>Write.</h1><p>Notes, passing thoughts, and very personal rankings.</p></header>

    {!connected ? <section className="writer-connect" aria-label="Connect">
      {mode === "local" ? <>
        <p>This is your local workspace. Nothing here commits or publishes to GitHub.</p>
        <button className="writer-primary" disabled={busy} onClick={() => void connect()}>Start writing locally</button>
        <p className="writer-help">Run <code>npm run cms</code> alongside the website.</p>
      </> : mode === "github" || mode === "session" ? <SignInCard
        href={mode === "session" ? "/auth/login" : studioOrigin ? studioOrigin + "/admin/" : undefined}
        checking={mode === "session" && !sessionChecked} failed={signInFailed} />
        : <p>{mode === "loading" ? "Opening your workspace…" : "Open this editor at localhost:3000 or mingyuanren.github.io."}</p>}
    </section> : <>
      <div className="writer-categories" role="group" aria-label="Writing categories">
        {categories.map(category => <button key={category.id} aria-pressed={entry.section === category.id} disabled={busy} onClick={() => { if (entry.section !== category.id) newArticle(category.id); }}>
          {category.title}
        </button>)}
      </div>
      <p className="writer-category-description">{categories.find(category => category.id === entry.section)?.description}</p>
      {entry.section === "pictures" && galleryWriter ? <PictureEditor writer={galleryWriter} local={mode === "local"} imageSources={imageSources} onUpload={uploadAsset} onDirty={setDirty} onBusy={setBusy} /> : <>
      <div className="writer-library">
        <details><summary>{entry.section === "essays" ? "Moments" : "Articles"} <span>({categoryFiles.length})</span></summary>
          <div className="writer-file-list">
            {categoryFiles.length === 0 ? <p className="writer-help">Nothing here yet.</p> : categoryFiles.map(file =>
              <button key={file.path} disabled={busy} onClick={() => void openArticle(file.path)}>{file.path.replace("content/", "").replace(/\.md$/, "")}</button>)}
            <button disabled={busy} onClick={() => void run(async () => setFiles(await writer.current!.list()))}>Refresh list</button>
          </div>
        </details>
        <button disabled={busy} onClick={() => newArticle()}>New {entry.section === "essays" ? "moment" : entry.section === "rankings" ? "tier list" : "article"} +</button>
      </div>
      <fieldset className="writer-form" disabled={busy}>
        <label className="writer-label writer-language">I write in<select value={entry.language} disabled={!!opened} onChange={event => update("language", event.target.value)}><option value="zh">中文</option><option value="en">English</option></select></label>
        {!moment && <label className="writer-label writer-title-label">Title<input className="writer-title" value={entry.title} placeholder={entry.ranking ? "What are we ranking?" : "Untitled"} onChange={event => update("title", event.target.value)} /></label>}
        <details className="writer-details"><summary>{moment ? "Optional title & details" : "Publication details"}</summary>
        {moment && <label className="writer-label">Title <span>(optional)</span><input value={entry.title} placeholder="Leave blank. A few lines are enough." onChange={event => update("title", event.target.value)} /></label>}
        <div className="writer-fields">
          <label className="writer-label">Date<input type="date" value={entry.date} onChange={event => update("date", event.target.value)} /></label>
          <label className="writer-label">URL name <span>(optional)</span><input value={entry.slug} disabled={!!opened} placeholder="Generated automatically" onChange={event => update("slug", event.target.value)} /></label>
        </div>
        <label className="writer-label">Summary <span>(optional)</span><input value={entry.description} placeholder="A line or two for the article list." onChange={event => update("description", event.target.value)} /></label>
        </details>
        {entry.section === "rankings" && !entry.ranking && <div className="writer-legacy">
          <p>This is an existing Markdown article. Your text is unchanged.</p>
          <button onClick={() => updateRanking({ version: 1, items: [] })}>Add a tier-list board</button>
        </div>}
        <div className="writer-editor-toolbar">
          <div className="language-switch" aria-label="Editor view"><button aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button><span>/</span><button aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button></div>
          {!entry.ranking && <button onClick={() => imageInput.current?.click()}>Add image</button>}
          <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
        </div>
        {preview ? <article className="writer-preview">
          {!moment && <h2>{entry.title || "Untitled"}</h2>}
          <div className="post-meta">{entry.language === "zh" ? "中文" : "English"}</div>
          {entry.body ? <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }} /> : <p className="writer-help">Your preview will appear here.</p>}
          {entry.ranking && <RankingArticle ranking={entry.ranking} preview imageSources={imageSources} language={entry.language} />}
        </article> : <>
          {entry.ranking && <h2 className="writer-step"><span>01</span> Set the scene</h2>}
          <label className={"writer-body-label" + (entry.ranking ? " writer-introduction" : moment ? " writer-moment-body" : "")}>
            <span className={entry.ranking ? "writer-label" : "writer-sr-only"}>{entry.ranking ? "Introduction" : moment ? "Your moment" : "Markdown body"}</span>
            <textarea value={entry.body} placeholder={entry.ranking ? "A few words before the ranking. What did you watch? What matters to you?" : moment ? "有些念头，一段就够了。" : "Start writing…\n\nMarkdown works here. 中文也可以。"} onChange={event => update("body", event.target.value)} />
          </label>
          {entry.ranking && <>
            <h2 className="writer-step"><span>02</span> Make your ranking</h2>
            <RankingEditor value={entry.ranking} onChange={updateRanking} onUpload={uploadPosters} onMovieRequest={movieRequest} onImport={importMovieImage} disabled={busy} imageSources={imageSources} />
            <button className="writer-export-image" onClick={() => void downloadRanking()}>Download ranking image ↓</button>
          </>}
        </>}
        {!entry.ranking && <p className="writer-help">{moment ? "No title needed. Write as little or as much as you like." : "# Heading · **bold** · [link](url) · code fences · lists · images"}</p>}
        <div className="writer-actions">
          <button className="writer-primary" onClick={() => requestSave(false)}>{translating ? "Translating & publishing…" : mode === "local" ? "Publish locally" : "Publish"}</button>
          <button onClick={() => requestSave(true)}>Save draft</button>
          <button onClick={download}>Download .md</button>
          <span className="writer-help" role="status">{translating ? "Creating both versions. Please keep this tab open." : busy ? "Saving…" : dirty ? "Unsaved changes" : opened ? entry.draft ? "Draft" : "Published" : ""}</span>
        </div>
        <p className="writer-help">Publish sends your text to OpenAI (GPT-5.6) and uses API credits to publish both 中文 and English. Republishing regenerates the other language, replacing its previous wording. Save draft does not translate.</p>
      </fieldset>
      <div ref={feedback}>
        {error && <p className="writer-error" role="alert">{error}{mode === "session" && <> <a href="/auth/login" target="_blank" rel="noreferrer">Sign in again in a new tab ↗</a></>}</p>}
        {notice && <p className="writer-notice" role="status">{notice}</p>}
      </div>
      {confirmation && <section className="writer-confirm" aria-label="Confirm GitHub commit">
        <p>{confirmation === "draft" ? "Save this draft to the public GitHub repository? It will not appear on the website, but its source and history will be public." : "Translate and publish both versions? Your text is sent to OpenAI using API credits. The other language version will be regenerated. Both versions, uploaded images and Git history are public. Nothing is published if translation fails; uploaded images may remain."}</p>
        <button className="writer-primary" disabled={busy} onClick={() => void save(confirmation === "draft")}>Confirm {confirmation === "draft" ? "draft save" : "publish"}</button>
        <button disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button>
      </section>}
      <details className="writer-setup"><summary>Translation setup</summary>
        {mode === "local" ? <p className="writer-help">Set <code>OPENAI_API_KEY</code> in the git-ignored <code>.env.translation</code> file and restart <code>npm run cms</code>. Do not put the key in chat or your article.</p> : <p className="writer-help">Translation uses the repository’s <code>OPENAI_API_KEY</code> Actions secret. The GitHub App needs Contents and Actions read/write access to this website repository. Never enter API keys in your writing.</p>}
        <p className="writer-help">Readers only load pre-generated pages. They cannot trigger paid translations.</p>
      </details>
      </>}
      <p className="writer-privacy">{mode === "local" ? "Local saves stay on this computer. Nothing is committed or deployed." : "Public repository: saved drafts, uploads, and revision history are public, even before you publish. Do not include private work information."}</p>
      <div className="writer-connection">
        <span>{mode === "local" ? "Local files" : "MingyuanRen / MingyuanRen.github.io"}</span>
        <button disabled={busy} onClick={() => { if (!canLeave()) return; void run(async () => {
          await writer.current?.logout?.(); writer.current?.disconnect(); writer.current = null; setGalleryWriter(null); setConnected(false); setEntry(blank()); setOpened(null); setDirty(false); setConfirmation(null); setNotice(""); setError(""); setSavedLink("");
        }); }}>{mode === "local" ? "Disconnect" : "Sign out"}</button>
      </div>
    </>}
    {!connected && error && <p className="writer-error" role="alert">{error}</p>}
    {savedLink && <p className="writer-result"><a href={savedLink} target="_blank" rel="noreferrer">View article ↗</a>{mode !== "local" && <> · <a href="https://github.com/MingyuanRen/MingyuanRen.github.io/actions" target="_blank" rel="noreferrer">Check deployment ↗</a></>}</p>}
  </main>;
}
