"use client";
import { useEffect, useRef, useState } from "react";
import "./picture-gallery.css";
import TmdbCredit from "./tmdb-credit";

export type Picture = { id: string; image: string; alt: string; caption: string; tmdbId?: number };
export type Gallery = { version: number; items: Picture[] };

export default function PictureGallery({ items, imageSources = {} }: { items: Picture[]; imageSources?: Record<string, string> }) {
  const [active, setActive] = useState<string | null>(null);
  const index = items.findIndex(item => item.id === active);
  return <><div className="picture-gallery">
    {items.map((item, index) => <figure key={item.id} className="picture-tile">
      <a href={imageSources[item.image] || item.image} target="_blank" rel="noreferrer" aria-label={item.alt || `Open picture ${index + 1}`}
        onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); setActive(item.id); }}>
        {/* Preserve the full frame; no cropping or forced aspect ratio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSources[item.image] || item.image} alt={item.alt} loading="lazy" decoding="async" />
      </a>
      {item.caption && <figcaption>{item.caption}</figcaption>}
      {item.tmdbId && <figcaption><a href={`https://www.themoviedb.org/movie/${item.tmdbId}`} target="_blank" rel="noreferrer">Image source: TMDB ↗</a></figcaption>}
    </figure>)}
  </div>{items.some(item => item.tmdbId) && <TmdbCredit />}
    {index >= 0 && <PictureLightbox items={items} index={index} imageSources={imageSources}
      onMove={delta => setActive(items[(index + delta + items.length) % items.length].id)} onClose={() => setActive(null)} />}
  </>;
}

function PictureLightbox({ items, index, imageSources, onMove, onClose }: {
  items: Picture[]; index: number; imageSources: Record<string, string>; onMove(delta: number): void; onClose(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const item = items[index];
  const source = imageSources[item.image] || item.image;
  useEffect(() => {
    const modal = dialog.current!;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    modal.showModal(); closeButton.current?.focus(); document.body.style.overflow = "hidden";
    return () => { modal.close(); document.body.style.overflow = overflow; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, []);
  return <dialog ref={dialog} className="picture-lightbox" aria-label="Picture viewer" aria-describedby="picture-viewer-caption"
    onCancel={event => { event.preventDefault(); onClose(); }} onClose={onClose}
    onKeyDown={event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); onMove(event.key === "ArrowRight" ? 1 : -1); }
    }}>
    <div className="picture-viewer-toolbar">
      <span aria-live="polite" aria-atomic="true">{index + 1} / {items.length}</span>
      <a href={source} target="_blank" rel="noreferrer">Original ↗</a>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Close picture viewer">Close ×</button>
    </div>
    <div className="picture-viewer-stage"
      onTouchStart={event => { swipe.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null; }}
      onTouchMove={event => { if (event.touches.length !== 1) swipe.current = null; }}
      onTouchCancel={() => { swipe.current = null; }}
      onTouchEnd={event => {
        const start = swipe.current; swipe.current = null;
        if (!start || event.touches.length || event.changedTouches.length !== 1) return;
        const dx = event.changedTouches[0].clientX - start.x, dy = event.changedTouches[0].clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onMove(dx < 0 ? 1 : -1);
      }}>
      <button type="button" className="picture-viewer-prev" disabled={items.length < 2} onClick={() => onMove(-1)} aria-label="Previous picture">←</button>
      {failed === source ? <p role="status">This picture could not be loaded. Try opening the original.</p> :
        /* eslint-disable-next-line @next/next/no-img-element */
        <img key={source} src={source} alt={item.alt || `Picture ${index + 1}`} onError={() => setFailed(source)} draggable={false} />}
      <button type="button" className="picture-viewer-next" disabled={items.length < 2} onClick={() => onMove(1)} aria-label="Next picture">→</button>
    </div>
    <div id="picture-viewer-caption" className="picture-viewer-caption" aria-live="polite">
      {item.caption && <p>{item.caption}</p>}
      {item.tmdbId && <a href={`https://www.themoviedb.org/movie/${item.tmdbId}`} target="_blank" rel="noreferrer">Image source: TMDB ↗</a>}
    </div>
  </dialog>;
}
