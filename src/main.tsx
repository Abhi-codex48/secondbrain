import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme } from "./lib/theme";
import "./styles.css";

applyTheme();
// Something shared to Second Brain from another app (Android share menu)
// arrives as ?title=…&text=…&url=…; show it on the Share screen.
{
  const p = new URLSearchParams(location.search);
  if (p.has("url") || p.has("text") || p.has("title")) {
    const q = new URLSearchParams();
    for (const k of ["title", "text", "url"]) if (p.get(k)) q.set(k, p.get(k)!);
    history.replaceState(null, "", `${location.pathname}#/share?${q}`);
  }
}
if ("startViewTransition" in document) document.documentElement.classList.add("vt");
// Cache the app on the device so it opens even when offline or when the host is down.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
