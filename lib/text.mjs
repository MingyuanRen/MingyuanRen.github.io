import MarkdownIt from "markdown-it";
import { validRankingImage } from "./rankings.mjs";

const parser = new MarkdownIt({ html: false });
// Use Markdown tokens rather than stripping HTML, so entities and inline code
// stay readable. Images and their URLs are not part of a textual excerpt.
export function markdownText(source) {
  const inline = tokens => tokens.map(token => token.type === "image" ? "" :
    token.type === "softbreak" || token.type === "hardbreak" ? "\n" :
    token.children ? inline(token.children) : ["text", "code_inline"].includes(token.type) ? token.content : "").join("");
  return parser.parse(source || "", {}).map(token => token.type === "inline" ? inline(token.children || []) + "\n" :
    ["code_block", "fence"].includes(token.type) ? token.content + "\n" : "").join("").trim();
}
export function excerpt(text, limit = 180) {
  const letters = Array.from(text.replace(/\s+/g, " ").trim());
  return letters.length > limit ? letters.slice(0, limit - 1).join("") + "…" : letters.join("");
}
export function firstUploadedImage(source) {
  for (const token of parser.parse(source, {})) {
    for (const child of token.children || []) {
      const path = child.type === "image" ? child.attrGet("src") : undefined;
      if (typeof path === "string" && validRankingImage(path)) return path;
    }
  }
  return undefined;
}
