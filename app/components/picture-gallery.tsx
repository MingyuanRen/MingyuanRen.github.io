import "./picture-gallery.css";
import TmdbCredit from "./tmdb-credit";

export type Picture = { id: string; image: string; alt: string; caption: string; tmdbId?: number };
export type Gallery = { version: number; items: Picture[] };

export default function PictureGallery({ items, imageSources = {} }: { items: Picture[]; imageSources?: Record<string, string> }) {
  return <><div className="picture-gallery">
    {items.map((item, index) => <figure key={item.id} className="picture-tile">
      <a href={imageSources[item.image] || item.image} target="_blank" rel="noreferrer" aria-label={item.alt || `Open picture ${index + 1}`}>
        {/* Preserve the full frame; no cropping or forced aspect ratio. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageSources[item.image] || item.image} alt={item.alt} loading="lazy" decoding="async" />
      </a>
      {item.caption && <figcaption>{item.caption}</figcaption>}
      {item.tmdbId && <figcaption><a href={`https://www.themoviedb.org/movie/${item.tmdbId}`} target="_blank" rel="noreferrer">Image source: TMDB ↗</a></figcaption>}
    </figure>)}
  </div>{items.some(item => item.tmdbId) && <TmdbCredit />}</>;
}
