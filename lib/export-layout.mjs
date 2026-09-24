// Bounded layout keeps very long reviews from allocating enormous canvases.
export function wrapLines(text, width, measure, maxLines = 240) {
  const lines = [];
  function push(line) {
    if (lines.length >= maxLines) throw new Error("The reviews are too long for one image. Export the board only, or shorten the reviews.");
    lines.push(line);
  }
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const char of Array.from(paragraph)) {
      if (line && measure(line + char) > width) {
        const space = line.lastIndexOf(" ");
        if (space > line.length / 2) { push(line.slice(0, space)); line = line.slice(space + 1) + char; }
        else { push(line); line = char; }
      } else line += char;
    }
    push(line.trimEnd());
  }
  return lines;
}
export function exportScale(width, height, highResolution) {
  if (height > 8192 || width * height > 16_000_000) throw new Error("The reviews are too long for one image. Export the board only, or shorten the reviews.");
  return Math.min(highResolution ? 2 : 1, 8192 / height, Math.sqrt(16_000_000 / (width * height)));
}
export function exportFilename(title, includeReasons) {
  const name = Array.from((title || "ranking").normalize("NFC").replace(/[^\p{L}\p{N}_ -]/gu, "").trim()).slice(0, 60).join("") || "ranking";
  return name + (includeReasons ? "-reviews" : "-board") + ".png";
}
