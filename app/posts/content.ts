import { publishedPosts } from "../../lib/markdown.mjs";

// Vite resolves files at build time. Draft bodies are never passed to clients.
const sources = import.meta.glob<string>("/content/*/*.md", {
  eager: true, query: "?raw", import: "default",
});
export const posts = publishedPosts(sources);
export type Post = (typeof posts)[number];
export type PostSummary = Pick<Post, "section" | "slug" | "language" | "title" | "date" | "description" | "href"> & { format?: "moment"; momentHtml?: string; pinned?: boolean; order?: number };
export function summaries(section: string): PostSummary[] {
  return posts.filter(post => post.section === section).map(post => ({
    section: post.section, slug: post.slug, language: post.language, title: post.title,
    date: post.date, description: post.description, href: post.href,
    pinned: post.pinned, order: post.order,
    ...("format" in post && post.format === "moment" ? { format: "moment" as const, momentHtml: post.html } : {}),
  }));
}
