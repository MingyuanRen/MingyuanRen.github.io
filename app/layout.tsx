import type { Metadata } from "next";
import "./globals.css";
import { profile } from "./content";
import { pageMetadata, siteUrl, feeds } from "../lib/sharing.mjs";

export const metadata: Metadata = {
  ...pageMetadata({ title: profile.name }),
  icons: { icon: { url: "/favicon.jpg", type: "image/jpeg" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head>
    <link rel="alternate" type="application/rss+xml" title="Mingyuan Ren · 中文" href={siteUrl + feeds.zh} />
    <link rel="alternate" type="application/rss+xml" title="Mingyuan Ren · English" href={siteUrl + feeds.en} />
  </head><body>{children}</body></html>;
}
