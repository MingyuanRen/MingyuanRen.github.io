"use client";
/* eslint-disable @next/next/no-img-element -- TMDB thumbnail URLs are server-validated. */
import { useEffect, useRef, useState } from "react";
import TmdbCredit from "../components/tmdb-credit";

export type Movie = { id: number; title: string; originalTitle: string; year: string; thumbnail: string | null };
export type MovieImage = { path: string; kind: "poster" | "backdrop"; width: number; height: number; language: string; thumbnail: string };
export type MovieRequest = { action: "search" | "images" | "download"; query?: string; page?: number; movieId?: number; path?: string; kind?: string };
export type MovieResult = { movies?: Movie[]; images?: MovieImage[]; page?: number; pages?: number; content?: string; extension?: string; resized?: boolean };

export default function MoviePicker({ request, onChoose, disabled }: {
  request(input: MovieRequest): Promise<MovieResult>;
  onChoose(movie: Movie, image: MovieImage): Promise<boolean>;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [images, setImages] = useState<MovieImage[]>([]);
  const [selected, setSelected] = useState<MovieImage | null>(null);
  const [kind, setKind] = useState<"poster" | "backdrop">("poster");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [imagePage, setImagePage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const locked = disabled || busy;
  const filtered = images.filter(image => image.kind === kind);
  async function run(work: () => Promise<void>) {
    if (locked) return;
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Image search failed."); }
    finally { if (alive.current) setBusy(false); }
  }
  function search(nextPage = 1, paging = false) {
    const term = paging ? searchedQuery : query.trim();
    if (!term) { setError("Enter a movie name first."); return; }
    void run(async () => {
      const result = await request({ action: "search", query: term, page: nextPage });
      if (!alive.current) return;
      setMovies(result.movies || []); setSearchedQuery(term); setPage(nextPage); setPages(result.pages || 1); setMovie(null); setImages([]); setSelected(null);
      setNotice(result.movies?.length ? `${result.movies.length} film${result.movies.length === 1 ? "" : "s"} found. Choose the right film.` : "No films found. Try the original title or another spelling.");
    });
  }
  function chooseMovie(next: Movie) {
    void run(async () => {
      const result = await request({ action: "images", movieId: next.id });
      if (!alive.current) return;
      const found = result.images || [];
      setMovie(next); setImages(found); setImagePage(1); setSelected(null);
      setKind(found.some(image => image.kind === "poster") ? "poster" : "backdrop");
      if (!found.length) setNotice("No images available for this film. You can still upload your own.");
    });
  }
  return <section className="movie-picker" aria-label="Find movie images">
    <div className="movie-search-bar">
      <label className="writer-label">Movie name<input value={query} maxLength={120} disabled={locked} placeholder="花样年华 / In the Mood for Love"
        onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); search(); } }} /></label>
      <button type="button" disabled={locked || !query.trim()} onClick={() => search()}>Search films</button>
    </div>
    <p className="writer-help">Search by Chinese or original film title, then choose a poster or backdrop. This is a movie catalogue, not a general web image search.</p>
    {movie ? <>
      <button type="button" disabled={locked} onClick={() => { setMovie(null); setSelected(null); setError(""); setNotice(""); }}>← Back to films</button>
      <h4>{movie.title} {movie.year && <span>({movie.year})</span>}</h4>
      <div className="movie-image-types" role="group" aria-label="Image type">
        <button type="button" disabled={locked} aria-pressed={kind === "poster"} onClick={() => { setKind("poster"); setImagePage(1); setSelected(null); }}>Posters ({images.filter(image => image.kind === "poster").length})</button>
        <button type="button" disabled={locked} aria-pressed={kind === "backdrop"} onClick={() => { setKind("backdrop"); setImagePage(1); setSelected(null); }}>Backdrops / stills ({images.filter(image => image.kind === "backdrop").length})</button>
        <a href={`https://www.themoviedb.org/movie/${movie.id}`} target="_blank" rel="noreferrer">Source ↗</a>
      </div>
      {!filtered.length && <p className="writer-help">No {kind === "poster" ? "posters" : "backdrops"} available. Try the other image type or upload your own.</p>}
      <div className={`movie-results movie-results-${kind}`}>
        {filtered.slice((imagePage - 1) * 12, imagePage * 12).map(image => <button type="button" className="movie-choice" key={image.path} disabled={locked || added.includes(image.path)} aria-pressed={selected?.path === image.path}
          aria-label={`Select ${image.kind} ${image.width} × ${image.height}, ${image.language}${added.includes(image.path) ? ", added" : ""}`} onClick={() => setSelected(image)}>
          <img src={image.thumbnail} alt={`${movie.title} ${image.kind}`} loading="lazy" referrerPolicy="no-referrer" />
          <span>{image.width} × {image.height}</span><small>{added.includes(image.path) ? "Added" : image.language}</small>
        </button>)}
      </div>
      {filtered.length > 12 && <div className="movie-pagination">
        <button type="button" disabled={locked || imagePage === 1} onClick={() => { setImagePage(imagePage - 1); setSelected(null); }}>← Previous images</button>
        <span>{imagePage} / {Math.ceil(filtered.length / 12)}</span>
        <button type="button" disabled={locked || imagePage * 12 >= filtered.length} onClick={() => { setImagePage(imagePage + 1); setSelected(null); }}>More images →</button>
      </div>}
      <button className="writer-primary" type="button" disabled={locked || !selected} onClick={() => void run(async () => {
        if (!selected) return;
        if (await onChoose(movie, selected) && alive.current) { setAdded(current => [...current, selected.path]); setSelected(null); setNotice("Added to Unranked. Choose another film or drag it into a tier below."); }
      })}>Add selected image to Unranked</button>
      <p className="writer-help">Dimensions refer to the original. Imports use the original up to 5 MB, or a smaller TMDB version when needed. Only import images you are entitled to use.</p>
    </> : <>
      <div className="movie-results movie-results-films">{movies.map(result => <button type="button" className="movie-choice" key={result.id} disabled={locked} onClick={() => chooseMovie(result)}>
        {result.thumbnail ? <img src={result.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="movie-no-poster">No poster</span>}
        <span>{result.title}</span><small>{result.year}{result.originalTitle && result.originalTitle !== result.title ? ` · ${result.originalTitle}` : ""}</small>
      </button>)}</div>
      {pages > 1 && <div className="movie-pagination">
        <button type="button" disabled={locked || page === 1} onClick={() => search(page - 1, true)}>← Previous films</button><span>{page} / {pages}</span>
        <button type="button" disabled={locked || page >= pages} onClick={() => search(page + 1, true)}>More films →</button>
      </div>}
    </>}
    {error && <p className="writer-error" role="alert">{error}</p>}
    <p className="writer-help" role="status" aria-live="polite">{busy ? "Loading…" : notice}</p>
    <p className="writer-help">Image search by <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">TMDB ↗</a>. Search text and preview requests are sent to TMDB. Browsing does not save images or call OpenAI.</p>
    <TmdbCredit />
  </section>;
}
