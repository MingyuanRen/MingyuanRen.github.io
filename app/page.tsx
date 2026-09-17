/* eslint-disable @next/next/no-img-element -- Small local avatar needs no image optimization server. */
import { profile } from "./content";

export default function Home() {
  return (
    <main className="page">
      <header className="profile-header">
        <img className="avatar" src={profile.avatarUrl} alt="GitHub avatar" width={80} height={80} />
        <div className="identity">
          {profile.name && <h1>{profile.name}</h1>}
          {profile.bio && <p>{profile.bio}</p>}
        </div>
      </header>
      <div className="rule" />
      <nav aria-label="Pages"><a href="/personal/">Personal</a></nav>
      <p className="section-description" lang="zh-CN">一些对于电影，文学非常个人化的锐评</p>
    </main>
  );
}
