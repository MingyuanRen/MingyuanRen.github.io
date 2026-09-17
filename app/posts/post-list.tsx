import type { PostSummary } from "./content";

export default function PostList({ posts, language }: { posts: PostSummary[]; language?: "zh" | "en" }) {
  // Prefer the selected language, but keep untranslated originals discoverable.
  const grouped = new Map<string, PostSummary>();
  for (const post of posts) {
    if (!grouped.has(post.slug) || post.language === language) grouped.set(post.slug, post);
  }
  if (!grouped.size) return null;
  return (
    <ul className="post-list">
      {[...grouped.values()].map(post => (
        <li key={post.slug} lang={post.language === "zh" ? "zh-CN" : "en"}>
          <a href={post.href}>{post.title}</a>
          <div className="post-meta"><time dateTime={post.date}>{post.date}</time> · {post.language === "zh" ? "中文" : "English"}</div>
          {post.description && <p className="section-description">{post.description}</p>}
        </li>
      ))}
    </ul>
  );
}
