"use client";

import { useEffect, useRef, useState } from "react";
import PictureGallery, { type Gallery, type Picture } from "../components/picture-gallery";
import { emptyGallery, serializeGallery } from "../../lib/pictures.mjs";
import { imageExtension } from "../../lib/writing.mjs";
import "./picture-editor.css";

type GalleryWriter = {
  readGallery(): Promise<{ gallery: Gallery; sha?: string }>;
  saveGallery(gallery: Gallery, sha?: string): Promise<{ sha: string }>;
};
type Props = {
  writer: GalleryWriter; local: boolean; imageSources: Record<string, string>;
  onUpload(file: File): Promise<string>; onDirty(value: boolean): void; onBusy(value: boolean): void;
};

export default function PictureEditor({ writer, local, imageSources, onUpload, onDirty, onBusy }: Props) {
  const [gallery, setGallery] = useState<Gallery>(emptyGallery());
  const [sha, setSha] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    onBusy(true);
    writer.readGallery().then(result => {
      if (!active) return;
      setGallery(result.gallery); setSha(result.sha); setLoaded(true);
    }).catch(cause => { if (active) setError(cause.message); }).finally(() => {
      if (active) { setBusy(false); onBusy(false); }
    });
    return () => { active = false; };
  }, [writer, onBusy, loadAttempt]);

  function change(items: Picture[]) {
    setGallery({ version: 1, items }); setDirty(true); onDirty(true); setNotice("");
  }
  function update(id: string, field: "alt" | "caption", value: string) {
    change(gallery.items.map(item => item.id === id ? { ...item, [field]: value } : item));
  }
  function move(index: number, delta: number) {
    const items = [...gallery.items];
    [items[index], items[index + delta]] = [items[index + delta], items[index]];
    change(items);
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); onBusy(true); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your pictures."); }
    finally { lock.current = false; setBusy(false); onBusy(false); }
  }
  async function upload(files: File[]) {
    if (!loaded || busy || !files.length) return;
    await run(async () => {
      if (gallery.items.length + files.length > 200) throw new Error("This collection can hold up to 200 pictures.");
      if (files.some(file => file.size > 5 * 1024 * 1024) || files.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) {
        throw new Error("Choose pictures under 5 MB each, up to 20 MB per batch.");
      }
      for (const file of files) imageExtension(new Uint8Array(await file.arrayBuffer()));
      if (!local && !window.confirm("Upload these pictures to the public GitHub repository now? Image files are public immediately, even before you save the collection.")) return;
      const items = [...gallery.items];
      for (const file of files) {
        const image = await onUpload(file);
        items.push({ id: crypto.randomUUID(), image, alt: "", caption: "" });
        // Keep successful uploads visible if a later file fails.
        change([...items]);
      }
      setNotice("Pictures added. Save the collection when you are ready.");
    });
  }
  async function save() {
    if (!local && !window.confirm("Publish this picture collection? Images, captions and Git history are public. Removing a picture from the collection does not delete its uploaded file.")) return;
    await run(async () => {
      const result = await writer.saveGallery(gallery, sha);
      setSha(result.sha); setDirty(false); onDirty(false);
      setNotice(local ? "Collection saved locally. Nothing committed or deployed." : "Collection committed. Your gallery will update when GitHub Pages finishes deploying.");
    });
  }
  function download() {
    const url = URL.createObjectURL(new Blob([serializeGallery(gallery)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "gallery.json"; link.click(); URL.revokeObjectURL(url);
  }

  return <section className="picture-editor" aria-label="Picture collection">
    {!loaded && <p className="writer-help">{busy ? "Opening your collection…" : "Could not open the collection."}</p>}
    {!loaded && !busy && <button onClick={() => { setBusy(true); setError(""); setLoadAttempt(value => value + 1); }}>Try again</button>}
    <fieldset disabled={busy || !loaded}>
      <div className="writer-editor-toolbar">
        <div className="language-switch" aria-label="Picture view">
          <button aria-pressed={!preview} onClick={() => setPreview(false)}>Arrange</button><span>/</span>
          <button aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
        </div>
        <span className="writer-help">{gallery.items.length} pictures</span>
      </div>
      {preview ? <PictureGallery items={gallery.items} imageSources={imageSources} /> : <>
        <div className={"picture-upload" + (dragging ? " is-dragging" : "")}
          onDragOver={event => { event.preventDefault(); if (!busy && loaded) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); void upload(Array.from(event.dataTransfer.files)); }}>
          <p>Drop pictures here</p>
          <button onClick={() => input.current?.click()}>Choose pictures</button>
          <p className="writer-help">PNG, JPEG, WebP or GIF · 5 MB each · 20 MB per batch</p>
          <input ref={input} hidden type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; void upload(files); }} />
        </div>
        <div className="picture-edit-list">
          {gallery.items.map((item, index) => <section key={item.id} className="picture-edit-item" aria-label={`Picture ${index + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSources[item.image] || item.image} alt={item.alt} />
            <div>
              <label className="writer-label">Caption <span>(optional)</span><textarea rows={2} maxLength={2000} value={item.caption} onChange={event => update(item.id, "caption", event.target.value)} placeholder="A film, a scene, a passing thought… or nothing at all." /></label>
              <label className="writer-label">Image description <span>(for accessibility, optional)</span><input maxLength={500} value={item.alt} onChange={event => update(item.id, "alt", event.target.value)} /></label>
              <div className="picture-item-actions">
                <button aria-label={`Move picture ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}>↑ Earlier</button>
                <button aria-label={`Move picture ${index + 1} later`} disabled={index === gallery.items.length - 1} onClick={() => move(index, 1)}>↓ Later</button>
                <button onClick={() => { if (window.confirm("Remove this picture from the collection? The original upload stays saved.")) change(gallery.items.filter(picture => picture.id !== item.id)); }}>Remove</button>
              </div>
            </div>
          </section>)}
        </div>
      </>}
      <div className="writer-actions">
        <button className="writer-primary" disabled={!dirty} onClick={() => void save()}>{busy ? "Saving…" : local ? "Save collection locally" : "Publish collection"}</button>
        <button onClick={download}>Download collection</button>
        <span className="writer-help">{dirty ? "Unsaved changes" : loaded ? "Saved" : ""}</span>
      </div>
      <p className="writer-help">No title or date needed. Captions are optional and stay in the language you write. No AI translation or API charge. Download collection backs up the list, not the image files.</p>
    </fieldset>
    {error && <p className="writer-error" role="alert">{error}</p>}
    {notice && <p className="writer-notice" role="status">{notice}</p>}
    {loaded && <p className="writer-result"><a href="/personal/pictures/" target="_blank" rel="noreferrer">View Picture ↗</a>{!local && <> · <a href="https://github.com/MingyuanRen/MingyuanRen.github.io/actions" target="_blank" rel="noreferrer">Check deployment ↗</a></>}</p>}
  </section>;
}
