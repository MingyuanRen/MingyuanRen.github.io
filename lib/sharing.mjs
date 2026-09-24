import { excerpt } from "./text.mjs";

export const siteUrl = "https://mingyuanren.github.io";
export const siteName = "Mingyuan Ren";
export const siteDescription = "Infrastructure, literature, film, and things that live in the imagination.";

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
