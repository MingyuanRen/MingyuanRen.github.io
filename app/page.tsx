"use client";

import { useEffect, useState } from "react";
import { profile, sections } from "./content";

export default function Home() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let theme: string | null = null;
    try { theme = window.localStorage.getItem("theme"); } catch {}
    setDark(theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  function toggleTheme() {
    setDark(!dark);
    try { window.localStorage.setItem("theme", dark ? "light" : "dark"); } catch {}
  }

  return (
    <main className="page">
      <header className="profile-header">
        {profile.avatarUrl ? (
          <img className="avatar" src={profile.avatarUrl} alt={profile.name} width={80} height={80} />
        ) : <div className="avatar" aria-hidden="true" />}
        <div className="identity">
          {profile.name && <h1>{profile.name}</h1>}
          {profile.bio && <p>{profile.bio}</p>}
          <nav aria-label="Profile links and appearance">
            {profile.links.map(link => <a key={link.href} href={link.href}>{link.label}</a>)}
            <button onClick={toggleTheme} aria-label={dark ? "Use light theme" : "Use dark theme"}>{dark ? "Light" : "Dark"}</button>
          </nav>
        </div>
      </header>
      <div className="rule" />
      {sections.map(section => (
        <section className="row" id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`}>
          <h2 id={`${section.id}-heading`}>{section.label}</h2>
          <div className="row-content">
            {section.entries.map((entry, index) => (
              <article key={`${entry.title}-${index}`}>
                {entry.href ? <a href={entry.href}>{entry.title}</a> : <h3>{entry.title}</h3>}
                {entry.description && <p>{entry.description}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
      {profile.email && (
        <section className="row contact-row" id="contact">
          <h2>CONTACT</h2>
          <div className="row-content"><article><a href={`mailto:${profile.email}`}>{profile.email}</a></article></div>
        </section>
      )}
    </main>
  );
}
