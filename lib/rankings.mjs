/** @typedef {"s" | "a" | "b" | "c" | "d"} TierId */
/** @typedef {{id: string, title: string, image: string, tier: TierId | null, reason: string, tmdbId?: number}} RankingItem */
/** @typedef {{version: 1, items: RankingItem[], boardImage?: string, commentary?: string}} RankingData */

/** @type {ReadonlyArray<Readonly<{id: TierId, label: string, color: string}>>} */
export const tiers = Object.freeze([
  { id: "s", label: "夯", color: "#ed3825" },
  { id: "a", label: "顶级", color: "#f4c94d" },
  { id: "b", label: "人上人", color: "#f8ef32" },
  { id: "c", label: "NPC", color: "#f8efcc" },
  { id: "d", label: "拉完了", color: "#ffffff" },
].map(tier => Object.freeze(tier)));

const tierIds = new Set(tiers.map(tier => tier.id));
const uploadImagePattern = /^\/uploads\/(?:tmdb-[1-9][0-9]{0,9}-)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|gif|webp)$/;
export function validRankingImage(value) {
  return typeof value === "string" && uploadImagePattern.test(value);
}

function record(value, requiredKeys, optionalKeys = []) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    requiredKeys.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => requiredKeys.includes(key) || optionalKeys.includes(key));
}

// Validation returns a new value, preserving every item and its original order.
// Reusing the same poster is allowed; identity belongs to the unique item ID.
/**
 * @param {unknown} value
 * @param {{published?: boolean}} options
 * @returns {RankingData}
 */
export function validateRanking(value, { published = false } = {}) {
  if (!record(value, ["version", "items"], ["boardImage", "commentary"]) || value.version !== 1 || !Array.isArray(value.items)) {
    throw new Error("排名数据格式无效（需 version: 1）。");
  }
  if (value.items.length > 40) throw new Error("每篇排名最多放 40 部作品。");
  if (published && value.items.length === 0) throw new Error("发布前请至少添加一部作品。");
  if (value.boardImage !== undefined && !validRankingImage(value.boardImage)) {
    throw new Error("排名图片必须是本站上传的图片。");
  }
  if (value.commentary !== undefined && (typeof value.commentary !== "string" || value.commentary.length > 100_000)) {
    throw new Error("排名图后的正文需为文字，且不超过 100,000 字符。");
  }
  const ids = new Set();
  const items = Array.from(value.items, item => {
    if (!record(item, ["id", "title", "image", "tier", "reason"], ["tmdbId"]) ||
        (item.tmdbId !== undefined && (!Number.isSafeInteger(item.tmdbId) || item.tmdbId <= 0 || item.tmdbId > 2147483647)) ||
        typeof item.id !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,99}$/u.test(item.id) ||
        typeof item.title !== "string" || item.title.length > 200 ||
        typeof item.reason !== "string" || item.reason.length > 10_000 ||
        !validRankingImage(item.image) || (item.tier !== null && !tierIds.has(item.tier))) {
      throw new Error("作品数据无效：请使用本站图片、有效分档和不超过 200 字符的名称、10,000 字符的理由。");
    }
    if (ids.has(item.id)) throw new Error("作品 ID 重复，请重新添加该作品。");
    if (published && item.tier === null) throw new Error("发布前请将每部作品放进一个分档。");
    if (published && !item.title.trim()) throw new Error("发布前请填写每部作品的名称。");
    ids.add(item.id);
    return { id: item.id, title: item.title, image: item.image, tier: item.tier, reason: item.reason, ...(item.tmdbId !== undefined ? { tmdbId: item.tmdbId } : {}) };
  });
  return { version: 1, items, ...(value.boardImage !== undefined ? { boardImage: value.boardImage } : {}),
    ...(value.commentary !== undefined ? { commentary: value.commentary } : {}),
  };
}
