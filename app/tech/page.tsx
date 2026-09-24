/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation supports the static export. */
export const dynamic = "force-static";
import { summaries } from "../posts/content";
import PostList from "../posts/post-list";
import FeedLinks from "../components/feed-links";
import { pageMetadata } from "../../lib/sharing.mjs";
export const metadata = pageMetadata({ title: "Engineering Notes — Mingyuan Ren", path: "/tech/", description: "Infrastructure, source-code reading, and notes from work." });

export default function Tech() {
  return (
    <main className="page">
      <a className="back-link" href="/">← Home</a>
      <h1 className="section-title">Engineering Notes</h1>
      <p className="section-description">Infrastructure, source-code reading, and notes from work.</p>
      <PostList posts={summaries("engineering")} language="en" />
      <FeedLinks />
    </main>
  );
}
