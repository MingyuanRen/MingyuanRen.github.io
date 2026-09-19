/* eslint-disable @next/next/no-img-element -- Unmodified, locally hosted TMDB attribution logo. */
export default function TmdbCredit() {
  return <aside aria-label="Image search credits" style={{ marginTop: 24, fontSize: 12, lineHeight: 1.7, color: "var(--muted)" }}>
    <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer"><img src="/tmdb.svg" alt="TMDB" width={80} style={{ height: "auto" }} /></a>
    <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </aside>;
}
