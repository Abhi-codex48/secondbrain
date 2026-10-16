import { useCallback, useEffect, useState } from "react";
import { Save, X, Trash2 } from "lucide-react";
import { INK_W, InkLayer, InkTools, useInkState, useStrokeHistory } from "./Ink";
import { saveNote } from "../lib/api";
import { useToast, errMsg } from "./ui";
import { go } from "../lib/router";

/**
 * Pen mode over any screen: a transparent sheet to mark up what you are reading.
 * Marks can be saved as a handwriting note that links back to the page.
 */
export function DrawOverlay({ onClose, context }: { onClose: () => void; context: { title: string; href: string } }) {
  const [st, set] = useInkState();
  const [vh, setVh] = useState(() => (window.innerHeight * INK_W) / window.innerWidth);
  const noop = useCallback(() => {}, []);
  const h = useStrokeHistory([], noop);
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const r = () => setVh((window.innerHeight * INK_W) / window.innerWidth);
    window.addEventListener("resize", r);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("resize", r);
      window.removeEventListener("keydown", k);
    };
  }, [onClose]);

  const save = async () => {
    if (!h.strokes.length) return toast("Draw something first");
    setSaving(true);
    try {
      const n = await saveNote({
        kind: "ink",
        title: `Sketch · ${context.title}`.slice(0, 120),
        body_html: `<p>Drawn over <a href="${context.href}">${context.title.replace(/</g, "&lt;")}</a></p>`,
        ink: [{ height: Math.round(vh), strokes: h.strokes }],
      });
      toast("Saved as a handwriting note", { action: { label: "Open", run: () => go(`note/${n.id}`) } });
      onClose();
    } catch (e) {
      toast(errMsg(e), { bad: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="overlay-ink">
        <InkLayer strokes={h.strokes} onCommit={h.commit} height={vh} state={st} />
      </div>
      <div className="overlay-hint">Pen mode · draw anywhere on the screen</div>
      <div className="overlay-bar" role="toolbar" aria-label="Pen mode">
        <InkTools
          st={st} set={set} onUndo={h.undo} onRedo={h.redo} canUndo={h.canUndo} canRedo={h.canRedo}
          extra={
            <>
              <span className="sep" style={{ width: 1, height: 24, background: "var(--line)", margin: "0 4px", flex: "none" }} />
              <button className="icon-btn" onClick={() => h.commit([])} aria-label="Clear" title="Clear"><Trash2 size={19} /></button>
              <button className="btn primary sm" onClick={save} disabled={saving}><Save size={16} />Save</button>
              <button className="icon-btn" onClick={onClose} aria-label="Close pen mode" title="Close (marks are discarded)"><X size={20} /></button>
            </>
          }
        />
      </div>
    </>
  );
}
