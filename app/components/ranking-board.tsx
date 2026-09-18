import { tiers } from "../../lib/rankings.mjs";
import "./ranking-board.css";

export type TierId = "s" | "a" | "b" | "c" | "d";
export type RankingItem = { id: string; title: string; image: string; tier: TierId | null; reason: string };
export type RankingData = { version: 1; items: RankingItem[]; boardImage?: string; commentary?: string };
export type ImageSources = Record<string, string>;

export default function RankingBoard({ ranking, language = "zh", imageSources = {} }: {
  ranking: RankingData; language?: string; imageSources?: ImageSources;
}) {
  return <figure className="ranking-figure" aria-label={language === "zh" ? "从夯到拉电影排名" : "Movie tier list"}>
    <div className="ranking-board" role="list">
      {tiers.map(tier => <div className="ranking-row" role="listitem" key={tier.id}>
        <div className="ranking-tier-label" style={{ backgroundColor: tier.color }} lang="zh-CN">{tier.label}</div>
        <ul className="ranking-posters" aria-label={tier.label}>
          {ranking.items.filter(item => item.tier === tier.id).map(item => <li className="ranking-poster" key={item.id}>
            {/* Poster dimensions are fixed, including when an uploaded image is still deploying. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSources[item.image] || item.image} alt={item.title} width={96} height={144} loading="lazy" />
            <span>{item.title}</span>
          </li>)}
        </ul>
      </div>)}
    </div>
  </figure>;
}
