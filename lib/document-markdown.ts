import { Extension, getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import MarkdownIt from "markdown-it";
import { MarkdownParser, MarkdownSerializer, defaultMarkdownSerializer } from "prosemirror-markdown";
import type { Node as DocumentNode } from "@tiptap/pm/model";

export function safeDocumentUrl(value: string, image = false) {
  if (!value || /[\u0000-\u0020\u007f]/.test(value)) return false; // eslint-disable-line no-control-regex
  if (/^(?:\/[^/\\]|#)/.test(value)) return true;
  try { return (image ? ["https:", "http:"] : ["https:", "http:", "mailto:"]).includes(new URL(value).protocol); }
  catch { return false; }
}

const MarkdownAttributes = Extension.create({
  name: "markdownAttributes",
  addGlobalAttributes() {
    return [
      { types: ["orderedList", "bulletList"], attributes: { tight: { default: true, rendered: false } } },
      { types: ["link"], attributes: { title: { default: null } } },
    ];
  },
});
export const DocumentImage = Image.extend({
  parseHTML() { return [{ tag: "img[src]", getAttrs: element => safeDocumentUrl(element.getAttribute("src") || "", true) ? null : false }]; },
}).configure({ inline: true, allowBase64: false });

export function documentExtensions() {
  return [StarterKit.configure({ underline: false, trailingNode: false, link: { openOnClick: false, autolink: false, isAllowedUri: value => safeDocumentUrl(value) } }), MarkdownAttributes, DocumentImage];
}
export const documentSchema = getSchema(documentExtensions());
const tokenizer = new MarkdownIt({ html: false, linkify: false, typographer: false, breaks: true });
const parser = new MarkdownParser(documentSchema, tokenizer, {
  blockquote: { block: "blockquote" }, paragraph: { block: "paragraph" },
  list_item: { block: "listItem" },
  bullet_list: { block: "bulletList", getAttrs: (_, tokens, index) => ({ tight: tokens[index + 2]?.hidden ?? true }) },
  ordered_list: { block: "orderedList", getAttrs: (token, tokens, index) => ({ start: Number(token.attrGet("start")) || 1, tight: tokens[index + 2]?.hidden ?? true }) },
  heading: { block: "heading", getAttrs: token => ({ level: Number(token.tag.slice(1)) }) },
  code_block: { block: "codeBlock", noCloseToken: true },
  fence: { block: "codeBlock", noCloseToken: true, getAttrs: token => ({ language: token.info || null }) },
  hr: { node: "horizontalRule" },
  image: { node: "image", getAttrs: token => ({ src: token.attrGet("src"), title: token.attrGet("title"), alt: tokenizer.renderer.renderInlineAsText(token.children || [], tokenizer.options, {}) }) },
  hardbreak: { node: "hardBreak" }, softbreak: { node: "hardBreak" },
  em: { mark: "italic" }, strong: { mark: "bold" }, s: { mark: "strike" },
  link: { mark: "link", getAttrs: token => ({ href: token.attrGet("href"), title: token.attrGet("title") }) },
  code_inline: { mark: "code", noCloseToken: true },
});
const defaults = defaultMarkdownSerializer;
const serializer = new MarkdownSerializer({
  blockquote: defaults.nodes.blockquote, paragraph: defaults.nodes.paragraph, text: defaults.nodes.text,
  heading: defaults.nodes.heading, horizontalRule: defaults.nodes.horizontal_rule,
  listItem: defaults.nodes.list_item, bulletList: defaults.nodes.bullet_list,
  orderedList(state, node) {
    const start = node.attrs.start ?? 1, width = String(start + node.childCount - 1).length;
    state.renderList(node, " ".repeat(width + 2), index => `${String(start + index).padStart(width)}. `);
  },
  codeBlock(state, node) {
    const fence = "`".repeat(Math.max(3, ...(node.textContent.match(/`+/g) || []).map(run => run.length + 1)));
    state.write(fence + (node.attrs.language || "") + "\n"); state.text(node.textContent, false);
    state.write("\n" + fence); state.closeBlock(node);
  },
  image: defaults.nodes.image,
  hardBreak(state) { state.write("\\\n"); },
}, {
  bold: defaults.marks.strong, italic: defaults.marks.em, code: defaults.marks.code, link: defaults.marks.link,
  strike: { open: "~~", close: "~~", mixable: true, expelEnclosingWhitespace: true },
}, { hardBreakNodeName: "hardBreak", strict: true });

export function parseDocument(source: string) { return parser.parse(source); }
export function serializeDocument(doc: DocumentNode) { return serializer.serialize(doc); }
export function loadDocument(source: string) {
  try { return { doc: parseDocument(source), error: "" }; }
  catch { return { doc: documentSchema.topNodeType.createAndFill()!, error: "This document contains formatting not supported by the visual editor yet. Your original Markdown is intact; edit it below." }; }
}

export function blockPositions(doc: DocumentNode) {
  const blocks: { pos: number; end: number; node: DocumentNode }[] = [];
  doc.forEach((node, pos) => blocks.push({ pos, end: pos + node.nodeSize, node }));
  return blocks;
}
