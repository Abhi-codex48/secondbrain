import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

// Hash routes work on GitHub Pages without server rewrites.
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [p, q] = raw.split("?");
  return { path: p ? p.split("/").map(decodeURIComponent) : [], query: new URLSearchParams(q ?? "") };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => {
      const next = () => {
        setRoute(parse());
        window.scrollTo({ top: 0 });
      };
      // A quick cross-fade between screens where the browser supports it.
      const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (d.startViewTransition && !still) d.startViewTransition(() => flushSync(next));
      else next();
    };
    // Quiet updates (live search) change the address without a page transition.
    const quiet = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    window.addEventListener("sb-route", quiet);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("sb-route", quiet);
    };
  }, []);
  return route;
}

export function go(path: string) {
  const h = `#/${path.replace(/^\/+/, "")}`;
  if (window.location.hash !== h) window.location.hash = h;
}

export const back = () => (window.history.length > 1 ? window.history.back() : go(""));

/** Changes the address without adding a history step or animating (for typing in search). */
export function replace(path: string) {
  window.history.replaceState(null, "", `#/${path.replace(/^\/+/, "")}`);
  window.dispatchEvent(new Event("sb-route"));
}
