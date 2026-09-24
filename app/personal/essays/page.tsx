import PersonalView from "../personal-view";
import { summaries } from "../../posts/content";
import { pageMetadata } from "../../../lib/sharing.mjs";
export const metadata = pageMetadata({ title: "Moments · 片刻 — Mingyuan Ren", path: "/personal/essays/", description: "Thoughts that don't need to become essays." });
export const dynamic = "force-static";
export default function Essays() { return <PersonalView category="essays" posts={summaries("essays")} />; }
