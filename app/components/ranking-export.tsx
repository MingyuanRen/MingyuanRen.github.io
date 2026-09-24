"use client";
import { useEffect, useRef, useState } from "react";
import type { RankingData, ImageSources } from "./ranking-board";
import { exportFilename } from "../../lib/export-layout.mjs";
import "./ranking-export.css";

export default function RankingExport({ ranking, title = "", imageSources = {}, language = "en", disabled = false }: {
  ranking: RankingData; title?: string; imageSources?: ImageSources; language?: string; disabled?: boolean;
}) {
  const [reviews, setReviews] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; name: string; ranking: RankingData; title: string } | null>(null);
  const inFlight = useRef(false);
  const zh = language === "zh";
  useEffect(() => () => { if (result) URL.revokeObjectURL(result.url); }, [result]);
  async function download() {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setError(""); setResult(null);
    try {
      const { renderRankingPng } = await import("../../lib/ranking-image");
      const blob = await renderRankingPng(ranking, imageSources, { title, includeReasons: reviews, highResolution: true });
      const url = URL.createObjectURL(blob), name = exportFilename(title, reviews);
      setResult({ url, name, ranking, title });
      const link = document.createElement("a"); link.href = url; link.download = name; link.click();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export this ranking."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="ranking-export" aria-label={zh ? "导出排名图片" : "Export ranking image"}>
    <div className="ranking-export-actions">
      <label><input type="checkbox" checked={reviews} disabled={busy || disabled} onChange={event => { setReviews(event.target.checked); setResult(null); }} />{zh ? "附上短评" : "Include reviews"}</label>
      <button type="button" disabled={busy || disabled || !ranking.items.some(item => item.tier !== null)} onClick={() => void download()}>{busy ? (zh ? "正在生成…" : "Generating…") : (zh ? "导出 PNG ↓" : "Export PNG ↓")}</button>
    </div>
    <p className="ranking-export-help">{zh ? "在当前设备生成高清图片，不上传、不发布。只导出已分档的作品；短评以纯文本保留。" : "High-resolution image, made on your device. No upload or publication. Ranked items only; reviews use plain text."}</p>
    {error && <p role="alert">{error}</p>}
    {result && result.ranking === ranking && result.title === title && <p role="status">{zh ? "图片已生成。" : "Image ready. "}<a href={result.url} download={result.name}>{zh ? "再次下载" : "Download again"}</a> · <a href={result.url} target="_blank" rel="noreferrer">{zh ? "打开图片" : "Open image"}</a></p>}
  </section>;
}
