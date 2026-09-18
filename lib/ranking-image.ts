import { tiers } from "./rankings.mjs";
import type { ImageSources, RankingData } from "../app/components/ranking-board";

function loadPoster(source: string): Promise<HTMLImageElement> {
  const url = new URL(source, window.location.origin);
  if (url.origin !== window.location.origin || !["http:", "https:", "blob:"].includes(url.protocol)) {
    return Promise.reject(new Error("Ranking posters must be uploaded to this website first."));
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = window.setTimeout(() => { image.src = ""; reject(new Error("A poster took too long to load. Try again after the upload finishes deploying.")); }, 20000);
    image.onload = () => { window.clearTimeout(timer); resolve(image); };
    image.onerror = () => { window.clearTimeout(timer); reject(new Error("A poster could not be loaded. If it was just uploaded, wait for the website deployment and try again.")); };
    image.src = url.href;
  });
}

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not generate the ranking image.")), "image/png"));
}

/** A real downloadable/uploadable image, generated locally from the same saved ranking data. */
export async function renderRankingPng(ranking: RankingData, imageSources: ImageSources = {}): Promise<Blob> {
  if (!ranking.items.length || ranking.items.length > 40) throw new Error("Add between 1 and 40 film posters to generate a ranking image.");
  const ranked = ranking.items.filter(item => item.tier !== null);
  if (!ranked.length) throw new Error("Assign a poster to a tier first.");
  await document.fonts.ready;
  const images = new Map(await Promise.all(ranked.map(async item => [item.id, await loadPoster(imageSources[item.image] || item.image)] as const)));
  const labelWidth = 132, columns = 8, gap = 6, posterWidth = 120, posterHeight = 180;
  const width = labelWidth + columns * (posterWidth + gap) + gap;
  const rowHeights = tiers.map(tier => Math.max(1, Math.ceil(ranked.filter(item => item.tier === tier.id).length / columns)) * (posterHeight + gap) + gap);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = rowHeights.reduce((sum, height) => sum + height, 0);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image export.");
  context.imageSmoothingQuality = "high";
  let top = 0;
  tiers.forEach((tier, index) => {
    const height = rowHeights[index];
    context.fillStyle = "#c8c8c8"; context.fillRect(labelWidth, top, width - labelWidth, height);
    context.fillStyle = tier.color; context.fillRect(0, top, labelWidth, height);
    context.font = '38px Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
    context.textAlign = "center"; context.textBaseline = "middle"; context.fillStyle = "#121212";
    context.fillText(tier.label, labelWidth / 2, top + height / 2, labelWidth - 12);
    ranked.filter(item => item.tier === tier.id).forEach((item, position) => {
      const image = images.get(item.id)!;
      const scale = Math.max(posterWidth / image.naturalWidth, posterHeight / image.naturalHeight);
      const sourceWidth = posterWidth / scale, sourceHeight = posterHeight / scale;
      const left = labelWidth + gap + position % columns * (posterWidth + gap);
      const y = top + gap + Math.floor(position / columns) * (posterHeight + gap);
      context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, left, y, posterWidth, posterHeight);
    });
    context.strokeStyle = "#444"; context.lineWidth = 1;
    context.beginPath(); context.moveTo(0, top + .5); context.lineTo(width, top + .5); context.stroke();
    top += height;
  });
  context.strokeRect(.5, .5, canvas.width - 1, canvas.height - 1);
  context.beginPath(); context.moveTo(labelWidth + .5, 0); context.lineTo(labelWidth + .5, canvas.height); context.stroke();
  let result = await png(canvas);
  // Keep within the existing image-upload limit without lossy recompression.
  while (result.size > 5 * 1024 * 1024 && canvas.width > 500) {
    const smaller = document.createElement("canvas");
    smaller.width = Math.round(canvas.width * .8); smaller.height = Math.round(canvas.height * .8);
    const scaledContext = smaller.getContext("2d");
    if (!scaledContext) throw new Error("Your browser does not support image export.");
    scaledContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    canvas.width = smaller.width; canvas.height = smaller.height;
    context.drawImage(smaller, 0, 0); result = await png(canvas);
  }
  if (result.size > 5 * 1024 * 1024) throw new Error("The generated image is too large. Try a shorter ranking.");
  return result;
}
