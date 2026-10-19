import { Component, type ReactNode } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

const RELOADED = "sb-reloaded";

/** After an update, an open tab may ask for screens that were replaced; one reload fixes it. */
const isStaleChunk = (e: unknown) => /dynamically imported module|Importing a module script failed|Failed to fetch|ChunkLoadError|Loading chunk/i.test(String((e as Error)?.message ?? e));

/**
 * Catches a screen that fails to load or draw, and offers Try again instead of
 * a blank page. Your notes are saved separately and are never affected.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) {
    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOADED)) || 0; } catch { /* ignore */ }
    if (isStaleChunk(e) && Date.now() - last > 30_000) { // at most one automatic reload in 30 seconds
      try { sessionStorage.setItem(RELOADED, String(Date.now())); } catch { /* ignore */ }
      location.reload();
    }
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <div className="card">
          <span className="crash-ic"><Sparkles size={28} /></span>
          <h2>This screen hit a snag</h2>
          <p className="muted">Nothing is lost. Your notes and saves are safe.</p>
          <button className="btn primary" onClick={() => location.reload()}><RefreshCw size={17} />Try again</button>
          <a className="btn line" href="#/" onClick={() => this.setState({ failed: false })}>Go Home</a>
        </div>
      </div>
    );
  }
}
