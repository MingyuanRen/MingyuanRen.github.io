import test from "node:test";
import assert from "node:assert/strict";
import { renderRankingPng } from "../lib/ranking-image.ts";

test("ranking readers, previews and admin keep the board without manual export tools", async () => {
  const { createServer } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const server = await createServer({ configFile: false, appType: "custom", plugins: [react()], server: { middlewareMode: true, watch: null, ws: false } });
  try {
    const { default: RankingArticle } = await server.ssrLoadModule("/app/components/ranking-article.tsx");
    const { default: RankingEditor } = await server.ssrLoadModule("/app/admin/ranking-editor.tsx");
    const ranking = { version: 1, commentary: "A thought below the board", items: [{ id: "a", title: "Film", image: "/uploads/12345678-1234-1234-1234-123456789abc.jpg", tier: "s", reason: "A personal review" }] };
    for (const language of ["zh", "en"]) {
      for (const preview of [false, true]) {
        for (const boardImage of [undefined, "/uploads/12345678-1234-1234-1234-123456789abc.png"]) {
          const html = renderToStaticMarkup(createElement(RankingArticle, { ranking: { ...ranking, boardImage }, language, preview }));
          assert.match(html, /ranking-article/);
          assert.match(html, /A thought below the board/);
          assert.match(html, /A personal review/);
          assert.match(html, /夯/);
          assert.doesNotMatch(html, /ranking-export|Export PNG|Include reviews|导出 PNG|附上短评|Download again/);
        }
      }
      const editor = renderToStaticMarkup(createElement(RankingEditor, { value: ranking, language, title: "My films" }));
      assert.match(editor, /Movie ranking builder/);
      assert.match(editor, /Drag posters into a tier/);
      assert.doesNotMatch(editor, /ranking-export|Export PNG|Include reviews|导出 PNG|附上短评|Download again/);
    }
  } finally { await server.close(); }
});

test("publication board snapshots reject oversized or empty collections before creating a canvas", async () => {
  await assert.rejects(renderRankingPng({ version: 1, items: [] }), /between 1 and 40/);
  await assert.rejects(renderRankingPng({ version: 1, items: Array.from({ length: 41 }, () => ({})) }), /between 1 and 40/);
});

test("publication PNG keeps the board and credits, excludes reviews, and rejects external images", async () => {
  const originals = Object.fromEntries(["window", "document", "Image"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const text = [], loaded = [], canvases = [];
  const context = { measureText: text => ({ width: [...text].length * 12 }), scale() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {}, fillText(value) { text.push(value); } };
  globalThis.window = { location: { origin: "http://localhost" }, setTimeout, clearTimeout };
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement() { const canvas = { width: 0, height: 0, getContext: () => context, toBlob(fn) { fn(new Blob(["png"], { type: "image/png" })); } }; canvases.push(canvas); return canvas; } };
  globalThis.Image = class { naturalWidth = 240; naturalHeight = 360; set src(value) { loaded.push(value); queueMicrotask(() => this.onload()); } };
  const item = { id: "a", title: "Film", image: "/uploads/12345678-1234-1234-1234-123456789abc.jpg", tier: "s", reason: "**A reason**\nNext line" };
  try {
    const blob = await renderRankingPng({ version: 1, items: [item, { ...item, id: "b", tier: null, title: "Unranked" }], commentary: "A thought" });
    assert.equal(blob.type, "image/png"); assert.equal(canvases[0].width, 1146);
    assert.ok(!text.includes("A reason") && !text.includes("Next line") && !text.includes("A thought"));
    assert.ok(text.indexOf("夯") < text.indexOf("拉完了")); assert.equal(loaded.length, 1); assert.ok(!text.includes("Unranked"));
    text.length = 0;
    await renderRankingPng({ version: 1, items: [{ ...item, tmdbId: 1 }] });
    assert.ok(text.includes("Images: themoviedb.org")); assert.equal(canvases[1].height, canvases[0].height + 94);
    assert.ok(loaded.includes("http://localhost/tmdb.svg"));
    await assert.rejects(renderRankingPng({ version: 1, items: [{ ...item, image: "https://outside.test/a.jpg" }] }), /uploaded to this website/);
    await assert.rejects(renderRankingPng({ version: 1, items: [{ ...item, tier: null }] }), /Assign a poster/);
  } finally { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
});
