import { posts } from "../posts/content";
import { rssFeed } from "../../lib/sharing.mjs";

export const dynamic = "force-static";
export function GET() {
  return new Response(rssFeed(posts, "zh"), { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
