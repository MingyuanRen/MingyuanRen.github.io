/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation supports the static export. */
export const dynamic = "force-static";

export default function Tech() {
  return (
    <main className="page">
      <a className="back-link" href="/">← Home</a>
      <h1 className="section-title">Engineering Notes</h1>
      <p className="section-description">Infrastructure, source-code reading, and notes from work.</p>
    </main>
  );
}
