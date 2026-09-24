import PersonalView from "./personal-view";
import { pageMetadata } from "../../lib/sharing.mjs";
export const metadata = pageMetadata({ title: "Personal — Mingyuan Ren", path: "/personal/", description: "Literature, film, and things that live in the imagination." });
export const dynamic = "force-static";
export default function Personal() { return <PersonalView />; }
