/* eslint-disable @next/next/no-html-link-for-pages -- Static Pages navigation uses full document requests. */
export const dynamic = "force-static";

export default function Personal() {
  return (
    <main className="page">
      <nav aria-label="Pages"><a href="/">← home</a></nav>
    </main>
  );
}
