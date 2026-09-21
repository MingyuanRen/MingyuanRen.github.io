import { readEntry, serializeEntry, validPostPath } from "./writing.mjs";
import { presentation } from "./post-order.mjs";

export function describeFile(path, source, sha) {
  const entry = readEntry(source, path);
  return { path, sha, title: entry.title || entry.body.trim().split(/\r?\n/)[0]?.slice(0, 80) || "Untitled",
    ...presentation(entry), date: entry.date,
    images: (entry.ranking?.items || []).map(({ image, title, tmdbId }) => ({ image, title, ...(tmdbId ? { tmdbId } : {}) })),
    language: entry.language, state: entry.trashed ? "trash" : entry.draft ? "drafts" : "published" };
}

export async function loadLibrary(writer) {
  const listed = await writer.list();
  const result = new Array(listed.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, listed.length) }, async () => {
    while (cursor < listed.length) {
      const index = cursor++, file = listed[index];
      try {
        const loaded = await writer.read(file.path);
        result[index] = describeFile(file.path, loaded.source, loaded.sha);
      } catch (error) {
        if (error.status === 401 || error.status === 403) throw error;
        result[index] = { ...file, title: file.path.split("/").pop(), language: file.path.endsWith(".zh.md") ? "zh" : "en", state: "unavailable" };
      }
    }
  }));
  return result;
}

// Reuse revision-checked saves. No permanent deletion, image changes or translation.
export async function changeTrashState(writer, targets, trashed) {
  if (typeof trashed !== "boolean") throw new Error("Invalid trash status.");
  return reviseVersions(writer, targets, entry => {
    if (!!entry.trashed === trashed) throw new Error("This article's status changed. Refresh the library first.");
    return { ...entry, trashed, draft: true };
  });
}
export async function changePresentation(writer, targets, value) {
  const fields = presentation(value);
  return reviseVersions(writer, targets, entry => {
    if (entry.trashed) throw new Error("Restore the article before changing its display order.");
    const rest = { ...entry }; delete rest.order; delete rest.pinned;
    return { ...rest, ...fields };
  });
}
async function reviseVersions(writer, targets, transform) {
  if (!Array.isArray(targets) || !targets.length || targets.length > 2 ||
      new Set(targets.map(file => file.path)).size !== targets.length ||
      targets.some(file => !validPostPath(file.path) || !file.sha)) throw new Error("Choose saved article versions first.");
  const group = targets[0].path.replace(/\.(zh|en)\.md$/, "");
  if (targets.some(file => file.path.replace(/\.(zh|en)\.md$/, "") !== group)) throw new Error("Choose versions of the same article.");
  const prepared = [];
  for (const target of targets) {
    const file = await writer.read(target.path);
    if (file.sha !== target.sha) throw new Error("This article changed elsewhere. Refresh the library and reopen it first.");
    const entry = readEntry(file.source, target.path);
    const next = transform(entry);
    prepared.push({ ...serializeEntry(next, next.draft), sha: file.sha });
  }
  const saved = [];
  for (const file of prepared) {
    try {
      const result = await writer.save(file.path, file.source, file.sha);
      saved.push({ ...file, sha: result.sha });
    } catch {
      // A network error may arrive after GitHub accepted the write. Never retry.
      return { saved, error: "Could not confirm every change. Refresh the library to check both versions before retrying." };
    }
  }
  return { saved, error: "" };
}
