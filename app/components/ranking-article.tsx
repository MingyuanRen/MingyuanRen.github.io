/* eslint-disable @next/next/no-img-element -- Uploaded assets are static GitHub Pages files. */
import RankingBoard, { type RankingData } from "./ranking-board";
import { tiers } from "../../lib/rankings.mjs";
import { renderMarkdown } from "../../lib/markdown.mjs";
import "./ranking-article.css";
import TmdbCredit from "./tmdb-credit";
import RankingExport from "./ranking-export";

export default function RankingArticle({ ranking, preview = false, imageSources = {}, language = "zh", title = "" }: {
  ranking: RankingData; preview?: boolean; imageSources?: Record<string, string>; language?: string; title?: string;
}) {
  const ordered = tiers.flatMap(tier => ranking.items.filter(item => item.tier === tier.id).map(item => ({ ...item, rating: tier })));
  return <div className="ranking-article">
    {ranking.boardImage && !preview ? <figure className="ranking-published-image">
      <a href={ranking.boardImage} target="_blank" rel="noreferrer" aria-label={language === "zh" ? "查看完整排名图" : "Open full-size ranking image"}>
        <img src={ranking.boardImage} alt={language === "zh" ? "电影排名，从夯到拉；各项排名与理由见下文。" : "Movie tier list from best to worst. Rankings and reasons follow below."} />
      </a>
    </figure> : <RankingBoard ranking={ranking} imageSources={imageSources} language={language} />}
    <RankingExport ranking={ranking} title={title} imageSources={imageSources} language={language} />
    {ranking.commentary?.trim() && <div className="prose ranking-commentary" dangerouslySetInnerHTML={{ __html: renderMarkdown(ranking.commentary) }} />}
    {ordered.length > 0 && <section className="ranking-reasons" aria-label={language === "zh" ? "作品" : "Films"}>
      {ordered.map((item, index) => <section key={item.id} className="ranking-reason">
        <div className="ranking-film-summary">
          <figure className="ranking-film-image">
            <img src={imageSources[item.image] || item.image} alt={language === "zh" ? `第 ${index + 1} 部作品的图片` : `Image for film ${index + 1}`} loading="lazy" />
          </figure>
          <p className="ranking-film-rating" lang="zh-CN">{item.rating.label}</p>
        </div>
        <section className="ranking-film-description" aria-label={language === "zh" ? "描述" : "Description"}>
          {item.reason && <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.reason) }} />}
        </section>
      </section>)}
    </section>}
    {ordered.some(item => item.tmdbId) && <section aria-label="Image credits" className="ranking-image-credits">
      <p>{language === "zh" ? "图片来源：" : "Image sources: "}{ordered.filter(item => item.tmdbId).map((item, index) => <span key={item.id}>{index > 0 && " · "}<a href={`https://www.themoviedb.org/movie/${item.tmdbId}`} target="_blank" rel="noreferrer">{item.title || "TMDB"}</a></span>)}</p>
      <TmdbCredit />
    </section>}
  </div>;
}
