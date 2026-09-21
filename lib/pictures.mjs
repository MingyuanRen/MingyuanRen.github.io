import { validRankingImage } from "./rankings.mjs";

export const galleryPath = "content/pictures/gallery.json";
export const emptyGallery = () => ({ version: 1, items: [] });

export function validateGallery(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.items) || value.items.length > 200 ||
      Object.keys(value).some(key => !["version", "items"].includes(key))) {
    throw new Error("Invalid picture collection (up to 200 pictures).");
  }
  const ids = new Set();
  const items = value.items.map(item => {
    if (!item || typeof item.id !== "string" || !/^[a-f0-9-]{36}$/.test(item.id) || ids.has(item.id) ||
        !validRankingImage(item.image) || typeof item.alt !== "string" || item.alt.length > 500 ||
        typeof item.caption !== "string" || item.caption.length > 2000 ||
        (item.tmdbId !== undefined && (!Number.isSafeInteger(item.tmdbId) || item.tmdbId <= 0 || item.tmdbId > 2147483647)) ||
        Object.keys(item).some(key => !["id", "image", "alt", "caption", "tmdbId"].includes(key))) {
      throw new Error("Invalid picture. Use an uploaded image and a short description.");
    }
    ids.add(item.id);
    return { id: item.id, image: item.image, alt: item.alt, caption: item.caption, ...(item.tmdbId ? { tmdbId: item.tmdbId } : {}) };
  });
  return { version: 1, items };
}

export function parseGallery(source) {
  if (typeof source !== "string" || source.length > 600_000) throw new Error("Picture collection is too large.");
  return validateGallery(JSON.parse(source));
}

export function serializeGallery(value) {
  const source = JSON.stringify(validateGallery(value), null, 2) + "\n";
  parseGallery(source);
  return source;
}
