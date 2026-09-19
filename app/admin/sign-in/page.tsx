import SignInCard from "../sign-in-card";
import "../writing.css";
export default function SignInPreview() {
  return <main className="page writer-page">
    <a className="back-link" href="/admin/">← Writing studio</a>
    <header className="writer-header"><h1>Write.</h1><p>Notes, passing thoughts, and very personal rankings.</p></header>
    <section className="writer-connect" aria-label="Sign-in preview"><SignInCard /></section>
  </main>;
}
