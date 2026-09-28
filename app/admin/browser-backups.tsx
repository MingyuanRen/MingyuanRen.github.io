"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const pending = useRef<Snapshot<T> | null>(null);
  const persist = useCallback(() => {
    if (!pending.current) return;
    try {
      saveBackup(localStorage, pending.current); pending.current = null;
      setItems(readBackups(localStorage)); setStatus("Backed up in this browser."); setError("");
    } catch (cause) { setStatus(""); setError(cause instanceof Error ? cause.message : "Autosave failed. Save a draft or download your writing."); }
  }, []);
  useEffect(() => {
    const refresh = () => { try { setItems(readBackups(localStorage)); } catch { setError("Browser storage is unavailable. Save a draft or download your writing."); } };
    refresh(); window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);
  useEffect(() => {
    if (active.current.documentKey !== documentKey) {
      persist();
      active.current = { documentKey, id: crypto.randomUUID() };
    }
    // Flush the pending recovery copy before a save/disconnect can replace it.
    // This synchronizes external browser storage, rather than deriving UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled || !dirty) { persist(); return; }
    pending.current = { id: active.current.id, updatedAt: Date.now(), entry, opened };
    setStatus("Backing up…");
    const timer = window.setTimeout(persist, 800);
    // Do not synchronously serialize the previous article on every keystroke.
    return () => window.clearTimeout(timer);
  }, [entry, opened, dirty, enabled, documentKey, persist]);
  useEffect(() => {
    window.addEventListener("pagehide", persist);
    const hidden = () => { if (document.visibilityState === "hidden") persist(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { persist(); window.removeEventListener("pagehide", persist); document.removeEventListener("visibilitychange", hidden); };
  }, [persist]);
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
