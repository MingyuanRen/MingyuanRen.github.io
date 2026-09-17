/* eslint-disable @next/next/no-html-link-for-pages -- Static Pages navigation uses full document requests. */
export const dynamic = "force-static";

export default function Personal() {
  return (
    <main className="page">
      <a className="back-link" href="/">← Home</a>
      <h1 className="section-title">Personal</h1>
      <nav className="subpages" aria-label="Personal categories" lang="zh-CN">
        <a href="/personal/essays/">随笔</a>
        <a href="/personal/rankings/">从夯到拉</a>
      </nav>
    </main>
  );
}
