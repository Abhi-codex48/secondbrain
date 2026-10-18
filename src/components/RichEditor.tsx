import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import Image from "@tiptap/extension-image";
import {
  Bold, Italic, Underline as UIcon, Strikethrough, Highlighter, Palette, Heading1, Heading2, List, ListOrdered, ListChecks,
  Quote, Code, Minus, Link2, ImagePlus, Undo2, Redo2, RemoveFormatting, Mic, MicOff, Loader2,
} from "lucide-react";
import { imageToDataUrl } from "../lib/api";
import { useToast, errMsg } from "./ui";

const HIGHLIGHTS = [
  { name: "Yellow", v: "var(--hl-yellow)" },
  { name: "Green", v: "var(--hl-green)" },
  { name: "Pink", v: "var(--hl-pink)" },
  { name: "Blue", v: "var(--hl-blue)" },
  { name: "Orange", v: "var(--hl-orange)" },
];
const TEXT_COLORS = ["#e0384f", "#ff7a45", "#d4a106", "#18a058", "#2f6bff", "#7c4dff", "#d63ca5"];

// Web Speech API (Chrome, Edge, Safari); not in Firefox.
type SR = { start: () => void; stop: () => void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null; continuous: boolean; interimResults: boolean; lang: string };
const SpeechRec: (new () => SR) | undefined = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export function useDictation(onText: (t: string) => void) {
  const [on, setOn] = useState(false);
  const rec = useRef<SR | null>(null);
  const toast = useToast();
  const start = () => {
    if (!SpeechRec) {
      toast("Voice typing isn't supported in this browser. Use your keyboard's mic button instead.", { bad: true });
      return;
    }
    const r = new SpeechRec();
    r.lang = "en-IN";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim() + " ");
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") toast("Microphone permission was blocked", { bad: true });
      else if (e.error !== "no-speech" && e.error !== "aborted") toast(`Voice typing stopped (${e.error})`, { bad: true });
    };
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  const stop = () => {
    rec.current?.stop();
    setOn(false);
  };
  useEffect(() => () => rec.current?.stop(), []);
  return { on, toggle: () => (on ? stop() : start()), supported: !!SpeechRec };
}

