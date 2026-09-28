"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Placeholder from "@tiptap/extension-placeholder";
import { Selection } from "@tiptap/pm/state";
import { blockPositions, documentExtensions, DocumentImage, loadDocument, parseDocument, safeDocumentUrl, serializeDocument } from "../../lib/document-markdown";
import "./document-editor.css";

export type DocumentEditorHandle = { insertMarkdown(source: string): void };
type Props = {
  value: string; onChange(value: string): void; label: string; placeholder?: string;
  disabled?: boolean; compact?: boolean; imageSources?: Record<string, string>;
  onUpload?(file: File): Promise<string | null>; ref?: Ref<DocumentEditorHandle>;
};
const commands = [
  { id: "paragraph", label: "Text", search: "paragraph 正文 文本", hint: "Plain paragraph" },
  { id: "h1", label: "Heading 1", search: "title 标题", hint: "A large heading" },
  { id: "h2", label: "Heading 2", search: "subtitle 小标题", hint: "A section heading" },
  { id: "h3", label: "Heading 3", search: "标题", hint: "A smaller heading" },
  { id: "bullet", label: "Bullet list", search: "list 列表", hint: "A simple list" },
  { id: "ordered", label: "Numbered list", search: "ordered list 编号", hint: "One thing after another" },
  { id: "quote", label: "Quote", search: "blockquote 引用", hint: "Let a passage stand apart" },
  { id: "code", label: "Code block", search: "source 代码", hint: "Source code, as written" },
  { id: "divider", label: "Divider", search: "rule 分隔线", hint: "A quiet break" },
  { id: "image", label: "Image", search: "photo picture 图片 截图", hint: "Upload a picture" },
];
type Slash = { from: number; to: number; query: string; left: number; top: number };
const bubbleOptions = { placement: "top" as const };
const showSelectionMenu = ({ editor, state }: { editor: Editor; state: Editor["state"] }) => editor.isEditable && editor.isFocused && !state.selection.empty && !editor.view.composing;

