import { tiers } from "./rankings.mjs";
import type { ImageSources, RankingData } from "../app/components/ranking-board";
import { markdownText } from "./text.mjs";
import { wrapLines, exportScale } from "./export-layout.mjs";

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
export async function renderRankingPng(ranking: RankingData, imageSources: ImageSources = {}, options: {
  title?: string; includeReasons?: boolean; highResolution?: boolean;
} = {}): Promise<Blob> {
  if (!ranking.items.length || ranking.items.length > 40) throw new Error("Add between 1 and 40 film posters to generate a ranking image.");
  const ranked = ranking.items.filter(item => item.tier !== null);
  if (!ranked.length) throw new Error("Assign a poster to a tier first.");
  const labelWidth = 132, columns = 8, gap = 6, posterWidth = 120, posterHeight = 180;
  const width = labelWidth + columns * (posterWidth + gap) + gap;
  const rowHeights = tiers.map(tier => Math.max(1, Math.ceil(ranked.filter(item => item.tier === tier.id).length / columns)) * (posterHeight + gap) + gap);
  const canvas = document.createElement("canvas");
  const candidate = canvas.getContext("2d");
  if (!candidate) throw new Error("Your browser does not support image export.");
  const context = candidate;
  await document.fonts.ready;
  const font = 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif';
  const measure = (text: string) => context.measureText(text).width;
  context.font = `32px ${font}`;
  const titleLines = options.title?.trim() ? wrapLines(options.title.trim(), width - 64, measure, 6) : [];
  const headerHeight = titleLines.length ? 48 + titleLines.length * 42 : 0;
  const boardHeight = rowHeights.reduce((sum, height) => sum + height, 0);
  const reviews: Array<{ lines: string[]; font: string; top: number; lineHeight: number }> = [];
  let end = headerHeight + boardHeight;
  function addText(text: string, size: number, weight = "normal") {
    if (!text.trim()) return;
    const face = `${weight} ${size}px ${font}`; context.font = face;
    const lines = wrapLines(text, width - 64, measure);
    const lineHeight = Math.ceil(size * 1.55);
    reviews.push({ lines, font: face, top: end + 24, lineHeight }); end += 24 + lines.length * lineHeight;
  }
  if (options.includeReasons) {
    addText(markdownText(ranking.commentary || ""), 22);
    for (const tier of tiers) for (const item of ranked.filter(item => item.tier === tier.id)) {
      addText(`${item.title || "Untitled"} · ${tier.label}`, 25, "600");
      addText(markdownText(item.reason), 22);
    }
  }
  const credited = ranked.some(item => item.tmdbId);
  const creditHeight = credited ? 94 : 0;
  const height = end + (reviews.length ? 32 : 0) + creditHeight;
  const scale = exportScale(width, height, options.highResolution);
  const images = new Map(await Promise.all(ranked.map(async item => [item.id, await loadPoster(imageSources[item.image] || item.image)] as const)));
  const logo = credited ? await loadPoster("/tmdb.svg") : null;
  canvas.width = Math.floor(width * scale); canvas.height = Math.floor(height * scale);
  context.scale(scale, scale);
  context.fillStyle = "#f9faf7"; context.fillRect(0, 0, width, height);
  context.textBaseline = "top"; context.fillStyle = "#202621"; context.font = `32px ${font}`;
  titleLines.forEach((line, index) => context.fillText(line, 32, 24 + index * 42));
  context.imageSmoothingQuality = "high";
  let top = headerHeight;
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
  context.strokeRect(.5, headerHeight + .5, width - 1, boardHeight - 1);
  context.beginPath(); context.moveTo(labelWidth + .5, headerHeight); context.lineTo(labelWidth + .5, headerHeight + boardHeight); context.stroke();
  context.textAlign = "left"; context.textBaseline = "top"; context.fillStyle = "#202621";
  for (const review of reviews) {
    context.font = review.font;
    review.lines.forEach((line, index) => context.fillText(line, 32, review.top + index * review.lineHeight));
  }
  if (logo) {
    const y = height - creditHeight + 18;
    context.drawImage(logo, 32, y, 76, 76 * logo.naturalHeight / logo.naturalWidth);
    context.font = `14px ${font}`;
    context.fillText("Images: themoviedb.org", 124, y + 2);
    context.fillText("This product uses the TMDB API but is not endorsed or certified by TMDB.", 32, y + 42);
  }
  let result = await png(canvas);
  // Downloads keep their high-resolution pixels. Only publishing has a 5 MB cap.
  if (options.highResolution) return result;
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