function Btn({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`icon-btn ${on ? "on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [pop, setPop] = useState<null | "hl" | "color">(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const dict = useDictation((t) => editor.chain().focus().insertContent(t).run());
  const c = () => editor.chain().focus();

  useEffect(() => {
    if (!pop) return;
    const close = () => setPop(null);
    setTimeout(() => window.addEventListener("click", close, { once: true }));
    return () => window.removeEventListener("click", close);
  }, [pop]);

  const link = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address", prev ?? "https://");
    if (url === null) return;
    if (!url.trim()) c().unsetLink().run();
    else c().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  const onFile = async (f?: File) => {
    if (!f) return;
    setUploading(true);
    try {
      const src = await imageToDataUrl(f);
      c().setImage({ src }).run();
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Undo" onClick={() => c().undo().run()} disabled={!editor.can().undo()}><Undo2 size={18} /></Btn>
      <Btn label="Redo" onClick={() => c().redo().run()} disabled={!editor.can().redo()}><Redo2 size={18} /></Btn>
      <span className="sep" />
      <Btn label="Bold" on={editor.isActive("bold")} onClick={() => c().toggleBold().run()}><Bold size={18} /></Btn>
      <Btn label="Italic" on={editor.isActive("italic")} onClick={() => c().toggleItalic().run()}><Italic size={18} /></Btn>
      <Btn label="Underline" on={editor.isActive("underline")} onClick={() => c().toggleUnderline().run()}><UIcon size={18} /></Btn>
      <Btn label="Strikethrough" on={editor.isActive("strike")} onClick={() => c().toggleStrike().run()}><Strikethrough size={18} /></Btn>
      <div className="pop">
        <Btn label="Highlight" on={editor.isActive("highlight")} onClick={() => setPop(pop === "hl" ? null : "hl")}><Highlighter size={18} /></Btn>
        {pop === "hl" && (
          <div className="popover" onClick={(e) => e.stopPropagation()}>
            {HIGHLIGHTS.map((h) => (
              <button key={h.name} className="swatch" style={{ background: h.v }} aria-label={`${h.name} highlight`} onMouseDown={(e) => e.preventDefault()} onClick={() => { c().toggleHighlight({ color: h.v }).run(); setPop(null); }} />
            ))}
            <button className="btn soft sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().unsetHighlight().run(); setPop(null); }}>None</button>
          </div>
        )}
      </div>
      <div className="pop">
        <Btn label="Text colour" onClick={() => setPop(pop === "color" ? null : "color")}><Palette size={18} /></Btn>
        {pop === "color" && (
          <div className="popover" onClick={(e) => e.stopPropagation()}>
            {TEXT_COLORS.map((col) => (
              <button key={col} className="swatch" style={{ background: col }} aria-label={`Text colour ${col}`} onMouseDown={(e) => e.preventDefault()} onClick={() => { c().setColor(col).run(); setPop(null); }} />
            ))}
            <button className="btn soft sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { c().unsetColor().run(); setPop(null); }}>Default</button>
          </div>
        )}
      </div>
      <span className="sep" />
      <Btn label="Heading" on={editor.isActive("heading", { level: 1 })} onClick={() => c().toggleHeading({ level: 1 }).run()}><Heading1 size={18} /></Btn>
      <Btn label="Subheading" on={editor.isActive("heading", { level: 2 })} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={18} /></Btn>
      <Btn label="Bullet list" on={editor.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><List size={18} /></Btn>
      <Btn label="Numbered list" on={editor.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><ListOrdered size={18} /></Btn>
      <Btn label="Checklist" on={editor.isActive("taskList")} onClick={() => c().toggleTaskList().run()}><ListChecks size={18} /></Btn>
      <Btn label="Quote" on={editor.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Quote size={18} /></Btn>
      <Btn label="Code" on={editor.isActive("code")} onClick={() => c().toggleCode().run()}><Code size={18} /></Btn>
      <Btn label="Divider" onClick={() => c().setHorizontalRule().run()}><Minus size={18} /></Btn>
      <span className="sep" />
      <Btn label="Link" on={editor.isActive("link")} onClick={link}><Link2 size={18} /></Btn>
      <Btn label="Insert image" onClick={() => file.current?.click()} disabled={uploading}>{uploading ? <Loader2 size={18} className="spin" /> : <ImagePlus size={18} />}</Btn>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <Btn label={dict.on ? "Stop voice typing" : "Voice typing"} on={dict.on} onClick={dict.toggle}>{dict.on ? <MicOff size={18} /> : <Mic size={18} />}</Btn>
      <Btn label="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={18} /></Btn>
    </div>
  );
}

export function RichEditor({ html, onChange, placeholder, compact, autofocus }: { html: string; onChange: (html: string) => void; placeholder?: string; compact?: boolean; autofocus?: boolean }) {
  const editor = useEditor({
    extensions: [
      // StarterKit v3 includes underline and links.
      StarterKit.configure({ link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } } }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }), // images are stored inside the note
      Placeholder.configure({ placeholder: placeholder ?? "Start writing…" }),
    ],
    content: html,
    immediatelyRender: true,
    shouldRerenderOnTransaction: true, // keeps toolbar buttons in sync with the selection
    autofocus: autofocus ? "end" : false,
    editorProps: { attributes: { class: `prose ${compact ? "compact" : ""}` } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });
  // Replace content when a different note (or a restored version) is loaded.
  const last = useRef(html);
  useEffect(() => {
    if (editor && html !== last.current && html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false });
    last.current = html;
  }, [html, editor]);
  if (!editor) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
