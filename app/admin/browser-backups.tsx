"use client";
import { useEffect, useRef, useState } from "react";
import { readBackups, saveBackup, removeBackup } from "../../lib/browser-drafts.mjs";

type Snapshot<T> = { id: string; updatedAt: number; entry: T; opened: { path: string; sha: string } | null };
export default function BrowserBackups<T extends { title: string; body: string; section: string; language: string }>({ entry, opened, dirty, enabled, documentKey, onRestore }: {
  entry: T; opened: Snapshot<T>["opened"]; dirty: boolean; enabled: boolean; documentKey: number;
  onRestore(value: Snapshot<T>): void;
}) {
  const [items, setItems] = useState<Snapshot<T>[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const active = useRef({ documentKey: -1, id: "" });
  useEffect(() => {
    const refresh = () => { try { setItems(readBackups(localStorage)); } catch { setError("Browser storage is unavailable. Save a draft or download your writing."); } };
    refresh(); window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  useEffect(() => {
    if (!enabled || !dirty) return;
    if (active.current.documentKey !== documentKey) active.current = { documentKey, id: crypto.randomUUID() };
    const id = active.current.id;
    function persist() {
      try {
        saveBackup(localStorage, { id, updatedAt: Date.now(), entry, opened });
        setItems(readBackups(localStorage)); setStatus("Automatically saved in this browser."); setError("");
      } catch (cause) { setStatus(""); setError(cause instanceof Error ? cause.message : "Autosave failed. Save a draft or download your writing."); }
    }
    const timer = window.setTimeout(persist, 800);
    window.addEventListener("pagehide", persist);
    const hidden = () => { if (document.visibilityState === "hidden") persist(); };
    document.addEventListener("visibilitychange", hidden);
    // Flushing the previous snapshot also covers quick navigation within the studio.
    return () => { window.clearTimeout(timer); persist(); window.removeEventListener("pagehide", persist); document.removeEventListener("visibilitychange", hidden); };
  }, [entry, opened, dirty, enabled, documentKey]);
  return <section className="browser-backups" aria-label="Browser autosave">
    <p className="writer-help" role="status">{error || (dirty && enabled ? status || "Saving browser backup…" : "Browser autosave is on for articles and tier lists.")} Backups stay on this browser, do not sync between computers, and never publish or translate.</p>
    {!!items.length && <details><summary>Browser backups ({items.length})</summary>
      <p className="writer-help">Recover opens a separate editing session. Saved revision checks still apply. Keep important writing in Drafts or download it; clearing browser data removes these backups.</p>
      {items.map(item => <div className="backup-row" key={item.id}>
        <span>{item.entry.title || item.entry.body.trim().slice(0, 40) || "Untitled"} · {item.entry.language === "zh" ? "中文" : "English"}</span>
        <button disabled={!enabled} onClick={() => onRestore(item)}>Recover</button>
        <button disabled={dirty || !enabled} onClick={() => {
          if (!window.confirm("Remove this browser backup? Saved articles are unaffected. Download it or save it to Drafts first if needed.")) return;
          try { removeBackup(localStorage, item.id); setItems(readBackups(localStorage)); } catch { setError("Could not remove this backup."); }
        }}>Remove backup</button>
      </div>)}
    </details>}
  </section>;
}
