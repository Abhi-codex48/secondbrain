import { useEffect, useState } from "react";

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
      setRoute(parse());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function go(path: string) {
  const h = `#/${path.replace(/^\/+/, "")}`;
  if (window.location.hash !== h) window.location.hash = h;
}

export const back = () => (window.history.length > 1 ? window.history.back() : go(""));
