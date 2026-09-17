import { notFound } from "next/navigation";
import { posts } from "../content";

export const dynamic = "force-static";
export function generateStaticParams() {
  return posts.map(post => ({ path: [post.section, post.slug, post.language] }));
}
type Props = { params: Promise<{ path: string[] }> };
async function getPost(params: Props["params"]) {
  const { path } = await params;
  const post = posts.find(p => p.section === path[0] && p.slug === path[1] && p.language === path[2] && path.length === 3);
  if (!post) notFound();
  return post;
}
export async function generateMetadata({ params }: Props) {
  const post = await getPost(params);
  return { title: `${post.title} — Mingyuan Ren`, description: post.description || undefined };
}
export default async function Article({ params }: Props) {
  const post = await getPost(params);
  const translations = posts.filter(p => p.section === post.section && p.slug === post.slug);
  const parent = post.section === "engineering" ? "/tech/" : `/personal/${post.section}/`;
  return (
    <main className="page article-page" lang={post.language === "zh" ? "zh-CN" : "en"}>
      <div className="page-toolbar">
        <a className="back-link" href={parent}>{post.language === "zh" ? "← 返回" : "← Back"}</a>
        {translations.length > 1 && <nav className="language-switch" aria-label="Article language">
          {translations.map(p => <a key={p.language} href={p.href} hrefLang={p.language} aria-current={p.language === post.language ? "page" : undefined}>{p.language === "zh" ? "中文" : "English"}</a>)}
        </nav>}
      </div>
      <article>
        <h1 className="article-title">{post.title}</h1>
        <time className="post-meta" dateTime={post.date}>{post.date}</time>
        <div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} />
      </article>
    </main>
  );
}
