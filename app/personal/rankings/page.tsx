import PersonalView from "../personal-view";
import { summaries } from "../../posts/content";
export const dynamic = "force-static";
export default function Rankings() { return <PersonalView category="rankings" posts={summaries("rankings")} />; }
