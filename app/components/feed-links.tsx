export default function FeedLinks() {
  return <footer className="feed-links" aria-label="Subscribe via RSS">
    <span>RSS</span><a href="/feed.xml" type="application/rss+xml" hrefLang="zh">中文</a><span aria-hidden="true">/</span><a href="/feed-en.xml" type="application/rss+xml" hrefLang="en">English</a>
  </footer>;
}
