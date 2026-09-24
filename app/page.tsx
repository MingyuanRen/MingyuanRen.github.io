/* eslint-disable @next/next/no-img-element -- Small local avatar needs no image optimization server. */
import { profile } from "./content";
import FeedLinks from "./components/feed-links";

export default function Home() {
  return (
    <main className="page">
      <header className="profile-header">
        <img className="avatar" src={profile.avatarUrl} alt="GitHub avatar" width={80} height={80} />
        <div className="identity">
          <h1>Mingyuan Ren <span lang="zh-CN">任明远</span></h1>
          {profile.bio && <p>{profile.bio}</p>}
        </div>
      </header>
      <section className="about" aria-label="About me" aria-labelledby="about-heading">
        <h2 id="about-heading">About Me</h2>
        <p>Hi! I’m Mingyuan Ren. I work on the <strong>Core Infrastructure</strong> team at <a className="current-company" href="https://zip.com/">Zip</a>. I write about things I’m figuring out at work, <strong>literature and film</strong>, and whatever else catches my imagination.</p>
        <p>I studied <strong>Computer Science</strong> at the <a href="https://uwaterloo.ca/">University of Waterloo</a>, where I was a “toxic job seeker” and collected a few too many internships: <a href="https://kikoff.com/">Kikoff</a>, <a href="https://www.coinbase.com/">Coinbase</a>, <a href="https://www.bitgo.com/">BitGo</a>, <a href="https://system1.com/">System1</a>, <a href="https://www.blackberry.com/">BlackBerry</a>, and <a href="https://www.tiktok.com/about">TikTok</a>.</p>
        <p>I’m especially interested in film. Past rabbit holes include LLM training, mathematics, and crypto.</p>
        <p>I also enjoy football and support Arsenal. Lately, I’ve been playing soulslike games.</p>
        <p>I’m always happy to chat or hear your thoughts on my writing. You can reach me at <span className="email">996607062al@gmail.com</span>.</p>
      </section>
      <nav className="writing-sections" aria-label="Writing">
        <div><a href="/tech/">Engineering Notes</a><p className="section-description">Infrastructure, source-code reading, and notes from work.</p></div>
        <div><a href="/personal/">Personal</a><p className="section-description">Literature, film, and things that live in the imagination.</p></div>
      </nav>
      <FeedLinks />
    </main>
  );
}
