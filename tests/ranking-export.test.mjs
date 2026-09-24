import test from "node:test";
import assert from "node:assert/strict";
import { wrapLines, exportScale, exportFilename } from "../lib/export-layout.mjs";
import { renderRankingPng } from "../lib/ranking-image.ts";

test("export wraps Chinese, emoji and newlines without clipping and bounds huge canvases", () => {
  assert.deepEqual(wrapLines("你好😀\n\nWorld", 2, text => [...text].length), ["你好", "😀", "", "Wo", "rl", "d"]);
  assert.throws(() => wrapLines("a\nb\nc", 10, text => text.length, 2), /too long/);
  assert.equal(exportScale(1146, 1000, true), 2);
  const scale = exportScale(1146, 7000, true);
  assert.ok(1146 * 7000 * scale * scale <= 16_000_001);
  assert.throws(() => exportScale(1146, 9000, true), /too long/);
  assert.equal(exportFilename("../电影: 2026?", true), "电影 2026-reviews.png");
});

test("PNG rendering includes optional reviews, preserves tier order, omits unranked and rejects external images", async () => {
  const originals = Object.fromEntries(["window", "document", "Image"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const text = [], loaded = [], canvases = [];
  const context = { measureText: text => ({ width: [...text].length * 12 }), scale() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {}, fillText(value) { text.push(value); } };
  globalThis.window = { location: { origin: "http://localhost" }, setTimeout, clearTimeout };
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement() { const canvas = { width: 0, height: 0, getContext: () => context, toBlob(fn) { fn(new Blob(["png"], { type: "image/png" })); } }; canvases.push(canvas); return canvas; } };
  globalThis.Image = class { naturalWidth = 240; naturalHeight = 360; set src(value) { loaded.push(value); queueMicrotask(() => this.onload()); } };
  const item = { id: "a", title: "Film", image: "/uploads/12345678-1234-1234-1234-123456789abc.jpg", tier: "s", reason: "**A reason**\nNext line" };
  try {
    const blob = await renderRankingPng({ version: 1, items: [item, { ...item, id: "b", tier: null, title: "Unranked" }], commentary: "A thought" }, {}, { title: "My films", highResolution: true, includeReasons: true });
    assert.equal(blob.type, "image/png"); assert.equal(canvases[0].width, 2292);
    assert.ok(text.includes("My films") && text.includes("A reason") && text.includes("Next line") && text.includes("A thought"));
    assert.ok(text.indexOf("夯") < text.indexOf("拉完了")); assert.equal(loaded.length, 1); assert.ok(!text.includes("Unranked"));
    text.length = 0;
    await renderRankingPng({ version: 1, items: [item] });
    assert.ok(!text.includes("A reason")); assert.equal(canvases[1].width, 1146);
    await assert.rejects(renderRankingPng({ version: 1, items: [{ ...item, image: "https://outside.test/a.jpg" }] }), /uploaded to this website/);
    await assert.rejects(renderRankingPng({ version: 1, items: [{ ...item, tier: null }] }), /Assign a poster/);
  } finally { for (const [key, descriptor] of Object.entries(originals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } }
});
