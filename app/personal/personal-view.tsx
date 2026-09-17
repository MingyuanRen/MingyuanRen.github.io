"use client";

import { useSyncExternalStore } from "react";

type Language = "zh" | "en";
const key = "personal-language";
let fallback: Language = "zh";
function readLanguage(): Language {
  try {
    const saved = localStorage.getItem(key);
    return saved === "en" || saved === "zh" ? saved : fallback;
  }
  catch { return fallback; }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(key, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(key, listener);
  };
}
function changeLanguage(language: Language) {
  fallback = language;
  try { localStorage.setItem(key, language); } catch { /* Keep the switch usable without storage. */ }
  window.dispatchEvent(new Event(key));
}

const labels = {
  zh: { essays: "随笔", rankings: "从夯到拉", home: "← 首页", back: "← Personal" },
  en: { essays: "Essays", rankings: "From Great to Terrible", home: "← Home", back: "← Personal" },
};

export default function PersonalView({ category }: { category?: "essays" | "rankings" }) {
  const language = useSyncExternalStore(subscribe, readLanguage, () => "zh" as const);
  const copy = labels[language];
  return (
    <main className="page" lang={language === "zh" ? "zh-CN" : "en"}>
      <div className="page-toolbar">
        <a className="back-link" href={category ? "/personal/" : "/"}>{category ? copy.back : copy.home}</a>
        <div className="language-switch" role="group" aria-label="Interface language">
          <button type="button" lang="zh-CN" aria-pressed={language === "zh"} onClick={() => changeLanguage("zh")}>中文</button>
          <span aria-hidden="true">/</span>
          <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => changeLanguage("en")}>English</button>
        </div>
      </div>
      <h1 className="section-title">{category ? copy[category] : "Personal"}</h1>
      {!category && <>
        <p className="section-description" lang="en">Literature, film, and things that live in the imagination.</p>
        <nav className="subpages" aria-label={language === "zh" ? "个人栏目" : "Personal categories"}>
          <a href="/personal/essays/">{copy.essays}</a>
          <a href="/personal/rankings/">{copy.rankings}</a>
        </nav>
      </>}
    </main>
  );
}
