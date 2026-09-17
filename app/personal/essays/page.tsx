import PersonalView from "../personal-view";
import { summaries } from "../../posts/content";
export const dynamic = "force-static";
export default function Essays() { return <PersonalView category="essays" posts={summaries("essays")} />; }
