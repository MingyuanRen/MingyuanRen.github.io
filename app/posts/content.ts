import { publishedPosts } from "../../lib/markdown.mjs";

// Vite resolves files at build time. Draft bodies are never passed to clients.
const sources = import.meta.glob<string>("/content/*/*.md", {
  eager: true, query: "?raw", import: "default",
});
export const posts = publishedPosts(sources);
export type Post = (typeof posts)[number];
export type PostSummary = Omit<Post, "html" | "draft">;
export function summaries(section: string): PostSummary[] {
  return posts.filter(post => post.section === section).map(post => ({
    section: post.section, slug: post.slug, language: post.language, title: post.title,
    date: post.date, description: post.description, href: post.href,
  }));
}
