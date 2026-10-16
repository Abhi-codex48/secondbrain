import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

// ---------- toasts ----------
interface Toast {
  id: number;
  msg: string;
  bad?: boolean;
  undo?: () => void;
  action?: { label: string; run: () => void };
}
type ToastOpts = { bad?: boolean; undo?: () => void; action?: { label: string; run: () => void } };
const ToastCtx = createContext<(msg: string, opts?: ToastOpts) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((msg: string, opts: ToastOpts = {}) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-2), { id, msg, ...opts }]);
    setTimeout(() => setItems((xs) => xs.filter((t) => t.id !== id)), opts.undo || opts.action ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.bad ? "bad" : ""}`}>
            <span>{t.msg}</span>
            {(t.undo || t.action) && (
              <button
                onClick={() => {
                  (t.undo ?? t.action!.run)();
                  setItems((xs) => xs.filter((x) => x.id !== t.id));
                }}
              >
                {t.undo ? "Undo" : t.action!.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- sheet / dialog ----------
export function Sheet({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", k);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`sheet ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="grab" />
        <div className="between">
          <h2>{title}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ---------- confirm ----------
interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirm?: string;
  danger?: boolean;
  /** When set, the user must type this word to confirm. */
  typeToConfirm?: string;
}
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState("");
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => {
    setTyped("");
    setState({ ...o, resolve });
  }), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const blocked = !!state?.typeToConfirm && typed.trim().toUpperCase() !== state.typeToConfirm.toUpperCase();
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {state && (
        <Sheet title={state.title} onClose={() => close(false)}>
          {state.body && <div className="muted">{state.body}</div>}
          {state.typeToConfirm && (
            <input className="input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${state.typeToConfirm} to confirm`} aria-label="Confirmation word" />
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn soft" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${state.danger ? "danger" : "primary"}`} disabled={blocked} onClick={() => close(true)}>
              {state.confirm ?? "OK"}
            </button>
          </div>
        </Sheet>
      )}
    </ConfirmCtx.Provider>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skel" style={{ width: `${[72, 94, 58, 86, 66][i % 5]}%` }} />
      ))}
    </div>
  );
}

/** Debounced value helper. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
