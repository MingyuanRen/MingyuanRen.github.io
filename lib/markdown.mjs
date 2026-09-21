import MarkdownIt from "markdown-it";
import { parse as parseYaml } from "yaml";
import { validateRanking } from "./rankings.mjs";
import { presentation, comparePosts } from "./post-order.mjs";

// No raw HTML or executable MDX: author text remains text, including scripts.
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: true });
export function renderMarkdown(source) { return markdown.render(source); }
export const sections = ["engineering", "essays", "rankings"];

export function parsePost(source, path) {
  const match = path.match(/(?:^|\/)(engineering|essays|rankings)\/([\p{L}\p{N}][\p{L}\p{N}_-]*)\.(zh|en)\.md$/u);
  if (!match) throw new Error(`Invalid post path: ${path}`);
  const [, section, slug, language] = match;
  const parts = source.replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/);
  if (!parts) throw new Error(`Missing frontmatter in ${path}`);
  const data = parseYaml(parts[1], { maxAliasCount: 0 });
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Invalid frontmatter in ${path}`);
  if (data.draft !== undefined && typeof data.draft !== "boolean") throw new Error(`Draft must be boolean in ${path}`);
  if (data.trashed !== undefined && typeof data.trashed !== "boolean") throw new Error(`Trash status must be boolean in ${path}`);
  // CMS may save an unfinished translation. Never render or validate its body.
  if (data.draft !== false || data.trashed === true) return { section, slug, language, draft: true, title: "", date: "", description: "", html: "", href: "" };
  if (typeof data.title !== "string" || !data.title.trim()) throw new Error(`Missing title in ${path}`);
  if (typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
      !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) {
    throw new Error(`Date must be YYYY-MM-DD in ${path}`);
  }
  if (data.description !== undefined && typeof data.description !== "string") throw new Error(`Invalid description in ${path}`);
  if (data.format !== undefined && (data.format !== "moment" || section !== "essays")) throw new Error(`Invalid format in ${path}`);
  if (data.format === "moment" && !parts[2].trim()) throw new Error(`A moment needs some text in ${path}`);
  if (data.ranking !== undefined && section !== "rankings") throw new Error(`Rankings are only allowed in the rankings section: ${path}`);
  const ranking = data.ranking === undefined ? undefined : validateRanking(data.ranking, { published: true });
  return {
    ...presentation(data),
    section, slug, language, title: data.title.trim(), date: data.date,
    description: data.description || "",
    // Missing status fails closed so accidentally saved notes never appear.
    draft: data.draft !== false,
    html: markdown.render(parts[2]),
    href: `/posts/${section}/${encodeURIComponent(slug)}/${language}/`,
    ...(data.format !== undefined ? { format: data.format } : {}),
    ...(ranking !== undefined ? { ranking } : {}),
  };
}

export function publishedPosts(sources) {
  return Object.entries(sources).map(([path, source]) => parsePost(source, path))
    .filter(post => !post.draft)
    .sort(comparePosts);
}
