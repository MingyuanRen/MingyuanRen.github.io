import { excerpt } from "./text.mjs";

export const siteUrl = "https://mingyuanren.github.io";
export const siteName = "Mingyuan Ren";
export const siteDescription = "Infrastructure, literature, film, and things that live in the imagination.";
export const feeds = { zh: "/feed.xml", en: "/feed-en.xml" };

/** @returns {import("next").Metadata} */
export function pageMetadata({ title = siteName, description = siteDescription, path = "/", image = "/avatar.jpg", language = "en", article = false, languages = {} } = {}) {
  description = excerpt(description);
  const url = new URL(path, siteUrl).href;
  const images = [{ url: new URL(image, siteUrl).href, alt: title }];
  return {
    title, description,
    alternates: { canonical: url, languages },
    openGraph: { title, description, url, siteName, type: article ? "article" : "website", locale: language === "zh" ? "zh_CN" : "en_US", images },
    twitter: { card: image === "/avatar.jpg" ? "summary" : "summary_large_image", title, description, images: images.map(item => item.url) },
  };
}

// XML 1.0 disallows these control characters, even inside escaped text.
export function xml(value) {
  // These are deliberately removed to keep author text valid in XML 1.0.
  // eslint-disable-next-line no-control-regex
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "")
    .replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}
export function rssFeed(posts, language = "zh") {
  if (!Object.hasOwn(feeds, language)) throw new Error("Unsupported feed language");
  // Feed order is publication order, not the hand-curated order on the site.
  const entries = posts.filter(post => post.draft === false && post.language === language)
    .sort((a, b) => b.date.localeCompare(a.date) || a.href.localeCompare(b.href)).slice(0, 50);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${siteName} · ${language === "zh" ? "中文" : "English"}</title>
<link>${siteUrl}/</link><description>${xml(siteDescription)}</description><language>${language === "zh" ? "zh-CN" : "en"}</language>
<atom:link href="${siteUrl}${feeds[language]}" rel="self" type="application/rss+xml"/>
${entries.map(post => `<item><title>${xml(post.title)}</title><link>${xml(siteUrl + post.href)}</link><guid isPermaLink="true">${xml(siteUrl + post.href)}</guid><description>${xml(excerpt(post.description || post.excerpt || post.title, 400))}</description><pubDate>${new Date(post.date + "T00:00:00Z").toUTCString()}</pubDate><category>${xml(post.section)}</category></item>`).join("\n")}
</channel></rss>`;
}
