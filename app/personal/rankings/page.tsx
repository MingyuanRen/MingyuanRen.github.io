import PersonalView from "../personal-view";
import { summaries } from "../../posts/content";
import { pageMetadata } from "../../../lib/sharing.mjs";
export const metadata = pageMetadata({ title: "From Great to Terrible · 从夯到拉 — Mingyuan Ren", path: "/personal/rankings/", description: "Very personal rankings of films and more." });
export const dynamic = "force-static";
export default function Rankings() { return <PersonalView category="rankings" posts={summaries("rankings")} />; }
