export function presentation(value) {
  if (value.pinned !== undefined && typeof value.pinned !== "boolean") throw new Error("Pinned must be boolean.");
  if (value.order !== undefined && (!Number.isSafeInteger(value.order) || value.order < 0 || value.order > 999999)) throw new Error("Display order must be a whole number between 0 and 999999.");
  return { ...(value.pinned !== undefined ? { pinned: value.pinned } : {}), ...(value.order !== undefined ? { order: value.order } : {}) };
}
export function comparePosts(a, b) {
  return Number(!!b.pinned) - Number(!!a.pinned) || (a.order ?? 1000000) - (b.order ?? 1000000) ||
    (b.date || "").localeCompare(a.date || "") || (a.slug || a.path || "").localeCompare(b.slug || b.path || "");
}
