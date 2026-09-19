// Server-only TMDB adapter. Never accepts arbitrary URLs or exposes the API token.
import { imageExtension, toBase64 } from "./writing.mjs";
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export const validMovieImagePath = value => typeof value === "string" && /^\/[A-Za-z0-9]{1,100}\.(jpg|png|webp)$/.test(value);
const validId = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
const imageUrl = (path, size) => validMovieImagePath(path) ? `https://image.tmdb.org/t/p/${size}${path}` : null;
const title = value => typeof value === "string" ? value.slice(0, 200) : "";

async function bytes(response, limit) {
  if (Number(response.headers.get("Content-Length")) > limit) { await response.body?.cancel(); fail(413, "Image is too large. Choose another image or upload a smaller copy."); }
  const reader = response.body?.getReader();
  if (!reader) fail(502, "TMDB returned an empty response.");
  const chunks = []; let length = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.length;
    if (length > limit) { await reader.cancel(); fail(413, "Image is too large. Choose another image or upload a smaller copy."); }
    chunks.push(value);
  }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

export async function movieImages(input, { token, fetcher = fetch } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !["search", "images", "download"].includes(input.action)) fail(400, "Invalid image search request.");
  const { action } = input;
  const keys = action === "search" ? ["action", "query", "page"] : action === "images" ? ["action", "movieId"] : ["action", "movieId", "path", "kind"];
  if (Object.keys(input).some(key => !keys.includes(key))) fail(400, "Invalid image search request.");
  if (action === "search") {
    if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 120 || !Number.isInteger(input.page ?? 1) || (input.page ?? 1) < 1 || (input.page ?? 1) > 20) fail(400, "Enter a movie name (up to 120 characters).");
  } else if (!validId(input.movieId)) fail(400, "Choose a movie first.");
  if (action === "download" && (!validMovieImagePath(input.path) || !["poster", "backdrop"].includes(input.kind))) fail(400, "Choose an image from the search results.");
  if (!token?.trim()) fail(503, "Movie search needs a TMDB API Read Access Token. Add TMDB_READ_ACCESS_TOKEN to the server configuration; uploads still work.");
  async function request(url, authenticated = true) {
    let response;
    try { response = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(20_000), headers: authenticated ? { Authorization: `Bearer ${token.trim()}`, Accept: "application/json" } : {} }); }
    catch { fail(502, "TMDB could not be reached. Try again or upload an image."); }
    if (response.status === 401 || response.status === 403) fail(503, "TMDB rejected the server credential. Check TMDB_READ_ACCESS_TOKEN.");
    if (response.status === 429) fail(429, "TMDB is limiting requests. Wait a moment before trying again.");
    if (!response.ok) fail(502, "TMDB could not load these images. Try again or upload an image.");
    return response;
  }
  async function api(path) {
    const response = await request("https://api.themoviedb.org/3" + path);
    try { return JSON.parse(new TextDecoder().decode(await bytes(response, 2_000_000))); }
    catch { fail(502, "TMDB returned an invalid response."); }
  }
  if (action === "search") {
    const data = await api("/search/movie?" + new URLSearchParams({ query: input.query.trim(), language: "zh-CN", include_adult: "false", page: String(input.page ?? 1) }));
    return { movies: (Array.isArray(data.results) ? data.results : []).filter(movie => validId(movie.id) && !movie.adult).slice(0, 20).map(movie => ({
      id: movie.id, title: title(movie.title), originalTitle: title(movie.original_title),
      year: /^\d{4}-/.test(movie.release_date || "") ? movie.release_date.slice(0, 4) : "",
      thumbnail: imageUrl(movie.poster_path, "w185"),
    })), page: input.page ?? 1, pages: Math.min(20, Math.max(1, Number(data.total_pages) || 1)) };
  }
  const data = await api(`/movie/${input.movieId}/images`);
  const images = ["poster", "backdrop"].flatMap(kind => (Array.isArray(data[kind + "s"]) ? data[kind + "s"] : [])
    .filter(item => validMovieImagePath(item.file_path) && Number.isSafeInteger(item.width) && Number.isSafeInteger(item.height) && item.width > 0 && item.height > 0 && item.width <= 30000 && item.height <= 30000)
    .map(item => ({ path: item.file_path, kind, width: item.width, height: item.height, language: typeof item.iso_639_1 === "string" ? item.iso_639_1.slice(0, 8) : "No text", thumbnail: imageUrl(item.file_path, "w500") })))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  if (action === "images") return { images: images.slice(0, 240) };
  // Recheck membership before every download. CDN credentials are always omitted.
  const selected = images.find(image => image.path === input.path && image.kind === input.kind);
  if (!selected) fail(400, "This image is no longer available for that movie. Search again.");
  let content, resized = false;
  try { content = await bytes(await request(imageUrl(selected.path, "original"), false), 5 * 1024 * 1024); }
  catch (error) {
    if (error.status !== 413) throw error;
    resized = true;
    content = await bytes(await request(imageUrl(selected.path, selected.kind === "poster" ? "w780" : "w1280"), false), 5 * 1024 * 1024);
  }
  let extension;
  try { extension = imageExtension(content); } catch { fail(502, "The selected file is not a supported image."); }
  return { content: toBase64(content), extension, resized };
}
