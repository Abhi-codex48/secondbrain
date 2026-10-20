import { lazy, Suspense, useEffect, useState } from "react";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, configured } from "./lib/firebase";
import { useRoute } from "./lib/router";
import { Layout } from "./components/Layout";
import { ConfirmProvider, ToastProvider } from "./components/ui";
import { Auth, NotConfigured } from "./pages/Auth";
import { Home } from "./pages/Home";
import { News } from "./pages/News";
import { Library } from "./pages/Library";
import { More } from "./pages/More";
import { Search } from "./pages/Search";

// The editor (TipTap) and backup tools are loaded on first use to keep start-up fast.
const Reader = lazy(() => import("./pages/Reader").then((m) => ({ default: m.Reader })));
const NoteEditor = lazy(() => import("./pages/NoteEditor").then((m) => ({ default: m.NoteEditor })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Markets = lazy(() => import("./pages/Markets").then((m) => ({ default: m.Markets })));
const Guide = lazy(() => import("./pages/Guide").then((m) => ({ default: m.Guide })));
const Draw = lazy(() => import("./pages/Draw").then((m) => ({ default: m.Draw })));

/** Same look as the start-up screen in index.html, shown while sign-in is checked. */
export const Splash = () => <div className="boot" role="status" aria-label="Loading"><div><img src="./icon.svg" alt="" /><i /></div></div>;

function Pages() {
  const route = useRoute();
  const [p, id] = route.path;
  let page: React.ReactNode;
  switch (p) {
    case "news": page = <News />; break;
    case "read": page = <Reader key={id} id={id} />; break;
    case "notes":
    case "library": page = <Library route={route} />; break;
    case "markets": page = <Markets route={route} />; break;
    case "note": page = <NoteEditor key={id} id={id ?? "new"} route={route} />; break;
    case "more": page = <More route={route} />; break;
    case "search": page = <Search route={route} />; break;
    case "settings": page = <Settings />; break;
    case "guide": page = <Guide />; break;
    case "share": page = <ShareIn route={route} />; break;
    case "draw": page = <Draw key={route.path.join("/")} noteId={id ?? "new"} pageParam={route.path[2] ?? "new"} route={route} />; break;
    default: page = <Home />;
  }
  // The drawing studio is full screen, so the app's bars and buttons are left out.
  if (p === "draw") return <ErrorBoundary resetKey={route.path.join("/")}><Suspense fallback={<Splash />}>{page}</Suspense></ErrorBoundary>;
  return <Layout route={route}><ErrorBoundary resetKey={route.path.join("/")}><Suspense fallback={<div className="page"><div className="skel" style={{ width: "40%", height: 28 }} /></div>}>{page}</Suspense></ErrorBoundary></Layout>;
}

// Load the other screens in the background once the app is idle, so opening them is instant.
const preload = () => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1200));
  idle(() => {
    import("./pages/Reader");
    import("./pages/NoteEditor");
    import("./pages/Settings");
    import("./pages/Draw");
  });
};

const SharedView = lazy(() => import("./pages/SharedView").then((m) => ({ default: m.SharedView })));
const ShareIn = lazy(() => import("./pages/ShareIn").then((m) => ({ default: m.ShareIn })));

export function App() {
  const route = useRoute();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => (configured ? onAuthStateChanged(auth, setUser) : undefined), []);
  useEffect(() => { if (user) preload(); }, [user]);

  // Share links open for anyone, signed in or not.
  if (route.path[0] === "s" && route.path[1]) return <ErrorBoundary><Suspense fallback={<Splash />}><SharedView id={route.path[1]} /></Suspense></ErrorBoundary>;
  if (!configured) return <NotConfigured />;
  if (user === undefined) return <Splash />;
  return (
    <ToastProvider>
      <ConfirmProvider>{user ? <Pages key={user.uid} /> : <Auth />}</ConfirmProvider>
    </ToastProvider>
  );
}
