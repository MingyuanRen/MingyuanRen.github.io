"use client";

import { useRef, useState, type DragEvent } from "react";
import { tiers } from "../../lib/rankings.mjs";
import type { ImageSources, RankingData, RankingItem, TierId } from "../components/ranking-board";
import "../components/ranking-board.css";
import "./ranking-editor.css";

export type { RankingData, RankingItem, TierId } from "../components/ranking-board";
const CARD_TYPE = "application/x-mingyuan-ranking-card";
const MAX_ITEMS = 40;

export default function RankingEditor({ value, onChange, onUpload, disabled = false, imageSources = {} }: {
  value: RankingData;
  onChange(value: RankingData): void;
  onUpload(files: File[]): Promise<Array<{ image: string; title: string }>>;
  disabled?: boolean;
  imageSources?: ImageSources;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const locked = disabled || uploading;
  const items = value.items;
  const ordered = [...tiers.flatMap(tier => items.filter(item => item.tier === tier.id)), ...items.filter(item => item.tier === null)];

  function change(next: RankingItem[]) { onChange({ ...value, items: next }); }
  function updateItem(id: string, update: Partial<RankingItem>) {
    change(items.map(item => item.id === id ? { ...item, ...update } : item));
  }
  function move(id: string, tier: TierId | null, beforeId?: string) {
    if (locked || id === beforeId) return;
    const item = items.find(item => item.id === id);
    if (!item) return;
    const next = items.filter(candidate => candidate.id !== id);
    const before = beforeId ? next.findIndex(candidate => candidate.id === beforeId && candidate.tier === tier) : -1;
    if (before >= 0) next.splice(before, 0, { ...item, tier });
    else {
      let after = -1;
      next.forEach((candidate, index) => { if (candidate.tier === tier) after = index; });
      next.splice(after < 0 ? next.length : after + 1, 0, { ...item, tier });
    }
    change(next);
    setStatus(`${item.title || "Untitled film"} → ${tiers.find(row => row.id === tier)?.label || "Unranked"}`);
  }
  function nudge(id: string, direction: -1 | 1) {
    const index = items.findIndex(item => item.id === id);
    const item = items[index];
    if (!item || locked) return;
    const peers = items.filter(peer => peer.tier === item.tier);
    const adjacent = peers[peers.findIndex(peer => peer.id === id) + direction];
    if (!adjacent) return;
    const next = [...items];
    const adjacentIndex = next.findIndex(peer => peer.id === adjacent.id);
    [next[index], next[adjacentIndex]] = [next[adjacentIndex], next[index]];
    change(next);
    setStatus(`${item.title || "Untitled film"} moved ${direction < 0 ? "earlier" : "later"}.`);
  }
  function allowDrop(event: DragEvent) {
    // Always prevent a dropped file from navigating away from unsaved writing.
    event.preventDefault();
    event.dataTransfer.dropEffect = !locked && event.dataTransfer.types.includes(CARD_TYPE) ? "move" : "none";
  }
  function drop(event: DragEvent, tier: TierId | null, beforeId?: string) {
    event.preventDefault(); event.stopPropagation(); setDragging(null);
    if (locked) return;
    const id = event.dataTransfer.getData(CARD_TYPE);
    if (items.some(item => item.id === id)) move(id, tier, beforeId);
    else if (event.dataTransfer.files.length) setError("Drop image files in the upload area above first.");
  }
  async function upload(files: File[]) {
    if (locked || !files.length) return;
    setError(""); setStatus("");
    if (items.length + files.length > MAX_ITEMS) { setError(`Keep each ranking to ${MAX_ITEMS} films or fewer.`); return; }
    if (files.some(file => !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) {
      setError("Choose JPG, PNG, GIF, or WebP images, each smaller than 5 MB."); return;
    }
    setUploading(true);
    try {
      const uploaded = await onUpload(files);
      if (uploaded.length) {
        change([...items, ...uploaded.map(file => ({ id: crypto.randomUUID(), image: file.image, title: file.title, tier: null, reason: "" }))]);
        setStatus(`${uploaded.length} poster${uploaded.length > 1 ? "s" : ""} added. Drag them into a row, or choose a tier below.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The images could not be uploaded. Please try again."); }
    finally { setUploading(false); }
  }
  function poster(item: RankingItem) {
    return <li className={`ranking-poster ranking-editable-poster${dragging === item.id ? " is-dragging" : ""}`} key={item.id}
      draggable={!locked} onDragStart={event => {
        if (locked) { event.preventDefault(); return; }
        event.dataTransfer.setData(CARD_TYPE, item.id); event.dataTransfer.effectAllowed = "move"; setDragging(item.id);
      }} onDragEnd={() => setDragging(null)} onDragOver={allowDrop} onDrop={event => drop(event, item.tier, item.id)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSources[item.image] || item.image} alt={item.title || "Untitled film poster"} width={96} height={144} draggable={false} />
      <span>{item.title || "Untitled film"}</span>
    </li>;
  }

  return <section className="ranking-editor" aria-label="Movie ranking builder" onDragOver={event => event.preventDefault()} onDrop={event => event.preventDefault()}>
    <p className="writer-help">Upload posters, then drag them into the five rows. Drop onto a poster to place yours before it. On a phone or keyboard, use the tier and order controls below.</p>
    <div className="ranking-upload" onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = locked ? "none" : "copy"; }}
      onDrop={event => { event.preventDefault(); event.stopPropagation(); void upload(Array.from(event.dataTransfer.files)); }}>
      <button type="button" disabled={locked || items.length >= MAX_ITEMS} onClick={() => fileInput.current?.click()}>{uploading ? "Uploading posters…" : "Upload film posters"}</button>
      <span>or drop image files here · {items.length}/{MAX_ITEMS} · up to 5 MB each</span>
      <input ref={fileInput} type="file" hidden multiple accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => {
        const files = Array.from(event.target.files || []); event.target.value = ""; void upload(files);
      }} />
    </div>
    <div className="ranking-unranked" onDragOver={allowDrop} onDrop={event => drop(event, null)}>
      <h3>Unranked <span>({items.filter(item => item.tier === null).length})</span></h3>
      {items.some(item => item.tier === null) ? <ul className="ranking-posters">{items.filter(item => item.tier === null).map(poster)}</ul>
        : <p className="writer-help">New posters wait here. You can also drag a ranked poster back.</p>}
    </div>
    <div className="ranking-board" aria-label="Drag posters into a tier">
      {tiers.map(tier => <div className="ranking-row" key={tier.id} onDragOver={allowDrop} onDrop={event => drop(event, tier.id as TierId)}>
        <div className="ranking-tier-label" style={{ backgroundColor: tier.color }} lang="zh-CN">{tier.label}</div>
        <ul className="ranking-posters" aria-label={`${tier.label} posters`}>{items.filter(item => item.tier === tier.id).map(poster)}</ul>
      </div>)}
    </div>
    {error && <p className="writer-error" role="alert">{error}</p>}
    <p className="ranking-status writer-help" role="status">{status || (items.some(item => item.tier === null) ? "Assign every poster a tier before publishing." : "The finished ranking will appear between your introduction and reasons.")}</p>
    <label className="writer-body-label ranking-commentary-input">
      <span className="writer-sr-only">Text below the ranking</span>
      <textarea aria-label="Text below the ranking" rows={4} maxLength={100000} value={value.commentary || ""} disabled={locked}
        onChange={event => onChange({ ...value, commentary: event.target.value })} />
    </label>
    {!items.length && <p className="writer-help">Upload a poster to start.</p>}
    <div className="ranking-reasons">
      {ordered.map(item => {
        const peers = items.filter(peer => peer.tier === item.tier);
        const position = peers.findIndex(peer => peer.id === item.id);
        return <fieldset className="ranking-film" key={item.id} disabled={locked}>
          <legend>{tiers.find(tier => tier.id === item.tier)?.label || "Unranked"} · {item.title || "Untitled film"}</legend>
          <div className="ranking-film-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSources[item.image] || item.image} alt="" width={48} height={72} />
            <label className="writer-label">Film title<input value={item.title} maxLength={160} onChange={event => updateItem(item.id, { title: event.target.value })} /></label>
            <label className="writer-label">Tier<select value={item.tier || ""} onChange={event => move(item.id, (event.target.value || null) as TierId | null)}>
              <option value="">Unranked</option>{tiers.map(tier => <option value={tier.id} key={tier.id}>{tier.label}</option>)}
            </select></label>
          </div>
          <div className="ranking-film-controls">
            <button type="button" disabled={locked || position === 0} onClick={() => nudge(item.id, -1)} aria-label={`Move ${item.title || "film"} earlier in its tier`}>← Earlier</button>
            <button type="button" disabled={locked || position === peers.length - 1} onClick={() => nudge(item.id, 1)} aria-label={`Move ${item.title || "film"} later in its tier`}>Later →</button>
            <button type="button" className="ranking-remove" onClick={() => {
              if (window.confirm(`Remove “${item.title || "Untitled film"}” and its reason from this ranking? The uploaded image file will be kept.`)) change(items.filter(candidate => candidate.id !== item.id));
            }}>Remove</button>
          </div>
          <label className="writer-label">Description<textarea rows={4} maxLength={10000} value={item.reason} onChange={event => updateItem(item.id, { reason: event.target.value })} /></label>
        </fieldset>;
      })}
    </div>
  </section>;
}
