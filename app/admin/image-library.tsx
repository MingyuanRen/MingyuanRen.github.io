"use client";
/* eslint-disable @next/next/no-img-element -- Validated existing upload URLs only. */
import { useState } from "react";
import { validRankingImage } from "../../lib/rankings.mjs";
export type LibraryImage = { image: string; title: string; tmdbId?: number };
export default function ImageLibrary({ load, onChoose, disabled = false, imageSources = {} }: {
  load(): Promise<{ images: LibraryImage[]; truncated?: boolean }>;
  onChoose(image: LibraryImage): void; disabled?: boolean; imageSources?: Record<string, string>;
}) {
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false);
  const [items, setItems] = useState<LibraryImage[]>([]), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [page, setPage] = useState(0), [truncated, setTruncated] = useState(false);
  async function refresh() {
    setBusy(true); setError("");
    try {
      const result = await load();
      setItems(result.images.filter(item => validRankingImage(item.image))); setTruncated(!!result.truncated); setPage(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the image library."); }
    finally { setBusy(false); }
  }
  const filtered = items.filter(item => `${item.title} ${item.image}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="image-library" aria-label="Reusable images">
    <button type="button" disabled={disabled || busy} aria-expanded={opened} onClick={() => { setOpened(!opened); if (!opened) void refresh(); }}>{opened ? "Close image library" : "Choose existing image"}</button>
    {opened && <div>
      <p className="writer-help">Reuse an uploaded file without uploading or searching again. Choosing does not publish. {truncated && "GitHub returned only the first 1,000 files."}</p>
      <label className="writer-label">Find an image<input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Film title or filename" /></label>
      <button disabled={disabled || busy} onClick={() => void refresh()}>Refresh images</button>
      {busy ? <p className="writer-help" role="status">Loading images…</p> : <>
        {!filtered.length && <p className="writer-help">No images found. You can still upload a new one.</p>}
        <div className="image-library-grid">{filtered.slice(page * 12, (page + 1) * 12).map(item => <button key={item.image} disabled={disabled} onClick={() => { onChoose(item); setOpened(false); }} title={item.title}>
          <img src={imageSources[item.image] || item.image} alt={item.title} loading="lazy" /><span>{item.title}</span>
        </button>)}</div>
        {filtered.length > 12 && <div className="writer-shelves"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Previous</button><span>{page + 1} / {Math.ceil(filtered.length / 12)}</span><button disabled={(page + 1) * 12 >= filtered.length} onClick={() => setPage(page + 1)}>Next →</button></div>}
      </>}
      {error && <p role="alert" className="writer-error">{error}</p>}
    </div>}
  </section>;
}
