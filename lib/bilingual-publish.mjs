import { readEntry, serializeEntry, validPostPath } from "./writing.mjs";

export function otherLanguagePath(path) {
  if (!validPostPath(path)) throw new Error("Invalid article path.");
  return path.replace(/\.(zh|en)\.md$/, (_, language) => language === "zh" ? ".en.md" : ".zh.md");
}

export function publishedPair(source, path, translated) {
  const original = serializeEntry(readEntry(source, path), false);
  const target = otherLanguagePath(path);
  if (translated.path !== target) throw new Error("Unexpected translated article path. Nothing was published.");
  const translation = serializeEntry(readEntry(translated.source, target), false);
  return [original, translation];
}
