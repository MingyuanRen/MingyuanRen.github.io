import { serializeEntry, validPostPath } from "./writing.mjs";
const prefix = "mingyuan-writing-backup-v1:";
export function readBackups(storage) {
  const items = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const item = JSON.parse(storage.getItem(key));
      validate(item);
      if (key === prefix + item.id) items.push(item);
    } catch { /* Leave invalid backups untouched; never inject them into the editor. */ }
  }
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}
function validate(item) {
  if (!item || !/^[a-f0-9-]{36}$/.test(item.id) || !Number.isFinite(item.updatedAt)) throw new Error("Invalid browser backup.");
  const entry = item.entry;
  serializeEntry({ ...entry, title: entry.title || "Untitled", slug: entry.slug || "browser-backup" }, true);
  if (item.opened && (!validPostPath(item.opened.path) || typeof item.opened.sha !== "string")) throw new Error("Invalid saved revision.");
}
export function saveBackup(storage, item) {
  validate(item);
  const key = prefix + item.id;
  if (!storage.getItem(key) && readBackups(storage).length >= 20) throw new Error("Browser backups are full (20). Save or download your writing, then remove an old backup.");
  storage.setItem(key, JSON.stringify(item));
}
export function removeBackup(storage, id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid backup.");
  storage.removeItem(prefix + id);
}
