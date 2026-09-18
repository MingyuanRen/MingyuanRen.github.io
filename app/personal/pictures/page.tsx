import PictureGallery from "../../components/picture-gallery";
import { emptyGallery, parseGallery } from "../../../lib/pictures.mjs";

export const dynamic = "force-static";
export const metadata = { title: "Picture — Mingyuan Ren" };
const sources = import.meta.glob<string>("/content/pictures/gallery.json", { eager: true, query: "?raw", import: "default" });

export default function Pictures() {
  const source = sources["/content/pictures/gallery.json"];
  const gallery = source ? parseGallery(source) : emptyGallery();
  return <main className="page picture-page">
    <header className="picture-page-header">
      <a className="back-link" href="/personal/">← Personal</a>
      <h1 className="section-title">Picture</h1>
      <p className="section-description">Frames I want to keep.</p>
    </header>
    {gallery.items.length ? <PictureGallery items={gallery.items} /> : <p className="picture-empty">Nothing here yet.</p>}
  </main>;
}