export default function DocumentEditor(props: Props) {
  const { value, label, placeholder = "Start writing, or type / for blocks…", disabled = false, compact = false, ref } = props;
  const current = useRef(props); current.current = props;
  const [initial] = useState(() => loadDocument(value));
  const [sourceMode, setSourceMode] = useState(!!initial.error);
  const [error, setError] = useState(initial.error);
  const [uploading, setUploading] = useState(false);
  const [slash, setSlash] = useState<Slash | null>(null);
  const [choice, setChoice] = useState(0);
  const [hover, setHover] = useState<{ pos: number; top: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false), [linkUrl, setLinkUrl] = useState("");
  const wrapper = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false), dragged = useRef<{ pos: number; doc: Editor["state"]["doc"] } | null>(null);
  const menuRef = useRef({ slash, choice, items: commands });
  const escapedSlash = useRef<number | null>(null);
  const lastEmitted = useRef(value);
  const instanceId = useId();
  const menuId = `${instanceId}-blocks`;
  const editorRef = useRef<Editor | null>(null);
  const items = commands.filter(command => (command.id !== "image" || props.onUpload) && `${command.id} ${command.label} ${command.search}`.toLowerCase().includes(slash?.query.toLowerCase() || ""));
  menuRef.current = { slash, choice, items };

  function inspect(editor: Editor) {
    if (editor.view.composing || !editor.isEditable || !editor.isFocused) return;
    const { $from, empty } = editor.state.selection;
    const text = $from.parent.textBetween(0, $from.parentOffset, "\ufffc", "\ufffc");
    const match = empty && $from.parent.type.name === "paragraph" && text.match(/^\/([^\n/]{0,32})$/u);
    if (!match) { setSlash(null); escapedSlash.current = null; return; }
    if (escapedSlash.current === $from.start()) return;
    const rect = wrapper.current?.getBoundingClientRect(), point = editor.view.coordsAtPos($from.pos);
    if (!rect) return;
    if (menuRef.current.slash?.query !== match[1]) setChoice(0);
    const next = { from: $from.start(), to: $from.pos, query: match[1], top: point.bottom - rect.top + 8, left: Math.max(0, Math.min(point.left - rect.left, rect.width - 264)) };
    setSlash(previous => previous && Object.keys(next).every(key => previous[key as keyof Slash] === next[key as keyof Slash]) ? previous : next);
  }
  const [extensions] = useState(() => [
      ...documentExtensions().filter(extension => extension.name !== "image"),
      DocumentImage.extend({ addNodeView() { return ({ node }) => {
        const dom = document.createElement("img");
        const update = (next: typeof node) => {
          if (next.type.name !== "image") return false;
          const src = next.attrs.src || "";
          dom.dataset.source = src; dom.alt = next.attrs.alt || "";
          if (safeDocumentUrl(src, true)) dom.src = current.current.imageSources?.[src] || src;
          else dom.removeAttribute("src");
          return true;
        };
        update(node); return { dom, update };
      }; } }),
      Placeholder.configure({ placeholder }),
  ]);
  const editor = useEditor({
    immediatelyRender: false, shouldRerenderOnTransaction: false, extensions,
    content: initial.doc.toJSON(), editable: !disabled,
    editorProps: {
      attributes: { class: "document-content", role: "textbox", "aria-label": label, "aria-multiline": "true", spellcheck: "true" },
      handleKeyDown(view, event) {
        if (event.isComposing || view.composing || event.keyCode === 229) return false;
        const menu = menuRef.current;
        if (!menu.slash) return false;
        if (event.key === "Escape") { escapedSlash.current = menu.slash.from; setSlash(null); return true; }
        if (["ArrowDown", "ArrowUp"].includes(event.key)) {
          setChoice(index => menu.items.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + menu.items.length) % menu.items.length : 0); return true;
        }
        if (event.key === "Enter" && menu.items.length) { choose(menu.items[menu.choice % menu.items.length].id); return true; }
        return false;
      },
      handlePaste(_view, event) {
        const images = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith("image/"));
        if (!images.length) return false;
        event.preventDefault();
        if (images.length > 1) setError("Please paste one image at a time.");
        else void upload(images[0]);
        return true;
      },
      handleDrop(view, event) {
        if (!event.dataTransfer?.files.length) return false;
        event.preventDefault(); event.stopPropagation();
        const files = Array.from(event.dataTransfer.files);
        if (files.length !== 1 || !files[0].type.startsWith("image/")) { setError("Drop one JPG, PNG, GIF or WebP image at a time."); return true; }
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos.pos))));
        void upload(files[0]); return true;
      },
    },
    onUpdate({ editor, transaction }) {
      if (!transaction.docChanged) return;
      const source = serializeDocument(editor.state.doc);
      lastEmitted.current = source; current.current.onChange(source);
    },
    onTransaction({ editor }) { inspect(editor); },
    onFocus({ editor }) { inspect(editor); },
    onBlur() { setSlash(null); },
  });
  editorRef.current = editor;

  useEffect(() => { editor?.setEditable(!disabled && !uploading && !sourceMode, false); }, [editor, disabled, uploading, sourceMode]);
  // Parent echoes of typing must never reset selection or history. New documents
  // remount via documentKey; normalized save responses may be equivalent text.
  useEffect(() => {
    if (!editor || sourceMode || value === lastEmitted.current) return;
    const loaded = loadDocument(value);
    if (loaded.error) { setSourceMode(true); setError(loaded.error); }
    else if (!loaded.doc.eq(editor.state.doc)) editor.commands.setContent(loaded.doc.toJSON(), { emitUpdate: false });
    lastEmitted.current = value;
  }, [editor, value, sourceMode]);
  useEffect(() => {
    if (!editor) return;
    for (const img of editor.view.dom.querySelectorAll<HTMLImageElement>("img[data-source]")) {
      const source = img.dataset.source!;
      if (safeDocumentUrl(source, true)) img.src = props.imageSources?.[source] || source;
    }
  }, [editor, props.imageSources]);
  useImperativeHandle(ref, () => ({ insertMarkdown(source) {
    if (!editor || disabled || uploadLock.current) return;
    if (sourceMode) { current.current.onChange(current.current.value + "\n\n" + source); return; }
    editor.chain().focus().insertContent(parseDocument(source).toJSON().content || []).run();
  } }), [editor, disabled, sourceMode]);

  async function upload(file: File) {
    const active = editorRef.current;
    if (!active || !current.current.onUpload || current.current.disabled || uploadLock.current) return;
    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Choose a JPG, PNG, GIF or WebP image smaller than 5 MB."); return; }
    uploadLock.current = true; setUploading(true); setError("");
    const bookmark = active.state.selection.getBookmark();
    try {
      const src = await current.current.onUpload(file);
      if (src && !active.isDestroyed) {
        const selection = bookmark.resolve(active.state.doc);
        active.chain().focus().setTextSelection({ from: selection.from, to: selection.to }).setImage({ src, alt: file.name.replace(/\.[^.]+$/, "") }).run();
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Image upload failed. Your writing is unchanged."); }
    finally { uploadLock.current = false; setUploading(false); }
  }
  function choose(id: string) {
    const active = editorRef.current, menu = menuRef.current.slash;
    if (!active || !menu || current.current.disabled) return;
    const chain = active.chain().focus().deleteRange({ from: menu.from, to: menu.to });
    if (id === "paragraph") chain.setParagraph().run();
    else if (id === "h1" || id === "h2" || id === "h3") chain.setHeading({ level: Number(id[1]) as 1 | 2 | 3 }).run();
    else if (id === "bullet") chain.toggleBulletList().run();
    else if (id === "ordered") chain.toggleOrderedList().run();
    else if (id === "quote") chain.toggleBlockquote().run();
    else if (id === "code") chain.toggleCodeBlock().run();
    else if (id === "divider") chain.setHorizontalRule().run();
    else if (id === "image") { chain.run(); fileInput.current?.click(); }
    setSlash(null);
  }
  function moveBlock(pos: number, before: number) {
    if (!editor || disabled || uploadLock.current) return;
    const block = blockPositions(editor.state.doc).find(block => block.pos === pos);
    if (!block || (before >= block.pos && before <= block.end)) return;
    const tr = editor.state.tr.delete(block.pos, block.end);
    const target = before > block.pos ? before - block.node.nodeSize : before;
    tr.insert(target, block.node); tr.setSelection(Selection.near(tr.doc.resolve(target + 1)));
    editor.view.dispatch(tr.scrollIntoView()); editor.commands.focus(); setHover(null);
  }
  function moveSelected(direction: -1 | 1) {
    if (!editor) return;
    const blocks = blockPositions(editor.state.doc), pos = editor.state.selection.from;
    const index = blocks.findIndex(block => pos >= block.pos && pos < block.end);
    const adjacent = blocks[index + direction];
    if (adjacent) moveBlock(blocks[index].pos, direction < 0 ? adjacent.pos : adjacent.end);
  }
  function switchMode() {
    if (!editor) return;
    if (!sourceMode) { setSourceMode(true); setSlash(null); return; }
    const loaded = loadDocument(value);
    if (loaded.error) { setError(loaded.error); return; }
    editor.commands.setContent(loaded.doc.toJSON(), { emitUpdate: false });
    lastEmitted.current = value; setError(""); setSourceMode(false);
  }
  function setLink() {
    if (!editor) return;
    if (linkUrl && !safeDocumentUrl(linkUrl)) { setError("Use an https://, http://, mailto: or site-relative link."); return; }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (linkUrl) chain.setLink({ href: linkUrl }).run(); else chain.unsetLink().run();
    setLinkOpen(false); setError("");
  }
  const button = (text: string, action: () => void, title = text) => <button type="button" aria-label={title} title={title} disabled={disabled || uploading} onMouseDown={event => event.preventDefault()} onClick={action}>{text}</button>;
  return <div className={`document-editor${compact ? " is-compact" : ""}${disabled ? " is-disabled" : ""}`} ref={wrapper}
    onMouseMove={event => {
      if (!editor || sourceMode || disabled || dragged.current) return;
      for (const block of blockPositions(editor.state.doc)) {
        const dom = editor.view.nodeDOM(block.pos);
        if (dom instanceof HTMLElement && dom.contains(event.target as Node)) {
          setHover({ pos: block.pos, top: dom.getBoundingClientRect().top - wrapper.current!.getBoundingClientRect().top }); break;
        }
      }
    }} onMouseLeave={() => { if (!dragged.current) setHover(null); }}
    onDragOver={event => { if (event.dataTransfer.types.includes("application/x-writing-block")) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
    onDropCapture={event => {
      if (!dragged.current || event.dataTransfer.getData("application/x-writing-block") !== instanceId || !editor) return;
      event.preventDefault(); event.stopPropagation();
      if (!dragged.current.doc.eq(editor.state.doc)) { dragged.current = null; return; }
      const blocks = blockPositions(editor.state.doc);
      const target = blocks.find(block => { const dom = editor.view.nodeDOM(block.pos); return dom instanceof HTMLElement && event.clientY < dom.getBoundingClientRect().top + dom.getBoundingClientRect().height / 2; });
      moveBlock(dragged.current.pos, target?.pos ?? editor.state.doc.content.size); dragged.current = null;
    }}>
    <div className="document-tools" role="group" aria-label={`${label} tools`}>
      <span>{sourceMode ? "Markdown source" : "Text / blocks"}</span>
      {editor && !sourceMode && <>
        {button("↶", () => editor.chain().focus().undo().run(), "Undo")}
        {button("↷", () => editor.chain().focus().redo().run(), "Redo")}
        <details className="document-more"><summary>Insert / format</summary><div>
          {button("Heading", () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
          {button("List", () => editor.chain().focus().toggleBulletList().run())}
          {button("Quote", () => editor.chain().focus().toggleBlockquote().run())}
          {button("Code", () => editor.chain().focus().toggleCodeBlock().run())}
          {props.onUpload && button("Image", () => fileInput.current?.click())}
          {button("Move block ↑", () => moveSelected(-1))}{button("Move block ↓", () => moveSelected(1))}
        </div></details>
      </>}
      {button(sourceMode ? "Visual editor" : "Markdown", switchMode)}
    </div>
    {sourceMode ? <textarea aria-label={`${label} Markdown source`} className="document-source" disabled={disabled} value={value} onChange={event => props.onChange(event.target.value)} /> : <>
      <EditorContent editor={editor} />
      {!editor && <p className="writer-help">Opening document…</p>}
      {editor && <BubbleMenu editor={editor} options={bubbleOptions} shouldShow={showSelectionMenu}>
        <div className="document-bubble" role="group" aria-label="Format selected text">
          {button("B", () => editor.chain().focus().toggleBold().run(), "Bold")}
          {button("I", () => editor.chain().focus().toggleItalic().run(), "Italic")}
          {button("S", () => editor.chain().focus().toggleStrike().run(), "Strikethrough")}
          {button("<> ", () => editor.chain().focus().toggleCode().run(), "Inline code")}
          {button("Link", () => { setLinkUrl(editor.getAttributes("link").href || ""); setLinkOpen(true); })}
        </div>
      </BubbleMenu>}
      {hover && !disabled && !uploading && <button type="button" className="document-drag" style={{ top: hover.top }} draggable aria-label="Drag paragraph to reorder" title="Drag to move this block" onDragStart={event => {
        if (!editor) return; dragged.current = { pos: hover.pos, doc: editor.state.doc }; event.dataTransfer.setData("application/x-writing-block", instanceId); event.dataTransfer.effectAllowed = "move";
      }} onDragEnd={() => { dragged.current = null; setHover(null); }}>⠿</button>}
      {slash && <div className="document-slash" role="listbox" id={menuId} aria-label="Insert a block" style={{ top: slash.top, left: slash.left }}>
        {items.length ? items.map((item, index) => <button type="button" role="option" aria-selected={index === choice % items.length} key={item.id} onMouseDown={event => event.preventDefault()} onClick={() => choose(item.id)}><span>{item.label}</span><small>{item.hint}</small></button>) : <p>No matching blocks. Esc to dismiss.</p>}
      </div>}
    </>}
    {linkOpen && <div className="document-link" role="group" aria-label="Edit link"><input aria-label="Link URL" value={linkUrl} placeholder="https://…" onChange={event => setLinkUrl(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setLink(); } if (event.key === "Escape") setLinkOpen(false); }} />{button("Apply link", setLink)}{button("Cancel", () => setLinkOpen(false))}</div>}
    <input type="file" hidden ref={fileInput} accept="image/jpeg,image/png,image/gif,image/webp" onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
    {uploading && <p role="status" className="writer-help">Uploading image… Your writing stays here.</p>}
    {error && <p role="alert" className="writer-help">{error}</p>}
  </div>;
}
